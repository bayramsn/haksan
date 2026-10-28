const { withAppDelegate, withInfoPlist } = require('expo/config-plugins');

const MARKER = '// haksan: scene lifecycle';
const LEGACY_START = /#if os\(iOS\) \|\| os\(tvOS\)\s+window = UIWindow\(frame: UIScreen\.main\.bounds\)[\s\S]*?factory\.startReactNative\([\s\S]*?launchOptions: launchOptions\)\s*#endif/;

// SDK 54 has no ExpoAppSceneDelegate. Keep the adapter in AppDelegate.swift so
// clean prebuild/EAS includes it without adding a second Xcode source reference.
const SCENE_DELEGATE = `

${MARKER}
// UIKit 27 requires UIScene when linked with the iOS 27 SDK. The React factory
// remains owned by ExpoAppDelegate; only window creation moves to the scene.
class HaksanSceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  private var appDelegate: AppDelegate? {
    UIApplication.shared.delegate as? AppDelegate
  }

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene,
      let appDelegate = appDelegate,
      let factory = appDelegate.reactNativeFactory else { return }

    if let existingWindow = appDelegate.window {
      existingWindow.windowScene = windowScene
      window = existingWindow
      existingWindow.makeKeyAndVisible()
      return
    }

    let sceneWindow = UIWindow(windowScene: windowScene)
    window = sceneWindow
    // expo-updates SDK 54 looks up UIApplication.delegate.window when replacing
    // its deferred root view. Retain this alias as well as scene ownership.
    appDelegate.window = sceneWindow
    var launchOptions = appDelegate.sceneLaunchOptions ?? [:]
    if let context = connectionOptions.urlContexts.first {
      launchOptions[.url] = context.url
      if let source = context.options.sourceApplication {
        launchOptions[.sourceApplication] = source
      }
    }
    if let activity = connectionOptions.userActivities.first {
      launchOptions[.userActivityDictionary] = [
        "UIApplicationLaunchOptionsUserActivityTypeKey": activity.activityType,
        "UIApplicationLaunchOptionsUserActivityKey": activity
      ]
      // SDK 54 RN Linking reads this key for getInitialURL under both arches.
      if activity.activityType == NSUserActivityTypeBrowsingWeb, let url = activity.webpageURL {
        launchOptions[.url] = url
      }
    }
    if let response = connectionOptions.notificationResponse {
      launchOptions[.remoteNotification] = response.notification.request.content.userInfo
    }
    factory.startReactNative(withModuleName: "main", in: sceneWindow, launchOptions: launchOptions)
    appDelegate.sceneLaunchOptions = nil
    // Expo subscribers (e.g. dev launcher) also receive scene opening events.
    // React receives cold links through launchOptions, avoiding a second event.
    for context in connectionOptions.urlContexts {
      var options: [UIApplication.OpenURLOptionsKey: Any] = [.openInPlace: context.options.openInPlace]
      if let source = context.options.sourceApplication { options[.sourceApplication] = source }
      _ = appDelegate.sceneOpenURL(context.url, options: options)
    }
    for activity in connectionOptions.userActivities {
      appDelegate.sceneContinueActivity(activity)
    }
    if let shortcut = connectionOptions.shortcutItem {
      appDelegate.application(UIApplication.shared, performActionFor: shortcut, completionHandler: { _ in })
    }
  }

  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    guard let appDelegate = appDelegate else { return }
    for context in URLContexts {
      var options: [UIApplication.OpenURLOptionsKey: Any] = [.openInPlace: context.options.openInPlace]
      if let source = context.options.sourceApplication { options[.sourceApplication] = source }
      _ = appDelegate.application(UIApplication.shared, open: context.url, options: options)
    }
  }

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    _ = appDelegate?.application(UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
  }

  func scene(_ scene: UIScene, willContinueUserActivityWithType userActivityType: String) {
    _ = appDelegate?.application(UIApplication.shared, willContinueUserActivityWithType: userActivityType)
  }

  func scene(_ scene: UIScene, didUpdate userActivity: NSUserActivity) {
    appDelegate?.application(UIApplication.shared, didUpdate: userActivity)
  }

  func scene(_ scene: UIScene, didFailToContinueUserActivityWithType userActivityType: String, error: Error) {
    appDelegate?.application(UIApplication.shared, didFailToContinueUserActivityWithType: userActivityType, error: error)
  }

  func windowScene(_ windowScene: UIWindowScene, performActionFor shortcutItem: UIApplicationShortcutItem, completionHandler: @escaping (Bool) -> Void) {
    guard let appDelegate = appDelegate else { completionHandler(false); return }
    appDelegate.application(UIApplication.shared, performActionFor: shortcutItem, completionHandler: completionHandler)
  }

  // UIKit no longer calls these app delegate methods after scene adoption.
  // Forward to ExpoAppDelegate so its subscriber API remains compatible.
  func sceneDidBecomeActive(_ scene: UIScene) { appDelegate?.applicationDidBecomeActive(UIApplication.shared) }
  func sceneWillResignActive(_ scene: UIScene) { appDelegate?.applicationWillResignActive(UIApplication.shared) }
  func sceneDidEnterBackground(_ scene: UIScene) { appDelegate?.applicationDidEnterBackground(UIApplication.shared) }
  func sceneWillEnterForeground(_ scene: UIScene) { appDelegate?.applicationWillEnterForeground(UIApplication.shared) }
}
`;

const APP_HELPERS = `
  // Scene cold links notify Expo subscribers without sending a duplicate RN URL.
  func sceneOpenURL(_ url: URL, options: [UIApplication.OpenURLOptionsKey: Any]) -> Bool {
    return super.application(UIApplication.shared, open: url, options: options)
  }

  func sceneContinueActivity(_ activity: NSUserActivity) {
    _ = super.application(UIApplication.shared, continue: activity, restorationHandler: { _ in })
  }

`;

function applySceneDelegate(source) {
  if (source.includes(MARKER)) return source;
  if (!LEGACY_START.test(source) || !source.includes('public class AppDelegate: ExpoAppDelegate {')) {
    throw new Error('with-ios-scene-delegate: expected SDK 54 Swift AppDelegate startup was not found; review the scene migration before building.');
  }
  let result = source.replace('import Expo', 'import UIKit\nimport Expo');
  result = result.replace('  var window: UIWindow?', '  var window: UIWindow?\n  var sceneLaunchOptions: [UIApplication.LaunchOptionsKey: Any]?');
  result = result.replace(LEGACY_START, legacy => `#if DEBUG
    // SDK 54 dev launcher requires a prepared window in didFinishLaunching.
${legacy}
#else
    sceneLaunchOptions = launchOptions
#endif`);
  result = result.replace('  // Linking API', `${APP_HELPERS}  // Linking API`);
  return result + SCENE_DELEGATE;
}

module.exports = function withIosSceneDelegate(config) {
  config = withInfoPlist(config, cfg => {
    cfg.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [{
          UISceneConfigurationName: 'Default Configuration',
          UISceneClassName: 'UIWindowScene',
          UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).HaksanSceneDelegate',
        }],
      },
    };
    return cfg;
  });
  return withAppDelegate(config, cfg => {
    if (cfg.modResults.language !== 'swift') throw new Error('with-ios-scene-delegate requires a Swift AppDelegate.');
    cfg.modResults.contents = applySceneDelegate(cfg.modResults.contents);
    return cfg;
  });
};
module.exports.applySceneDelegate = applySceneDelegate;
