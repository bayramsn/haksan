import { Module } from '@nestjs/common';
import { MailerModule } from '../../shared/mailer/mailer.module';
import { ActivitiesModule } from '../activities/activities.module';
import { QuotesModule } from '../quotes/quotes.module';
import { PdfModule } from '../../shared/pdf/pdf.module';
import { FilesModule } from '../files/files.module';
import { CompaniesModule } from '../companies/companies.module';
import { MailController } from './mail.controller';
import { MailCampaignsController, PublicMailUnsubscribeController } from './mail-campaigns.controller';
import { MailCampaignsService } from './mail-campaigns.service';

@Module({
  // QuotesModule: teklif maili ekindeki PDF sunucuda üretilir.
  // FilesModule: kullanıcının eklediği dosyalar aynı erişim süzgecinden okunur.
  imports: [MailerModule, ActivitiesModule, QuotesModule, PdfModule, FilesModule, CompaniesModule],
  controllers: [MailCampaignsController, PublicMailUnsubscribeController, MailController],
  providers: [MailCampaignsService],
})
export class MailModule {}
