const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

module.exports = function withAndroidReleasePrivacy(config) {
  return withAndroidManifest(config, (mod) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
    application.$['android:requestLegacyExternalStorage'] = 'false';
    const replaced = (application.$['tools:replace'] ?? '').split(',').filter(Boolean);
    application.$['tools:replace'] = [...new Set([...replaced, 'android:requestLegacyExternalStorage'])].join(',');
    mod.modResults.manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';

    const removed = new Set(['androidx.compose.ui.tooling.PreviewActivity', 'com.canhub.cropper.CropImageActivity']);
    application.activity = (application.activity ?? []).filter((activity) => !removed.has(activity.$['android:name']));
    for (const name of removed) {
      application.activity.push({ $: { 'android:name': name, 'tools:node': 'remove' } });
    }
    return mod;
  });
};
