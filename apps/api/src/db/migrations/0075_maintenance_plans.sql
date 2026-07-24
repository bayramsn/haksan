create table if not exists "maintenance_plans" (
  "id" uuid primary key default gen_random_uuid(),
  "tenant_id" uuid not null references "tenants" ("id") on delete cascade,
  "division_id" uuid references "divisions" ("id") on delete set null,
  "customer_device_id" uuid not null references "customer_devices" ("id") on delete cascade,
  "company_id" uuid not null references "companies" ("id") on delete restrict,
  "title" varchar(255) not null,
  "interval_days" integer not null default 180,
  "last_service_date" timestamptz,
  "next_due_date" timestamptz not null,
  "reminder_lead_days" integer not null default 14,
  "auto_create_ticket" boolean not null default false,
  "is_active" boolean not null default true,
  "notes" text,
  "last_reminded_at" timestamptz,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now(),
  "deleted_at" timestamptz
);

create index if not exists "maintenance_plans_tenant_idx" on "maintenance_plans" ("tenant_id");
create index if not exists "maintenance_plans_tenant_division_idx" on "maintenance_plans" ("tenant_id", "division_id");
create index if not exists "maintenance_plans_device_idx" on "maintenance_plans" ("customer_device_id");
create index if not exists "maintenance_plans_next_due_idx" on "maintenance_plans" ("next_due_date");
