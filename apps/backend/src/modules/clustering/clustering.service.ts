import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import {
  clusterKeywords,
  buildPortfolio,
  RawKeyword,
  KeywordCluster,
  ClusterPortfolio,
} from './keyword-cluster.engine';

// ─── KEYWORD DATA SOURCES ──────────────────────────────────────────────────
// In production: plug DataForSEO, Ahrefs API, or SEMrush API
// Here: Google Suggest + Related Searches (free, no API key needed)

@Injectable()
export class ClusteringService {
  private readonly logger = new Logger(ClusteringService.name);
  private readonly cache = new Map<string, { data: ClusterPortfolio; expiresAt: number }>();

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  // ─── MAIN: ANALYZE URL ────────────────────────────────────────────────
  async analyzeUrl(url: string, seedKeywords?: string[]): Promise<ClusterPortfolio> {
    const domain = new URL(url).hostname.replace('www.', '');
    const cacheKey = `cluster:${domain}`;

    // Cache hit (1 hour)
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      this.logger.log(`Cache hit for ${domain}`);
      return cached.data;
    }

    // 1. Get seed keywords from URL/domain context
    const seeds = seedKeywords?.length ? seedKeywords : this.inferSeeds(domain);

    // 2. Expand via Google Suggest
    const rawKeywords = await this.expandKeywords(seeds);

    // 3. Cluster
    const clusters = clusterKeywords(rawKeywords);

    // 4. Build portfolio
    const portfolio = buildPortfolio(clusters);

    // 5. Cache
    this.cache.set(cacheKey, { data: portfolio, expiresAt: Date.now() + 3600_000 });

