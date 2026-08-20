import { Module } from '@nestjs/common';
import { AccessRequestsController, CompaniesController } from './companies.controller';
import { CompaniesService } from './companies.service';
import { AuditService } from '../../shared/database/audit.service';
import { CompanyContactImportService } from './company-contact-import.service';
import { CompanyMediaController } from './company-media.controller';
import { CompanyMediaService } from './company-media.service';

@Module({
  controllers: [CompaniesController, AccessRequestsController, CompanyMediaController],
  providers: [CompaniesService, CompanyContactImportService, CompanyMediaService, AuditService],
  exports: [CompaniesService],
})
export class CompaniesModule {}
