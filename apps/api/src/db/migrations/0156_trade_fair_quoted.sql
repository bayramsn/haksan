-- Fuar görüşmesi için "teklif verildi" işareti; arandı işaretiyle aynı yapı.
ALTER TABLE "trade_fair_contacts" ADD COLUMN IF NOT EXISTS "quoted_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "trade_fair_contacts" ADD COLUMN IF NOT EXISTS "quoted_by" uuid;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trade_fair_contacts_quoted_by_fk') THEN
    ALTER TABLE "trade_fair_contacts"
      ADD CONSTRAINT "trade_fair_contacts_quoted_by_fk"
      FOREIGN KEY ("quoted_by") REFERENCES "public"."users"("id") ON DELETE set null;
  END IF;
END $$;
