-- Fuar görüşmesinin bölümü (CNC / Üniversal / Sac İşleme): ürün seçici bu bölümün
-- ürünlerini getirir, Firmalar'a aktarılan firma bu bölümde açılır. Yeni kayıtta
-- zorunlu (API şeması); kolon eski kayıtlar için boş kalabilir. Departman alanı
-- arayüzden kalktı, kolonu eski veri için durur.
ALTER TABLE "trade_fair_contacts" ADD COLUMN IF NOT EXISTS "division_id" uuid;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trade_fair_contacts_division_id_fk') THEN
    ALTER TABLE "trade_fair_contacts"
      ADD CONSTRAINT "trade_fair_contacts_division_id_fk"
      FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE set null;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trade_fair_contacts_division_idx" ON "trade_fair_contacts" ("division_id");
