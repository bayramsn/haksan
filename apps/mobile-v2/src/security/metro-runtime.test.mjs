import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { runtimePackages, resolveRuntime } = require('../../scripts/metro-runtime.cjs');
const root = fileURLToPath(new URL('../../', import.meta.url));
const packages = runtimePackages(root);

test('SDK 54 native implementations stay on mobile-v2 versions', () => {
  for (const [name, version] of Object.entries({
    'react-native': '0.81.5', 'react': '19.1.0',
    'react-native-safe-area-context': '5.6.2', 'react-native-screens': '4.16.0',
    'react-native-gesture-handler': '2.28.0', 'react-native-worklets': '0.5.1',
  })) assert.equal(require(path.join(packages[name], 'package.json')).version, version, name);
  assert.equal(require(path.join(packages['expo-modules-core'], 'package.json')).version.split('.')[0], '3');
  assert.equal(require(path.join(packages['expo-asset'], 'package.json')).version.split('.')[0], '12');
});

test('iOS autolinking registers the ExpoAsset implementation used by Metro', () => {
  const cli = path.join(packages.expo, 'bin/autolinking');
  const resolved = JSON.parse(execFileSync(process.execPath, [cli, 'resolve', '--platform', 'apple', '--json'], {
    cwd: root,
    encoding: 'utf8',
  }));
  const asset = resolved.modules.find(module => module.packageName === 'expo-asset');
  assert.equal(asset?.packageVersion, require(path.join(packages['expo-asset'], 'package.json')).version);
  assert.ok(asset.modules.includes('AssetModule'));
  assert.equal(asset.pods.find(pod => pod.podName === 'ExpoAsset')?.podspecDir, path.join(packages['expo-asset'], 'ios'));
});

test('hoisted consumers cannot choose their neighbouring native module versions', () => {
  for (const origin of ['@gorhom/bottom-sheet', 'expo-router', '@react-navigation/elements']) {
    const context = {
      originModulePath: path.resolve(root, '../../node_modules', origin, 'index.js'),
      nodeModulesPaths: [path.resolve(root, '../../node_modules')],
      extraNodeModules: {},
      resolveRequest(next, name, platform) {
        assert.equal(next.disableHierarchicalLookup, true);
        assert.deepEqual(next.nodeModulesPaths, []);
        assert.equal(next.extraNodeModules['react-native-safe-area-context'], packages['react-native-safe-area-context']);
        assert.equal(name, 'react-native-safe-area-context');
        assert.equal(platform, 'ios');
        return 'canonical';
      },
    };
    assert.equal(resolveRuntime(packages, context, 'react-native-safe-area-context', 'ios'), 'canonical');
  }
});

test('ordinary JS resolution preserves nested dependencies', () => {
  const context = { resolveRequest(next, name) { assert.equal(next, context); return name; } };
  assert.equal(resolveRuntime(packages, context, 'zod', 'android'), 'zod');
});

test('canonical resolution retains the existing Sentry resolver chain', () => {
  const context = { resolveRequest() { throw new Error('wrapper was bypassed'); } };
  const wrapper = (next, name) => {
    assert.equal(name, 'react-native-screens/native-stack');
    assert.equal(next.extraNodeModules['react-native-screens'], packages['react-native-screens']);
    return 'wrapped';
  };
  assert.equal(resolveRuntime(packages, context, 'react-native-screens/native-stack', 'ios', wrapper), 'wrapped');
});
