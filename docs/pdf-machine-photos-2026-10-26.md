# Teklif PDF makine fotoğrafları — 2026-10-26

## Kök neden

Salt okunur üretim sayımı: 32 kayıtlı teklif kaleminin snapshot ürün bloğunda imageUrl yoktu; bunların 31'inin güncel ürününde fotoğraf vardı. Bu 31 referans mevcut public ürün medya yollarındaydı. PDF yalnız snapshot.imageUrl okuyordu. Ayrıca ürün API'sinin kabul ettiği tam ürün medya URL/query biçimi PDF yardımcı katmanında tanınmıyordu.

## Düzeltme

- Yetkilendirilmiş teklifin actor.tenantId bilgisi PDF medya katmanına aktarılır.
- Yalnız fotoğraf eksikse valid ürün kimliğiyle aktif, aynı tenant ürünü sorgulanır; fiyatlar, metinler ve snapshot kalıcı olarak değiştirilmez.
- Relative/tam HTTP(S) medya referansından UUID ayrıştırılır; URL indirilmez. Aynı public/linked ürün dosyası çözümleme kuralları korunur; özel dosyalar açılmaz.
- Renderer ağ engeli, MIME/boyut sınırları korunur. Kaynak ürün fotoğrafı olmayan kayıtlar için sahte fotoğraf eklenmez.

## Kanıt

TypeScript başarılı. 35 medya/PDF/renderer testi geçti; fotoğrafın gerçek PDF'de ek resim nesnesi olarak yer aldığı doğrulandı. İlk kısıtlı Chromium çalışması izin nedeniyle başarısızdı; gerçek native Chromium çalışması başarılı.

Aday sunucuda ağsız medya+Chromium provası geçti. Gerçek üretim snapshotlarıyla ayrıca dedicated PostgreSQL BEGIN READ ONLY işleminde 3 teklif / 3 eksik fotoğraf / 3 kurtarılan fotoğraf doğrulandı, PDF üretildi. Snapshot mutasyonu ve DB yazımı yok. Müşteri içerikleri veya PDF baytları loglanmadı.

Yalnız üç JS dosyası güncellendi: quote PDF çağrıları, tenant kapsamlı ürün görseli lookup metodu, medya yardımcısı. Şema/migration/seed/env/compose ve iş kuralları değişmedi.

Release: pdf-images-20261026-r1
Candidate: sha256:2badc1679fc78a6bcbdf69e049987e347ebe5dd4229ade95a61469f14c7dda6b
Read-only smoke SSM: 8bd1dbb6-b23f-4d90-b5bf-d4203303ae90
Cutover SSM: 467b36fa-0811-4000-b9bf-9e17e032472d

Canlı geçiş başarılı: API_HEALTH_RELEASE_VERIFIED / API_CUTOVER_VERIFIED; üç PDF uç anonim401. Compose/env hashleri ve DB/nginx konteyner kimlikleri korundu. Mobil teklif PDF düğmesi her istekte generate-pdf çağırır; eski yerel dosyayı yeniden kullanmaz.
