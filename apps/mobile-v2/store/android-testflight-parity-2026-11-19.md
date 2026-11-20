# TestFlight referansıyla Android eşleştirmesi

EAS’te tamamlanan iOS 1.4.1 (45) paketinin arşivi incelendi. Paket kimliği com.haksan.mobileapp. Kullanıcının iPhone’unda kurulu derleme numarası henüz doğrulanmadı.

Android 1.5.1 (18) ile iOS 1.4.1 (45) aynı HTTPS CRM API adresine bağlı. iOS paketinde fuar fotoğrafı, toplu posta, lazer fiyatları ve çağrı asistanı çağrıları var. Daha önce Android için kullanılan kaynak kopyası farklı bir gezinme düzeni ve daha dar modül kapsamı taşıyordu.

EAS iOS kaydındaki özelliklerle eşleşen yerel kaynak be27202aa5b65e265594a8778dca3d8c3f22ddbd. Android adayı bu ağaçtaki Ana Sayfa, Firmalar, Fırsatlar, Takvim ve Modüller düzenini kullanıyor. İkon doğrudan iOS 45 paketinden alındı ve Android’in adaptif simge çerçevesine uyarlandı. APK derlemesindeki 16 KB ve R8 ayarları, mevcut imza ve dar medya izinleri korunuyor. Güncel Zod ile derlenmesi için ortak doğrulama şemaları uyarlandı.

- İzole Android aday commit’i: `0ee499bc4d32e072b6cb24878b3f672215bd7b6b`.
- Kaynak arşivi: `.expo/testflight-parity/android-candidate.bundle`. Bu, ayrı adayın Git bundle dosyasıdır.
- EAS Android 1.5.2 (19): [derleme 919828bc](https://expo.dev/accounts/bayrams/projects/haksan-mobile/builds/919828bc-15e3-4b41-ac1e-51c7ae5ef693).
- Adayda ortak paket ve mobil TypeScript kontrolü başarılı. Android Metro export tamamlandı.
- EAS derlemesi tamamlandı. APK dosyası `.expo/release-19/HAKSAN-Mobile-v2-1.5.2-19.apk`. Mevcut EAS sertifikası, sürüm kodu, dört ABI, 16 KB ZIP ve ELF hizalaması ve Android izinleri doğrulandı. DEX boyutu 12,13 MB. APK SHA-256 `eb10f50c7196e01a62b75b54177467367dd5700420325e7c2e0ec32794c6a554`. Cihaz kurulumu ve açılış testi bekliyor.
- Aday testleri 626/637 geçti. Başarısız 11 kontrol mobil renk paletini web temasıyla karşılaştırıyor. iOS referansının tasarımı korunarak bu renk farklarına dokunulmadı. Test ve rota çıktıları `.expo/testflight-parity/` altında.
- Mevcut çalışma ağacındaki iOS projesiyle başlatılan simülatör derlemesi Xcode aracında süreyi aştı. İmzalı TestFlight arşivi simülatör derlemesi değildir.

## API doğrulaması

Statik incelemede mevcut çalışma klasörünün API kaynaklarında 531 mobil çağrıdan 497’si kayıtlı. Referans yerel API ağacında 530’u kayıtlı. Eksik tek referans rota ürün oluşturma işlemi kurtarma adresi `GET /products/create-operations/:param`. Bu inceleme canlı dağıtımın veya yanıt şemalarının kanıtı değildir.

Canlı CRM sağlık adresi HTTP 200 döndü. Kimlik bilgisi kullanmadan yapılan salt okunur kontrollerde `GET /trade-fairs/photos` 401, `GET /mail/campaigns`, `GET /laser-price-lists` ve `GET /call-assistant/capabilities` 404 döndü. İki paketin ortak hedefindeki bu yanıtlar nedeniyle tam uçtan uca eşitlik henüz doğrulanmadı. Üretim API’sinde değişiklik yapılmadı. Android adayının cihaz testi ve oturumlu testleri, EAS çıktısı ve yetkili test ortamı gerektiriyor.
