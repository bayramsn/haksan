INSERT INTO "product_types" ("code", "name", "sort_order") VALUES
  ('CNC_TAPPING_CENTER', 'CNC Tapping Center', 90)
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "sort_order" = EXCLUDED."sort_order";
