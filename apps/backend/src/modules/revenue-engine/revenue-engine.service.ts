import { Injectable, Logger } from '@nestjs/common';

// ─── CORE TYPES ───────────────────────────────────────────────────────────

export type ActionType =
  | 'optimize_existing_page'
  | 'create_cluster_page'
  | 'fix_cannibalization'
  | 'recover_lost_traffic'
  | 'improve_ctr'
  | 'internal_link'
  | 'fix_schema'
  | 'geo_page'
  | 'comparison_page'
  | 'featured_snippet_capture';

export interface RevenueSignal {
  pageUrl:       string;
  keyword:       string;
  actionType:    ActionType;
  // Current state
  currentClicks:        number;
  currentImpressions:   number;
  currentPosition:      number;
  currentCTR:           number;
  currentConvRate:      number;
  avgOrderValue:        number;
  // Projections
  projectedClicks:              number;
  projectedConversions:         number;
  projectedRevenueGainMonthly:  number;
  projectedRevenueGainAnnual:   number;
  confidence:          'high' | 'medium' | 'low';
  confidenceReason:    string;
  // Prioritization
  effortHours:         number;
  roiScore:            number;   // annual revenue / effort hours
  priority:            1 | 2 | 3 | 4 | 5;
  // Human output
  explanation:         string;
  evidencePoints:      string[];
  autoImplementable:   boolean;
  implementationPlan:  string[];
}

export interface BusinessContext {
  domain:         string;
  businessType:   string;
  revenueGoal:    number;
  avgOrderValue:  number;
  conversionRate: number;
  currency:       string;
}

export interface GSCPageData {
  url:          string;
  topKeyword:   string;
  clicks:       number;
  impressions:  number;
  ctr:          number;
  avgPosition:  number;
  clicksDelta:  number;   // fraction: -0.2 = -20%
}

export interface GA4PageData {
  url:            string;
  sessions:       number;
  conversionRate: number;
  revenueTotal:   number;
  bounceRate:     number;
}

export interface KeywordOpportunity {
  keyword:         string;
  volume:          number;
  kd:              number;
  isTransactional: boolean;
  pageType:        'pillar' | 'comparison' | 'geo' | 'faq';
}

export interface RevenueDashboard {
  domain:            string;
  generatedAt:       Date;
  businessContext:   BusinessContext;
  totalAnnualUpside: number;
  quickWinUpside:    number;
  priorityList:      RevenueSignal[];
  weeklyReport?:     WeeklyROIReport;
}

export interface WeeklyROIReport {
  weekStart:            Date;
  weekEnd:              Date;
  actionsExecuted:      number;
  trafficGained:        number;
  revenueAttributed:    number;
  rankingMovements:     { keyword: string; before: number; after: number; delta: number }[];
  rollbacks:            { page: string; reason: string }[];
}

// ─── CTR BENCHMARKS ──────────────────────────────────────────────────────
const CTR: Record<number, number> = {
  1: 0.287, 2: 0.158, 3: 0.104, 4: 0.072, 5: 0.053,
  6: 0.040, 7: 0.031, 8: 0.026, 9: 0.022, 10: 0.019,
};
const benchmarkCTR = (pos: number) => CTR[Math.min(Math.max(Math.round(pos), 1), 10)] ?? 0.01;

// ─── SERVICE ─────────────────────────────────────────────────────────────

@Injectable()
export class RevenueEngineService {
  private readonly logger = new Logger(RevenueEngineService.name);

  async buildDashboard(
    ctx:           BusinessContext,
    gscData:       GSCPageData[],
    ga4Data:       GA4PageData[],
    opportunities: KeywordOpportunity[],
  ): Promise<RevenueDashboard> {

    const signals: RevenueSignal[] = [];

    // Analyze every existing page
    for (const page of gscData) {
      const ga4 = ga4Data.find(g => g.url === page.url);
      signals.push(...this.analyzeExistingPage(page, ga4, ctx));
    }

    // Convert keyword opportunities into revenue actions
    for (const opp of opportunities) {
      const s = this.opportunityToSignal(opp, ctx);
      if (s) signals.push(s);
    }

    const priorityList     = signals.sort((a, b) => b.roiScore - a.roiScore).slice(0, 20);
    const totalAnnualUpside = signals.reduce((s, r) => s + r.projectedRevenueGainAnnual, 0);
    const quickWinUpside    = priorityList.slice(0, 3).reduce((s, r) => s + r.projectedRevenueGainAnnual, 0);

    return { domain: ctx.domain, generatedAt: new Date(), businessContext: ctx, totalAnnualUpside, quickWinUpside, priorityList };
  }

