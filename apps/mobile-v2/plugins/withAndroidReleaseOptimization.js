const fs = require('node:fs/promises');
const path = require('node:path');
const { AndroidConfig, withAppBuildGradle, withDangerousMod, withGradleProperties } = require('expo/config-plugins');

const headlessLoaderRule = '-keep class expo.modules.adapters.react.apploader.RNHeadlessAppLoader { public <init>(android.content.Context); }';
const kotlinReflectionRule = '-keep class kotlin.Metadata { *; }';

module.exports = function withAndroidReleaseOptimization(config) {
  config = withGradleProperties(config, (mod) => {
    mod.modResults = AndroidConfig.BuildProperties.updateAndroidBuildPropertiesFromConfig(
      mod,
      mod.modResults,
      [
        { propName: 'android.enableMinifyInReleaseBuilds', propValueGetter: () => 'true' },
        { propName: 'android.enableShrinkResourcesInReleaseBuilds', propValueGetter: () => 'true' },
        { propName: 'android.enableR8.fullMode', propValueGetter: () => 'true' },
      ],
    );
    return mod;
  });

  config = withAppBuildGradle(config, (mod) => {
    const current = 'getDefaultProguardFile("proguard-android.txt")';
    const optimized = 'getDefaultProguardFile("proguard-android-optimize.txt")';
    const { contents, language } = mod.modResults;
    if (language !== 'groovy' || (!contents.includes(current) && !contents.includes(optimized))) {
      throw new Error('Haksan Android release optimization: expected Expo ProGuard configuration was not found.');
    }
    mod.modResults.contents = contents.replace(current, optimized);
    return mod;
  });

  return withDangerousMod(config, ['android', async (mod) => {
    const filename = path.join(mod.modRequest.platformProjectRoot, 'app', 'proguard-rules.pro');
    const source = await fs.readFile(filename, 'utf8');
    const missingRules = [
      '# Expo loads the background task class by name and reflects on Kotlin records.',
      headlessLoaderRule,
      '-keep class expo.modules.ExpoModulesPackageList { public <init>(); public static java.util.List getPackageList(); public java.util.List getModulesList(); }',
      kotlinReflectionRule,
      '-keep class kotlin.reflect.** { *; }',
      '-keep class kotlin.jvm.internal.** { *; }',
      '-keep class expo.modules.kotlin.records.** { *; }',
      '-keepattributes Signature,InnerClasses,EnclosingMethod,RuntimeVisibleAnnotations,RuntimeInvisibleAnnotations,AnnotationDefault',
    ].filter((rule) => !source.includes(rule));
    if (missingRules.length) {
      await fs.appendFile(filename, `\n${missingRules.join('\n')}\n`);
    }
    return mod;
  }]);
};
