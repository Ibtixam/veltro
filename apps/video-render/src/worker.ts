/**
 * VELTRO — Remotion Render Worker  (Jiogue LLC · Bible V2)
 * ─────────────────────────────────────────────────────────────────
 * Consumes the 'video-render' BullMQ queue. For each spec:
 *   1. bundle the Remotion project (cached)
 *   2. select the composition at the spec's dimensions
 *   3. render MP4 via ffmpeg (headless Chromium)
 *   4. upload to CDN (R2/S3) and return the public URL
 * No paid render API. Stock footage + ElevenLabs audio passed by the orchestrator.
 */
import { Worker, type Job } from 'bullmq';
import { bundle } from '@remotion/bundler';
import { selectComposition, renderMedia } from '@remotion/renderer';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { uploadToCDN } from './lib/cdn';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const ENTRY = path.join(__dirname, 'index.ts');

let bundlePromise: Promise<string> | null = null;
function getBundle(): Promise<string> {
  if (!bundlePromise) {
    bundlePromise = bundle({
      entryPoint: ENTRY,
      // webpackOverride can be added here for custom fonts
    });
  }
  return bundlePromise;
}

interface RenderSpec {
  composition: string;
  output: { format: 'mp4'; codec: 'h264'; width: number; height: number; fps: number; durationInFrames: number };
  props: Record<string, unknown>;
}

const worker = new Worker(
  'video-render',
  async (job: Job<RenderSpec>): Promise<{ videoUrl: string }> => {
    const spec = job.data;
    const serveUrl = await getBundle();

    const composition = await selectComposition({
      serveUrl,
      id: spec.composition,
      inputProps: spec.props,
    });

    // Override dimensions/duration per requested format
    composition.width = spec.output.width;
    composition.height = spec.output.height;
    composition.fps = spec.output.fps;
    composition.durationInFrames = spec.output.durationInFrames;

    const outPath = path.join(os.tmpdir(), `veltro_${job.id}_${spec.output.width}x${spec.output.height}.mp4`);

    await renderMedia({
      composition,
      serveUrl,
      codec: spec.output.codec,
      outputLocation: outPath,
      inputProps: spec.props,
      onProgress: ({ progress }) => { void job.updateProgress(Math.round(progress * 100)); },
      chromiumOptions: { gl: 'swangle' }, // headless-safe GL backend
    });

    const buffer = await fs.readFile(outPath);
    const key = `videos/${job.id}/${spec.output.width}x${spec.output.height}.mp4`;
    const videoUrl = await uploadToCDN(key, buffer, 'video/mp4');

    await fs.unlink(outPath).catch(() => {});
    return { videoUrl };
  },
  { connection: { url: REDIS_URL } as any, concurrency: Number(process.env.RENDER_CONCURRENCY ?? 1) },
);

worker.on('completed', (job) => console.log(`[render] ✓ ${job.id}`));
worker.on('failed', (job, err) => console.error(`[render] ✗ ${job?.id}: ${err.message}`));

console.log('VELTRO Remotion render worker started · queue=video-render');
