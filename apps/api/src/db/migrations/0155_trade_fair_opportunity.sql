-- Fuar görüşmesinden açılan fırsat: aynı kayıt ikinci kez fırsata çevrilmesin,
-- listede "Fırsatta" rozeti ve fırsata git bağlantısı gösterilsin.
ALTER TABLE "trade_fair_contacts" ADD COLUMN IF NOT EXISTS "opportunity_id" uuid;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trade_fair_contacts_opportunity_id_fk') THEN
    ALTER TABLE "trade_fair_contacts"
      ADD CONSTRAINT "trade_fair_contacts_opportunity_id_fk"
      FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE set null;
  END IF;
END $$;
