-- Belgeye ÖZEL şartlar (ödeme / teslimat / garanti).
--
-- Bugüne kadar proforma ve sözleşme ekranlarındaki şart kutuları, düzenlenince
-- bağlı TEKLİFİN şartlarını (`quote_terms`) yeniden yazıyordu. Sonuç: imza
-- masasında sözleşmeye özel bir teslim şartı yazan kullanıcı, farkında olmadan
-- onaylı teklifin ve aynı teklife bağlı proformanın çıktısını da geriye dönük
-- değiştiriyordu. Şartlar artık belgenin kendi sütununda durur; teklif yalnız
-- ÖN-DOLGU kaynağıdır.
--
-- NULL = "bu belgenin kendi şartı yok" → çıktı eskisi gibi teklifin şartlarına
-- düşer. Mevcut satırların tamamı NULL alır, davranışları değişmez.
--
-- Nullable ve varsayılansız: PG11+ metadata-only ADD COLUMN, tablo yeniden
-- yazılmaz, NOT NULL/CHECK ihlali doğmaz.
ALTER TABLE "proformas" ADD COLUMN IF NOT EXISTS "terms" jsonb;
--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "terms" jsonb;
