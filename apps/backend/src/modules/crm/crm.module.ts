import { Module } from '@nestjs/common';
import { CrmService } from './crm.service';
import { CrmController } from './crm.controller';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [CrmController],
  providers: [CrmService, TenantGuard],
  exports: [CrmService],
})
export class CrmModule {}
