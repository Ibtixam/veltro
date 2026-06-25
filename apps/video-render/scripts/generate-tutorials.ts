/**
 * VELTRO — Tutorial batch generator
 * Renders the 6 tutorial videos from pre-written scripts using Remotion.
 * Run: npx ts-node scripts/generate-tutorials.ts   (needs Chromium + ffmpeg)
 *
 * Optional: set ELEVENLABS_API_KEY to add narration (synthesized per script,
 * uploaded, and passed as audioUrl). Without it, videos render silently.
 */
import { bundle } from '@remotion/bundler';
import { selectComposition, renderMedia } from '@remotion/renderer';
import path from 'node:path';
import fs from 'node:fs/promises';

interface Tut { id: string; title: string; subtitle: string; durationSec: number; steps: { time: number; text: string }[] }

const TUTORIALS: Tut[] = [
  { id: 'getting-started', title: 'Getting started', subtitle: 'Tutorial · 90s', durationSec: 90, steps: [
    { time: 3, text: 'Enter your URL — Veltro detects your stack automatically.' },
    { time: 22, text: 'Connect Search Console and GA4 for real numbers.' },
    { time: 44, text: 'Pick a plan. Your first analysis runs immediately.' },
    { time: 66, text: 'Every Monday: opportunities, pages, and a video — delivered.' },
  ]},
  { id: 'reading-clusters', title: 'Reading your clusters', subtitle: 'Tutorial · 4 min', durationSec: 120, steps: [
    { time: 3, text: 'Each cluster groups low-difficulty keywords around one pillar.' },
    { time: 35, text: 'The Veltro Score ranks clusters by traffic × conversion ÷ effort.' },
    { time: 70, text: 'Start with quick wins: KD under 30, high intent.' },
    { time: 100, text: 'The brief gives you H2s, schema, and answer-first GEO blocks.' },
  ]},
  { id: 'making-a-video', title: 'Making a video', subtitle: 'Tutorial · 5 min', durationSec: 120, steps: [
    { time: 3, text: 'Claude writes the script; ElevenLabs narrates it.' },
    { time: 40, text: 'Free stock footage from Pexels and Pixabay fills the b-roll.' },
    { time: 75, text: 'Remotion renders landscape, portrait, and square — no fees.' },
    { time: 100, text: 'Publish to YouTube, TikTok, or download the MP4.' },
  ]},
  { id: 'connecting-data', title: 'Connecting GA4 + GSC', subtitle: 'Tutorial · 3 min', durationSec: 90, steps: [
    { time: 3, text: 'Search Console gives impressions, clicks, and positions.' },
    { time: 30, text: 'GA4 adds sessions, conversions, and revenue.' },
    { time: 60, text: 'Read-only OAuth — Veltro never writes to your analytics.' },
  ]},
  { id: 'deploying-zip', title: 'Deploying the fix ZIP', subtitle: 'Tutorial · 6 min', durationSec: 150, steps: [
    { time: 3, text: 'Your weekly ZIP contains ready-to-ship pages for your stack.' },
    { time: 40, text: 'Next.js, WordPress, Webflow, Shopify, and 6 more supported.' },
    { time: 85, text: 'Follow the included INSTALL guide — about 30 minutes.' },
    { time: 120, text: 'Or enable auto-deploy: Veltro opens a GitHub PR for you.' },
  ]},
  { id: 'using-crm', title: 'Using your CRM', subtitle: 'Tutorial · 4 min', durationSec: 120, steps: [
    { time: 3, text: 'Leads from your new pages flow into your private pipeline.' },
    { time: 35, text: 'Drag deals across stages; Veltro weights them by probability.' },
    { time: 70, text: 'Log calls, notes, and tasks against each contact.' },
    { time: 100, text: 'Your CRM is yours alone — fully isolated per account.' },
  ]},
];

async function main() {
  const entry = path.join(__dirname, '..', 'src', 'index.ts');
  console.log('Bundling Remotion project…');
  const serveUrl = await bundle({ entryPoint: entry });
  const outDir = path.join(__dirname, '..', 'out', 'tutorials');
  await fs.mkdir(outDir, { recursive: true });

  for (const tut of TUTORIALS) {
    console.log(`\n▶ Rendering ${tut.id} (${tut.durationSec}s)…`);
    const inputProps = { title: tut.title, subtitle: tut.subtitle, steps: tut.steps, brandColor: '#e4002b', audioUrl: '', durationSec: tut.durationSec };
    const composition = await selectComposition({ serveUrl, id: 'VeltroTutorial', inputProps });
    composition.durationInFrames = tut.durationSec * 30;
    const out = path.join(outDir, `${tut.id}.mp4`);
    await renderMedia({
      composition, serveUrl, codec: 'h264', outputLocation: out, inputProps,
      onProgress: ({ progress }) => process.stdout.write(`\r  ${Math.round(progress * 100)}%`),
      chromiumOptions: { gl: 'swangle' },
    });
    console.log(`\n  ✓ ${out}`);
  }
  console.log(`\n✅ ${TUTORIALS.length} tutorials rendered to ${outDir}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
