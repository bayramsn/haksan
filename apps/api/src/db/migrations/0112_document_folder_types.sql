INSERT INTO "file_document_types" ("code", "name", "sort_order", "is_active")
VALUES
  ('accounting_invoice_pdf', 'Muhasebe Faturası PDF', 55, true),
  ('delivery_form', 'Teslim Formu', 72, true),
  ('installation_form', 'Kurulum Formu', 74, true)
ON CONFLICT ("code") DO UPDATE
SET
  "name" = excluded."name",
  "sort_order" = excluded."sort_order",
  "is_active" = true,
  "updated_at" = now();
