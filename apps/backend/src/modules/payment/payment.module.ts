import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { PayBridgeService } from './paybridge.service';
import { PaymentController } from './payment.controller';
import { EmailService } from '../email/email.service';

@Module({
  imports:     [PrismaModule, AuthModule],
  providers:   [PayBridgeService, EmailService],
  controllers: [PaymentController],
  exports:     [PayBridgeService],
})
export class PaymentModule {}
