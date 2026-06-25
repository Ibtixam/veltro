import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface CRMDeal { source: string; value: number; stage: string; closedAt?: Date; }
export interface CRMContext { avgDealValue: number; totalRevenue: number; topSources: { source: string; revenue: number }[]; }

@Injectable()
export class CRMConnector {
  private readonly logger = new Logger(CRMConnector.name);

  constructor(private prisma: PrismaService) {}

  async fetchContext(userId: string, domain: string): Promise<CRMContext> {
    const cred = await this.prisma.connectorCredential.findFirst({ where: { userId, type: { in: ['hubspot','salesforce'] } } });
    if (!cred) throw new Error('No CRM connected');
    return cred.type === 'hubspot'
      ? this.fetchHubSpot(cred.apiKey!, cred.accessToken!)
      : this.fetchSalesforce(cred.accessToken!, cred.metadata as any);
  }

  private async fetchHubSpot(apiKey: string, token: string): Promise<CRMContext> {
    const auth = token || apiKey;
    const res = await fetch('https://api.hubapi.com/crm/v3/objects/deals?properties=amount,dealstage,closedate,hs_analytics_source&limit=200', {
      headers: { Authorization: `Bearer ${auth}` },
    });
    if (!res.ok) throw new Error(`HubSpot ${res.status}`);
    const data = await res.json() as any;
    const deals: CRMDeal[] = (data.results ?? []).map((d: any) => ({
      source:  d.properties.hs_analytics_source ?? 'unknown',
      value:   parseFloat(d.properties.amount ?? '0'),
      stage:   d.properties.dealstage,
      closedAt: d.properties.closedate ? new Date(d.properties.closedate) : undefined,
    }));
    return this.aggregate(deals);
  }

  private async fetchSalesforce(token: string, meta: { instanceUrl: string }): Promise<CRMContext> {
    const res = await fetch(`${meta.instanceUrl}/services/data/v58.0/query?q=SELECT+Amount,StageName,LeadSource+FROM+Opportunity+WHERE+StageName='Closed+Won'+LIMIT+200`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Salesforce ${res.status}`);
    const data = await res.json() as any;
    const deals: CRMDeal[] = (data.records ?? []).map((d: any) => ({
      source: d.LeadSource ?? 'unknown', value: d.Amount ?? 0, stage: d.StageName,
    }));
    return this.aggregate(deals);
  }

  private aggregate(deals: CRMDeal[]): CRMContext {
    const total = deals.reduce((s, d) => s + d.value, 0);
    const bySource = new Map<string, number>();
    for (const d of deals) bySource.set(d.source, (bySource.get(d.source)??0) + d.value);
    return {
      avgDealValue: deals.length > 0 ? total / deals.length : 0,
      totalRevenue: total,
      topSources: [...bySource.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5).map(([source,revenue])=>({source,revenue})),
    };
  }
}
