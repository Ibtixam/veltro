import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface AhrefsKeywordData {
  keyword: string; volume: number; kd: number; position: number; url: string;
  trafficShare: number; cpc: number;
}

export interface AhrefsCompetitorGap {
  keyword: string; volume: number; kd: number;
  competitorRanks: { domain: string; position: number }[];
  yourPosition: number | null;
}

@Injectable()
export class AhrefsConnector {
  private readonly logger = new Logger(AhrefsConnector.name);
  private readonly BASE = 'https://api.ahrefs.com/v3';

  constructor(private prisma: PrismaService) {}

  async saveApiKey(userId: string, apiKey: string): Promise<void> {
    await this.prisma.connectorCredential.upsert({
      where:  { userId_type: { userId, type: 'ahrefs' } },
      create: { userId, type: 'ahrefs', status: 'connected', apiKey },
      update: { status: 'connected', apiKey, lastSyncAt: new Date() },
    });
  }

  async fetchRankingKeywords(userId: string, domain: string): Promise<AhrefsKeywordData[]> {
    const key = await this.getKey(userId, 'ahrefs');
    const res = await fetch(`${this.BASE}/site-explorer/organic-keywords?select=keyword,volume,keyword_difficulty,position,url,traffic,cpc&target=${domain}&mode=domain&limit=500`, {
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`Ahrefs ${res.status}`);
    const data = await res.json() as any;
    return (data.keywords ?? []).map((k: any) => ({
      keyword: k.keyword, volume: k.volume, kd: k.keyword_difficulty,
      position: k.position, url: k.url, trafficShare: k.traffic, cpc: k.cpc,
    }));
  }

  // Momentum: keywords gaining positions fast (rising signal)
  async fetchMomentumKeywords(userId: string, domain: string): Promise<AhrefsKeywordData[]> {
    const all = await this.fetchRankingKeywords(userId, domain);
    // Ahrefs rising: filter position < 20 and volume > 100
    return all.filter(k => k.position < 20 && k.volume > 100 && k.kd < 40)
              .sort((a, b) => a.position - b.position)
              .slice(0, 20);
  }

  async fetchCompetitorGaps(userId: string, domain: string, competitors: string[]): Promise<AhrefsCompetitorGap[]> {
    const key = await this.getKey(userId, 'ahrefs');
    const targets = [domain, ...competitors.slice(0,3)].join(',');
    const res = await fetch(`${this.BASE}/site-explorer/content-gap?select=keyword,volume,keyword_difficulty&targets=${targets}&mode=domain&limit=200`, {
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`Ahrefs gap ${res.status}`);
    const data = await res.json() as any;
    return (data.keywords ?? []).map((k: any) => ({
      keyword: k.keyword, volume: k.volume, kd: k.keyword_difficulty,
      competitorRanks: [], yourPosition: null,
    }));
  }

  private async getKey(userId: string, type: string): Promise<string> {
    const cred = await this.prisma.connectorCredential.findFirst({ where: { userId, type } });
    if (!cred?.apiKey) throw new Error(`${type} API key not connected`);
    return cred.apiKey;
  }
}
