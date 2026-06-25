import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface BingPageData {
  url: string; topKeyword: string;
  clicks: number; impressions: number; ctr: number; avgPosition: number;
}

@Injectable()
export class BingConnector {
  private readonly logger = new Logger(BingConnector.name);
  private readonly BASE = 'https://ssl.bing.com/webmaster/api.svc/json';

  constructor(private prisma: PrismaService) {}

  // Bing uses API key auth (no OAuth) — customer pastes key from Bing WMT settings
  async saveApiKey(userId: string, apiKey: string): Promise<void> {
    await this.prisma.connectorCredential.upsert({
      where:  { userId_type: { userId, type: 'bing' } },
      create: { userId, type: 'bing', status: 'connected', apiKey },
      update: { status: 'connected', apiKey, lastSyncAt: new Date() },
    });
  }

  async fetchPageData(userId: string, siteUrl: string): Promise<BingPageData[]> {
    const cred = await this.prisma.connectorCredential.findFirst({ where: { userId, type: 'bing' } });
    if (!cred?.apiKey) throw new Error('Bing not connected');

    const end   = new Date().toISOString().split('T')[0];
    const start = new Date(Date.now() - 28*86400000).toISOString().split('T')[0];

    const res = await fetch(
      `${this.BASE}/GetPageStats?apikey=${cred.apiKey}&siteUrl=${encodeURIComponent(siteUrl)}&page=${encodeURIComponent(siteUrl)}&startDate=${start}&endDate=${end}`,
      { headers: { Accept: 'application/json' } }
    );

    if (!res.ok) throw new Error(`Bing ${res.status}`);
    const data = await res.json() as any;

    return (data.d ?? []).map((row: any) => ({
      url:         siteUrl,
      topKeyword:  row.Query ?? '',
      clicks:      row.Clicks ?? 0,
      impressions: row.Impressions ?? 0,
      ctr:         row.Ctr ?? 0,
      avgPosition: row.AvgImpressionsPos ?? 0,
    }));
  }
}
