import { Module } from '@nestjs/common';
import { ServiceController } from './service.controller';
import { PublicServiceComplaintsController, ServiceComplaintsController } from './service-complaints.controller';

@Module({ controllers: [ServiceController, ServiceComplaintsController, PublicServiceComplaintsController] })
export class ServiceModule {}
