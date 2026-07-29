insert into "company_relation_types" (
  "code",
  "name",
  "sort_order",
  "is_active"
)
values ('competitor', 'Rakip', 40, true)
on conflict ("code") do update
set
  "name" = excluded."name",
  "sort_order" = excluded."sort_order",
  "is_active" = true,
  "updated_at" = now();

