const path = require('path');

// Native modules must use the same JS implementation as this app's native build,
// including when a hoisted dependency imports them from another workspace.
function runtimePackages(projectRoot) {
  const expoRoot = path.dirname(require.resolve('expo/package.json', { paths: [projectRoot] }));
  const bundled = require(path.join(expoRoot, 'bundledNativeModules.json'));
  const dependencies = require(path.join(projectRoot, 'package.json')).dependencies;
  const names = new Set([
    'react', 'react-dom', 'react-native', 'expo',
    ...Object.keys(bundled),
    ...Object.keys(dependencies).filter(name => /^(expo-|react-native-|@react-native\/|@react-native-community\/)/.test(name)),
  ]);
  const packages = {};
  for (const name of names) {
    try {
      // Expo may keep SDK-compatible dependencies nested (e.g. expo-asset).
      packages[name] = path.dirname(require.resolve(`${name}/package.json`, { paths: [expoRoot, projectRoot] }));
    } catch (error) {
      if (error.code !== 'MODULE_NOT_FOUND' && error.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED') throw error;
    }
  }
  return packages;
}

function resolveRuntime(packages, context, moduleName, platform, resolver = context.resolveRequest) {
  const name = moduleName.startsWith('@') ? moduleName.split('/').slice(0, 2).join('/') : moduleName.split('/')[0];
  if (!packages[name]) return resolver(context, moduleName, platform);
  return resolver({
    ...context,
    disableHierarchicalLookup: true,
    nodeModulesPaths: [],
    extraNodeModules: { ...context.extraNodeModules, ...packages },
  }, moduleName, platform);
}

module.exports = { runtimePackages, resolveRuntime };
