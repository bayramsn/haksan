alter table "companies"
  add column if not exists "supplier_category_code" varchar(32);

update "companies"
set "supplier_category_code" = case
  when "sector" = 'Yerel Kargo' then 'logistics'
  when "sector" = 'Nakliye / Lojistik' then 'transportation'
  else "supplier_category_code"
end
where "supplier_category_code" is null
  and "sector" in ('Yerel Kargo', 'Nakliye / Lojistik');

alter table "shipments"
  add column if not exists "direction" varchar(16) not null default 'incoming';

alter table "shipment_items"
  add column if not exists "package_quantity" integer,
  add column if not exists "package_unit_code" varchar(64);

update "shipment_items"
set
  "package_quantity" = case
    when coalesce("pallet_count", 0) > 0 then "pallet_count"
    else "package_count"
  end,
  "package_unit_code" = case
    when coalesce("pallet_count", 0) > 0 then 'pallet'
    when "package_count" is not null then 'package'
    else null
  end
where "package_quantity" is null;

create table if not exists "shipment_package_units" (
  "id" uuid primary key default gen_random_uuid(),
  "code" varchar(64) not null,
  "name" varchar(255) not null,
  "description" text,
  "sort_order" integer not null default 0,
  "is_active" boolean not null default true,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now(),
  "created_by" uuid references "users" ("id"),
  "updated_by" uuid references "users" ("id"),
  "deleted_at" timestamptz
);

create unique index if not exists "shipment_package_units_code_unique"
  on "shipment_package_units" ("code");

insert into "shipment_package_units" ("code", "name", "sort_order") values
  ('package', 'Paket', 10),
  ('pallet', 'Palet', 20),
  ('crate', 'Sandık', 30),
  ('box', 'Koli', 40),
  ('piece', 'Adet', 50)
on conflict ("code") do nothing;

create index if not exists "companies_supplier_category_idx"
  on "companies" ("supplier_category_code");
create index if not exists "shipments_direction_idx"
  on "shipments" ("tenant_id", "direction");
