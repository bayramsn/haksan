import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { DatabaseModule } from './shared/database/database.module';
import { StorageModule } from './shared/storage/storage.module';
import { AuthModule } from './modules/auth/auth.module';
import { CompaniesModule } from './modules/companies/companies.module';
import { ContactsModule } from './modules/contacts/contacts.module';
import { OpportunitiesModule } from './modules/opportunities/opportunities.module';
import { ActivitiesModule } from './modules/activities/activities.module';
import { ProductsModule } from './modules/products/products.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { QuotesModule } from './modules/quotes/quotes.module';
import { OrdersModule } from './modules/orders/orders.module';
import { FilesModule } from './modules/files/files.module';
import { ServiceModule } from './modules/service/service.module';
import { FinanceModule } from './modules/finance/finance.module';
import { ReportsModule } from './modules/reports/reports.module';
import { LookupsModule } from './modules/lookups/lookups.module';
import { AdminModule } from './modules/admin/admin.module';
import { NoteTemplatesModule } from './modules/note-templates/note-templates.module';
import { loadEnv } from './config/env';

const env = loadEnv();

@Module({
  imports: [
    ThrottlerModule.forRoot([
      { name: 'global', limit: env.RATE_LIMIT_GLOBAL, ttl: 60_000 },
      { name: 'login', limit: env.RATE_LIMIT_LOGIN, ttl: 60_000 },
    ]),
    DatabaseModule,
    StorageModule,
    AuthModule,
    LookupsModule,
    CompaniesModule,
    ContactsModule,
    OpportunitiesModule,
    ActivitiesModule,
    ProductsModule,
    InventoryModule,
    QuotesModule,
    OrdersModule,
    FilesModule,
    ServiceModule,
    FinanceModule,
    ReportsModule,
    AdminModule,
    NoteTemplatesModule,
  ],
})
export class AppModule {}
