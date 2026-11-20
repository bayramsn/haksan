# Mobil kurulum durumu — 18 Kasım 2026

## Bu devam çalışmasında tamamlananlar

- Android fotoğraf seçimi sistem seçicisini kullanır; geniş galeri izni istemez. Kamera ve iOS izin davranışı korunur.
- Android yapılandırmasında READ_MEDIA_IMAGES, READ_MEDIA_VIDEO, READ_MEDIA_AUDIO, READ_MEDIA_VISUAL_USER_SELECTED, READ_EXTERNAL_STORAGE ve WRITE_EXTERNAL_STORAGE engellenir. Yeni AAB'nin birleşik manifesti ayrıca doğrulanmalıdır.
- Mobil Hakkında ekranına mevcut kurumsal KVKK metni bağlantısı eklenir. Hatalı A.Ş. unvanı resmî yayımlanan Limited Şirketi unvanıyla düzeltilir.
- Web yardım ekranındaki .local e-posta ve örnek telefon, resmî yayımlanan info@haksanmakina.com.tr ve +90 212 567 33 31 ile değiştirilir.
- Mobil testler: mikrofon regresyon düzeltmesi sonrası 112/112 başarılı; 6 izin testi dahil. İzole Expo SDK 54 yayın çalışma alanında mobil TypeScript kontrolü başarılı. Web değişikliği için git diff --check başarılı.
- Mobil gizlilik metni inceleme taslağı: mobile-privacy-draft.tr.md.

## Henüz yayımlanmayanlar

Bu kaynak değişiklikleri mağazaya veya web sunucusuna dağıtılmadı. Son doğrulanan dahili test sürümü 1.5.0 (15). 16 AAB'si mikrofon izni kontrolünü geçemedi ve yüklenmedi. Düzeltilmiş 1.5.0 (17) AAB'si hazır; imza, R8 mapping, dört ABI, 16 KB ve gerçek manifest izin kontrolleri başarılı. Ayrıntılar `android-release-17-validation.md` dosyasında. Kurumsal KVKK bağlantısı mobil uygulamaya özel tamamlanmış gizlilik bildiriminin yerine geçmez.

Google Sites belgesi önceki çalışma sırasında oluşturuldu; gövde metni ve yayını bitmedi. Devam sırasında yerel tarayıcı erişimi kullanılamadığı için Play Console ve Google Sites güncellenemedi. Play Veri güvenliği, gizlilik ve fotoğraf/video izin beyanları tamamlandı olarak işaretlenmedi.

## Beklenen bilgiler

- Teyit edildi: info@haksanmakina.com.tr, Haksan ekibi; hesap 3 gün içinde pasife alınır ve veriler saklanır. Mobil kaynak kod ve gizlilik taslağı bu davranışa göre güncellendi; mağazaya henüz aktarılmadı.
- Saklanan verilerin kategorileri, saklama süreleri, yasal/işletmesel gerekçeleri ve yedeklerin yaşam döngüsü.
- Canlı depolama, görüşme ve diğer veri işleyen sağlayıcıları/bölgeleri.

Hesap silme kodu şu anda e-posta taslağı açar. Admin DELETE işlemi hesabı pasifleştirip oturumları iptal eder; kalıcı kimlik/veri silme süreci olarak beyan edilmemelidir.
