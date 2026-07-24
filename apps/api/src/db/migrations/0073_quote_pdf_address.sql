alter table "quotes"
  add column if not exists "company_address_id" uuid;

-- Mevcut teklifler için PDF adresini fatura adresi → ana adres → ilk adres
-- önceliğiyle belirle. Kesinleşmiş eski belgelerin snapshot verisi değişmez.
with ranked_addresses as (
  select
    id,
    company_id,
    row_number() over (
      partition by company_id
      order by is_billing desc, is_default desc, created_at asc, id asc
    ) as address_rank
  from company_addresses
  where deleted_at is null
)
update quotes as quote
set company_address_id = ranked_addresses.id
from ranked_addresses
where quote.company_id = ranked_addresses.company_id
  and ranked_addresses.address_rank = 1
  and quote.company_address_id is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'quotes_company_address_id_company_addresses_id_fk'
  ) then
    alter table "quotes"
      add constraint "quotes_company_address_id_company_addresses_id_fk"
      foreign key ("company_address_id") references "company_addresses"("id")
      on delete set null;
  end if;
end $$;

create index if not exists "quotes_company_address_idx"
  on "quotes" ("company_address_id");

comment on column "quotes"."company_address_id" is
  'Teklif ve bu teklife bağlı PDF çıktılarında kullanılacak firma adresi.';
