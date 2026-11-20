// Temporary fail-closed mitigation for GHSA-fc5q-39xc-vjpf.
// No published picomatch release fixes this advisory as of 2026-11-18.
// Retain ordinary globs, but reject complex repeated extglob bodies before
// they can become a backtracking regular expression. Do not suppress audit.
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../../..');
const rootReal = fs.realpathSync(root);
const visitedModules = new Set();
const directories = new Set();

// npm install can run a workspace lifecycle before it writes package-lock.json.
// Discover only package boundaries, never arbitrary source/build directories.
function scanNodeModules(modulesDirectory) {
  if (!fs.existsSync(modulesDirectory)) return;
  const real = fs.realpathSync(modulesDirectory);
  if (!real.startsWith(rootReal + path.sep) || visitedModules.has(real)) return;
  visitedModules.add(real);
  for (const entry of fs.readdirSync(modulesDirectory, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const filename = path.join(modulesDirectory, entry.name);
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
  const manifest = path.join(directory, 'package.json');
  if (path.basename(directory) === 'picomatch' && fs.existsSync(manifest)) directories.add(real);
  scanNodeModules(path.join(directory, 'node_modules'));
}

scanNodeModules(path.join(root, 'node_modules'));
for (const group of ['apps', 'packages']) {
  const folder = path.join(root, group);
  if (!fs.existsSync(folder)) continue;
  for (const workspace of fs.readdirSync(folder, { withFileTypes: true })) {
    if (workspace.isDirectory()) scanNodeModules(path.join(folder, workspace.name, 'node_modules'));
  }
}
const marker = '// HAKSAN: reject ambiguous repeated extglobs (GHSA-fc5q-39xc-vjpf).';
const original = '    const analysis = analyzeRepeatedExtglob(body, opts);';
const guarded = `    ${marker}
    if ((token.type === 'plus' || token.type === 'star') &&
        (body.length === 0 || body.includes('|') || !isPlainBranch(body))) {
      throw new SyntaxError('HAKSAN: complex repeated extglobs are disabled for GHSA-fc5q-39xc-vjpf');
    }
${original}`;

let count = 0;
for (const directory of directories) {
  const relative = path.relative(root, directory);
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
  if (manifest.name !== 'picomatch' || !['2.3.2', '4.0.7'].includes(manifest.version)) {
    throw new Error(`Review picomatch security mitigation for ${relative}@${manifest.version}`);
  }
  const filename = path.join(directory, 'lib/parse.js');
  const source = fs.readFileSync(filename, 'utf8');
  if (!source.includes('const isPlainBranch = branch => {')) {
    throw new Error(`picomatch parser changed; review mitigation: ${relative}`);
  }
  if (source.includes(marker)) {
    if (!source.includes(guarded)) throw new Error(`picomatch mitigation differs: ${relative}`);
  } else {
    if (source.split(original).length !== 2) {
      throw new Error(`Expected picomatch extglob analysis was not found exactly once: ${relative}`);
    }
    fs.writeFileSync(filename, source.replace(original, guarded));
  }
  count++;
}
if (!count) throw new Error('No installed picomatch copy found; review security mitigation');
console.log(`Applied picomatch repeated-extglob mitigation to ${count} installed copies`);
