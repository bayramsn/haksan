-- Üretim yılı kaldırıldı (expand-contract'ın ikinci adımı).
--
-- 0123 bu kolonu belge metnindeki "Tezgâhın üretim yılı {{YIL}} olup…" cümlesi
-- için eklemişti. Cümle şablonlardan çıktı, ürün formundan ve Excel içe/dışa
-- aktarma şablonundan da kalktı; kolona yazan/okuyan kod 1109a34e sürümüyle
-- canlıya alındı (Production Deploy 34686315362). Geriye yalnız kolon kaldı.
--
-- migration-lint: allow drop-column — yazan/okuyan kod 1109a34e ile canlıya alındı, bu sürüm yalnız kolonu düşürüyor
ALTER TABLE "product_models" DROP COLUMN IF EXISTS "production_year";
