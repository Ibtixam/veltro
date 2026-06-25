import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  /** Platform overview metrics for the admin dashboard. */
  async metrics() {
    const [users, activeSubs, payments, sites, openApprovals] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.subscription.count({ where: { status: 'ACTIVE' } }),
      this.prisma.payment.aggregate({ _sum: { amount: true }, where: { status: 'SUCCEEDED' } }),
      this.prisma.site.count(),
      this.prisma.deployApproval.count({ where: { status: 'PENDING_APPROVAL' } }).catch(() => 0),
    ]);
    return {
      totalUsers: users,
      activeSubscriptions: activeSubs,
      lifetimeRevenue: payments._sum.amount ?? 0,
      totalSites: sites,
      pendingApprovals: openApprovals,
      generatedAt: new Date().toISOString(),
    };
  }

  /** Recent signups for the admin user table. */
  async recentUsers(take = 50) {
    return this.prisma.user.findMany({
      take, orderBy: { createdAt: 'desc' },
      select: { id: true, email: true, name: true, role: true, country: true, onboardDone: true, createdAt: true },
    });
  }

  async setRole(adminId: string, userId: string, role: 'USER' | 'ADMIN', ip?: string) {
    const updated = await this.prisma.user.update({ where: { id: userId }, data: { role } });
    // RBAC requirement: every admin mutation is audited server-side.
    await this.prisma.adminAuditLog.create({
      data: { adminId, action: 'user.setRole', target: userId, meta: { role }, ip },
    });
    return updated;
  }

  /** Admin: read the server-side audit trail. */
  auditLog(take = 100) {
    return this.prisma.adminAuditLog.findMany({ take, orderBy: { createdAt: 'desc' } });
  }

  async recentPayments(take = 50) {
    return this.prisma.payment.findMany({
      take, orderBy: { createdAt: 'desc' },
      select: { id: true, amount: true, currency: true, provider: true, status: true, createdAt: true, userId: true },
    });
  }

  async subscriptions(take = 100) {
    return this.prisma.subscription.findMany({
      take, orderBy: { createdAt: 'desc' },
      select: { id: true, plan: true, cycle: true, status: true, userId: true, currentPeriodEnd: true },
    });
  }
}
