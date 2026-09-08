import { Module } from '@nestjs/common';
import { AuditService } from '../../shared/database/audit.service';
import { AdminLookupsController } from './admin-lookups.controller';
import { AdminController } from './admin.controller';
import { TechnicalImportService } from './technical-import.service';
import { LaserProfilesModule } from '../products/laser-profiles.module';

@Module({ imports: [LaserProfilesModule], controllers: [AdminController, AdminLookupsController], providers: [AuditService, TechnicalImportService] })
export class AdminModule {}
