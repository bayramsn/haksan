-- 0078 eklenmeden önce uygulama yalnızca müşteriye giden sevkiyat oluşturuyordu.
-- Bu nedenle satış/sipariş bağlantısı olmayan manuel eski kayıtlar da giden
-- sevkiyattır. 0079 bağlantılı kayıtları düzeltti; bu migrasyon kalan eski
-- manuel kayıtları da güvenli zaman sınırıyla tamamlar.
update "shipments"
set "direction" = 'outgoing'
where "direction" = 'incoming'
  and "created_at" < timestamptz '2026-07-21 08:09:00+00';
