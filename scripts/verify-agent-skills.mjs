import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const lockPath = join(root, 'skills-lock.json');
const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
const bannedPatterns = [
  /\bwebfetch\b/i,
  /\b(?:npx\s+)?skills\s+(?:get|add)\b/i,
  /raw\.githubusercontent\.com/i,
  /refs\/heads\/main/i,
  /\b(?:curl|wget)\b[^\n]*\bskill/i,
];

function sha256(contents) {
  return createHash('sha256').update(contents).digest('hex');
}

function findSkillFiles(directory) {
  const absolute = join(root, directory);
  if (!existsSync(absolute)) return [];

  const files = [];
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    const path = join(absolute, entry.name);
    if (entry.isDirectory()) files.push(...findSkillFiles(relative(root, path)));
    if (entry.isFile() && entry.name === 'SKILL.md') files.push(path);
  }
  return files;
}

if (lock.version !== 2 || !lock.skills || typeof lock.skills !== 'object') {
  throw new Error('skills-lock.json must use version 2 with a skills object.');
}

const expectedPaths = new Set();
const failures = [];
for (const [name, entry] of Object.entries(lock.skills)) {
  if (!entry.path || !entry.sha256 || entry.sourceType !== 'local-snapshot') {
    failures.push(`${name}: missing local-snapshot path or SHA-256 pin`);
    continue;
  }

  const absolute = resolve(root, entry.path);
  if (!absolute.startsWith(`${root}/`) || !existsSync(absolute)) {
    failures.push(`${name}: missing skill file ${entry.path}`);
    continue;
  }

  expectedPaths.add(absolute);
  const contents = readFileSync(absolute, 'utf8');
  if (sha256(contents) !== entry.sha256) {
    failures.push(`${name}: checksum mismatch for ${entry.path}`);
  }
}

for (const file of [...findSkillFiles('.agents/skills'), ...findSkillFiles('.claude/skills')]) {
  const contents = readFileSync(file, 'utf8');
  if (!expectedPaths.has(file)) {
    failures.push(`unlocked skill: ${relative(root, file)}`);
  }
  for (const pattern of bannedPatterns) {
    if (pattern.test(contents)) {
      failures.push(`dynamic remote skill instruction: ${relative(root, file)} (${pattern})`);
      break;
    }
  }
}

if (failures.length > 0) {
  console.error('Agent skill verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Verified ${Object.keys(lock.skills).length} pinned agent skills.`);
