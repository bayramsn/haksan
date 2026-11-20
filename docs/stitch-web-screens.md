# Haksan CRM Web — Stitch Ekran Envanteri

**Proje:** Haksan CRM Web — Premium 3D  
**Project ID:** `7564558345356079676`  
**Design System:** Industrial Authority 3D (`assets/bc2fa58bfe004f73bd64ff8d60988fdc`)  
**Referans görseller:** `screenshots/haksan-web-full/` (135 PNG, 1440×900, manifest: `manifest.json`)

## Logo Kuralı

Orijinal logo **yeniden çizilmez**. Prompt'larda `haksanmakina_logo.jpeg` statik `<img>` kullanılır:

| Konum | Boyut |
|-------|-------|
| Sidebar | max-height 32px, object-fit contain |
| Login form | max-height 56px |
| Login sol panel | max-height 40px (beyaz alan) |

**Kaynak:** `apps/web/public/brand/haksan-makina-logo.png` · `.stitch/haksan-makina-logo.png`

## Referans Kullanım Kuralı

Her yeni ekran üretilirken `screenshots/haksan-web-full/<modül>/<dosya>.png` yolu prompt'ta belirtilir.  
Amaç: **aynı bilgi mimarisi + aynı tablo/kolon/filtre yapısı**, görsel olarak **Industrial Authority 3D** yükseltmesi.

3D sadece: login arka plan, KPI/chart kartları, boş durum illüstrasyonları, CTA butonları.  
Tablolar, kanban kart içeriği ve formlar **düz ve okunabilir** kalır.

---

## Tamamlanan Ekranlar

