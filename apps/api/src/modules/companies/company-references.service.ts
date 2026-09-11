import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, isNull } from 'drizzle-orm';
import type { DbClient } from '../../db/client';
import { companyReferences } from '../../db/schema/companies';
import { DB } from '../../shared/database/database.module';
import { NotFoundError, ValidationError } from '../../shared/utils/errors';
import { detectHeaderRow, normalizeText, readSpreadsheetMatrix } from '../../shared/utils/spreadsheet-import';
import type { AuthContext } from '../../shared/security/auth.types';
import { companyReferenceCreateSchema, type CompanyReferenceCreateInput, type CompanyReferenceImportInput, type CompanyReferenceImportResult, type CompanyReferenceUpdateInput } from '@haksan/shared';

const FIELDS = ['firm', 'contact', 'district', 'city', 'brand', 'model', 'deliveryDate', 'notes'] as const;

// Excel/CSV başlıkları (normalizeText sonrası) → alan. Türkçe ve İngilizce başlıklar kabul edilir.
const IMPORT_HEADERS: Record<string, (typeof FIELDS)[number]> = {
  firma: 'firm', 'firma adi': 'firm', musteri: 'firm', company: 'firm',
  ilgili: 'contact', 'ilgili kisi': 'contact', kontak: 'contact', yetkili: 'contact', contact: 'contact',
  ilce: 'district', district: 'district',
  il: 'city', sehir: 'city', city: 'city',
  marka: 'brand', 'tezgah markasi': 'brand', brand: 'brand',
  model: 'model', 'tezgah modeli': 'model',
  'teslim tarihi': 'deliveryDate', teslim: 'deliveryDate', tarih: 'deliveryDate', 'delivery date': 'deliveryDate',
  not: 'notes', notlar: 'notes', aciklama: 'notes', notes: 'notes',
};
const MAX_IMPORT_ROWS = 2000;

