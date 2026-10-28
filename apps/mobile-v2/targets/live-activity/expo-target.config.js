/** Dynamic Island / kilit ekranı Live Activity widget'ı (@bacons/apple-targets). */
/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = () => ({
  type: 'widget',
  // Pod adı (modules/haksan-live-activity → HaksanLiveActivity) ile çakışmasın: aynı Swift modül adı derlemeyi bozar.
  name: 'HaksanLiveActivityWidget',
  displayName: 'Haksan Saha',
  bundleIdentifier: '.liveactivity',
  // ActivityContent / Activity.request(content:) iOS 16.2 ister.
  deploymentTarget: '16.2',
  frameworks: ['SwiftUI', 'WidgetKit', 'ActivityKit'],
});
