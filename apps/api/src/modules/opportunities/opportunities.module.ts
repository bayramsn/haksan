import { Module } from '@nestjs/common';
import { CompetitorsController } from './competitors.controller';
import { OpportunitiesController } from './opportunities.controller';
import { OpportunitiesService } from './opportunities.service';
import { AuditService } from '../../shared/database/audit.service';

@Module({
  controllers: [OpportunitiesController, CompetitorsController],
  providers: [OpportunitiesService, AuditService],
  exports: [OpportunitiesService],
})
export class OpportunitiesModule {}
