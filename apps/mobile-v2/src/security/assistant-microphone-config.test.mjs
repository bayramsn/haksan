import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { getConfig } = require('@expo/config');
const { withAndroidImagePickerPermissions } = require('expo-image-picker/plugin/build/withImagePicker');
const { applyAssistantMicrophonePermission } = require('../../plugins/with-call-assistant.js');
const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const config = getConfig(projectRoot, { skipSDKVersionRequirement: true }).exp;
const options = config.plugins.find(plugin => Array.isArray(plugin) && plugin[0] === 'expo-image-picker')[1];
async function permissionRows(props) {
  const result = withAndroidImagePickerPermissions({ name: 'Test', slug: 'test' }, props);
  const compiled = await result.mods.android.manifest({ ...result,
    modResults: { manifest: { $: {}, 'uses-permission': [] } },
    modRequest: { platform: 'android', modName: 'manifest', projectRoot },
  });
  return compiled.modResults.manifest['uses-permission'];
}
test('configured media plugin preserves the microphone permission needed by on-device speech', async () => {
  assert.equal(typeof options.microphonePermission, 'string');
  assert.match(options.microphonePermission, /sesli giriş/);
  const rows = await permissionRows(options);
  const microphone = rows.filter(row => row.$['android:name'] === 'android.permission.RECORD_AUDIO');
  assert.equal(microphone.length, 1); assert.equal(microphone[0].$['tools:node'], undefined);
  // Prove the regression: false removes the permission contributed by the speech module.
  const blocked = await permissionRows({ ...options, microphonePermission: false });
  assert.equal(blocked.find(row => row.$['android:name'] === 'android.permission.RECORD_AUDIO').$['tools:node'], 'remove');
});

test('assistant plugin removes stale microphone blocks from a non-clean prebuild only', () => {
  const other = { $: { 'android:name': 'android.permission.READ_CALL_LOG', 'tools:node': 'remove' } };
  const manifest = { manifest: { 'uses-permission': [other, { $: { 'android:name': 'android.permission.RECORD_AUDIO', 'tools:node': 'remove' } }] } };
  applyAssistantMicrophonePermission(manifest);
  const rows = manifest.manifest['uses-permission'];
  assert.equal(rows[0], other); assert.equal(rows.length, 2);
  assert.deepEqual(rows[1], { $: { 'android:name': 'android.permission.RECORD_AUDIO' } });
  const snapshot = JSON.stringify(manifest); applyAssistantMicrophonePermission(manifest); assert.equal(JSON.stringify(manifest), snapshot);
  const order = config.plugins.map(plugin => Array.isArray(plugin) ? plugin[0] : plugin);
  assert.ok(order.indexOf('./plugins/with-call-assistant') > order.indexOf('expo-image-picker'));
});
