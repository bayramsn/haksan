-- Yıl sonu raporundaki "kabul/kazanma nedeni" için fırsatlara kazanma nedeni alanı.
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "won_reason" varchar(255);
