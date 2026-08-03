CREATE TABLE IF NOT EXISTS "record_sequences" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "record_type" varchar(32) NOT NULL,
  "last_number" bigint NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "record_sequences_tenant_record_type_unique"
  ON "record_sequences" ("tenant_id", "record_type");
--> statement-breakpoint
INSERT INTO "record_sequences" ("tenant_id", "record_type", "last_number")
SELECT "tenant_id", 'company', max("external_company_no"::bigint)
FROM "companies"
WHERE "external_company_no" ~ '^[0-9]{1,15}$'
GROUP BY "tenant_id"
ON CONFLICT ("tenant_id", "record_type") DO UPDATE
SET "last_number" = greatest("record_sequences"."last_number", EXCLUDED."last_number"),
    "updated_at" = now();
--> statement-breakpoint
INSERT INTO "record_sequences" ("tenant_id", "record_type", "last_number")
SELECT "tenant_id", 'contact', max("external_contact_no"::bigint)
FROM "contacts"
WHERE "external_contact_no" ~ '^[0-9]{1,15}$'
GROUP BY "tenant_id"
ON CONFLICT ("tenant_id", "record_type") DO UPDATE
SET "last_number" = greatest("record_sequences"."last_number", EXCLUDED."last_number"),
    "updated_at" = now();
