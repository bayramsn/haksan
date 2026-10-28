CREATE TABLE IF NOT EXISTS "user_mail_signatures" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "image" text,
  "filename" varchar(200),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "user_mail_signatures_tenant_user_unique" UNIQUE ("tenant_id", "user_id")
);
