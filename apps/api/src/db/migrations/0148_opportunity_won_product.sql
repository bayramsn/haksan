-- Bir fırsatta birden çok teklif yaşayabilir. Fırsat WIN'e geçtiğinde SATILAN
-- (onaylanmış) tekliflerin makineleri burada dondurulur: teklifler sonradan
-- revize edilse de "hangi makine satıldı" kaydı bozulmaz. `lost_product_name`
-- ile aynı rolü oynar, aynı genişlikte tutulur.
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "won_product_name" varchar(512);
