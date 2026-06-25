import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StackDetectorService } from '../stack-detector/stack-detector.service';
import { z } from 'zod';

// ─── ONBOARDING STEPS ────────────────────────────────────────────────────
//
// 1. ACCOUNT     — email + password + name + lang + country + phone
// 2. DOMAIN      — add your website URL
// 3. STACK       — auto-detected + confirmed; business type + revenue goal
// 4. CONNECT_GSC — Google OAuth (covers GSC + GA4)
// 5. CONNECT_GA4 — GA4 property ID selection
// 6. PLAN        — choose plan + payment method + currency
// 7. DONE        — first hunt triggered immediately

export const OnboardSteps = ['ACCOUNT','DOMAIN','STACK','CONNECT_GSC','CONNECT_GA4','PLAN','DONE'] as const;
export type OnboardStep = typeof OnboardSteps[number];

// ─── STEP SCHEMAS ────────────────────────────────────────────────────────

const StepSchemas = {
  ACCOUNT: z.object({
    email:    z.string().email(),
    password: z.string().min(8).max(128),
    name:     z.string().min(1).max(100),
    lang:     z.enum(['EN','FR']).default('EN'),
    country:  z.string().length(2).optional(),
    phone:    z.string().optional(),
  }),
  DOMAIN: z.object({
    domain: z.string().url().or(z.string().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i)),
  }),
  STACK: z.object({
    confirmedStack:  z.string(),
    businessType:    z.string().min(2).max(100),
    revenueGoal:     z.number().min(0).max(100_000_000),
    avgOrderValue:   z.number().min(0),
    conversionRate:  z.number().min(0).max(1),
    currency:        z.string().length(3),
    seedKeywords:    z.array(z.string()).min(1).max(20),
    competitors:     z.array(z.string()).max(5).default([]),
    lang:            z.enum(['EN','FR','BOTH']).default('EN'),
  }),
  CONNECT_GSC: z.object({
    // After OAuth callback — just persist the fact that it's connected
    connected: z.boolean(),
  }),
  CONNECT_GA4: z.object({
    propertyId: z.string().optional(),  // optional — can skip
  }),
  PLAN: z.object({
    plan:          z.enum(['STARTER','PRO','AGENCY','ENTERPRISE','LIFETIME']),
    billingCycle:  z.enum(['MONTHLY','ANNUAL','LIFETIME']).default('MONTHLY'),
    paymentMethod: z.enum(['paybridge','stripe','orange_money','mtn_momo','wave']).default('paybridge'),
    addAutoDeploy: z.boolean().default(false),
    phone:         z.string().optional(),
  }),
};

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    private prisma:   PrismaService,
    private detector: StackDetectorService,
  ) {}

  // ─── GET CURRENT STATE ────────────────────────────────────────────────

  async getState(userId: string): Promise<{
    step:    OnboardStep;
    done:    boolean;
    data:    Record<string, any>;
    next:    string;         // what to do next (plain English)
    percent: number;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { sites: { take: 1 } },
    });
    if (!user) throw new Error('User not found');

    const step    = user.onboardStep as OnboardStep;
    const stepIdx = OnboardSteps.indexOf(step);
    const percent = Math.round((stepIdx / (OnboardSteps.length - 1)) * 100);

    const nextMessages: Record<OnboardStep, string> = {
      ACCOUNT:     'Add your website URL',
      DOMAIN:      'Veltro is detecting your technology stack',
      STACK:       'Connect Google Search Console for real revenue data',
      CONNECT_GSC: 'Select your GA4 property (optional but recommended)',
      CONNECT_GA4: 'Choose your plan and payment method',
      PLAN:        'Your first SEO hunt is running',
      DONE:        'You\'re all set — check your dashboard',
    };

    return {
      step, done: user.onboardDone,
      data: { domain: user.sites[0]?.domain, stack: user.sites[0]?.detectedStack },
      next: nextMessages[step],
      percent,
    };
  }

  // ─── ADVANCE STEP ────────────────────────────────────────────────────

  async advance(userId: string, step: OnboardStep, data: unknown): Promise<{ nextStep: OnboardStep; siteId?: string; checkoutUrl?: string }> {
    const schema = (StepSchemas as Record<string, any>)[step];
    const parsed = schema?.safeParse(data);
    if (schema && parsed && !parsed.success) throw new Error(JSON.stringify(parsed.error.flatten()));

    switch (step) {
      case 'ACCOUNT':     return this.stepAccount(userId, parsed?.data);
      case 'DOMAIN':      return this.stepDomain(userId, parsed?.data);
      case 'STACK':       return this.stepStack(userId, parsed?.data);
      case 'CONNECT_GSC': return this.stepConnectGSC(userId, parsed?.data);
      case 'CONNECT_GA4': return this.stepConnectGA4(userId, parsed?.data);
      case 'PLAN':        return this.stepPlan(userId, parsed?.data);
      default:            throw new Error(`Unknown step: ${step}`);
    }
  }

  // ─── STEP IMPLEMENTATIONS ────────────────────────────────────────────

  private async stepAccount(userId: string, data: any) {
    // Map locale string to valid Lang enum value — default FR for unknown
    const VALID_LANGS = ['EN','FR','AR','ZH','SW','PT','ES','DE','RU','JA','KO','TR','VI','NL','IT','HI','HA','YO','IG','AM','RW','MG'];
    const langCode = (data.lang ?? 'FR').toUpperCase();
    const lang = VALID_LANGS.includes(langCode) ? langCode : 'FR';
    await this.prisma.user.update({
      where: { id: userId },
      data:  { name: data.name, lang: lang as any, country: data.country, phone: data.phone, onboardStep: 'DOMAIN' },
    });
    return { nextStep: 'DOMAIN' as OnboardStep };
  }

  private async stepDomain(userId: string, data: any) {
    const domain = new URL(data.domain.startsWith('http') ? data.domain : `https://${data.domain}`).hostname.replace(/^www\./,'');

    // Auto-detect stack immediately
    const signal = await this.detector.detect(domain).catch(() => null);

    const site = await this.prisma.site.upsert({
      where:  { userId_domain: { userId, domain } },
      create: {
        userId, domain,
        detectedStack:   signal?.stack,
        stackConfidence: signal?.confidence,
        stackVersion:    signal?.version,
        stackExtras:     signal?.extras as any,
        stackDetectedAt: new Date(),
      },
      update: {
        detectedStack:   signal?.stack,
        stackConfidence: signal?.confidence,
        stackVersion:    signal?.version,
        stackExtras:     signal?.extras as any,
        stackDetectedAt: new Date(),
      },
    });

    await this.prisma.user.update({ where: { id: userId }, data: { onboardStep: 'STACK' } });
    return { nextStep: 'STACK' as OnboardStep, siteId: site.id, stackDetected: signal?.stack, stackConfidence: signal?.confidence };
  }

  private async stepStack(userId: string, data: any) {
    const site = await this.prisma.site.findFirst({ where: { userId } });
    if (!site) throw new Error('No site found');

    await this.prisma.site.update({
      where: { id: site.id },
      data: {
        detectedStack:  data.confirmedStack,
        businessType:   data.businessType,
        revenueGoal:    data.revenueGoal,
        avgOrderValue:  data.avgOrderValue,
        conversionRate: data.conversionRate,
        currency:       data.currency,
        seedKeywords:   data.seedKeywords,
        competitors:    data.competitors,
        lang:           data.lang === 'FR' ? 'FR' : 'EN',
      },
    });

    await this.prisma.user.update({ where: { id: userId }, data: { onboardStep: 'CONNECT_GSC' } });
    return { nextStep: 'CONNECT_GSC' as OnboardStep };
  }

  private async stepConnectGSC(userId: string, data: any) {
    // GSC connection happens via OAuth redirect — this just records the step
    await this.prisma.user.update({ where: { id: userId }, data: { onboardStep: 'CONNECT_GA4' } });
    return { nextStep: 'CONNECT_GA4' as OnboardStep };
  }

  private async stepConnectGA4(userId: string, data: any) {
    if (data?.propertyId) {
      const cred = await this.prisma.connectorCredential.findFirst({ where: { userId, type: 'gsc' } });
      if (cred) {
        await this.prisma.connectorCredential.upsert({
          where:  { userId_type: { userId, type: 'ga4' } },
          create: { userId, type: 'ga4', status: 'CONNECTED', metadata: { propertyId: data.propertyId } },
          update: { status: 'CONNECTED', metadata: { propertyId: data.propertyId } },
        });
      }
    }
    await this.prisma.user.update({ where: { id: userId }, data: { onboardStep: 'PLAN' } });
    return { nextStep: 'PLAN' as OnboardStep };
  }

  private async stepPlan(userId: string, data: any) {
    // Defer onboardDone until payment succeeds (webhook will update)
    // Here we just create checkout session and return URL
    // onboardStep stays PLAN until payment completes
    // After webhook: set onboardStep=DONE, onboardDone=true
    return { nextStep: 'PLAN' as OnboardStep, requiresPayment: true };
  }

  // ─── SKIP STEP (optional connectors) ─────────────────────────────────

  async skipStep(userId: string, step: 'CONNECT_GSC' | 'CONNECT_GA4'): Promise<{ nextStep: OnboardStep }> {
    const nextMap: Record<string, OnboardStep> = { CONNECT_GSC: 'CONNECT_GA4', CONNECT_GA4: 'PLAN' };
    const next = nextMap[step] ?? 'PLAN';
    await this.prisma.user.update({ where: { id: userId }, data: { onboardStep: next } });
    return { nextStep: next };
  }
}
