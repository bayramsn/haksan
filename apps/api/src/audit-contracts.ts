/**
 * API contract audit (read-only).
 *
 * Scans every `*.controller.ts` under `src/modules` for `@Body()` / `@Query()`
 * parameters that are NOT validated by a `ZodValidationPipe`. Request bodies and
 * query strings are untrusted input; on an ERP an unvalidated payload reaching a
 * service/Drizzle call is a correctness and security risk. This is the mechanical
 * counterpart to the "every write endpoint has a shared zod schema" convention.
 *
 * It never edits files. It prints findings and exits non-zero when any exist, so
 * it can run as a CI gate.
 *
 * Skipped (not findings):
 *   - Property extraction like `@Body('id')` / `@Query('q')` — a primitive, not
 *     a full body/query object.
 *   - Raw binary bodies typed as `Buffer` (e.g. the file-content upload endpoint)
 *     — these are raw bytes, not a JSON object a Zod schema could validate; they
 *     are checked downstream by magic-byte content validation.
 *
 * Usage:
 *   npm run audit:contracts
 */
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const MODULES_DIR = join(__dirname, 'modules');

interface Finding {
  file: string;
  line: number;
  decorator: 'Body' | 'Query';
  snippet: string;
}

/** Walk forward from the decorator's `(` and return the balanced argument text + close index. */
function extractArgs(src: string, openIdx: number): { args: string; end: number } {
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    const ch = src[i];
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return { args: src.slice(openIdx + 1, i), end: i };
    }
  }
  return { args: src.slice(openIdx + 1), end: src.length };
}

function lineOf(src: string, idx: number): number {
  let line = 1;
  for (let i = 0; i < idx && i < src.length; i++) if (src[i] === '\n') line++;
  return line;
}

function controllerFiles(): string[] {
  return readdirSync(MODULES_DIR, { recursive: true })
    .map((p) => String(p))
    .filter((p) => p.endsWith('.controller.ts'))
    .map((p) => join(MODULES_DIR, p))
    .sort();
}

function auditFile(file: string): Finding[] {
  const content = readFileSync(file, 'utf8');
  const findings: Finding[] = [];
  const re = /@(Body|Query)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const decorator = m[1] as 'Body' | 'Query';
    const openIdx = m.index + m[0].length - 1; // index of '('
    const { args, end } = extractArgs(content, openIdx);
    const inner = args.trim();
    if (inner.includes('ZodValidationPipe')) continue; // validated
    if (/^['"]/.test(inner)) continue; // single-property extraction, primitive
    // Raw binary bodies (e.g. `@Body() body: Buffer` on the file-content upload)
    // are raw bytes, not a Zod-validatable object; validated downstream by
    // magic-byte content checks. Exempt them.
    if (decorator === 'Body' && inner === '' && /^\s*\w+\s*:\s*Buffer\b/.test(content.slice(end + 1, end + 80))) continue;
    findings.push({
      file,
      line: lineOf(content, m.index),
      decorator,
      snippet: `@${decorator}(${inner})`,
    });
  }
  return findings;
}

function main(): void {
  const files = controllerFiles();
  const findings = files.flatMap(auditFile);

  for (const f of findings) {
    const rel = f.file.slice(f.file.indexOf('src/'));
    console.log(`[ERROR] ${rel}:${f.line} :: unvalidated @${f.decorator} — add new ZodValidationPipe(<shared schema>)`);
  }

  console.log(
    `[contract-audit] scanned ${files.length} controller(s): ${findings.length} unvalidated @Body/@Query parameter(s).`
  );

  if (findings.length > 0) process.exit(1);
}

main();
