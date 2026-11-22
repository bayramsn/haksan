# Mobil tasarım kapsamı — 3 Kasım 2026

Bu çalışma yalnız apps/mobile-v2 içindedir. Web ve API değiştirilmez.

## Uygulanan ortak düzen

- Başlık ve işlem menüleri: adlandırılmış erişilebilir eylemler, taşma menüsü.
- Arama/filtreler ve sekmeler: büyük yazıya göre yükseklik, etkin filtre bildirimi.
- Seçim pencereleri: uzun kayıt adları, geniş dokunma alanları, seçili durum, telefon/tablet paneli.
- Boş/hata/yükleniyor: ölçülü yerleşim ve liste iskeletleri; tekrar dene eylemi.
- Alan/değer detayları: dar ekran ve büyük yazıda alt alta, değerler seçilebilir.
- Finans, sipariş ve operasyonlarda 880 pt okuma genişliği; ortak kayıt kimliği/tutar kartı.
- Ticari belge/formlarda bölümlendirme ve sabit kayıt/PDF eylemleri.
- Sohbet, bildirim, profil, ayarlar ve girişte okunurluk/uzun metin düzenleri.
- 59 ek rotada dikey içerik genişliği sınırı; mevcut uyarlanabilir ızgaralar korunur.
- Uygulama içi ve açılış logosu gerçek alfa kanallı Haksan Makina görselidir.
- iOS mağaza simgesi opak 1024×1024; Android uyarlanabilir simge şeffaf ön katmandır.

## Doğrulama sınırı

TypeScript/test ve Metro paketleme sonuçları çalışma çıktısıyla birlikte raporlanır.
Bu envanter bütün ekranların fiziksel cihazda veya simülatörde tek tek görsel
onaylandığı anlamına gelmez. Bu turda açık simülatör/bağlı cihaz yoktu.
Koyu tema, büyük yazı, klavye, yatay telefon, tablet ve tüm alt menü etkileşimleri
yayından önce cihazda kontrol edilmelidir. Simge güncellemesi yeni native paket
gerektirir; TestFlight veya APK yayını bu tasarım çalışması sırasında yapılmadı.

## Rota envanteri (204)

Aşağıdaki dosyalar mevcut ekran envanteridir; özel bileşen veya ortak tasarım
bileşenleri üzerinden etkilenebilir. Her satır ayrı bir cihaz testi değildir.

