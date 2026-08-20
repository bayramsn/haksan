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
import { findMigrationLintRules } from './migration-lint-rules';

const MIGRATIONS_DIR = join(__dirname, 'migrations');
// Highest migration index that is already applied in production. New migrations
// (idx > BASELINE_IDX) must pass the safety rules.
const BASELINE_IDX = Number(process.env.BASELINE_IDX ?? '57');
const STRICT = process.env.STRICT === '1';

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

    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    for (const rule of findMigrationLintRules(sql)) {
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
