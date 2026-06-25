import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ConnectorRegistryService } from './connector-registry.service';
import { GSCConnector } from './gsc/gsc.connector';
import { GA4Connector } from './ga4/ga4.connector';
import { BingConnector } from './bing/bing.connector';
import { AhrefsConnector } from './ahrefs/ahrefs.connector';
import { CRMConnector } from './crm/crm.connector';
import { EcommerceConnector } from './ecommerce/ecommerce.connector';
import { AdsConnector } from './ads/ads.connector';
import { EncryptionService } from '../encryption/encryption.service';

@Module({
  imports:   [PrismaModule],
  providers: [
    EncryptionService,
    ConnectorRegistryService,
    GSCConnector,
    GA4Connector,
    BingConnector,
    AhrefsConnector,
    CRMConnector,
    EcommerceConnector,
    AdsConnector,
  ],
  exports: [
    ConnectorRegistryService,
    GSCConnector,
    GA4Connector,
    BingConnector,
    AhrefsConnector,
    CRMConnector,
    EcommerceConnector,
    AdsConnector,
  ],
})
export class ConnectorsModule {}
