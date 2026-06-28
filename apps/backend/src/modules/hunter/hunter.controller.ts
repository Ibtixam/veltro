import { Controller, Post, Get, Put, Body, Param, Req, UseGuards } from '@nestjs/common';
import { FreeTierGuardService } from '../cost-control/free-tier-guard.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { HuntSchedulerService } from '../scheduler/hunt-scheduler.service';
import { PrismaService } from '../prisma/prisma.service';
import { z } from 'zod';

const HuntConfigSchema = z.object({
  domain:       z.string().url(),
  seedKeywords: z.array(z.string()).min(1).max(20),
  lang:         z.enum(['en', 'fr', 'both']).default('en'),
  country:      z.string().length(2).default('us'),
  competitors:  z.array(z.string()).default([]),
});

@Controller('hunter')
export class HunterController {
  constructor(
    private readonly scheduler: HuntSchedulerService,
    private readonly prisma:    PrismaService,
    private readonly freeTier:  FreeTierGuardService,
  ) {}

  // Save/update hunt config for a subscription
  @Put('config')
  @UseGuards(JwtAuthGuard)
  async saveConfig(@Req() req: any, @Body() body: unknown) {
    const parsed = HuntConfigSchema.safeParse(body);
    if (!parsed.success) return { error: parsed.error.flatten() };

    const domain = new URL(parsed.data.domain).hostname.replace('www.', '');

    // Find active subscription for this user
    const sub = await this.prisma.subscription.findFirst({
      where: { userId: req.user.id, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    });
    if (!sub) return { error: 'No active subscription found' };

    const config = await this.prisma.huntConfig.upsert({
      where:  { subscriptionId: sub.id },
      update: { ...parsed.data, domain },
      create: { subscriptionId: sub.id, ...parsed.data, domain },
    });

    return { success: true, config };
  }

  // Trigger immediate hunt (manual, within plan limits)
  @Post('trigger')
  @UseGuards(JwtAuthGuard)
  async triggerNow(@Req() req: any) {
    const sub = await this.prisma.subscription.findFirst({
      where: { userId: req.user.id, status: 'ACTIVE' },
    });
    if (!sub) return { error: 'No active subscription' };

    await this.freeTier.enforce(req.user?.id ?? req.user?.sub, 'hunt');
    const result = await this.scheduler.triggerManualHunt(sub.id);
    return { success: true, jobId: result.jobId, message: 'Hunt started — ZIP will be emailed when ready' };
  }

  // Hunt history for dashboard
  @Get('history')
  @UseGuards(JwtAuthGuard)
  async getHistory(@Req() req: any) {
    const cycles = await this.prisma.huntCycle.findMany({
      where:   { userId: req.user.id },
      orderBy: { cycleDate: 'desc' },
      take:    20,
      select: {
        id: true, plan: true, cycleDate: true,
        totalOpportunities: true, criticalCount: true,
        pagesGenerated: true, estimatedTraffic: true,
        deliveredAt: true,
        site: { select: { domain: true } },
      },
    });
    return {
      cycles: cycles.map(({ site, ...c }) => ({
        ...c,
        domain: site?.domain ?? null,
      })),
    };
  }

  // Pricing endpoint (public)
  @Get('pricing')
  getPricing() {
    return {
      plans: [
        { id: 'STARTER',  name: 'Starter',  cadence: 'Monthly',  clusters: 5,   pages: 2,  price_monthly: 29,  price_annual: 290 },
        { id: 'PRO',      name: 'Pro',       cadence: 'Weekly',   clusters: 20,  pages: 5,  price_monthly: 79,  price_annual: 790 },
        { id: 'AGENCY',   name: 'Agency',    cadence: 'Daily',    clusters: 999, pages: 15, price_monthly: 249, price_annual: 2490 },
        { id: 'LIFETIME', name: 'Lifetime',  cadence: 'Weekly',   clusters: 50,  pages: 10, price_monthly: null, price_annual: null, price_lifetime: 499 },
      ]
    };
  }
}
