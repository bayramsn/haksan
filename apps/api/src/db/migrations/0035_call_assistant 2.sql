CREATE TABLE IF NOT EXISTS "phone_number_index" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "public"."tenants"("id") ON DELETE cascade,
	"company_id" uuid REFERENCES "public"."companies"("id") ON DELETE cascade,
	"contact_id" uuid REFERENCES "public"."contacts"("id") ON DELETE cascade,
	"entity_type" varchar(32) NOT NULL,
	"entity_id" uuid NOT NULL,
	"phone_source" varchar(64) NOT NULL,
	"original_phone" varchar(64) NOT NULL,
	"normalized_phone" varchar(32) NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "call_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "public"."tenants"("id") ON DELETE cascade,
	"provider" varchar(64) NOT NULL,
	"provider_event_id" varchar(128) NOT NULL,
	"source" varchar(32) DEFAULT 'pbx' NOT NULL,
	"direction" varchar(16) DEFAULT 'inbound' NOT NULL,
	"event_type" varchar(32) NOT NULL,
	"caller_number" varchar(64),
	"callee_number" varchar(64),
	"matched_number" varchar(64),
	"normalized_phone" varchar(32),
	"company_id" uuid REFERENCES "public"."companies"("id") ON DELETE set null,
	"contact_id" uuid REFERENCES "public"."contacts"("id") ON DELETE set null,
	"user_id" uuid REFERENCES "public"."users"("id") ON DELETE set null,
	"match_status" varchar(32) DEFAULT 'unmatched' NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"duration_seconds" integer,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "call_assistant_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "public"."tenants"("id") ON DELETE cascade,
	"call_event_id" uuid NOT NULL REFERENCES "public"."call_events"("id") ON DELETE cascade,
	"user_id" uuid REFERENCES "public"."users"("id") ON DELETE cascade,
	"division_id" uuid REFERENCES "public"."divisions"("id") ON DELETE cascade,
	"company_id" uuid NOT NULL REFERENCES "public"."companies"("id") ON DELETE cascade,
	"contact_id" uuid REFERENCES "public"."contacts"("id") ON DELETE set null,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"title" varchar(255) NOT NULL,
	"body" text,
	"action_taken" varchar(64),
	"action_entity_type" varchar(64),
	"action_entity_id" uuid,
	"actioned_at" timestamp with time zone,
	"deep_link" varchar(512),
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "phone_number_index_tenant_phone_idx" ON "phone_number_index" USING btree ("tenant_id","normalized_phone");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "phone_number_index_company_idx" ON "phone_number_index" USING btree ("company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "phone_number_index_contact_idx" ON "phone_number_index" USING btree ("contact_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "phone_number_index_source_unique" ON "phone_number_index" USING btree ("tenant_id","entity_type","entity_id","phone_source","normalized_phone");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "call_events_provider_unique" ON "call_events" USING btree ("tenant_id","provider","provider_event_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "call_events_tenant_idx" ON "call_events" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "call_events_company_idx" ON "call_events" USING btree ("company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "call_events_contact_idx" ON "call_events" USING btree ("contact_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "call_events_user_idx" ON "call_events" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "call_events_normalized_phone_idx" ON "call_events" USING btree ("tenant_id","normalized_phone");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "call_assistant_suggestions_tenant_status_idx" ON "call_assistant_suggestions" USING btree ("tenant_id","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "call_assistant_suggestions_user_status_idx" ON "call_assistant_suggestions" USING btree ("user_id","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "call_assistant_suggestions_division_status_idx" ON "call_assistant_suggestions" USING btree ("division_id","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "call_assistant_suggestions_call_event_idx" ON "call_assistant_suggestions" USING btree ("call_event_id");
