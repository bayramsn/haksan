# mobile-v2 Stitch / Figma Ekran Checklist

> Bağlı plan: `docs/mobile-v2-design-plan.md` (buradan linklenir).  
> Envanter çapraz referans: `docs/stitch-screens.md` (proje `5470261679107716920`).  
> **Ürün düzeltmesi (2026-11-10 — eski “telefonda teklif/proforma/sözleşme yok” metnini supersede eder):**  
> Mobilde **Teklifler** sayfası ve fırsat içi teklif / proforma / sözleşme özellikleri **var**.  
> “Oluştur / hazırla” → belge ve PDF **sunucuda** (API / DB / storage); telefonda Chromium / client-side PDF **yok**.  
> Frame: `<module>/<screen>/<state>` · `loading|empty|error|populated|filtered|offline`.

## Stitch proje

| Alan | Değer |
|---|---|
| Proje | Haksan CRM Mobile — Premium |
| Project ID | `5470261679107716920` |
| Design system | Industrial Authority · `assets/33219cf4465043ba849cffb3262e2fd9` |
| Logo | Orijinal asset (AI redraw yok) · `.stitch/haksan-makina-logo.png` |
| Token | Brand blue `#000c69` · CTA red `#cf060c` · canvas white · Inter · touch ≥ 48px |
| Generation status | **BLOCKED 2026-11-10** — Stitch MCP `401 API key not valid` (mcp_auth OK; generate/list fail). Refresh `STITCH_API_KEY` in Cursor MCP, then regenerate priority screens. |

## Figma sayfa yapısı

| Sayfa | İçerik |
|---|---|
| `00 - Cover & Rules` | Sunucu PDF kuralı, akış haritası |
| `01 - Foundations` | Renk, tipografi, spacing, motion |
| `02 - Components` | Button, ListRow, Sheet, Badge, SignaturePad (servis/teslimat) |
| `03 - Patterns` | Liste, detay, form, agenda, job wizard, offline, **sunucu PDF durum** |
| `04 - Core` | Auth, shell, Bugün, İşler, Takvim, Modüller, Hesap |
| `05 - Sales (+ ticari belgeler)` | Firma, kontak, fırsat, **teklif/proforma/sözleşme**, harita, fuar |
| `06 - Operations` | Stok, sevkiyat, kurulum, ürün, satın alma |
| `07 - Finance` | Ödeme, muhasebe faturası, cari, vade |
| `08 - Service` | Talep, wizard, makine, bakım |
| `09 - Document status` | Sunucu hazırla / hazır / paylaş (mobil frame) |
| `10 - Prototype` | Saha + ticari belge akışları |
| `11 - Dev Handoff` | Token + props |

---

## Server PDF only (mobil ekranlar tasarlanır)

| Yasak | Not |
|---|---|
| Cihazda PDF üret / Chromium / client-side render | PDF yalnızca sunucu (API/DB/storage) |
| “PDF Oluştur” (yerel) butonu | Yerine: “Sunucuda hazırla” / “Web’de hazır” / paylaş (hazırsa) |
| Yerel PDF motoru, blob/canvas PDF | Yok |
| Admin / şablon / toplu import belge motoru | Web-only |

**Kapsamda (tasarla):** Teklif liste/detay/yeni · Proforma liste/detay · Sözleşme liste/detay · Fırsat → belge aksiyonları · Sunucu PDF durum + paylaş.

---

## Tasarlanacak checklist

> Durum anahtarı: **mapped** = `docs/stitch-screens.md` envanterinden eşlendi (yeniden üret / sunucu-PDF CTA güncellemesi Stitch 401 yüzünden bekliyor). **missing** = envanterde yok, yeni üretim gerekli.

### Auth & shell
- [x] `auth/login/default` — **mapped** `4e878ae66e9d4ed2942b498d335a345a` (premium; eski `4317794155364e12aa9f8f7329b060a5`)
- [x] `auth/forgot-password/*` — **mapped** `20f7c7da845246c29ab5ff4fd47baa86` · `auth/reset-password/*` — **missing**
- [ ] `shell/tabs/*` — **missing** (Bugün/İşler/Takvim/Modüller/Hesap; Modüller’de Teklifler kartı)
- [x] `global/quick-create/sheet` (teklif dahil; PDF yerel yok) — **mapped** `2c320b06c6a248d2bdd542e5a56380bd` — *CTA metni sunucu-PDF ile güncelle*
- [x] `global/notifications/list` — **mapped** `176b14a5f4494a1c9fda2a2e9cbbb09e` · `global/search/overlay` — **missing**
- [ ] `global/offline/banner-queue-conflict` — **missing**

### Bugün & İşler
- [x] `today/home/overview` — **mapped** dashboard `91f83c94ae8044cb867284b3a21aaeb3` · `urgent-queue` / `charts-targets` — **missing** (v2 Bugün yeniden üret)
- [ ] `work/list/*` · `work/row/next-action` — **missing** (öncelik)
- [ ] `work/price-approval/notice` — **missing**

### Takvim & sohbet
- [x] `calendar/agenda/*` — **mapped** `4774acd7377d466ba1375c82d3b902c3` · `calendar/event-form/*` — **mapped** ziyaret `7456e3b60ec94b6faa3d282858eead0a`
- [x] `chat/list` — **mapped** `20e9867b31b94036b5d18145cbcb340d` · `thread|new*` — **missing**

