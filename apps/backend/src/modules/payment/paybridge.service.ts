import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentProvider, PaymentStatus, PlanTier, BillingCycle } from '@prisma/client';
import * as crypto from 'crypto';

// ─── CURRENCY MAP ──────────────────────────────────────────────────────────
const CURRENCY_MAP: Record<string, string> = {
  CM: 'XAF', GA: 'XAF', CF: 'XAF', CG: 'XAF', TD: 'XAF',
  SN: 'XOF', CI: 'XOF', BF: 'XOF', ML: 'XOF', BJ: 'XOF', NE: 'XOF', TG: 'XOF',
  FR: 'EUR', BE: 'EUR', CH: 'EUR', DE: 'EUR', ES: 'EUR', PT: 'EUR', IT: 'EUR',
  CA: 'CAD', US: 'USD', GB: 'GBP',
  GH: 'GHS', NG: 'NGN', KE: 'KES', TZ: 'TZS',
};

// ─── PLAN PRICING (cents, per currency) ────────────────────────────────────
const PLAN_PRICING: Record<PlanTier, Record<string, number>> = {
  STARTER: {
    XAF: 1900000, XOF: 1900000, EUR: 2900, CAD: 3900, USD: 2900, GHS: 35000,
    NGN: 44000, KES: 3900, GBP: 2400,
  },
  PRO: {
    XAF: 4900000, XOF: 4900000, EUR: 7900, CAD: 10500, USD: 7900, GHS: 95000,
    NGN: 120000, KES: 10500, GBP: 6400,
  },
  AGENCY: {
    XAF: 15000000, XOF: 15000000, EUR: 24900, CAD: 33000, USD: 24900, GHS: 295000,
    NGN: 370000, KES: 33000, GBP: 19900,
  },
  ENTERPRISE: {
    XAF: 0, XOF: 0, EUR: 0, CAD: 0, USD: 0, GHS: 0, NGN: 0, KES: 0, GBP: 0,
  },
  LIFETIME: {
    XAF: 32000000, XOF: 32000000, EUR: 49900, CAD: 67000, USD: 49900, GHS: 580000,
    NGN: 720000, KES: 65000, GBP: 39900,
  },
};

export interface PayBridgeCheckoutParams {
  userId: string;
  email: string;
  name: string;
  plan: PlanTier;
  billingCycle: BillingCycle;
  countryCode: string;
  phoneNumber?: string;
  domain?: string;
  returnUrl: string;
  cancelUrl: string;
}

export interface PayBridgeCheckoutResult {
  checkoutUrl: string;
  sessionId: string;
  provider: PaymentProvider;
  currency: string;
  amountCents: number;
}

export interface MobileMoneyParams {
  userId: string;
  email: string;
  plan: PlanTier;
  provider: 'ORANGE_MONEY' | 'MTN_MOMO';
  phoneNumber: string;
  countryCode: string;
  returnUrl: string;
}

