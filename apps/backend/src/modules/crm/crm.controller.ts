import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard, TenantResource } from '../../common/guards/tenant.guard';
import { CrmService } from './crm.service';

@Controller('crm')
@UseGuards(JwtAuthGuard, TenantGuard)
export class CrmController {
  constructor(private readonly crm: CrmService) {}

  private uid(req: any): string { return req.user?.id ?? req.user?.sub; }

  @Get('metrics')   metrics(@Req() req: any) { return this.crm.metrics(this.uid(req)); }
  @Get('pipeline')  pipeline(@Req() req: any) { return this.crm.pipeline(this.uid(req)); }

  @Get('contacts')
  list(@Req() req: any, @Query('status') status?: any) { return this.crm.listContacts(this.uid(req), status); }

  @Get('contacts/:id')
  @TenantResource('contact')
  get(@Req() req: any, @Param('id') id: string) { return this.crm.getContact(this.uid(req), id); }

  @Post('contacts')
  create(@Req() req: any, @Body() body: any) { return this.crm.createContact(this.uid(req), body); }

  @Patch('contacts/:id')
  @TenantResource('contact')
  update(@Req() req: any, @Param('id') id: string, @Body() body: any) { return this.crm.updateContact(this.uid(req), id, body); }

  @Delete('contacts/:id')
  @TenantResource('contact')
  remove(@Req() req: any, @Param('id') id: string) { return this.crm.deleteContact(this.uid(req), id); }

  @Post('contacts/:id/deals')
  @TenantResource('contact')
  addDeal(@Req() req: any, @Param('id') id: string, @Body() body: any) { return this.crm.createDeal(this.uid(req), id, body); }

  @Patch('deals/:id')
  updateDeal(@Req() req: any, @Param('id') id: string, @Body() body: any) { return this.crm.updateDeal(this.uid(req), id, body); }

  @Post('contacts/:id/activities')
  @TenantResource('contact')
  addActivity(@Req() req: any, @Param('id') id: string, @Body() body: any) { return this.crm.addActivity(this.uid(req), id, body); }

  @Patch('activities/:id/done')
  done(@Req() req: any, @Param('id') id: string) { return this.crm.completeActivity(this.uid(req), id); }
}
