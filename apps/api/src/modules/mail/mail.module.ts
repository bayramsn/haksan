import { Module } from '@nestjs/common';
import { MailerModule } from '../../shared/mailer/mailer.module';
import { ActivitiesModule } from '../activities/activities.module';
import { MailController } from './mail.controller';

@Module({
  imports: [MailerModule, ActivitiesModule],
  controllers: [MailController],
})
export class MailModule {}
