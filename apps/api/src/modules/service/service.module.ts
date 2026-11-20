import { Module } from '@nestjs/common';
import { ServiceController } from './service.controller';
import { PublicServiceComplaintsController, ServiceComplaintsController } from './service-complaints.controller';
import { MaintenancePlansController } from './maintenance-plans.controller';
import { OpportunitiesModule } from '../opportunities/opportunities.module';

// Servis → satış: "Satışa ilet" lead'i fırsat servisinin kendi create akışıyla açılır.
@Module({ imports: [OpportunitiesModule], controllers: [ServiceController, ServiceComplaintsController, PublicServiceComplaintsController, MaintenancePlansController] })
export class ServiceModule {}
