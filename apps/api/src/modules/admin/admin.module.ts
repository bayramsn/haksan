import { Module } from '@nestjs/common';
import { AuditService } from '../../shared/database/audit.service';
import { AdminController } from './admin.controller';

@Module({ controllers: [AdminController], providers: [AuditService] })
export class AdminModule {}
