CREATE TABLE IF NOT EXISTS "deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"opportunity_id" uuid,
	"company_id" uuid NOT NULL,
	"delivery_date" timestamp with time zone NOT NULL,
	"signed_by" varchar(255),
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deliveries_tenant_idx" ON "deliveries" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deliveries_company_idx" ON "deliveries" USING btree ("company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deliveries_opportunity_idx" ON "deliveries" USING btree ("opportunity_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deliveries_status_idx" ON "deliveries" USING btree ("status");
