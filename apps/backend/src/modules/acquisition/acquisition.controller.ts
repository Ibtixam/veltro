import { Controller, Get, Post, Param, Body, Query, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AcquisitionService } from './acquisition.service';

@Controller('api/acquisition')
@UseGuards(JwtAuthGuard)
export class AcquisitionController {
  constructor(private readonly acq: AcquisitionService) {}
  private uid(req: any): string { return req.user?.id ?? req.user?.sub; }

  // ICP — server-only fields are stripped in the service before returning
  @Get('profiles')  profiles(@Req() req: any) { return this.acq.listProfiles(this.uid(req)); }
  @Post('profiles') createProfile(@Req() req: any, @Body() b: any) { return this.acq.createProfile(this.uid(req), b); }

  // Cohorts (circuit-breaker bounded)
  @Post('profiles/:id/cohorts')
  openCohort(@Req() req: any, @Param('id') id: string, @Body() b: any) {
    return this.acq.openCohort(this.uid(req), id, b);
  }
  @Post('cohorts/:id/run')
  run(@Req() req: any, @Param('id') id: string) { return this.acq.runDiscovery(this.uid(req), id); }

  // Prospects (engineData stripped)
  @Get('prospects') prospects(@Req() req: any, @Query('cohortId') cohortId?: string) {
    return this.acq.listProspects(this.uid(req), cohortId);
  }
  @Post('prospects/:id/convert')
  convert(@Req() req: any, @Param('id') id: string) { return this.acq.convertToContact(this.uid(req), id); }
}
