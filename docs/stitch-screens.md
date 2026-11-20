# Haksan CRM Mobile — Stitch Ekran Envanteri

**Proje:** Haksan CRM Mobile — Premium  
**Project ID:** `5470261679107716920`  
**Design System:** Industrial Authority (`assets/33219cf4465043ba849cffb3262e2fd9`)

## Logo Kuralı

Orijinal logo **yeniden çizilmez**. Stitch projesine yüklenen `haksanmakina_logo.jpeg` kullanılır:

| Kaynak | Screen ID |
|--------|-----------|
| Stitch asset | `projects/5470261679107716920/screens/3039810427985777450` |
| Repo kopyası | `apps/web/public/brand/haksan-makina-logo.png` |
| Stitch referans | `.stitch/haksan-makina-logo.png` |

**Kullanma:** Prompt'ta `haksanmakina_logo.jpeg` + `object-fit: contain` + `max-height: 24–32px`  
**Kullanma:** AI vector logo (`13dd6492736f4dd8a48b91e1c4109849`) — **kullanılmaz**

---

## Tamamlanan Ekranlar (yapılış sırasına göre)

### Core (önceki turlardan)

| # | Ekran | Screen ID | Logo |
|---|-------|-----------|------|
| 01 | Giriş Yap | `4317794155364e12aa9f8f7329b060a5` | ✅ Orijinal |
| 02 | Gösterge Paneli | `91f83c94ae8044cb867284b3a21aaeb3` | ✅ Orijinal |
| 03 | Firmalar Listesi | `97f60630c8ea490884fbd3e5d4a8b98d` | ✅ Orijinal |
| 04 | Firma Detay | `ef13463040844f039c6dd02203d10adb` | ✅ Orijinal |
| 05 | Satış Kartları (Liste) | `e0417d17b4494b689a8a7ce4f90c3ce9` | — (başlık) |
| 06 | Servis Talepleri | `8d84b0d695cc4130acafcd7ab6bd5362` | — (başlık) |
| 07 | Daha Fazla (Menü) | `8f6629c4b4f341528b07fc04fa724b6e` | — (profil) |

### Genel

| # | Ekran | Screen ID |
|---|-------|-----------|
| 08 | Bildirimler | `176b14a5f4494a1c9fda2a2e9cbbb09e` |
| 09 | Hızlı Oluştur (bottom sheet) | `2c320b06c6a248d2bdd542e5a56380bd` |
| 10 | Takvim | `4774acd7377d466ba1375c82d3b902c3` |
| 11 | Sohbet | `20e9867b31b94036b5d18145cbcb340d` |
| 12 | Ayarlar | `be0e94bc236f4625b741588e944c975f` |
| 13 | Kullanıcılar & Roller (admin) | `bfa5fc637de945dabea006a5ed7ae18a` |

### Satış

| # | Ekran | Screen ID |
|---|-------|-----------|
| 14 | Satış Kartları — Kanban | `3aa7f677e6b04524affe16d5a015a563` |
| 15 | Satış Kartı Detay | `597448c4a0c04fc3abec716228170015` |
| 16 | Yeni Satış Kartı (sheet) | `fc086d9be9314bec8b63b337ba82d7d6` |
| 17 | Teklifler Listesi | `967defac0e8a4b9c81ad0fae8ec76f0c` |
| 18 | Teklif Detay | `1194f1f021df4baa8d4e53a6e4b9aa64` |
| 19 | Yeni Teklif | `0fbd72b2cd574561a0f2a4d65` |
| 20 | Kontaklar Listesi | `cc4d0dd86ff44d15a4d91ee39a6edcb2` |
| 21 | Yeni Firma (sheet) | `e51a592a39e54981a1a54fa885fce442` |
| 22 | Yeni Ziyaret (sheet) | `1ebc147e29954aff894eb5fd3fb3049a` |
| 23 | Dokümanlar / Proforma / Sözleşme | `1639d10a6abe4318b740ea99e490bb9f` |
| 24 | Yeni Proforma (sheet) | `d249d514558a47149b69bc977c79f0ce` *(2026-06-25)* |
| 25 | Yeni Sözleşme (sheet) | `2c5f087b46154a3aadf41d171bc8741e` *(2026-06-25)* |
| 26 | Yeni Teklif Revizyonu — Adım 1 | `4a847acaab294b978acef890f5b48816` *(2026-06-25)* |
| 27 | Kontak Seç (sheet) | `a505fa251b334b55af483eb03c989090` *(2026-06-25)* |

