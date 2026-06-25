import { Global, Module } from '@nestjs/common';
import { EncryptionService } from '../encryption/encryption.service';
import { CDNUploadService } from '../cdn-upload/cdn-upload.service';
import { PlanGuardService } from '../plan-guard/plan-guard.service';
import { PrismaModule } from '../prisma/prisma.module';

// Global module — registers once, available everywhere without re-importing
@Global()
@Module({
  imports: [PrismaModule],
  providers: [EncryptionService, CDNUploadService, PlanGuardService],
  exports:   [EncryptionService, CDNUploadService, PlanGuardService],
})
export class InfraModule {}
