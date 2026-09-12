import { describe, expect, it } from 'vitest';
import { findMigrationLintRules, migrationLintWaivers } from '../src/db/migration-lint-rules';

const DROP = 'ALTER TABLE "product_models" DROP COLUMN IF EXISTS "production_year";';

describe('migration lint muafiyeti', () => {
  it('gerekçesiz muafiyeti kabul etmez', () => {
    const raw = `-- migration-lint: allow drop-column — kısa\n${DROP}`;
    expect(migrationLintWaivers(raw).size).toBe(0);
    expect(findMigrationLintRules(raw).map((r) => r.id)).toContain('drop-column');
  });

  it('gerekçeli muafiyette yalnız o kuralı susturur', () => {
    const raw = `-- migration-lint: allow drop-column — yazan kod önceki sürümde canlıya alındı\n${DROP}\nCREATE UNIQUE INDEX x ON y (z);`;
    expect([...migrationLintWaivers(raw)]).toEqual(['drop-column']);
    const ids = findMigrationLintRules(raw).map((r) => r.id);
    expect(ids).not.toContain('drop-column');
    // Muafiyet tek kurala özel: aynı dosyadaki diğer bulgular düşmez.
    expect(ids).toContain('create-unique-index');
  });

  it('muafiyet yokken DROP COLUMN yakalanır', () => {
    expect(findMigrationLintRules(DROP).map((r) => r.id)).toContain('drop-column');
  });
});
