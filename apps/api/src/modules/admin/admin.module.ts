import { Module } from '@nestjs/common';
import { AuditService } from '../../shared/database/audit.service';
import { AdminLookupsController } from './admin-lookups.controller';
import { AdminController } from './admin.controller';
import { TechnicalImportService } from './technical-import.service';

@Module({ controllers: [AdminController, AdminLookupsController], providers: [AuditService, TechnicalImportService] })
export class AdminModule {}
