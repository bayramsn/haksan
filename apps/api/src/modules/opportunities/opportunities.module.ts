import { Module } from '@nestjs/common';
import { CompetitorsController } from './competitors.controller';
import { OpportunitiesController } from './opportunities.controller';
import { LeadAssignmentRulesController } from './lead-assignment-rules.controller';
import { OpportunitiesService } from './opportunities.service';
import { AuditService } from '../../shared/database/audit.service';
import { ContactsModule } from '../contacts/contacts.module';

@Module({
  imports: [ContactsModule],
  controllers: [OpportunitiesController, LeadAssignmentRulesController, CompetitorsController],
  providers: [OpportunitiesService, AuditService],
  exports: [OpportunitiesService],
})
export class OpportunitiesModule {}
