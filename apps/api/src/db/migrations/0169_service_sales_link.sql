-- Satış ↔ servis bağı.
-- service_tickets.opportunity_id: makinenin geldiği satış (cihazdan türetilir).
-- opportunities.source_service_ticket_id: servisten satışa iletilen lead'in kaynağı.
ALTER TABLE "service_tickets" ADD COLUMN IF NOT EXISTS "opportunity_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_tickets_opportunity_id_opportunities_id_fk') THEN
    ALTER TABLE "service_tickets" ADD CONSTRAINT "service_tickets_opportunity_id_opportunities_id_fk"
      FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE SET NULL;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "service_tickets_opportunity_idx" ON "service_tickets" ("opportunity_id");
--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "source_service_ticket_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'opportunities_source_service_ticket_id_service_tickets_id_fk') THEN
    ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_source_service_ticket_id_service_tickets_id_fk"
      FOREIGN KEY ("source_service_ticket_id") REFERENCES "service_tickets"("id") ON DELETE SET NULL;
  END IF;
END $$;
--> statement-breakpoint
-- Bir servis kaydından en fazla bir canlı lead: çift tıklama / yeniden deneme ikinci lead açamaz.
CREATE UNIQUE INDEX IF NOT EXISTS "opportunities_source_service_ticket_unique" ON "opportunities" ("source_service_ticket_id") WHERE "deleted_at" IS NULL AND "source_service_ticket_id" IS NOT NULL;
--> statement-breakpoint
-- Mevcut kayıtlar: cihazı bir satışa bağlı olan servis kayıtlarını o satışa bağla.
-- customer_devices.opportunity_id FK değil; yalnız gerçekten var olan fırsatlar alınır.
UPDATE "service_tickets" AS t
SET "opportunity_id" = d."opportunity_id"
FROM "customer_devices" AS d
JOIN "opportunities" AS o ON o."id" = d."opportunity_id" AND o."tenant_id" = d."tenant_id"
WHERE t."customer_device_id" = d."id"
  AND t."tenant_id" = d."tenant_id"
  AND d."company_id" = o."company_id"
  AND d."deleted_at" IS NULL
  AND o."deleted_at" IS NULL
  AND t."opportunity_id" IS NULL;
