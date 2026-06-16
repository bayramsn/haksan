CREATE TABLE IF NOT EXISTS "machine_passports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"customer_device_id" uuid NOT NULL,
	"slug" varchar(160) NOT NULL,
	"access_token_hash" varchar(128) NOT NULL,
	"public_title" varchar(255),
	"public_notes" text,
	"published_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"token_rotated_at" timestamp with time zone,
	"last_viewed_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "machine_passport_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"passport_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"document_type" varchar(64) DEFAULT 'document' NOT NULL,
	"visibility" varchar(32) DEFAULT 'public' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "machine_maintenance_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"customer_device_id" uuid NOT NULL,
	"service_ticket_id" uuid,
	"event_type" varchar(64) NOT NULL,
	"event_date" timestamp with time zone DEFAULT now() NOT NULL,
	"title" varchar(255) NOT NULL,
	"notes" text,
	"performed_by_user_id" uuid,
	"next_due_date" timestamp with time zone,
	"labor_minutes" integer,
	"travel_cost" numeric(18, 4) DEFAULT '0' NOT NULL,
	"labor_cost" numeric(18, 4) DEFAULT '0' NOT NULL,
	"parts_cost" numeric(18, 4) DEFAULT '0' NOT NULL,
	"service_revenue" numeric(18, 4) DEFAULT '0' NOT NULL,
	"currency_code" varchar(8) DEFAULT 'USD' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "product_configuration_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"product_model_id" uuid NOT NULL,
	"rule_type" varchar(32) NOT NULL,
	"source_option_value_id" uuid,
	"target_option_value_id" uuid,
	"target_product_model_id" uuid,
	"message" text,
	"severity" varchar(32) DEFAULT 'info' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "quote_configuration_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"quote_id" uuid NOT NULL,
	"product_model_id" uuid,
	"inventory_item_id" uuid,
	"snapshot" jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "machine_passports" ADD CONSTRAINT "machine_passports_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "machine_passports" ADD CONSTRAINT "machine_passports_customer_device_id_customer_devices_id_fk" FOREIGN KEY ("customer_device_id") REFERENCES "public"."customer_devices"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "machine_passports" ADD CONSTRAINT "machine_passports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "machine_passport_documents" ADD CONSTRAINT "machine_passport_documents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "machine_passport_documents" ADD CONSTRAINT "machine_passport_documents_passport_id_machine_passports_id_fk" FOREIGN KEY ("passport_id") REFERENCES "public"."machine_passports"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "machine_passport_documents" ADD CONSTRAINT "machine_passport_documents_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "machine_maintenance_events" ADD CONSTRAINT "machine_maintenance_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "machine_maintenance_events" ADD CONSTRAINT "machine_maintenance_events_customer_device_id_customer_devices_id_fk" FOREIGN KEY ("customer_device_id") REFERENCES "public"."customer_devices"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "machine_maintenance_events" ADD CONSTRAINT "machine_maintenance_events_service_ticket_id_service_tickets_id_fk" FOREIGN KEY ("service_ticket_id") REFERENCES "public"."service_tickets"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "machine_maintenance_events" ADD CONSTRAINT "machine_maintenance_events_performed_by_user_id_users_id_fk" FOREIGN KEY ("performed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "product_configuration_rules" ADD CONSTRAINT "product_configuration_rules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "product_configuration_rules" ADD CONSTRAINT "product_configuration_rules_product_model_id_product_models_id_fk" FOREIGN KEY ("product_model_id") REFERENCES "public"."product_models"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "product_configuration_rules" ADD CONSTRAINT "product_configuration_rules_source_option_value_id_product_option_values_id_fk" FOREIGN KEY ("source_option_value_id") REFERENCES "public"."product_option_values"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "product_configuration_rules" ADD CONSTRAINT "product_configuration_rules_target_option_value_id_product_option_values_id_fk" FOREIGN KEY ("target_option_value_id") REFERENCES "public"."product_option_values"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "product_configuration_rules" ADD CONSTRAINT "product_configuration_rules_target_product_model_id_product_models_id_fk" FOREIGN KEY ("target_product_model_id") REFERENCES "public"."product_models"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "quote_configuration_snapshots" ADD CONSTRAINT "quote_configuration_snapshots_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "quote_configuration_snapshots" ADD CONSTRAINT "quote_configuration_snapshots_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "quote_configuration_snapshots" ADD CONSTRAINT "quote_configuration_snapshots_product_model_id_product_models_id_fk" FOREIGN KEY ("product_model_id") REFERENCES "public"."product_models"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "quote_configuration_snapshots" ADD CONSTRAINT "quote_configuration_snapshots_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "quote_configuration_snapshots" ADD CONSTRAINT "quote_configuration_snapshots_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "machine_passports_tenant_idx" ON "machine_passports" USING btree ("tenant_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "machine_passports_customer_device_unique" ON "machine_passports" USING btree ("customer_device_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "machine_passports_tenant_slug_unique" ON "machine_passports" USING btree ("tenant_id", "slug");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "machine_passports_tenant_token_unique" ON "machine_passports" USING btree ("tenant_id", "access_token_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "machine_passport_documents_tenant_idx" ON "machine_passport_documents" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "machine_passport_documents_passport_idx" ON "machine_passport_documents" USING btree ("passport_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "machine_maintenance_events_tenant_idx" ON "machine_maintenance_events" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "machine_maintenance_events_device_idx" ON "machine_maintenance_events" USING btree ("customer_device_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "machine_maintenance_events_next_due_idx" ON "machine_maintenance_events" USING btree ("next_due_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_configuration_rules_tenant_idx" ON "product_configuration_rules" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_configuration_rules_product_idx" ON "product_configuration_rules" USING btree ("product_model_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_configuration_rules_source_option_idx" ON "product_configuration_rules" USING btree ("source_option_value_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quote_configuration_snapshots_tenant_idx" ON "quote_configuration_snapshots" USING btree ("tenant_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "quote_configuration_snapshots_quote_unique" ON "quote_configuration_snapshots" USING btree ("quote_id");
