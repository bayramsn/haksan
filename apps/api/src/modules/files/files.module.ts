import { Module } from '@nestjs/common';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { AuditService } from '../../shared/database/audit.service';

@Module({
  controllers: [FilesController],
  providers: [FilesService, AuditService],
  exports: [FilesService],
})
export class FilesModule {}
