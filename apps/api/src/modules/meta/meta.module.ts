import { Module } from '@nestjs/common';
import { AuditService } from '../../shared/database/audit.service';
import { MetaCredentialService } from './meta-credential.service';
import { MetaGraphClient } from './meta-graph.client';
import { MetaJobsService } from './meta-jobs.service';
import { MetaController, MetaOauthController, MetaWebhookController } from './meta.controller';
import { MetaService } from './meta.service';
import { MetaWebhookService } from './meta-webhook.service';

@Module({
  controllers: [MetaController, MetaWebhookController, MetaOauthController],
  providers: [MetaService, MetaWebhookService, MetaJobsService, MetaGraphClient, MetaCredentialService, AuditService],
  exports: [MetaService],
})
export class MetaModule {}
