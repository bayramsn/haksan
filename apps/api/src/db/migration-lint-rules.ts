export type MigrationLintSeverity = 'high' | 'warn';

export interface MigrationLintRule {
  id: string;
  severity: MigrationLintSeverity;
  test: (analysis: SqlAnalysis) => boolean;
  hint: string;
}

interface SqlAnalysis {
  sql: string;
  statements: string[];
}

const SQL_IDENTIFIER = String.raw`(?:"(?:[^"]|"")*"|[A-Z_][A-Z0-9_$]*)`;
const ADD_UNIQUE_CONSTRAINT = new RegExp(
  String.raw`\bADD\s+CONSTRAINT\s+${SQL_IDENTIFIER}\s+UNIQUE\b`
);

// Drizzle uses this marker to preserve statement boundaries in generated and
// custom SQL migrations. Split before removing comments so the marker remains
// available to statement-scoped safety rules.
export function splitSqlStatements(raw: string): string[] {
  return raw
    .split(/-->\s*statement-breakpoint[ \t]*(?:\r?\n|$)/gi)
    .map((statement) => stripSql(statement))
    .filter(Boolean);
}

export function stripSql(raw: string): string {
  return raw
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function analyzeSql(raw: string): SqlAnalysis {
  return {
    sql: stripSql(raw),
    statements: splitSqlStatements(raw),
  };
}

export const MIGRATION_LINT_RULES: MigrationLintRule[] = [
  {
    id: 'drop-column',
    severity: 'high',
    test: ({ sql }) => /\bDROP\s+COLUMN\b/.test(sql),
    hint: 'DROP COLUMN must ship in a separate, post-deploy release (expand-contract). Stop writing to the column first.',
  },
  {
    id: 'drop-table',
    severity: 'high',
    test: ({ sql }) => /\bDROP\s+TABLE\b/.test(sql),
    hint: 'DROP TABLE is destructive. Confirm no code/tenant depends on it and that a backup exists.',
  },
  {
    id: 'index-not-concurrent',
    severity: 'warn',
    test: ({ statements }) =>
      statements.some((statement) => /\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+(?!CONCURRENTLY\b)/.test(statement)),
    hint: 'On large tables use CREATE INDEX CONCURRENTLY (outside a transaction) to avoid long write locks.',
  },
  {
    id: 'add-column-no-if-not-exists',
    severity: 'warn',
    test: ({ statements }) =>
      statements.some(
        (statement) =>
          /\bADD\s+COLUMN\b/.test(statement) && !/\bADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\b/.test(statement)
      ),
    hint: 'Use ADD COLUMN IF NOT EXISTS so a partially-applied/retried migration is idempotent.',
  },
  {
    id: 'set-not-null',
    severity: 'warn',
    test: ({ sql }) => /\bSET\s+NOT\s+NULL\b/.test(sql),
    hint: 'SET NOT NULL requires a full backfill first. Prefer: add nullable column, backfill, then SET NOT NULL in a later migration.',
  },
  {
    id: 'add-unique-constraint',
    severity: 'warn',
    test: ({ statements }) => statements.some((statement) => ADD_UNIQUE_CONSTRAINT.test(statement)),
    hint: 'A UNIQUE constraint fails the deploy if duplicates already exist. Verify/clean duplicates before shipping.',
  },
  {
    id: 'create-unique-index',
    severity: 'warn',
    test: ({ statements }) => statements.some((statement) => /\bCREATE\s+UNIQUE\s+INDEX\b/.test(statement)),
    hint: 'A UNIQUE index fails if duplicate rows exist. Run a duplicate preflight query before the release.',
  },
];

export function findMigrationLintRules(raw: string): MigrationLintRule[] {
  const analysis = analyzeSql(raw);
  return MIGRATION_LINT_RULES.filter((rule) => rule.test(analysis));
}
