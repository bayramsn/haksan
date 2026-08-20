import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatRealtimeService } from './chat.realtime';
import { ChatGateway } from './chat.gateway';
import { loadEnv } from '../../config/env';

// Gateway yalnızca gerçek-zaman açıkken sağlanır → kapalıyken hiç örneklenmez,
// soket sunucusu açılmaz (Render ücretsiz planda güvenli). ChatRealtimeService
// daima sağlanır; gateway yokken emit'leri no-op'tur.
const realtimeProviders = loadEnv().CHAT_REALTIME_ENABLED ? [ChatGateway] : [];

@Module({
  controllers: [ChatController],
  providers: [ChatService, ChatRealtimeService, ...realtimeProviders],
})
export class ChatModule {}