### Satış (+ ticari belgeler) — KAPSAMDA
- [x] `sales/companies/*` — **mapped** liste `97f60630c8ea490884fbd3e5d4a8b98d` · detay `ef13463040844f039c6dd02203d10adb`
- [x] `sales/contacts/*` — **mapped** `cc4d0dd86ff44d15a4d91ee39a6edcb2`
- [x] `sales/opportunities/list|detail|form` — **mapped** `e0417d17b4494b689a8a7ce4f90c3ce9` / `597448c4a0c04fc3abec716228170015` / `fc086d9be9314bec8b63b337ba82d7d6`
- [ ] `sales/opportunities/detail-with-documents` — **missing** (fırsat → teklif/proforma/sözleşme + Sunucuda hazırla)
- [x] `sales/quotes/list|detail|form` — **mapped** `967defac0e8a4b9c81ad0fae8ec76f0c` / `1194f1f021df4baa8d4e53a6e4b9aa64` / `0fbd72b2cd574561a0f2a4d65` — *sunucu PDF CTA ile edit*
- [x] `sales/proformas/list|detail` — **mapped** `1639d10a6abe4318b740ea99e490bb9f` / `d249d514558a47149b69bc977c79f0ce`
- [x] `sales/contracts/list|detail` — **mapped** `2c5f087b46154a3aadf41d171bc8741e`
- [ ] `sales/documents/server-pdf-status` — **missing** (öncelik: hazırlanıyor / hazır / paylaş)
- [x] `sales/company-map/*` — **mapped** `233c28eb0f214df2a92e45e37c1331be` · `sales/activities|visits/*` — **mapped** `1ebc147e29954aff894eb5fd3fb3049a` / `7456e3b60ec94b6faa3d282858eead0a`
- [ ] `sales/trade-fairs/*` — **missing**

### Operasyon
- [x] `ops/inventory/*` — **mapped** `56f23455b6f6494bb117eed2b12acb27` · `ops/products/*` — **mapped** `0c1948c4002f4940a277c4856ef19e11` / `aa85e966cd724d27b8ab6ac3942622b5`
- [x] `ops/purchase-orders/*` — **mapped** `8f55046fd9104417b318c27f3f337340` / `9a1c4dcd3b8741c1a297d6476a20723e`
- [x] `ops/shipments/*` — **mapped** S1–S7 (`c6314a6177fb4bf89f53bf83384513e9` …)
- [x] `ops/installations/checklist-wizard` — **mapped** `f7746fe93bfb494ea770ecfec00091d7` (+ detay `fd8ecb8c8c45489185d948789e426b8a`)

### Finans
- [x] `finance/payments/*` — **mapped** `2d0bb69b8f37493bb75d039e4d186589` / `a9aceb5592c54320a4fd7d3e5cddb54e`
- [x] `finance/invoices/*` — **mapped** `08d2ed1465794d809fd2e61492172b27`
- [x] `finance/balances|due-dates|receivables/*` — **mapped** cari `0880532884174e46ab348e080f6a5072` / vade `5f5fcbec93be47bfa1df623e5f694788` / ekstre `035028a0a0e142ff9a7f2c6bba427c12`

### Servis
- [x] `service/tickets/list|board|detail` — **mapped** `8d84b0d695cc4130acafcd7ab6bd5362` / `8fb2a69578fd49dc9ec86205fdbd4a13` / `f4422d3497b74a0fa49f791cc5470e87`
- [ ] `service/job-wizard/steps` — **missing** (öncelik; tamamlamaya yakın: `15a25afeb453484b46bfc42efa2f379`)
- [x] `service/signature/customer` — **mapped** `15a25afeb453484b46bfc42efa2f379` (+ teslimat imza `c45226230b6143389b0764bbe949688d`)
- [x] `service/machines/*` — **mapped** `5a449b07b93f495e96b75fcbe82808ea` / `2a78675617ca4a66bdc7417cf45cc7d7`
- [x] `service/maintenance/*` — **mapped** `4811cbc632574d4a88d112e48922db59` · `service/complaints/*` — **missing**

### Hesap
- [x] `account/settings` — **mapped** `be0e94bc236f4625b741588e944c975f` · `profile|scope|sync|about|signature-pad` — **missing** / kısmi

### Figma sync
- [x] Figma file created — [Haksan CRM Mobile v2 — Stitch Handoff](https://www.figma.com/design/7LRta21EUuPaOULhtX0tMN)
- [x] Pages `00`–`11` — IDs: Cover `0:1`, Foundations `1:2`, Components `1:3`, Patterns `1:4`, Core `1:5`, Sales `1:6`, Ops `1:7`, Finance `1:8`, Service `1:9`, Document status `1:10`, Prototype `1:11`, Dev Handoff `1:12`
- [ ] Pixel screens synced from Stitch — **blocked** (Stitch 401); cover rules frame `1:13` written

---

## Prototype

1. Bugün → servis wizard → imza → sync.  
2. İşler → kurulum checklist + foto.  
3. Fırsat → Teklif hazırla → **sunucuda PDF** → hazır olunca paylaş.  
4. Teklifler listesi → detay → “Sunucuda hazırla”.  
5. Stok QR scan.  
6. Offline → kuyruk → conflict.  

**Yasak:** Telefonda Chromium/PDF render · “PDF Oluştur” (yerel).

## Dev handoff
- [ ] Token = `theme.config.js` (`brandBlue` `#000c69`, `primary`/`brandRed` `#cf060c`)
- [ ] Frame’de teklif/proforma/sözleşme **var**; “PDF Oluştur” (cihaz) **yok**
- [ ] State set + touch ≥ 48px tamam
