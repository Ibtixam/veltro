import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// ─── TYPES ───────────────────────────────────────────────────────────────

export interface HuntConfig {
  domain: string;
  seedKeywords: string[];
  lang: 'en' | 'fr' | 'both';
  country: string;
  competitors: string[];
  maxClusters: number;        // per plan: 5 / 20 / unlimited
  minClusterScore: number;    // default 60
}

export interface RawKeyword {
  keyword: string;
  volume: number;
  kd: number;
  cpc: number;
  lang: string;
}

export interface OpportunityCluster {
  id: string;
  pillarKeyword: string;
  pillarSlug: string;
  satellites: string[];
  totalVolume: number;
  avgKD: number;
  clusterScore: number;
  estimatedMonthlyTraffic: number;
  estimatedConversions: number;
  priority: 'critical' | 'high' | 'medium' | 'low';
  intent: 'transactional' | 'commercial' | 'informational';
  competitorGap: boolean;
  freshnessSignal: 'rising' | 'stable' | 'declining';
  estimatedWinWeeks: number;
  lang: 'en' | 'fr';
  codePagesNeeded: string[];  // slugs to generate
}

export interface HuntResult {
  domain: string;
  huntedAt: Date;
  totalOpportunities: number;
  criticalCount: number;
  highCount: number;
  opportunities: OpportunityCluster[];
  competitorGaps: string[];
  estimatedMonthlyTrafficIfFixed: number;
}

// ─── SERVICE ─────────────────────────────────────────────────────────────

@Injectable()
export class OpportunityHunterService {
  private readonly logger = new Logger(OpportunityHunterService.name);

  constructor(private readonly config: ConfigService) {}

  async hunt(cfg: HuntConfig): Promise<HuntResult> {
    this.logger.log(`Hunting opportunities for ${cfg.domain}`);

    const rawKeywords = await this.expandKeywords(cfg.seedKeywords, cfg.lang, cfg.country);
    const clusters = this.clusterKeywords(rawKeywords, cfg);

    const topClusters = clusters
      .filter(c => c.clusterScore >= cfg.minClusterScore)
      .sort((a, b) => b.clusterScore - a.clusterScore)
      .slice(0, cfg.maxClusters);

    const competitorGaps = await this.findCompetitorGaps(cfg.domain, cfg.competitors, rawKeywords);

    const estimatedMonthlyTrafficIfFixed = topClusters.reduce(
      (sum, c) => sum + c.estimatedMonthlyTraffic, 0
    );

    return {
      domain: cfg.domain,
      huntedAt: new Date(),
      totalOpportunities: topClusters.length,
      criticalCount: topClusters.filter(c => c.priority === 'critical').length,
      highCount: topClusters.filter(c => c.priority === 'high').length,
      opportunities: topClusters,
      competitorGaps,
      estimatedMonthlyTrafficIfFixed,
    };
  }

  // ─── KEYWORD EXPANSION ───────────────────────────────────────────────

  async expandKeywords(seeds: string[], lang: string, country: string): Promise<RawKeyword[]> {
    const all: RawKeyword[] = [];
    const seen = new Set<string>();

    for (const seed of seeds.slice(0, 15)) {
      try {
        const suggest = await this.fetchGoogleSuggest(seed, lang === 'fr' ? 'fr' : 'en', country);
        const alpha    = await this.fetchAlphabetExpansion(seed, lang === 'fr' ? 'fr' : 'en');
        const questions = this.buildQuestionVariants(seed, lang);

        for (const kw of [...suggest, ...alpha, ...questions, seed]) {
          if (seen.has(kw) || kw.length < 4) continue;
          seen.add(kw);
          all.push(this.estimateMetrics(kw, seed));
        }

        if (lang === 'both') {
          const frSuggest = await this.fetchGoogleSuggest(seed, 'fr', country);
          for (const kw of frSuggest) {
            if (seen.has(kw)) continue;
            seen.add(kw);
            all.push(this.estimateMetrics(kw, seed));
          }
        }
      } catch (err) {
        this.logger.warn(`Expand failed for "${seed}": ${err}`);
      }
    }

    return all;
  }

