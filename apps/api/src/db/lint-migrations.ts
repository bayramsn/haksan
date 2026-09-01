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


/**
 * Journal bütünlüğü. Drizzle bir migration'ı YALNIZCA `when` değeri
 * veritabanındaki en büyük `created_at`'ten büyükse çalıştırır
 * (drizzle-orm/pg-core dialect.migrate). Dolayısıyla:
 *
 *  - `when` değeri geriye giden bir kayıt üretilirse migration HİÇ çalışmaz ve
 *    hata da vermez; şema sessizce eksik kalır. Bu depoda `when` değerleri elle
 *    ve gerçek saatin ilerisinde ilerlediği için, `drizzle-kit`in ürettiği
 *    `Date.now()` damgası küçük kalır — klasik tuzak budur.
 *  - Journal kaydı ile .sql dosyası birebir eşleşmezse migrate açılışta patlar.
 */
function checkJournal(): number {
  const journalPath = join(MIGRATIONS_DIR, 'meta', '_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as {
    entries: Array<{ idx: number; tag: string; when: number }>;
  };
  let failures = 0;

  // Finder'ın ürettiği " 2.sql" kopyaları depoda değil (.gitignore), sayılmaz.
  const isDuplicateCopy = (name: string) => / \d+\.sql$/.test(name);
  const files = new Set(
    readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql') && !isDuplicateCopy(f))
      .map((f) => f.slice(0, -4))
  );
  for (const entry of journal.entries) {
    if (!files.has(entry.tag)) {
      console.log(`[ERROR] _journal.json :: missing-file — "${entry.tag}.sql" yok; migrate açılışta patlar.`);
      failures++;
    }
  }
  const tagged = new Set(journal.entries.map((entry) => entry.tag));
  for (const file of files) {
    if (!tagged.has(file)) {
      console.log(`[ERROR] ${file}.sql :: not-in-journal — journal'da kaydı yok; migration hiç çalışmaz.`);
      failures++;
    }
  }

  let previous = journal.entries[0];
  for (const entry of journal.entries.slice(1)) {
    if (entry.when <= previous.when) {
      console.log(
        `[ERROR] _journal.json :: when-not-increasing — "${entry.tag}" (${entry.when}) ` +
          `"${previous.tag}" (${previous.when}) değerinden büyük değil; production'da SESSİZCE atlanır. ` +
          'Yeni kayıtta bir öncekinin `when` değerine 86400000 ekleyin.'
      );
      failures++;
    }
    previous = entry;
  }

  return failures;
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

  errors += checkJournal();

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
