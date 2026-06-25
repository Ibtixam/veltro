import { Injectable } from '@nestjs/common';
import { GSCPageData } from '../connectors/gsc/gsc.connector';
import { AhrefsKeywordData } from '../connectors/ahrefs/ahrefs.connector';

export interface MomentumSignal {
  keyword: string; url: string;
  velocityScore: number;       // 0-100: how fast is this growing
  currentPosition: number;
  positionGainLast28d: number; // positive = moving up
  volumeGrowthEstimate: number;
  actionType: 'double_down' | 'quick_publish' | 'internal_link_boost';
  explanation: string;
  estimatedRevenueIfActed: number;
}

@Injectable()
export class MomentumService {

  detectMomentum(gsc: GSCPageData[], ahrefs: AhrefsKeywordData[], avgOrderValue: number, convRate: number): MomentumSignal[] {
    const signals: MomentumSignal[] = [];

    // 1. GSC-based: pages gaining impressions fast but not yet clicks (about to break through)
    for (const page of gsc) {
      const impressionGrowth = page.clicksDelta; // proxy — we use clicks delta
      const posGain = page.positionDelta ?? 0;

      if (posGain > 2 && page.avgPosition > 5 && page.avgPosition < 20) {
        // Moving from pos 15→12 → about to break into page 1
        const projClicks   = Math.round(page.impressions * 0.05); // conservative
        const annualRevenue = projClicks * 12 * convRate * avgOrderValue;
        signals.push({
          keyword:    page.topKeyword,
          url:        page.url,
          velocityScore:        Math.min(100, Math.round(posGain * 15)),
          currentPosition:      page.avgPosition,
          positionGainLast28d:  posGain,
          volumeGrowthEstimate: 0,
          actionType:  page.avgPosition < 15 ? 'double_down' : 'internal_link_boost',
          explanation: `"${page.topKeyword}" moved up ${posGain.toFixed(1)} positions in 28 days (now ${page.avgPosition.toFixed(1)}). ${page.avgPosition < 15 ? 'Add 3 internal links + refresh content to push into top 10.' : 'One push needed — 2 internal links from high-authority pages.'}`,
          estimatedRevenueIfActed: Math.round(annualRevenue),
        });
      }

      // GSC-based: impressions growing but position stagnant → content update needed
      if (page.clicksDelta > 0.15 && page.avgPosition > 10) {
        signals.push({
          keyword:    page.topKeyword,
          url:        page.url,
          velocityScore:        60,
          currentPosition:      page.avgPosition,
          positionGainLast28d:  posGain,
          volumeGrowthEstimate: Math.round(page.impressions * page.clicksDelta),
          actionType:  'quick_publish',
          explanation: `"${page.topKeyword}" is gaining ${Math.round(page.clicksDelta*100)}% more impressions but position unchanged at ${page.avgPosition.toFixed(1)}. Topic is trending — refresh content now before competitors notice.`,
          estimatedRevenueIfActed: Math.round(page.impressions * 0.03 * convRate * avgOrderValue * 12),
        });
      }
    }

    // 2. Ahrefs-based: keywords at pos 5-15 with high volume → double-down
    for (const kw of ahrefs) {
      if (kw.position >= 5 && kw.position <= 15 && kw.volume > 500) {
        const projClicks    = Math.round(kw.volume * 0.08); // CTR at pos 5
        const annualRevenue = projClicks * 12 * convRate * avgOrderValue;
        signals.push({
          keyword:    kw.keyword,
          url:        kw.url,
          velocityScore:        80,
          currentPosition:      kw.position,
          positionGainLast28d:  0,
          volumeGrowthEstimate: kw.volume,
          actionType:  'double_down',
          explanation: `"${kw.keyword}" ranks ${kw.position} with ${kw.volume.toLocaleString()} monthly searches. Pushing to top 3 adds ~${projClicks.toLocaleString()} extra clicks/month = $${Math.round(annualRevenue).toLocaleString()}/year.`,
          estimatedRevenueIfActed: Math.round(annualRevenue),
        });
      }
    }

    return signals.sort((a, b) => b.velocityScore - a.velocityScore).slice(0, 10);
  }
}
