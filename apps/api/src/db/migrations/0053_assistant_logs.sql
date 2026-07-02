CREATE TABLE IF NOT EXISTS "assistant_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "event_type" varchar(32) NOT NULL,
  "source_type" varchar(64),
  "source_id" varchar(160),
  "action" varchar(64),
  "status" varchar(32) DEFAULT 'ok' NOT NULL,
  "message" text,
  "response" text,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "assistant_logs_tenant_created_idx" ON "assistant_logs" ("tenant_id", "created_at");
CREATE INDEX IF NOT EXISTS "assistant_logs_user_created_idx" ON "assistant_logs" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "assistant_logs_source_idx" ON "assistant_logs" ("tenant_id", "source_type", "source_id");
CREATE INDEX IF NOT EXISTS "assistant_logs_event_idx" ON "assistant_logs" ("tenant_id", "event_type");
