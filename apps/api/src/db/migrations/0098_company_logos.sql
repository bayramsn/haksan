ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "logo_file_id" uuid;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'companies_logo_file_id_files_id_fk'
  ) THEN
    ALTER TABLE "companies"
      ADD CONSTRAINT "companies_logo_file_id_files_id_fk"
      FOREIGN KEY ("logo_file_id") REFERENCES "public"."files"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "companies_logo_file_idx" ON "companies" USING btree ("logo_file_id");
--> statement-breakpoint
INSERT INTO "file_document_types" ("code", "name", "sort_order", "is_active")
VALUES ('company_logo', 'Firma Logosu', 15, true)
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "sort_order" = EXCLUDED."sort_order",
  "is_active" = true;
