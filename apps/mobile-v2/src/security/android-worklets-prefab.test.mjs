import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { applyWorkletsPrefab } = require('../../plugins/with-android-worklets-prefab.js');
const template = `find_package(ReactAndroid REQUIRED CONFIG)
add_library(worklets SHARED IMPORTED)

set_target_properties(
  worklets
  PROPERTIES
    IMPORTED_LOCATION
    "\${REACT_NATIVE_WORKLETS_DIR}/android/build/intermediates/cmake/\${BUILD_TYPE}/obj/\${ANDROID_ABI}/libworklets.so"
)
target_link_libraries(reanimated log ReactAndroid::jsi fbjni::fbjni android
                      worklets)
`;
test('Reanimated uses the Worklets Prefab ABI and variant instead of a hardcoded build path', () => {
  const patched = applyWorkletsPrefab(template);
  assert.match(patched, /find_package\(react-native-worklets REQUIRED CONFIG\)/);
  assert.match(patched, /target_link_libraries\(reanimated log ReactAndroid::jsi fbjni::fbjni android\s+react-native-worklets::worklets\)/);
  assert.doesNotMatch(patched, /add_library\(worklets SHARED IMPORTED\)/);
  assert.doesNotMatch(patched, /intermediates\/cmake/);
  assert.match(patched, /find_package\(ReactAndroid REQUIRED CONFIG\)/);
});
test('Worklets patch is idempotent and accepts the upstream Prefab implementation', () => {
  const patched = applyWorkletsPrefab(template);
  assert.equal(applyWorkletsPrefab(patched), patched);
  const upstream = patched.replace('# haksan: worklets prefab dependency\n', '');
  assert.equal(applyWorkletsPrefab(upstream), upstream);
});
test('unexpected or partial native dependency versions fail before a misleading build', () => {
  assert.throws(() => applyWorkletsPrefab('unrecognized CMake'), /expected Reanimated/);
  assert.throws(() => applyWorkletsPrefab(template.replace('android\n                      worklets)', 'android\n                      something_else)')), /expected Reanimated/);
  assert.throws(() => applyWorkletsPrefab('# haksan: worklets prefab dependency'), /incomplete previous patch/);
});