- `(auth)/forgot-password.tsx`
- `(auth)/login.tsx`
- `(auth)/reset-password.tsx`
- `(auth)/signup.tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/calendar.tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/chat/[id].tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/chat/index.tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/chat/new-group.tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/chat/new.tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/companies.tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/index.tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/modules/activities/[id].tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/modules/activities/index.tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/modules/balances/[companyId].tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/modules/balances/index.tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/modules/bulk-mail/[id].tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/modules/bulk-mail/index.tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/modules/bulk-mail/new.tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/modules/bulk-mail/suppressions.tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/modules/calendar/index.tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/modules/call-assistant/[id].tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/modules/call-assistant/index.tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/modules/companies/[id].tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/modules/companies/index.tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/modules/company-map/index.tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/modules/contacts/[id].tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/modules/contacts/index.tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/modules/contracts/[id].tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/modules/contracts/index.tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/modules/customer-devices/[id].tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/modules/customer-devices/index.tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/modules/deliveries/[id].tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/modules/deliveries/index.tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/modules/departments/index.tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/modules/documents/[kind]/[id].tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/modules/documents/index.tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/modules/due-dates/index.tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/modules/index.tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/modules/installations/[id].tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/modules/installations/index.tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/modules/inventory/[id].tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/modules/inventory/index.tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/modules/inventory/scan.tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/modules/invoices/[id].tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/modules/invoices/index.tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/modules/kanban/index.tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/modules/maintenance-plans/[id].tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/modules/maintenance-plans/index.tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/modules/meta/index.tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/modules/opportunities/[id].tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/modules/opportunities/index.tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/modules/payments/[id].tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/modules/payments/index.tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/modules/price-lists/configuration.tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/modules/price-lists/cost-items.tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/modules/price-lists/index.tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/modules/price-lists/laser.tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/modules/products/[id].tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/modules/products/index.tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/modules/proformas/[id].tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/modules/proformas/index.tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/modules/purchase-orders/[id].tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/modules/purchase-orders/index.tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/modules/quotes/[id].tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/modules/quotes/index.tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/modules/receivables/[id].tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/modules/receivables/index.tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/modules/references/index.tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/modules/reports/index.tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/modules/roles/[id].tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/modules/roles/index.tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/modules/sales-orders/[id].tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/modules/sales-orders/index.tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/modules/service-complaints/[id].tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/modules/service-complaints/index.tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/modules/service-complaints/links.tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/modules/service-kanban/index.tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/modules/service-price-list/index.tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/modules/service-tickets/[id].tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/modules/service-tickets/index.tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/modules/shipments/[id].tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/modules/shipments/index.tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/modules/targets/index.tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/modules/tasks/[id].tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/modules/tasks/index.tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/modules/trade-fairs/index.tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/modules/users/[id].tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/modules/users/index.tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/more/about.tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/more/index.tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/more/profile.tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/more/scope.tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/more/settings/access-requests.tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/more/settings/calendar-sync.tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/more/settings/company.tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/more/settings/departments.tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/more/settings/index.tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/more/settings/laser-profiles.tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/more/settings/lead-rules.tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/more/settings/lookups/[name].tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/more/settings/lookups/index.tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/more/settings/mail-signatures.tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/more/settings/menu.tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/more/settings/signatures.tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/more/settings/spec-templates/[type].tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/more/settings/spec-templates/index.tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/more/settings/webmail.tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/notifications.tsx`
- `(tabs)/(home,companies,opportunities,calendar,modules)/opportunities.tsx`
- `+native-intent.tsx`
- `+not-found.tsx`
- `index.tsx`
- `modal/activity.tsx`
- `modal/calendar-event.tsx`
- `modal/calendar-import.tsx`
- `modal/call-new.tsx`
- `modal/chat-group-settings.tsx`
- `modal/chat-share-record.tsx`
- `modal/commercial-invoice-form.tsx`
- `modal/company-import.tsx`
- `modal/company-note.tsx`
- `modal/complaint-link.tsx`
- `modal/complaint-new.tsx`
- `modal/contact.tsx`
- `modal/contract-form.tsx`
- `modal/contract-quick.tsx`
- `modal/contract-signed-upload.tsx`
- `modal/create-case.tsx`
- `modal/delivery-form.tsx`
- `modal/department-edit.tsx`
- `modal/department-target.tsx`
- `modal/device-new.tsx`
- `modal/device-owner.tsx`
- `modal/edit-company.tsx`
- `modal/edit-product.tsx`
- `modal/installation-completion.tsx`
- `modal/installation-form.tsx`
- `modal/invoice-form.tsx`
- `modal/lead-rule-edit.tsx`
- `modal/lookup-brand.tsx`
- `modal/lookup-edit.tsx`
- `modal/lookup-import.tsx`
- `modal/mail-compose.tsx`
- `modal/mail-user-signature.tsx`
- `modal/meta-audience-members.tsx`
- `modal/meta-audience.tsx`
- `modal/meta-campaign-budget.tsx`
- `modal/meta-campaign-create.tsx`
- `modal/meta-catalog-products.tsx`
- `modal/meta-catalog.tsx`
- `modal/meta-comment-reply.tsx`
- `modal/meta-connection.tsx`
- `modal/meta-conversation.tsx`
- `modal/meta-conversion.tsx`
- `modal/meta-mapping.tsx`
- `modal/new-company.tsx`
- `modal/new-opportunity.tsx`
- `modal/new-receivable.tsx`
- `modal/new-ticket.tsx`
- `modal/opportunity-contact.tsx`
- `modal/opportunity-edit.tsx`
- `modal/opportunity-operations.tsx`
- `modal/opportunity-relations.tsx`
- `modal/opportunity-stock.tsx`
- `modal/opportunity-trello-import.tsx`
- `modal/payment-plan.tsx`
- `modal/payment.tsx`
- `modal/price-campaign.tsx`
- `modal/product-catalog-mail.tsx`
- `modal/product-import.tsx`
- `modal/product-new.tsx`
- `modal/proforma-form.tsx`
- `modal/proforma-quick.tsx`
- `modal/purchase-order.tsx`
- `modal/quote-document-link.tsx`
- `modal/quote-document-upload.tsx`
- `modal/quote-form.tsx`
- `modal/reference-form.tsx`
- `modal/reference-import.tsx`
- `modal/role-create.tsx`
- `modal/role-target.tsx`
- `modal/sales-order-accounting-invoice.tsx`
- `modal/sales-order-form.tsx`
- `modal/sales-order-item.tsx`
- `modal/service-price-edit.tsx`
- `modal/shipment-label.tsx`
- `modal/shipment-new.tsx`
- `modal/signature-edit.tsx`
- `modal/spec-template-import.tsx`
- `modal/spec-template-new.tsx`
- `modal/stock-item.tsx`
- `modal/target-edit.tsx`
- `modal/task-complete.tsx`
- `modal/task.tsx`
- `modal/trade-fair-follow-up.tsx`
- `modal/trade-fair-form.tsx`
- `modal/user-create.tsx`
- `modal/user-department.tsx`
- `modal/user-edit.tsx`
- `modal/user-limit.tsx`
- `modal/user-roles.tsx`
- `modal/user-target.tsx`
- `modal/visit-new.tsx`
- `onboarding.tsx`

## Bu tur doğrulama sonuçları

- Mobil TypeScript: geçti.
- Mobil test paketi: 637/637 geçti.
- iOS Metro/Hermes üretim JavaScript çıktısı: başarılı.
- Logo: RGBA 2127×739, dış zemin şeffaf.
- iOS simgesi: 1024×1024, alfa kanalı yok.
- Android uyarlanabilir ön katman: 1024×1024, şeffaf alfa kanalı.
- Kaynak diff boşluk kontrolü: geçti.
- Açık iOS simülatörü ve bağlı Android cihazı bulunamadı; native etkileşim ve
  ekran görüntüsü doğrulaması yapılmadı. Metro çıktısı native arşiv değildir.

Monorepo kökündeki farklı RN/Expo sürümlerinin mobil-v2 paketlemesine
karışması Metro'da yalnız mobil-v2 runtime singleton çözümlemesi sabitlenerek
giderildi; web bağımlılıkları veya kök paket sürümleri değiştirilmedi.
- Android Metro/Hermes üretim JavaScript çıktısı: başarılı.

## Bölüm / departman düzeltmesi

Çalışma alanı seçicisi seçeneklerini erişim kaydının modül + departman + bölüm
birleşiminden üretir. Başka modüldeki Tümü izni taşınmaz; departman değişiminde
uyumsuz bölüm tek işlemde geçerli primary/ilk bölüme alınır. Uygun seçim yoksa
kapsam değişmez. Ekran başlıkları kapsamı gösterir ve uyumsuz modülde seçim
uyarısı verir. Legacy kapsamı olan modüllerde sunucunun atanmış bölümleri
birlikte döndürdüğü açıkça belirtilir; tek bölüm filtresi varmış gibi sunulmaz.
API yetki kuralları değiştirilmedi. 644 test ve TypeScript geçti.
