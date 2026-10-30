import { spawnSync } from 'node:child_process';

export function releaseAssetErrors(buffer, expectedDimensions) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (buffer.length < 33 || !buffer.subarray(0, 8).equals(signature) || buffer.readUInt32BE(8) !== 13 || buffer.subarray(12, 16).toString('ascii') !== 'IHDR') return ['must be a valid PNG with an IHDR header'];
  const width = buffer.readUInt32BE(16), height = buffer.readUInt32BE(20);
  if (!width || !height) return ['PNG dimensions must be positive'];
  if (expectedDimensions && (width !== expectedDimensions[0] || height !== expectedDimensions[1])) return [`must be a ${expectedDimensions[0]}x${expectedDimensions[1]} PNG`];
  return [];
}

/** This app deliberately uses an explicit runtime matching the native binary. */
export function runtimeVersionErrors(config) {
  const errors = [];
  if (typeof config.version !== 'string' || !config.version.trim()) errors.push('app version is required');
  for (const [platform, runtime] of [['app', config.runtimeVersion], ['ios', config.ios?.runtimeVersion], ['android', config.android?.runtimeVersion]]) {
    if (platform !== 'app' && runtime === undefined) continue;
    if (typeof runtime !== 'string' || runtime !== config.version) errors.push(`${platform} runtimeVersion must explicitly match app version (${config.version ?? 'missing'})`);
  }
  return errors;
}

/** Ask Git itself: /ios/ and ios/ are equivalent rules at this directory. */
export function nativeBoundaryErrors(repoRoot, run = spawnSync) {
  const errors = [];
  for (const platform of ['ios', 'android']) {
    const ignored = run('git', ['check-ignore', '--quiet', '--no-index', '--', `apps/mobile-v2/${platform}/.release-boundary-probe`], { cwd: repoRoot, encoding: 'utf8' });
    if (ignored.status !== 0) errors.push(`CNG requires apps/mobile-v2/${platform}/ contents to stay ignored`);
  }
  const tracked = run('git', ['ls-files', '--', 'apps/mobile-v2/ios', 'apps/mobile-v2/android'], { cwd: repoRoot, encoding: 'utf8' });
  if (tracked.status !== 0) errors.push('could not verify the CNG tracked-native-files boundary');
  else if (tracked.stdout.trim()) errors.push('CNG release is blocked because generated ios/ or android/ files are tracked');
  return errors;
}