### Operasyon

| # | Ekran | Screen ID |
|---|-------|-----------|
| 24 | Operasyon Hub | `59dda0b65eb34257a78da299cdb1ca5f` |
| 25 | Stok | `56f23455b6f6494bb117eed2b12acb27` |
| 26 | Ödemeler | `2d0bb69b8f37493bb75d039e4d186589` |
| 27 | Vade Takibi | `5f5fcbec93be47bfa1df623e5f694788` |
| 28 | Ürünler (Liste) | `0c1948c4002f4940a277c4856ef19e11` *(v3 liste, 2026-06-25)* |
| 28b | Ürün Detay (HPB-30135) | `aa85e966cd724d27b8ab6ac3942622b5` *(yeni, 2026-06-25)* |
| 29 | Satın Alma | `8f55046fd9104417b318c27f3f337340` |
| 30 | Sevkiyat *(v1)* | `3527605b954f4ed995779401fca9595c` |
| 31 | Teslimat (eski — lojistik, deprecated) | `9de56f44ec9b4b29a366edc58f4e7d9c` |
| 31b | Teslimat Listesi (v2) | `07e3891dd863483f8aa3ded4229f9bf3` |
| **31g** | Teslimat Listesi (v3) | `0b44a6ab6c8244d39630d8cad2c7bbf2` |
| **31j** | **Teslimat Listesi (v4 — canonical, premium)** | `dbb9fd3a3dd644aa8259e1e6f09aa03c` *(2026-06-25)* |
| 31c | Yeni Teslimat / Kurulum Tutanağı Formu | `26fcdef5864e4571a82b015d009da358` *(2026-06-25)* |
| 31d | Teslimat Detay — Kurulum Tutanağı (Özet) | `a7be4c1821214795b36e06f2d98bab30` *(2026-06-25)* |
| 31h | Teslimat Detay — Tezgah & CNC sekmesi | `dc1becae006e4147ac0e9ae21cba3337` *(2026-06-25)* |
| 31i | Teslimat — Kurulum Tutanağı PDF Önizleme | `c17191d06d8e4585997e17a373e67889` *(2026-06-25)* |
| 31e | Teslimat İmza Alma | `c45226230b6143389b0764bbe949688d` *(2026-06-25)* |
| 31f | Teslimat Filtre (bottom sheet) | `b3a44063f54a43c19c4b51f244ec3768` *(2026-06-25)* |
| 32 | Kurulum (liste) | `be97fe6edd78452caef41f9d8191139f` |
| 32a | Kurulum Detayı — INS-2026-019 | `fd8ecb8c8c45489185d948789e426b8a` *(2026-06-25)* |
| 32b | Yeni Kurulum Planı (sheet) | `f408c378c5564b5f84db95464abda114` *(2026-06-25)* |
| 32c | Kurulum Filtreleri (sheet) | `ce97e662869c4f0dbdebf6e912f3ebcb` *(2026-06-25)* |
| 32d | Kurulum Tutanağı Önizleme (v1) | `f53643a7a4ce411288665331067786b3` *(2026-06-25)* |
| **32f** | **Kurulum Tutanağı Önizleme v2 (canonical)** | `38c79ab94fde4f1383d14df3c5382514` *(2026-06-25)* |
| 32e | Kurulum Check-list | `f7746fe93bfb494ea770ecfec00091d7` |
| 33 | Cari Rapor | `0880532884174e46ab348e080f6a5072` |
| 34 | Muhasebe Faturaları | `08d2ed1465794d809fd2e61492172b27` |

### Servis

| # | Ekran | Screen ID |
|---|-------|-----------|
| 35 | Servis Talebi Detay | `f4422d3497b74a0fa49f791cc5470e87` |
| 36 | Makineler | `5a449b07b93f495e96b75fcbe82808ea` |
| 37 | Servis Kanban | `8fb2a69578fd49dc9ec86205fdbd4a13` |
| 38 | Servis Fiyat Listesi | `022fa7ebd7374833a1154b7801b11a4c` |

### İkincil Ekranlar (detay & form)

