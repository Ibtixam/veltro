import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { OpportunityHunterService } from '../hunter/opportunity-hunter.service';
import { CodeGeneratorService } from '../codegen/code-generator.service';
import { DeliveryV2Service } from '../delivery-v2/delivery-v2.service';
import { PrismaService } from '../prisma/prisma.service';

@Processor('hunt-jobs')
export class HuntWorkerProcessor extends WorkerHost {
  private readonly logger = new Logger(HuntWorkerProcessor.name);

  constructor(
    private readonly hunter:    OpportunityHunterService,
    private readonly codegen:   CodeGeneratorService,
    private readonly delivery:  DeliveryV2Service,
    private readonly prisma:    PrismaService,
  ) { super(); }

  async process(job: Job): Promise<void> {
    const { subscriptionId, userId, userEmail, userName, huntConfig, plan, cycleDate } = job.data;

    this.logger.log(`Processing hunt job ${job.id} for ${huntConfig.domain}`);

    // ── STEP 1: Hunt opportunities ────────────────────────────────────
    await job.updateProgress(10);
    const huntResult = await this.hunter.hunt(huntConfig);
    this.logger.log(`Hunt found ${huntResult.totalOpportunities} opportunities for ${huntConfig.domain}`);

    if (huntResult.totalOpportunities === 0) {
      this.logger.warn(`No opportunities found for ${huntConfig.domain} — skipping delivery`);
      return;
    }

    // ── STEP 2: Generate code package ────────────────────────────────
    await job.updateProgress(40);
    const pkg = await this.codegen.generatePackage(
      huntConfig.domain,
      huntResult.opportunities.slice(0, huntConfig.maxPagesPerCycle),
      new Date(cycleDate),
    );

    // ── STEP 3: Save hunt record to DB ────────────────────────────────
    await job.updateProgress(70);
    const huntRecord = await this.prisma.huntCycle.create({
      data: {
        subscriptionId,
        userId,
        domain:             huntConfig.domain,
        plan,
        cycleDate:          new Date(cycleDate),
        totalOpportunities: huntResult.totalOpportunities,
        criticalCount:      huntResult.criticalCount,
        pagesGenerated:     pkg.summary.pagesGenerated,
        estimatedTraffic:   huntResult.estimatedMonthlyTrafficIfFixed,
        zipSizeBytes:       pkg.zipBuffer.length,
        huntSummary:        huntResult as any,
      },
    });

    // ── STEP 4: Deliver ZIP by email ──────────────────────────────────
    await job.updateProgress(85);
    await this.delivery.sendHuntDelivery({
      to:          userEmail,
      name:        userName ?? userEmail,
      domain:      huntConfig.domain,
      plan,
      cycleDate:   new Date(cycleDate),
      huntResult,
      zipBuffer:   pkg.zipBuffer,
      summary:     pkg.summary,
      huntCycleId: huntRecord.id,
    });

    await job.updateProgress(100);
    this.logger.log(`Hunt job ${job.id} completed — ${pkg.summary.pagesGenerated} pages delivered to ${userEmail}`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    this.logger.error(`Hunt job ${job.id} failed: ${err.message}`);
  }
}