/** "11.09.2026", "2026-09-11", Excel seri tarihi ve "09/2026" biçimlerini kabul eder. */
function parseImportDate(value: string): Date | undefined {
  const text = value.trim();
  if (!text) return undefined;
  const tr = text.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (tr) return new Date(Date.UTC(Number(tr[3]), Number(tr[2]) - 1, Number(tr[1])));
  const monthYear = text.match(/^(\d{1,2})[./](\d{4})$/);
  if (monthYear) return new Date(Date.UTC(Number(monthYear[2]), Number(monthYear[1]) - 1, 1));
  if (/^\d{4,5}$/.test(text)) return new Date(Math.round((Number(text) - 25569) * 86400 * 1000)); // Excel seri
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

@Injectable()
export class CompanyReferencesService {
  constructor(@Inject(DB) private readonly db: DbClient) {}

  /** Referans listesi bölüm bazlı değil; satış her bölümün teslimatını gösterebilmeli. */
  list(actor: AuthContext) {
    return this.db
      .select()
      .from(companyReferences)
      .where(and(eq(companyReferences.tenantId, actor.tenantId), isNull(companyReferences.deletedAt)))
      .orderBy(desc(companyReferences.deliveryDate), desc(companyReferences.createdAt));
  }

  private async find(id: string, actor: AuthContext) {
    const row = await this.db.query.companyReferences.findFirst({
      where: and(
        eq(companyReferences.id, id),
        eq(companyReferences.tenantId, actor.tenantId),
        isNull(companyReferences.deletedAt),
      ),
    });
    if (!row) throw new NotFoundError('Referans');
    return row;
  }

  async create(input: CompanyReferenceCreateInput, actor: AuthContext) {
    const [row] = await this.db
      .insert(companyReferences)
      .values({
        tenantId: actor.tenantId,
        firm: input.firm,
        contact: input.contact ?? null,
        district: input.district ?? null,
        city: input.city ?? null,
        brand: input.brand ?? null,
        model: input.model ?? null,
        deliveryDate: input.deliveryDate ?? null,
        notes: input.notes ?? null,
        createdBy: actor.userId,
        updatedBy: actor.userId,
      })
      .returning();
    return row;
  }

  /**
   * Excel/CSV toplu yükleme. Başlık satırı otomatik bulunur; "Firma" boş satırlar ve
   * aynı firma+model+teslim tarihi zaten kayıtlıysa atlanır. Hatalı satır tüm yüklemeyi durdurmaz.
   */
  async importFromFile(input: CompanyReferenceImportInput, actor: AuthContext): Promise<CompanyReferenceImportResult> {
    const { sheetName, matrix } = await readSpreadsheetMatrix(input.fileName, input.fileBase64, {
      pickSheet: (name) => name.includes('referans') || name.includes('reference'),
      maxBytes: 8 * 1024 * 1024,
    });
    const headerIndex = detectHeaderRow(matrix, (cell) => cell in IMPORT_HEADERS);
    if (headerIndex < 0) throw new ValidationError('Başlık satırı bulunamadı. Beklenen sütunlar: Firma, İlgili, İlçe, İl, Marka, Model, Teslim Tarihi, Not');
    const columns = (matrix[headerIndex] ?? []).map((cell) => IMPORT_HEADERS[normalizeText(cell)]);
    if (!columns.includes('firm')) throw new ValidationError('"Firma" sütunu zorunludur');

    const dataRows = matrix.slice(headerIndex + 1).filter((row) => row.some((cell) => cell.trim()));
    if (dataRows.length > MAX_IMPORT_ROWS) throw new ValidationError(`Tek seferde en fazla ${MAX_IMPORT_ROWS} referans yüklenebilir`);

    const existing = await this.list(actor);
    const seen = new Set(existing.map((row) => `${normalizeText(row.firm)}|${normalizeText(row.model)}|${row.deliveryDate ? new Date(row.deliveryDate).toISOString().slice(0, 10) : ''}`));
    const skipped: CompanyReferenceImportResult['skipped'] = [];
    const values: Array<typeof companyReferences.$inferInsert> = [];

    dataRows.forEach((row, offset) => {
      const rowNumber = headerIndex + 2 + offset;
      const raw: Record<string, string> = {};
      columns.forEach((field, index) => { if (field && row[index]?.trim()) raw[field] = row[index].trim(); });
      if (!raw.firm) { skipped.push({ row: rowNumber, reason: 'Firma boş' }); return; }
      const deliveryDate = raw.deliveryDate ? parseImportDate(raw.deliveryDate) : undefined;
      if (raw.deliveryDate && !deliveryDate) { skipped.push({ row: rowNumber, reason: `Teslim tarihi okunamadı: ${raw.deliveryDate}` }); return; }
      const parsed = companyReferenceCreateSchema.safeParse({ ...raw, deliveryDate });
      if (!parsed.success) { skipped.push({ row: rowNumber, reason: parsed.error.issues[0]?.message ?? 'Geçersiz satır' }); return; }
      const key = `${normalizeText(parsed.data.firm)}|${normalizeText(parsed.data.model)}|${deliveryDate ? deliveryDate.toISOString().slice(0, 10) : ''}`;
      if (seen.has(key)) { skipped.push({ row: rowNumber, reason: 'Aynı firma/model/tarih zaten kayıtlı' }); return; }
      seen.add(key);
      values.push({
        tenantId: actor.tenantId, firm: parsed.data.firm, contact: parsed.data.contact ?? null, district: parsed.data.district ?? null,
        city: parsed.data.city ?? null, brand: parsed.data.brand ?? null, model: parsed.data.model ?? null,
        deliveryDate: deliveryDate ?? null, notes: parsed.data.notes ?? null, createdBy: actor.userId, updatedBy: actor.userId,
      });
    });

    if (values.length) await this.db.insert(companyReferences).values(values);
    return { created: values.length, skipped, headerRow: headerIndex + 1, sheetName };
  }

  async update(id: string, input: CompanyReferenceUpdateInput, actor: AuthContext) {
    await this.find(id, actor);
    const patch: Record<string, unknown> = { updatedBy: actor.userId };
    for (const key of FIELDS) {
      if (input[key] !== undefined) patch[key] = input[key] ?? null;
    }
    const [row] = await this.db
      .update(companyReferences)
      .set(patch)
      .where(eq(companyReferences.id, id))
      .returning();
    return row;
  }

  async delete(id: string, actor: AuthContext) {
    await this.find(id, actor);
    await this.db
      .update(companyReferences)
      .set({ deletedAt: new Date(), updatedBy: actor.userId })
      .where(eq(companyReferences.id, id));
    return { ok: true };
  }
}
