import { Module } from '@nestjs/common';
import { AuditService } from '../database/audit.service';
import { MailerService } from './mailer.service';
import { UserMailAccountService } from './user-mail-account.service';

@Module({
  providers: [AuditService, UserMailAccountService, MailerService],
  exports: [MailerService, UserMailAccountService],
})
export class MailerModule {}
