-- Tekliften bağımsız ("hızlı") sözleşme: küçük/ad-hoc işlerde teklif açmadan
-- sözleşme kesilebilmesi gerekiyor, bu yüzden quote_id artık zorunlu değil.
-- Kalemler ve şartlar 0115'teki proforma deseniyle aynı şekilde document_snapshot
-- JSONB'sinde durur; ayrı bir kalem tablosu gerekmez.
ALTER TABLE "contracts"
  ALTER COLUMN "quote_id" DROP NOT NULL;

-- Firma ve para birimi bugüne kadar bağlı teklif üzerinden okunuyordu. Teklifsiz
-- kayıtlarda o yol olmadığı için doğrudan sütun olarak tutulur; listeleme sorgusu
-- teklif yoksa bunları kullanır.
ALTER TABLE "contracts"
  ADD COLUMN IF NOT EXISTS "company_id" uuid REFERENCES "companies"("id");

ALTER TABLE "contracts"
  ADD COLUMN IF NOT EXISTS "currency_id" uuid REFERENCES "currencies"("id");

-- Kayıtlı firması olmayan (serbest metin) sözleşmelerde unvan yalnızca belge
-- anlık görüntüsünde durur; listede göstermek için burada da saklanır.
ALTER TABLE "contracts"
  ADD COLUMN IF NOT EXISTS "company_name_text" varchar(255);

-- Teklifi de firması da olmayan bir sözleşme kiminle imzalandığı belirsiz bir belge olur.
ALTER TABLE "contracts"
  ADD CONSTRAINT "contracts_owner_present_check"
  CHECK ("quote_id" IS NOT NULL OR "company_id" IS NOT NULL OR "company_name_text" IS NOT NULL);

CREATE INDEX IF NOT EXISTS "contracts_company_idx" ON "contracts" ("company_id");
