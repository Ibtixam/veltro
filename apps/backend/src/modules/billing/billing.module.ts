import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { PlanGuardService } from '../plan-guard/plan-guard.service';
import { EmailService } from '../email/email.service';

@Module({
  imports:     [PrismaModule, AuthModule],
  providers:   [BillingService, PlanGuardService, EmailService],
  controllers: [BillingController],
  exports:     [BillingService, EmailService],
})
export class BillingModule {}