| # | Ekran | Screen ID |
|---|-------|-----------|
| 39 | Makine Detay (HSM-650) | `2a78675617ca4a66bdc7417cf45cc7d7` |
| 40 | Yeni Servis Talebi (form) | `7bae69e33bef4490af93ee7ea66f617a` |
| 41 | Stok Hareket Detay (SKU) | `1853776160114422a006daa5ec24cb51` |
| 42 | Tahsilat / Ödeme Kaydet | `a9aceb5592c54320a4fd7d3e5cddb54e` |

### Premium Tur (2026-06-23) — Re-do + Kritik Eksikler

> Aşağıdaki 14 ekran "Industrial Authority" design system'i ile bu turda üretildi.
> Logo gerektiren ekranlarda Stitch'e yüklenen **gerçek `haksanmakina_logo.jpeg`** asset'i
> `object-fit: contain` + `max-height: 24–32px` (Login için 56px) ile statik `<img>` olarak gömüldü.
> AI vector logo varyantı kullanılmadı.

| # | Ekran | Screen ID | Logo |
|---|-------|-----------|------|
| 43 | Giriş Yap (yeniden) | `4e878ae66e9d4ed2942b498d335a345a` | ✅ Orijinal (56px) |
| 44 | Şifremi Unuttum | `20f7c7da845246c29ab5ff4fd47baa86` | ✅ Orijinal |
| 45 | Yeni Ziyaret Planla (yeniden) | `7456e3b60ec94b6faa3d282858eead0a` | — (başlık) |
| 46 | Yeni Makine Ekleme Formu | `702840f00a18422981fe35fffec92910` | — (başlık) |
| 47 | Sevkiyat / Teslimat Detay *(v1)* | `22555872ce2342218b1e4a55097b4510` | — (başlık) |
| 48 | Müşteri Cari Hesap Detay (Ekstre) | `035028a0a0e142ff9a7f2c6bba427c12` | — (başlık) |
| 49 | Fatura Detay (PDF Preview) | `a05aebeb7ca34c1baee1b95a54235225` | — (başlık) |
| 50 | Yeni Satın Alma Siparişi | `9a1c4dcd3b8741c1a297d6476a20723e` | — (başlık) |
| 51 | Servis Tamamlama / İmzalama | `15a25afeb453484b46bfc42efa2f379` | — (başlık) |
| 52 | Kurulum Check-list | `f7746fe93bfb494ea770ecfec00091d7` | — (başlık) |

### Operasyon — Kurulum Alt Sayfaları (2026-06-25)

