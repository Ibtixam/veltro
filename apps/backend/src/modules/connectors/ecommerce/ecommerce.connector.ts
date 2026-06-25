import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface EcommerceContext {
  avgOrderValue: number; conversionRate: number; totalRevenue: number;
  topProducts: { name: string; revenue: number }[];
  cartAbandonmentRate: number;
}

@Injectable()
export class EcommerceConnector {
  private readonly logger = new Logger(EcommerceConnector.name);

  constructor(private prisma: PrismaService) {}

  async fetchContext(userId: string): Promise<EcommerceContext> {
    const cred = await this.prisma.connectorCredential.findFirst({ where: { userId, type: { in: ['shopify','woocommerce','stripe'] } } });
    if (!cred) throw new Error('No e-commerce connector found');
    if (cred.type === 'shopify')    return this.fetchShopify(cred.accessToken!, cred.metadata as any);
    if (cred.type === 'woocommerce') return this.fetchWooCommerce(cred.apiKey!, cred.apiSecret!, cred.metadata as any);
    return this.fetchStripe(cred.apiKey!);
  }

  private async fetchShopify(token: string, meta: { shop: string }): Promise<EcommerceContext> {
    const [ordersRes, productsRes] = await Promise.all([
      fetch(`https://${meta.shop}/admin/api/2024-01/orders.json?status=any&limit=250&created_at_min=${this.daysAgo(30)}`, {
        headers: { 'X-Shopify-Access-Token': token },
      }),
      fetch(`https://${meta.shop}/admin/api/2024-01/products.json?limit=50`, {
        headers: { 'X-Shopify-Access-Token': token },
      }),
    ]);

    const { orders } = await ordersRes.json() as any;
    const totalRev = orders.reduce((s: number, o: any) => s + parseFloat(o.total_price ?? '0'), 0);
    const avgOV    = orders.length > 0 ? totalRev / orders.length : 0;

    return {
      avgOrderValue:       avgOV,
      conversionRate:      0.025, // Shopify doesn't expose CVR directly — use GA4
      totalRevenue:        totalRev,
      topProducts:         [],
      cartAbandonmentRate: 0.70,  // industry average fallback
    };
  }

  private async fetchWooCommerce(key: string, secret: string, meta: { url: string }): Promise<EcommerceContext> {
    const auth = Buffer.from(`${key}:${secret}`).toString('base64');
    const res  = await fetch(`${meta.url}/wp-json/wc/v3/orders?per_page=100&after=${this.daysAgo(30)}T00:00:00`, {
      headers: { Authorization: `Basic ${auth}` },
    });
    if (!res.ok) throw new Error(`WooCommerce ${res.status}`);
    const orders = await res.json() as any;
    const total  = orders.reduce((s: number, o: any) => s + parseFloat(o.total ?? '0'), 0);
    return { avgOrderValue: orders.length ? total/orders.length : 0, conversionRate: 0.02, totalRevenue: total, topProducts: [], cartAbandonmentRate: 0.70 };
  }

  private async fetchStripe(apiKey: string): Promise<EcommerceContext> {
    const res = await fetch(`https://api.stripe.com/v1/payment_intents?limit=100&created[gte]=${Math.floor((Date.now()-30*86400000)/1000)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) throw new Error(`Stripe ${res.status}`);
    const data  = await res.json() as any;
    const paid  = (data.data ?? []).filter((p: any) => p.status === 'succeeded');
    const total = paid.reduce((s: number, p: any) => s + p.amount, 0) / 100;
    return { avgOrderValue: paid.length ? total/paid.length : 0, conversionRate: 0.025, totalRevenue: total, topProducts: [], cartAbandonmentRate: 0.65 };
  }

  private daysAgo(n: number) { return new Date(Date.now()-n*86400000).toISOString().split('T')[0]; }
}
