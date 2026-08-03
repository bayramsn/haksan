INSERT INTO "company_groups" ("code", "name", "sort_order") VALUES
  ('a_group', 'A Grubu (Sıcak/Büyük)', 10),
  ('b_group', 'B Grubu (Orta)', 20),
  ('dealer_second_hand', 'Bayi / 2. Elci', 30),
  ('potential_cnc_customer', 'Potansiyel CNC Müşterisi', 40)
ON CONFLICT ("code") DO UPDATE
SET "name" = EXCLUDED."name",
    "sort_order" = EXCLUDED."sort_order",
    "is_active" = true;
--> statement-breakpoint
INSERT INTO "contact_sources" ("code", "name", "sort_order") VALUES
  ('maktek_2024_fair', 'MAKTEK 2024 / Fuar', 1),
  ('musiad_expo', 'MÜSİAD Expo', 2),
  ('harun_aslanbay_reference', 'Harun Aslanbay (Referans)', 3),
  ('website_inbound_call', 'Web Sitesi / Gelen Çağrı', 4),
  ('cold_call_field', 'Soğuk Arama / Saha', 5)
ON CONFLICT ("code") DO UPDATE
SET "name" = EXCLUDED."name",
    "sort_order" = EXCLUDED."sort_order",
    "is_active" = true;