> Web `InstallationsPage` + `CreateInstallationDialog` aksiyon paritesi.  
> Akış: **Liste (#32)** → **Detay (#32a)** → Checklist (#32e) / Tutanağı (#32d).  
> FAB → **Yeni Kurulum (#32b)**. Filtre ikonu → **Filtreler (#32c)**.

| # | Ekran | Screen ID | Web aksiyonu |
|---|-------|-----------|--------------|
| K1 | Kurulum Detayı | `fd8ecb8c8c45489185d948789e426b8a` | Satır tıklama → detay sekmeleri |
| K2 | Yeni Kurulum Planı | `f408c378c5564b5f84db95464abda114` | `installation.create` |
| K3 | Kurulum Filtreleri | `ce97e662869c4f0dbdebf6e912f3ebcb` | Liste filtre çekmecesi |
| K4 | Kurulum Tutanağı PDF | `f53643a7a4ce411288665331067786b3` | `installation.printForm` |
| K5 | Kurulum Check-list | `f7746fe93bfb494ea770ecfec00091d7` | `installation.complete` + imza/foto |
| 53 | Bakım Planı Detay & Takvim | `4811cbc632574d4a88d112e48922db59` | — (başlık) |
| 54 | Firma Haritası | `233c28eb0f214df2a92e45e37c1331be` | — (başlık) |
| 55 | Satış Fiyat Listesi | `0de944310e76433eac2f1cd35e13b547` | — (başlık) |
| 56 | Raporlar (Yönetici Dashboard) | `de01a6c9464143c5a01a4353bc151ff9` | — (başlık) |

> Sıralama, kod implementasyon planı için `docs/mobile-development-plan.md` faz tablosunu izler.

### Operasyon — Sevkiyat v2 (2026-06-25)

> **Stitch projesi:** `5470261679107716920` — Industrial Authority design system.
> Web `ShipmentsPage` + `CreateShipmentDialog` paritesi; mobil kart listesi + bottom sheet formlar.

| # | Ekran | Screen ID | Web parite |
|---|-------|-----------|------------|
| S1 | Sevkiyat Listesi (KPI + filtre + kartlar) | `c6314a6177fb4bf89f53bf83384513e9` | `shipments/` 00-main |
| S2 | Yeni Sevkiyat (bottom sheet) | `a58a0abce9bd4415a864f8e45a1feb6d` | `shipments/` 01-create |
| S3 | Sevkiyat Detay — Özet sekmesi | `825e9ad5f799459f9312b8b7a3e49e48` | detay + irsaliye |
| S4 | Sevkiyat Detay — Kalemler sekmesi | `5e3310f615c341a082a34cf206e37373` | paketleme listesi |
| S5 | Durum Güncelle (bottom sheet) | `7e87f202100f4ec3936c28295bd7c12f` | status PATCH |
| S6 | Sevkiyat Detay — Geçmiş sekmesi | `8daf21bc330548cdbb1c4c31a3995c06` | tarih alanlarından timeline |
| S7 | Sevkiyat İrsaliye Önizleme | `425765f529a04bd3bdf1c31165ae4aeb` | dispatch note / paylaş |

> **Akış:** Operasyon Hub → Sevkiyat (S1) → kart tap → Detay Özet (S3) → Kalemler (S4) / Geçmiş (S6) / Durum Güncelle (S5) / İrsaliye Yazdır (S7).
> Yeni sevkiyat: S1 sticky CTA → Yeni Sevkiyat sheet (S2).

---

## Onboarding Akışı (2026-06-23) — Yeni Proje

> **Stitch projesi:** `projects/9673456614556193344` — "Haksan CRM Mobile — Onboarding".
> Bu proje **ayrı** olarak açıldı; ana CRM ekranlarından bağımsız iterasyon yapılabilsin diye.
> "Industrial Authority" design system'i ile, Hanken Grotesk + navy `#000c69` paleti korundu.
> Bu projede orijinal logo asset'i henüz yüklenmediği için splash ekranındaki logo
> Stitch tarafından `haksanmakina.com.tr/images/logo.png`'den çekildi. Login/Welcome ekranlarında
> "HAKSAN MAKİNA" wordmark olarak metin işlendi.

| # | Ekran | Screen ID | Not |
|---|-------|-----------|-----|
| O1 | Splash (logo + spinner) | `da755f4f93914897a44a22012a7ca2b4` | Logo: web sitesinden |
| O2 | Karşılama / Hoş Geldin | `de288359e2d240298226f4831f8ae83a` | Wordmark + 2 buton |
| O3 | Tanıtım 1 — Saha & Ofis Tek Ekranda | `f4eda76135c243a99d3f6f74e2cd73ee` | 3-step carousel slide 1 |
| O4 | Tanıtım 2 — Akıllı Çağrı Asistanı | `4406d5af55ff4393bd3c84affc20eadf` | Slide 2, çağrı popup mock'u |
| O5 | Tanıtım 3 — Servis & Bakım Cebinizde | `f7c43c81dc064b1f9373b3ada4d77606` | Slide 3, imza + offline chip |
| O6 | Sunucu / API URL Kurulumu | `20bb9aa5101d48148ede4533190a7898` | Segmented + QR + test chip |
| O7 | İzinler (Permissions Hub) | `df5782f53294496e8c87bfa7439ab1e1` | 5 izin listesi (Bildirim, Çağrı, Takvim, Konum, Kamera) |
| O8 | İzin Sistem Prompt — Çağrı Kayıtları (Android) | `fdbbbdd4b61c4228b39f80c25f4e5ceb` | Android system sheet pre-prompt |
| O9 | Başlamaya Hazır (Success) | `8f765486f71f47fc86ccf9c3bbca6221` | Setup özeti + "Başlayalım" + Tour |

> **Akış sırası:**
> `O1 Splash` → `O2 Welcome` → `O3-O5 Carousel` → `O6 API URL` → `Login` (ana projede #43) → `O7 İzinler` → (gerekirse) `O8 Sistem prompt` → `O9 Success` → `Dashboard`.
>
> Çağrı, Konum izinleri *just-in-time* (kullanım anında) tetiklenebilir; onboarding sırasında istemek opsiyonel.

---

## Prompt Şablonu (logo ile)

```
CRITICAL LOGO RULE: Use EXACT uploaded 'haksanmakina_logo.jpeg' as static <img>.
Do NOT redraw, recreate, or alter. object-fit: contain, max-height: 28px.
```
