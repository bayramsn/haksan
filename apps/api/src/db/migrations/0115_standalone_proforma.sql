-- Tekliften bağımsız ("hızlı") proforma: küçük/ad-hoc işler için teklif açmadan
-- proforma kesilebilmesi gerekiyor, bu yüzden quote_id artık zorunlu değil.
ALTER TABLE "proformas"
  ALTER COLUMN "quote_id" DROP NOT NULL;

-- Firma ve para birimi bugüne kadar bağlı teklif üzerinden okunuyordu. Teklifsiz
-- kayıtlarda o yol olmadığı için doğrudan sütun olarak tutulur; listeleme sorgusu
-- teklif yoksa bunları kullanır.
ALTER TABLE "proformas"
  ADD COLUMN IF NOT EXISTS "company_id" uuid REFERENCES "companies"("id");

ALTER TABLE "proformas"
  ADD COLUMN IF NOT EXISTS "currency_id" uuid REFERENCES "currencies"("id");

-- Kayıtlı firması olmayan (serbest metin) proformalarda unvan yalnızca belge
-- anlık görüntüsünde durur; listede göstermek için burada da saklanır.
ALTER TABLE "proformas"
  ADD COLUMN IF NOT EXISTS "company_name_text" varchar(255);

-- Teklifi de firması da olmayan bir proforma kime kesildiği belirsiz bir belge olur.
ALTER TABLE "proformas"
  ADD CONSTRAINT "proformas_owner_present_check"
  CHECK ("quote_id" IS NOT NULL OR "company_id" IS NOT NULL OR "company_name_text" IS NOT NULL);

CREATE INDEX IF NOT EXISTS "proformas_company_idx" ON "proformas" ("company_id");
