-- Belge kesinleştiğinde müşteri/kalem/şart verisini değişmez bir anlık görüntüye alır.
-- Yalnızca yeni kolon ekler; eski kayıt ve dosyalar silinmez ya da yeniden numaralandırılmaz.

ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "document_snapshot" jsonb;
--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "finalized_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "proformas" ADD COLUMN IF NOT EXISTS "document_snapshot" jsonb;
--> statement-breakpoint
ALTER TABLE "proformas" ADD COLUMN IF NOT EXISTS "finalized_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "document_snapshot" jsonb;
--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "finalized_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "commercial_invoices" ADD COLUMN IF NOT EXISTS "document_snapshot" jsonb;
--> statement-breakpoint
ALTER TABLE "commercial_invoices" ADD COLUMN IF NOT EXISTS "finalized_at" timestamp with time zone;
--> statement-breakpoint

UPDATE "quotes" q
SET "finalized_at" = COALESCE(q."finalized_at", q."sent_at", q."approved_at", q."rejected_at", q."updated_at", q."created_at"),
    "document_snapshot" = COALESCE(q."document_snapshot", jsonb_build_object(
      'schemaVersion', 1,
      'capturedAt', to_jsonb(COALESCE(q."sent_at", q."approved_at", q."rejected_at", q."updated_at", q."created_at")),
      'quote', to_jsonb(q) - 'document_snapshot',
      'company', COALESCE((SELECT to_jsonb(c) FROM "companies" c WHERE c."id" = q."company_id"), 'null'::jsonb),
      'companyAddresses', COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY a."is_default" DESC, a."created_at") FROM "company_addresses" a WHERE a."company_id" = q."company_id" AND a."deleted_at" IS NULL), '[]'::jsonb),
      'companyPhones', COALESCE((SELECT jsonb_agg(to_jsonb(pn) ORDER BY pn."is_default" DESC, pn."created_at") FROM "company_phones" pn WHERE pn."company_id" = q."company_id" AND pn."deleted_at" IS NULL), '[]'::jsonb),
      'companyEmails', COALESCE((SELECT jsonb_agg(to_jsonb(em) ORDER BY em."is_default" DESC, em."created_at") FROM "company_emails" em WHERE em."company_id" = q."company_id" AND em."deleted_at" IS NULL), '[]'::jsonb),
      'contact', COALESCE((SELECT to_jsonb(cn) FROM "contacts" cn WHERE cn."id" = q."contact_id"), 'null'::jsonb),
      'currency', COALESCE((SELECT to_jsonb(cu) FROM "currencies" cu WHERE cu."id" = q."currency_id"), 'null'::jsonb),
      'items', COALESCE((SELECT jsonb_agg(to_jsonb(qi) ORDER BY qi."sort_order", qi."created_at") FROM "quote_items" qi WHERE qi."quote_id" = q."id" AND qi."deleted_at" IS NULL), '[]'::jsonb),
      'terms', COALESCE((SELECT to_jsonb(qt) FROM "quote_terms" qt WHERE qt."quote_id" = q."id" LIMIT 1), 'null'::jsonb)
      , 'receivables', COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r."due_date") FROM "receivables" r WHERE r."quote_id" = q."id" AND r."deleted_at" IS NULL), '[]'::jsonb)
    ))
FROM "quote_statuses" qs
WHERE q."status_id" = qs."id"
  AND qs."code" IN ('sent', 'approved', 'rejected')
  AND (q."finalized_at" IS NULL OR q."document_snapshot" IS NULL);
--> statement-breakpoint

