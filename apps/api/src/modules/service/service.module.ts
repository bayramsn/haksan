import { Module } from '@nestjs/common';
import { ServiceController } from './service.controller';
import { PublicServiceComplaintsController, ServiceComplaintsController } from './service-complaints.controller';
import { MaintenancePlansController } from './maintenance-plans.controller';

@Module({ controllers: [ServiceController, ServiceComplaintsController, PublicServiceComplaintsController, MaintenancePlansController] })
export class ServiceModule {}
