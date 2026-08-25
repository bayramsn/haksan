CREATE TABLE IF NOT EXISTS "company_status_operations" (
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"status_code" varchar(32) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_status_operations_pk" PRIMARY KEY("tenant_id","user_id","operation_id"),
	CONSTRAINT "company_status_operations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade,
	CONSTRAINT "company_status_operations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade,
	CONSTRAINT "company_status_operations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade,
	CONSTRAINT "company_status_operations_status_check" CHECK ("status_code" IN ('potential', 'active', 'passive', 'blacklist'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_status_operations_company_idx" ON "company_status_operations" USING btree ("company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_status_operations_created_at_idx" ON "company_status_operations" USING btree ("created_at");
