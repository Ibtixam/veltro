import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * FreeTierGuardService — minimizes OUR cost while a user is on the free trial.
 * Policy (server-side, sovereign):
 *   - Hard caps on expensive ops during TRIALING (AI calls, videos, manual hunts).
 *   - Expensive AI features use the CHEAP cascade tail (flag returned to caller).
 *   - Video generation is OFF during trial (most expensive op).
 *   - Paid (ACTIVE) users are unlimited per their plan.
 * Counters live on the subscription and reset to 0 on conversion to ACTIVE.
 */

// Free-trial hard limits — tune to your token economics.
export const FREE_LIMITS = {
  aiCalls: Number(process.env.FREE_TRIAL_AI_CALLS ?? 15),
  videos:  Number(process.env.FREE_TRIAL_VIDEOS ?? 0),    // costliest op — off by default
  hunts:   Number(process.env.FREE_TRIAL_HUNTS ?? 1),
};

export type CostlyOp = 'aiCall' | 'video' | 'hunt';

@Injectable()
export class FreeTierGuardService {
  private readonly logger = new Logger(FreeTierGuardService.name);
  constructor(private readonly prisma: PrismaService) {}

  /** Returns the active subscription + whether the user is on a (cost-bearing) trial. */
  private async sub(userId: string) {
    return this.prisma.subscription.findFirst({
      where: { userId, status: { in: ['ACTIVE', 'TRIALING'] } },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Enforce a costly op. ACTIVE → always allowed. TRIALING → checked against
   * FREE_LIMITS and the counter incremented. Throws 403 when the cap is hit.
   * Returns { cheapCascade: true } during trial so callers use the cheap model tail.
   */
  async enforce(userId: string, op: CostlyOp): Promise<{ cheapCascade: boolean }> {
    const sub = await this.sub(userId);
    if (!sub) throw new ForbiddenException('No active subscription');
    if (sub.status === 'ACTIVE') return { cheapCascade: false };

    // TRIALING — apply hard caps.
    const map: Record<CostlyOp, { field: 'trialAiCalls' | 'trialVideosMade' | 'trialHuntsRun'; limit: number; label: string }> = {
      aiCall: { field: 'trialAiCalls',    limit: FREE_LIMITS.aiCalls, label: 'AI analyses' },
      video:  { field: 'trialVideosMade', limit: FREE_LIMITS.videos,  label: 'videos' },
      hunt:   { field: 'trialHuntsRun',   limit: FREE_LIMITS.hunts,   label: 'hunts' },
    };
    const { field, limit, label } = map[op];
    const used = (sub as any)[field] as number;

    if (used >= limit) {
      throw new ForbiddenException(
        limit === 0
          ? `${label} are not available on the free trial — upgrade to unlock.`
          : `Free trial limit reached (${limit} ${label}). Upgrade to continue.`,
      );
    }

    await this.prisma.subscription.update({ where: { id: sub.id }, data: { [field]: used + 1 } as any });
    this.logger.debug(`trial ${op}: ${used + 1}/${limit} for ${userId}`);
    return { cheapCascade: true };   // trial users always get the cheap cascade tail
  }

  /** Remaining free-trial allowance, for dashboard display. */
  async remaining(userId: string) {
    const sub = await this.sub(userId);
    if (!sub || sub.status === 'ACTIVE') return { onTrial: false };
    return {
      onTrial: true,
      aiCalls: Math.max(0, FREE_LIMITS.aiCalls - sub.trialAiCalls),
      videos: Math.max(0, FREE_LIMITS.videos - sub.trialVideosMade),
      hunts: Math.max(0, FREE_LIMITS.hunts - sub.trialHuntsRun),
    };
  }
}