| # | Ekran | Screen ID | Referans PNG |
|---|-------|-----------|--------------|
| W01 | Giriş Yap (3D endüstriyel sahne) | `1a85464d7353494f819d005c59a799a2` | `login/00-main.png` |
| W02 | 3D Arka Plan Asset (login) | `caff38efe2b442f9a7448a83b889c76e` | — (generated) |
| W03 | Gösterge Paneli (Özet) | `db0a28b8cd2d4defa35e189bd4a48521` | `dashboard/00-main.png` |
| W04 | Firmalar Listesi | `89ad6ccaf34447608c5bf89b2e8ece30` | `customers/00-main.png` |
| W05 | Satış Kartları — Kanban | `13fde5718e8647b3b19dbfb255469b60` | `sales-cases/kanban.png` |
| W06 | Firma Detay | `d37969b8406e4fc39e9b95c842f4c61e` | `customer-detail/00-main.png` |
| W07 | Satış Kartı Detay | `64db20c9b60d48bbb9114acca06c9e2c` | `sales-cases/02-detail-main.png` |
| W08 | Teklifler Listesi | `e2ff902b3eef43aeacdc8d983a5c999b` | `offers/00-main.png` |
| W09 | Kontaklar Listesi | `b2eb864696ab4f3d9290afb175971955` | `contacts/00-main.png` |
| W10 | Proformalar | `94e9b41528ba40f9ae981d25d5101884` | `proformas/00-main.png` |
| W11 | Sözleşmeler | `eb13dab6aa554911bc7cba555ac333e5` | `contracts/00-main.png` |
| W12 | Dokümanlar | `ef3c91edd07e4d1682f56d5b103e531d` | `documents/00-main.png` |
| W13 | Satış Haritası | `ebd63b9eb0b44c7b877a5515bebebc66` | `sales-map/00-main.png` |
| W14 | Ürünler | `c291877048674413bebd12045385466f` | `products/00-main.png` |
| W15 | Stok | `f6839f769e544e94acc82b6dab45f354` | `stock/00-main.png` |
| W16 | Ödemeler & Kasa | `7665712f28e5467d8806d06dbb074ab4` | `payments/00-main.png` |
| W17 | Servis Talepleri | `801aab173b0c49479c9cacc88eeed5ef` | `service-requests/00-main.png` |
| W18 | Satın Alma Siparişleri | `8fa2a549f04d4f14b0d6e1c4540f90b8` | `purchase-orders/00-main.png` |
| W19 | Satın Alma Siparişi Oluştur | `1e0181c38ff943c28a7583f2d571aa05` | `purchase-orders/01-create.png` |
| W20 | Sevkiyat Listesi | `d750a6c3e3f248188628db5e7f4433ca` | `shipments/00-main.png` |
| W21 | Sevkiyat Oluştur | `3ca332788cdb4228a31d8c43ed8e1374` | `shipments/01-create.png` |
| W22 | Teslimat Listesi | `7dd09bbf083240dfab11453b3540f3ce` | `deliveries/00-main.png` |
| W23 | Teslimat Oluştur | `33fec0666b2e4146973879ae4c42614b` | `deliveries/01-create.png` |
| W24 | Kurulum Listesi | `3aa9905b52e84c82beb300238907cca5` | `installations/00-main.png` |
| W25 | Kurulum Oluştur | `0529bad9f7324708b9a94e520f29075a` | `installations/01-create.png` |
| W26 | Makineler Listesi | `72317aaa213c4658804c5310ea7af335` | `machines/00-main.png` |
| W27 | Yeni Makine Kaydı | `8333b8b5545a45258d33db7a746e1f9b` | `machines/01-new.png` |
| W28 | Muhasebe Faturaları | `5a944e23a7614bd69b0c7a9e47d213fc` | `accounting-invoices/00-main.png` |
| W29 | Yeni Fatura Oluştur | `7ca64845e99749d8891b5b78b68974f7` | `accounting-invoices/01-new.png` |
| W30 | Cari Rapor | `b46c647764f54fd4a1362bc59bf4b55d` | `customer-balances/00-main.png` |
| W31 | Vade Takvimi | `905f06b78cb44db5ba4ef0e68184ef2f` | `due-dates/00-main.png` |
| W32 | Raporlar Ana Ekran | `cf6bf96f889441e093b06344732c58d8` | `reports/00-main.png` |
| W33 | Analitik Excel Raporu | `66044504308e402facbcf864f83bc3cc` | `reports/analitik-excel.png` |
| W34 | Takvim | `30cab7d36f0a47398f7aab1dec5bc87a` | `calendar/00-main.png` |
| W35 | Sohbet | `dc9855588fd344cf947b70b9077452b8` | `chat/00-main.png` |
| W36 | Ayarlar | `7a242298796a4bb38a7f7f3534382b39` | `settings/00-main.png` |
| W37 | Departmanlar | `c55e9c840004408b85beaed319dc97bf` | `departments/00-main.png` |
| W38 | Kullanıcılar | `8757377392ed4bb0a10cbbac9fa0e84b` | `users/00-main.png` |
| W39 | Roller | `93aec2c366d3408da7b85b250560d980` | `roles/00-main.png` |
| W40 | Servis Kanban | `aec47fbdc79c4ec489aa7c62f4f770d2` | `service-kanban/00-main.png` |
| W41 | Operasyonel Rapor | `d98a6f92b1b04c4d9c0d4d3e607969d3` | `reports/operasyonel.png` |

**İlerleme:** 41 / 136 ekran tamamlandı (W02 bg dahil; manifest 135 PNG)

---

## Sıradaki Ekranlar (öncelik sırası)

1. calendar variants (new-event, ay, hafta, gun, liste), chat variants
2. reports/karl-l-k-y-l-sonu, dashboard variants
3. customer-detail tabs, layout overlays, offers/sales-cases variants
4. customer-detail tabs, layout overlays, service variants
5. sales-price-list, service-price-list, service-kanban
6. Kalan varyantlar (contacts, customers, products, stock, payments, vb.)

> Tam liste: `screenshots/haksan-web-full/manifest.json`

---

## Prompt Şablonu

```
Haksan CRM [MODULE] 1440×900. REF: screenshots/haksan-web-full/[file].png.
LOGO haksanmakina_logo.jpeg sidebar 32px do NOT redraw.
DS Industrial Authority 3D. Full shell sidebar 264px topbar 64px glass.
3D KPI/cards only tables flat. Turkish. Asistan FAB.
```
