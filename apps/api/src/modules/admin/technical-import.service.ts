import { Inject, Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import type {
  TechnicalImportAvailableField,
  TechnicalImportCommitRequest,
  TechnicalImportMatchStatus,
  TechnicalImportPreviewRequest,
  TechnicalImportRowInput,
} from '@haksan/shared';
import type { DbClient } from '../../db/client';
import { brands, productModels, productSpecs, productSpecTemplates } from '../../db/schema/products';
import { productSpecGroups, productTypes } from '../../db/schema/lookup';
import { DB } from '../../shared/database/database.module';
import { AuditService } from '../../shared/database/audit.service';
import type { AuthContext } from '../../shared/security/auth.types';
import { NotFoundError, ValidationError } from '../../shared/utils/errors';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_SHEETS = 25;
const MAX_ROWS_PER_SHEET = 2000;
const MAX_COLUMNS = 250;
const MAX_TOTAL_CELLS = 100_000;
const MAX_IMPORT_ROWS = 5000;

const TECHNICAL_ALIASES: Record<string, string> = {
  'spindle speed': 'fener mili devri',
  'spindle taper': 'fener mili standardi',
  'table size': 'tabla olcusu',
  'table load': 'tabla yukleme kapasitesi',
  'x axis travel': 'x ekseni hareketi',
  'y axis travel': 'y ekseni hareketi',
  'z axis travel': 'z ekseni hareketi',
  'tool capacity': 'takim kapasitesi',
  'machine weight': 'tezgah agirligi',
};

const TECHNICAL_METADATA_KEYS = new Set([
  'tezgah',
  'urun grubu',
  'urun tipi',
  'marka',
  'seri',
]);

const TECHNICAL_SECTION_CODES: Record<string, string> = {
  kapasite: 'KAPASITE',
  bukme: 'BUKME',
  kesme: 'KESME',
  tabla: 'TABLA',
  eksenler: 'EKSENLER',
  'fener mili': 'FENER_MILI',
  'karsi punta': 'KARSI_PUNTA',
  'karsi ayna': 'KARSI_AYNA',
  'canli takim': 'CANLI_TAKIM',
  motorlar: 'MOTORLAR',
  taret: 'TARET',
  'takim degistirici': 'TAKIM_DEGISTIRICI',
  genel: 'GENEL',
};

/**
 * Şablon tablosunda aynı makine tipi hem güncel hem eski kodla kayıtlı olabilir
 * (ör. KOPRU_TIPI_ISLEME_MERKEZI ↔ CNC_KOPRU_TIPI_ISLEME_MERKEZI). Web tarafı okurken
 * bunları eşitliyor; içe aktarma da eşitlemezse var olan satırı bulamaz ve aynı alanı
 * ikinci kez, paralel bir kodla yazar — kullanıcı aktarımı başarılı görür ama değer
 * çalışma sayfasına yansımaz.
 */
const TYPE_CODE_ALIASES: Record<string, string> = {
  DIK_ISLEME_MERKEZI: 'CNC_DIK_ISLEME_MERKEZ',
  KOPRU_TIPI_ISLEME_MERKEZI: 'CNC_KOPRU_TIPI_ISLEME_MERKEZI',
  CNC_TORNA: 'CNC_YATAY_TORNA_TEZGAHI',
};

export function productTypeCodeVariants(code: string): string[] {
  const upper = code.toLocaleUpperCase('tr-TR').normalize('NFD').replace(/[̀-ͯ]/g, '');
  const canonical = TYPE_CODE_ALIASES[upper] ?? upper;
  const legacy = Object.entries(TYPE_CODE_ALIASES)
    .filter(([, target]) => target === canonical)
    .map(([source]) => source);
  return [...new Set([code, upper, canonical, ...legacy])];
}

export function sameProductTypeCode(left: string, right: string): boolean {
  const rightVariants = new Set(productTypeCodeVariants(right));
  return productTypeCodeVariants(left).some((code) => rightVariants.has(code));
}

const HEADER_WORDS = {
  section: ['bolum', 'grup', 'section'],
  key: ['teknik bilgi', 'alan', 'ozellik', 'specification', 'feature'],
  value: ['deger', 'value', 'veri'],
  unit: ['birim', 'unit'],
};

export function normalizeTechnicalLabel(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function safeCellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value).trim();
  if ('formula' in value || 'sharedFormula' in value) {
    const result = value.result;
    return typeof result === 'string' || typeof result === 'number' || typeof result === 'boolean' ? String(result).trim() : '';
  }
  if ('richText' in value) return value.richText.map((part) => part.text).join('').trim();
  if ('text' in value) return String(value.text ?? '').trim();
  return '';
}

