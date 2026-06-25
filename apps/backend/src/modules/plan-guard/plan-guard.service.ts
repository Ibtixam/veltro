import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// ─── PLAN LIMITS (source of truth — also seed to PlanLimit table) ─────────

export const PLAN_LIMITS = {
  STARTER: {
    maxSites:            1,
    maxClustersPerCycle: 5,
    maxPagesPerCycle:    2,
    huntFrequency:       'monthly',
    deliveryChannels:    ['email'],
    autoDeployIncluded:  false,
    geoEngineIncluded:   true,
    apiRateLimit:        100,   // requests/hour
    trialDays:           7,
    price: { monthly: 2900, annual: 29000, currency: 'USD' },
  },
  PRO: {
    maxSites:            3,
    maxClustersPerCycle: 20,
    maxPagesPerCycle:    5,
    huntFrequency:       'weekly',
    deliveryChannels:    ['email', 'whatsapp'],
    autoDeployIncluded:  false,
    geoEngineIncluded:   true,
    apiRateLimit:        500,
    trialDays:           7,
    price: { monthly: 7900, annual: 79000, currency: 'USD' },
  },
  AGENCY: {
    maxSites:            10,
    maxClustersPerCycle: 999,
    maxPagesPerCycle:    15,
    huntFrequency:       'daily',
    deliveryChannels:    ['email', 'whatsapp', 'sms'],
    autoDeployIncluded:  true,
    geoEngineIncluded:   true,
    apiRateLimit:        2000,
    trialDays:           14,
    price: { monthly: 24900, annual: 249000, currency: 'USD' },
  },
  ENTERPRISE: {
    maxSites:            999,
    maxClustersPerCycle: 999,
    maxPagesPerCycle:    50,
    huntFrequency:       'daily',
    deliveryChannels:    ['email', 'whatsapp', 'sms'],
    autoDeployIncluded:  true,
    geoEngineIncluded:   true,
    apiRateLimit:        10000,
    trialDays:           14,
    price: { monthly: 59900, annual: 599000, currency: 'USD' },
  },
  LIFETIME: {
    maxSites:            5,
    maxClustersPerCycle: 50,
    maxPagesPerCycle:    10,
    huntFrequency:       'weekly',
    deliveryChannels:    ['email', 'whatsapp'],
    autoDeployIncluded:  false,
    geoEngineIncluded:   true,
    apiRateLimit:        1000,
    trialDays:           0,
    price: { monthly: 0, annual: 0, lifetime: 49900, currency: 'USD' },
  },
} as const;

export type PlanTier = keyof typeof PLAN_LIMITS;

// Regional pricing (PPP — Africa + Canada)
export const REGIONAL_PRICING: Record<string, Record<PlanTier, number>> = {
  XAF: { STARTER: 19900_00, PRO: 49900_00, AGENCY: 149900_00, ENTERPRISE: 349900_00, LIFETIME: 299900_00 },
  XOF: { STARTER: 19900_00, PRO: 49900_00, AGENCY: 149900_00, ENTERPRISE: 349900_00, LIFETIME: 299900_00 },
  CAD: { STARTER: 3900,     PRO: 9900,     AGENCY: 29900,     ENTERPRISE: 69900,     LIFETIME: 59900 },
  GHS: { STARTER: 39000,    PRO: 99000,    AGENCY: 299000,    ENTERPRISE: 699000,    LIFETIME: 599000 },
  NGN: { STARTER: 49000,    PRO: 119000,   AGENCY: 349000,    ENTERPRISE: 849000,    LIFETIME: 699000 },
  EUR: { STARTER: 2700,     PRO: 6900,     AGENCY: 21900,     ENTERPRISE: 52900,     LIFETIME: 43900 },
};

