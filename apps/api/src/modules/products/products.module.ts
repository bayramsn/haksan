import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { ProductMediaController } from './product-media.controller';
import { ProductMediaService } from './product-media.service';
import { AuditService } from '../../shared/database/audit.service';

@Module({
  controllers: [ProductsController, ProductMediaController],
  providers: [ProductsService, ProductMediaService, AuditService],
  exports: [ProductsService],
})
export class ProductsModule {}
