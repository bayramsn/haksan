import { Module } from '@nestjs/common';
import { MailerModule } from '../../shared/mailer/mailer.module';
import { ActivitiesModule } from '../activities/activities.module';
import { QuotesModule } from '../quotes/quotes.module';
import { PdfModule } from '../../shared/pdf/pdf.module';
import { MailController } from './mail.controller';

@Module({
  // QuotesModule: teklif maili ekindeki PDF sunucuda üretilir.
  imports: [MailerModule, ActivitiesModule, QuotesModule, PdfModule],
  controllers: [MailController],
})
export class MailModule {}
