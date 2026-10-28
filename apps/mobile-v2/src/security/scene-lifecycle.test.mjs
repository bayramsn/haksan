import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { applySceneDelegate } = require('../../plugins/with-ios-scene-delegate.js');
const template = `import Expo
import React
public class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?
  var reactNativeFactory: RCTReactNativeFactory?
  func launch(launchOptions: [UIApplication.LaunchOptionsKey: Any]?) {
#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif
  }
  // Linking API
}
`;
test('scene migration creates the RN window from UIWindowScene and retains the Expo alias', () => {
  const result = applySceneDelegate(template);
  const debug = result.match(/#if DEBUG([\s\S]*?)#else\s+sceneLaunchOptions = launchOptions\s+#endif/);
  assert.ok(debug, 'legacy startup is guarded by DEBUG');
  assert.ok(debug[1].includes('UIWindow(frame: UIScreen.main.bounds)'));
  assert.equal(debug[1].match(/factory\.startReactNative\(/g)?.length, 1);
  const release = result.replace(debug[0], 'sceneLaunchOptions = launchOptions');
  assert.ok(!release.includes('UIWindow(frame: UIScreen.main.bounds)'));
  assert.equal(release.match(/factory\.startReactNative\(/g)?.length, 1);
  assert.ok(result.includes('UIWindow(windowScene: windowScene)'));
  assert.ok(result.includes('appDelegate.window = sceneWindow'));
  assert.ok(result.includes('sceneLaunchOptions = launchOptions'));
});
test('scene migration retains cold/warm links, notifications and lifecycle forwarding', () => {
  const result = applySceneDelegate(template);
  for (const fragment of ['launchOptions[.url]', 'launchOptions[.remoteNotification]', 'openURLContexts', 'sceneContinueActivity', 'applicationDidBecomeActive', 'applicationDidEnterBackground']) assert.ok(result.includes(fragment), fragment);
});
test('scene migration is idempotent and fails on an unexpected upstream template', () => {
  const result = applySceneDelegate(template);
  assert.equal(applySceneDelegate(result), result);
  assert.throws(() => applySceneDelegate('unexpected'), /expected SDK 54/);
});

test('debug scenes attach the dev launcher window without starting a second React instance', () => {
  const result = applySceneDelegate(template);
  const reuse = result.match(/if let existingWindow = appDelegate.window \{([\s\S]*?)\n    \}/);
  assert.ok(reuse);
  assert.ok(reuse[1].includes('existingWindow.windowScene = windowScene'));
  assert.ok(reuse[1].includes('window = existingWindow'));
  assert.ok(reuse[1].includes('return'));
  assert.ok(!reuse[1].includes('startReactNative'));
});
