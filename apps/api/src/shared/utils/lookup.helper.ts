import { eq } from 'drizzle-orm';
import type { DbClient } from '../../db/client';

/**
 * Look up a row id from a lookup table by `code`. Returns null if not found.
 * Caller resolves whether nullable is OK.
 */
export async function lookupIdByCode(
  db: DbClient,
  table: { code: any; id: any },
  code: string | undefined | null
): Promise<string | null> {
  if (!code) return null;
  // @ts-expect-error generic schema accessor
  const row = await db.select({ id: table.id }).from(table).where(eq(table.code, code)).limit(1);
  return row[0]?.id ?? null;
}
