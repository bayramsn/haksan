-- Fuar görüşmesi sonrası arandı işareti: ne zaman ve kim tarafından arandığı.
-- `called_at` doluysa kayıt arandı sayılır; işaret kaldırılınca ikisi de boşalır.
ALTER TABLE "trade_fair_contacts" ADD COLUMN IF NOT EXISTS "called_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "trade_fair_contacts" ADD COLUMN IF NOT EXISTS "called_by" uuid;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trade_fair_contacts_called_by_fk') THEN
    ALTER TABLE "trade_fair_contacts"
      ADD CONSTRAINT "trade_fair_contacts_called_by_fk"
      FOREIGN KEY ("called_by") REFERENCES "public"."users"("id") ON DELETE set null;
  END IF;
END $$;
