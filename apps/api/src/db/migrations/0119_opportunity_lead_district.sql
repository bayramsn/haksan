-- Fırsat/lead kartında il (lead_city) yanında ilçe de tutulur; firma ana kaydı
-- açıldığında companies.district alanına taşınır.
ALTER TABLE "opportunities"
  ADD COLUMN IF NOT EXISTS "lead_district" varchar(120);
