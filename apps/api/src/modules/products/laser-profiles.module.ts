import { Module } from '@nestjs/common';
import { AuditService } from '../../shared/database/audit.service';
import { LaserProfilesController } from './laser-profiles.controller';
import { LaserProfilesService } from './laser-profiles.service';

@Module({ controllers: [LaserProfilesController], providers: [LaserProfilesService, AuditService], exports: [LaserProfilesService] })
export class LaserProfilesModule {}
