import type { ExpoConfig, ConfigContext } from 'expo/config';

// Yayın numaraları: `version` kullanıcıya görünür, build numaraları her mağaza
// yüklemesinde artırılır (EAS `autoIncrement` açıksa elle dokunmaya gerek yok).
const VERSION = '1.2.0';

const apiUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
const appLinkHost = process.env.EXPO_PUBLIC_APP_LINK_HOST?.trim();
const projectId = process.env.EAS_PROJECT_ID?.trim();
const sentryOrg = process.env.SENTRY_ORG?.trim();
const sentryProject = process.env.SENTRY_PROJECT?.trim();
const googleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();

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
        'Haksan, çektiğiniz fotoğrafı kayıtlara ek olarak yüklemek ve makine QR kodunu taramak için kameranızı kullanır.',
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
    versionCode: 1,
    adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#0b1f3a' },
    // Sadece gerçekten kullanılan izinler; fazlası Play incelemesinde gerekçe ister.
    permissions: ['CAMERA', 'ACCESS_FINE_LOCATION', 'POST_NOTIFICATIONS', 'ACCESS_NETWORK_STATE'],
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
    '@bacons/apple-targets',
    './plugins/with-android-worklets-prefab',
    'expo-router',
    'expo-updates',
    'expo-secure-store',
    'expo-background-task',
    'expo-sqlite',
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
        backgroundColor: '#0b1f3a',
        dark: { backgroundColor: '#0b1f3a' },
      },
    ],
    [
      'expo-notifications',
      { icon: './assets/notification-icon.png', color: '#e31e24' },
    ],
  ],
  experiments: { typedRoutes: true },
});
