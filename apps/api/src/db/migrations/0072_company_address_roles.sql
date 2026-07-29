alter table "company_addresses"
  add column if not exists "is_shipping" boolean default false not null;

alter table "company_addresses"
  add column if not exists "is_billing" boolean default false not null;

-- Her firma için mevcut adreslerden tek bir sevkiyat adresi belirle.
-- Öncelik: eski "shipping" türü, eski varsayılan adres, ilk oluşturulan adres.
with ranked_shipping as (
  select
    id,
    row_number() over (
      partition by company_id
      order by (address_type = 'shipping') desc, is_default desc, created_at asc, id asc
    ) as role_rank
  from company_addresses
  where deleted_at is null
)
update company_addresses as address
set is_shipping = true
from ranked_shipping
where address.id = ranked_shipping.id
  and ranked_shipping.role_rank = 1;

-- Her firma için mevcut adreslerden tek bir fatura adresi belirle.
-- Öncelik: eski "billing" türü, eski varsayılan adres, ilk oluşturulan adres.
with ranked_billing as (
  select
    id,
    row_number() over (
      partition by company_id
      order by (address_type = 'billing') desc, is_default desc, created_at asc, id asc
    ) as role_rank
  from company_addresses
  where deleted_at is null
)
update company_addresses as address
set is_billing = true
from ranked_billing
where address.id = ranked_billing.id
  and ranked_billing.role_rank = 1;

comment on column "company_addresses"."is_shipping" is
  'Firma için seçilmiş sevkiyat adresi; firma başına en fazla bir aktif adres true olmalıdır.';

comment on column "company_addresses"."is_billing" is
  'Firma için seçilmiş fatura adresi; firma başına en fazla bir aktif adres true olmalıdır.';
