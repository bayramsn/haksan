-- 0078 öncesinde sistem yalnızca müşteriye giden sevkiyat üretiyordu. Yeni yön
-- kolonu eklenirken bu eski satırlar kolon varsayılanı nedeniyle "incoming"
-- olmuştu. Satış/sipariş/adres bağlantısı eski giden sevkiyatın güvenilir izi.
update "shipments"
set "direction" = 'outgoing'
where "direction" = 'incoming'
  and "created_at" < timestamptz '2026-07-21 08:09:00+00'
  and (
    "opportunity_id" is not null
    or "sales_order_id" is not null
    or "delivery_address_id" is not null
  );

-- Eski istemciler yön göndermese bile 0078 öncesi davranış korunur. Yeni web
-- istemcisi gelen sevkiyatlarda "incoming" değerini açıkça gönderir.
alter table "shipments"
  alter column "direction" set default 'outgoing';
