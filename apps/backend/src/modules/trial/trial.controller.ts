import { Controller, Post, Get, Body, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TrialService } from './trial.service';

@Controller('api/trial')
@UseGuards(JwtAuthGuard)
export class TrialController {
  constructor(private readonly trial: TrialService) {}

  private uid(req: any): string { return req.user?.id ?? req.user?.sub; }

  @Post('start')
  start(@Req() req: any, @Body() body: { plan: string; domain?: string }) {
    return this.trial.startTrial(this.uid(req), body.plan, body.domain);
  }

  @Get('status')
  status(@Req() req: any) { return this.trial.trialStatus(this.uid(req)); }
}
