CREATE TABLE IF NOT EXISTS "user_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"period" varchar(7) NOT NULL,
	"currency" varchar(3) DEFAULT 'EUR' NOT NULL,
	"sales_amount" numeric(18, 4),
	"sales_new_customers" integer,
	"service_amount" numeric(18, 4),
	"service_completed" integer,
	"digital_lead_target" integer,
	"digital_conversion_target" integer,
	"digital_budget" numeric(18, 4),
	"visit_target" integer,
	"call_target" integer,
	"quote_target" integer,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_targets" ADD CONSTRAINT "user_targets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_targets" ADD CONSTRAINT "user_targets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_targets_tenant_idx" ON "user_targets" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_targets_user_idx" ON "user_targets" USING btree ("user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_targets_tenant_user_period_unique" ON "user_targets" USING btree ("tenant_id","user_id","period");
