import { Module } from '@nestjs/common';
import { ClusteringController } from './clustering.controller';
import { ClusteringService } from './clustering.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ClusteringController],
  providers: [ClusteringService],
  exports: [ClusteringService],
})
export class ClusteringModule {}
