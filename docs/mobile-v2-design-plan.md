# mobile-v2 Tasarım Planı

> Kaynak: `apps/mobile-v2` + muadil FSM/CRM (Dynamics Field Service, ServiceTitan, Jobber, Fieldpoint/Hartwig, CNC Marketer, HubSpot/Pipedrive Mobile).  
> Tarih: 2026-11-10.  
> Clarified (verbatim): "ama mesela fırsat içinden bu özellikleri ve teklifler sayfası olsun ve içinden bu özellikleri kullanabilelim ama tuşa bastığımızda telefonda değil sunucuda oluşmasını istiyoruz bu yüzden olsun knk"  
> Supersedes prior “telefonda belge yok” yorumu: **ekranlar telefonda, PDF sunucuda**. Linked from README + stitch checklist + implementation-status.

## 0. Değişmez ürün kuralları

| # | Kural |
|---|---|
| 1 | **Telefonda teklif / proforma / sözleşme ekranları vardır** (Modüller, Teklifler, fırsat kısayolları, liste/detay/taslak, quick-create). |
| 2 | **Tuşa basınca kayıt sunucuda oluşur** (REST API; yerel belge motoru yok). |
| 3 | **Mobilde PDF oluşturulmaz** (Chromium / client PDF / yerel üretim yok). |
| 4 | **PDF yalnız sunucuda** (DB + depo). Web hazırlar; mobil hazır PDF paylaşabilir. |
| 5 | Admin / import / lookup / şablon **yalnızca web**. |
| 6 | Web ve mobil aynı API + RBAC. |

**Yasak:** cihaz içi PDF üretimi. **Serbest:** ticari belge UI + sunucu taslağı + hazır PDF paylaşımı.

---

## 1. Muadil uygulama kıyası

| Muadil | Alınacak | Alınmayacak |
|---|---|---|
| Dynamics / ServiceTitan | Günlük agenda, iş kartı, durum geçişi, yol tarifi | Ofis sözleşme / teklif motoru |
| Jobber / Housecall Pro | Az adım, büyük dokunma, imza + foto | Yerel PDF üretim UI |
| Fieldpoint (CNC bayisi) | Offline work order, süre, senkron | Laptop formlarının küçültülmüş kopyası |
| CNC Marketer | Kurulu park, fuar lead, bölge haritası | Generic pipeline-only CRM |
| HubSpot / Pipedrive | Hızlı aktivite, yakın hesap, arama logu | Her admin ekranının mobil kopyası |

**Konum:** mobile-v2 = saha iş merkezi. Ofis belge merkezi = web.

---

## 2. Görsel sistem

| Token | Değer | Rol |
|---|---|---|
| Brand blue | `#000c69` | Kimlik, seçili nav (CTA değil) |
| Brand / CTA red | `#cf060c` | Birincil buton, FAB, aktif sekme, aciliyet |
| Canvas | `#ffffff` / subtle `#f8f9fb` | Zemin |
| Text | `#18202a` / muted `#5f697a` | Tipografi |
| Success / warn / info / stage | `theme.config.js` | Durum |

- Tipografi: Inter; sayılar `tabular-nums`.
- Radius: 12 / 16; touch min 48px.
- Motion: opacity + transform; reduced-motion anında.
- Glass yalnız sistem gezinmede.
- Logo: orijinal Haksan asset.

Web primary navy; mobil `primary` = CTA red, `brandBlue` ayrı.

---

## 3. Shell

| Sekme | Amaç |
|---|---|
| **Bugün** | ≤3 KPI + acil kuyruk (görev, servis, kurulum). Fiyat onayı varsa salt bildirim → web |
| **İşler** | Atanan işler; chip; swipe; sonraki aksiyon |
| **Takvim** | Ziyaret / randevu |
| **Modüller** | Web menü sırası; **Teklifler / Proforma / Sözleşme dahil** |
| **Hesap** | Profil, scope, sync, servis/teslimat imza pad’i |

Quick create’te **Yeni Teklif / Proforma / Sözleşme** kalır; PDF üretimi sunucu çağrısıdır.
---

## 4. Fazlar

### Faz A — Görsel sistem + IA (3–5 gün)
- Ortak header/list/empty/skeleton.
- Ticari belge rotalarını katalog / quick create / deep-link’e dahil et; CTA = sunucu hazırla.

### Faz B — Bugün & İşler (1 hafta)
- Agenda + sonraki aksiyon.
- Onay: yalnız web deep-link.

### Faz C — Saha job wizard (1.5 hafta)
- Servis / kurulum / teslimat imza (müşteri imzası ≠ sözleşme PDF).
- Offline kuyruk + conflict.

### Faz D — Satış sahası + ticari belgeler (1 hafta)
- Firma / kontak / fırsat / ziyaret / fuar / harita.
- Teklifler / proforma / sözleşme liste-detay; fırsat içi belge aksiyonları.
- CTA: “Sunucuda hazırla” → durum → hazırsa paylaş (yerel PDF yok).

### Faz E — Sunucu belge durumu (3–5 gün)
- Mobil PDF durum rozeti (hazırlanıyor / hazır / hata).
- Sevkiyat/kurulum kişisel atama.
### Faz F — Native kabul (1 hafta)
- Cihaz, offline, a11y, push.

---

## 5. Web’de eksik kalanlar

1. Kişisel Bugün/İşlerim hub yok.  
2. Sevkiyat/finans kişisel atama filtresi yok.  
3. Guided saha work-order UX yok.  
4. İmza denetimi zayıf.  
5. Saha sync ofis paneli yok.  
6. QR stok web karşılığı yok.  
7. Kurulu park / PM panosu zayıf.  
8. PDF hazırlama tek tık + durum rozeti güçlendirilmeli.  
9. “Hazır belgeler” kuyruğu.  
10. E-posta eki = sunucu PDF (istemci üretimi yok).  
11. Token sözlüğü (navy vs red).  
12. Responsive web saha fallback zayıf.

Web-only ağır ofis: şablon/admin/import, PDF motoru (sunucu), mail hesabı. Mobil: belge UI + sunucu tetikleme.

---

## 6. Kabul kriterleri

- [ ] Mobilde teklif / proforma / sözleşme yüzeyi var (liste + detay + fırsat aksiyonları).
- [ ] Mobilde PDF üretim yok; PDF sunucu + DB/storage; paylaş yalnızca sunucu-hazır.
- [ ] Bugün/İşler agenda kalıbı.
- [ ] Servis/kurulum/teslimat wizard + offline.
- [ ] Mobil sunucu PDF durum + web atama ticket’lı.
- [ ] Stitch/Figma checklist’te ticari belge **tasarla**; yerel PDF **Do not design**.

## 7. İlişkili dosyalar

- `docs/mobile-v2-stitch-figma-checklist.md`
- `apps/mobile-v2/README.md`
- `apps/mobile-v2/DESIGN.md`
- `docs/mobile-v2-implementation-status.md`
