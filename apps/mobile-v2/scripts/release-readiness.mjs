import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { isIP } from 'node:net';
import { dirname, resolve, sep } from 'node:path';
import { runtimeVersionErrors, nativeBoundaryErrors, releaseAssetErrors } from './lib/release-config.mjs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { getConfig } = require('@expo/config');
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(projectRoot, '../..');
const storeRoot = resolve(projectRoot, 'store');
const errors = [];

const placeholderHashes = new Map([
  ['assets/icon.png', '3fdd7af5415553cbbea47f47fbd0e8d6e0bc003a06760bd0fbd4bc728e57824b'],
  ['assets/adaptive-icon.png', '9b4712ed6694f4f499dbd221232eee8f76fc48bf433848872f16b6d958b481b2'],
  ['assets/splash-icon.png', 'e97ff4b0ed946cc5007d69292765299295d8507c405cc6c70f0c371d19ddadd9'],
  ['assets/notification-icon.png', 'fb92c1ab15770f27cab986e2d3cce15d9bbcc8b19646363f47c70dfd3f0a78ff'],
]);

const expectedPngDimensions = new Map([
  ['assets/icon.png', [1024, 1024]],
  ['assets/adaptive-icon.png', [1024, 1024]],
  // Expo scales this source using imageWidth/resizeMode; square pixels are not mandatory.
  ['assets/splash-icon.png', null],
  ['assets/notification-icon.png', [96, 96]],
]);

function fail(message) {
  errors.push(message);
}

function readJson(relativePath) {
  try {
    return JSON.parse(readFileSync(resolve(projectRoot, relativePath), 'utf8'));
  } catch (error) {
    fail(`${relativePath} is missing or invalid JSON (${error.message})`);
    return {};
  }
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function isPrivateOrReservedHost(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.test') ||
    host.endsWith('.invalid') ||
    host === 'example.com' ||
    host.endsWith('.example.com')
  ) return true;

  if (isIP(host) === 4) {
    const [a, b] = host.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  if (isIP(host) === 6) return host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe8') || host.startsWith('fe9') || host.startsWith('fea') || host.startsWith('feb');
  return false;
}

function requireHttpsUrl(name) {
  const raw = process.env[name]?.trim();
  if (!raw) {
    fail(`${name} is required in the EAS production environment`);
    return null;
  }
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') fail(`${name} must use HTTPS`);
    if (url.username || url.password) fail(`${name} must not embed credentials`);
    if (isPrivateOrReservedHost(url.hostname)) fail(`${name} must use a public production host`);
    return url;
  } catch {
    fail(`${name} must be a valid absolute URL`);
    return null;
  }
}

function requireBoolean(value, label) {
  if (value !== true) fail(`${label} must be explicitly approved (true)`);
}

function verifyStoreScreenshots(paths, label, minimum) {
  if (!Array.isArray(paths) || paths.length < minimum) {
    fail(`${label} requires at least ${minimum} reviewed screenshots`);
    return;
  }
  for (const relativePath of paths) {
    if (typeof relativePath !== 'string' || !relativePath.trim()) {
      fail(`${label} contains an invalid screenshot path`);
      continue;
    }
    const absolutePath = resolve(storeRoot, relativePath);
    if (!absolutePath.startsWith(`${storeRoot}${sep}`)) {
      fail(`${label} screenshot paths must stay inside store/`);
      continue;
    }
    if (!existsSync(absolutePath) || statSync(absolutePath).size < 10_000) {
      fail(`${label} screenshot is missing or too small: ${relativePath}`);
    }
  }
}

function verifyCngBoundary() {
  nativeBoundaryErrors(repoRoot).forEach(fail);
}

function verifyAssets() {
  for (const [relativePath, dimensions] of expectedPngDimensions) {
    const absolutePath = resolve(projectRoot, relativePath);
    if (!existsSync(absolutePath)) {
      fail(`required release asset is missing: ${relativePath}`);
      continue;
    }
    releaseAssetErrors(readFileSync(absolutePath), dimensions).forEach(error => fail(`${relativePath} ${error}`));
    if (sha256(absolutePath) === placeholderHashes.get(relativePath)) {
      fail(`${relativePath} is still the generated placeholder asset`);
    }
  }
}

