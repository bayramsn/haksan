import { Module } from '@nestjs/common';
import { ActivitiesModule } from '../activities/activities.module';
import { CallAssistantModule } from '../call-assistant/call-assistant.module';
import { QuotesModule } from '../quotes/quotes.module';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';

@Module({
  imports: [ActivitiesModule, CallAssistantModule, QuotesModule],
  controllers: [AssistantController],
  providers: [AssistantService],
})
export class AssistantModule {}
