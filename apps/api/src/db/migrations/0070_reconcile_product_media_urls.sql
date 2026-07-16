-- Eski ürün görselleri iki tarihsel biçimde kalmış olabilir:
--   1) /api/v1/products/media/<uuid> (frontend API prefix'ini ikinci kez ekliyordu)
--   2) Nesne deposunun doğrudan URL'si (özel bucket 403 döndürüyordu)
--
-- Doğrudan URL'yi yalnızca aynı tenant'taki, silinmemiş ve gerçek MIME türü
-- image/* olan mevcut dosya kaydıyla TAM bucket/object-key son eki eşleşiyorsa
-- ürün medyasına bağla. Bucket herkese açılmaz; mevcut kontrollü API proxy'si
-- public + linked + product_media koşullarını doğrulamaya devam eder.

insert into product_media (
  tenant_id,
  product_model_id,
  file_id,
  media_type,
  title,
  sort_order
)
select
  pm.tenant_id,
  pm.id,
  f.id,
  'image',
  f.original_filename,
  0
from product_models pm
join files f
  on f.tenant_id = pm.tenant_id
 and f.bucket = 'erp-product-images'
 and f.mime_type like 'image/%'
 and f.deleted_at is null
 and right(split_part(pm.image_url, '?', 1), char_length('/' || f.bucket || '/' || f.object_key))
     = '/' || f.bucket || '/' || f.object_key
where pm.deleted_at is null
  and pm.image_url ~* '^https?://'
  and f.upload_status in ('pending', 'uploaded', 'linked')
  and not exists (
    select 1
    from product_media existing
    where existing.tenant_id = pm.tenant_id
      and existing.product_model_id = pm.id
      and existing.file_id = f.id
  );

update files f
set
  visibility = 'public',
  upload_status = 'linked',
  uploaded_at = coalesce(f.uploaded_at, now()),
  updated_at = now()
where f.bucket = 'erp-product-images'
  and f.mime_type like 'image/%'
  and f.deleted_at is null
  and f.upload_status in ('pending', 'uploaded', 'linked')
  and exists (
    select 1
    from product_models pm
    join product_media media
      on media.tenant_id = pm.tenant_id
     and media.product_model_id = pm.id
     and media.file_id = f.id
    where pm.tenant_id = f.tenant_id
      and pm.deleted_at is null
      and pm.image_url ~* '^https?://'
      and right(split_part(pm.image_url, '?', 1), char_length('/' || f.bucket || '/' || f.object_key))
          = '/' || f.bucket || '/' || f.object_key
  );

update product_models pm
set
  image_url = '/products/media/' || f.id::text,
  updated_at = now()
from files f
where f.tenant_id = pm.tenant_id
  and f.bucket = 'erp-product-images'
  and f.mime_type like 'image/%'
  and f.visibility = 'public'
  and f.upload_status = 'linked'
  and f.deleted_at is null
  and pm.deleted_at is null
  and pm.image_url ~* '^https?://'
  and right(split_part(pm.image_url, '?', 1), char_length('/' || f.bucket || '/' || f.object_key))
      = '/' || f.bucket || '/' || f.object_key
  and exists (
    select 1
    from product_media media
    where media.tenant_id = pm.tenant_id
      and media.product_model_id = pm.id
      and media.file_id = f.id
  );

update product_models
set
  image_url = regexp_replace(image_url, '^/api/v[0-9]+', '', 'i'),
  updated_at = now()
where deleted_at is null
  and image_url ~* '^/api/v[0-9]+/products/media/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
