import { Module } from '@nestjs/common';
import { ActivitiesModule } from '../activities/activities.module';
import { CalendarModule } from '../calendar/calendar.module';
import { CallAssistantModule } from '../call-assistant/call-assistant.module';
import { CompaniesModule } from '../companies/companies.module';
import { ContactsModule } from '../contacts/contacts.module';
import { QuotesModule } from '../quotes/quotes.module';
import { ReportsModule } from '../reports/reports.module';
import { MailerModule } from '../../shared/mailer/mailer.module';
import { AssistantApprovalService } from './assistant-approval.service';
import { AssistantInboxService } from './assistant-inbox.service';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';

@Module({
  imports: [ActivitiesModule, CalendarModule, CallAssistantModule, CompaniesModule, ContactsModule, MailerModule, QuotesModule, ReportsModule],
  controllers: [AssistantController],
  providers: [AssistantApprovalService, AssistantInboxService, AssistantService],
  exports: [AssistantInboxService],
})
export class AssistantModule {}
