import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
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
import { ExportsModule } from './modules/exports/exports.module';
import { LookupsModule } from './modules/lookups/lookups.module';
import { AdminModule } from './modules/admin/admin.module';
import { NoteTemplatesModule } from './modules/note-templates/note-templates.module';
import { FxModule } from './modules/fx/fx.module';
import { LifecycleModule } from './modules/lifecycle/lifecycle.module';
import { loadEnv } from './config/env';

const env = loadEnv();

@Module({
  imports: [
    // Tek global throttler. NestJS throttler v6'da forRoot içindeki TÜM isimli
    // throttler'lar her route'a uygulanır; bu yüzden ayrı bir 'login' throttler
    // tanımlamak yerine login route'ları @Throttle({ default: ... }) ile daha
    // sıkı limite override eder (bkz. auth.controller). Aksi halde login limiti
    // tüm API'ye sızar.
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', limit: env.RATE_LIMIT_GLOBAL, ttl: 60_000 }],
      // Test paketi tek IP'den yüzlerce istek atar; throttle'ı test ortamında
      // devre dışı bırak ki sahte 429'lar testleri kırmasın. Prod/dev'de aktif.
      // process.env kullan — loadEnv() cache'i vitest env'inden önce dolmuş olabilir.
      skipIf: () => process.env.NODE_ENV === 'test',
    }),
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
    ExportsModule,
    AdminModule,
    NoteTemplatesModule,
    FxModule,
    LifecycleModule,
  ],
  providers: [
    // Rate limiting'i tüm route'lara uygular. Bu guard global bağlanmadan
    // @Throttle dekoratörleri (login brute-force koruması dâhil) ETKİSİZDİR.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
