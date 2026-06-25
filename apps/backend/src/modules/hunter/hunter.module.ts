import { CostControlModule } from '../cost-control/cost-control.module';
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { OpportunityHunterService } from './opportunity-hunter.service';
import { HunterController } from './hunter.controller';
import { HuntSchedulerService } from '../scheduler/hunt-scheduler.service';
import { HuntWorkerProcessor } from '../delivery/hunt-worker.processor';
import { CodeGeneratorService } from '../codegen/code-generator.service';
import { DeliveryV2Service } from '../delivery-v2/delivery-v2.service';
import { CDNUploadService } from '../cdn-upload/cdn-upload.service';
import { AdapterRouterService } from '../stack-adapters/adapter-router.service';
import { StackDetectorService } from '../stack-detector/stack-detector.service';
import { GEOEngineService } from '../geo-engine/geo-engine.service';
import { RevenueEngineService } from '../revenue-engine/revenue-engine.service';
import { MomentumService } from '../signals/momentum.service';
import { InternalLinksService } from '../internal-links/internal-links.service';
import { ImageGenService } from '../image-gen/image-gen.service';
import { MultiSignalMonitor } from '../monitoring/multi-signal.monitor';
import { AutoDeployService } from '../autodeploy/autodeploy.service';

@Module({
  imports: [
    CostControlModule,
    PrismaModule,
    AuthModule,
    BullModule.registerQueue({ name: 'hunt-jobs' }),
  ],
  providers: [
    OpportunityHunterService,
    HuntSchedulerService,
    HuntWorkerProcessor,
    CodeGeneratorService,
    DeliveryV2Service,
    CDNUploadService,
    AdapterRouterService,
    StackDetectorService,
    GEOEngineService,
    RevenueEngineService,
    MomentumService,
    InternalLinksService,
    ImageGenService,
    MultiSignalMonitor,
    AutoDeployService,
  ],
  controllers: [HunterController],
  exports: [OpportunityHunterService, HuntSchedulerService, RevenueEngineService],
})
export class HunterModule {}
