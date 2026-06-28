import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bullmq';

// Core infrastructure
import { PrismaModule } from './modules/prisma/prisma.module';
import { InfraModule } from './modules/infra/infra.module';
import { AuthModule } from './modules/auth/auth.module';

// Feature modules
import { BillingModule } from './modules/billing/billing.module';
import { OnboardingModule } from './modules/onboarding/onboarding.module';
import { ConnectorsModule } from './modules/connectors/connectors.module';
import { HunterModule } from './modules/hunter/hunter.module';
import { PaymentModule } from './modules/payment/payment.module';

// i18n dynamic translation module
import { I18nModule } from './modules/i18n/i18n.module';
import { VideoAgentModule } from './modules/video-agent/video-agent.module';
import { AdminModule } from './modules/admin/admin.module';
import { CmsModule } from './modules/cms/cms.module';
import { CrmModule } from './modules/crm/crm.module';
import { ContentModule } from './modules/content/content.module';
import { TrialModule } from './modules/trial/trial.module';
import { AcquisitionModule } from './modules/acquisition/acquisition.module';
import { HealthModule } from './modules/health/health.module';
import { ClusteringModule } from './modules/clustering/clustering.module';
import { CostControlModule } from './modules/cost-control/cost-control.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 200 }]),

    BullModule.forRootAsync({
      imports:    [ConfigModule],
      inject:     [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          url:                  config.get<string>('REDIS_URL', 'redis://localhost:6379'),
          maxRetriesPerRequest: null,
          enableOfflineQueue:   false,
          lazyConnect:          true,
        },
      }),
    }),

    PrismaModule,
    InfraModule,
    AuthModule,
    BillingModule,
    OnboardingModule,
    ConnectorsModule,
    HunterModule,
    PaymentModule,
    I18nModule,
    VideoAgentModule,
    AdminModule,
    CmsModule,
    CrmModule,
    ContentModule,
    TrialModule,
    AcquisitionModule,
    HealthModule,
    ClusteringModule,
    CostControlModule,
  ],
})
export class AppModule {}