UPDATE "proformas" p
SET "finalized_at" = COALESCE(p."finalized_at", p."updated_at", p."created_at"),
    "document_snapshot" = COALESCE(p."document_snapshot", jsonb_build_object(
      'schemaVersion', 1,
      'capturedAt', to_jsonb(COALESCE(p."updated_at", p."created_at")),
      'document', to_jsonb(p) - 'document_snapshot',
      'quote', to_jsonb(q) - 'document_snapshot',
      'company', COALESCE((SELECT to_jsonb(c) FROM "companies" c WHERE c."id" = q."company_id"), 'null'::jsonb),
      'companyAddresses', COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY a."is_default" DESC, a."created_at") FROM "company_addresses" a WHERE a."company_id" = q."company_id" AND a."deleted_at" IS NULL), '[]'::jsonb),
      'companyPhones', COALESCE((SELECT jsonb_agg(to_jsonb(pn) ORDER BY pn."is_default" DESC, pn."created_at") FROM "company_phones" pn WHERE pn."company_id" = q."company_id" AND pn."deleted_at" IS NULL), '[]'::jsonb),
      'companyEmails', COALESCE((SELECT jsonb_agg(to_jsonb(em) ORDER BY em."is_default" DESC, em."created_at") FROM "company_emails" em WHERE em."company_id" = q."company_id" AND em."deleted_at" IS NULL), '[]'::jsonb),
      'contact', COALESCE((SELECT to_jsonb(cn) FROM "contacts" cn WHERE cn."id" = q."contact_id"), 'null'::jsonb),
      'currency', COALESCE((SELECT to_jsonb(cu) FROM "currencies" cu WHERE cu."id" = q."currency_id"), 'null'::jsonb),
      'items', COALESCE((SELECT jsonb_agg(to_jsonb(qi) ORDER BY qi."sort_order", qi."created_at") FROM "quote_items" qi WHERE qi."quote_id" = q."id" AND qi."deleted_at" IS NULL), '[]'::jsonb),
      'terms', COALESCE((SELECT to_jsonb(qt) FROM "quote_terms" qt WHERE qt."quote_id" = q."id" LIMIT 1), 'null'::jsonb)
      , 'receivables', COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r."due_date") FROM "receivables" r WHERE r."quote_id" = q."id" AND r."deleted_at" IS NULL), '[]'::jsonb)
    ))
FROM "quotes" q, "proforma_statuses" ps
WHERE p."quote_id" = q."id" AND p."status_id" = ps."id" AND ps."code" <> 'draft'
  AND (p."finalized_at" IS NULL OR p."document_snapshot" IS NULL);
--> statement-breakpoint

UPDATE "contracts" cdoc
SET "finalized_at" = COALESCE(cdoc."finalized_at", cdoc."signed_date", cdoc."updated_at", cdoc."created_at"),
    "document_snapshot" = COALESCE(cdoc."document_snapshot", jsonb_build_object(
      'schemaVersion', 1,
      'capturedAt', to_jsonb(COALESCE(cdoc."signed_date", cdoc."updated_at", cdoc."created_at")),
      'document', to_jsonb(cdoc) - 'document_snapshot',
      'quote', to_jsonb(q) - 'document_snapshot',
      'company', COALESCE((SELECT to_jsonb(c) FROM "companies" c WHERE c."id" = q."company_id"), 'null'::jsonb),
      'companyAddresses', COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY a."is_default" DESC, a."created_at") FROM "company_addresses" a WHERE a."company_id" = q."company_id" AND a."deleted_at" IS NULL), '[]'::jsonb),
      'companyPhones', COALESCE((SELECT jsonb_agg(to_jsonb(pn) ORDER BY pn."is_default" DESC, pn."created_at") FROM "company_phones" pn WHERE pn."company_id" = q."company_id" AND pn."deleted_at" IS NULL), '[]'::jsonb),
      'companyEmails', COALESCE((SELECT jsonb_agg(to_jsonb(em) ORDER BY em."is_default" DESC, em."created_at") FROM "company_emails" em WHERE em."company_id" = q."company_id" AND em."deleted_at" IS NULL), '[]'::jsonb),
      'contact', COALESCE((SELECT to_jsonb(cn) FROM "contacts" cn WHERE cn."id" = q."contact_id"), 'null'::jsonb),
      'currency', COALESCE((SELECT to_jsonb(cu) FROM "currencies" cu WHERE cu."id" = q."currency_id"), 'null'::jsonb),
      'items', COALESCE((SELECT jsonb_agg(to_jsonb(qi) ORDER BY qi."sort_order", qi."created_at") FROM "quote_items" qi WHERE qi."quote_id" = q."id" AND qi."deleted_at" IS NULL), '[]'::jsonb),
      'terms', COALESCE((SELECT to_jsonb(qt) FROM "quote_terms" qt WHERE qt."quote_id" = q."id" LIMIT 1), 'null'::jsonb)
      , 'receivables', COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r."due_date") FROM "receivables" r WHERE r."quote_id" = q."id" AND r."deleted_at" IS NULL), '[]'::jsonb)
    ))
