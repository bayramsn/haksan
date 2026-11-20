#!/usr/bin/env bash
# Canlı sunucuda Meta Business entegrasyonunu yapılandırır.
#
#   bash deploy/configure-meta-env.sh
#
# App ID ve App Secret'ı Meta for Developers → Uygulamanız → Ayarlar → Temel bölümünden
# alın; betik ikisini terminalde sorar (gizli değer ekrana ve komut geçmişine düşmez).
# Webhook doğrulama jetonu ve kimlik şifreleme anahtarı burada üretilir. Sunucudaki
# /opt/haksan/.env yedeklenir, META_* satırları yenilenir ve yalnız API konteyneri
# yeniden başlatılır. Şifreleme anahtarı değişirse kayıtlı Meta bağlantıları yeniden
# kurulmalıdır; mevcut anahtar varsa betik onu korur.
set -euo pipefail

KEY="${KEY:-deploy/keys/haksan-prod-20260701.pem}"
HOST="${HOST:-ubuntu@52.28.67.148}"
PUBLIC_URL="${PUBLIC_URL:-https://crm.52-28-67-148.sslip.io}"

[[ -f "$KEY" ]] || { echo "SSH anahtarı bulunamadı: $KEY (depo kökünden çalıştırın)"; exit 1; }
read -rp "Meta App ID: " APP_ID
read -rsp "Meta App Secret: " APP_SECRET; echo
[[ "$APP_ID" =~ ^[0-9]{5,25}$ ]] || { echo "App ID yalnız rakamlardan oluşmalı."; exit 1; }
[[ "$APP_SECRET" =~ ^[A-Za-z0-9]{16,128}$ ]] || { echo "App Secret beklenen biçimde değil."; exit 1; }
VERIFY_TOKEN="$(openssl rand -hex 24)"
NEW_ENC_KEY="$(openssl rand -base64 32)"

# Değerler komut satırıyla değil stdin üzerinden gider; uzak süreç listesinde görünmez.
ssh -i "$KEY" -o ConnectTimeout=15 "$HOST" "sudo bash -s" <<REMOTE
set -euo pipefail
cd /opt/haksan
cp -a .env ".env.bak-\$(date +%Y%m%d%H%M%S)"
existing_key="\$(grep -E '^META_CREDENTIAL_ENCRYPTION_KEY=' .env | tail -1 | cut -d= -f2- || true)"
enc_key="\${existing_key:-$NEW_ENC_KEY}"
grep -vE '^(META_APP_ID|META_APP_SECRET|META_WEBHOOK_VERIFY_TOKEN|META_CREDENTIAL_ENCRYPTION_KEY)=' .env > .env.next
{
  echo "META_APP_ID=$APP_ID"
  echo "META_APP_SECRET=$APP_SECRET"
  echo "META_WEBHOOK_VERIFY_TOKEN=$VERIFY_TOKEN"
  echo "META_CREDENTIAL_ENCRYPTION_KEY=\$enc_key"
} >> .env.next
chmod --reference=.env .env.next && chown --reference=.env .env.next
mv .env.next .env
docker compose --env-file .env up -d --no-deps --no-build --force-recreate api
for attempt in \$(seq 1 30); do
  status="\$(docker inspect -f '{{.State.Health.Status}}' \$(docker compose ps -q api) 2>/dev/null || true)"
  [[ "\$status" == healthy ]] && { echo "API sağlıklı"; exit 0; }
  sleep 5
done
echo "API sağlıklı duruma geçmedi; son loglar:"; docker compose logs --tail=40 api; exit 1
REMOTE

challenge="haksan-$RANDOM"
answer="$(curl -fsS "$PUBLIC_URL/api/v1/meta/webhooks?hub.mode=subscribe&hub.verify_token=$VERIFY_TOKEN&hub.challenge=$challenge" || true)"
if [[ "$answer" == "$challenge" ]]; then echo "Webhook doğrulaması çalışıyor."; else echo "Webhook doğrulaması beklenen yanıtı vermedi: $answer"; fi

cat <<INFO

Meta for Developers'ta şunları girin:
  • Webhooks → Page → Callback URL : $PUBLIC_URL/api/v1/meta/webhooks
                    Verify token  : $VERIFY_TOKEN
                    Alanlar       : leadgen (ve kullanılacaksa messages, feed)
  • Facebook Login → Ayarlar → Geçerli OAuth Yönlendirme URI'leri:
                                    $PUBLIC_URL/api/v1/meta/connections/oauth/callback
Ardından CRM'de Meta Merkezi → Bağlantılar'dan hesabı bağlayın.
INFO
