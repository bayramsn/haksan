-- Toplu mail: kullanıcının kendi webmail hesabından, alıcı başına ayrı ileti.
CREATE TABLE IF NOT EXISTS "mail_campaigns" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "created_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "subject" varchar(255) NOT NULL,
  "body" text NOT NULL,
  "file_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "actor" jsonb NOT NULL,
  "status" varchar(16) DEFAULT 'sending' NOT NULL,
  "error" varchar(255),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  CONSTRAINT "mail_campaigns_status_check" CHECK ("status" IN ('sending', 'completed', 'cancelled', 'failed'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mail_campaigns_tenant_created_idx" ON "mail_campaigns" ("tenant_id", "created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mail_campaign_recipients" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "campaign_id" uuid NOT NULL REFERENCES "mail_campaigns"("id") ON DELETE CASCADE,
  "email" varchar(320) NOT NULL,
  "name" varchar(255),
  "company_name" varchar(255),
  "company_id" uuid REFERENCES "companies"("id") ON DELETE SET NULL,
  "contact_id" uuid REFERENCES "contacts"("id") ON DELETE SET NULL,
  "status" varchar(16) DEFAULT 'pending' NOT NULL,
  "error" varchar(255),
  "claimed_at" timestamp with time zone,
  "sent_at" timestamp with time zone,
  "unsubscribe_token" uuid DEFAULT gen_random_uuid() NOT NULL,
  CONSTRAINT "mail_campaign_recipients_status_check" CHECK ("status" IN ('pending', 'sending', 'sent', 'failed', 'skipped'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mail_campaign_recipients_campaign_status_idx" ON "mail_campaign_recipients" ("campaign_id", "status");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mail_campaign_recipients_campaign_email_unique" ON "mail_campaign_recipients" ("campaign_id", "email");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mail_campaign_recipients_unsubscribe_token_unique" ON "mail_campaign_recipients" ("unsubscribe_token");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mail_suppressions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "email" varchar(320) NOT NULL,
  "reason" varchar(255),
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mail_suppressions_tenant_email_unique" ON "mail_suppressions" ("tenant_id", "email");
--> statement-breakpoint
INSERT INTO "permissions" ("code", "name", "resource", "action") VALUES
  ('mail_campaigns.read', 'mail_campaigns — read', 'mail_campaigns', 'read'),
  ('mail_campaigns.create', 'mail_campaigns — create', 'mail_campaigns', 'create')
ON CONFLICT ("code") DO NOTHING;
--> statement-breakpoint
-- Toplu gönderim gönderen itibarını etkiler: yönetici ve satış rolleri.
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT role.id, permission.id
FROM "roles" role
CROSS JOIN "permissions" permission
WHERE permission.resource = 'mail_campaigns'
  AND role.code IN ('super_admin', 'admin', 'sales')
ON CONFLICT DO NOTHING;
