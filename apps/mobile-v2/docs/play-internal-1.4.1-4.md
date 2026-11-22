# Play Console internal testing 1.4.1 (4)

- Kullanıcı Google Play beta / internal testing gönderimini açıkça istedi. Production (production track / tüm kullanıcılara yayın) yapılmadı.
- EAS production Android build: `92479290-0844-4c65-8610-3526055201c6` — başlatıldı (AAB, `production` profili, `requireCommit: false` → working-tree değişiklikleri dahil).
- Sürüm: `1.4.1` · `versionCode` remote increment `3 → 4`.
- Hesap: `@bayrams/haksan-mobile` · package `com.haksan.mobileapp`.
- Hedef track (`eas.json` submit/production): **`internal`** · `releaseStatus: draft` (Play Console internal testing; production store yayını değil).
- Keystore: EAS remote credentials mevcut (`Build Credentials axH1Sanivv`).
- Derleme: https://expo.dev/accounts/bayrams/projects/haksan-mobile/builds/92479290-0844-4c65-8610-3526055201c6

## Blocker — Google Service Account

- `--auto-submit` **başarısız**: `Google Service Account Keys cannot be set up in --non-interactive mode.`
- EAS’te Play Console submit için Google Service Account JSON henüz tanımlı değil; yerel workspace’te de `serviceAccountKeyPath` / service-account dosyası yok.
- Submission URL: **yok** (submit henüz oluşturulamadı).

### Ship’i tamamlamak için

1. Google Play Console → API access → service account oluştur / mevcut hesabı bağla; JSON key indir.
2. EAS’e yükle (etkileşimli):
   ```bash
   cd apps/mobile-v2 && set -a && source .env && set +a
   /tmp/eas-cli/node_modules/.bin/eas credentials -p android
   # → Google Service Account → Set up / Upload
   ```
   veya `eas.json` submit.android içine `serviceAccountKeyPath` verip key’i güvenli yolda tut (git’e commit etme).
3. Build bittikten sonra:
   ```bash
   /tmp/eas-cli/node_modules/.bin/eas submit --platform android --profile production --id 92479290-0844-4c65-8610-3526055201c6 --non-interactive
   ```
4. Play Console → Testing → Internal testing’de draft release’i incele / tester’lara aç.
