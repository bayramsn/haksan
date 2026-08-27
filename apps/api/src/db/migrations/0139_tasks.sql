-- CRM görev modülü: satışın günlük yapılacak işleri.
-- Gecikme durumu saklanmaz; due_at < now() ve status açık ise görev gecikmiştir.
CREATE TABLE IF NOT EXISTS "tasks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "division_id" uuid REFERENCES "divisions"("id") ON DELETE SET NULL,
  "title" varchar(255) NOT NULL,
  "description" text,
  "status" varchar(16) DEFAULT 'todo' NOT NULL,
  "priority" varchar(16) DEFAULT 'normal' NOT NULL,
  "assigned_to_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "due_at" timestamp with time zone,
  "remind_before_minutes" integer,
  "reminder_sent_at" timestamp with time zone,
  "company_id" uuid REFERENCES "companies"("id") ON DELETE SET NULL,
  "contact_id" uuid REFERENCES "contacts"("id") ON DELETE SET NULL,
  "opportunity_id" uuid REFERENCES "opportunities"("id") ON DELETE SET NULL,
  "quote_id" uuid REFERENCES "quotes"("id") ON DELETE SET NULL,
  "service_ticket_id" uuid REFERENCES "service_tickets"("id") ON DELETE SET NULL,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone,
  CONSTRAINT "tasks_status_check" CHECK ("status" IN ('todo', 'in_progress', 'done', 'cancelled')),
  CONSTRAINT "tasks_priority_check" CHECK ("priority" IN ('low', 'normal', 'high', 'urgent'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "task_id" uuid NOT NULL REFERENCES "tasks"("id") ON DELETE CASCADE,
  "event_type" varchar(32) NOT NULL,
  "summary" varchar(512) NOT NULL,
  "actor_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_tenant_assignee_due_idx" ON "tasks" ("tenant_id", "assigned_to_user_id", "due_at");
CREATE INDEX IF NOT EXISTS "tasks_tenant_status_idx" ON "tasks" ("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "tasks_company_idx" ON "tasks" ("company_id");
CREATE INDEX IF NOT EXISTS "tasks_opportunity_idx" ON "tasks" ("opportunity_id");
CREATE INDEX IF NOT EXISTS "tasks_quote_idx" ON "tasks" ("quote_id");
CREATE INDEX IF NOT EXISTS "tasks_service_ticket_idx" ON "tasks" ("service_ticket_id");
CREATE INDEX IF NOT EXISTS "task_events_task_idx" ON "task_events" ("task_id", "created_at");
CREATE INDEX IF NOT EXISTS "task_events_tenant_idx" ON "task_events" ("tenant_id");
--> statement-breakpoint
-- tasks.manage: ekibin bütün görevlerini görme + başkasına atama. Silme ayrı
-- (tasks.delete) çünkü görüntüleme yetkisi olan herkes silebilmemeli.
INSERT INTO "permissions" ("code", "name", "resource", "action") VALUES
  ('tasks.read', 'tasks — read', 'tasks', 'read'),
  ('tasks.create', 'tasks — create', 'tasks', 'create'),
  ('tasks.update', 'tasks — update', 'tasks', 'update'),
  ('tasks.delete', 'tasks — delete', 'tasks', 'delete'),
  ('tasks.manage', 'tasks — manage', 'tasks', 'manage')
ON CONFLICT ("code") DO NOTHING;
--> statement-breakpoint
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT role.id, permission.id
FROM "roles" role
CROSS JOIN "permissions" permission
WHERE permission.resource = 'tasks'
  AND (
    role.code IN ('super_admin', 'admin')
    OR (role.code IN ('sales', 'service', 'finance', 'stock') AND permission.action IN ('read', 'create', 'update'))
    OR (role.code = 'readonly' AND permission.action = 'read')
  )
ON CONFLICT DO NOTHING;