  // ─── ANALYZE EXISTING PAGE ───────────────────────────────────────────

  private analyzeExistingPage(page: GSCPageData, ga4: GA4PageData | undefined, ctx: BusinessContext): RevenueSignal[] {
    const signals: RevenueSignal[] = [];
    const cvr = ga4?.conversionRate ?? ctx.conversionRate;
    const aov = ctx.avgOrderValue;

    // ── CTR below benchmark ───────────────────────────────────────────
    const bench = benchmarkCTR(page.avgPosition);
    if (page.ctr < bench * 0.6 && page.impressions > 500) {
      const extra    = Math.round(page.impressions * (bench - page.ctr));
      const annualRev = Math.round(extra * cvr * aov * 12);
      signals.push({
        pageUrl: page.url, keyword: page.topKeyword, actionType: 'improve_ctr',
        currentClicks: page.clicks, currentImpressions: page.impressions,
        currentPosition: page.avgPosition, currentCTR: page.ctr,
        currentConvRate: cvr, avgOrderValue: aov,
        projectedClicks: page.clicks + extra,
        projectedConversions: (page.clicks + extra) * cvr,
        projectedRevenueGainMonthly: Math.round(extra * cvr * aov),
        projectedRevenueGainAnnual:  annualRev,
        confidence: 'high',
        confidenceReason: `CTR ${(page.ctr*100).toFixed(1)}% vs benchmark ${(bench*100).toFixed(1)}% at position ${page.avgPosition.toFixed(1)}`,
        effortHours: 0.5, roiScore: Math.round(annualRev / 0.5),
        priority: page.impressions > 5000 ? 1 : 2,
        explanation: `Page ranks at position ${page.avgPosition.toFixed(1)} but CTR is ${(page.ctr*100).toFixed(1)}% — benchmark is ${(bench*100).toFixed(1)}%. Rewriting the title + meta description adds ~${extra.toLocaleString()} clicks/month = $${annualRev.toLocaleString()}/year.`,
        evidencePoints: [
          `Current CTR: ${(page.ctr*100).toFixed(1)}%`,
          `Benchmark at position ${Math.round(page.avgPosition)}: ${(bench*100).toFixed(1)}%`,
          `Extra clicks: ${extra.toLocaleString()}/month`,
          `Revenue: $${annualRev.toLocaleString()}/year`,
        ],
        autoImplementable: true,
        implementationPlan: [
          `Rewrite title: lead with "${page.topKeyword}" + power word (Best / Free / Guide / Fast)`,
          'Add current year to title if content is evergreen',
          'Meta description: explicit CTA + primary benefit + number',
          'Test for 14 days, monitor CTR in Search Console',
        ],
      });
    }

    // ── Page converts below site average ─────────────────────────────
    if (ga4 && ga4.conversionRate < ctx.conversionRate * 0.4 && page.clicks > 200) {
      const gap      = ctx.conversionRate - ga4.conversionRate;
      const extraCvr = Math.round(page.clicks * gap);
      const annualRev = Math.round(extraCvr * aov * 12);
      signals.push({
        pageUrl: page.url, keyword: page.topKeyword, actionType: 'optimize_existing_page',
        currentClicks: page.clicks, currentImpressions: page.impressions,
        currentPosition: page.avgPosition, currentCTR: page.ctr,
        currentConvRate: ga4.conversionRate, avgOrderValue: aov,
        projectedClicks: page.clicks, projectedConversions: page.clicks * ctx.conversionRate,
        projectedRevenueGainMonthly: Math.round(extraCvr * aov),
        projectedRevenueGainAnnual:  annualRev,
        confidence: 'medium',
        confidenceReason: `Converts at ${(ga4.conversionRate*100).toFixed(1)}% vs site average ${(ctx.conversionRate*100).toFixed(1)}%`,
        effortHours: 2, roiScore: Math.round(annualRev / 2),
        priority: 1,
        explanation: `Gets ${page.clicks.toLocaleString()} clicks/month but only ${(ga4.conversionRate*100).toFixed(1)}% convert — site average is ${(ctx.conversionRate*100).toFixed(1)}%. Closing half this gap = ${extraCvr} extra conversions = $${annualRev.toLocaleString()}/year.`,
        evidencePoints: [
          `Page CVR: ${(ga4.conversionRate*100).toFixed(1)}%`,
          `Site average: ${(ctx.conversionRate*100).toFixed(1)}%`,
          `Monthly clicks: ${page.clicks.toLocaleString()}`,
          `Upside: $${annualRev.toLocaleString()}/year`,
        ],
        autoImplementable: true,
        implementationPlan: [
          'Add prominent CTA above the fold — button not text link',
          'Add social proof near CTA (testimonial, customer count, logo strip)',
          'Reduce form fields to minimum — each extra field drops conversion ~10%',
          'Check Core Web Vitals — slow LCP correlates with high bounce',
          'Add exit intent: offer free trial before visitor leaves',
        ],
      });
    }

    // ── Traffic declining fast ────────────────────────────────────────
    if (page.clicksDelta < -0.2 && page.clicks > 100) {
      const lost     = Math.abs(Math.round(page.clicks * page.clicksDelta));
      const annualRev = Math.round(lost * cvr * aov * 12);
      signals.push({
        pageUrl: page.url, keyword: page.topKeyword, actionType: 'recover_lost_traffic',
        currentClicks: page.clicks, currentImpressions: page.impressions,
        currentPosition: page.avgPosition, currentCTR: page.ctr,
        currentConvRate: cvr, avgOrderValue: aov,
        projectedClicks: Math.round(page.clicks * 1.2),
        projectedConversions: Math.round(page.clicks * 1.2 * cvr),
        projectedRevenueGainMonthly: Math.round(lost * cvr * aov),
        projectedRevenueGainAnnual:  annualRev,
        confidence: 'high',
        confidenceReason: `Lost ${Math.abs(page.clicksDelta*100).toFixed(0)}% traffic in 28 days`,
        effortHours: 3, roiScore: Math.round(annualRev / 3),
        priority: 1,
        explanation: `⚠️ URGENT: Lost ${Math.abs(page.clicksDelta*100).toFixed(0)}% traffic in 28 days — ~${lost} clicks/month gone. That's $${annualRev.toLocaleString()}/year leaving. Act this week.`,
        evidencePoints: [
          `Traffic drop: ${Math.abs(page.clicksDelta*100).toFixed(0)}% in 28 days`,
          `Lost: ~${lost} clicks/month`,
          `At risk: $${annualRev.toLocaleString()}/year`,
        ],
        autoImplementable: false,
        implementationPlan: [
          'Check GSC for manual actions or coverage errors on this URL',
          'Confirm page is not accidentally set to noindex',
          'Compare current content to web archive — what changed?',
          'Check if a competitor published fresher content on this keyword',
          'Refresh: update year, statistics, add new FAQ section, add internal links',
        ],
      });
    }

    return signals;
  }

