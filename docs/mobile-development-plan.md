# Haksan CRM Mobile — Geliştirme Planı

> Hedef: Web (`apps/web`) üzerinde yapılabilen **her aksiyonun** mobilde de yapılabilmesi.  
> Tasarım kaynağı: Google Stitch projesi `Haksan CRM Mobile — Premium` (project `5470261679107716920`, design system `Industrial Authority`).  
> Kod tabanı: `apps/api` (NestJS) · `apps/web` (React) · `apps/mobile` (Expo / React Native).

---

## 0. Temel prensip — Web ↔ Mobil paritesi

Tek kaynak `apps/api`. Web ve mobil **aynı REST endpoint'leri** ve **aynı RBAC** üzerinden çalışır. Üç altın kural:

1. **Tek API client.** `apps/mobile/src/api/services.ts` web çağrılarıyla 1:1 eşleşir. Yeni bir endpoint sadece web'e değil, ortak şemaya eklenir.
2. **Aksiyon haritası (action registry).** Web'deki her sayfa için "kullanıcı bu ekranda hangi eylemleri yapabiliyor?" listesi çıkarılır. Mobil ekran **aynı action key'lerini** uygular. Eksik aksiyon = parite bozulması.
3. **RBAC paritesi.** `apps/mobile/src/navigation/modules.ts` zaten web `canSee` ile birebir. Sayfa içi butonlar için de aynı `hasRole(...)` ve sunucu izin kontrolü çağrılır.

> Disiplin: Web'de yeni bir buton eklendiğinde ilgili mobil ekran ticket'ı PR şablonundaki "Action Parity Table" üzerinden otomatik açılır (CODEOWNERS / checklist).

---

## 1. Faz 0 — Altyapı (1–2 gün)

Stitch ekranlarını koda dökmeden önce **bir kere** yapılacaklar:

- **Design tokens paketi** — `packages/ui-tokens`
  - Renkler: `#000c69` (primary navy), `#cf060c` (accent red), `#f7f7f8` (canvas), `#1a1c1d` (text), `#454651` (muted).
  - Radius: 10 (button/input), 16 (card), 9999 (chip/avatar).
  - Tipografi: Hanken Grotesk · display 30/700, headline-lg 22/600, headline-md 18/600, body-lg 16/400, body-md 14/400, label-md 12/500, label-sm 11/600.
  - Aralık: 4/8/12/16/24/32, container-margin 20, gutter 12.
  - Gölge: Level 1 `0 4 20 rgba(0,0,0,.04)`; Level 2 `0 10 30 rgba(0,12,105,.08)`.
- **Ortak komponentler** (`apps/mobile/src/ui/`):
  `Button`, `Input`, `Card`, `Chip`, `Avatar`, `SegmentedControl`, `StickyBottomBar`, `Sheet`, `EmptyState`, `Skeleton`, `Toast`, `Section`, `KpiTile`, `ListRow`, `TopBar`, `Tabs`, `FilterDrawer`.
- **`useAction(key)` hook'u** — `{ visible, enabled, run }` döner. RBAC + sunucu izin yanıtını birleştirir. Her aksiyon (örn. `opportunity.create`, `invoice.send`, `service.sign`) tek bir yerde tanımlanır.
- **Form altyapısı** — `react-hook-form` + `zod`, web ile aynı `packages/schemas` paketinden.
- **Liste altyapısı** — `useInfiniteList(endpoint, filters)`: sayfalama + pull-to-refresh + filtre çekmecesi standardı.
- **Offline kuyruğu** — `react-query` + `MMKV` ile mutation kuyruğu (servis tamamlama, ziyaret raporu vb. saha senaryoları için kritik).
- **Logo bileşeni** — gerçek `haksanmakina_logo.jpeg` asset'i, `object-fit: contain`, `max-height: 24–32px` (login için 56px). AI stylize edilmiş varyant kullanılmaz.

---

## 2. Geliştirme sırası

Sıralama 3 kritere göre: (a) **bağımlılık** — önce okunan, sonra yazılan ekran; (b) **saha kullanım sıklığı**; (c) **Stitch tasarımı hazır mı**.

### Faz 1 — Çekirdek: kimlik + iskelet (1 hafta)
Mevcut: `LoginScreen`, `MenuScreen`, `CompaniesList`, `ContactsList`.

| # | Ekran | Stitch ID | Kaynak |
|---|---|---|---|
| 1 | Giriş Yap | `4e878ae66e9d4ed2942b498d335a345a` | mevcut LoginScreen'i yeniden style'la |
| 2 | Şifremi Unuttum | `20f7c7da845246c29ab5ff4fd47baa86` | yeni |
| 3 | Menü / Modül listesi | — | mevcut MenuScreen — Stitch dashboard kartları dahil edilir |
| 4 | Profil & Ayarlar | — | push notification, API URL, çıkış |

