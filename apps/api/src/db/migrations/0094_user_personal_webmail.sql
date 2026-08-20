CREATE TABLE IF NOT EXISTS "user_mail_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"email" varchar(320) NOT NULL,
	"display_name" varchar(255) NOT NULL,
	"encrypted_password" text NOT NULL,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"last_verified_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"last_error_at" timestamp with time zone,
	"last_error_code" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_mail_accounts_tenant_user_unique" UNIQUE("tenant_id","user_id"),
	CONSTRAINT "user_mail_accounts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade,
	CONSTRAINT "user_mail_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_mail_accounts_tenant_email_idx" ON "user_mail_accounts" USING btree ("tenant_id","email");