@Injectable()
export class PayBridgeService {
  private readonly logger = new Logger(PayBridgeService.name);
  private readonly apiUrl: string;
  private readonly apiKey: string;
  private readonly secret: string;
  private readonly webhookSecret: string;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.apiUrl = this.config.get<string>('PAYBRIDGE_API_URL', 'https://api.paybridgeafrica.com/v1');
    this.apiKey = this.config.get<string>('PAYBRIDGE_API_KEY', '');
    this.secret = this.config.get<string>('PAYBRIDGE_SECRET', '');
    this.webhookSecret = this.config.get<string>('PAYBRIDGE_WEBHOOK_SECRET', '');
  }

  detectCurrency(countryCode: string): string {
    return CURRENCY_MAP[countryCode.toUpperCase()] ?? 'EUR';
  }

  getPriceForPlan(plan: PlanTier, currency: string, cycle: BillingCycle): number {
    const base = PLAN_PRICING[plan][currency] ?? PLAN_PRICING[plan]['EUR'];
    if (cycle === BillingCycle.ANNUAL) return Math.round(base * 10); // 2 months free
    return base;
  }

  formatPrice(amountCents: number, currency: string): string {
    const amount = amountCents / 100;
    try {
      return new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(amount);
    } catch {
      return `${amount} ${currency}`;
    }
  }

  async createCheckoutSession(params: PayBridgeCheckoutParams): Promise<PayBridgeCheckoutResult> {
    const currency = this.detectCurrency(params.countryCode);
    const amountCents = this.getPriceForPlan(params.plan, currency, params.billingCycle);

    // Stripe for non-African currencies
    if (!['XAF', 'XOF', 'GHS', 'NGN', 'KES', 'TZS'].includes(currency)) {
      return this.createStripeCheckoutSession(params, currency, amountCents);
    }

    const payload = {
      merchant_key: this.apiKey,
      amount: amountCents / 100,
      currency,
      customer: { email: params.email, name: params.name, phone: params.phoneNumber },
      metadata: {
        userId: params.userId,
        plan: params.plan,
        billingCycle: params.billingCycle,
        domain: params.domain ?? '',
        source: 'veltro',
      },
      return_url: params.returnUrl,
      cancel_url: params.cancelUrl,
      description: `Veltro — Plan ${params.plan}`,
    };

    try {
      const res = await fetch(`${this.apiUrl}/checkout/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': this.apiKey,
          'X-Signature': this.generateSignature(payload),
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        this.logger.error(`PayBridge error: ${await res.text()}`);
        return this.createStripeCheckoutSession(params, 'EUR', PLAN_PRICING[params.plan]['EUR']);
      }

      const data = await res.json() as any;
      return {
        checkoutUrl: data.checkout_url,
        sessionId: data.session_id,
        provider: PaymentProvider.PAYBRIDGE_AFRICA,
        currency,
        amountCents,
      };
    } catch (err) {
      this.logger.error(`PayBridge connection failed, falling back to Stripe: ${err}`);
      return this.createStripeCheckoutSession(params, 'EUR', PLAN_PRICING[params.plan]['EUR']);
    }
  }

  private async createStripeCheckoutSession(
    params: PayBridgeCheckoutParams,
    currency: string,
    amountCents: number,
  ): Promise<PayBridgeCheckoutResult> {
    const stripeKey = this.config.get<string>('STRIPE_SECRET_KEY', '');
    if (!stripeKey) throw new BadRequestException('Stripe not configured');

    const formData = new URLSearchParams({
      'payment_method_types[]': 'card',
      'line_items[0][price_data][currency]': currency.toLowerCase(),
      'line_items[0][price_data][unit_amount]': String(amountCents),
      'line_items[0][price_data][product_data][name]': `Veltro ${params.plan}`,
      'line_items[0][quantity]': '1',
      mode: params.billingCycle === 'LIFETIME' ? 'payment' : 'subscription',
      customer_email: params.email,
      'metadata[userId]': params.userId,
      'metadata[plan]': params.plan,
      'metadata[billingCycle]': params.billingCycle,
      success_url: params.returnUrl,
      cancel_url: params.cancelUrl,
    });

    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    const data = await res.json() as any;
    if (data.error) throw new BadRequestException(data.error.message);

    return {
      checkoutUrl: data.url,
      sessionId: data.id,
      provider: PaymentProvider.STRIPE,
      currency,
      amountCents,
    };
  }

  async initiateMobileMoney(params: MobileMoneyParams): Promise<{ reference: string; instructions: string }> {
    const currency = this.detectCurrency(params.countryCode);
    const amountCents = this.getPriceForPlan(params.plan, currency, BillingCycle.MONTHLY);

    if (params.provider === 'ORANGE_MONEY') {
      return this.initiateOrangeMoney(params, currency, amountCents);
    }
    return this.initiateMTNMomo(params, currency, amountCents);
  }

  private async initiateOrangeMoney(
    params: MobileMoneyParams, currency: string, amountCents: number,
  ): Promise<{ reference: string; instructions: string }> {
    const key = this.config.get<string>('ORANGE_MONEY_MERCHANT_KEY', '');
    const apiUrl = this.config.get<string>('ORANGE_MONEY_API_URL', '');

    const payload = {
      merchant_key: key,
      currency,
      order_id: `VELTRO-${Date.now()}`,
      amount: amountCents / 100,
      return_url: params.returnUrl,
      cancel_url: '',
      notif_url: `${this.config.get('APP_URL')}/api/webhook/orange-money`,
      lang: 'fr',
      reference: `Veltro ${params.plan}`,
    };

    const res = await fetch(`${apiUrl}/webpayment`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json() as any;
    return {
      reference: data.pay_token ?? payload.order_id,
      instructions: `Composez #150*50# sur Orange Money et entrez le code: ${data.pay_token ?? 'voir SMS'}`,
    };
  }

  private async initiateMTNMomo(
    params: MobileMoneyParams, currency: string, amountCents: number,
  ): Promise<{ reference: string; instructions: string }> {
    const subscriptionKey = this.config.get<string>('MTN_MOMO_SUBSCRIPTION_KEY', '');
    const apiUrl = this.config.get<string>('MTN_MOMO_API_URL', '');
    const reference = `VELTRO-${Date.now()}`;

    await fetch(`${apiUrl}/collection/v1_0/requesttopay`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await this.getMTNToken()}`,
        'X-Reference-Id': reference,
        'X-Target-Environment': 'production',
        'Ocp-Apim-Subscription-Key': subscriptionKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: String(amountCents / 100),
        currency,
        externalId: reference,
        payer: { partyIdType: 'MSISDN', partyId: params.phoneNumber },
        payerMessage: `Veltro ${params.plan}`,
        payeeNote: 'Veltro subscription',
      }),
    });

    return {
      reference,
      instructions: `Confirmez le paiement de ${this.formatPrice(amountCents, currency)} sur votre application MTN Mobile Money. Ref: ${reference}`,
    };
  }

  private async getMTNToken(): Promise<string> {
    const apiUser = this.config.get<string>('MTN_MOMO_API_USER', '');
    const apiKey = this.config.get<string>('MTN_MOMO_API_KEY', '');
    const subscriptionKey = this.config.get<string>('MTN_MOMO_SUBSCRIPTION_KEY', '');
    const apiUrl = this.config.get<string>('MTN_MOMO_API_URL', '');
    const credentials = Buffer.from(`${apiUser}:${apiKey}`).toString('base64');

    const res = await fetch(`${apiUrl}/collection/token/`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Ocp-Apim-Subscription-Key': subscriptionKey,
      },
    });
    const data = await res.json() as any;
    return data.access_token;
  }

  // ─── WEBHOOK VERIFICATION (timing-safe, length-safe) ──────────────────
  verifyWebhookSignature(payload: string, signature: string): boolean {
    if (!signature || !this.webhookSecret) return false;
    const expected = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(payload)
      .digest('hex');
    // Both must be same length for timingSafeEqual
    const expectedBuf = Buffer.from(expected, 'hex');
    try {
      const sigBuf = Buffer.from(signature.replace(/^sha256=/, ''), 'hex');
      if (expectedBuf.length !== sigBuf.length) return false;
      return crypto.timingSafeEqual(expectedBuf, sigBuf);
    } catch {
      return false;
    }
  }

  private generateSignature(payload: object): string {
    return crypto
      .createHmac('sha256', this.secret)
      .update(JSON.stringify(payload))
      .digest('hex');
  }
}