**Aksiyon paritesi:** `auth.login`, `auth.requestReset`, `auth.logout`, `profile.update`.

### Faz 2 — CRM çekirdek okuma (1 hafta)
Web'de en çok ziyaret edilen sayfalar.

| # | Ekran | Stitch ID |
|---|---|---|
| 5 | Firmalar listesi + Firma detay | (web ile uyumlu mevcut + premium stil) |
| 6 | Kişiler listesi + Kişi detay | (mevcut + premium stil) |
| 7 | Firma Haritası | `233c28eb0f214df2a92e45e37c1331be` |
| 8 | Müşteri Cari Hesap / Ekstre | `035028a0a0e142ff9a7f2c6bba427c12` |

**Aksiyon paritesi (firma detayı örneği):**
`company.update`, `company.archive`, `company.addContact`, `company.openMap`, `company.callPrimary`, `company.openWhatsApp`, `company.viewBalance`, `company.viewMachines`, `company.viewOffers`.

### Faz 3 — Satış akışı (1.5 hafta)

| # | Ekran | Stitch ID |
|---|---|---|
| 9 | Satış Kartları listesi + detay | (yeni, Kanban + form) |
| 10 | Yeni Ziyaret Planla | `7456e3b60ec94b6faa3d282858eead0a` |
| 11 | Teklif listesi + Yeni Teklif + Teklif Detay | (yeni) |
| 12 | Satış Fiyat Listesi | `0de944310e76433eac2f1cd35e13b547` (aynı zamanda teklif kalemi seçim sheet'i olarak yeniden kullanılır) |

**Aksiyon paritesi (teklif örneği):**
`offer.create`, `offer.addLine`, `offer.applyPriceList`, `offer.sendEmail`, `offer.downloadPdf`, `offer.duplicate`, `offer.convertToProforma`, `offer.markWon`, `offer.markLost`.

### Faz 4 — Operasyon (1.5 hafta)

| # | Ekran | Stitch ID |
|---|---|---|
| 13 | Yeni Makine Ekleme Formu | `702840f00a18422981fe35fffec92910` |
| 14 | Sevkiyat liste + detay + formlar | `c6314a61…` liste · `825e9ad5…` detay özet · `5e3310f6…` kalemler · `8daf21bc…` geçmiş · `7e87f202…` durum · `425765f5…` irsaliye |
| 15 | Yeni Satın Alma Siparişi + liste | `9a1c4dcd3b8741c1a297d6476a20723e` |
| 16 | Fatura Detay (PDF preview) + muhasebe & ticari fatura listeleri | `a05aebeb7ca34c1baee1b95a54235225` |
| 17 | Vade Takvimi & Ödemeler / Kasa | (yeni) |

**Aksiyon paritesi (fatura örneği):**
`invoice.preview`, `invoice.downloadPdf`, `invoice.email`, `invoice.markPaid`, `invoice.recordPayment`, `invoice.cancel`, `invoice.eArchiveSend`.

### Faz 5 — Servis akışı (1 hafta)

| # | Ekran | Stitch ID |
|---|---|---|
| 18 | Servis Talepleri listesi + Servis Kanban | (yeni) |
| 19 | Servis Tamamlama / İmza | `15a25afeb453484b46bfc42efa2f379` — offline-first |
| 20 | Kurulum Check-list | `f7746fe93bfb494ea770ecfec00091d7` — fotoğraf + imza |
| 21 | Bakım Planı Detay & Takvim | `4811cbc632574d4a88d112e48922db59` |

**Aksiyon paritesi (servis örneği):**
`service.start`, `service.addPart`, `service.addPhoto`, `service.requestSignature`, `service.complete`, `service.createFollowup`, `service.linkToContract`.

### Faz 6 — Yönetici & Raporlar (3–4 gün)

| # | Ekran | Stitch ID |
|---|---|---|
| 22 | Raporlar / Dashboard (Operasyonel + Karlılık + Analitik) | `de01a6c9464143c5a01a4353bc151ff9` |
| 23 | Excel / PDF export | (paylaşım sheet'i) |

### Faz 7 — Yönetim (yalnız admin, 2–3 gün)
Kullanıcılar / Roller / Departmanlar / Ayarlar — web ile aynı CRUD.

---

## 3. Ekran başına "Action Parity" şablonu

Her ekran ticket'ı şu çıktıyı içerir:

```md
## Ekran: <Ad>  (Stitch: <id>)
### Web referansı
- Path: apps/web/src/app/components/pages/<x>.tsx
### Veri
- GET /api/v1/<endpoint>?...
### Aksiyonlar (web'deki butonlar = mobil = parite kontrolü)
| Action key            | Endpoint                  | Web'de yer | Mobil yer        | Rol/izin        |
|-----------------------|---------------------------|------------|------------------|-----------------|
| offer.create          | POST /offers              | Sağ üst FAB| Sticky bottom bar| sales           |
| offer.duplicate       | POST /offers/:id/dup      | Kebab menü | Detay kebab      | sales           |
| offer.downloadPdf     | GET  /offers/:id/pdf      | Toolbar    | Top bar download | sales, finance  |
### Boş / yükleme / hata durumları
### Offline davranışı (varsa)
### Kabul kriterleri
- Web'de görünen tüm butonlar mobilde de mevcut.
- Rol bazlı görünürlük web ile birebir.
- Stitch tasarımına ≥%95 görsel uyum.
```

Bu tablo PR şablonunda zorunlu alandır — eksik aksiyon = merge yok.

---

## 4. Önerilen takım sıralaması (1–2 geliştirici)

| Hafta | Çıktı |
|---|---|
| 1 | Faz 0 + Faz 1 (Login / Reset / Menü / Profil) |
| 2 | Faz 2 (Firma, Kişi, Harita, Ekstre) |
| 3 | Faz 3 (Satış kartı, Ziyaret, Teklif, Fiyat listesi) |
| 4 | Faz 4 (Makine ekleme, Sevkiyat, Satın alma, Fatura, Vade) |
| 5 | Faz 5 (Servis, Kurulum, Bakım) — offline kuyruk burada test edilir |
| 6 | Faz 6 + Faz 7 + cilalama + E2E parite testi |

---

## 5. Parite testi otomasyonu

- `scripts/audit-action-parity.mjs` — **hazır**.
  - API controller'larını (`@Controller` + `@(Get|Post|...)` + `@RequirePermissions`), web servislerini (`apps/web/src/lib/services.ts`), mobil servisleri (`apps/mobile/src/api/services.ts`) ve web sayfalarındaki kullanım çağrılarını tarayıp şu çıktıları üretir:
    - `docs/web-action-registry.json` — tam makine-okur envanter
    - `docs/web-action-registry.md` — sayfa bazında insan-okur rapor
    - `docs/mobile-parity-gaps.md` — web'de olup mobil servisinde olmayan aksiyonlar
  - Çalıştırma: `npm run audit:parity`
  - CI modu (parite eksiği varsa exit 1): `npm run audit:parity:check`
  - Bugün itibariyle çıktı: **262 API endpoint · 218 web aksiyonu · 215 mobil aksiyonu · 7 eksik**.
- **E2E:** Detox (mobil) + Playwright (web). Kritik akışlar (yeni teklif, servis tamamlama, fatura PDF) iki tarafta aynı senaryoyla çalıştırılır.
- **Visual regression:** Stitch ekran görüntüleri (`docs/stitch-screens.md`'deki ID'ler) referans alınarak Storybook + Chromatic.

---

## 6. Stitch ekran referans tablosu

| # | Ekran | Stitch ID |
|---|---|---|
| 1 | Giriş Yap (yeniden) | `4e878ae66e9d4ed2942b498d335a345a` |
| 2 | Yeni Ziyaret Planla (yeniden) | `7456e3b60ec94b6faa3d282858eead0a` |
| 3 | Yeni Makine Ekleme Formu | `702840f00a18422981fe35fffec92910` |
| 14 | Sevkiyat / Teslimat Detay | `825e9ad5f799459f9312b8b7a3e49e48` *(v3 özet, 2026-06-25)* |
| 5 | Müşteri Cari Hesap Detay (Ekstre) | `035028a0a0e142ff9a7f2c6bba427c12` |
| 6 | Fatura Detay (PDF Preview) | `a05aebeb7ca34c1baee1b95a54235225` |
| 7 | Yeni Satın Alma Siparişi | `9a1c4dcd3b8741c1a297d6476a20723e` |
| 8 | Servis Tamamlama / İmzalama | `15a25afeb453484b46bfc42efa2f379` |
| 9 | Kurulum Check-list | `f7746fe93bfb494ea770ecfec00091d7` |
| 10 | Bakım Planı Detay & Takvim | `4811cbc632574d4a88d112e48922db59` |
| 11 | Şifremi Unuttum | `20f7c7da845246c29ab5ff4fd47baa86` |
| 12 | Firma Haritası | `233c28eb0f214df2a92e45e37c1331be` |
| 13 | Satış Fiyat Listesi | `0de944310e76433eac2f1cd35e13b547` |
| 14 | Raporlar (Yönetici Dashboard) | `de01a6c9464143c5a01a4353bc151ff9` |

Proje: `Haksan CRM Mobile — Premium` (`5470261679107716920`) · Design system: `assets/33219cf4465043ba849cffb3262e2fd9` (Industrial Authority) · Cihaz: iPhone 390×844 · Dil: Türkçe.
