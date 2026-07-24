-- 0078 öncesinde de gönderen firma + varış deposu alanlarıyla kaydedilmiş gelen
-- sevkiyatlar vardı. 0080 eski kayıtları topluca giden olarak işaretledi; güçlü
-- operasyon işaretleri bulunan bu satırları yeniden doğru yöne al. Müşteri,
-- satış ve teslimat adresi bağlı satırlar 0079 ile giden olarak kalır.
update "shipments"
set "direction" = 'incoming'
where "created_at" < timestamptz '2026-07-21 08:09:00+00'
  and "sender_company_id" is not null
  and "destination_warehouse_id" is not null
  and "company_id" is null
  and "delivery_address_id" is null
  and "opportunity_id" is null
  and "sales_order_id" is null;
