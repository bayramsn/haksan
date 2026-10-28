import { Module } from '@nestjs/common';
import { CompaniesModule } from '../companies/companies.module';
import { ContactsModule } from '../contacts/contacts.module';
import { OpportunitiesModule } from '../opportunities/opportunities.module';
import { TasksModule } from '../tasks/tasks.module';
import { ActivitiesModule } from '../activities/activities.module';
import { CallAssistantController, MobileCallEventsController } from './call-assistant.controller';
import { CallAssistantService } from './call-assistant.service';

@Module({ imports: [CompaniesModule, ContactsModule, OpportunitiesModule, TasksModule, ActivitiesModule], controllers: [CallAssistantController, MobileCallEventsController], providers: [CallAssistantService] })
export class CallAssistantModule {}
