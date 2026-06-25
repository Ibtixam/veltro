import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface GeneratedImage {
  url:          string;   // CDN URL after upload
  alt:          string;   // SEO-optimised alt text
  title:        string;
  width:        number;
  height:       number;
  fileSize:     number;
  format:       'webp' | 'jpg';
  schemaMarkup: object;   // ImageObject schema
}

export interface ImageBrief {
  keyword:     string;
  pageType:    'hero' | 'feature' | 'comparison' | 'infographic';
  style:       'professional' | 'minimal' | 'infographic';
  dimensions:  { width: number; height: number };
  brandColors?: string[];
}

@Injectable()
export class ImageGenService {
  private readonly logger = new Logger(ImageGenService.name);

  constructor(private config: ConfigService) {}

  async generatePageImages(keyword: string, domain: string, pageType: string): Promise<GeneratedImage[]> {
    const images: GeneratedImage[] = [];

    // Hero image
    const hero = await this.generateWithFallback({
      keyword,
      pageType: 'hero',
      style:    'professional',
      dimensions: { width: 1200, height: 630 },
    }, domain);
    if (hero) images.push(hero);

    // Feature image (smaller, for body)
    const feature = await this.generateWithFallback({
      keyword,
      pageType: 'feature',
      style:    'minimal',
      dimensions: { width: 800, height: 450 },
    }, domain);
    if (feature) images.push(feature);

    return images;
  }

  private async generateWithFallback(brief: ImageBrief, domain: string): Promise<GeneratedImage | null> {
    // Try DALL-E 3 first
    const dalle = await this.generateDALLE3(brief, domain);
    if (dalle) return dalle;

    // Fallback: Pexels (free, good quality stock)
    return this.fetchPexels(brief);
  }

  private async generateDALLE3(brief: ImageBrief, domain: string): Promise<GeneratedImage | null> {
    const key = this.config.get('OPENAI_API_KEY', '');
    if (!key) return null;

    const prompt = this.buildPrompt(brief, domain);

    try {
      const res = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model:   'dall-e-3',
          prompt,
          n:       1,
          size:    `${brief.dimensions.width}x${brief.dimensions.height}`,
          quality: 'standard',
          style:   'natural',
        }),
      });

      if (!res.ok) { this.logger.warn(`DALL-E failed: ${res.status}`); return null; }
      const data   = await res.json() as any;
      const imgUrl = data.data?.[0]?.url;
      if (!imgUrl) return null;

      return {
        url:      imgUrl,
        alt:      `${brief.keyword} — ${domain}`,
        title:    this.toTitleCase(brief.keyword),
        width:    brief.dimensions.width,
        height:   brief.dimensions.height,
        fileSize: 0,
        format:   'webp',
        schemaMarkup: {
          '@context': 'https://schema.org', '@type': 'ImageObject',
          contentUrl: imgUrl, name: this.toTitleCase(brief.keyword),
          description: `${brief.keyword} illustration`,
          width: brief.dimensions.width, height: brief.dimensions.height,
        },
      };
    } catch (err) {
      this.logger.warn(`DALL-E error: ${err}`);
      return null;
    }
  }

  private async fetchPexels(brief: ImageBrief): Promise<GeneratedImage | null> {
    const key = this.config.get('PEXELS_API_KEY', '');
    if (!key) return null;

    try {
      const res = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(brief.keyword)}&per_page=1&orientation=landscape`, {
        headers: { Authorization: key },
      });
      if (!res.ok) return null;
      const data  = await res.json() as any;
      const photo = data.photos?.[0];
      if (!photo) return null;

      return {
        url:      photo.src.large2x,
        alt:      `${brief.keyword} — ${photo.photographer}`,
        title:    this.toTitleCase(brief.keyword),
        width:    brief.dimensions.width,
        height:   brief.dimensions.height,
        fileSize: 0,
        format:   'jpg',
        schemaMarkup: {
          '@context': 'https://schema.org', '@type': 'ImageObject',
          contentUrl: photo.src.large2x,
          name: this.toTitleCase(brief.keyword),
          creditText: `Photo by ${photo.photographer} on Pexels`,
          width: brief.dimensions.width, height: brief.dimensions.height,
        },
      };
    } catch (err) {
      this.logger.warn(`Pexels error: ${err}`);
      return null;
    }
  }

  private buildPrompt(brief: ImageBrief, domain: string): string {
    const base = `Professional ${brief.style} image for a B2B SaaS website page about "${brief.keyword}".`;
    const style = brief.style === 'professional'
      ? 'Clean, modern, business-focused. Dark background with accent colors. No text or logos.'
      : 'Minimal, flat design, abstract shapes representing data and connectivity.';
    const size = `Optimised for web at ${brief.dimensions.width}x${brief.dimensions.height}px.`;
    return `${base} ${style} ${size} High quality, no watermarks.`;
  }

  private toTitleCase = (s: string) => s.replace(/\b\w/g, c => c.toUpperCase());
}