  private async fetchGoogleSuggest(seed: string, lang: string, country: string): Promise<string[]> {
    const url = `https://suggestqueries.google.com/complete/search?client=firefox&hl=${lang}&gl=${country}&q=${encodeURIComponent(seed)}`;
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Veltro-SEO-Hunter/2.0' },
        signal: AbortSignal.timeout(5000),
      });
      const data = await res.json() as [string, string[]];
      return data[1] ?? [];
    } catch { return []; }
  }

  private async fetchAlphabetExpansion(seed: string, lang: string): Promise<string[]> {
    const sample = 'abcdefghijklmnopqrstuvwxyz'.split('').sort(() => Math.random() - 0.5).slice(0, 6);
    const results: string[] = [];
    await Promise.allSettled(
      sample.map(async (l) => {
        const s = await this.fetchGoogleSuggest(`${seed} ${l}`, lang, 'us');
        results.push(...s);
      })
    );
    return results;
  }

  private buildQuestionVariants(seed: string, lang: string): string[] {
    const en = ['how to', 'best', 'top', 'vs', 'alternative to', 'free', 'cheap', 'what is'];
    const fr = ['comment', 'meilleur', 'comparatif', 'alternative', 'gratuit', 'qu est ce que'];
    const prefixes = lang === 'fr' ? fr : lang === 'both' ? [...en, ...fr] : en;
    return prefixes.map(p => `${p} ${seed}`);
  }

  private estimateMetrics(kw: string, seed: string): RawKeyword {
    const words = kw.split(' ').length;
    const isLongTail = words >= 4;
    const baseVol = seed.toLowerCase() === kw.toLowerCase() ? 2000 : isLongTail ? 150 : 600;
    return {
      keyword: kw,
      volume:  Math.round(baseVol * (0.5 + Math.random())),
      kd:      isLongTail ? Math.round(10 + Math.random() * 25) : Math.round(25 + Math.random() * 40),
      cpc:     parseFloat((0.5 + Math.random() * 4).toFixed(2)),
      lang:    kw.match(/[àâçéèêëîïôùûüÿœæ]/) ? 'fr' : 'en',
    };
  }

  // ─── CLUSTERING ──────────────────────────────────────────────────────

  private clusterKeywords(keywords: RawKeyword[], cfg: HuntConfig): OpportunityCluster[] {
    // Group by semantic proximity (seed-word overlap)
    const groups = new Map<string, RawKeyword[]>();

    for (const kw of keywords) {
      const words = kw.keyword.toLowerCase().split(' ');
      const key = words.slice(0, 2).join(' ');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(kw);
    }

    const clusters: OpportunityCluster[] = [];

    for (const [groupKey, members] of groups) {
      if (members.length < 2) continue;

      const sorted = members.sort((a, b) => b.volume - a.volume);
      const pillar  = sorted[0];
      const sats    = sorted.slice(1, 8);

      const totalVolume   = members.reduce((s, k) => s + k.volume, 0);
      const avgKD         = members.reduce((s, k) => s + k.kd, 0) / members.length;
      const clusterScore  = Math.round((totalVolume / Math.pow(avgKD, 1.4)) * this.intentMultiplier(pillar.keyword));

      const estimatedMonthlyTraffic = Math.round(totalVolume * 0.032); // ~3.2% CTR position 3
      const estimatedConversions    = Math.round(estimatedMonthlyTraffic * 0.025);

      const priority: OpportunityCluster['priority'] =
        clusterScore > 80 ? 'critical' :
        clusterScore > 60 ? 'high' :
        clusterScore > 40 ? 'medium' : 'low';

      const intent = this.detectIntent(pillar.keyword);
      const competitorGap = this.isLikelyGap(pillar.keyword, cfg.competitors);
      const freshnessSignal: 'rising' | 'stable' | 'declining' = avgKD < 25 ? 'rising' : avgKD < 45 ? 'stable' : 'declining';
      const estimatedWinWeeks = avgKD < 20 ? 4 : avgKD < 40 ? 10 : avgKD < 60 ? 20 : 36;

      clusters.push({
        id: `cluster-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        pillarKeyword: pillar.keyword,
        pillarSlug:    pillar.keyword.replace(/[^a-z0-9]+/gi, '-').toLowerCase().replace(/^-|-$/g, ''),
        satellites:    sats.map(k => k.keyword),
        totalVolume,
        avgKD: Math.round(avgKD),
        clusterScore,
        estimatedMonthlyTraffic,
        estimatedConversions,
        priority,
        intent,
        competitorGap,
        freshnessSignal,
        estimatedWinWeeks,
        lang: (pillar.lang as 'en' | 'fr') ?? 'en',
        codePagesNeeded: this.determinePages(pillar.keyword, cfg.domain),
      });
    }

    return clusters;
  }

  private intentMultiplier(kw: string): number {
    const k = kw.toLowerCase();
    if (['buy','price','subscribe','acheter','prix'].some(s => k.includes(s))) return 2.0;
    if (['best','vs','compare','alternative','meilleur'].some(s => k.includes(s))) return 1.6;
    return 1.0;
  }

  private detectIntent(kw: string): OpportunityCluster['intent'] {
    const k = kw.toLowerCase();
    if (['buy','price','subscribe','free trial','acheter','prix'].some(s => k.includes(s))) return 'transactional';
    if (['best','vs','compare','alternative','meilleur','comparatif'].some(s => k.includes(s))) return 'commercial';
    return 'informational';
  }

  private isLikelyGap(keyword: string, competitors: string[]): boolean {
    const gapSignals = ['africa','afrique','cameroun','senegal','francophone','pme','pmé'];
    return gapSignals.some(s => keyword.toLowerCase().includes(s));
  }

  private determinePages(pillarKeyword: string, domain: string): string[] {
    const slug = pillarKeyword.replace(/[^a-z0-9]+/gi, '-').toLowerCase().replace(/^-|-$/g, '');
    const pages = [`/solutions/${slug}`];
    const k = pillarKeyword.toLowerCase();
    if (['vs','alternative','compare','comparatif'].some(s => k.includes(s))) pages.push(`/compare/${slug}`);
    const geos = ['cameroon','senegal','ghana','nigeria','kenya','africa'];
    const geo = geos.find(g => k.includes(g));
    if (geo) pages.push(`/leads/${geo}`);
    if (k.match(/[àâçéèêëîïôùûüÿœæ]/) || k.includes('afrique') || k.includes('outil')) pages.push(`/fr/${slug}`);
    return pages;
  }

  private async findCompetitorGaps(domain: string, competitors: string[], keywords: RawKeyword[]): Promise<string[]> {
    return keywords
      .filter(k => k.kd < 40 && k.volume > 200)
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 10)
      .map(k => k.keyword);
  }
}
