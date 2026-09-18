import { Module } from '@nestjs/common';
import { ReportsModule } from '../reports/reports.module';
import { MailerModule } from '../../shared/mailer/mailer.module';
import { PdfModule } from '../../shared/pdf/pdf.module';
import { AutomationService } from './automation.service';

@Module({
  imports: [MailerModule, ReportsModule, PdfModule],
  providers: [AutomationService],
})
export class AutomationModule {}
