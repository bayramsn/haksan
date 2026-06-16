/**
 * Migration safety linter.
 *
 * Scans Drizzle migration SQL files for patterns that are risky on a live ERP
 * database and flags them before they reach production. Applied migrations are
 * immutable (their hash is stored in drizzle.__drizzle_migrations), so the
 * linter only ENFORCES on migrations newer than BASELINE_IDX; older files are
 * grandfathered and reported as advisory context only.
 *
 * Usage:
 *   npm run db:lint:migrations            # enforce on new migrations
 *   BASELINE_IDX=25 npm run db:lint:migrations
 *   STRICT=1 npm run db:lint:migrations   # treat all findings as errors
 *
 * Exit code 1 when an enforced migration has a high-severity finding (or any
 * finding under STRICT=1), 0 otherwise.
 */
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const MIGRATIONS_DIR = join(__dirname, 'migrations');
// Highest migration index that is already applied in production. New migrations
// (idx > BASELINE_IDX) must pass the safety rules.
const BASELINE_IDX = Number(process.env.BASELINE_IDX ?? '25');
const STRICT = process.env.STRICT === '1';

type Severity = 'high' | 'warn';
interface Rule {
  id: string;
  severity: Severity;
  test: (sql: string) => boolean;
  hint: string;
}

// SQL is normalized to upper-case, comments stripped, before testing.
const RULES: Rule[] = [
  {
    id: 'drop-column',
    severity: 'high',
    test: (s) => /\bDROP\s+COLUMN\b/.test(s),
    hint: 'DROP COLUMN must ship in a separate, post-deploy release (expand-contract). Stop writing to the column first.',
  },
  {
    id: 'drop-table',
    severity: 'high',
    test: (s) => /\bDROP\s+TABLE\b/.test(s),
    hint: 'DROP TABLE is destructive. Confirm no code/tenant depends on it and that a backup exists.',
  },
  {
    id: 'index-not-concurrent',
    severity: 'warn',
    test: (s) => /\bCREATE\s+(?:UNIQUE\s+)?INDEX\b/.test(s) && !/\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+CONCURRENTLY\b/.test(s),
    hint: 'On large tables use CREATE INDEX CONCURRENTLY (outside a transaction) to avoid long write locks.',
  },
  {
    id: 'add-column-no-if-not-exists',
    severity: 'warn',
    test: (s) => /\bADD\s+COLUMN\b/.test(s) && !/\bADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\b/.test(s),
    hint: 'Use ADD COLUMN IF NOT EXISTS so a partially-applied/retried migration is idempotent.',
  },
  {
    id: 'set-not-null',
    severity: 'warn',
    test: (s) => /\bSET\s+NOT\s+NULL\b/.test(s),
    hint: 'SET NOT NULL requires a full backfill first. Prefer: add nullable column, backfill, then SET NOT NULL in a later migration.',
  },
  {
    id: 'add-unique-constraint',
    severity: 'warn',
    test: (s) => /\bADD\s+CONSTRAINT\b[\s\S]*?\bUNIQUE\b/.test(s),
    hint: 'A UNIQUE constraint fails the deploy if duplicates already exist. Verify/clean duplicates before shipping.',
  },
];

function stripSql(raw: string): string {
  return raw
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

function indexOfFile(file: string): number {
  const m = /^(\d+)_/.exec(file);
  return m ? Number(m[1]) : -1;
}

function main(): void {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let errors = 0;
  let warnings = 0;
  const enforced: string[] = [];

  for (const file of files) {
    const idx = indexOfFile(file);
    const enforce = idx > BASELINE_IDX;
    if (!enforce) continue;
    enforced.push(file);

    const sql = stripSql(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
    for (const rule of RULES) {
      if (!rule.test(sql)) continue;
      const isError = rule.severity === 'high' || STRICT;
      if (isError) errors++;
      else warnings++;
      const label = isError ? 'ERROR' : 'WARN ';
      console.log(`[${label}] ${file} :: ${rule.id} — ${rule.hint}`);
    }
  }

  if (enforced.length === 0) {
    console.log(`[migration-lint] no migrations newer than baseline ${BASELINE_IDX}; nothing to enforce.`);
  } else {
    console.log(
      `[migration-lint] checked ${enforced.length} migration(s) > ${BASELINE_IDX}: ${errors} error(s), ${warnings} warning(s).`
    );
  }

  if (errors > 0) process.exit(1);
}

main();
