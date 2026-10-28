# Design System: Haksan Makina ERP Mobile

> Kaynak: kullanıcı tarafından onaylanan mockup kataloğu (onboarding, giriş,
> dashboard, firmalar, servis, teklifler, tahsilat, ayarlar — 240+ ekran),
> renk ve tipografide web ile hizalanmış hâliyle (kök `DESIGN.md`,
> `apps/web/src/styles/theme.css`). Token'lar `theme.config.js` içinde yaşar;
> web ile eşitlikleri `src/theme/web-parity.test.mjs` ile korunur.

## 1. Visual Theme & Atmosphere

Ferah, açık gri zeminli, güven veren kurumsal ERP estetiği. "Daily App Balanced"
yoğunluk (5/10): kart tabanlı, nefes alan düzen; günlük iş uygulaması netliği.
Varyans düşük-orta (3/10): tutarlı tek kolon mobil akış, asimetri kart içi
hiyerarjiden gelir. Hareket akıcı ama ölçülü (5/10): yay fiziği girişler,
kademeli liste reveal'ları, basılınca scale geri bildirimi. Ana aksan web ile
aynı Haksan laciverti: buton, aktif sekme, FAB, seçili durum. Kırmızı yalnız
marka detayı ve tehlike/aciliyet içindir; dekorasyon değildir.

## 2. Color Palette & Roles

