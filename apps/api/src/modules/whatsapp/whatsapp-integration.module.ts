import { Module } from '@nestjs/common';
import { WhatsAppModule } from '../../shared/whatsapp/whatsapp.module';
import { AssistantModule } from '../assistant/assistant.module';
import { WhatsAppController } from './whatsapp.controller';

@Module({
  imports: [WhatsAppModule, AssistantModule],
  controllers: [WhatsAppController],
})
export class WhatsAppIntegrationModule {}
