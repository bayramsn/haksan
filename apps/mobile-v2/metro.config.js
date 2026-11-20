const { getSentryExpoConfig } = require('@sentry/react-native/metro');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

// Monorepo: kök node_modules hoist edildiği için Metro'ya iki kök de tanıtılmalı,
// yoksa @haksan/shared ve hoist edilmiş react-native çözülemez.
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getSentryExpoConfig(projectRoot, {
  includeWebReplay: false,
  annotateReactComponents: false,
});
// Expo'nun varsayılan watchFolders'ını ezme, üstüne ekle (expo-doctor bunu denetler).
config.watchFolders = [...(config.watchFolders ?? []), workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
// This workspace uses SDK 54 while the legacy app uses a newer SDK. Hoisted
// packages must resolve the runtime of THIS app, including their subpath imports.
const isolatedRuntimes = ['react-native', 'react', 'react-dom', 'expo', 'expo-modules-core', 'react-native-screens', 'react-native-reanimated', 'react-native-gesture-handler', 'react-native-safe-area-context', 'react-native-worklets', 'react-native-svg',
  ...Object.keys(require('./package.json').dependencies).filter((name) => name.startsWith('expo-') || name.startsWith('@expo/'))];
// The request is resolved as if this app imported it, so Metro's own rules still
// apply (`react-native` source field, `exports`). Pointing at package.json `main`
// served prebuilt lib/commonjs files; codegen cannot read those, so native-only
// props such as BottomTabsScreen `isFocused` were dropped (NativeTabs crash).
const appOrigin = path.join(projectRoot, 'package.json');
// Expo installs these SDK dependencies inside its own package. Resolving them
// from the app root would select the legacy app's SDK 57 JS against SDK 54 Pods.
const sdkOrigin = require.resolve('expo/package.json', { paths: [projectRoot] });
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (['expo-asset', 'expo-keep-awake'].some((name) => moduleName === name || moduleName.startsWith(`${name}/`))) {
    return context.resolveRequest({ ...context, originModulePath: sdkOrigin }, moduleName, platform);
  }
  const runtime = isolatedRuntimes.find((name) => moduleName === name || moduleName.startsWith(`${name}/`));
  return context.resolveRequest(runtime ? { ...context, originModulePath: appOrigin } : context, moduleName, platform);
};
// disableHierarchicalLookup KAPALI kalmalı: npm bazı paketleri (expo-asset,
// expo-file-system) node_modules/expo/node_modules altına yuvalıyor ve
// kapatıldığında Metro onları göremiyor.

/**
 * Metro varsayılanı çekirdek başına bir dönüştürücü işçi açar (M serisinde 8-12
 * süreç) ve NativeWind ayrıca bir child süreç ekler. Dev sunucusu düzgün
 * kapanmadığında bu işçiler öksüz kalıyor; birkaç tur sonra kullanıcı süreç
 * limiti doluyor ve makine "fork failed: resource temporarily unavailable"
 * veriyor. 4 işçi bu makinede derleme süresini hissedilir uzatmıyor ama
 * sızıntının hızını dörtte bire indiriyor.
 * ponytail: sabit sayı; farklı bir makinede yavaş gelirse EXPO_METRO_WORKERS ile ez.
 */
config.maxWorkers = Number(process.env.EXPO_METRO_WORKERS ?? 4);

module.exports = withNativeWind(config, { input: './global.css' });
