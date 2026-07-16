import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const files = execFileSync(
  'git',
  ['ls-files', '-co', '--exclude-standard', '-z'],
  { cwd: root, encoding: 'buffer' },
)
  .toString('utf8')
  .split('\0')
  .filter(Boolean);

const patterns = [
  { label: 'private key', expression: /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/ },
  { label: 'AWS access key', expression: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/ },
  { label: 'GitHub token', expression: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/ },
  { label: 'Slack token', expression: /\bxox(?:b|p|a|r|s)-[A-Za-z0-9-]{20,}\b/ },
  { label: 'Stripe secret key', expression: /\bsk_(?:live|test)_[A-Za-z0-9]{20,}\b/ },
  { label: 'OpenAI API key', expression: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/ },
];

const findings = [];
for (const path of files) {
  const absolute = resolve(root, path);
  let contents;
  try {
    contents = readFileSync(absolute, 'utf8');
  } catch {
    continue;
  }
  if (contents.includes('\u0000') || contents.length > 1_500_000) continue;

  const lines = contents.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    for (const pattern of patterns) {
      if (pattern.expression.test(lines[index])) {
        findings.push(`${path}:${index + 1} possible ${pattern.label}`);
      }
    }
  }
}

if (findings.length > 0) {
  console.error('Potential committed credentials detected:');
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

console.log(`Credential scan passed for ${files.length} repository files.`);
