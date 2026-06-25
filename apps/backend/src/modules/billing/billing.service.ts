import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { PlanGuardService, PlanTier, PLAN_LIMITS, REGIONAL_PRICING } from '../plan-guard/plan-guard.service';
import * as crypto from 'crypto';

export type PaymentMethod = 'paybridge' | 'stripe' | 'orange_money' | 'mtn_momo' | 'wave';

export interface CheckoutInput {
  userId:        string;
  email:         string;
  name:          string;
  plan:          PlanTier;
  billingCycle:  'MONTHLY' | 'ANNUAL' | 'LIFETIME';
  countryCode:   string;
  paymentMethod: PaymentMethod;
  phoneNumber?:  string;
  addons:        { autoDeploy?: boolean };
}

export interface CheckoutResult {
  checkoutUrl?:   string;
  sessionId:      string;
  provider:       string;
  currency:       string;
  amountCents:    number;
  instructions?:  string;  // mobile money instructions
}

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private config:    ConfigService,
    private prisma:    PrismaService,
    private planGuard: PlanGuardService,
    private email:     EmailService,
  ) {}

  // ─── CREATE CHECKOUT ──────────────────────────────────────────────────

  async createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
    const currency    = this.planGuard.detectCurrency(input.countryCode);
    const amountCents = this.getPrice(input.plan, input.billingCycle, currency, input.addons);

    // African markets → PayBridge primary
    const isAfrican = ['XAF','XOF','GHS','NGN','KES','TZS'].includes(currency);

    if (input.paymentMethod === 'orange_money') return this.orangeMoneyCheckout(input, currency, amountCents);
    if (input.paymentMethod === 'mtn_momo')     return this.mtnMomoCheckout(input, currency, amountCents);
    if (input.paymentMethod === 'wave')          return this.waveCheckout(input, currency, amountCents);
    if (input.paymentMethod === 'paybridge' || isAfrican) {
      return this.paybridgeCheckout(input, currency, amountCents);
    }
    return this.stripeCheckout(input, currency, amountCents);
  }

  // ─── PAYBRIDGE AFRICA (primary) ───────────────────────────────────────

  private async paybridgeCheckout(input: CheckoutInput, currency: string, amountCents: number): Promise<CheckoutResult> {
    const apiKey    = this.config.get('PAYBRIDGE_API_KEY','');
    const secret    = this.config.get('PAYBRIDGE_SECRET','');
    const apiUrl    = this.config.get('PAYBRIDGE_API_URL','https://api.paybridgeafrica.com/v1');
    const appUrl    = this.config.get('APP_URL','https://veltro.io');

    const payload = {
      merchant_key: apiKey,
      amount:       amountCents / 100,
      currency,
      customer:     { email: input.email, name: input.name, phone: input.phoneNumber },
      metadata:     { userId: input.userId, plan: input.plan, billingCycle: input.billingCycle, source: 'veltro_billing' },
      return_url:   `${appUrl}/dashboard?payment=success&plan=${input.plan}`,
      cancel_url:   `${appUrl}/pricing?canceled=true`,
      description:  `Veltro ${input.plan} — ${input.billingCycle}`,
    };

    try {
      const sig = crypto.createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');
      const res = await fetch(`${apiUrl}/checkout/sessions`, {
        method: 'POST',
        headers: { 'Content-Type':'application/json', 'X-Api-Key':apiKey, 'X-Signature':sig },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        this.logger.warn(`PayBridge failed ${res.status} — falling back to Stripe`);
        return this.stripeCheckout(input, 'USD', PLAN_LIMITS[input.plan].price.monthly);
      }
      const data = await res.json() as any;
      await this.recordPendingPayment(input, 'PAYBRIDGE_AFRICA', data.session_id, currency, amountCents);
      return { checkoutUrl: data.checkout_url, sessionId: data.session_id, provider: 'PayBridge Africa', currency, amountCents };
    } catch {
      return this.stripeCheckout(input, 'USD', PLAN_LIMITS[input.plan].price.monthly);
    }
  }

  // ─── STRIPE (fallback EU/CA/US) ────────────────────────────────────────

  private async stripeCheckout(input: CheckoutInput, currency: string, amountCents: number): Promise<CheckoutResult> {
    const key    = this.config.get('STRIPE_SECRET_KEY','');
    const appUrl = this.config.get('APP_URL','https://veltro.io');
    if (!key) throw new BadRequestException('Payment not configured for your region');

    const isRecurring = input.billingCycle !== 'LIFETIME';
    const params = new URLSearchParams({
      'payment_method_types[]': 'card',
      mode:                      isRecurring ? 'subscription' : 'payment',
      customer_email:            input.email,
      'metadata[userId]':        input.userId,
      'metadata[plan]':          input.plan,
      'metadata[billingCycle]':  input.billingCycle,
      'metadata[addons]':        JSON.stringify(input.addons),
      success_url: `${appUrl}/dashboard?payment=success&plan=${input.plan}`,
      cancel_url:  `${appUrl}/pricing?canceled=true`,
    });

    if (isRecurring) {
      // Create price inline
      params.set('line_items[0][price_data][currency]',                currency.toLowerCase());
      params.set('line_items[0][price_data][unit_amount]',             String(amountCents));
      params.set('line_items[0][price_data][recurring][interval]',     input.billingCycle === 'ANNUAL' ? 'year' : 'month');
      params.set('line_items[0][price_data][product_data][name]',      `Veltro ${input.plan}`);
      params.set('line_items[0][quantity]',                             '1');
    } else {
      params.set('line_items[0][price_data][currency]',                currency.toLowerCase());
      params.set('line_items[0][price_data][unit_amount]',             String(amountCents));
      params.set('line_items[0][price_data][product_data][name]',      `Veltro ${input.plan} Lifetime`);
      params.set('line_items[0][quantity]',                             '1');
    }

    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { Authorization:`Bearer ${key}`, 'Content-Type':'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    const data = await res.json() as any;
    if (data.error) throw new BadRequestException(data.error.message);
    await this.recordPendingPayment(input, 'STRIPE', data.id, currency, amountCents);
    return { checkoutUrl: data.url, sessionId: data.id, provider: 'Stripe', currency, amountCents };
  }

  // ─── ORANGE MONEY ────────────────────────────────────────────────────

  private async orangeMoneyCheckout(input: CheckoutInput, currency: string, amountCents: number): Promise<CheckoutResult> {
    const key    = this.config.get('ORANGE_MONEY_MERCHANT_KEY','');
    const apiUrl = this.config.get('ORANGE_MONEY_API_URL','');
    const appUrl = this.config.get('APP_URL','https://veltro.io');
    const ref    = `VELTRO-OM-${Date.now()}`;

    const res = await fetch(`${apiUrl}/webpayment`, {
      method: 'POST',
      headers: { Authorization:`Bearer ${key}`, 'Content-Type':'application/json' },
      body: JSON.stringify({
        merchant_key: key, currency, order_id: ref,
        amount: amountCents / 100,
        return_url:  `${appUrl}/dashboard?payment=success`,
        cancel_url:  `${appUrl}/pricing?canceled=true`,
        notif_url:   `${appUrl}/api/webhook/orange-money`,
        lang:        input.countryCode === 'SN' ? 'fr' : 'fr',
        reference:   `Veltro ${input.plan}`,
      }),
    });

    const data = await res.json() as any;
    await this.recordPendingPayment(input, 'ORANGE_MONEY', ref, currency, amountCents);
    return {
      checkoutUrl:  data.payment_url,
      sessionId:    ref,
      provider:     'Orange Money',
      currency,     amountCents,
      instructions: `Composez #150*50# sur Orange Money et entrez le code: ${data.pay_token ?? 'voir SMS'}`,
    };
  }

  // ─── MTN MOMO ────────────────────────────────────────────────────────

  private async mtnMomoCheckout(input: CheckoutInput, currency: string, amountCents: number): Promise<CheckoutResult> {
    const subKey   = this.config.get('MTN_MOMO_SUBSCRIPTION_KEY','');
    const apiUrl   = this.config.get('MTN_MOMO_API_URL','');
    const ref      = `VELTRO-MTN-${Date.now()}`;
    const token    = await this.getMTNToken();

    await fetch(`${apiUrl}/collection/v1_0/requesttopay`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Reference-Id': ref,
        'X-Target-Environment': 'production',
        'Ocp-Apim-Subscription-Key': subKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: String(amountCents / 100), currency,
        externalId: ref,
        payer: { partyIdType:'MSISDN', partyId: input.phoneNumber ?? '' },
        payerMessage: `Veltro ${input.plan}`, payeeNote: 'Veltro subscription',
      }),
    });

    await this.recordPendingPayment(input, 'MTN_MOMO', ref, currency, amountCents);
    return {
      sessionId: ref, provider: 'MTN MoMo', currency, amountCents,
      instructions: `Confirmez le paiement de ${amountCents/100} ${currency} sur votre application MTN Mobile Money. Référence: ${ref}`,
    };
  }

  // ─── WAVE ─────────────────────────────────────────────────────────────

  private async waveCheckout(input: CheckoutInput, currency: string, amountCents: number): Promise<CheckoutResult> {
    const key    = this.config.get('WAVE_API_KEY','');
    const appUrl = this.config.get('APP_URL','https://veltro.io');
    const ref    = `VELTRO-WAVE-${Date.now()}`;

    const res = await fetch('https://api.wave.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { Authorization:`Bearer ${key}`, 'Content-Type':'application/json' },
      body: JSON.stringify({
        currency, amount: String(amountCents / 100),
        error_url:   `${appUrl}/pricing?canceled=true`,
        success_url: `${appUrl}/dashboard?payment=success`,
        client_reference: ref,
      }),
    });

    const data = await res.json() as any;
    await this.recordPendingPayment(input, 'WAVE', ref, currency, amountCents);
    return { checkoutUrl: data.wave_launch_url, sessionId: ref, provider: 'Wave', currency, amountCents };
  }

  // ─── WEBHOOK PROCESSING (idempotent) ─────────────────────────────────

  async processPaymentSuccess(provider: string, externalId: string, metadata: any): Promise<void> {
    const existing = await this.prisma.webhookEvent.findUnique({ where: { eventId: externalId } });
    if (existing?.processed) return;

    await this.prisma.webhookEvent.upsert({
      where:  { eventId: externalId },
      create: { provider, eventId: externalId, eventType: 'payment.succeeded', payload: metadata },
      update: {},
    });

    const { userId, plan, billingCycle, addons } = metadata;
    if (!userId || !plan) return;

    const now     = new Date();
    const periodEnd = new Date(now);
    if (billingCycle === 'ANNUAL') periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    else if (billingCycle === 'LIFETIME') periodEnd.setFullYear(periodEnd.getFullYear() + 100);
    else periodEnd.setMonth(periodEnd.getMonth() + 1);

    const subscription = await this.prisma.subscription.create({
      data: {
        userId, plan: plan as any, status: 'ACTIVE' as any,
        provider: this.mapProvider(provider),
        providerSubId: externalId,
        currency: metadata.currency ?? 'USD',
        amountCents: metadata.amountCents ?? 0,
        billingCycle: (billingCycle ?? 'MONTHLY') as any,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        autoDeployAddon: addons?.autoDeploy ?? false,
      },
    });

    await this.prisma.payment.updateMany({
      where: { providerPaymentId: externalId },
      data:  { status: 'SUCCEEDED' as any, subscriptionId: subscription.id },
    });

    // Advance onboarding to DONE once paid
    await this.prisma.user.update({
      where: { id: userId },
      data:  { onboardStep: 'DONE' as any, onboardDone: true },
    }).catch(() => {}); // non-fatal

    // Send payment confirmation email
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (user?.email) {
      await this.email.sendPaymentConfirmation(user.email, {
        name:        user.name ?? user.email,
        plan:        plan as any,
        currency:    metadata.currency ?? 'USD',
        amountCents: metadata.amountCents ?? 0,
        provider:    this.mapProvider(provider) as any,
        periodEnd,
      }).catch(e => this.logger.warn('Payment email failed: ' + e.message));
    }

    await this.prisma.webhookEvent.update({
      where: { eventId: externalId },
      data:  { processed: true, processedAt: new Date() },
    });
  }

  // ─── HELPERS ─────────────────────────────────────────────────────────

  getPrice(plan: PlanTier, cycle: 'MONTHLY'|'ANNUAL'|'LIFETIME', currency: string, addons: any): number {
    const regional = REGIONAL_PRICING[currency];
    const base = regional ? regional[plan] : PLAN_LIMITS[plan].price.monthly;
    let amount = cycle === 'ANNUAL' ? Math.round(base * 10) : cycle === 'LIFETIME' ? Math.round(base * 50) : base;
    if (addons?.autoDeploy && !PLAN_LIMITS[plan].autoDeployIncluded) amount += (regional ? Math.round(regional.STARTER * 0.17) : 5000);
    return amount;
  }

  private async recordPendingPayment(input: CheckoutInput, provider: string, sessionId: string, currency: string, amountCents: number) {
    await this.prisma.payment.create({
      data: {
        userId: input.userId,
        provider: this.mapProvider(provider),
        providerPaymentId: sessionId,
        status: 'PENDING',
        currency, amountCents,
        metadata: { plan: input.plan, billingCycle: input.billingCycle, addons: input.addons },
      },
    });
  }

  private mapProvider(p: string): any {
    if (/paybridge/i.test(p)) return 'PAYBRIDGE_AFRICA';
    if (/stripe/i.test(p))    return 'STRIPE';
    if (/orange/i.test(p))    return 'ORANGE_MONEY';
    if (/mtn/i.test(p))       return 'MTN_MOMO';
    if (/wave/i.test(p))      return 'WAVE';
    return 'STRIPE';
  }

  private async getMTNToken(): Promise<string> {
    const apiUser = this.config.get('MTN_MOMO_API_USER','');
    const apiKey  = this.config.get('MTN_MOMO_API_KEY','');
    const subKey  = this.config.get('MTN_MOMO_SUBSCRIPTION_KEY','');
    const apiUrl  = this.config.get('MTN_MOMO_API_URL','');
    const res = await fetch(`${apiUrl}/collection/token/`, {
      method: 'POST',
      headers: { Authorization:`Basic ${Buffer.from(`${apiUser}:${apiKey}`).toString('base64')}`, 'Ocp-Apim-Subscription-Key':subKey },
    });
    return (await res.json() as any).access_token;
  }

  // Stripe webhook signature verification (timing-safe)
  verifyStripeSignature(raw: string, header: string, secret: string): boolean {
    try {
      const parts = Object.fromEntries(header.split(',').map(p => p.split('=')));
      if (!parts.t || !parts.v1) return false;
      if (Math.abs(Date.now()/1000 - parseInt(parts.t)) > 300) return false;
      const expected = crypto.createHmac('sha256', secret).update(`${parts.t}.${raw}`).digest('hex');
      const expBuf = Buffer.from(expected,'hex');
      const v1Buf  = Buffer.from(parts.v1,'hex');
      if (expBuf.length !== v1Buf.length) return false;
      return crypto.timingSafeEqual(expBuf, v1Buf);
    } catch { return false; }
  }
}
