import type { ExpoConfig, ConfigContext } from 'expo/config';
import { isIP } from 'node:net';

// Yayın numaraları: `version` kullanıcıya görünür, build numaraları her mağaza
// yüklemesinde artırılır (EAS `autoIncrement` açıksa elle dokunmaya gerek yok).
const VERSION = '1.4.1';

const apiUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
const appLinkHost = process.env.EXPO_PUBLIC_APP_LINK_HOST?.trim();
const projectId = process.env.EAS_PROJECT_ID?.trim();
const sentryOrg = process.env.SENTRY_ORG?.trim();
const sentryProject = process.env.SENTRY_PROJECT?.trim();
const googleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();

function isReleaseHostname(host: string): boolean {
  return /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(host)
    && !isIP(host)
    && !/(?:^|[.-])\d{1,3}(?:[.-]\d{1,3}){3}(?=[.-]|$)/.test(host)
    && !/(^|\.)(sslip\.io|nip\.io|xip\.io|local)$/i.test(host);
}

if (process.env.HAKSAN_ANDROID_STORE_BUILD === '1') {
  const url = apiUrl ? new URL(apiUrl) : undefined;
  if (!url || url.protocol !== 'https:' || url.username || url.password
    || url.port || !isReleaseHostname(url.hostname)) {
    throw new Error('Android mağaza derlemesi için IP içermeyen bir HTTPS API alan adı gerekli.');
  }
  if (!appLinkHost || !isReleaseHostname(appLinkHost)) {
    throw new Error('Android mağaza derlemesi için IP içermeyen bir App Links alan adı gerekli.');
  }
}

