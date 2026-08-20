import { Module } from '@nestjs/common';
import { QuotesModule } from '../quotes/quotes.module';
import { CallAssistantController } from './call-assistant.controller';
import { CallAssistantService } from './call-assistant.service';

@Module({
  imports: [QuotesModule],
  controllers: [CallAssistantController],
  providers: [CallAssistantService],
  exports: [CallAssistantService],
})
export class CallAssistantModule {}
