import { sql } from 'drizzle-orm';
import type { DbClient } from '../../db/client';
import { companies, contacts } from '../../db/schema/companies';
import { recordSequences } from '../../db/schema/tenants';

export type RecordSequenceType = 'company' | 'contact';

/** Tek statement'ta artırır; eşzamanlı istekler aynı kayıt numarasını alamaz. */
export async function nextRecordNo(
  db: DbClient,
  tenantId: string,
  recordType: RecordSequenceType
): Promise<string> {
  const observedMax = recordType === 'company'
    ? sql<number>`coalesce((
        select max(${companies.externalCompanyNo}::bigint)
        from ${companies}
        where ${companies.tenantId} = ${tenantId}
          and ${companies.externalCompanyNo} ~ '^[0-9]{1,15}$'
      ), 0)`
    : sql<number>`coalesce((
        select max(${contacts.externalContactNo}::bigint)
        from ${contacts}
        where ${contacts.tenantId} = ${tenantId}
          and ${contacts.externalContactNo} ~ '^[0-9]{1,15}$'
      ), 0)`;

  const [sequence] = await db
    .insert(recordSequences)
    .values({ tenantId, recordType, lastNumber: sql`${observedMax} + 1` })
    .onConflictDoUpdate({
      target: [recordSequences.tenantId, recordSequences.recordType],
      set: {
        lastNumber: sql`greatest(${recordSequences.lastNumber} + 1, ${observedMax} + 1)`,
        updatedAt: new Date(),
      },
    })
    .returning({ value: recordSequences.lastNumber });

  return String(sequence.value);
}
