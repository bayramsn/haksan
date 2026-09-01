-- Fırsat kapanışında "kaybedildi" ile "iptal edildi" ayrışsın: iptal, rakibe
-- kaybetme değil (bütçe yok, başka yere yatırım, 2. el aldı ...). Kayıp analizi
-- yalnız gerçekten kaybedilen fırsatları saymalı.
INSERT INTO "opportunity_statuses" ("code", "name", "sort_order")
VALUES ('cancelled', 'İptal Edildi', 35)
ON CONFLICT ("code") DO NOTHING;
