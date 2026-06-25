import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../encryption/encryption.service';

export type ConnectorType =
  | 'gsc' | 'ga4' | 'bing' | 'ahrefs' | 'semrush'
  | 'hubspot' | 'salesforce'
  | 'shopify' | 'woocommerce' | 'stripe'
  | 'google_ads' | 'meta_ads' | 'youtube';

export interface ConnectorHealth {
  type:          ConnectorType;
  status:        'CONNECTED' | 'EXPIRED' | 'ERROR' | 'NOT_CONNECTED';
  label:         string;
  icon:          string;
  lastSyncAt?:   Date;
  errorMessage?: string;
  dataPoints:    string[];
  revenueImpact: 'critical' | 'high' | 'medium';
}

const CONNECTOR_META: Record<ConnectorType, Pick<ConnectorHealth, 'label'|'icon'|'dataPoints'|'revenueImpact'>> = {
  gsc:         { label:'Google Search Console', icon:'🔍', revenueImpact:'critical', dataPoints:['clicks','impressions','CTR','avg position','ranking delta'] },
  ga4:         { label:'Google Analytics 4',    icon:'📊', revenueImpact:'critical', dataPoints:['sessions','conversion rate','revenue per page','bounce rate'] },
  bing:        { label:'Bing Webmaster Tools',  icon:'🔎', revenueImpact:'medium',   dataPoints:['Bing clicks','Bing impressions','Bing rankings'] },
  ahrefs:      { label:'Ahrefs',                icon:'🔗', revenueImpact:'high',     dataPoints:['domain rating','backlinks','competitor keywords','content gap'] },
  semrush:     { label:'SEMrush',               icon:'📈', revenueImpact:'high',     dataPoints:['organic positions','competitor traffic','keyword magic'] },
  hubspot:     { label:'HubSpot CRM',           icon:'🧲', revenueImpact:'high',     dataPoints:['deal value','lead source','customer LTV'] },
  salesforce:  { label:'Salesforce',            icon:'☁️',  revenueImpact:'high',     dataPoints:['opportunity source','closed deals','pipeline by channel'] },
  shopify:     { label:'Shopify',               icon:'🛍️',  revenueImpact:'critical', dataPoints:['AOV','conversion rate by page','product revenue'] },
  woocommerce: { label:'WooCommerce',           icon:'🛒',  revenueImpact:'critical', dataPoints:['orders','AOV','conversion rate'] },
  stripe:      { label:'Stripe',                icon:'💳',  revenueImpact:'high',     dataPoints:['MRR','ARR','churn','LTV'] },
  google_ads:  { label:'Google Ads',            icon:'📣',  revenueImpact:'medium',   dataPoints:['ROAS','CPC','search terms','quality score'] },
  meta_ads:    { label:'Meta Ads',              icon:'👥',  revenueImpact:'medium',   dataPoints:['ROAS','CPM','conversion events'] },
  youtube:     { label:'YouTube Studio',        icon:'▶️',  revenueImpact:'medium',   dataPoints:['views','watch time','traffic source'] },
};

@Injectable()
export class ConnectorRegistryService {
  private readonly logger = new Logger(ConnectorRegistryService.name);

  constructor(
    private prisma:      PrismaService,
    private config:      ConfigService,
    private encryption:  EncryptionService,
  ) {}

  async getConnectorHealth(userId: string): Promise<ConnectorHealth[]> {
    const stored = await this.prisma.connectorCredential.findMany({
      where:  { userId },
      select: { type: true, status: true, lastSyncAt: true, errorMessage: true },
    });

    return (Object.keys(CONNECTOR_META) as ConnectorType[]).map(type => {
      const cred = stored.find((s: any) => s.type === type);
      return {
        ...CONNECTOR_META[type],
        type,
        status:       (cred?.status as ConnectorHealth['status']) ?? 'NOT_CONNECTED',
        lastSyncAt:   cred?.lastSyncAt ?? undefined,
        errorMessage: cred?.errorMessage ?? undefined,
      };
    });
  }

  getRevenueConfidence(connectors: ConnectorHealth[]): { score: number; explanation: string } {
    const connected = connectors.filter(c => c.status === 'CONNECTED');
    const critical  = connected.filter(c => c.revenueImpact === 'critical').length;
    const high      = connected.filter(c => c.revenueImpact === 'high').length;

    const score = critical >= 2 ? (high >= 1 ? 95 : 85) : critical === 1 ? 65 : 30;

    const explanation =
      score >= 95 ? 'Revenue estimates use your real conversion and order data' :
      score >= 85 ? 'Estimates use real traffic data — connect your store for exact AOV' :
      score >= 65 ? 'Estimates use real traffic but assumed conversion rate — connect GA4' :
      'Estimates are heuristic — connect GSC + GA4 for accurate $ figures';

    return { score, explanation };
  }

  // Save plain API key (encrypted)
  async saveApiKey(userId: string, type: ConnectorType, apiKey: string): Promise<void> {
    const encKey = this.encryption.encrypt(apiKey);
    await this.prisma.connectorCredential.upsert({
      where:  { userId_type: { userId, type } },
      create: { userId, type, status: 'CONNECTED', apiKey: encKey },
      update: { status: 'CONNECTED', apiKey: encKey, lastSyncAt: new Date() },
    });
  }

  // Get decrypted API key
  async getApiKey(userId: string, type: ConnectorType): Promise<string | null> {
    const cred = await this.prisma.connectorCredential.findFirst({ where: { userId, type } });
    if (!cred?.apiKey) return null;
    return this.encryption.decryptSafe(cred.apiKey);
  }

  // Google OAuth URL for GSC + GA4 (shared scope)
  getGoogleOAuthUrl(userId: string, redirectUri: string): string {
    const params = new URLSearchParams({
      client_id:     this.config.get('GOOGLE_CLIENT_ID', ''),
      redirect_uri:  redirectUri,
      response_type: 'code',
      scope:         [
        'https://www.googleapis.com/auth/webmasters.readonly',
        'https://www.googleapis.com/auth/analytics.readonly',
      ].join(' '),
      access_type:   'offline',
      prompt:        'consent',
      state:         Buffer.from(JSON.stringify({ userId, connectors: ['gsc','ga4'] })).toString('base64'),
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }

  // Shopify OAuth URL
  getShopifyOAuthUrl(shop: string, userId: string, redirectUri: string): string {
    const params = new URLSearchParams({
      client_id:    this.config.get('SHOPIFY_CLIENT_ID', ''),
      scope:        'read_orders,read_products,read_analytics',
      redirect_uri: redirectUri,
      state:        Buffer.from(JSON.stringify({ userId, shop })).toString('base64'),
    });
    return `https://${shop}/admin/oauth/authorize?${params}`;
  }
}