  // ─── KEYWORD OPPORTUNITY → REVENUE SIGNAL ────────────────────────────

  private opportunityToSignal(opp: KeywordOpportunity, ctx: BusinessContext): RevenueSignal | null {
    if (opp.kd > 70) return null;

    const estClicks    = Math.round(opp.volume * (CTR[3] ?? 0.104));
    const cvr          = opp.isTransactional ? ctx.conversionRate * 1.4 : ctx.conversionRate * 0.6;
    const revenueMonth = Math.round(estClicks * cvr * ctx.avgOrderValue);
    const annualRev    = revenueMonth * 12;
    const effort       = opp.pageType === 'comparison' ? 4 : opp.pageType === 'geo' ? 2 : 3;
    const roiScore     = Math.round(annualRev / effort);
    const winWeeks     = opp.kd < 25 ? '4–6' : opp.kd < 50 ? '8–12' : '16–24';

    return {
      pageUrl:    `https://${ctx.domain}/solutions/${this.toSlug(opp.keyword)}`,
      keyword:    opp.keyword,
      actionType: opp.pageType === 'comparison' ? 'comparison_page' : opp.pageType === 'geo' ? 'geo_page' : 'create_cluster_page',
      currentClicks: 0, currentImpressions: 0, currentPosition: 100, currentCTR: 0,
      currentConvRate: ctx.conversionRate, avgOrderValue: ctx.avgOrderValue,
      projectedClicks:             estClicks,
      projectedConversions:        Math.round(estClicks * cvr),
      projectedRevenueGainMonthly: revenueMonth,
      projectedRevenueGainAnnual:  annualRev,
      confidence:       opp.kd < 25 ? 'high' : opp.kd < 50 ? 'medium' : 'low',
      confidenceReason: `KD ${opp.kd}, ${opp.volume.toLocaleString()} searches/month`,
      effortHours: effort, roiScore,
      priority:    opp.kd < 20 ? 1 : opp.kd < 40 ? 2 : 3,
      explanation: `No page exists for "${opp.keyword}" (${opp.volume.toLocaleString()} searches/month, KD ${opp.kd}). Ranking at position 3 within ${winWeeks} weeks adds ~${estClicks.toLocaleString()} clicks/month = $${annualRev.toLocaleString()}/year.`,
      evidencePoints: [
        `Volume: ${opp.volume.toLocaleString()}/month`,
        `Difficulty: ${opp.kd} (${opp.kd < 25 ? 'easy win' : opp.kd < 50 ? 'moderate' : 'hard'})`,
        `Est. clicks at pos 3: ${estClicks.toLocaleString()}/month`,
        `At ${(cvr*100).toFixed(1)}% CVR × $${ctx.avgOrderValue} = $${revenueMonth.toLocaleString()}/month`,
      ],
      autoImplementable: true,
      implementationPlan: [
        `Create /solutions/${this.toSlug(opp.keyword)} (${opp.kd < 25 ? '1,200' : '2,000'}+ words)`,
        'Add FAQPage + SoftwareApplication schema',
        'Build 3 internal links from high-authority existing pages',
        'Submit URL to Google Search Console immediately',
        `Monitor ranking weekly — target position <10 within ${winWeeks} weeks`,
      ],
    };
  }

