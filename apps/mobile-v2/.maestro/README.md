# Maestro

`smoke.yaml` temiz uygulama verisiyle açılış, onboarding, giriş ve parola
sıfırlama navigasyonunu doğrular. Bilerek kullanıcı adı/parola içermez ve canlı
API'ye istek göndermez. EAS preview workflow'u aynı akışı Android emülatörü ve
iOS simülatöründe çalıştırır; gerçek oturum/rol akışları için kimlik bilgileri
repository dışında yönetilen ayrı test ortamı ve ek tagged flow'lar gerekir.