- **Canvas** (#F4F6F8) — Ekran zemini (web `--canvas`). Kartlar beyaz yüzey + kenarlıkla ayrışır.
- **Pure Surface** (#FFFFFF) — Kart, satır, taban çubuğu dolgusu.
- **Subtle Surface** (#F8F9FB) — İç içe yüzeyler, ikincil kartlar.
- **Input Gray** (#F5F6F8) — Girdi ve arama alanları; kenarlıksız dolgu.
- **Charcoal Ink** (#18202A) — Başlık ve birincil metin.
- **Muted Steel** (#5F697A) — İkincil metin, açıklamalar, metaveri.
- **Whisper Border** (rgba(13,20,68,0.11)) — 1px kart kenarlıkları.
- **Haksan Lacivert** (#000C69, koyu tema #8FA2FF) — TEK aksan: birincil buton, aktif sekme/nokta, FAB, link, seçili filtre pili, odak halkası.
- **Lacivert Tint** (#EEF1FF) — Laciverdin yumuşak zemini (ikincil buton, seçili çip zemini).
- **Haksan Red** (#CF060C / zemin #FEF2F2) — Yalnız marka detayı ve tehlike: sil, iptal, "Acil", hata.
- **Success Green** (#087F5B / zemin #ECFDF5) — Tamamlandı, artış, onay.
- **Warning Amber** (#D97706 / zemin #FFFbeb) — Orta öncelik, gecikme.
- **Info Blue** (#2563EB / zemin #EFF6FF) — "Yolda/Devam" durumları, nötr bilgi.
- **Stage Indigo** (#4F46E5 / zemin #EEF2FF) — Fırsat aşamaları.
- Kural: tek aksan (lacivert). Kırmızı birincil eylem rengi olarak kullanılmaz. Mor/neon YASAK. Saf siyah (#000000) YASAK.

## 3. Typography Rules

- **Display/Başlık:** Barlow Condensed 600–700 (web h1/h2 ile aynı). Ekran başlığı 34px,
  H1 32px, H2 24px, detay başlığı 20px, bölüm başlığı 18px. Dar aile olduğu için punto
  Inter karşılığından bir kademe büyüktür.
- **Gövde:** Inter Regular 16px, satır aralığı 1.45-1.5.
- **Etiket/Çip:** Inter Medium/Semibold 12-14px.
- **Sayılar:** Tüm tutar/sayaçlar `tabular-nums` (fontVariant).
- **YASAK:** Serif fontlar, Barlow Condensed ve Inter dışı fontlar, büyük başlıkta gradient metin.
  Tutar ve KPI değerleri başlık fontuyla değil Inter `tabular-nums` ile yazılır.

## 4. Component Stylings

- **Buttons:** Lacivert dolgu, 12px radius, min 48px yükseklik, beyaz Semibold
  metin. Basılınca scale 0.97 + hafif dokunsal geri bildirim. Neon dış glow YASAK.
  İkincil eylem: `ghost` (kenarlıklı beyaz). Yıkıcı: kırmızı.
- **Onboarding CTA:** Hap (pill) lacivert buton "İleri ›", sağda; solda noktalar
  (aktif nokta genişler, lacivert). Son slayt: "Başlayalım ›".
- **Cards:** Beyaz, 16px radius, 1px whisper kenarlık, yumuşak gölge
  (0 6px 14px rgba(15,23,42,0.07)). Kart yalnızca hiyerarşi gerektiriyorsa.
- **KPI Card:** Üstte tonlu yumuşak daire içinde ikon, altında gri etiket,
  büyük kalın değer, varsa yeşil/kırmızı trend satırı.
- **List Row:** Solda tonlu yuvarlatılmış kare ikon, başlık + gri alt satırlar,
  sağda durum çipi + değer + chevron.
- **Inputs:** Etiket üstte, gri dolgulu kenarlıksız alan (48px), hata altta
  kırmızı. Odak halkası lacivert.
- **Filter Chips:** Aktif = lacivert dolgu/beyaz metin; pasif = beyaz + kenarlık.
- **Tabs (detay):** Lacivert alt çizgi + lacivert metin aktifte.
- **FAB:** Lacivert daire, beyaz +, lacivert tonlu gölge, sağ alt.
- **Loaders:** Yerleşimle aynı ölçüde iskelet kartlar; dairesel spinner YASAK
  (yalnız buton içi bekletmede).
- **Empty States:** İkon rozeti + başlık + ipucu + eylem butonu.
- **Logo:** `assets/brand/logo.png` (marka renkleri görselin kendisinde; tema token'ı uygulanmaz).

## 5. Layout Principles

- Tek kolon mobil akış; içerik `px-4` yatay boşlukla.
- Kartlar arası 12-16px dikey ritim; bölüm başlıkları Barlow Condensed 18px.
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
- Mor/neon gradient, dış glow, saf siyah, serif.
- Uydurma metrik/istatistik ("%99.9 uptime" gibi) — veri yalnız sunucudan.
- 3 eşit kolonlu kart sıraları; üst üste binen mutlak konumlu içerik.
- "Scroll to explore" gibi dolgu metinleri; AI klişe copy ("Elevate", "Seamless").
- Kırmızının birincil eylem veya dekorasyon amaçlı kullanımı (kırmızı = tehlike/marka detayı).

## 8. Gezinmede cam yüzeyler

Desktop sürümünün `NavigationGlass` malzemesi ve `reduce_navigation_effects` tercihi
mevcut gezinme yapısına uyarlanır. iOS 26+ destekli native build'de Liquid Glass,
eski iOS ve destekli Android'de blur, native modül yoksa opak kart yüzeyi kullanılır.
Sistem Saydamlığı Azalt tercihi ve Ayarlar → Gezinme efektlerini azalt camı kapatır.
Ortak başlıkların geri/eylem düğmeleri ve alt sekme kapsülü aynı malzemeyi kullanır;
pembe renk katmanı eklenmez. Mevcut rota ve erişim kapıları korunur.

## 9. Modül listeleri ve detaylar

Liste kartlarında kimlik ve iletişim üstte, durumlar ayrı satırda, tutar/tarih
metriği alt bölümde gösterilir. Uzun firma ve ürün adlarına iki satır ayrılır.
Detay alanları dar telefonlarda etiket/değer olarak alt alta akar; değerler
kopyalanabilir ve kırpılmaz. Başlıktaki ikiden fazla eylem İşlemler menüsünde
korunur. Birincil oluşturma düğmesi cam sekme çubuğunun üzerinde yer alır;
listeler son kaydın düğme ve gezinmenin üzerine kaydırılabilmesi için alt pay bırakır.

Teklif, belge ve finans listelerinde ayrıntılı özetler açılır bölümde korunur;
arama ve kayıt listesine erişim öne alınır. Servis Kanbanı telefonda seçili tek
aşamayı, tablette yatay kolonları gösterir. Modüle özgü API, yetki, durum geçişi,
belge ve iş akışları mevcut sözleşmeleri kullanmaya devam eder.

## 10. Profil, sohbet ve alt menü

Alt menü: Ana Sayfa, Firmalar, Fırsatlar, Takvim, Modüller. Profil ve hesap
seçenekleri başlığın sağındaki kişi simgesinden açılır: profil bilgileri,
çalışma alanı, ayarlar ve çıkış. Mevcut `/more` rotaları bağlantı uyumluluğu için
korunur; alt menüde gösterilmez. Sohbet ana sayfadaki sabit baloncuktan açılır,
okunmamış mesaj sayısını gösterir ve şirketin sohbet görünürlük ayarına uyar.
Ana sayfa başlığı veri yüklenirken ve hata durumunda da kullanılabilir.

## 11. CRM kayıt seçimleri

Firma, kontak, fırsat, teklif, ürün ve makine seçimlerinde API'nin sayfalı
kaynakları kullanılır; ilk 12/50/200 kayıt kalıcı seçim sınırı değildir.
Arama sunucuya iletilir, kaydırma yanında açık bir sonraki sayfa düğmesi bulunur.
İstemcide süzülen boş bir sayfa da sonraki kayıtlara erişimi kapatmaz.
Seçili kaydın adı gerekiyorsa detay isteğinden çözülür; ilk sayfada bulunmasına
bağlı kalmaz. Firma değişince bağlı seçimler güncellenir, aynı firma tekrar
seçilince geçerli kontak/fırsat korunur. Firmaya bağlı kayıt alanları kendi
kapsamını korur; serbest kontak metni kabul eden alanlarda firma seçilmemişse
CRM kontak rehberi aranabilir. Açılır seçimler native modal üstünde ve klavye
ile kullanılabilir; yükleme/hata/yeniden deneme durumları boş listeden ayrılır.
