import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { GSCConnector } from '../gsc/gsc.connector';

export interface GA4PageData {
  url: string; sessions: number; conversionRate: number;
  revenueTotal: number; bounceRate: number; avgSessionDuration: number;
}

export interface GA4BusinessContext {
  avgOrderValue: number; totalRevenue: number; totalSessions: number;
  overallConversionRate: number; topRevenuePages: { url: string; revenue: number }[];
}

@Injectable()
export class GA4Connector {
  private readonly logger = new Logger(GA4Connector.name);
  private readonly BASE = 'https://analyticsdata.googleapis.com/v1beta';

  constructor(private config: ConfigService, private prisma: PrismaService, private gsc: GSCConnector) {}

  async exchangeCode(userId: string, code: string, redirectUri: string): Promise<void> {
    // GA4 shares Google OAuth with GSC — same token covers both scopes
    await this.gsc.exchangeCode(userId, code, redirectUri);
    await this.gsc.saveCredential(userId, 'ga4', '', ''); // mark as connected
  }

  async fetchPageData(userId: string, propertyId: string): Promise<GA4PageData[]> {
    const token = await this.gsc.getToken(userId, 'gsc'); // shared Google token

    const res = await fetch(`${this.BASE}/properties/${propertyId}:runReport`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dateRanges: [{ startDate: '28daysAgo', endDate: 'yesterday' }],
        dimensions: [{ name: 'pagePath' }],
        metrics: [
          { name: 'sessions' },
          { name: 'conversions' },
          { name: 'totalRevenue' },
          { name: 'bounceRate' },
          { name: 'averageSessionDuration' },
        ],
        limit: 500,
      }),
    });

    if (!res.ok) throw new Error(`GA4 ${res.status}: ${(await res.text()).slice(0,200)}`);
    const data = await res.json() as any;

    return (data.rows ?? []).map((row: any) => {
      const [sessions, conversions, revenue, bounce, duration] = row.metricValues.map((m: any) => parseFloat(m.value));
      return {
        url: row.dimensionValues[0].value,
        sessions,
        conversionRate: sessions > 0 ? conversions / sessions : 0,
        revenueTotal:   revenue,
        bounceRate:     bounce,
        avgSessionDuration: duration,
      };
    });
  }

  async fetchBusinessContext(userId: string, propertyId: string): Promise<GA4BusinessContext> {
    const pages = await this.fetchPageData(userId, propertyId);
    const totalRevenue   = pages.reduce((s, p) => s + p.revenueTotal, 0);
    const totalSessions  = pages.reduce((s, p) => s + p.sessions, 0);
    const totalConvs     = pages.reduce((s, p) => s + p.sessions * p.conversionRate, 0);
    const avgOrderValue  = totalConvs > 0 ? totalRevenue / totalConvs : 50; // $50 fallback
    return {
      avgOrderValue,
      totalRevenue,
      totalSessions,
      overallConversionRate: totalSessions > 0 ? totalConvs / totalSessions : 0.02,
      topRevenuePages: pages.sort((a,b) => b.revenueTotal - a.revenueTotal).slice(0,10).map(p => ({ url: p.url, revenue: p.revenueTotal })),
    };
  }
}