export function parseCsv(text: string): string[][] {
  let source = text.replace(/^\uFEFF/, '');
  // Excel "CSV (ayra\u00E7l\u0131)" \u00E7\u0131kt\u0131s\u0131n\u0131n ilk sat\u0131r\u0131na yazd\u0131\u011F\u0131 `sep=;` y\u00F6nergesi. Veri sat\u0131r\u0131
  // de\u011Fildir; ayrac\u0131 buradan okuyup sat\u0131r\u0131 atmazsak t\u00FCm kolonlar bir kay\u0131yor.
  const separatorDirective = source.match(/^sep=(.)\r?\n/i);
  let delimiter: string;
  if (separatorDirective) {
    delimiter = separatorDirective[1];
    source = source.slice(separatorDirective[0].length);
  } else {
    const sample = source.split(/\r?\n/, 5).join('\n');
    const count = (char: string) => sample.split(char).length - 1;
    const candidates: Array<[string, number]> = [[';', count(';')], ['\t', count('\t')], [',', count(',')]];
    const [best] = candidates.sort((a, b) => b[1] - a[1]);
    delimiter = best[1] > 0 ? best[0] : ',';
  }
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '"') {
      if (quoted && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === delimiter && !quoted) {
      row.push(cell.trim());
      cell = '';
      continue;
    }
    if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && source[index + 1] === '\n') index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = '';
      continue;
    }
    cell += char;
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function headerIndex(row: string[], candidates: string[]): number {
  return row.findIndex((cell) => candidates.some((candidate) => normalizeTechnicalLabel(cell).includes(candidate)));
}

