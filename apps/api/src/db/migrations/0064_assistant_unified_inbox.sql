-- Birleşik asistan gelen kutusu. Yalnız ekleyici şema değişikliğidir; mevcut
-- CRM, asistan ve kullanıcı verilerine dokunmaz.
CREATE TABLE IF NOT EXISTS "assistant_inbox_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "division_id" uuid,
  "channel" varchar(24) NOT NULL,
  "provider" varchar(64) DEFAULT 'manual' NOT NULL,
  "provider_message_id" varchar(160),
  "direction" varchar(16) DEFAULT 'inbound' NOT NULL,
  "sender_name" varchar(255),
  "sender_email" varchar(320),
  "sender_phone" varchar(64),
  "subject" varchar(255),
  "body" text NOT NULL,
  "category" varchar(24) DEFAULT 'general' NOT NULL,
  "priority" varchar(16) DEFAULT 'normal' NOT NULL,
  "status" varchar(24) DEFAULT 'new' NOT NULL,
  "company_id" uuid,
  "contact_id" uuid,
  "assigned_to_user_id" uuid,
  "received_at" timestamp with time zone DEFAULT now() NOT NULL,
  "due_at" timestamp with time zone,
  "next_follow_up_at" timestamp with time zone,
  "last_follow_up_at" timestamp with time zone,
  "follow_up_count" integer DEFAULT 0 NOT NULL,
  "draft_reply" text,
  "classification_confidence" integer DEFAULT 50 NOT NULL,
  "metadata" jsonb,
  "resolved_at" timestamp with time zone,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assistant_inbox_items" ADD CONSTRAINT "assistant_inbox_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assistant_inbox_items" ADD CONSTRAINT "assistant_inbox_items_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assistant_inbox_items" ADD CONSTRAINT "assistant_inbox_items_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assistant_inbox_items" ADD CONSTRAINT "assistant_inbox_items_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assistant_inbox_items" ADD CONSTRAINT "assistant_inbox_items_assigned_to_user_id_users_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assistant_inbox_items" ADD CONSTRAINT "assistant_inbox_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "assistant_inbox_provider_message_unique" ON "assistant_inbox_items" USING btree ("tenant_id", "provider", "provider_message_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assistant_inbox_tenant_status_idx" ON "assistant_inbox_items" USING btree ("tenant_id", "status", "received_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assistant_inbox_assigned_status_idx" ON "assistant_inbox_items" USING btree ("assigned_to_user_id", "status", "due_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assistant_inbox_company_idx" ON "assistant_inbox_items" USING btree ("company_id", "received_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assistant_inbox_division_idx" ON "assistant_inbox_items" USING btree ("division_id", "status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assistant_inbox_follow_up_idx" ON "assistant_inbox_items" USING btree ("tenant_id", "next_follow_up_at");
