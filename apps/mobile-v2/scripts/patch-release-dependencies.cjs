// Compatibility adapters for security-patched dependencies used by Expo/Metro.
// Discover installed package boundaries: npm lifecycle execution may precede
// package-lock.json creation. Never walk arbitrary source or build directories.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');
const rootReal = fs.realpathSync(root);
const visited = new Set();
const packages = new Set();

function scanNodeModules(directory) {
  if (!fs.existsSync(directory)) return;
  const real = fs.realpathSync(directory);
  if (!real.startsWith(rootReal + path.sep) || visited.has(real)) return;
  visited.add(real);
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const filename = path.join(directory, entry.name);
    if (entry.name.startsWith('@') && entry.isDirectory()) {
      for (const child of fs.readdirSync(filename, { withFileTypes: true })) {
        if (child.isDirectory() || child.isSymbolicLink()) scanPackage(path.join(filename, child.name));
      }
    } else if (entry.isDirectory() || entry.isSymbolicLink()) {
      scanPackage(filename);
    }
  }
}

function scanPackage(directory) {
  const real = fs.realpathSync(directory);
  if (!real.startsWith(rootReal + path.sep)) return;
  if (['query-string', 'metro'].includes(path.basename(directory)) &&
      fs.existsSync(path.join(directory, 'package.json'))) packages.add(real);
  scanNodeModules(path.join(directory, 'node_modules'));
}

function patchOnce(filename, before, after) {
  const source = fs.readFileSync(filename, 'utf8');
  if (source.includes(after)) return;
  if (source.split(before).length !== 2) {
    throw new Error(`Dependency source changed; review compatibility before building: ${filename}`);
  }
  fs.writeFileSync(filename, source.replace(before, after));
}

scanNodeModules(path.join(root, 'node_modules'));
for (const group of ['apps', 'packages']) {
  const folder = path.join(root, group);
  if (!fs.existsSync(folder)) continue;
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    if (entry.isDirectory()) scanNodeModules(path.join(folder, entry.name, 'node_modules'));
  }
}

let queryCount = 0;
let metroCount = 0;
for (const directory of packages) {
  const metadata = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
  if (metadata.name === 'query-string') {
    // 8+ uses ESM imports and already selects the decoder's default export.
    if (Number(metadata.version.split('.')[0]) >= 8) continue;
    if (metadata.version !== '7.1.3') {
      throw new Error(`Review decoder compatibility patch for query-string ${metadata.version}`);
    }
    patchOnce(path.join(directory, 'index.js'),
      "const decodeComponent = require('decode-uri-component');",
      "const uriDecoder = require('decode-uri-component');\nconst decodeComponent = uriDecoder.default ?? uriDecoder;");
    queryCount++;
  } else if (metadata.name === 'metro') {
    if (!['0.83.3', '0.84.4'].includes(metadata.version)) {
      throw new Error(`Review image-size compatibility patch for Metro ${metadata.version}`);
    }
    // image-size 2 removes its synchronous filename overload. Both installed
    // Metro versions still pass filenames here, so explicitly read the bytes.
    patchOnce(path.join(directory, 'src/Assets.js'),
      'const dimensions = isImage ? (0, _imageSize.default)(isImageInput) : null;',
      'const dimensions = isImage ? (0, _imageSize.default)(typeof isImageInput === "string" ? _fs.default.readFileSync(isImageInput) : isImageInput) : null;');
    metroCount++;
  }
}
if (!queryCount || !metroCount) {
  throw new Error('Expected query-string 7 and Metro dependencies were not found; review release compatibility');
}
console.log(`Applied release compatibility adapters to ${queryCount} query-string and ${metroCount} Metro copies`);
