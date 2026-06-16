import { Module } from '@nestjs/common';
import { QuotesModule } from '../quotes/quotes.module';
import { LifecycleController, PublicPassportController } from './lifecycle.controller';
import { LifecycleService } from './lifecycle.service';

@Module({
  imports: [QuotesModule],
  controllers: [LifecycleController, PublicPassportController],
  providers: [LifecycleService],
  exports: [LifecycleService],
})
export class LifecycleModule {}
