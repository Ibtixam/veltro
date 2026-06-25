import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';

// ─── PLAN DEFINITIONS ────────────────────────────────────────────────────

export const PLAN_CONFIG = {
  STARTER: {
    cronExpression: '0 8 1 * *',      // Monthly — 1st at 08:00
    maxClusters: 5,
    maxPagesPerCycle: 2,
    minClusterScore: 65,
    label: 'Monthly Hunt',
    price: { monthly: 2900, annual: 29000 },  // cents
  },
  PRO: {
    cronExpression: '0 8 * * 1',      // Weekly — Every Monday 08:00
    maxClusters: 20,
    maxPagesPerCycle: 5,
    minClusterScore: 60,
    label: 'Weekly Hunt',
    price: { monthly: 7900, annual: 79000 },
  },
  AGENCY: {
    cronExpression: '0 6 * * *',      // Daily — Every day 06:00
    maxClusters: 999,
    maxPagesPerCycle: 15,
    minClusterScore: 50,
    label: 'Daily Hunt',
    price: { monthly: 24900, annual: 249000 },
  },
  LIFETIME: {
    cronExpression: '0 8 * * 1',      // Weekly
    maxClusters: 50,
    maxPagesPerCycle: 10,
    minClusterScore: 55,
    label: 'Weekly Hunt (Lifetime)',
    price: { monthly: 0, annual: 0, lifetime: 49900 },
  },
} as const;

export type PlanTier = keyof typeof PLAN_CONFIG;

// ─── SERVICE ─────────────────────────────────────────────────────────────

@Injectable()
export class HuntSchedulerService {
  private readonly logger = new Logger(HuntSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('hunt-jobs') private readonly huntQueue: Queue,
  ) {}

  // ─── MONTHLY TRIGGER (STARTER) ────────────────────────────────────────
  @Cron('0 8 1 * *', { name: 'monthly-hunt' })
  async runMonthlyHunt() {
    await this.enqueuePlanHunts('STARTER');
  }

  // ─── WEEKLY TRIGGER (PRO + LIFETIME) ─────────────────────────────────
  @Cron('0 8 * * 1', { name: 'weekly-hunt' })
  async runWeeklyHunt() {
    await this.enqueuePlanHunts('PRO');
    await this.enqueuePlanHunts('LIFETIME');
  }

  // ─── DAILY TRIGGER (AGENCY) ───────────────────────────────────────────
  @Cron('0 6 * * *', { name: 'daily-hunt' })
  async runDailyHunt() {
    await this.enqueuePlanHunts('AGENCY');
  }

  // ─── ENQUEUE ALL SUBSCRIPTIONS FOR A PLAN ────────────────────────────
  private async enqueuePlanHunts(plan: PlanTier) {
    const cfg = PLAN_CONFIG[plan];

    const subscriptions = await this.prisma.subscription.findMany({
      where: { plan, status: 'ACTIVE' },
      include: { user: true, huntConfig: true },
    });

    this.logger.log(`Enqueuing ${plan} hunts: ${subscriptions.length} subscriptions`);

    for (const sub of subscriptions) {
      if (!sub.huntConfig) {
        this.logger.warn(`Subscription ${sub.id} has no HuntConfig — skipping`);
        continue;
      }

      await this.huntQueue.add(
        'run-hunt',
        {
          subscriptionId: sub.id,
          userId: sub.userId,
          userEmail: sub.user.email,
          userName: sub.user.name,
          huntConfig: {
            domain:          sub.huntConfig.domain,
            seedKeywords:    sub.huntConfig.seedKeywords,
            lang:            sub.huntConfig.lang,
            country:         sub.huntConfig.country,
            competitors:     sub.huntConfig.competitors,
            maxClusters:     cfg.maxClusters,
            maxPagesPerCycle: cfg.maxPagesPerCycle,
            minClusterScore: cfg.minClusterScore,
          },
          plan,
          cycleDate: new Date().toISOString(),
        },
        {
          attempts:    3,
          backoff:     { type: 'exponential', delay: 60_000 },
          removeOnComplete: 50,
          removeOnFail:     20,
        }
      );
    }
  }

  // ─── MANUAL TRIGGER (admin / on-demand) ──────────────────────────────
  async triggerManualHunt(subscriptionId: string): Promise<{ jobId: string }> {
    const sub = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: { user: true, huntConfig: true },
    });

    if (!sub || !sub.huntConfig) throw new Error('Subscription or config not found');

    const plan = sub.plan as PlanTier;
    const cfg  = PLAN_CONFIG[plan];

    const job = await this.huntQueue.add('run-hunt', {
      subscriptionId: sub.id,
      userId: sub.userId,
      userEmail: sub.user.email,
      userName: sub.user.name,
      huntConfig: {
        domain:          sub.huntConfig.domain,
        seedKeywords:    sub.huntConfig.seedKeywords,
        lang:            sub.huntConfig.lang,
        country:         sub.huntConfig.country,
        competitors:     sub.huntConfig.competitors,
        maxClusters:     cfg.maxClusters,
        maxPagesPerCycle: cfg.maxPagesPerCycle,
        minClusterScore: cfg.minClusterScore,
      },
      plan,
      cycleDate: new Date().toISOString(),
    });

    return { jobId: job.id! };
  }
}
