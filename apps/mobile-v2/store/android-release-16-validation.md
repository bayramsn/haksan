# Android 1.5.0 (16) — doğrulama kaydı

## Derleme

- EAS projesi: `@bayrams/haksan-mobile`.
- Paket: `com.haksan.mobileapp`.
- Derleme: [fc67c79f-f2da-498b-85c0-99fd19ba8522](https://expo.dev/accounts/bayrams/projects/haksan-mobile/builds/fc67c79f-f2da-498b-85c0-99fd19ba8522).
- İzole yayın kaynağı commit: `9a477b1`.
- Sürüm kodu EAS tarafından 15'ten 16'ya artırıldı.
- Durum: EAS derlemesi tamamlandı; **yükleme için uygun değil**. Paket kontrolünde görüşmeler için gereken RECORD_AUDIO izninin manifestten kaldırıldığı saptandı. Play'e yüklenmedi. Düzeltme 17 derlemesinde takip ediliyor.
- AAB SHA-256: `76c2b7bccfd7bada57ef3feb2d9f57008146d52daf1301758fa2d5fd40203868`.

## Değişiklikler

- Android fotoğraf ekleri sistem seçicisiyle alınır; geniş medya erişimi istenmez.
- Altı medya/depolama izni yapılandırmada engellenir; birleşik AAB manifesti kontrol edilecek.
- Destek ve hesap işlemleri adresi `info@haksanmakina.com.tr`.
- Hesap işlemi açıkça pasife alma olarak adlandırılır. İşletme teyidine göre 3 gün içinde pasife alınır; veriler saklanır.
- Kurumsal KVKK bağlantısı ve doğru tüzel kişi unvanı Hakkında ekranına eklenir.

## Doğrulama

- Kaynak mobil testleri: 111/111 başarılı; 5 yeni izin testi dahil.
- Medya izinleri ve Hakkında değişiklikleri sonrası izole mobil TypeScript kontrolü başarılı. Son hesap metni değişikliği yalnız metin sabitleridir.
- İmza ve Bundletool doğrulaması başarılı. R8 mapping mevcut (86.677.971 bayt); 2 DEX toplamı 12,13 MB. Dört ABI'nin her birinde 28 native kitaplık mevcut; arm64-v8a/x86_64 16 KB ELF hizalaması başarılı.
- Altı geniş medya/depolama izni ve AD_ID yok. Gerekli mikrofon izni de eksik olduğundan işlevsel izin kontrolü başarısız. `expo-image-picker` içindeki `microphonePermission: false`, WebRTC dahil tüm uygulama için RECORD_AUDIO iznini engelliyor. Kaynakta amaca uygun izin metniyle düzeltildi; temiz Expo SDK54 prebuild manifestinde mikrofon korunuyor ve altı geniş medya/depolama izni engelleniyor. Gerçek Expo eklentisini çalıştıran yeni regresyon testi geçti (6/6 izin testi).
- Gerçek cihaz ve oturum açılmış iş akışı QA'sı bu devam çalışmasında yapılmadı.

## Mağaza / gizlilik

- Chrome erişimi bu sohbette kullanılamıyor; Google Sites ve Play Console güncellenemedi.
- Türkçe mağaza metni ve yeni sürüm notları `play-listing.tr.md` dosyasında hazırlandı; konsola girilmedi.
- Veri güvenliği beyanı tamamlanmadı; saklama süreleri/gerekçeleri ve canlı sağlayıcılar netleşmeli. Pasife alma kalıcı veri silme olarak işaretlenemez.
- Mobil API hostuyla eşleşen AWS sunucusunu salt okunur belirleme denemesi, AWS kimlik bilgilerinin doğrulanamaması nedeniyle sonuçlanmadı. Hiçbir sunucu değişikliği yapılmadı.