// OTA güncellemeleri native ABI sınırını geçemez. Uygulama sürümü değiştiğinde
// yeni bir binary gerekir; EAS Update yalnız aynı `version` içindeki JS/asset
// düzeltmelerini dağıtabilir. Proje henüz EAS'e bağlanmadıysa güncelleme
// istemcisi fail-closed kalır.
const updates: ExpoConfig['updates'] = projectId
  ? {
      enabled: true,
      url: `https://u.expo.dev/${projectId}`,
      checkAutomatically: 'ON_LOAD',
      fallbackToCacheTimeout: 0,
      useEmbeddedUpdate: true,
    }
  : {
      enabled: false,
      checkAutomatically: 'NEVER',
      useEmbeddedUpdate: true,
    };

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Haksan',
  slug: 'haksan-mobile',
  scheme: 'haksan',
  version: VERSION,
  orientation: 'default',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  // Bare workflow: policy objesi EAS'te reddedilir; sürümle hizalı sabit string.
  runtimeVersion: VERSION,
  updates,
  assetBundlePatterns: ['**/*'],
  icon: './assets/icon.png',
  extra: {
    // API adresi build ortamından gelir. Production uygulamasında gömülü IP,
    // geçici host veya kullanıcı tarafından değiştirilebilir sunucu yoktur.
    apiUrl,
    appLinkHost,
    googleMapsApiKey,
    ...(projectId ? { eas: { projectId } } : {}),
  },
  ios: {
    bundleIdentifier: 'com.haksan.mobileapp',
    appleTeamId: 'TZ9Z6DUNC3',
    // Same application-only keychain group as Apple's default; retain access across upgrades.
    entitlements: { 'keychain-access-groups': ['$(AppIdentifierPrefix)com.haksan.mobileapp'] },
    buildNumber: '1',
    supportsTablet: true,
    associatedDomains: appLinkHost ? [`applinks:${appLinkHost}`] : [],
    infoPlist: {
      // Saha sayacı Dynamic Island / kilit ekranında Live Activity olarak görünür (targets/live-activity).
      NSSupportsLiveActivities: true,
      // Guideline 5.1.1: izin metni "neden" sorusunu cevaplamalı, jenerik olmamalı.
      // expo-calendar modülü açılışta hem takvim hem hatırlatıcı iznini yokluyor
      // (CalendarModule.initializePermittedEntities); dördü de yoksa uygulama
      // EXFatal ile daha ilk ekranda düşer.
      NSCalendarsFullAccessUsageDescription:
        'Haksan, seçtiğiniz ziyaret veya servis randevusunu takviminize eklemek ve Takvim Senkronu açıksa seçtiğiniz takvimleri CRM takviminizle eşitlemek için takviminize erişir.',
      NSCalendarsUsageDescription:
        'Haksan, seçtiğiniz ziyaret veya servis randevusunu takviminize eklemek ve Takvim Senkronu açıksa seçtiğiniz takvimleri CRM takviminizle eşitlemek için takviminize erişir.',
      NSRemindersFullAccessUsageDescription:
        'Haksan, oluşturduğunuz randevuya hatırlatma kurabilmeniz için hatırlatıcılarınıza erişim ister.',
      NSRemindersUsageDescription:
        'Haksan, oluşturduğunuz randevuya hatırlatma kurabilmeniz için hatırlatıcılarınıza erişim ister.',
      NSCameraUsageDescription:
        'Haksan, fotoğraf ve QR işlemlerinde ve sizin başlattığınız veya kabul ettiğiniz görüntülü sohbet aramasında kameranızı kullanır.',
      NSMicrophoneUsageDescription:
        'Haksan, yalnız siz sesli mesaj kaydını başlattığınızda veya sohbet aramasını başlatıp kabul ettiğinizde mikrofonunuzu kullanır.',
      NSLocationWhenInUseUsageDescription:
        'Haksan, yakın firmaları haritada göstermek ve ziyaret kaydınızı müşteri adresiyle eşleştirmek için yalnız uygulama açıkken konumunuzu okur.',
      // Uygulama kapalıyken sessiz veri güncellemesi (bkz. §10.2).
      UIBackgroundModes: ['remote-notification', 'fetch'],
      // Yalnız standart HTTPS/TLS kullanılıyor; TestFlight her build'de beyan sormasın.
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: 'com.haksan.mobileapp',
    allowBackup: false,
    versionCode: 1,
    adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#F4F6F8' },
    // Sadece gerçekten kullanılan izinler; fazlası Play incelemesinde gerekçe ister.
    permissions: ['CAMERA', 'RECORD_AUDIO', 'MODIFY_AUDIO_SETTINGS', 'ACCESS_FINE_LOCATION', 'POST_NOTIFICATIONS', 'ACCESS_NETWORK_STATE'],
    blockedPermissions: [
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.WAKE_LOCK',
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
      'android.permission.FOREGROUND_SERVICE_MICROPHONE',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.READ_MEDIA_IMAGES',
      'android.permission.READ_MEDIA_VIDEO',
      'android.permission.READ_MEDIA_AUDIO',
      'android.permission.READ_MEDIA_VISUAL_USER_SELECTED',
    ],
    edgeToEdgeEnabled: true,
    ...(googleMapsApiKey ? { config: { googleMaps: { apiKey: googleMapsApiKey } } } : {}),
    intentFilters: appLinkHost
      ? [
          {
            action: 'VIEW',
            autoVerify: true,
            data: [{ scheme: 'https', host: appLinkHost, pathPrefix: '/app' }],
            category: ['BROWSABLE', 'DEFAULT'],
          },
        ]
      : [],
  },
  plugins: [
    './plugins/with-ios-build-fixes',
    './plugins/with-ios-scene-delegate',
    // targets/* altındaki Apple hedeflerini (Live Activity widget'ı) prebuild'e ekler.
    './plugins/with-safe-apple-targets',
    './plugins/with-android-worklets-prefab',
    './plugins/with-android-release-privacy',
    'expo-router',
    'expo-updates',
    'expo-secure-store',
    'expo-background-task',
    'expo-sqlite',
    ['expo-audio', { microphonePermission: 'Haksan, yalnız siz sesli mesaj kaydını başlattığınızda veya sohbet aramasını başlatıp kabul ettiğinizde mikrofonunuzu kullanır.', recordAudioAndroid: true, enableBackgroundRecording: false }],
    ['@config-plugins/react-native-webrtc', { cameraPermission: 'Haksan, sizin başlattığınız veya kabul ettiğiniz görüntülü sohbet aramasında kameranızı kullanır.', microphonePermission: 'Haksan, yalnız siz sesli mesaj kaydını başlattığınızda veya sohbet aramasını başlatıp kabul ettiğinizde mikrofonunuzu kullanır.' }],
    [
      'expo-camera',
      {
        cameraPermission: 'Haksan, stok kartlarındaki QR ve barkodları taramak için kameranızı kullanır.',
        recordAudioAndroid: false,
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission:
          'Haksan, yalnız seçtiğiniz görselleri sohbet, servis, fuar ve belge kayıtlarına ek olarak yükler.',
        cameraPermission:
          'Haksan, çektiğiniz fotoğrafı kayıtlara ek olarak yüklemek ve makine QR kodunu taramak için kameranızı kullanır.',
        // false blocks RECORD_AUDIO from every merged native module, including speech.
        microphonePermission: 'Haksan, yalnız siz sesli giriş başlattığınızda mikrofonu kullanır; telefon görüşmelerini kaydetmez.',
      },
    ],
    // Run after media plugins so non-clean prebuilds also clear old microphone blocks.
    './plugins/with-call-assistant',
    [
      'expo-local-authentication',
      {
        faceIDPermission: 'Haksan, uygulamadaki CRM ve finans verilerini açmadan önce kimliğinizi doğrulamak için Face ID kullanır.',
      },
    ],
    ...(sentryOrg && sentryProject
      ? [[
          '@sentry/react-native',
          { organization: sentryOrg, project: sentryProject },
        ] as [string, { organization: string; project: string }]]
      : []),
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        imageWidth: 220,
        resizeMode: 'contain',
        backgroundColor: '#F4F6F8',
        dark: { backgroundColor: '#F4F6F8' },
        // Android 12+ ikonu daireyle maskeler; geniş logo kare tuvalde daireye sığacak boyda ortalı.
        android: { image: './assets/splash-icon-android.png', imageWidth: 288, resizeMode: 'contain', backgroundColor: '#F4F6F8', dark: { image: './assets/splash-icon-android.png', backgroundColor: '#F4F6F8' } },
      },
    ],
    [
      'expo-notifications',
      { icon: './assets/notification-icon.png', color: '#e31e24' },
    ],
  ],
  experiments: { typedRoutes: true },
});
