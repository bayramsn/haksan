import { Module } from '@nestjs/common';
import { AuditService } from '../../shared/database/audit.service';
import { AdminLookupsController } from './admin-lookups.controller';
import { AdminController } from './admin.controller';

@Module({ controllers: [AdminController, AdminLookupsController], providers: [AuditService] })
export class AdminModule {}
