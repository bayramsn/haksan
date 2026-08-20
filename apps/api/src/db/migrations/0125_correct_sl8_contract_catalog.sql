-- ECOCA SL-8 sözleşmesinde kullanılacak teknik veri ve standart aksesuarlar.
-- Kaynak: 18.08.2026 tarihli imzaya esas SL-8 satış sözleşmesi.
DELETE FROM "product_specs"
WHERE "product_model_id" IN (
  SELECT pm."id"
  FROM "product_models" pm
  JOIN "brands" b ON b."id" = pm."brand_id" AND b."tenant_id" = pm."tenant_id"
  WHERE pm."model_code" = 'SL-8' AND upper(b."name") = 'ECOCA'
);
--> statement-breakpoint
INSERT INTO "product_specs" (
  "id", "tenant_id", "product_model_id", "spec_key", "spec_value", "sort_order", "created_at", "updated_at"
)
SELECT gen_random_uuid(), pm."tenant_id", pm."id", values_row."spec_key", values_row."spec_value", values_row."sort_order", now(), now()
FROM "product_models" pm
JOIN "brands" b ON b."id" = pm."brand_id" AND b."tenant_id" = pm."tenant_id"
CROSS JOIN (VALUES
  ('Maks. Tornalama Kapasitesi', 'Ø 320 mm', 10),
  ('Maks. Tornalama Boyu', '480 mm', 20),
  ('Çubuk İşleme Kapasitesi', 'Ø 52 mm', 30),
  ('İş Mili Devri', '4.500 dv/dk', 40),
  ('İş Mili Motor Gücü', '15 kW', 50),
  ('Hidrolik Ayna Çapı', '8” (Ø 200 mm)', 60),
  ('Kızak Tipi', 'Hassas Lineer Kızak', 70),
  ('X, Z Eksen Motor Gücü', '2,5 kW / 2,5 kW', 80),
  ('Taret Tipi', 'Hidrolik, 10 İstasyon', 90),
  ('Karşı Punta Pinol Hareketi', '88 mm', 100),
  ('Karşı Punta Pinol Çapı', 'Ø 58 mm', 110),
  ('Tezgah Ağırlığı', '3.350 kg', 120)
) AS values_row("spec_key", "spec_value", "sort_order")
WHERE pm."model_code" = 'SL-8' AND upper(b."name") = 'ECOCA';
--> statement-breakpoint
DELETE FROM "product_equipment_items"
WHERE "product_model_id" IN (
  SELECT pm."id"
  FROM "product_models" pm
  JOIN "brands" b ON b."id" = pm."brand_id" AND b."tenant_id" = pm."tenant_id"
  WHERE pm."model_code" = 'SL-8' AND upper(b."name") = 'ECOCA'
)
AND "equipment_type_id" IN (SELECT "id" FROM "equipment_types" WHERE "code" = 'standart');
--> statement-breakpoint
INSERT INTO "product_equipment_items" (
  "id", "tenant_id", "product_model_id", "equipment_type_id", "title", "is_promotion", "sort_order", "created_at", "updated_at"
)
SELECT gen_random_uuid(), pm."tenant_id", pm."id", et."id", values_row."title", false, values_row."sort_order", now(), now()
FROM "product_models" pm
JOIN "brands" b ON b."id" = pm."brand_id" AND b."tenant_id" = pm."tenant_id"
JOIN "equipment_types" et ON et."code" = 'standart'
CROSS JOIN (VALUES
  ('FANUC 0i-TF Plus Kontrol Ünitesi, LCD Renkli Ekran', 10),
  ('Flash Memory Tip Kart Girişi, USB Arayüzü', 20),
  ('Hidrolik 10 İstasyonlu Taret', 30),
  ('8” (200 mm) 3 Ayaklı Hidrolik Ayna Seti', 40),
  ('RENISHAW Tam Otomatik Takım Boyu Ölçme Kolu', 50),
  ('Tam Kapalı Kabin, Çalışma Lambası', 60),
  ('3 Renkli Alarm Lambası', 70),
  ('Programlanabilir Karşı Punta Pinolü', 80),
  ('Talaş Konveyörü & Talaş Arabası', 90),
  ('Yüksek Basınçlı Soğutma Sıvısı Sistemi', 100),
  ('Otomatik Tezgah Yağlama Sistemi', 110),
  ('Transformatör, Takımlar & Takım Çantası', 120),
  ('Kullanma ve Bakım Kılavuzları', 130),
  ('Dengeye Alma Ayakları ve Vidaları', 140),
  ('CE Normlarına Uygun Elektrik ve Güvenlik Donanımı', 150),
  ('Dış Çap Bağlama Aparatı (6 Adet)', 160),
  ('Alın Kater Tutucu (2 Adet)', 170),
  ('İç Çap Kater Tutucu (6 Adet)', 180),
  ('Mors Konik Tutucu (2 Adet)', 190),
  ('İç Çap Redüksiyon Kovanları (1 Set)', 200),
  ('Ayna İçin Sert Ayak Takımı (1 Set)', 210),
  ('Ayna İçin Yumuşak Ayak Takımı (5 Set)', 220),
  ('Döner Punta Seti (1 Set)', 230)
) AS values_row("title", "sort_order")
WHERE pm."model_code" = 'SL-8' AND upper(b."name") = 'ECOCA';
