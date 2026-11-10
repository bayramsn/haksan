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
// Monorepoda eski apps/mobile (Expo 57 / RN 0.86) hoist edilmiş olsa bile
// Metro'nun mobile-v2'nin kendi RN/Expo ağacına bağlanması gerekir; aksi halde
// EAS eager bundle codegen hatası verir (VirtualViewExperimentalNativeComponent).
const pin = (name) => {
  const local = path.resolve(projectRoot, 'node_modules', name);
  return require('fs').existsSync(local) ? local : path.resolve(workspaceRoot, 'node_modules', name);
};
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules ?? {}),
  'react-native': pin('react-native'),
  react: pin('react'),
  'react-dom': pin('react-dom'),
  expo: pin('expo'),
};
// disableHierarchicalLookup KAPALI kalmalı: npm bazı paketleri (expo-asset,
// expo-file-system) node_modules/expo/node_modules altına yuvalıyor ve
// kapatıldığında Metro onları göremiyor.
// extraNodeModules yalnız bulunamayan isimleri doldurur. Kökte hoist edilmiş
// apps/mobile (RN 0.86) paketinden yapılan `react-native` çözümlemesi önce
// kök kopyayı bulur; bare import'u mobile-v2 kopyasına çevirmek gerekir.
const pinnedNames = ['react-native', 'react', 'react-dom', 'expo'];
function pinnedName(moduleName) {
  return pinnedNames.find((name) => moduleName === name || moduleName.startsWith(`${name}/`));
}

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

const finalConfig = withNativeWind(config, { input: './global.css' });
const resolveUpstream = finalConfig.resolver.resolveRequest;
finalConfig.resolver.resolveRequest = (context, moduleName, platform) => {
  const name = pinnedName(moduleName);
  if (!name) {
    return resolveUpstream
      ? resolveUpstream(context, moduleName, platform)
      : context.resolveRequest(context, moduleName, platform);
  }
  const redirected = {
    ...context,
    originModulePath: path.join(pin(name), 'package.json'),
  };
  return resolveUpstream
    ? resolveUpstream(redirected, moduleName, platform)
    : context.resolveRequest(redirected, moduleName, platform);
};

module.exports = finalConfig;
