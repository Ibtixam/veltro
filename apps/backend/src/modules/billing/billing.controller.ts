import {
  Controller, Post, Get, Body, Req, Param,
  UseGuards, Headers, RawBodyRequest, HttpCode, Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { BillingService } from './billing.service';
import { PlanGuardService } from '../plan-guard/plan-guard.service';
import { JwtAuthGuard } from '../auth/auth.module';
import { z } from 'zod';

const CheckoutSchema = z.object({
  plan:          z.enum(['STARTER','PRO','AGENCY','ENTERPRISE','LIFETIME']),
  billingCycle:  z.enum(['MONTHLY','ANNUAL','LIFETIME']).default('MONTHLY'),
  paymentMethod: z.enum(['paybridge','stripe','orange_money','mtn_momo','wave']).default('paybridge'),
  countryCode:   z.string().length(2).toUpperCase().default('US'),
  phoneNumber:   z.string().optional(),
  addons:        z.object({ autoDeploy: z.boolean().default(false) }).default({}),
});

@Controller('billing')
export class BillingController {
  private readonly logger = new Logger(BillingController.name);

  constructor(
    private readonly billing:    BillingService,
    private readonly planGuard:  PlanGuardService,
  ) {}

  // ── GET PRICING (public — currency detected by country code) ──────────
  @Get('pricing/:countryCode')
  async getPricing(@Param('countryCode') countryCode: string) {
    return this.planGuard.getPricing(countryCode);
  }

  // ── GET USER PLAN (authenticated) ─────────────────────────────────────
  @Get('plan')
  @UseGuards(JwtAuthGuard)
  async getUserPlan(@Req() req: any) {
    const limits = await this.planGuard.getLimits(req.user.id);
    return limits;
  }

  // ── CREATE CHECKOUT (authenticated) ───────────────────────────────────
  @Post('checkout')
  @UseGuards(JwtAuthGuard)
  async createCheckout(@Req() req: any, @Body() body: unknown) {
    const parsed = CheckoutSchema.safeParse(body);
    if (!parsed.success) return { error: parsed.error.flatten() };

    return this.billing.createCheckout({
      userId:        req.user.id,
      email:         req.user.email,
      name:          req.user.name ?? req.user.email,
      ...parsed.data,
    });
  }

  // ── WEBHOOK: PAYBRIDGE AFRICA ─────────────────────────────────────────
  @Post('webhook/paybridge')
  @HttpCode(200)
  async paybridgeWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-paybridge-signature') sig: string,
  ) {
    const raw = req.rawBody?.toString() ?? '';
    const webhookSecret = process.env.PAYBRIDGE_WEBHOOK_SECRET ?? '';

    // Verify signature
    const crypto = require('crypto');
    const expected = crypto.createHmac('sha256', webhookSecret).update(raw).digest('hex');
    const expBuf = Buffer.from(expected, 'hex');
    try {
      const sigBuf = Buffer.from(sig ?? '', 'hex');
      if (expBuf.length !== sigBuf.length) return { received: false };
      if (!crypto.timingSafeEqual(expBuf, sigBuf)) return { received: false };
    } catch { return { received: false }; }

    let event: any;
    try { event = JSON.parse(raw); } catch { return { received: false }; }

    if (['payment.succeeded','checkout.completed'].includes(event.type)) {
      await this.billing.processPaymentSuccess('paybridge', event.id, event.metadata ?? event.data?.metadata ?? {});
    }
    return { received: true };
  }

  // ── WEBHOOK: STRIPE ────────────────────────────────────────────────────
  @Post('webhook/stripe')
  @HttpCode(200)
  async stripeWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') stripeSig: string,
  ) {
    const raw    = req.rawBody?.toString() ?? '';
    const secret = process.env.STRIPE_WEBHOOK_SECRET ?? '';

    if (!this.billing.verifyStripeSignature(raw, stripeSig, secret)) {
      this.logger.warn('Stripe webhook: invalid signature');
      return { received: false };
    }

    let event: any;
    try { event = JSON.parse(raw); } catch { return { received: false }; }

    if (['checkout.session.completed','payment_intent.succeeded'].includes(event.type)) {
      const metadata = event.data?.object?.metadata ?? {};
      await this.billing.processPaymentSuccess('stripe', event.id, {
        ...metadata,
        currency:    event.data?.object?.currency?.toUpperCase() ?? 'USD',
        amountCents: event.data?.object?.amount_total ?? 0,
      });
    }
    return { received: true };
  }

  // ── WEBHOOK: ORANGE MONEY ─────────────────────────────────────────────
  @Post('webhook/orange-money')
  @HttpCode(200)
  async orangeWebhook(@Body() body: any) {
    if (body?.status === 'SUCCESS' && body?.order_id) {
      const payment = await this.billing['prisma'].payment.findFirst({
        where: { providerPaymentId: body.order_id },
      });
      const meta = payment?.metadata
        ? { ...(payment.metadata as any), currency: payment.currency, amountCents: payment.amountCents }
        : (body.metadata ?? {});
      await this.billing.processPaymentSuccess('orange_money', body.order_id, meta);
    }
    return { received: true };
  }

  // ── WEBHOOK: MTN MOMO ─────────────────────────────────────────────────
  @Post('webhook/mtn-momo')
  @HttpCode(200)
  async mtnWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-reference-id') refId: string,
  ) {
    let body: any;
    try { body = JSON.parse(req.rawBody?.toString() ?? '{}'); } catch { return { received: false }; }
    if (body?.status === 'SUCCESSFUL') {
      // Look up payment by providerPaymentId to get real userId + metadata
      const payment = await this.billing['prisma'].payment.findFirst({
        where: { providerPaymentId: refId },
      });
      if (payment?.metadata) {
        await this.billing.processPaymentSuccess('mtn_momo', refId, {
          ...(payment.metadata as any),
          currency:    payment.currency,
          amountCents: payment.amountCents,
        });
      }
    }
    return { received: true };
  }

  // ── WEBHOOK: WAVE ─────────────────────────────────────────────────────
  @Post('webhook/wave')
  @HttpCode(200)
  async waveWebhook(@Body() body: any) {
    if (body?.type === 'checkout.session.completed') {
      const ref = body.checkout_session?.client_reference ?? body.id;
      const payment = await this.billing['prisma'].payment.findFirst({
        where: { providerPaymentId: ref },
      });
      if (payment?.metadata) {
        await this.billing.processPaymentSuccess('wave', ref, {
          ...(payment.metadata as any),
          currency:    payment.currency,
          amountCents: payment.amountCents,
        });
      }
    }
    return { received: true };
  }
}
