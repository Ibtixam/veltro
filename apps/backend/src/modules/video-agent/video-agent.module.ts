import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { CostControlModule } from '../cost-control/cost-control.module';
import { QueueEvents } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { VideoAgentService } from './video-agent.service';
import { VideoAgentController } from './video-agent.controller';

@Module({
  imports: [
    CostControlModule,
    BullModule.registerQueue(
      { name: 'video-jobs' },
      { name: 'video-render' },
    ),
  ],
  controllers: [VideoAgentController],
  providers: [
    VideoAgentService,
    {
      // QueueEvents lets the orchestrator await a render job's completion.
      provide: QueueEvents,
      useFactory: (config: ConfigService) => {
        const url = config.get<string>('REDIS_URL', 'redis://localhost:6379');
        return new QueueEvents('video-render', { connection: { url } as any });
      },
      inject: [ConfigService],
    },
  ],
  exports: [VideoAgentService],
})
export class VideoAgentModule {}
