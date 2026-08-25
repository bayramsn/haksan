import { Module } from '@nestjs/common';
import { AccessRequestsController, CompaniesController } from './companies.controller';
import { CompaniesService } from './companies.service';
import { AuditService } from '../../shared/database/audit.service';
import { CompanyContactImportService } from './company-contact-import.service';
import { CompanyMediaController } from './company-media.controller';
import { CompanyMediaService } from './company-media.service';
import { CompanyReferencesController } from './company-references.controller';
import { CompanyReferencesService } from './company-references.service';

@Module({
  controllers: [CompaniesController, AccessRequestsController, CompanyMediaController, CompanyReferencesController],
  providers: [CompaniesService, CompanyContactImportService, CompanyMediaService, CompanyReferencesService, AuditService],
  exports: [CompaniesService],
})
export class CompaniesModule {}
