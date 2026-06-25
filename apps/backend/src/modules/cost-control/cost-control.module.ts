import { Module } from '@nestjs/common';
import { FreeTierGuardService } from './free-tier-guard.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [FreeTierGuardService],
  exports: [FreeTierGuardService],
})
export class CostControlModule {}