    return portfolio;
  }

  // ─── ANALYZE MANUAL KEYWORD LIST ─────────────────────────────────────
  async analyzeKeywords(keywords: RawKeyword[]): Promise<ClusterPortfolio> {
    const clusters = clusterKeywords(keywords);
    return buildPortfolio(clusters);
  }

  // ─── EXPAND KEYWORDS VIA GOOGLE SUGGEST ──────────────────────────────
  async expandKeywords(seeds: string[], lang = 'en', country = 'us'): Promise<RawKeyword[]> {
    const allKeywords: RawKeyword[] = [];
    const seen = new Set<string>();

    for (const seed of seeds.slice(0, 10)) {
      try {
        const suggestions = await this.fetchGoogleSuggest(seed, lang, country);
        const alphaModifiers = await this.fetchAlphabetExpansion(seed, lang);
        const questionModifiers = await this.fetchQuestionExpansion(seed, lang);

        const allVariants = [...new Set([seed, ...suggestions, ...alphaModifiers, ...questionModifiers])];

        for (const kw of allVariants) {
          if (seen.has(kw) || kw.length < 4) continue;
          seen.add(kw);

          // Estimate volume and KD from heuristics (replace with real API in prod)
          const estimated = this.estimateMetrics(kw, seed);
          allKeywords.push({ keyword: kw, ...estimated, lang, country });
        }
      } catch (err) {
        this.logger.warn(`Expand failed for "${seed}": ${err}`);
        // Add the seed itself with estimates
        if (!seen.has(seed)) {
          seen.add(seed);
          allKeywords.push({ keyword: seed, ...this.estimateMetrics(seed, seed), lang, country });
        }
      }

      // Rate limit: avoid hammering Google Suggest
      await new Promise(r => setTimeout(r, 150));
    }

    return allKeywords;
  }

  // ─── GOOGLE SUGGEST ───────────────────────────────────────────────────
  private async fetchGoogleSuggest(query: string, lang: string, country: string): Promise<string[]> {
    const encoded = encodeURIComponent(query);
    const url = `https://suggestqueries.google.com/complete/search?client=firefox&q=${encoded}&hl=${lang}&gl=${country}`;

    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Veltro/1.0)' },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) return [];
    const data = await res.json() as [string, string[]];
    return data[1] ?? [];
  }

  // ─── ALPHABET EXPANSION (a-z modifiers) ──────────────────────────────
  private async fetchAlphabetExpansion(seed: string, lang: string): Promise<string[]> {
    const results: string[] = [];
    // Only expand for short seeds to avoid too many requests
    if (seed.split(' ').length > 2) return results;

    const letters = 'abcdefghijklmnoprstw'.split('');
    const batch = letters.slice(0, 8); // limit to 8 letters

    await Promise.all(batch.map(async (letter) => {
      try {
        const suggestions = await this.fetchGoogleSuggest(`${seed} ${letter}`, lang, 'us');
        results.push(...suggestions.slice(0, 3));
      } catch {}
    }));

    return results;
  }

  // ─── QUESTION EXPANSION ───────────────────────────────────────────────
  private async fetchQuestionExpansion(seed: string, lang: string): Promise<string[]> {
    const prefixes = lang === 'fr'
      ? ['comment', 'pourquoi', 'qu est ce que', 'meilleur', 'combien']
      : ['how to', 'what is', 'best', 'why', 'how much', 'where to'];

    const results: string[] = [];
    await Promise.all(prefixes.map(async (prefix) => {
      try {
        const suggestions = await this.fetchGoogleSuggest(`${prefix} ${seed}`, lang, 'us');
        results.push(...suggestions.slice(0, 2));
      } catch {}
    }));

    return results;
  }

  // ─── METRIC ESTIMATION (heuristic) ───────────────────────────────────
  // Replace with DataForSEO / Ahrefs API in production
  private estimateMetrics(keyword: string, seed: string): Omit<RawKeyword, 'keyword' | 'lang' | 'country'> {
    const wordCount = keyword.split(' ').length;
    const isSeed = keyword === seed;
    const isLongTail = wordCount >= 4;

    // Volume heuristic: shorter = higher volume, long-tail = lower but more targeted
    const baseVolume = isSeed ? 5000 : isLongTail ? 200 : 800;
    const volumeVariance = Math.floor(Math.random() * baseVolume * 0.6);
    const volume = baseVolume + volumeVariance - Math.floor(volumeVariance / 2);

    // KD heuristic: longer tail = lower difficulty
    const baseKD = isSeed ? 45 : isLongTail ? 18 : 32;
    const kdVariance = Math.floor(Math.random() * 20) - 10;
    const kd = Math.min(100, Math.max(5, baseKD + kdVariance));

    // CPC heuristic: commercial intent signals higher CPC
    const hasCommercial = /buy|price|best|software|tool|service/i.test(keyword);
    const cpc = hasCommercial ? Math.round((Math.random() * 4 + 1) * 100) / 100 : Math.round(Math.random() * 100) / 100;

    return { volume, kd, cpc };
  }

  // ─── SEED INFERENCE FROM DOMAIN ───────────────────────────────────────
  private inferSeeds(domain: string): string[] {
    // Extract meaningful words from domain name
    const cleaned = domain.replace(/\.(com|io|net|org|fr|ca|africa)$/i, '').replace(/[^a-z]/gi, ' ');
    const words = cleaned.split(/\s+/).filter(w => w.length > 3);
    return words.length > 0 ? words.slice(0, 3) : ['seo tools', 'website audit', 'keyword research'];
  }

  // ─── GET TOP CLUSTERS FOR DOMAIN ──────────────────────────────────────
  async getTopClusters(domain: string, limit = 20): Promise<KeywordCluster[]> {
    const portfolio = await this.analyzeUrl(`https://${domain}`);
    return portfolio.clusters.slice(0, limit);
  }

  // ─── GENERATE PROGRAMMATIC PAGE SEEDS ────────────────────────────────
  async generateProgrammaticSeeds(
    baseKeyword: string,
    countries: string[],
    cities: string[],
    industries: string[],
  ): Promise<RawKeyword[]> {
    const seeds: RawKeyword[] = [];

    for (const country of countries.slice(0, 10)) {
      for (const city of cities.slice(0, 5)) {
        for (const industry of industries.slice(0, 8)) {
          const kw = `${industry} ${baseKeyword} ${city} ${country}`.toLowerCase().trim();
          seeds.push({
            keyword: kw,
            volume: Math.floor(Math.random() * 400 + 50),
            kd: Math.floor(Math.random() * 20 + 5), // geo pages always low KD
            cpc: Math.round(Math.random() * 2 * 100) / 100,
            lang: ['fr', 'cm', 'ga', 'sn'].includes(country.toLowerCase()) ? 'fr' : 'en',
            country,
          });
        }
      }
    }

    return seeds;
  }
}