FROM "quotes" q, "contract_statuses" cs
WHERE cdoc."quote_id" = q."id" AND cdoc."status_id" = cs."id" AND cs."code" <> 'draft'
  AND (cdoc."finalized_at" IS NULL OR cdoc."document_snapshot" IS NULL);
--> statement-breakpoint

UPDATE "commercial_invoices" inv
SET "finalized_at" = COALESCE(inv."finalized_at", inv."invoice_date", inv."updated_at", inv."created_at"),
    "document_snapshot" = COALESCE(inv."document_snapshot", jsonb_build_object(
      'schemaVersion', 1,
      'capturedAt', to_jsonb(COALESCE(inv."invoice_date", inv."updated_at", inv."created_at")),
      'document', to_jsonb(inv) - 'document_snapshot',
      'quote', to_jsonb(q) - 'document_snapshot',
      'company', COALESCE((SELECT to_jsonb(c) FROM "companies" c WHERE c."id" = q."company_id"), 'null'::jsonb),
      'companyAddresses', COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY a."is_default" DESC, a."created_at") FROM "company_addresses" a WHERE a."company_id" = q."company_id" AND a."deleted_at" IS NULL), '[]'::jsonb),
      'companyPhones', COALESCE((SELECT jsonb_agg(to_jsonb(pn) ORDER BY pn."is_default" DESC, pn."created_at") FROM "company_phones" pn WHERE pn."company_id" = q."company_id" AND pn."deleted_at" IS NULL), '[]'::jsonb),
      'companyEmails', COALESCE((SELECT jsonb_agg(to_jsonb(em) ORDER BY em."is_default" DESC, em."created_at") FROM "company_emails" em WHERE em."company_id" = q."company_id" AND em."deleted_at" IS NULL), '[]'::jsonb),
      'contact', COALESCE((SELECT to_jsonb(cn) FROM "contacts" cn WHERE cn."id" = q."contact_id"), 'null'::jsonb),
      'currency', COALESCE((SELECT to_jsonb(cu) FROM "currencies" cu WHERE cu."id" = q."currency_id"), 'null'::jsonb),
      'items', COALESCE((SELECT jsonb_agg(to_jsonb(qi) ORDER BY qi."sort_order", qi."created_at") FROM "quote_items" qi WHERE qi."quote_id" = q."id" AND qi."deleted_at" IS NULL), '[]'::jsonb),
      'terms', COALESCE((SELECT to_jsonb(qt) FROM "quote_terms" qt WHERE qt."quote_id" = q."id" LIMIT 1), 'null'::jsonb)
      , 'receivables', COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r."due_date") FROM "receivables" r WHERE r."quote_id" = q."id" AND r."deleted_at" IS NULL), '[]'::jsonb)
    ))
FROM "quotes" q, "invoice_statuses" ist
WHERE inv."quote_id" = q."id" AND inv."status_id" = ist."id" AND ist."code" <> 'draft'
  AND (inv."finalized_at" IS NULL OR inv."document_snapshot" IS NULL);
