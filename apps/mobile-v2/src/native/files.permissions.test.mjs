import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const compile = url => ts.transpileModule(readFileSync(url, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
}).outputText;
const compiled = compile(new URL('./files.ts', import.meta.url));
const selected = { canceled: false, assets: [{ uri: 'file:///cache/photo.jpg', fileName: 'photo.jpg', mimeType: 'image/jpeg', fileSize: 42 }] };

function harness(os, { result = selected, libraryGranted = false, cameraGranted = false } = {}) {
  const calls = [];
  const picker = {
    async requestMediaLibraryPermissionsAsync() { calls.push('libraryPermission'); return { granted: libraryGranted }; },
    async requestCameraPermissionsAsync() { calls.push('cameraPermission'); return { granted: cameraGranted }; },
    async launchImageLibraryAsync(options) { calls.push(['library', options]); return result; },
    async launchCameraAsync(options) { calls.push(['camera', options]); return result; },
  };
  const modules = {
    'react-native': { Platform: { OS: os } },
    'expo-image-picker': picker,
    'expo-document-picker': {},
    'expo-file-system': { File: class { get size() { return 42; } } },
    'expo-sharing': {},
    'expo/fetch': {},
    '@haksan/shared': { ALLOWED_FILE_EXTENSIONS: ['jpg'], ALLOWED_MIME_TYPES: ['image/jpeg'] },
    '@/src/auth/scope': {},
    '@/src/api/client': {},
    '@/src/api/config': {},
    '@/src/api/endpoints': {},
  };
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require(name) { assert.ok(name in modules, `Unexpected module: ${name}`); return modules[name]; },
  });
  return { pickImage: exports.pickImage, calls };
}

test('Android gallery works without broad media permission and returns only the selected upload', async () => {
  const h = harness('android'); // Library permission is denied; the system picker must still work.
  const upload = await h.pickImage('library');
  assert.equal(upload.uri, 'file:///cache/photo.jpg');
  assert.equal(upload.sizeBytes, 42);
  assert.equal(upload.extension, 'jpg');
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0][0], 'library');
  assert.equal(h.calls[0][1].mediaTypes.join(','), 'images');
});

test('Android system picker cancellation and empty selection return null', async () => {
  for (const result of [{ canceled: true, assets: null }, { canceled: false, assets: [] }]) {
    const h = harness('android', { result });
    assert.equal(await h.pickImage('library'), null);
    assert.equal(h.calls.length, 1);
    assert.equal(h.calls[0][0], 'library');
  }
});

test('camera denial stops capture on Android and iOS; granted permission permits capture', async () => {
  for (const os of ['android', 'ios']) {
    const denied = harness(os);
    await assert.rejects(denied.pickImage('camera'), /kamera izni gerekli/);
    assert.deepEqual(denied.calls, ['cameraPermission']);
    const granted = harness(os, { cameraGranted: true });
    assert.equal((await granted.pickImage('camera')).name, 'photo.jpg');
    assert.equal(granted.calls[0], 'cameraPermission');
    assert.equal(granted.calls[1][0], 'camera');
  }
});

test('iOS library permission behavior and cancellation remain intact', async () => {
  const denied = harness('ios');
  await assert.rejects(denied.pickImage('library'), /galeri izni gerekli/);
  assert.deepEqual(denied.calls, ['libraryPermission']);
  const granted = harness('ios', { libraryGranted: true });
  assert.equal((await granted.pickImage('library')).name, 'photo.jpg');
  assert.equal(granted.calls[0], 'libraryPermission');
  assert.equal(granted.calls[1][0], 'library');
  const canceled = harness('ios', { libraryGranted: true, result: { canceled: true, assets: null } });
  assert.equal(await canceled.pickImage('library'), null);
});

test('Android release config excludes broad media/storage access and retains functional permissions', () => {
  const exports = {};
  vm.runInNewContext(compile(new URL('../../app.config.ts', import.meta.url)), { exports, process: { env: {} } });
  const config = exports.default({ config: {} });
  for (const name of ['READ_MEDIA_IMAGES', 'READ_MEDIA_VIDEO', 'READ_MEDIA_AUDIO', 'READ_MEDIA_VISUAL_USER_SELECTED', 'READ_EXTERNAL_STORAGE', 'WRITE_EXTERNAL_STORAGE']) {
    assert.ok(config.android.blockedPermissions.includes(`android.permission.${name}`), name);
  }
  for (const name of ['CAMERA', 'RECORD_AUDIO', 'MODIFY_AUDIO_SETTINGS', 'ACCESS_FINE_LOCATION', 'POST_NOTIFICATIONS', 'ACCESS_NETWORK_STATE']) {
    assert.ok(config.android.permissions.includes(name), name);
    assert.ok(!config.android.blockedPermissions.includes(`android.permission.${name}`), name);
  }
  assert.ok(config.ios.infoPlist.NSCameraUsageDescription);
  assert.ok(config.plugins.find(plugin => plugin[0] === 'expo-image-picker')[1].photosPermission);
});

test('image picker Android plugin preserves the microphone permission required by WebRTC', () => {
  const exports = {};
  vm.runInNewContext(compile(new URL('../../app.config.ts', import.meta.url)), { exports, process: { env: {} } });
  const config = exports.default({ config: {} });
  const options = config.plugins.find(plugin => plugin[0] === 'expo-image-picker')[1];
  const { withAndroidImagePickerPermissions } = require('expo-image-picker/plugin/build/withImagePicker');
  const result = withAndroidImagePickerPermissions({ ...config, android: { ...config.android } }, options);
  assert.ok(result.android.permissions.includes('android.permission.RECORD_AUDIO'));
  assert.ok(!result.android.blockedPermissions.includes('android.permission.RECORD_AUDIO'));
});
