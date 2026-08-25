-- Özet bildirimleri (sabah brifingi gibi) tek hedefe sığmıyor: her satırı kendi
-- listesine götürebilmek için satır bazlı hedefler saklanır.
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "items" jsonb;
