import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface AdsContext {
  spend: number; roas: number; topKeywords: { keyword: string; cpc: number; conversions: number }[];
  organicVsPaidRatio: number;
}

@Injectable()
export class AdsConnector {
  private readonly logger = new Logger(AdsConnector.name);

  constructor(private prisma: PrismaService) {}

  async fetchContext(userId: string): Promise<AdsContext> {
    const cred = await this.prisma.connectorCredential.findFirst({ where: { userId, type: { in: ['google_ads','meta_ads'] } } });
    if (!cred) return { spend: 0, roas: 0, topKeywords: [], organicVsPaidRatio: 1 };
    return cred.type === 'google_ads' ? this.fetchGoogleAds(cred.accessToken!, cred.metadata as any) : { spend: 0, roas: 0, topKeywords: [], organicVsPaidRatio: 1 };
  }

  private async fetchGoogleAds(token: string, meta: { customerId: string }): Promise<AdsContext> {
    const query = `SELECT campaign.name, metrics.cost_micros, metrics.conversions, metrics.roas FROM campaign WHERE segments.date DURING LAST_30_DAYS`;
    const res = await fetch(`https://googleads.googleapis.com/v16/customers/${meta.customerId}/googleAds:search`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'developer-token': '', 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) return { spend: 0, roas: 0, topKeywords: [], organicVsPaidRatio: 1 };
    const data  = await res.json() as any;
    const rows  = data.results ?? [];
    const spend = rows.reduce((s: number, r: any) => s + (r.metrics?.cost_micros ?? 0), 0) / 1_000_000;
    const roas  = rows.reduce((s: number, r: any) => s + (r.metrics?.roas ?? 0), 0) / (rows.length || 1);
    return { spend, roas, topKeywords: [], organicVsPaidRatio: 1 };
  }
}
