import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

const TRIAL_DAYS = 7;

/**
 * Trial lifecycle — provisions a full account WITHOUT payment, then a daily
 * cron converts (if card on file) or suspends at day 7. This is the
 * "try before you pay" path that complements webhook-on-payment provisioning.
 */
@Injectable()
export class TrialService {
  private readonly logger = new Logger(TrialService.name);
  constructor(private readonly prisma: PrismaService) {}

  /** Start a 7-day trial: creates a TRIALING subscription + provisions account. */
  async startTrial(userId: string, plan: string, domain?: string) {
    const existing = await this.prisma.subscription.findFirst({
      where: { userId, status: { in: ['TRIALING', 'ACTIVE'] } },
    });
    if (existing) throw new BadRequestException('An active subscription or trial already exists');

    const now = new Date();
    const trialEnd = new Date(now);
    trialEnd.setDate(trialEnd.getDate() + TRIAL_DAYS);

    const subscription = await this.prisma.subscription.create({
      data: {
        userId,
        plan: plan as any,
        status: 'TRIALING',
        provider: 'PAYBRIDGE_AFRICA' as any,
        amountCents: 0,
        billingCycle: 'MONTHLY' as any,
        trialEndsAt: trialEnd,
        currentPeriodStart: now,
        currentPeriodEnd: trialEnd,
      },
    });

    // Provision the account (same as paid activation, minus the charge).
    await this.prisma.user.update({ where: { id: userId }, data: { onboardStep: 'DONE', onboardDone: true } });

    let resolvedDomain = domain ?? null;
    if (!resolvedDomain) {
      const site = await this.prisma.site.findFirst({ where: { userId }, orderBy: { createdAt: 'asc' } });
      resolvedDomain = site?.domain ?? null;
    }
    if (resolvedDomain) {
      const site = await this.prisma.site.findFirst({ where: { userId, domain: resolvedDomain } });
      if (!site) await this.prisma.site.create({ data: { userId, domain: resolvedDomain, huntActive: false } });
      const cfg = await this.prisma.huntConfig.findUnique({ where: { subscriptionId: subscription.id } }).catch(() => null);
      if (!cfg) {
        await this.prisma.huntConfig.create({ data: { subscriptionId: subscription.id, domain: resolvedDomain } })
          .catch((e: any) => this.logger.warn(`Trial HuntConfig skipped: ${e.message}`));
      }
    }

    this.logger.log(`✓ Trial started for user ${userId} — plan ${plan}, ends ${trialEnd.toISOString()}`);
    return { subscription, trialEndsAt: trialEnd };
  }

  /** Day-7 job: convert trials with a payment method, suspend the rest. Runs daily 06:00 UTC. */
  @Cron('0 6 * * *', { name: 'trial-conversion' })
  async processExpiringTrials() {
    const now = new Date();
    const expired = await this.prisma.subscription.findMany({
      where: { status: 'TRIALING', trialEndsAt: { lte: now } },
    });
    if (!expired.length) return;
    this.logger.log(`Processing ${expired.length} expired trial(s)`);

    for (const sub of expired) {
      // Has the customer attached a successful payment? Then convert to ACTIVE.
      const paid = await this.prisma.payment.findFirst({
        where: { userId: sub.userId, status: 'SUCCEEDED' },
      });
      if (paid) {
        const periodEnd = new Date(now); periodEnd.setMonth(periodEnd.getMonth() + 1);
        await this.prisma.subscription.update({
          where: { id: sub.id },
          data: { status: 'ACTIVE', currentPeriodStart: now, currentPeriodEnd: periodEnd,
                  trialAiCalls: 0, trialVideosMade: 0, trialHuntsRun: 0 },
        });
        // Re-arm hunts now that the user is paying.
        await this.prisma.site.updateMany({ where: { userId: sub.userId }, data: { huntActive: true } });
        this.logger.log(`✓ Trial → ACTIVE for ${sub.userId}`);
      } else {
        // No payment — pause the account and its hunts.
        await this.prisma.subscription.update({ where: { id: sub.id }, data: { status: 'PAUSED' } });
        await this.prisma.site.updateMany({ where: { userId: sub.userId }, data: { huntActive: false } });
        this.logger.log(`Trial → PAUSED (no payment) for ${sub.userId}`);
      }
    }
  }

  /** Days remaining in the active trial (for dashboard banner). */
  async trialStatus(userId: string) {
    const sub = await this.prisma.subscription.findFirst({
      where: { userId, status: 'TRIALING' }, orderBy: { createdAt: 'desc' },
    });
    if (!sub?.trialEndsAt) return { onTrial: false, daysLeft: 0 };
    const days = Math.max(0, Math.ceil((sub.trialEndsAt.getTime() - Date.now()) / 86400000));
    return { onTrial: true, daysLeft: days, trialEndsAt: sub.trialEndsAt, plan: sub.plan };
  }
}
