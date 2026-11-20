# Design System: Haksan Makina ERP Mobile

> Kaynak: kullanıcı tarafından onaylanan mockup kataloğu (onboarding, giriş,
> dashboard, firmalar, servis, teklifler, tahsilat, ayarlar — 240+ ekran).
> Bu dosya mobil uygulamanın tek görsel gerçek kaynağıdır. Token'lar
> `theme.config.js` içinde yaşar; buradaki kurallar onların yorumudur.

## 1. Visual Theme & Atmosphere

Ferah, beyaz zeminli, güven veren kurumsal ERP estetiği. "Daily App Balanced"
yoğunluk (5/10): kart tabanlı, nefes alan düzen; günlük iş uygulaması netliği.
Varyans düşük-orta (3/10): tutarlı tek kolon mobil akış, asimetri kart içi
hiyerarjiden gelir. Hareket akıcı ama ölçülü (5/10): yay fiziği girişler,
kademeli liste reveal'ları, basılınca scale geri bildirimi. Kırmızı yalnızca
eylem ve dikkat için: buton, aktif sekme, FAB, aciliyet. Kırmızı dekorasyon
değildir — dokunulabilir her kırmızı bir iş yapar.

## 2. Color Palette & Roles

- **Canvas White** (#FFFFFF) — Ekran zemini. Kartlar kenarlık + yumuşak gölgeyle ayrışır.
- **Pure Surface** (#FFFFFF) — Kart, satır, taban çubuğu dolgusu.
- **Subtle Surface** (#F8F9FB) — İç içe yüzeyler, ikincil kartlar.
- **Input Gray** (#F5F6F8) — Girdi ve arama alanları; kenarlıksız dolgu.
- **Charcoal Ink** (#18202A) — Başlık ve birincil metin.
- **Muted Steel** (#5F697A) — İkincil metin, açıklamalar, metaveri.
- **Whisper Border** (rgba(13,20,68,0.11)) — 1px kart kenarlıkları.
- **Haksan Red** (#D32F2F) — TEK aksan: birincil buton, aktif sekme/nokta, FAB, link, aciliyet, seçili filtre pili.
- **Red Tint** (#FDECEC) — Kırmızının yumuşak zemini (ikon rozetleri, "Acil" çipi).
- **Success Green** (#087F5B / zemin #ECFDF5) — Tamamlandı, artış, onay.
- **Warning Amber** (#D97706 / zemin #FFFbeb) — Orta öncelik, gecikme.
- **Info Blue** (#2563EB / zemin #EFF6FF) — "Yolda/Devam" durumları, nötr bilgi.
- **Stage Indigo** (#4F46E5 / zemin #EEF2FF) — Fırsat aşamaları.
- Kural: tek aksan (kırmızı). Mor/neon YASAK. Saf siyah (#000000) YASAK.

## 3. Typography Rules

- **Display/Başlık:** Inter Bold (700) — geniş, sıkıştırılmamış; hierarchy kalınlık
  ve renkle, aşırı boyutla değil. H1 28-32px, H2 22px, tracking -0.02em.
- **Gövde:** Inter Regular 16px, satır aralığı 1.45-1.5.
- **Etiket/Çip:** Inter Medium/Semibold 12-14px.
- **Sayılar:** Tüm tutar/sayaçlar `tabular-nums` (fontVariant).
- **YASAK:** Serif fontlar, Inter dışı deneysel fontlar, büyük başlıkta gradient metin.

## 4. Component Stylings

- **Buttons:** Kırmızı dolgu, 12px radius, min 48px yükseklik, beyaz Semibold
  metin. Basılınca scale 0.97 + hafif dokunsal geri bildirim. Neon dış glow YASAK.
  İkincil eylem: `ghost` (kenarlıklı beyaz). Yıkıcı: koyu kırmızı.
- **Onboarding CTA:** Hap (pill) kırmızı buton "İleri ›", sağda; solda noktalar
  (aktif nokta genişler, kırmızı). Son slayt: "Başlayalım ›".
- **Cards:** Beyaz, 16px radius, 1px whisper kenarlık, yumuşak gölge
  (0 6px 14px rgba(15,23,42,0.07)). Kart yalnızca hiyerarşi gerektiriyorsa.
- **KPI Card:** Üstte tonlu yumuşak daire içinde ikon, altında gri etiket,
  büyük kalın değer, varsa yeşil/kırmızı trend satırı.
- **List Row:** Solda tonlu yuvarlatılmış kare ikon, başlık + gri alt satırlar,
  sağda durum çipi + değer + chevron.
- **Inputs:** Etiket üstte, gri dolgulu kenarlıksız alan (48px), hata altta
  kırmızı. Odak halkası kırmızı.
- **Filter Chips:** Aktif = kırmızı dolgu/beyaz metin; pasif = beyaz + kenarlık.
- **Tabs (detay):** Kırmızı alt çizgi + kırmızı metin aktifte.
- **FAB:** Kırmızı daire, beyaz +, kırmızı tonlu gölge, sağ alt.
- **Loaders:** Yerleşimle aynı ölçüde iskelet kartlar; dairesel spinner YASAK
  (yalnız buton içi bekletmede).
- **Empty States:** İkon rozeti + başlık + ipucu + eylem butonu.
- **Logo:** Kırmızı yuvarlatılmış kare içinde beyaz kalın "H" + "Haksan"
  (kırmızı) "Makina" (koyu) + altta sağa yaslı küçük "ERP".

## 5. Layout Principles

- Tek kolon mobil akış; içerik `px-4` yatay boşlukla.
- Kartlar arası 12-16px dikey ritim; bölüm başlıkları 15px Semibold.
- Üst kafa deseni: liste ekranlarında büyük başlık + gri açıklama + sağda
  yuvarlak ikon eylemleri; dashboard'da logo + zil.
- Detay ekranlarında geri oku + ortada başlık + sağ eylem çubuğu.
- Alt eylem çubuğu formlarda: sol "Vazgeç" (1 birim) + sağ birincil (2 birim).
- Sabit çubuklar safe-area'ya saygılı; liste içerikleri altta FAB payı ile.

## 6. Motion & Interaction

- Tüm etkileşimli öğelerde yay fiziği (damping 18-22, stiffness 200-260).
- Ekran girişleri: kademeli `Enter` (70-90ms aralıkla), liste reveal `Stagger`.
- Sekme/nokta geçişleri yayla genişler; basılı öğe 0.97 scale + Light haptic.
- Yalnız `transform` ve `opacity` animasyonla; reduced-motion'da tümü anında.

## 7. Anti-Patterns (YASAK)

- Emoji ile ikon (marka başlığındaki 👋 hariç — mockup'a birebir sadakat).
- Mor/neon gradient, dış glow, saf siyah, Inter dışı serif.
- Uydurma metrik/istatistik ("%99.9 uptime" gibi) — veri yalnız sunucudan.
- 3 eşit kolonlu kart sıraları; üst üste binen mutlak konumlu içerik.
- "Scroll to explore" gibi dolgu metinleri; AI klişe copy ("Elevate", "Seamless").
- Kırmızının dekorasyon amaçlı kullanımı (dokunulmayan kırmızı öğe yok).
