const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('expo/config-plugins');

const MARKER = '# haksan: worklets prefab dependency';
const LEGACY_IMPORT = /add_library\(worklets SHARED IMPORTED\)\s*set_target_properties\(\s*worklets\s+PROPERTIES\s+IMPORTED_LOCATION\s+"\$\{REACT_NATIVE_WORKLETS_DIR\}\/android\/build\/intermediates\/cmake\/\$\{BUILD_TYPE\}\/obj\/\$\{ANDROID_ABI\}\/libworklets\.so"\s*\)/;
const LEGACY_LINK = /target_link_libraries\(reanimated log ReactAndroid::jsi fbjni::fbjni android\s+worklets\)/;

/** Reanimated 4.1.x's hardcoded AGP output path does not match Worklets' CXX
 * output. Its existing Gradle project dependency already exposes a Prefab
 * package that supplies the correct variant, ABI and build hash automatically.
 */
function applyWorkletsPrefab(source) {
  if (source.includes(MARKER)) {
    if (!source.includes('find_package(react-native-worklets REQUIRED CONFIG)') || !source.includes('react-native-worklets::worklets')) {
      throw new Error('with-android-worklets-prefab: incomplete previous patch; review CMakeLists.txt.');
    }
    return source;
  }
  // A newer upstream implementation already using Prefab needs no adaptation.
  if (source.includes('find_package(react-native-worklets REQUIRED CONFIG)') && source.includes('react-native-worklets::worklets') && !source.includes('add_library(worklets SHARED IMPORTED)')) return source;
  if (!LEGACY_IMPORT.test(source) || !LEGACY_LINK.test(source)) {
    throw new Error('with-android-worklets-prefab: expected Reanimated 4.1.x Worklets import was not found; review native dependency compatibility before building.');
  }
  return source.replace(LEGACY_IMPORT, `${MARKER}\nfind_package(react-native-worklets REQUIRED CONFIG)`)
    .replace(LEGACY_LINK, 'target_link_libraries(reanimated log ReactAndroid::jsi fbjni::fbjni android\n                      react-native-worklets::worklets)');
}

module.exports = function withAndroidWorkletsPrefab(config) {
  return withDangerousMod(config, ['android', async cfg => {
    const packageFile = require.resolve('react-native-reanimated/package.json', { paths: [cfg.modRequest.projectRoot] });
    const cmakeFile = path.join(path.dirname(packageFile), 'android', 'CMakeLists.txt');
    const original = fs.readFileSync(cmakeFile, 'utf8');
    const patched = applyWorkletsPrefab(original);
    if (patched !== original) fs.writeFileSync(cmakeFile, patched);
    return cfg;
  }]);
};
module.exports.applyWorkletsPrefab = applyWorkletsPrefab;
