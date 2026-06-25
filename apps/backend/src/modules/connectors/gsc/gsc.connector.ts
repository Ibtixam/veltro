import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

export interface GSCPageData {
  url: string; topKeyword: string;
  clicks: number; impressions: number; ctr: number; avgPosition: number;
  clicksDelta: number;   // fraction: -0.2 = lost 20% vs prev period
  positionDelta: number; // positive = improved (moved up)
}

@Injectable()
export class GSCConnector {
  private readonly logger = new Logger(GSCConnector.name);
  private readonly BASE = 'https://searchconsole.googleapis.com/webmasters/v3';

  constructor(private config: ConfigService, private prisma: PrismaService) {}

  async exchangeCode(userId: string, code: string, redirectUri: string): Promise<void> {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, redirect_uri: redirectUri, grant_type: 'authorization_code',
        client_id: this.config.get('GOOGLE_CLIENT_ID',''), client_secret: this.config.get('GOOGLE_CLIENT_SECRET','') }),
    });
    const t = await res.json() as any;
    if (t.error) throw new Error(`GSC OAuth: ${t.error_description}`);
    await this.saveCredential(userId, 'gsc', t.access_token, t.refresh_token);
  }

  async fetchPageData(userId: string, domain: string): Promise<GSCPageData[]> {
    const token   = await this.getToken(userId, 'gsc');
    const siteUrl = `sc-domain:${domain.replace(/^https?:\/\/(www\.)?/, '')}`;
    const [curr, prev] = await Promise.all([
      this.queryGSC(token, siteUrl, this.daysAgo(28), this.daysAgo(1)),
      this.queryGSC(token, siteUrl, this.daysAgo(56), this.daysAgo(29)),
    ]);
    return this.mergeWithDelta(curr, prev);
  }

  private async queryGSC(token: string, siteUrl: string, start: string, end: string): Promise<any[]> {
    const res = await fetch(`${this.BASE}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ startDate: start, endDate: end, dimensions: ['page','query'], rowLimit: 500 }),
    });
    if (!res.ok) throw new Error(`GSC ${res.status}: ${(await res.text()).slice(0,200)}`);
    return (await res.json() as any).rows ?? [];
  }

  private mergeWithDelta(curr: any[], prev: any[]): GSCPageData[] {
    const pageMap = new Map<string, any>();
    for (const row of curr) {
      const [url, kw] = row.keys;
      const ex = pageMap.get(url);
      if (!ex || row.clicks > (ex.topKwClicks ?? 0)) {
        pageMap.set(url, { ...(ex ?? {}), url, topKeyword: kw, topKwClicks: row.clicks,
          clicks: (ex?.clicks??0) + row.clicks, impressions: (ex?.impressions??0) + row.impressions,
          ctr: row.ctr, avgPosition: row.position });
      } else { ex.clicks += row.clicks; ex.impressions += row.impressions; }
    }
    const prevClicks = new Map<string, number>();
    const prevPos    = new Map<string, number>();
    for (const row of prev) {
      const [url] = row.keys;
      prevClicks.set(url, (prevClicks.get(url)??0) + row.clicks);
      prevPos.set(url, row.position);
    }
    return [...pageMap.values()].map(p => ({
      ...p,
      clicksDelta:   prevClicks.get(p.url) ? (p.clicks - prevClicks.get(p.url)!) / prevClicks.get(p.url)! : 0,
      positionDelta: prevPos.get(p.url) ? prevPos.get(p.url)! - p.avgPosition : 0,
    }));
  }

  async getToken(userId: string, type: string): Promise<string> {
    const cred = await this.prisma.connectorCredential.findFirst({ where: { userId, type } });
    if (!cred?.refreshToken) throw new Error(`${type} not connected for user ${userId}`);
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ refresh_token: cred.refreshToken, grant_type: 'refresh_token',
        client_id: this.config.get('GOOGLE_CLIENT_ID',''), client_secret: this.config.get('GOOGLE_CLIENT_SECRET','') }),
    });
    const t = await res.json() as any;
    await this.prisma.connectorCredential.update({ where: { id: cred.id }, data: { accessToken: t.access_token, lastSyncAt: new Date() } });
    return t.access_token;
  }

  async saveCredential(userId: string, type: string, accessToken: string, refreshToken?: string): Promise<void> {
    await this.prisma.connectorCredential.upsert({
      where:  { userId_type: { userId, type } },
      create: { userId, type, status: 'connected', accessToken, refreshToken },
      update: { status: 'connected', accessToken, refreshToken, lastSyncAt: new Date() },
    });
  }

  private daysAgo(n: number) { const d = new Date(); d.setDate(d.getDate()-n); return d.toISOString().split('T')[0]; }
}
