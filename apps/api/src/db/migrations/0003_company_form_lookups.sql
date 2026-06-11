INSERT INTO "company_groups" ("code", "name", "sort_order") VALUES
  ('cnc', 'CNC', 1),
  ('universal', 'Üniversal', 2),
  ('sac_isleme', 'Sac İşleme', 3)
ON CONFLICT ("code") DO NOTHING;
--> statement-breakpoint
INSERT INTO "contact_sources" ("code", "name", "sort_order") VALUES
  ('email', 'Mail', 1),
  ('phone', 'Telefon', 2),
  ('dealer', 'Bayi', 3),
  ('digital_market', 'Dijital Pazar', 4),
  ('musiad', 'MÜSİAD', 5)
ON CONFLICT ("code") DO NOTHING;
