CREATE TABLE IF NOT EXISTS "calendar_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "owner_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "event_type" varchar(32) DEFAULT 'other' NOT NULL CHECK ("event_type" IN ('customer_visit','meeting','call','task','other')),
  "source" varchar(32) DEFAULT 'manual' NOT NULL CHECK ("source" IN ('manual','device')),
  "title" varchar(255) NOT NULL,
  "description" text,
  "location" varchar(512),
  "starts_at" timestamp with time zone NOT NULL,
  "ends_at" timestamp with time zone NOT NULL,
  "all_day" boolean DEFAULT false NOT NULL,
  "timezone" varchar(64) DEFAULT 'Europe/Istanbul' NOT NULL,
  "recurrence_rule" text,
  "company_id" uuid REFERENCES "companies"("id") ON DELETE set null,
  "contact_id" uuid REFERENCES "contacts"("id") ON DELETE set null,
  "opportunity_id" uuid REFERENCES "opportunities"("id") ON DELETE set null,
  "visit_id" uuid REFERENCES "visits"("id") ON DELETE set null,
  "source_modified_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_synced_at" timestamp with time zone,
  "created_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "updated_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone,
  CONSTRAINT "calendar_events_time_check" CHECK ("ends_at" >= "starts_at"),
  CONSTRAINT "calendar_events_visit_company_check" CHECK ("event_type" <> 'customer_visit' OR "company_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "calendar_device_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "owner_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "calendar_event_id" uuid NOT NULL REFERENCES "calendar_events"("id") ON DELETE cascade,
  "device_id" varchar(128) NOT NULL,
  "platform" varchar(16) NOT NULL CHECK ("platform" IN ('android','ios')),
  "external_calendar_id" varchar(512) NOT NULL,
  "external_event_id" varchar(512) NOT NULL,
  "occurrence_id" varchar(512) DEFAULT '' NOT NULL,
  "provider_modified_at" timestamp with time zone NOT NULL,
  "last_synced_hash" varchar(128),
  "last_synced_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "calendar_sync_settings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "owner_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "primary_device_id" varchar(128) NOT NULL,
  "platform" varchar(16) NOT NULL CHECK ("platform" IN ('android','ios')),
  "auto_sync" boolean DEFAULT false NOT NULL,
  "selected_calendars" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "destination_calendar_id" varchar(512),
  "window_past_months" integer DEFAULT 6 NOT NULL CHECK ("window_past_months" BETWEEN 0 AND 24),
  "window_future_months" integer DEFAULT 6 NOT NULL CHECK ("window_future_months" BETWEEN 0 AND 24),
  "last_sync_at" timestamp with time zone,
  "last_sync_error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "calendar_events_tenant_owner_time_idx" ON "calendar_events" ("tenant_id", "owner_user_id", "starts_at");
CREATE INDEX IF NOT EXISTS "calendar_events_tenant_time_idx" ON "calendar_events" ("tenant_id", "starts_at");
CREATE INDEX IF NOT EXISTS "calendar_events_company_idx" ON "calendar_events" ("company_id");
CREATE INDEX IF NOT EXISTS "calendar_events_visit_idx" ON "calendar_events" ("visit_id");
CREATE UNIQUE INDEX IF NOT EXISTS "calendar_device_links_external_unique" ON "calendar_device_links" ("tenant_id", "owner_user_id", "device_id", "external_calendar_id", "external_event_id", "occurrence_id");
CREATE INDEX IF NOT EXISTS "calendar_device_links_event_idx" ON "calendar_device_links" ("calendar_event_id");
CREATE INDEX IF NOT EXISTS "calendar_device_links_owner_device_idx" ON "calendar_device_links" ("owner_user_id", "device_id");
CREATE UNIQUE INDEX IF NOT EXISTS "calendar_sync_settings_tenant_owner_unique" ON "calendar_sync_settings" ("tenant_id", "owner_user_id");
CREATE INDEX IF NOT EXISTS "calendar_sync_settings_primary_device_idx" ON "calendar_sync_settings" ("primary_device_id");
--> statement-breakpoint
INSERT INTO "permissions" ("code", "name", "resource", "action") VALUES
  ('calendar.read', 'calendar — read', 'calendar', 'read'),
  ('calendar.create', 'calendar — create', 'calendar', 'create'),
  ('calendar.update', 'calendar — update', 'calendar', 'update'),
  ('calendar.delete', 'calendar — delete', 'calendar', 'delete')
ON CONFLICT ("code") DO NOTHING;
--> statement-breakpoint
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT role.id, permission.id
FROM "roles" role
CROSS JOIN "permissions" permission
WHERE permission.resource = 'calendar'
  AND (
    role.code IN ('super_admin', 'admin', 'sales', 'service', 'finance', 'stock')
    OR (role.code = 'readonly' AND permission.action = 'read')
  )
ON CONFLICT DO NOTHING;
