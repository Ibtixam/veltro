import { Controller, Get, Patch, Param, Body, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../../common/guards/roles.guard';
import { AdminService } from './admin.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('metrics')       metrics() { return this.admin.metrics(); }
  @Get('users')         users() { return this.admin.recentUsers(); }
  @Get('payments')      payments() { return this.admin.recentPayments(); }
  @Get('subscriptions') subs() { return this.admin.subscriptions(); }
  @Get('audit-log')     audit() { return this.admin.auditLog(); }

  @Patch('users/:id/role')
  setRole(@Req() req: any, @Param('id') id: string, @Body('role') role: 'USER' | 'ADMIN') {
    const adminId = req.user?.id ?? req.user?.sub;
    const ip = req.ip ?? req.headers?.['x-forwarded-for'];
    return this.admin.setRole(adminId, id, role, ip);
  }
}
