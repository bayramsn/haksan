import type { ExpoConfig, ConfigContext } from 'expo/config';

// Yayın numaraları: `version` kullanıcıya görünür, build numaraları her mağaza
// yüklemesinde artırılır (EAS `autoIncrement` açıksa elle dokunmaya gerek yok).
const VERSION = '1.5.1';

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
  runtimeVersion: { policy: 'appVersion' },
  updates,
  assetBundlePatterns: ['**/*'],
  // Both native builds use the current iOS identity from one shared source.
  icon: './assets/brand/app-icon-ios.png',
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
    buildNumber: '1',
    supportsTablet: true,
    associatedDomains: appLinkHost ? [`applinks:${appLinkHost}`] : [],
    infoPlist: {
      // Guideline 5.1.1: izin metni "neden" sorusunu cevaplamalı, jenerik olmamalı.
      // expo-calendar modülü açılışta hem takvim hem hatırlatıcı iznini yokluyor
      // (CalendarModule.initializePermittedEntities); dördü de yoksa uygulama
      // EXFatal ile daha ilk ekranda düşer.
      NSCalendarsFullAccessUsageDescription:
        'Haksan, seçtiğiniz ziyaret veya servis randevusunu cihaz takviminize eklemek için takviminize erişir.',
      NSCalendarsUsageDescription:
        'Haksan, seçtiğiniz ziyaret veya servis randevusunu cihaz takviminize eklemek için takviminize erişir.',
      NSRemindersFullAccessUsageDescription:
        'Haksan, oluşturduğunuz randevuya hatırlatma kurabilmeniz için hatırlatıcılarınıza erişim ister.',
      NSRemindersUsageDescription:
        'Haksan, oluşturduğunuz randevuya hatırlatma kurabilmeniz için hatırlatıcılarınıza erişim ister.',
      NSCameraUsageDescription:
        'Haksan, görüntülü görüşme yapmak, QR kod taramak ve seçtiğiniz sohbet fotoğrafını çekmek için kameranızı kullanır.',
      NSMicrophoneUsageDescription: 'Haksan, sesli ve görüntülü görüşmelerde sesinizi karşı tarafa iletmek için mikrofonunuzu kullanır.',
      NSLocationWhenInUseUsageDescription:
        'Haksan, yakın firmaları haritada göstermek ve ziyaret kaydınızı müşteri adresiyle eşleştirmek için yalnız uygulama açıkken konumunuzu okur.',
      // Uygulama kapalıyken sessiz veri güncellemesi (bkz. §10.2).
      UIBackgroundModes: ['remote-notification', 'fetch', 'audio'],
    },
  },
  android: {
    package: 'com.haksan.mobileapp',
    allowBackup: false,
    // Attachments use the system photo/document picker and app-private cache.
    // Prevent transitive libraries from adding access to the whole media library.
    blockedPermissions: [
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.READ_MEDIA_IMAGES',
      'android.permission.READ_MEDIA_VIDEO',
      'android.permission.READ_MEDIA_AUDIO',
      'android.permission.READ_MEDIA_VISUAL_USER_SELECTED',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
    ],
    versionCode: 1,
    adaptiveIcon: { foregroundImage: './assets/brand/app-icon-ios.png', backgroundColor: '#000c69' },
    // Sadece gerçekten kullanılan izinler; fazlası Play incelemesinde gerekçe ister.
    permissions: ['CAMERA', 'RECORD_AUDIO', 'MODIFY_AUDIO_SETTINGS', 'ACCESS_FINE_LOCATION', 'POST_NOTIFICATIONS', 'ACCESS_NETWORK_STATE'],
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
    './plugins/withIosPodMinimum',
    './plugins/withAndroidReleaseOptimization',
    ['@config-plugins/react-native-webrtc', {
      cameraPermission: 'Haksan, görüntülü görüşmelerde kameranızı kullanır.',
      microphonePermission: 'Haksan, görüşmelerde sesinizi karşı tarafa iletmek için mikrofonunuzu kullanır.',
    }],
    'expo-router',
    'expo-updates',
    'expo-secure-store',
    'expo-background-task',
    'expo-sqlite',
    [
      'expo-camera',
      {
        cameraPermission: 'Haksan, görüntülü görüşme, QR ve barkod tarama ve sohbet fotoğrafı çekmek için kameranızı kullanır.',
        recordAudioAndroid: false,
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission: 'Haksan, yalnız seçtiğiniz görselleri sohbet eki olarak yükler.',
        cameraPermission: 'Haksan, yalnız çektiğiniz fotoğrafı sohbet eki olarak yüklemek için kameranızı kullanır.',
        // `false` blocks RECORD_AUDIO globally, including WebRTC calls.
        microphonePermission: 'Haksan, sesli ve görüntülü görüşmelerde sesinizi karşı tarafa iletmek için mikrofonunuzu kullanır.',
      },
    ],
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
        image: './assets/brand/splash-logo-ios.png',
        imageWidth: 200,
        resizeMode: 'contain',
        backgroundColor: '#f4f6f8',
        dark: { backgroundColor: '#070b18' },
      },
    ],
    [
      'expo-notifications',
      { icon: './assets/notification-icon.png', color: '#e31e24' },
    ],
  ],
  experiments: { typedRoutes: true },
});