function main() {
  const packageJson = readJson('package.json');
  const eas = readJson('eas.json');
  const manifest = readJson('store/release-manifest.json');
  // Manifest/config doğrulaması package kurulumu olmadan da tüm eksikleri tek
  // raporda gösterebilsin; config plugin çözümlemesini Expo Doctor/prebuild yapar.
  const { exp } = getConfig(projectRoot, { skipSDKVersionRequirement: false, skipPlugins: true });

  const apiUrl = requireHttpsUrl('EXPO_PUBLIC_API_URL');
  const privacyUrl = requireHttpsUrl('MOBILE_PRIVACY_POLICY_URL');
  const supportUrl = requireHttpsUrl('MOBILE_SUPPORT_URL');
  const marketingUrl = requireHttpsUrl('MOBILE_MARKETING_URL');
  void apiUrl;
  void privacyUrl;
  void supportUrl;
  void marketingUrl;

  const appLinkHost = process.env.EXPO_PUBLIC_APP_LINK_HOST?.trim();
  if (!appLinkHost || appLinkHost.includes('://') || isPrivateOrReservedHost(appLinkHost)) {
    fail('EXPO_PUBLIC_APP_LINK_HOST must be a public production hostname without a scheme');
  }

  const projectId = process.env.EAS_PROJECT_ID?.trim();
  if (!projectId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(projectId)) {
    fail('EAS_PROJECT_ID must be a valid EAS project UUID');
  }

  const mapsKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
  if (!mapsKey || mapsKey.length < 20 || /example|replace|your[-_ ]?key/i.test(mapsKey)) {
    fail('EXPO_PUBLIC_GOOGLE_MAPS_API_KEY must be configured for the Android company map and restricted by package + signing SHA-1');
  }

  if (!process.env.MOBILE_LEGAL_ENTITY?.trim()) fail('MOBILE_LEGAL_ENTITY is required');
  runtimeVersionErrors(exp).forEach(fail);
  if (exp.updates?.enabled !== true) fail('OTA updates must be enabled for a configured production project');
  if (projectId && exp.updates?.url !== `https://u.expo.dev/${projectId}`) fail('OTA update URL must match EAS_PROJECT_ID');
  if (projectId && exp.extra?.eas?.projectId !== projectId) fail('extra.eas.projectId must match EAS_PROJECT_ID');
  if (appLinkHost && !exp.ios?.associatedDomains?.includes(`applinks:${appLinkHost}`)) fail('iOS associated domain is not configured');
  if (appLinkHost && !(exp.android?.intentFilters ?? []).some((filter) => filter.data?.some((data) => data.host === appLinkHost))) fail('Android verified app link is not configured');

  if (eas.cli?.appVersionSource !== 'remote' || eas.cli?.requireCommit !== true) fail('EAS CLI must require a commit and use remote app versions');
  if (eas.build?.production?.autoIncrement !== true || eas.build?.production?.channel !== 'production' || eas.build?.production?.environment !== 'production') fail('production build profile is not release-safe');
  if (eas.build?.production?.android?.buildType !== 'app-bundle') fail('production Android builds must use app-bundle');
  if (eas.submit?.production?.android?.track !== 'internal' || eas.submit?.production?.android?.releaseStatus !== 'draft') fail('Android submission must start on the internal track as a draft');

  for (const dependency of ['expo-doctor']) {
    if (!packageJson.devDependencies?.[dependency]) fail(`${dependency} must be pinned in mobile devDependencies`);
  }
  if (packageJson.devDependencies?.['eas-cli'] || packageJson.dependencies?.['eas-cli']) {
    fail('eas-cli must not be installed locally; eas.json pins the supported CLI range');
  }
  for (const dependency of ['expo-dev-client', 'expo-updates']) {
    if (!packageJson.dependencies?.[dependency]) fail(`${dependency} must be pinned in mobile runtime dependencies`);
  }

  verifyCngBoundary();
  verifyAssets();

  if (manifest.schemaVersion !== 1) fail('store/release-manifest.json schemaVersion must be 1');
  if (manifest.approvedAppVersion !== exp.version) fail('store manifest approvedAppVersion must match app version');
  requireBoolean(manifest.releaseReady, 'store manifest releaseReady');
  requireBoolean(manifest.approvals?.productOwner, 'product owner approval');
  requireBoolean(manifest.approvals?.security, 'security approval');
  requireBoolean(manifest.approvals?.privacy, 'privacy approval');
  requireBoolean(manifest.approvals?.brand, 'brand asset approval');
  requireBoolean(manifest.storeRecords?.ios, 'App Store Connect record');
  requireBoolean(manifest.storeRecords?.android, 'Google Play Console record');
  requireBoolean(manifest.declarations?.applePrivacy, 'Apple privacy labels');
  requireBoolean(manifest.declarations?.googleDataSafety, 'Google Play Data safety');
  requireBoolean(manifest.declarations?.contentRating, 'store content rating');
  requireBoolean(manifest.declarations?.exportCompliance, 'export compliance');
  requireBoolean(manifest.declarations?.reviewCredentialsConfiguredInStore, 'review credentials configured outside Git');
  requireBoolean(manifest.qa?.iosRealDevice, 'iOS real-device QA');
  requireBoolean(manifest.qa?.androidRealDevice, 'Android real-device QA');
  requireBoolean(manifest.qa?.maestroPreview, 'Maestro preview smoke QA');
  requireBoolean(manifest.qa?.accessibility, 'accessibility QA');
  verifyStoreScreenshots(manifest.screenshots?.iosPhone, 'iPhone', 3);
  if (exp.ios?.supportsTablet) verifyStoreScreenshots(manifest.screenshots?.iosTablet, 'iPad', 3);
  verifyStoreScreenshots(manifest.screenshots?.androidPhone, 'Android phone', 3);

  const releaseRef = process.env.MOBILE_RELEASE_REF?.trim();
  if (releaseRef?.startsWith('v') && releaseRef !== `v${exp.version}`) {
    fail('release tag must exactly match app version (v<version>)');
  }

  if (errors.length > 0) {
    console.error(`Mobile release is blocked by ${errors.length} readiness issue(s):`);
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Mobile ${exp.version} is release-ready; all fail-fast gates passed.`);
}

try {
  main();
} catch (error) {
  console.error(`Mobile release readiness check failed safely: ${error.message}`);
  process.exitCode = 1;
}
