-- Tenant genelinde sol menü görünürlüğü.
-- Gizleme yetkilendirmeyi değiştirmez; yalnız istemcinin navigasyon kataloğunu
-- sadeleştirir. Boş liste mevcut davranışı korur.

ALTER TABLE "tenants"
  ADD COLUMN IF NOT EXISTS "hidden_navigation_keys" jsonb NOT NULL DEFAULT '[]'::jsonb;--> statement-breakpoint

ALTER TABLE "tenants"
  DROP CONSTRAINT IF EXISTS "tenants_hidden_navigation_keys_array_check";--> statement-breakpoint

ALTER TABLE "tenants"
  ADD CONSTRAINT "tenants_hidden_navigation_keys_array_check"
  CHECK (jsonb_typeof("hidden_navigation_keys") = 'array');
