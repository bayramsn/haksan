INSERT INTO "file_document_types" ("code", "name", "sort_order", "is_active")
VALUES ('external_quote', 'Dış Teklif', 25, true)
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "sort_order" = EXCLUDED."sort_order",
  "is_active" = true;
