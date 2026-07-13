CREATE TABLE IF NOT EXISTS "assistant_daily_token_budgets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "usage_date" date NOT NULL,
  "reserved_tokens" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "assistant_daily_token_budgets_tenant_user_date_unique"
  ON "assistant_daily_token_budgets" ("tenant_id", "user_id", "usage_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assistant_daily_token_budgets_tenant_date_idx"
  ON "assistant_daily_token_budgets" ("tenant_id", "usage_date");
