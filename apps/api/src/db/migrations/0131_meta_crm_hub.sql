CREATE TABLE IF NOT EXISTS "meta_connections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "name" varchar(120) NOT NULL,
  "access_token_encrypted" text NOT NULL,
  "page_id" varchar(64),
  "instagram_account_id" varchar(64),
  "ad_account_id" varchar(64),
  "business_id" varchar(64),
  "dataset_id" varchar(64),
  "whatsapp_business_account_id" varchar(64),
  "phone_number_id" varchar(64),
  "permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "token_expires_at" timestamp with time zone,
  "status" varchar(16) DEFAULT 'active' NOT NULL,
  "last_verified_at" timestamp with time zone,
  "last_webhook_at" timestamp with time zone,
  "last_sync_at" timestamp with time zone,
  "last_error" text,
  "created_by" uuid,
  "updated_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);
CREATE INDEX IF NOT EXISTS "meta_connections_tenant_idx" ON "meta_connections" ("tenant_id");
CREATE UNIQUE INDEX IF NOT EXISTS "meta_connections_page_unique" ON "meta_connections" ("page_id") WHERE "deleted_at" IS NULL AND "page_id" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "meta_connections_instagram_unique" ON "meta_connections" ("instagram_account_id") WHERE "deleted_at" IS NULL AND "instagram_account_id" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "meta_connections_phone_unique" ON "meta_connections" ("phone_number_id") WHERE "deleted_at" IS NULL AND "phone_number_id" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "meta_form_mappings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "connection_id" uuid NOT NULL REFERENCES "meta_connections"("id") ON DELETE cascade,
  "form_id" varchar(64) NOT NULL,
  "form_name" varchar(255) NOT NULL,
  "field_mappings" jsonb NOT NULL,
  "division_id" uuid REFERENCES "divisions"("id") ON DELETE set null,
  "owner_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_by" uuid,
  "updated_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);
CREATE INDEX IF NOT EXISTS "meta_form_mappings_tenant_idx" ON "meta_form_mappings" ("tenant_id");
CREATE UNIQUE INDEX IF NOT EXISTS "meta_form_mappings_tenant_form_unique" ON "meta_form_mappings" ("tenant_id", "form_id") WHERE "deleted_at" IS NULL;

CREATE TABLE IF NOT EXISTS "meta_webhook_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "connection_id" uuid NOT NULL REFERENCES "meta_connections"("id") ON DELETE cascade,
  "object_type" varchar(32) NOT NULL,
  "object_id" varchar(128) NOT NULL,
  "event_type" varchar(64) NOT NULL,
  "external_event_key" varchar(128) NOT NULL,
  "payload_sha256" varchar(64) NOT NULL,
  "payload" jsonb NOT NULL,
  "status" varchar(16) DEFAULT 'pending' NOT NULL,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
  "processed_at" timestamp with time zone,
  "last_error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "meta_webhook_events_external_unique" ON "meta_webhook_events" ("connection_id", "external_event_key");
CREATE INDEX IF NOT EXISTS "meta_webhook_events_pending_idx" ON "meta_webhook_events" ("status", "next_attempt_at");
CREATE INDEX IF NOT EXISTS "meta_webhook_events_tenant_created_idx" ON "meta_webhook_events" ("tenant_id", "created_at");

CREATE TABLE IF NOT EXISTS "meta_daily_insights" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "connection_id" uuid NOT NULL REFERENCES "meta_connections"("id") ON DELETE cascade,
  "insight_date" timestamp with time zone NOT NULL,
  "campaign_id" varchar(64) NOT NULL,
  "campaign_name" varchar(255) NOT NULL,
  "spend" numeric(18,4) DEFAULT '0' NOT NULL,
  "impressions" integer DEFAULT 0 NOT NULL,
  "clicks" integer DEFAULT 0 NOT NULL,
  "leads" integer DEFAULT 0 NOT NULL,
  "raw_metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "meta_daily_insights_day_campaign_unique" ON "meta_daily_insights" ("connection_id", "insight_date", "campaign_id");
CREATE INDEX IF NOT EXISTS "meta_daily_insights_tenant_date_idx" ON "meta_daily_insights" ("tenant_id", "insight_date");

CREATE TABLE IF NOT EXISTS "meta_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "connection_id" uuid NOT NULL REFERENCES "meta_connections"("id") ON DELETE cascade,
  "channel" varchar(16) NOT NULL,
  "conversation_external_id" varchar(128) NOT NULL,
  "remote_id" varchar(128) NOT NULL,
  "direction" varchar(16) NOT NULL,
  "sender_external_id" varchar(128),
  "recipient_external_id" varchar(128),
  "text" text,
  "status" varchar(32) DEFAULT 'received' NOT NULL,
  "sent_at" timestamp with time zone NOT NULL,
  "raw_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "meta_messages_remote_unique" ON "meta_messages" ("connection_id", "remote_id");
CREATE INDEX IF NOT EXISTS "meta_messages_conversation_idx" ON "meta_messages" ("tenant_id", "conversation_external_id", "sent_at");

CREATE TABLE IF NOT EXISTS "meta_conversion_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "connection_id" uuid NOT NULL REFERENCES "meta_connections"("id") ON DELETE cascade,
  "opportunity_id" uuid NOT NULL REFERENCES "opportunities"("id") ON DELETE cascade,
  "event_id" varchar(128) NOT NULL,
  "event_name" varchar(64) NOT NULL,
  "occurred_at" timestamp with time zone NOT NULL,
  "payload" jsonb NOT NULL,
  "status" varchar(16) DEFAULT 'pending' NOT NULL,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
  "sent_at" timestamp with time zone,
  "last_error" text,
  "created_by" uuid,
  "updated_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "meta_conversion_events_tenant_event_unique" ON "meta_conversion_events" ("tenant_id", "event_id");
CREATE INDEX IF NOT EXISTS "meta_conversion_events_pending_idx" ON "meta_conversion_events" ("status", "next_attempt_at");

CREATE TABLE IF NOT EXISTS "meta_audiences" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "connection_id" uuid NOT NULL REFERENCES "meta_connections"("id") ON DELETE cascade,
  "remote_id" varchar(64) NOT NULL,
  "name" varchar(255) NOT NULL,
  "description" text,
  "customer_file_source" varchar(64) NOT NULL,
  "status" varchar(32) DEFAULT 'ready' NOT NULL,
  "created_by" uuid,
  "updated_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);
CREATE INDEX IF NOT EXISTS "meta_audiences_tenant_idx" ON "meta_audiences" ("tenant_id");
CREATE UNIQUE INDEX IF NOT EXISTS "meta_audiences_remote_unique" ON "meta_audiences" ("connection_id", "remote_id");

CREATE TABLE IF NOT EXISTS "meta_catalogs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "connection_id" uuid NOT NULL REFERENCES "meta_connections"("id") ON DELETE cascade,
  "remote_id" varchar(64) NOT NULL,
  "name" varchar(255) NOT NULL,
  "vertical" varchar(32) NOT NULL,
  "status" varchar(32) DEFAULT 'ready' NOT NULL,
  "created_by" uuid,
  "updated_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);
CREATE INDEX IF NOT EXISTS "meta_catalogs_tenant_idx" ON "meta_catalogs" ("tenant_id");
CREATE UNIQUE INDEX IF NOT EXISTS "meta_catalogs_remote_unique" ON "meta_catalogs" ("connection_id", "remote_id");
