import { Module } from '@nestjs/common';
import { AcquisitionService } from './acquisition.service';
import { AcquisitionController } from './acquisition.controller';
import { CentralEngineClient } from './central-engine.client';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [AcquisitionController],
  providers: [AcquisitionService, CentralEngineClient],
  exports: [AcquisitionService],
})
export class AcquisitionModule {}
