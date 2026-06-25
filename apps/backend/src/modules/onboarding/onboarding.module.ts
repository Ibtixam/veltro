import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { OnboardingService } from './onboarding.service';
import { OnboardingController } from './onboarding.controller';
import { StackDetectorService } from '../stack-detector/stack-detector.service';
import { ConnectorRegistryService } from '../connectors/connector-registry.service';
import { EncryptionService } from '../encryption/encryption.service';
import { GSCConnector } from '../connectors/gsc/gsc.connector';

@Module({
  imports:     [PrismaModule, AuthModule],
  providers:   [OnboardingService, StackDetectorService, ConnectorRegistryService, EncryptionService, GSCConnector],
  controllers: [OnboardingController],
  exports:     [OnboardingService],
})
export class OnboardingModule {}
