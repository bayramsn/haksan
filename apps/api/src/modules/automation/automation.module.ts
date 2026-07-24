import { Module } from '@nestjs/common';
import { MailerModule } from '../../shared/mailer/mailer.module';
import { AutomationService } from './automation.service';

@Module({
  imports: [MailerModule],
  providers: [AutomationService],
})
export class AutomationModule {}