  buildWeeklyROIReport(
    actionsExecuted: { pageUrl: string; executedAt: Date; rolledBack: boolean; rollbackReason?: string }[],
    curr: GSCPageData[], prev: GSCPageData[], ctx: BusinessContext,
  ): WeeklyROIReport {
    const trafficGained = curr.reduce((s,p) => s+p.clicks, 0) - prev.reduce((s,p) => s+p.clicks, 0);
    const movements = curr.map(c => {
      const p = prev.find(x => x.url === c.url);
      return { keyword: c.topKeyword, before: p?.avgPosition ?? 100, after: c.avgPosition, delta: (p?.avgPosition ?? 100) - c.avgPosition };
    }).filter(m => Math.abs(m.delta) >= 1).sort((a,b) => b.delta - a.delta).slice(0, 10);

    return {
      weekStart:         actionsExecuted[0]?.executedAt ?? new Date(),
      weekEnd:           new Date(),
      actionsExecuted:   actionsExecuted.length,
      trafficGained,
      revenueAttributed: Math.round(Math.max(0, trafficGained) * ctx.conversionRate * ctx.avgOrderValue),
      rankingMovements:  movements,
      rollbacks:         actionsExecuted.filter(a => a.rolledBack).map(a => ({ page: a.pageUrl, reason: a.rollbackReason ?? 'Performance dropped >20%' })),
    };
  }

  private toSlug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
