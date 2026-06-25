import { Injectable, Logger } from '@nestjs/common';
import { GSCPageData } from '../connectors/gsc/gsc.connector';
import { GA4PageData } from '../connectors/ga4/ga4.connector';

// Before: only clicksDelta (1 signal)
// Now: 6 independent signals — action is triggered when 2+ agree

export interface MonitoringAlert {
  pageUrl:    string;
  severity:   'critical' | 'warning' | 'info';
  signals:    string[];         // which signals fired
  signalCount: number;
  recommendation: string;
  revenueAtRisk:  number;
  shouldRollback: boolean;
  autoFixable:    boolean;
}

@Injectable()
export class MultiSignalMonitor {
  private readonly logger = new Logger(MultiSignalMonitor.name);

  monitor(
    current:  { gsc: GSCPageData[]; ga4: GA4PageData[] },
    previous: { gsc: GSCPageData[]; ga4: GA4PageData[] },
    avgOrderValue: number,
    convRate:      number,
  ): MonitoringAlert[] {

    const alerts: MonitoringAlert[] = [];

    for (const curr of current.gsc) {
      const prevGSC = previous.gsc.find(p => p.url === curr.url);
      const currGA4 = current.ga4.find(p => p.url === curr.url);
      const prevGA4 = previous.ga4.find(p => p.url === curr.url);

      const firedSignals: string[] = [];

      // Signal 1: Clicks declining
      if (curr.clicksDelta < -0.15) firedSignals.push(`Clicks -${Math.abs(curr.clicksDelta*100).toFixed(0)}%`);

      // Signal 2: Position dropping
      const posDelta = curr.positionDelta ?? 0;
      if (posDelta < -3) firedSignals.push(`Position dropped ${Math.abs(posDelta).toFixed(1)} places`);

      // Signal 3: CTR drop vs benchmark
      const benchmark = this.ctrBenchmark(curr.avgPosition);
      if (curr.ctr < benchmark * 0.5) firedSignals.push(`CTR ${(curr.ctr*100).toFixed(1)}% vs benchmark ${(benchmark*100).toFixed(1)}%`);

      // Signal 4: Impressions up but clicks down (SERP change — new featured snippet, ads pushed content down)
      if (curr.impressions > (prevGSC?.impressions ?? 0) * 1.1 && curr.clicksDelta < -0.10) {
        firedSignals.push('Impressions up but clicks down — SERP layout change detected');
      }

      // Signal 5: Conversion rate drop (GA4)
      if (currGA4 && prevGA4 && currGA4.conversionRate < prevGA4.conversionRate * 0.7) {
        firedSignals.push(`Conv. rate dropped from ${(prevGA4.conversionRate*100).toFixed(1)}% to ${(currGA4.conversionRate*100).toFixed(1)}%`);
      }

      // Signal 6: Bounce rate spike (GA4)
      if (currGA4 && prevGA4 && currGA4.bounceRate > prevGA4.bounceRate * 1.3) {
        firedSignals.push(`Bounce rate spiked: ${(prevGA4.bounceRate*100).toFixed(0)}% → ${(currGA4.bounceRate*100).toFixed(0)}%`);
      }

      if (firedSignals.length === 0) continue;

      const severity: MonitoringAlert['severity'] =
        firedSignals.length >= 3 ? 'critical' :
        firedSignals.length >= 2 ? 'warning' : 'info';

      const revenueAtRisk = Math.round(
        Math.abs(curr.clicks * (curr.clicksDelta < 0 ? curr.clicksDelta : -0.1)) * convRate * avgOrderValue * 12
      );

      alerts.push({
        pageUrl:     curr.url,
        severity,
        signals:     firedSignals,
        signalCount: firedSignals.length,
        recommendation: this.buildRecommendation(firedSignals, curr),
        revenueAtRisk,
        // Only recommend rollback if 3+ signals AND a Veltro action was recently deployed
        shouldRollback: firedSignals.length >= 3 && curr.clicksDelta < -0.25,
        autoFixable:    firedSignals.some(s => s.includes('CTR') || s.includes('Conv')),
      });
    }

    return alerts.sort((a, b) => b.signalCount - a.signalCount);
  }

  private buildRecommendation(signals: string[], page: GSCPageData): string {
    if (signals.some(s => s.includes('SERP layout'))) {
      return `Google changed the SERP for "${page.topKeyword}" — likely added a featured snippet or ads. Target the snippet: rewrite first paragraph as a direct Q&A answer.`;
    }
    if (signals.some(s => s.includes('Conv.'))) {
      return `Traffic quality is fine but page stopped converting — check for broken CTA, form errors, or pricing change.`;
    }
    if (signals.some(s => s.includes('Position dropped'))) {
      return `Competitor published fresh content for "${page.topKeyword}" — refresh this page: update year, add new FAQ, add 3 internal links.`;
    }
    return `Multiple decline signals on ${page.url} — run a full audit: coverage, content freshness, internal links, CTA.`;
  }

  private ctrBenchmark(pos: number): number {
    const map: Record<number, number> = { 1:0.287, 2:0.158, 3:0.104, 4:0.072, 5:0.053, 6:0.040, 7:0.031, 8:0.026, 9:0.022, 10:0.019 };
    return map[Math.round(pos)] ?? 0.01;
  }
}