function splitValueAndUnit(value: string, explicitUnit: string): { value: string; unit: string } {
  if (explicitUnit || !value) return { value, unit: explicitUnit };
  const match = value.match(/^(.+?)(?:\s+|(?=["'%°]$))(mm\/dk|m\/dk|mm\/dev|dev\/dk|dv\/dk|rpm|mm|cm|m|kg|kw|hp|bar|sn|adet|lt|ton|kN|N·m|N-m|Nm|"|'|%|°)$/i);
  return match ? { value: match[1].trim(), unit: match[2].trim() } : { value, unit: '' };
}

function technicalSectionCode(section: string): string {
  return TECHNICAL_SECTION_CODES[normalizeTechnicalLabel(section)] ?? 'GENEL';
}

export function extractTechnicalSourceNames(rows: string[][]): string[] {
  const names: string[] = [];
  for (const row of rows) {
    const keyIndex = row.findIndex((cell) => TECHNICAL_METADATA_KEYS.has(normalizeTechnicalLabel(cell)));
    if (keyIndex < 0) continue;
    const value = row.slice(keyIndex + 1).find((cell) => cell.trim());
    if (value) names.push(value.trim());
  }
  return names;
}

export function rowsToTechnicalRows(rows: string[][], sheetName: string): Array<Omit<TechnicalImportRowInput, 'targetKey' | 'targetGroupCode' | 'targetUnit' | 'matchStatus' | 'include'>> {
  const firstDataIndex = rows.findIndex((row) => row.some((cell) => cell.trim()));
  if (firstDataIndex < 0) return [];
  const first = rows[firstDataIndex];
  const keyHeader = headerIndex(first, HEADER_WORDS.key);
  const valueHeader = headerIndex(first, HEADER_WORDS.value);
  const hasHeader = keyHeader >= 0 && valueHeader >= 0;
  // Başlıksız dosyada bölüm kolonu ancak 3+ kolon varsa vardır; iki kolonlu dosyada
  // 0. kolon alan adının kendisidir, bölüm sanılırsa her satır kendi bölümü olur.
  const sectionColumn = hasHeader ? headerIndex(first, HEADER_WORDS.section) : first.length >= 3 ? 0 : -1;
  const keyColumn = hasHeader ? keyHeader : first.length >= 3 ? 1 : 0;
  const valueColumn = hasHeader ? valueHeader : first.length >= 3 ? 2 : 1;
  const unitColumn = hasHeader ? headerIndex(first, HEADER_WORDS.unit) : first.length >= 4 ? 3 : -1;
  const dataStart = firstDataIndex + (hasHeader ? 1 : 0);
  const result: Array<Omit<TechnicalImportRowInput, 'targetKey' | 'targetGroupCode' | 'targetUnit' | 'matchStatus' | 'include'>> = [];
  let currentSection = 'GENEL';

  for (let index = dataStart; index < rows.length; index += 1) {
    const source = rows[index];
    const section = sectionColumn >= 0 ? String(source[sectionColumn] ?? '').trim() : '';
    if (section) currentSection = section;
    const sourceKey = String(source[keyColumn] ?? '').trim();
    if (!sourceKey || HEADER_WORDS.key.some((word) => normalizeTechnicalLabel(sourceKey) === word)) continue;
    // Üretici teknik föylerinin üst kısmındaki model/taksonomi satırları teknik
    // özellik değildir. Bunlar hedef makine önerisinde kullanılır, spec olarak
    // kaydedilmez.
    if (TECHNICAL_METADATA_KEYS.has(normalizeTechnicalLabel(sourceKey))) continue;
    const split = splitValueAndUnit(String(source[valueColumn] ?? '').trim(), unitColumn >= 0 ? String(source[unitColumn] ?? '').trim() : '');
    result.push({
      rowNumber: index + 1,
      sheetName,
      section: currentSection,
      sourceKey,
      sourceValue: split.value,
      sourceUnit: split.unit,
    });
  }
  return result;
}

export function prepareTechnicalImportRow(
  row: ReturnType<typeof rowsToTechnicalRows>[number],
  availableFields: TechnicalImportAvailableField[],
  mode: TechnicalImportPreviewRequest['mode'],
): TechnicalImportRowInput {
  const match = matchTechnicalField(row.sourceKey, availableFields);
  if (match.field) {
    return {
      ...row,
      targetKey: match.field.key,
      targetGroupCode: match.field.groupCode ?? technicalSectionCode(row.section),
      targetUnit: match.field.unit ?? row.sourceUnit,
      matchStatus: match.status,
      include: true,
    };
  }
  // Şablon alanı aktarımı kullanıcının açıkça yüklediği teknik föyden yeni CRM
  // alanları oluşturabilmelidir. Önizlemede "Onay gerekli" olarak görünür ve
  // kullanıcı istemediği satırı kapatabilir. Makine verisinde ise bilinmeyen bir
  // alan sessizce oluşturulmaz; mevcut sistem alanıyla eşleştirme gerekir.
  if (mode === 'template_fields') {
    return {
      ...row,
      targetKey: row.sourceKey,
      targetGroupCode: technicalSectionCode(row.section),
      targetUnit: row.sourceUnit,
      matchStatus: 'review',
      include: true,
    };
  }
  return {
    ...row,
    targetKey: '',
    targetGroupCode: technicalSectionCode(row.section),
    targetUnit: row.sourceUnit,
    matchStatus: 'unmatched',
    include: false,
  };
}

function tokenSimilarity(left: string, right: string): number {
  const a = new Set(left.split(' ').filter(Boolean));
  const b = new Set(right.split(' ').filter(Boolean));
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter((token) => b.has(token)).length;
  return (2 * intersection) / (a.size + b.size);
}

export function matchTechnicalField(sourceKey: string, availableFields: TechnicalImportAvailableField[]): {
  field?: TechnicalImportAvailableField;
  status: TechnicalImportMatchStatus;
} {
  const sourceFolded = normalizeTechnicalLabel(sourceKey);
  const exact = availableFields.find((field) => field.key.trim().toLocaleLowerCase('tr-TR') === sourceKey.trim().toLocaleLowerCase('tr-TR'));
  if (exact) return { field: exact, status: 'exact' };
  const normalized = availableFields.find((field) => normalizeTechnicalLabel(field.key) === sourceFolded);
  if (normalized) return { field: normalized, status: 'normalized' };
  const alias = TECHNICAL_ALIASES[sourceFolded];
  if (alias) {
    const aliasMatch = availableFields.find((field) => normalizeTechnicalLabel(field.key) === alias);
    if (aliasMatch) return { field: aliasMatch, status: 'review' };
  }
  const ranked = availableFields
    .map((field) => ({ field, score: tokenSimilarity(sourceFolded, normalizeTechnicalLabel(field.key)) }))
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.score >= 0.72 ? { field: ranked[0].field, status: 'review' } : { status: 'unmatched' };
}

@Injectable()
export class TechnicalImportService {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    private readonly audit: AuditService
  ) {}

  private decodeFile(body: TechnicalImportPreviewRequest): Buffer {
    const extension = body.fileName.split('.').pop()?.toLocaleLowerCase('tr-TR');
    if (extension !== 'xlsx' && extension !== 'csv') throw new ValidationError('Yalnızca XLSX veya CSV dosyası yüklenebilir');
    const allowedMimeTypes = extension === 'xlsx'
      ? new Set(['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/octet-stream'])
      : new Set(['text/csv', 'text/plain', 'application/vnd.ms-excel', 'application/octet-stream']);
    if (body.mimeType && !allowedMimeTypes.has(body.mimeType.toLocaleLowerCase('tr-TR'))) {
      throw new ValidationError('Dosyanın MIME tipi uzantısıyla eşleşmiyor');
    }
    let buffer: Buffer;
    try {
      buffer = Buffer.from(body.fileBase64, 'base64');
    } catch {
      throw new ValidationError('Dosya içeriği okunamadı');
    }
    if (!buffer.length || buffer.length > MAX_FILE_BYTES) throw new ValidationError('Dosya boyutu 10 MB sınırını aşıyor');
    if (extension === 'xlsx' && (buffer[0] !== 0x50 || buffer[1] !== 0x4b)) {
      throw new ValidationError('XLSX dosya imzası geçersiz');
    }
    if (extension === 'csv' && buffer.includes(0)) throw new ValidationError('CSV dosyası metin biçiminde olmalıdır');
    return buffer;
  }

  private async parseFile(body: TechnicalImportPreviewRequest): Promise<{
    rows: ReturnType<typeof rowsToTechnicalRows>;
    sheetNames: string[];
    sourceNames: string[];
  }> {
    const buffer = this.decodeFile(body);
    const extension = body.fileName.split('.').pop()?.toLocaleLowerCase('tr-TR');
    if (extension === 'csv') {
      const rows = parseCsv(buffer.toString('utf8'));
      if (rows.length > MAX_ROWS_PER_SHEET || Math.max(0, ...rows.map((row) => row.length)) > MAX_COLUMNS) {
        throw new ValidationError('CSV dosyası satır veya sütun sınırını aşıyor');
      }
      return {
        rows: rowsToTechnicalRows(rows, 'CSV'),
        sheetNames: ['CSV'],
        sourceNames: extractTechnicalSourceNames(rows),
      };
    }

    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(buffer as any);
    } catch {
      throw new ValidationError('XLSX dosyasının yapısı geçersiz veya bozuk');
    }
    if (workbook.worksheets.length > MAX_SHEETS) throw new ValidationError(`Dosyada en fazla ${MAX_SHEETS} çalışma sayfası olabilir`);
    let totalCells = 0;
    const parsed: ReturnType<typeof rowsToTechnicalRows> = [];
    const sheetNames: string[] = [];
    const sourceNames: string[] = [];
    for (const worksheet of workbook.worksheets) {
      if (worksheet.rowCount > MAX_ROWS_PER_SHEET || worksheet.columnCount > MAX_COLUMNS) {
        throw new ValidationError(`“${worksheet.name}” çalışma sayfası satır veya sütun sınırını aşıyor`);
      }
      totalCells += worksheet.rowCount * worksheet.columnCount;
      if (totalCells > MAX_TOTAL_CELLS) throw new ValidationError('Dosya toplam 100.000 hücre sınırını aşıyor');
      const rows: string[][] = [];
      for (let rowNumber = 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
        const row = worksheet.getRow(rowNumber);
        const values: string[] = [];
        for (let column = 1; column <= worksheet.columnCount; column += 1) values.push(safeCellText(row.getCell(column).value));
        rows.push(values);
      }
      sheetNames.push(worksheet.name);
      sourceNames.push(...extractTechnicalSourceNames(rows));
      parsed.push(...rowsToTechnicalRows(rows, worksheet.name));
    }
    return { rows: parsed, sheetNames, sourceNames };
  }

  private async suggestedProducts(actor: AuthContext, productTypeCode: string, sourceNames: string[]) {
    const rows = await this.db
      .select({
        id: productModels.id,
        modelCode: productModels.modelCode,
        fullName: productModels.fullName,
        brandName: brands.name,
        productTypeCode: productTypes.code,
      })
      .from(productModels)
      .leftJoin(brands, eq(productModels.brandId, brands.id))
      .leftJoin(productTypes, eq(productModels.productTypeId, productTypes.id))
      .where(and(
        eq(productModels.tenantId, actor.tenantId),
        inArray(productTypes.code, productTypeCodeVariants(productTypeCode)),
        isNull(productModels.deletedAt),
      ))
      .orderBy(asc(productModels.fullName))
      .limit(200);
    const source = normalizeTechnicalLabel(sourceNames.join(' '));
    return rows
      .map((row) => {
        const label = [row.brandName, row.modelCode, row.fullName].filter(Boolean).join(' ');
        const folded = normalizeTechnicalLabel(label);
        const score = source.includes(normalizeTechnicalLabel(row.modelCode)) ? 1 : tokenSimilarity(source, folded);
        return { ...row, label, score };
      })
      .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label, 'tr-TR'))
      .slice(0, 20);
  }

  async preview(body: TechnicalImportPreviewRequest, actor: AuthContext) {
    const parsed = await this.parseFile(body);
    if (!parsed.rows.length) throw new ValidationError('Dosyada teknik bilgi satırı bulunamadı');
    if (parsed.rows.length > MAX_IMPORT_ROWS) throw new ValidationError(`Tek seferde en fazla ${MAX_IMPORT_ROWS} teknik satır aktarılabilir`);
    const rows = parsed.rows.map((row) => prepareTechnicalImportRow(row, body.availableFields, body.mode));
    const count = (status: TechnicalImportMatchStatus) => rows.filter((row) => row.matchStatus === status).length;
    return {
      file: { name: body.fileName, sheetNames: parsed.sheetNames, rowCount: rows.length },
      rows,
      summary: {
        total: rows.length,
        exact: count('exact'),
        normalized: count('normalized'),
        review: count('review'),
        unmatched: count('unmatched'),
        ready: rows.filter((row) => row.include && row.targetKey).length,
      },
      suggestedProducts: body.mode === 'machine_data'
        ? await this.suggestedProducts(actor, body.productTypeCode, [body.fileName, ...parsed.sheetNames, ...parsed.sourceNames])
        : [],
    };
  }

  async commit(body: TechnicalImportCommitRequest, actor: AuthContext) {
    const rows = body.rows.filter((row) => row.include && row.targetKey);
    if (!rows.length) throw new ValidationError('Aktarılacak eşleşmiş teknik satır bulunamadı');
    if (body.mode === 'machine_data') return this.commitMachineData(body, rows, actor);
    return this.commitTemplateFields(body, rows, actor);
  }

  private async commitTemplateFields(body: TechnicalImportCommitRequest, rows: TechnicalImportRowInput[], actor: AuthContext) {
    let created = 0;
    let updated = 0;
    await this.db.transaction(async (tx) => {
      for (const [index, row] of rows.entries()) {
        const divisionFilter = body.divisionId ? eq(productSpecTemplates.divisionId, body.divisionId) : isNull(productSpecTemplates.divisionId);
        const [existing] = await tx
          .select({ id: productSpecTemplates.id })
          .from(productSpecTemplates)
          .where(and(inArray(productSpecTemplates.productTypeCode, productTypeCodeVariants(body.productTypeCode)), eq(productSpecTemplates.specKey, row.targetKey), divisionFilter))
          .limit(1);
        const values = {
          specGroupCode: row.targetGroupCode || 'GENEL',
          defaultValue: row.sourceValue || null,
          specUnit: row.targetUnit || row.sourceUnit || null,
          sortOrder: index,
          isActive: true,
          isDeleted: false,
        };
        if (existing) {
          await tx.update(productSpecTemplates).set(values).where(eq(productSpecTemplates.id, existing.id));
          updated += 1;
        } else {
          await tx.insert(productSpecTemplates).values({
            productTypeCode: body.productTypeCode,
            divisionId: body.divisionId ?? null,
            specKey: row.targetKey,
            ...values,
          });
          created += 1;
        }
      }
    });
    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'product_spec_template.imported',
      resourceType: 'product_spec_template',
      resourceId: body.productTypeCode,
      newValues: { created, updated, rowCount: rows.length },
    });
    return { ok: true, created, updated, imported: rows.length };
  }

  private async commitMachineData(body: TechnicalImportCommitRequest, rows: TechnicalImportRowInput[], actor: AuthContext) {
    if (!body.targetProductId || !body.confirmedTarget) throw new ValidationError('Hedef makine kullanıcı tarafından onaylanmalıdır');
    const [target] = await this.db
      .select({ id: productModels.id, productTypeCode: productTypes.code })
      .from(productModels)
      .leftJoin(productTypes, eq(productModels.productTypeId, productTypes.id))
      .where(and(eq(productModels.id, body.targetProductId), eq(productModels.tenantId, actor.tenantId), isNull(productModels.deletedAt)))
      .limit(1);
    if (!target) throw new NotFoundError('Hedef makine');
    if (target.productTypeCode && !sameProductTypeCode(target.productTypeCode, body.productTypeCode)) {
      throw new ValidationError('Seçilen makine bu teknik şablonun ürün tipiyle eşleşmiyor');
    }

    const groupCodes = [...new Set(rows.map((row) => row.targetGroupCode).filter(Boolean))];
    const groups = groupCodes.length
      ? await this.db.select({ id: productSpecGroups.id, code: productSpecGroups.code }).from(productSpecGroups).where(inArray(productSpecGroups.code, groupCodes))
      : [];
    const groupIdByCode = new Map(groups.map((group) => [group.code, group.id]));
    let created = 0;
    let updated = 0;
    await this.db.transaction(async (tx) => {
      for (const [index, row] of rows.entries()) {
        const [existing] = await tx
          .select({ id: productSpecs.id })
          .from(productSpecs)
          .where(and(eq(productSpecs.productModelId, target.id), eq(productSpecs.specKey, row.targetKey), isNull(productSpecs.deletedAt)))
          .limit(1);
        const values = {
          specGroupId: groupIdByCode.get(row.targetGroupCode) ?? null,
          specValue: row.sourceValue,
          specUnit: row.targetUnit || row.sourceUnit || null,
          sortOrder: index,
          deletedAt: null,
        };
        if (existing) {
          await tx.update(productSpecs).set(values).where(eq(productSpecs.id, existing.id));
          updated += 1;
        } else {
          await tx.insert(productSpecs).values({
            tenantId: actor.tenantId,
            productModelId: target.id,
            specKey: row.targetKey,
            ...values,
          });
          created += 1;
        }
      }
    });
    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'product_specs.imported',
      resourceType: 'product_model',
      resourceId: target.id,
      newValues: { created, updated, rowCount: rows.length },
    });
    return { ok: true, created, updated, imported: rows.length, productId: target.id };
  }
}
