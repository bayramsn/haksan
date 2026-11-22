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
const { runtimePackages, resolveRuntime } = require('./scripts/metro-runtime.cjs');
const packages = runtimePackages(projectRoot);
config.resolver.extraNodeModules = { ...(config.resolver.extraNodeModules ?? {}), ...packages };
const previousResolver = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => resolveRuntime(packages, context, moduleName, platform, previousResolver ?? context.resolveRequest);
// Keep hierarchical lookup for ordinary JS packages; native runtime packages
// resolve only through the canonical map, including Expo's nested dependencies.

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
