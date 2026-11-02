# 2 Kasım 2026 — web eşitlemesi devamı

**Son durum:** mobil **637/637** test, TypeScript **0 hata**. Rota denetimi **531/531** çağrı (GET **228/228**), eksik veya çözümlenemeyen yol yok. Web aksiyon kapsamı **347/362 (%96)**. Android `:app:assembleDebug` ve imzasız arm64 iOS simulator build geçti. Cihaz/simülatörde ekran kabulü yapılmadı.

## Eklenen mobil alanlar

- **Fuar:** Bölüm, Görüşen, İl/İlçe süzgeçleri (web `listParams` ile aynı). "Görüşmeler / Fotoğraflar" geçişi ve fotoğraf galerisi (`/trade-fairs/photos`, `/files/:id/preview`, `files.read`).
- **Fırsatlar:** bölge/il süzgeci (web `opportunityLocation` kuralları). Firma ili kart kimlikleriyle `GET /companies?ids=` üzerinden 100'lük gruplar halinde gelir. Kanban, diğer mobil süzgeçler gibi bu süzgeci uygulamaz; filtre açılınca liste görünümüne geçilir.
- **Webmail:** süper admin başka kullanıcının hesabını bağlar/kaldırır, metin ve görsel imzasını düzenler (`/mail/account/users/:id…`).
- **Fiyat listeleri:** lazer fiyat listeleri (önizle/kaydet), model × güç satış fiyatı ve aksesuar/opsiyon satış fiyatı düzenleyicileri.
- **Toplu Mail:** kampanya listesi/detayı, durdur/sürdür, yeni gönderim (CRM adayları, Excel/CSV, yapıştırma), ret listesi.
- **Teklif:** matrisli lazer baz kartta tabla + güç seçimi fiyatı model × güç tablosundan veya CIF/millileştirilmiş listeden alır, `compatibility.configurationPrice` saklar. Seçim sonrası teknik özellikler web gibi doldurulur (baz model, lazer profil çözümü, HEX 2026). Kayıtlı ve dokunulmamış teklif satırları yeniden fiyatlanmaz.
- **Ürün detayı:** model × güç fiyat tablosu.

## Kalan 15 "eksik" aksiyon

Gerçek eksik değil:
- `publicComplaint`, `publicMail`: müşteriye açık web sayfaları.
- `competitor`, `noteTemplate`: web'de hiçbir sayfa kullanmıyor.
- `mail.*` (4) ve `file.imagePreview`: mobilde var. Denetim betiği webin yol ifadesini ya da `Image` kaynağını çözemiyor.

## Native ortam düzeltmeleri

Kök `node_modules`, eski `apps/mobile`'ın RN 0.86 paketlerini taşıyor. mobile-v2'nin kendi paketleri `apps/mobile-v2/node_modules` altında. Üç yer kök kopyaya bağlanıyordu:

- TypeScript: `tsconfig.json` `paths`, `react-native`'i yerel kopyaya sabitler. NativeWind `className` tipleri bununla geri geldi; önceden 74 hata vardı.
- Android: 28 Ekim'den kalan `android/build/generated/autolinking` önbelleği kök paketleri gösteriyordu. Silinince güncel autolinking yerel kopyaları seçti. Modül testleri 3/3, `assembleDebug` geçti.
- iOS: `Podfile.lock` yolları köke işaret ediyordu. `LANG=en_US.UTF-8 pod install` ile `../node_modules` (mobile-v2) altına taşındı, build geçti. Siri metadata kontrolü iki intent ve kısayolları buldu.

Temiz bir makinede `pod install` ve Android prebuild sonrası bu durum kendiliğinden oluşur. Eski önbelleği olan makinede önbelleği silmek gerekir.

## Kapsam dışı / açık

- Fiziksel cihaz, Siri/Android rol kabulü, mağaza paketleri, AppFunctions: 30 Ekim notundaki sınırlar aynen geçerli.
- Expo web build'inde fuar galeri küçük resimleri yetki başlığı taşımadığı için açılmaz (iOS/Android etkilenmez).
