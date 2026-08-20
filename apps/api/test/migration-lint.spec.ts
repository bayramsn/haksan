import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { findMigrationLintRules, splitSqlStatements } from '../src/db/migration-lint-rules';

function findingIds(sql: string): string[] {
  return findMigrationLintRules(sql).map((rule) => rule.id);
}

describe('migration safety lint rules', () => {
  it('splits Drizzle statements before removing breakpoint comments', () => {
    const statements = splitSqlStatements(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS title text;--> statement-breakpoint
      CREATE INDEX users_title_idx ON users (title);
    `);

    expect(statements).toEqual([
      'ALTER TABLE USERS ADD COLUMN IF NOT EXISTS TITLE TEXT;',
      'CREATE INDEX USERS_TITLE_IDX ON USERS (TITLE);',
    ]);
  });

  it('does not treat a foreign key followed by a unique index as a unique constraint', () => {
    const ids = findingIds(`
      ALTER TABLE users ADD CONSTRAINT users_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES tenants(id);--> statement-breakpoint
      CREATE UNIQUE INDEX users_tenant_email_unique ON users (tenant_id, email);
    `);

    expect(ids).toContain('index-not-concurrent');
    expect(ids).toContain('create-unique-index');
    expect(ids).not.toContain('add-unique-constraint');
  });

  it('does not treat a check constraint followed by a unique index as a unique constraint', () => {
    const ids = findingIds(`
      ALTER TABLE opportunities ADD CONSTRAINT qualification_stage_check
        CHECK (qualification_stage IN ('LEAD', 'WIN'));--> statement-breakpoint
      CREATE UNIQUE INDEX opportunity_approval_unique ON opportunity_approvals (opportunity_id, approval_type);
    `);

    expect(ids).toContain('create-unique-index');
    expect(ids).not.toContain('add-unique-constraint');
  });

  it('reports an actual unique constraint when UNIQUE is in the same statement', () => {
    expect(
      findingIds('ALTER TABLE users ADD CONSTRAINT users_tenant_email_unique UNIQUE (tenant_id, email);')
    ).toContain('add-unique-constraint');
  });

  it('keeps duplicate preflight warnings for concurrent unique indexes', () => {
    const ids = findingIds(
      'CREATE UNIQUE INDEX CONCURRENTLY users_tenant_email_unique ON users (tenant_id, email);'
    );

    expect(ids).toContain('create-unique-index');
    expect(ids).not.toContain('index-not-concurrent');
  });

  it('detects a non-concurrent index when another statement is concurrent', () => {
    const ids = findingIds(`
      CREATE INDEX CONCURRENTLY users_email_idx ON users (email);--> statement-breakpoint
      CREATE INDEX users_title_idx ON users (title);
    `);

    expect(ids).toContain('index-not-concurrent');
  });

  it('ignores risky keywords that only occur in comments', () => {
    const sql = `
      -- DROP TABLE users;
      /* CREATE UNIQUE INDEX users_email_idx ON users (email); */
      SELECT 1;
    `;

    expect(findingIds(sql)).toEqual([]);
  });

  it.each([
    '0058_user_access_scopes_single_system.sql',
    '0064_assistant_unified_inbox.sql',
    '0067_product_taxonomy_links.sql',
    '0087_opportunity_qualification_pipeline.sql',
    '0111_competitor_company_sync.sql',
  ])('classifies the real %s unique index without the former false positive', (file) => {
    const sql = readFileSync(join(process.cwd(), 'src/db/migrations', file), 'utf8');
    const ids = findingIds(sql);

    expect(ids).toContain('create-unique-index');
    expect(ids).not.toContain('add-unique-constraint');
  });
});
