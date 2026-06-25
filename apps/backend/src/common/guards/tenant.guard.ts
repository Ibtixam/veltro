import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SetMetadata } from '@nestjs/common';
import { PrismaService } from '../../modules/prisma/prisma.service';

/**
 * @TenantResource('contact', 'id') — declares that the route operates on a
 * resource whose ownership must match the authenticated user. The guard loads
 * the resource by the route param and confirms its ownerId/userId === req.user.id.
 *
 * This is defense-in-depth: services already scope queries by ownerId, but this
 * guard blocks any handler that forgets to, and rejects cross-tenant IDs early.
 */
export const TENANT_KEY = 'tenant_resource';
export interface TenantMeta { model: string; param: string; ownerField: string }

export const TenantResource = (model: string, param = 'id', ownerField = 'ownerId') =>
  SetMetadata(TENANT_KEY, { model, param, ownerField } as TenantMeta);

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const meta = this.reflector.getAllAndOverride<TenantMeta>(TENANT_KEY, [
      ctx.getHandler(), ctx.getClass(),
    ]);
    if (!meta) return true; // route not tenant-scoped

    const req = ctx.switchToHttp().getRequest();
    const userId: string | undefined = req.user?.id ?? req.user?.sub;
    if (!userId) throw new ForbiddenException('Authentication required');

    // Platform admins bypass tenant scoping.
    if (req.user?.role === 'ADMIN') return true;

    const resourceId = req.params?.[meta.param];
    if (!resourceId) return true; // creation routes have no id yet

    const delegate = (this.prisma as any)[meta.model];
    if (!delegate?.findUnique) throw new ForbiddenException('Invalid tenant resource');

    const record = await delegate.findUnique({ where: { id: resourceId } });
    if (!record) throw new ForbiddenException('Resource not found');

    const owner = record[meta.ownerField] ?? record.userId;
    if (owner !== userId) {
      throw new ForbiddenException('You do not have access to this resource');
    }
    return true;
  }
}
