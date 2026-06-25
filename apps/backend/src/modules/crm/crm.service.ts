import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type LeadStatus = 'NEW'|'CONTACTED'|'QUALIFIED'|'PROPOSAL'|'WON'|'LOST';
type DealStage = 'LEAD'|'DISCOVERY'|'PROPOSAL'|'NEGOTIATION'|'CLOSED_WON'|'CLOSED_LOST';

@Injectable()
export class CrmService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Contacts ──────────────────────────────────────────────────────────
  listContacts(ownerId: string, status?: LeadStatus) {
    return this.prisma.contact.findMany({
      where: { ownerId, ...(status ? { status } : {}) },
      orderBy: { updatedAt: 'desc' },
      include: { deals: true, _count: { select: { activities: true } } },
    });
  }

  async getContact(ownerId: string, id: string) {
    const c = await this.prisma.contact.findFirst({
      where: { id, ownerId },
      include: { deals: true, activities: { orderBy: { createdAt: 'desc' } } },
    });
    if (!c) throw new NotFoundException('Contact not found');
    return c;
  }

  createContact(ownerId: string, data: any) {
    return this.prisma.contact.create({ data: { ...data, ownerId } });
  }

  async updateContact(ownerId: string, id: string, data: any) {
    await this.assertOwned(ownerId, id);
    return this.prisma.contact.update({ where: { id }, data });
  }

  async deleteContact(ownerId: string, id: string) {
    await this.assertOwned(ownerId, id);
    return this.prisma.contact.delete({ where: { id } });
  }

  // ── Deals ─────────────────────────────────────────────────────────────
  createDeal(ownerId: string, contactId: string, data: any) {
    return this.prisma.deal.create({ data: { ...data, ownerId, contactId } });
  }

  updateDeal(ownerId: string, id: string, data: any) {
    return this.prisma.deal.updateMany({ where: { id, ownerId }, data }).then(() =>
      this.prisma.deal.findUnique({ where: { id } }));
  }

  /** Kanban pipeline: deals grouped by stage with weighted totals. */
  async pipeline(ownerId: string) {
    const deals = await this.prisma.deal.findMany({
      where: { ownerId }, include: { contact: { select: { name: true, company: true } } },
      orderBy: { updatedAt: 'desc' },
    });
    const stages: DealStage[] = ['LEAD','DISCOVERY','PROPOSAL','NEGOTIATION','CLOSED_WON','CLOSED_LOST'];
    const byStage = Object.fromEntries(stages.map(s => [s, { deals: [] as any[], total: 0, weighted: 0 }]));
    for (const d of deals) {
      const b = byStage[d.stage];
      b.deals.push(d); b.total += d.value; b.weighted += d.value * (d.probability / 100);
    }
    return byStage;
  }

  // ── Activities ────────────────────────────────────────────────────────
  addActivity(ownerId: string, contactId: string, data: any) {
    return this.prisma.activity.create({ data: { ...data, ownerId, contactId } });
  }

  completeActivity(ownerId: string, id: string) {
    return this.prisma.activity.updateMany({ where: { id, ownerId }, data: { done: true } });
  }

  // ── Metrics ───────────────────────────────────────────────────────────
  async metrics(ownerId: string) {
    const [total, won, openDeals, pipelineValue] = await Promise.all([
      this.prisma.contact.count({ where: { ownerId } }),
      this.prisma.contact.count({ where: { ownerId, status: 'WON' } }),
      this.prisma.deal.count({ where: { ownerId, stage: { notIn: ['CLOSED_WON','CLOSED_LOST'] } } }),
      this.prisma.deal.aggregate({ _sum: { value: true }, where: { ownerId, stage: { notIn: ['CLOSED_WON','CLOSED_LOST'] } } }),
    ]);
    return { totalContacts: total, won, winRate: total ? Math.round((won / total) * 100) : 0,
      openDeals, pipelineValue: pipelineValue._sum.value ?? 0 };
  }

  private async assertOwned(ownerId: string, id: string) {
    const c = await this.prisma.contact.findFirst({ where: { id, ownerId }, select: { id: true } });
    if (!c) throw new NotFoundException('Contact not found');
  }
}
