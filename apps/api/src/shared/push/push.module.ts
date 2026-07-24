import { Global, Module } from '@nestjs/common';
import { PushService } from './push.service';

/** Global — bildirim üreten her modül PushService'i enjekte edebilir. */
@Global()
@Module({
  providers: [PushService],
  exports: [PushService],
})
export class PushModule {}