@Injectable()
export class PlanGuardService {
  private readonly logger = new Logger(PlanGuardService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── ENFORCE: call before any feature execution ────────────────────────

  async enforce(userId: string, feature: keyof typeof FEATURE_PLAN_MAP): Promise<void> {
    const plan = await this.getUserPlan(userId);
    const minPlan = FEATURE_PLAN_MAP[feature];
    const planOrder: PlanTier[] = ['STARTER','PRO','AGENCY','ENTERPRISE','LIFETIME'];
    const userIdx = planOrder.indexOf(plan);
    const reqIdx  = planOrder.indexOf(minPlan);

    if (userIdx < reqIdx) {
      throw new ForbiddenException({
        code:     'PLAN_UPGRADE_REQUIRED',
        feature,
        current:  plan,
        required: minPlan,
        upgradeUrl: 'https://veltro.io/pricing',
        message:  `This feature requires ${minPlan} plan or higher. You are on ${plan}.`,
      });
    }
  }

  async checkSiteLimit(userId: string): Promise<void> {
    const plan = await this.getUserPlan(userId);
    const limits = PLAN_LIMITS[plan];
    const siteCount = await this.prisma.site.count({ where: { userId } });
    if (siteCount >= limits.maxSites) {
      throw new ForbiddenException({
        code: 'SITE_LIMIT_REACHED',
        current: siteCount, max: limits.maxSites, plan,
        message: `${plan} plan allows ${limits.maxSites} site(s). Upgrade to add more.`,
      });
    }
  }

  async getLimits(userId: string) {
    const plan = await this.getUserPlan(userId);
    return { plan, ...PLAN_LIMITS[plan] };
  }

  async getPricing(countryCode: string): Promise<Record<string, any>> {
    const currency = this.detectCurrency(countryCode);
    const regional = REGIONAL_PRICING[currency];

    return Object.entries(PLAN_LIMITS).map(([plan, limits]) => ({
      plan,
      currency,
      monthly:     regional ? regional[plan as PlanTier] : limits.price.monthly,
      annual:      regional ? Math.round(regional[plan as PlanTier] * 10) : limits.price.annual,
      lifetime:    plan === 'LIFETIME' ? (regional ? regional.LIFETIME * 5 : 49900) : null,
      trialDays:   limits.trialDays,
      features: {
        sites:      limits.maxSites,
        clusters:   limits.maxClustersPerCycle,
        pages:      limits.maxPagesPerCycle,
        frequency:  limits.huntFrequency,
        channels:   limits.deliveryChannels,
        autoDeploy: limits.autoDeployIncluded,
        geo:        limits.geoEngineIncluded,
      },
    }));
  }

  async getUserPlan(userId: string): Promise<PlanTier> {
    const sub = await this.prisma.subscription.findFirst({
      where:   { userId, status: { in: ['ACTIVE','TRIALING'] } },
      orderBy: { createdAt: 'desc' },
    });
    return (sub?.plan as PlanTier) ?? 'STARTER';
  }

  detectCurrency(countryCode: string): string {
    const map: Record<string, string> = {
      CM:'XAF',GA:'XAF',CF:'XAF',CG:'XAF',TD:'XAF',GQ:'XAF',
      SN:'XOF',CI:'XOF',BF:'XOF',ML:'XOF',BJ:'XOF',NE:'XOF',TG:'XOF',GW:'XOF',
      CA:'CAD', GH:'GHS', NG:'NGN',
      FR:'EUR',DE:'EUR',BE:'EUR',ES:'EUR',IT:'EUR',PT:'EUR',NL:'EUR',
    };
    return map[countryCode?.toUpperCase()] ?? 'USD';
  }
}

// Feature → minimum plan required
const FEATURE_PLAN_MAP = {
  hunt_weekly:        'PRO',
  hunt_daily:         'AGENCY',
  whatsapp_delivery:  'PRO',
  sms_delivery:       'AGENCY',
  auto_deploy:        'AGENCY',
  multiple_sites:     'PRO',
  geo_engine:         'STARTER',
  momentum_signals:   'PRO',
  ahrefs_connector:   'PRO',
  crm_connector:      'AGENCY',
  ads_connector:      'AGENCY',
} as const;
