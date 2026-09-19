import { Module } from '@nestjs/common';
import { MailerModule } from '../../shared/mailer/mailer.module';
import { ActivitiesModule } from '../activities/activities.module';
import { QuotesModule } from '../quotes/quotes.module';
import { PdfModule } from '../../shared/pdf/pdf.module';
import { FilesModule } from '../files/files.module';
import { MailController } from './mail.controller';

@Module({
  // QuotesModule: teklif maili ekindeki PDF sunucuda üretilir.
  // FilesModule: kullanıcının eklediği dosyalar aynı erişim süzgecinden okunur.
  imports: [MailerModule, ActivitiesModule, QuotesModule, PdfModule, FilesModule],
  controllers: [MailController],
})
export class MailModule {}
