import { Module } from '@nestjs/common';
import { AccessRequestsController, CompaniesController } from './companies.controller';
import { CompaniesService } from './companies.service';
import { AuditService } from '../../shared/database/audit.service';

@Module({
  controllers: [CompaniesController, AccessRequestsController],
  providers: [CompaniesService, AuditService],
  exports: [CompaniesService],
})
export class CompaniesModule {}
