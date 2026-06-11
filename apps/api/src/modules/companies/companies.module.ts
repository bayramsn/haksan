import { Module } from '@nestjs/common';
import { CompaniesController } from './companies.controller';
import { CompaniesService } from './companies.service';
import { AuditService } from '../../shared/database/audit.service';

@Module({
  controllers: [CompaniesController],
  providers: [CompaniesService, AuditService],
  exports: [CompaniesService],
})
export class CompaniesModule {}
