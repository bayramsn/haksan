import { and, eq, sql } from 'drizzle-orm';
import type { DbClient } from '../../db/client';
import { documentSequences, divisions } from '../../db/schema/tenants';
import { ValidationError } from './errors';

export type BusinessLine = 'CNC' | 'UNI' | 'SACISLE';
export type SeriesDocumentType = 'quote' | 'proforma' | 'contract' | 'commercial_invoice' | 'service' | 'service_quote';

const DOCUMENT_CODES: Record<SeriesDocumentType, string> = {
  quote: '',
  proforma: 'PRF',
  contract: 'SOZ',
  commercial_invoice: 'FAT',
  service: 'SRV',
  service_quote: 'SRVTEK',
};

export function businessLineFromDivisionCode(code: string | null | undefined): BusinessLine {
  if (code === 'cnc') return 'CNC';
  if (code === 'universal') return 'UNI';
  if (code === 'sac_isleme') return 'SACISLE';
  throw new ValidationError('Belge serisi için desteklenmeyen bölüm kodu', { field: 'divisionId', divisionCode: code ?? null });
}

export async function resolveBusinessLine(
  db: DbClient,
  tenantId: string,
  divisionId: string | null | undefined
): Promise<BusinessLine> {
  if (!divisionId) throw new ValidationError('Belge serisi için bölüm ataması zorunludur', { field: 'divisionId' });
  const division = await db.query.divisions.findFirst({
    where: and(eq(divisions.id, divisionId), eq(divisions.tenantId, tenantId), eq(divisions.isActive, true)),
  });
  if (!division) throw new ValidationError('Belge serisi için geçerli bir bölüm seçin', { field: 'divisionId' });
  return businessLineFromDivisionCode(division.code);
}

function formatDocumentNo(line: BusinessLine, type: SeriesDocumentType, year: number, value: number) {
  const typeCode = DOCUMENT_CODES[type];
  const prefix = typeCode ? `${line}-${typeCode}` : line;
  return `${prefix}-${year}/${String(value).padStart(type === 'service' || type === 'service_quote' ? 4 : 3, '0')}`;
}

/** PostgreSQL ON CONFLICT ile tek statement'ta artırır; eşzamanlı istekler aynı numarayı alamaz. */
export async function nextSeriesDocumentNo(
  db: DbClient,
  tenantId: string,
  businessLine: BusinessLine,
  documentType: SeriesDocumentType,
  date = new Date()
): Promise<string> {
  const year = date.getUTCFullYear();
  const [sequence] = await db
    .insert(documentSequences)
    .values({ tenantId, businessLine, documentType, year, lastNumber: 1 })
    .onConflictDoUpdate({
      target: [
        documentSequences.tenantId,
        documentSequences.businessLine,
        documentSequences.documentType,
        documentSequences.year,
      ],
      set: {
        lastNumber: sql`${documentSequences.lastNumber} + 1`,
        updatedAt: new Date(),
      },
    })
    .returning({ value: documentSequences.lastNumber });
  return formatDocumentNo(businessLine, documentType, year, sequence.value);
}

/** Elle girilen numaralarda da yanlış bölüm ön ekinin kullanılmasını engeller. */
export function normalizeSeriesDocumentNo(
  value: string | null | undefined,
  businessLine: BusinessLine
): string | null {
  const clean = value?.trim();
  if (!clean) return null;
  const knownPrefix = /^(CNC|UNI|SACISLE)(?=-|\/)/i.exec(clean)?.[1]?.toUpperCase();
  if (knownPrefix && knownPrefix !== businessLine) {
    throw new ValidationError(`Belge numarası ${businessLine} serisiyle başlamalıdır`, { field: 'documentNo' });
  }
  return knownPrefix ? clean : `${businessLine}-${clean}`;
}
