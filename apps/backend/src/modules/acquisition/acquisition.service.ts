import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CentralEngineClient } from './central-engine.client';

/**
 * AcquisitionService — discovery+prospecting orchestration.
 * RULES (Lecture A):
 *  - Scoring is NEVER computed here; it comes from CentralEngineClient.
 *  - ICP (IdealTargetProfile) is server-only; never returned to the client.
 *  - Every cohort has a hard token cap (circuit breaker).
 *  - Engine internals (engineData, signalWeights) are stripped from client output.
 */
@Injectable()
export class AcquisitionService {
  private readonly logger = new Logger(AcquisitionService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: CentralEngineClient,
  ) {}

  // ── Ideal Target Profile (SERVER-ONLY) ────────────────────────────────
  createProfile(ownerId: string, data: any) {
    return this.prisma.idealTargetProfile.create({ data: { ...data, ownerId } });
  }

  /** Returns ICPs for the owner WITHOUT sovereign fields (signalWeights stripped). */
  async listProfiles(ownerId: string) {
    const rows = await this.prisma.idealTargetProfile.findMany({ where: { ownerId } });
    return rows.map(({ signalWeights, ...safe }: any) => safe);
  }

  // ── Cohort lifecycle with circuit breaker ─────────────────────────────
  async openCohort(ownerId: string, profileId: string, opts: { targetCount?: number; tokenCapCents?: number }) {
    const profile = await this.prisma.idealTargetProfile.findFirst({ where: { id: profileId, ownerId } });
    if (!profile) throw new NotFoundException('Profile not found');
    return this.prisma.prospectCohort.create({
      data: {
        ownerId, profileId,
        targetCount: Math.min(opts.targetCount ?? 10, 100),   // small cohorts by default
        tokenCapCents: Math.min(opts.tokenCapCents ?? 500, 5000),
        status: 'OPEN',
      },
    });
  }

  /**
   * Run discovery for a cohort. Circuit breaker: refuses if already capped,
   * passes the REMAINING budget to the engine, and caps the cohort if spend
   * reaches the limit. Never scores locally.
   */
  async runDiscovery(ownerId: string, cohortId: string) {
    const cohort = await this.prisma.prospectCohort.findFirst({
      where: { id: cohortId, ownerId }, include: { profile: true },
    });
    if (!cohort) throw new NotFoundException('Cohort not found');
    if (cohort.status === 'CAPPED' || cohort.status === 'COMPLETED') {
      throw new BadRequestException(`Cohort is ${cohort.status} — circuit breaker engaged`);
    }
    const remainingBudget = cohort.tokenCapCents - cohort.tokensSpent;
    if (remainingBudget <= 0) {
      await this.prisma.prospectCohort.update({ where: { id: cohortId }, data: { status: 'CAPPED' } });
      throw new BadRequestException('Token cap reached — circuit breaker engaged');
    }

    await this.prisma.prospectCohort.update({ where: { id: cohortId }, data: { status: 'RUNNING' } });

    const result = await this.engine.discover({
      ownerId, cohortId,
      profile: {
        industries: cohort.profile.industries, countries: cohort.profile.countries,
        keywords: cohort.profile.keywords, exclusions: cohort.profile.exclusions,
        minRevenue: cohort.profile.minRevenue, maxRevenue: cohort.profile.maxRevenue,
        signalWeights: cohort.profile.signalWeights,
      },
      targetCount: cohort.targetCount,
      tokenBudgetCents: remainingBudget,
    });

    // Persist prospects — score & engineData come FROM the engine, stored sovereign.
    for (const p of result.prospects) {
      await this.prisma.prospect.create({
        data: {
          ownerId, cohortId,
          company: p.company, domain: p.domain, contactName: p.contactName,
          contactEmail: p.contactEmail, country: p.country,
          score: p.score, scoreBand: p.scoreBand,
          engineData: p.engineData as any,        // sovereign — never returned to client
          status: 'SCORED',
        },
      });
    }

    const newSpent = cohort.tokensSpent + result.tokensSpentCents;
    const capped = result.capped || newSpent >= cohort.tokenCapCents;
    await this.prisma.prospectCohort.update({
      where: { id: cohortId },
      data: {
        tokensSpent: newSpent,
        discovered: cohort.discovered + result.prospects.length,
        engineRef: result.engineRef,
        status: capped ? 'CAPPED' : 'OPEN',
      },
    });

    return { discovered: result.prospects.length, tokensSpentCents: newSpent, capped };
  }

  /** List prospects for the owner — sovereign fields (engineData) STRIPPED. */
  async listProspects(ownerId: string, cohortId?: string) {
    const rows = await this.prisma.prospect.findMany({
      where: { ownerId, ...(cohortId ? { cohortId } : {}) },
      orderBy: { score: 'desc' },
    });
    // R2/R4: never return engineData (sovereign payload) to the client.
    return rows.map(({ engineData, ...safe }: any) => safe);
  }

  /** Convert a prospect → CRM contact (status lifecycle: → CONVERTED). */
  async convertToContact(ownerId: string, prospectId: string) {
    const p = await this.prisma.prospect.findFirst({ where: { id: prospectId, ownerId } });
    if (!p) throw new NotFoundException('Prospect not found');
    const contact = await this.prisma.contact.create({
      data: {
        ownerId, name: p.contactName ?? p.company, email: p.contactEmail,
        company: p.company, country: p.country, source: 'acquisition', status: 'QUALIFIED',
      },
    });
    await this.prisma.prospect.update({
      where: { id: prospectId },
      data: { status: 'CONVERTED', convertedContactId: contact.id, contactedAt: new Date() },
    });
    return contact;
  }
}
