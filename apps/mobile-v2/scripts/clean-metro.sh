#!/bin/sh
# Öksüz kalmış Metro/NativeWind işçilerini toplar.
#
# Neden gerekli: `expo start` öldürüldüğünde yalnızca CLI süreci ölür; Metro'nun
# dönüştürücü işçileri ve NativeWind'in child süreci öksüz kalır. Birkaç tur
# sonra macOS kullanıcı süreç limiti dolar ve kabuk "fork failed: resource
# temporarily unavailable" vermeye başlar — o noktadan sonra HİÇBİR komut
# çalışmaz, tek çare Activity Monitor veya yeniden başlatmadır.
#
# Bu yüzden `npm start` her seferinde önce bunu çağırıyor: duvara çarpmadan
# önce temizlensin.
#
# Desenler bilerek dar: yalnızca BU depodan doğmuş süreçleri hedefler, makinede
# çalışan diğer node süreçlerine (API, editör) dokunmaz.

REPO_ROOT=$(cd "$(dirname "$0")/../../.." && pwd)

kill_pattern() {
  # pkill eşleşme bulamazsa 1 döner; bu hata değil, temiz demek.
  pkill -f "$1" 2>/dev/null || true
}

kill_pattern "$REPO_ROOT/node_modules/metro/src/DeltaBundler/Worker"
kill_pattern "$REPO_ROOT/node_modules/jest-worker/build/workers/processChild"
kill_pattern "$REPO_ROOT/node_modules/nativewind/dist/metro"

# Watchman kendi başına yeniden doğar; bekleyen izleyicileri bırakmasın.
command -v watchman >/dev/null 2>&1 && watchman shutdown-server >/dev/null 2>&1

exit 0
