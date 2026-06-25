/**
 * VELTRO — Video Agent Orchestrator
 * ─────────────────────────────────────────────────────────────────
 * Full pipeline: keyword/URL → script → stock media → assembly → captions → publish
 *
 * Agents:
 *   1. ScriptAgent     — GPT-4o powered script writer (hook + body + CTA)
 *   2. MediaAgent      — Pexels + Pixabay + Unsplash stock fetcher
 *   3. VoiceAgent      — ElevenLabs TTS narration
 *   4. AssemblyAgent   — Remotion render worker (free: ffmpeg + stock footage)
 *   5. CaptionAgent    — Auto-caption with keyword overlay
 *   6. PublishAgent    — Multi-platform scheduler (YouTube, LinkedIn, TikTok, Instagram)
 *   7. AnalyticsAgent  — Performance tracker → weekly report
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, QueueEvents } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';

// ─── TYPES ────────────────────────────────────────────────────────────────

export type VideoFormat = 'landscape' | 'portrait' | 'square';
export type VideoPlatform = 'youtube' | 'linkedin' | 'tiktok' | 'instagram_reels' | 'twitter';
export type VideoGoal = 'awareness' | 'lead_capture' | 'conversion' | 'retention';
export type VideoTone = 'professional' | 'energetic' | 'educational' | 'storytelling' | 'urgent';

export interface VideoJobInput {
  keyword: string;
  url?: string;
  niche: string;
  targetAudience: string;
  goal: VideoGoal;
  tone: VideoTone;
  duration: 30 | 60 | 90 | 180;
  formats: VideoFormat[];
  platforms: VideoPlatform[];
  lang: 'en' | 'fr' | 'es' | 'de' | 'pt';
  ctaText: string;
  ctaUrl: string;
  brandName: string;
  brandColor?: string;
  voiceId?: string;
}

export interface VideoScript {
  hook: string;           // 0–3 sec — pattern interrupt, stops the scroll
  problem: string;        // 3–8 sec — pain point identification
  solution: string;       // 8–20 sec — product/service as answer
  proof: string;          // 20–40 sec — social proof / result / stat
  cta: string;            // last 5 sec — clear single action
  fullNarration: string;  // combined for TTS
  onScreenText: string[]; // text overlays timed to script
  bRollKeywords: string[]; // search terms for stock footage
  hashtags: string[];
  title: string;
  description: string;
  thumbnailText: string;
}

export interface StockMedia {
  type: 'video' | 'image';
  url: string;
  previewUrl: string;
  source: 'pexels' | 'pixabay' | 'unsplash';
  id: string;
  duration?: number;
  width: number;
  height: number;
  license: 'free' | 'attribution';
  attribution?: string;
}

export interface RemotionRenderSpec {
  composition: 'VeltroVideo';
  output: { format: 'mp4'; codec: 'h264'; width: number; height: number; fps: number; durationInFrames: number };
  props: {
    brandName: string;
    brandColor: string;
    lang: string;
    audioUrl: string;
    clips: { type: 'video' | 'image'; src: string; start: number; duration: number; attribution: string | null }[];
    hook: string;
    onScreenText: string[];
    cta: string;
    ctaUrl: string;
    durationSec: number;
  };
}

export interface VideoJob {
  id: string;
  status: 'queued' | 'scripting' | 'fetching_media' | 'generating_voice' | 'rendering' | 'captioning' | 'publishing' | 'done' | 'failed';
  input: VideoJobInput;
  script?: VideoScript;
  media?: StockMedia[];
  audioUrl?: string;
  renderedVideos?: Record<VideoFormat, string>;
  publishedUrls?: Record<VideoPlatform, string>;
  error?: string;
  progress: number;
  createdAt: Date;
  completedAt?: Date;
}

// ─── SCRIPT TEMPLATES (conversion-optimized hooks) ────────────────────────

const HOOK_TEMPLATES: Record<VideoGoal, Record<VideoTone, string[]>> = {
  awareness: {
    professional: [
      'Most {niche} professionals don\'t know this yet.',
      '{stat}% of companies are still doing {problem} wrong.',
      'Here\'s what changed in {niche} in the last 90 days.',
    ],
    energetic: [
      'Stop everything. This changes {niche} forever.',
      'Nobody is talking about this {niche} strategy.',
      'This is the fastest way to {benefit} in {niche}.',
    ],
    educational: ['What exactly is {keyword}? Let me break it down.', 'The {keyword} guide nobody wrote — until now.'],
    storytelling: ['6 months ago I had zero {benefit}. Here\'s what changed.', 'My client went from {before} to {after} in 30 days.'],
    urgent: ['This {niche} opportunity closes in {timeframe}.', '{keyword} prices just changed — here\'s what it means for you.'],
  },
  lead_capture: {
    professional: ['Get your free {keyword} report — link in bio.', 'Download the {keyword} checklist — 100% free.'],
    energetic: ['Free {keyword} tool — grab it before it\'s gone.', 'I\'m giving away my {keyword} system. Today only.'],
    educational: ['Sign up for the free {keyword} masterclass.', 'Free {keyword} guide — 47 pages of actionable steps.'],
    storytelling: ['I built this {keyword} system from scratch. Now sharing it free.'],
    urgent: ['Last 48 hours: free {keyword} access.', 'Free {keyword} trial — {spots} spots left.'],
  },
  conversion: {
    professional: ['ROI in under 30 days. Here\'s the proof.', '{number} companies use {brandName} to {benefit}.'],
    energetic: ['The {keyword} tool that actually works.', 'Join {number}+ businesses already using {brandName}.'],
    educational: ['How {brandName} solves {problem} in 3 steps.'],
    storytelling: ['{customer} saved {result} using {brandName}.'],
    urgent: ['Offer ends {date}. {discount} off {brandName}.', 'Only {spots} spots left at this price.'],
  },
  retention: {
    professional: ['New in {brandName}: {feature}.', '{brandName} just got better. Here\'s what changed.'],
    energetic: ['You asked. We built it. Introducing {feature}.'],
    educational: ['Pro tip: use {brandName} this way for 3× results.'],
    storytelling: ['How our users are using {brandName} to {creative_use}.'],
    urgent: ['Update {brandName} now — critical improvement inside.'],
  },
};

const PLATFORM_SPECS: Record<VideoPlatform, {
  maxDuration: number; format: VideoFormat; aspectRatio: string;
  captionStyle: string; optimalLength: number;
}> = {
  youtube:          { maxDuration: 600, format: 'landscape', aspectRatio: '16:9', captionStyle: 'bottom', optimalLength: 90 },
  linkedin:         { maxDuration: 600, format: 'landscape', aspectRatio: '16:9', captionStyle: 'bottom', optimalLength: 60 },
  tiktok:           { maxDuration: 180, format: 'portrait',  aspectRatio: '9:16', captionStyle: 'center', optimalLength: 30 },
  instagram_reels:  { maxDuration: 90,  format: 'portrait',  aspectRatio: '9:16', captionStyle: 'center', optimalLength: 30 },
  twitter:          { maxDuration: 140, format: 'square',    aspectRatio: '1:1',  captionStyle: 'bottom', optimalLength: 45 },
};

// ─── MAIN ORCHESTRATOR ────────────────────────────────────────────────────

@Injectable()
export class VideoAgentService {
  private readonly logger = new Logger(VideoAgentService.name);
  private jobs = new Map<string, VideoJob>();

  constructor(
    private readonly config: ConfigService,
    @InjectQueue('video-jobs') private readonly videoQueue: Queue,
    @InjectQueue('video-render') private readonly renderQueue: Queue,
    private readonly queueEvents: QueueEvents,
  ) {}

  // ─── START JOB ────────────────────────────────────────────────────────
  async createVideoJob(input: VideoJobInput): Promise<VideoJob> {
    const id = `vj_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const job: VideoJob = {
      id, status: 'queued', input, progress: 0, createdAt: new Date(),
    };

    this.jobs.set(id, job);

    await this.videoQueue.add('process-video', { jobId: id, input }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: false,
    });

    return job;
  }

  getJob(id: string): VideoJob | undefined {
    return this.jobs.get(id);
  }

  // ─── AGENT 1: SCRIPT WRITER ───────────────────────────────────────────
  async runScriptAgent(input: VideoJobInput): Promise<VideoScript> {
    const anthropicKey = this.config.get<string>('ANTHROPIC_API_KEY', '');

    const hookPool = HOOK_TEMPLATES[input.goal][input.tone] ?? HOOK_TEMPLATES[input.goal]['professional'];
    const hookTemplate = hookPool[Math.floor(Math.random() * hookPool.length)];

    const systemPrompt = `You are an elite video scriptwriter specializing in high-conversion short-form content.
You write scripts that stop scrolling in the first 3 seconds and drive measurable action.
Rules:
- Hook must be under 15 words — pattern interrupt, no fluff
- Total narration matches exactly ${input.duration} seconds at 150 words/minute
- Language: ${input.lang}
- Tone: ${input.tone}
- Goal: ${input.goal}
- Never use filler phrases ("In this video I will...", "Don't forget to like...")
- Always end with ONE specific CTA, not multiple
- Output strict JSON only`;

    const userPrompt = `Write a complete video script for:
Keyword: "${input.keyword}"
Brand: "${input.brandName}"
Audience: "${input.targetAudience}"
Niche: "${input.niche}"
CTA: "${input.ctaText}" → ${input.ctaUrl}
Duration: ${input.duration} seconds
Hook inspiration: "${hookTemplate}"

Return JSON matching this exact schema:
{
  "hook": "string (0-3 sec, max 15 words)",
  "problem": "string (3-8 sec, 30-50 words)",
  "solution": "string (8-25 sec, 60-100 words)",
  "proof": "string (25-${input.duration - 5} sec, stat or testimonial, 40-80 words)",
  "cta": "string (last 5 sec, single action, max 20 words)",
  "fullNarration": "string (all above combined, exactly ${Math.round(input.duration * 2.5)} words)",
  "onScreenText": ["array", "of", "5-8", "text overlays"],
  "bRollKeywords": ["6-10 search terms for stock footage"],
  "hashtags": ["8-12 platform hashtags"],
  "title": "string (YouTube/LinkedIn optimized title)",
  "description": "string (150-300 word SEO description)",
  "thumbnailText": "string (max 6 words, high contrast)"
}`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    const data = await res.json() as any;
    const text = data.content?.[0]?.text ?? '{}';

    try {
      const clean = text.replace(/```json|```/g, '').trim();
      return JSON.parse(clean) as VideoScript;
    } catch {
      this.logger.error('Script parse failed, using fallback');
      return this.fallbackScript(input);
    }
  }

  // ─── AGENT 2: STOCK MEDIA FETCHER ────────────────────────────────────
  async runMediaAgent(bRollKeywords: string[], duration: number): Promise<StockMedia[]> {
    const pexelsKey = this.config.get<string>('PEXELS_API_KEY', '');
    const pixabayKey = this.config.get<string>('PIXABAY_API_KEY', '');
    const unsplashKey = this.config.get<string>('UNSPLASH_ACCESS_KEY', '');
    const media: StockMedia[] = [];

    const videosNeeded = Math.ceil(duration / 5); // ~5s per clip

    for (const keyword of bRollKeywords.slice(0, videosNeeded)) {
      try {
        // Try Pexels first (best quality)
        if (pexelsKey) {
          const pexels = await this.fetchPexelsVideo(keyword, pexelsKey);
          if (pexels) { media.push(pexels); continue; }
        }

        // Fallback: Pixabay
        if (pixabayKey) {
          const pixabay = await this.fetchPixabayVideo(keyword, pixabayKey);
          if (pixabay) { media.push(pixabay); continue; }
        }

        // Fallback: Unsplash image
        if (unsplashKey) {
          const unsplash = await this.fetchUnsplashImage(keyword, unsplashKey);
          if (unsplash) media.push(unsplash);
        }
      } catch (err) {
        this.logger.warn(`Media fetch failed for "${keyword}": ${err}`);
      }

      await new Promise(r => setTimeout(r, 100));
    }

    return media;
  }

  private async fetchPexelsVideo(query: string, key: string): Promise<StockMedia | null> {
    const res = await fetch(
      `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`,
      { headers: { Authorization: key } },
    );
    const data = await res.json() as any;
    const video = data.videos?.[0];
    if (!video) return null;
    const file = video.video_files?.find((f: any) => f.quality === 'hd') ?? video.video_files?.[0];
    return {
      type: 'video', source: 'pexels', id: String(video.id),
      url: file?.link ?? '', previewUrl: video.image ?? '',
      duration: video.duration, width: video.width, height: video.height,
      license: 'free', attribution: `Video by ${video.user?.name} on Pexels`,
    };
  }

  private async fetchPixabayVideo(query: string, key: string): Promise<StockMedia | null> {
    const res = await fetch(
      `https://pixabay.com/api/videos/?key=${key}&q=${encodeURIComponent(query)}&per_page=3&video_type=film`,
    );
    const data = await res.json() as any;
    const video = data.hits?.[0];
    if (!video) return null;
    return {
      type: 'video', source: 'pixabay', id: String(video.id),
      url: video.videos?.medium?.url ?? video.videos?.small?.url ?? '',
      previewUrl: video.videos?.medium?.thumbnail ?? '',
      duration: video.duration, width: video.videos?.medium?.width ?? 1280,
      height: video.videos?.medium?.height ?? 720, license: 'free',
    };
  }

  private async fetchUnsplashImage(query: string, key: string): Promise<StockMedia | null> {
    const res = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`,
      { headers: { Authorization: `Client-ID ${key}` } },
    );
    const data = await res.json() as any;
    const photo = data.results?.[0];
    if (!photo) return null;
    return {
      type: 'image', source: 'unsplash', id: photo.id,
      url: photo.urls?.regular ?? '', previewUrl: photo.urls?.thumb ?? '',
      width: photo.width, height: photo.height, license: 'free',
      attribution: `Photo by ${photo.user?.name} on Unsplash`,
    };
  }

  // ─── AGENT 3: VOICE SYNTHESIS ─────────────────────────────────────────
  async runVoiceAgent(narration: string, lang: string, voiceId?: string): Promise<string> {
    const elevenKey = this.config.get<string>('ELEVENLABS_API_KEY', '');

    const VOICE_MAP: Record<string, string> = {
      en: voiceId ?? '21m00Tcm4TlvDq8ikWAM', // Rachel — professional
      fr: voiceId ?? 'D38z5RcWu1voky8WS1ja', // Fin — French
      es: voiceId ?? 'VR6AewLTigWG4xSOukaG', // Arnold — Spanish
      de: voiceId ?? 'GBv7mTt0atIp3Br8iCZE', // Thomas — German
      pt: voiceId ?? 'ODq5zmih8GrVes37Dizd', // Patrick — Portuguese
    };

    const selectedVoice = VOICE_MAP[lang] ?? VOICE_MAP['en'];

    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${selectedVoice}`, {
      method: 'POST',
      headers: {
        'xi-api-key': elevenKey,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
      },
      body: JSON.stringify({
        text: narration,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.85, style: 0.2, use_speaker_boost: true },
      }),
    });

    if (!res.ok) throw new Error(`ElevenLabs error: ${res.statusText}`);

    // In production: upload buffer to S3/R2 and return URL
    // Here: return placeholder URL pattern
    const audioId = `audio_${Date.now()}`;
    return `https://storage.yourdomain.com/audio/${audioId}.mp3`;
  }

  // ─── AGENT 4: VIDEO ASSEMBLY (Remotion render worker) ────────────────
  // Replaces Creatomate. Builds a render spec and dispatches a BullMQ job to
  // apps/video-render (Remotion + ffmpeg). Free stack footage from Agent 2,
  // ElevenLabs narration from Agent 3. No paid render API.
  async runAssemblyAgent(
    script: VideoScript,
    media: StockMedia[],
    audioUrl: string,
    input: VideoJobInput,
  ): Promise<Record<VideoFormat, string>> {
    const results: Record<string, string> = {};
    const formats = new Set<VideoFormat>();
    for (const platform of input.platforms) formats.add(PLATFORM_SPECS[platform].format);

    for (const format of formats) {
      const spec = this.buildRemotionSpec(script, media, audioUrl, input, format);
      // Enqueue render job; worker returns the CDN URL of the finished MP4.
      const job = await this.renderQueue.add('render', spec, {
        attempts: 2,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 50,
        removeOnFail: 20,
      });
      const finished = await job.waitUntilFinished(this.queueEvents, 600000); // 10 min cap
      results[format] = finished.videoUrl;
    }

    return results as Record<VideoFormat, string>;
  }

  /**
   * Build a Remotion render spec — the serializable contract between the
   * NestJS orchestrator and the Remotion worker (apps/video-render).
   */
  private buildRemotionSpec(
    script: VideoScript,
    media: StockMedia[],
    audioUrl: string,
    input: VideoJobInput,
    format: VideoFormat,
  ): RemotionRenderSpec {
    const [width, height] = format === 'landscape' ? [1920, 1080]
      : format === 'portrait' ? [1080, 1920] : [1080, 1080];
    const fps = 30;
    const brandColor = input.brandColor ?? '#e4002b'; // Veltro Swiss-red default
    const durationInFrames = input.duration * fps;
    const perClip = media.length ? input.duration / Math.min(media.length, 8) : input.duration;

    return {
      composition: 'VeltroVideo',
      output: { format: 'mp4', codec: 'h264', width, height, fps, durationInFrames },
      props: {
        brandName: input.brandName,
        brandColor,
        lang: input.lang,
        audioUrl,
        clips: media.slice(0, 8).map((m, i) => ({
          type: m.type, src: m.url, start: Math.round(i * perClip * fps),
          duration: Math.round(perClip * fps), attribution: m.attribution ?? null,
        })),
        hook: script.hook,
        onScreenText: script.onScreenText,
        cta: script.cta,
        ctaUrl: input.ctaUrl,
        durationSec: input.duration,
      },
    };
  }

  // ─── AGENT 5: PUBLISH ─────────────────────────────────────────────────
  async runPublishAgent(
    videos: Record<VideoFormat, string>,
    script: VideoScript,
    input: VideoJobInput,
    scheduleAt?: Date,
  ): Promise<Record<VideoPlatform, string>> {
    const published: Record<string, string> = {};

    for (const platform of input.platforms) {
      try {
        const spec = PLATFORM_SPECS[platform];
        const videoUrl = videos[spec.format];
        if (!videoUrl) continue;

        // In production: integrate with each platform's API
        // YouTube Data API v3, LinkedIn API, TikTok API, Instagram Graph API
        const url = await this.publishToPlatform(platform, videoUrl, script, input, scheduleAt);
        published[platform] = url;
        this.logger.log(`Published to ${platform}: ${url}`);
      } catch (err) {
        this.logger.error(`Publish failed for ${platform}: ${err}`);
      }
    }

    return published as Record<VideoPlatform, string>;
  }

  private async publishToPlatform(
    platform: VideoPlatform,
    videoUrl: string,
    script: VideoScript,
    input: VideoJobInput,
    scheduleAt?: Date,
  ): Promise<string> {
    // Platform-specific implementations:
    switch (platform) {
      case 'youtube':
        return this.publishYouTube(videoUrl, script, input, scheduleAt);
      case 'linkedin':
        return this.publishLinkedIn(videoUrl, script, input);
      default:
        // For TikTok, Instagram: use Buffer/Publer API as middleware
        return this.publishViaSocialScheduler(platform, videoUrl, script, input, scheduleAt);
    }
  }

  private async publishYouTube(videoUrl: string, script: VideoScript, input: VideoJobInput, scheduleAt?: Date): Promise<string> {
    const key = this.config.get<string>('YOUTUBE_API_KEY', '');
    // YouTube Data API v3 upload — requires OAuth2 in production
    // Returns video URL placeholder
    return `https://youtube.com/watch?v=placeholder_${Date.now()}`;
  }

  private async publishLinkedIn(videoUrl: string, script: VideoScript, input: VideoJobInput): Promise<string> {
    const token = this.config.get<string>('LINKEDIN_ACCESS_TOKEN', '');
    return `https://linkedin.com/posts/placeholder_${Date.now()}`;
  }

  private async publishViaSocialScheduler(
    platform: VideoPlatform, videoUrl: string, script: VideoScript, input: VideoJobInput, scheduleAt?: Date,
  ): Promise<string> {
    // Buffer API or Publer API for TikTok / Instagram Reels / Twitter
    const bufferToken = this.config.get<string>('BUFFER_ACCESS_TOKEN', '');
    const publishTime = scheduleAt ? scheduleAt.toISOString() : new Date(Date.now() + 300000).toISOString();

    const res = await fetch('https://api.bufferapp.com/1/updates/create.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        access_token: bufferToken,
        text: `${script.description}\n\n${script.hashtags.join(' ')}`,
        media: JSON.stringify({ video: videoUrl, thumbnail: '' }),
        scheduled_at: publishTime,
      }),
    });

    const data = await res.json() as any;
    return data.updates?.[0]?.id ?? `scheduled_${platform}_${Date.now()}`;
  }

  // ─── FALLBACK SCRIPT ──────────────────────────────────────────────────
  private fallbackScript(input: VideoJobInput): VideoScript {
    return {
      hook: `This changes everything about ${input.keyword}.`,
      problem: `Most ${input.targetAudience} waste hours on ${input.keyword} with no results.`,
      solution: `${input.brandName} solves this in under 60 seconds.`,
      proof: `Over 10,000 users already use ${input.brandName} to get real results fast.`,
      cta: `${input.ctaText} — ${input.ctaUrl}`,
      fullNarration: `This changes everything about ${input.keyword}. Most ${input.targetAudience} waste hours with no results. ${input.brandName} solves this in under 60 seconds. Over 10,000 users get real results. ${input.ctaText} now.`,
      onScreenText: [`${input.keyword}`, `The problem`, `The solution`, `10,000+ users`, input.ctaText],
      bRollKeywords: [input.keyword, input.niche, 'team working', 'success results', 'dashboard analytics', 'growth chart'],
      hashtags: [`#${input.niche.replace(/\s/g,'')}`, `#${input.keyword.replace(/\s/g,'')}`, '#growth', '#results'],
      title: `${input.keyword} — ${input.brandName}`,
      description: `Discover how ${input.brandName} transforms ${input.keyword} for ${input.targetAudience}. ${input.ctaText}: ${input.ctaUrl}`,
      thumbnailText: `${input.keyword} SOLVED`,
    };
  }
}
