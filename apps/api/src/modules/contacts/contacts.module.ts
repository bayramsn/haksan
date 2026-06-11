import { Module } from '@nestjs/common';
import { ContactsController } from './contacts.controller';
import { ContactsService } from './contacts.service';
import { AuditService } from '../../shared/database/audit.service';

@Module({
  controllers: [ContactsController],
  providers: [ContactsService, AuditService],
  exports: [ContactsService],
})
export class ContactsModule {}
