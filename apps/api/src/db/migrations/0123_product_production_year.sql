-- Tezgahın üretim yılı.
--
-- Proforma ve sözleşme metinleri "Tezgâhın üretim yılı 2023 olup, yeni ve
-- kullanılmamıştır" diye yazıyor ama karşılığı bir alan yoktu: şablondaki
-- {{YIL}} içinde bulunulan yıla düşüyor, 2023 üretimi bir tezgâh belgede 2026
-- görünüyordu. Yıl artık ürün kartında durur ve belgeye oradan basılır.
--
-- Nullable ve varsayılansız: PG11+ metadata-only ADD COLUMN, tablo yeniden
-- yazılmaz. Boş kalan ürünlerde şablon eskisi gibi cari yıla düşer.
ALTER TABLE "product_models" ADD COLUMN IF NOT EXISTS "production_year" integer;
