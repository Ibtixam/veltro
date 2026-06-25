import {
  Controller, Post, Get, Body, Param, Req,
  UseGuards, Headers, RawBodyRequest, HttpCode, Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { PayBridgeService, PayBridgeCheckoutParams } from './paybridge.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PlanTier, BillingCycle, PaymentStatus, PaymentProvider } from '@prisma/client';
import { z } from 'zod';
import * as crypto from 'crypto';

const CheckoutSchema = z.object({
  plan: z.nativeEnum(PlanTier),
  billingCycle: z.nativeEnum(BillingCycle).default('MONTHLY'),
  countryCode: z.string().length(2).toUpperCase(),
  phoneNumber: z.string().optional(),
  paymentMethod: z.enum(['PAYBRIDGE_AFRICA', 'STRIPE', 'ORANGE_MONEY', 'MTN_MOMO']).default('PAYBRIDGE_AFRICA'),
});

@Controller('payment')
export class PaymentController {
  private readonly logger = new Logger(PaymentController.name);

  constructor(
    private readonly paybridge: PayBridgeService,
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  @Get('pricing/:countryCode')
  async getPricing(@Param('countryCode') countryCode: string) {
    const currency = this.paybridge.detectCurrency(countryCode);
    const plans = Object.values(PlanTier).filter(p => p !== 'ENTERPRISE').map(plan => ({
      plan,
      currency,
      monthly: this.paybridge.getPriceForPlan(plan, currency, BillingCycle.MONTHLY),
      annual: this.paybridge.getPriceForPlan(plan, currency, BillingCycle.ANNUAL),
      monthlyFormatted: this.paybridge.formatPrice(
        this.paybridge.getPriceForPlan(plan, currency, BillingCycle.MONTHLY), currency,
      ),
      annualFormatted: this.paybridge.formatPrice(
        this.paybridge.getPriceForPlan(plan, currency, BillingCycle.ANNUAL), currency,
      ),
    }));
    return { currency, countryCode: countryCode.toUpperCase(), plans };
  }

  @Post('checkout')
  @UseGuards(JwtAuthGuard)
  async createCheckout(@Req() req: any, @Body() body: unknown) {
    const parsed = CheckoutSchema.safeParse(body);
    if (!parsed.success) return { error: parsed.error.flatten() };

    const { plan, billingCycle, countryCode, phoneNumber, paymentMethod } = parsed.data;
    const user = req.user;

    // Pull the customer's domain (set during onboarding) so payment provisioning
    // can wire the Site → HuntConfig automatically on webhook success.
    const userSite = await this.prisma.site.findFirst({ where: { userId: user.id }, orderBy: { createdAt: 'asc' } });
    const userDomain = userSite?.domain;

    if (paymentMethod === 'ORANGE_MONEY' || paymentMethod === 'MTN_MOMO') {
      const result = await this.paybridge.initiateMobileMoney({
        userId: user.id,
        email: user.email,
        plan,
        provider: paymentMethod,
        phoneNumber: phoneNumber ?? '',
        countryCode,
        returnUrl: `${process.env.APP_URL}/dashboard?payment=success`,
      });
      return { type: 'mobile_money', ...result };
    }

    const params: PayBridgeCheckoutParams = {
      userId: user.id,
      email: user.email,
      name: user.name ?? user.email,
      plan,
      billingCycle,
      countryCode,
      phoneNumber,
      domain: userDomain,
      returnUrl: `${process.env.APP_URL}/dashboard?payment=success&plan=${plan}`,
      cancelUrl: `${process.env.APP_URL}/pricing?canceled=true`,
    };

    const result = await this.paybridge.createCheckoutSession(params);

    await this.prisma.payment.create({
      data: {
        userId: user.id,
        provider: result.provider,
        providerPaymentId: result.sessionId,
        status: PaymentStatus.PENDING,
        currency: result.currency,
        amountCents: result.amountCents,
        metadata: { plan, billingCycle, sessionId: result.sessionId },
      },
    });

    return { checkoutUrl: result.checkoutUrl, provider: result.provider };
  }

  // ─── WEBHOOK: PAYBRIDGE AFRICA ────────────────────────────────────────
  @Post('webhook/paybridge')
  @HttpCode(200)
  async handlePayBridgeWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-paybridge-signature') signature: string,
  ) {
    const rawBody = req.rawBody?.toString() ?? '';

    if (!this.paybridge.verifyWebhookSignature(rawBody, signature)) {
      this.logger.warn('PayBridge webhook: invalid signature');
      return { received: false };
    }

    let event: any;
    try { event = JSON.parse(rawBody); } catch { return { received: false }; }

    const existing = await this.prisma.webhookEvent.findUnique({ where: { eventId: event.id } });
    if (existing?.processed) return { received: true, skipped: true };

    await this.prisma.webhookEvent.upsert({
      where: { eventId: event.id },
      update: {},
      create: {
        provider: PaymentProvider.PAYBRIDGE_AFRICA,
        eventId: event.id,
        eventType: event.type,
        payload: event,
      },
    });

    await this.processPaymentEvent(event, PaymentProvider.PAYBRIDGE_AFRICA);
    return { received: true };
  }

  // ─── WEBHOOK: STRIPE (real HMAC-SHA256 verification) ─────────────────
  @Post('webhook/stripe')
  @HttpCode(200)
  async handleStripeWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') stripeSignature: string,
  ) {
    const rawBody = req.rawBody?.toString() ?? '';
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? '';

    // Stripe signature: t=timestamp,v1=hmac_sha256
    if (!this.verifyStripeSignature(rawBody, stripeSignature, webhookSecret)) {
      this.logger.warn('Stripe webhook: invalid signature');
      return { received: false };
    }

    let event: any;
    try { event = JSON.parse(rawBody); } catch { return { received: false }; }

    const existing = await this.prisma.webhookEvent.findUnique({ where: { eventId: event.id } });
    if (existing?.processed) return { received: true, skipped: true };

    await this.prisma.webhookEvent.create({
      data: {
        provider: PaymentProvider.STRIPE,
        eventId: event.id,
        eventType: event.type,
        payload: event,
      },
    });

    await this.processPaymentEvent(event, PaymentProvider.STRIPE);
    return { received: true };
  }

  // ─── STRIPE HMAC VERIFICATION ─────────────────────────────────────────
  private verifyStripeSignature(payload: string, header: string, secret: string): boolean {
    if (!header || !secret) return false;
    try {
      const parts = header.split(',').reduce((acc, part) => {
        const [k, v] = part.split('=');
        acc[k] = v;
        return acc;
      }, {} as Record<string, string>);

      const timestamp = parts['t'];
      const v1 = parts['v1'];
      if (!timestamp || !v1) return false;

      // Reject if timestamp > 5 min old
      if (Math.abs(Date.now() / 1000 - parseInt(timestamp)) > 300) return false;

      const signedPayload = `${timestamp}.${payload}`;
      const expected = crypto
        .createHmac('sha256', secret)
        .update(signedPayload)
        .digest('hex');

      const expectedBuf = Buffer.from(expected, 'hex');
      const v1Buf = Buffer.from(v1, 'hex');
      if (expectedBuf.length !== v1Buf.length) return false;
      return crypto.timingSafeEqual(expectedBuf, v1Buf);
    } catch {
      return false;
    }
  }

  private async processPaymentEvent(event: any, provider: PaymentProvider): Promise<void> {
    const isSuccess = [
      'checkout.session.completed',
      'payment.succeeded',
      'payment_intent.succeeded',
    ].includes(event.type);

    const isFailed = ['payment.failed', 'payment_intent.payment_failed'].includes(event.type);

    if (!isSuccess && !isFailed) {
      await this.prisma.webhookEvent.update({
        where: { eventId: event.id },
        data: { processed: true, processedAt: new Date() },
      });
      return;
    }

    const metadata = event.data?.object?.metadata ?? event.metadata ?? {};
    const { userId, plan, billingCycle } = metadata;

    if (!userId || !plan) {
      this.logger.warn(`Webhook missing userId/plan metadata: ${event.id}`);
      return;
    }

    if (isSuccess) {
      const sessionId = event.data?.object?.id ?? event.session_id;
      const currency = (event.data?.object?.currency ?? event.currency ?? 'EUR').toUpperCase();
      const amountCents = event.data?.object?.amount_total ?? event.amount ?? 0;
      const now = new Date();
      const periodEnd = new Date(now);
      if (billingCycle === 'ANNUAL') periodEnd.setFullYear(periodEnd.getFullYear() + 1);
      else if (billingCycle === 'LIFETIME') periodEnd.setFullYear(periodEnd.getFullYear() + 100);
      else periodEnd.setMonth(periodEnd.getMonth() + 1);

      const subscription = await this.prisma.subscription.create({
        data: {
          userId,
          plan: plan as PlanTier,
          provider,
          providerSubId: sessionId,
          currency,
          amountCents,
          billingCycle: (billingCycle as BillingCycle) ?? BillingCycle.MONTHLY,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
        },
      });

      await this.prisma.payment.updateMany({
        where: { providerPaymentId: sessionId },
        data: { status: PaymentStatus.SUCCEEDED, subscriptionId: subscription.id },
      });

      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (user) {
        // ── Provision the customer account (turnkey activation) ──────────
        // 1. Complete onboarding so the user lands in their dashboard.
        await this.prisma.user.update({
          where: { id: userId },
          data: { onboardStep: 'DONE', onboardDone: true },
        });

        // 2. Ensure a Site exists for their domain.
        // Domain comes from payment metadata, else from the Site created during onboarding.
        let domain: string | null = metadata.domain ?? null;
        if (!domain) {
          const firstSite = await this.prisma.site.findFirst({ where: { userId }, orderBy: { createdAt: 'asc' } });
          domain = firstSite?.domain ?? null;
        }
        if (domain) {
          const site = await this.prisma.site.findFirst({ where: { userId, domain } });
          if (!site) {
            await this.prisma.site.create({ data: { userId, domain } });
          }
          // 3. Create the hunt config so weekly cycles run automatically.
          const existingCfg = await this.prisma.huntConfig.findUnique({ where: { subscriptionId: subscription.id } }).catch(() => null);
          if (!existingCfg) {
            await this.prisma.huntConfig.create({
              data: {
                subscriptionId: subscription.id,
                domain,
                seedKeywords: (metadata.seedKeywords ?? '').split(',').filter(Boolean),
                lang: metadata.lang ?? 'en',
                country: metadata.country ?? 'us',
              },
            }).catch((e: unknown) =>
              this.logger.warn(`HuntConfig provisioning skipped: ${e instanceof Error ? e.message : String(e)}`),
            );
          }
        }

        // 4. Confirmation email.
        await this.email.sendPaymentConfirmation(user.email, {
          name: user.name ?? user.email,
          plan: plan as PlanTier,
          currency,
          amountCents,
          provider,
          periodEnd,
        });
        this.logger.log(`✓ Account provisioned for ${user.email} — plan ${plan}, site ${domain ?? 'none'}`);
      }
    }

    if (isFailed) {
      const sessionId = event.data?.object?.id ?? '';
      await this.prisma.payment.updateMany({
        where: { providerPaymentId: sessionId },
        data: {
          status: PaymentStatus.FAILED,
          failureReason: event.data?.object?.last_payment_error?.message ?? 'Unknown',
        },
      });
    }

    await this.prisma.webhookEvent.update({
      where: { eventId: event.id },
      data: { processed: true, processedAt: new Date() },
    });
  }
}
