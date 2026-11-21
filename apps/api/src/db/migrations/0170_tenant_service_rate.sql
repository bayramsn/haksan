-- Servis saat ücreti şirket ayarı: yeni servis kayıtları bu değerle açılır.
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "service_hourly_rate" numeric(12, 2) NOT NULL DEFAULT 120;
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "service_currency" varchar(8) NOT NULL DEFAULT 'USD';
