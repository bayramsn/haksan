ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "notes" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "note_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"body" text NOT NULL,
	"scope" varchar(32) DEFAULT 'quote' NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "note_templates" ADD CONSTRAINT "note_templates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "note_templates_tenant_idx" ON "note_templates" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "note_templates_scope_idx" ON "note_templates" USING btree ("scope");
