import { Inject, Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type {
  CompanyContactImportCommitInput,
  CompanyContactImportCommitResult,
  CompanyContactImportIssue,
  CompanyContactImportPreview,
  CompanyContactImportPreviewInput,
} from '@haksan/shared';
import type { DbClient } from '../../db/client';
import {
  companies,
  companyAddresses,
  companyDivisions,
  companyEmails,
  companyGroupAssignments,
  companyPhones,
  contactCompanies,
  contacts,
} from '../../db/schema/companies';
import { companyGroups, companyRelationTypes, companyStatuses, contactSources, decisionRoles } from '../../db/schema/lookup';
import { DB } from '../../shared/database/database.module';
import { AuditService } from '../../shared/database/audit.service';
import type { AuthContext } from '../../shared/security/auth.types';
import { ForbiddenError, ValidationError } from '../../shared/utils/errors';
import { normalizeCompanyName, normalizePersonName } from '../../shared/utils/text-normalization';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_ROWS = 5000;
const MAX_COLUMNS = 100;
const MAX_SHEETS = 5;
const BATCH_SIZE = 250;
const XLSX_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream',
  'application/zip',
]);

type ImportFile = CompanyContactImportPreviewInput['companiesFile'];
type RawRow = Record<string, ExcelJS.CellValue>;

type ParsedCompany = {
  rowNumber: number;
  externalNo: string;
  legalTitle: string;
  companyType: 'company';
  relationTypeCode: 'customer' | 'supplier' | 'supplier_customer' | 'competitor';
  statusCode: 'potential' | 'active' | 'passive' | 'blacklist';
  sector: string | null;
  groupName: string | null;
  contactSourceName: string | null;
  phones: { main: string | null; secondary: string | null; other: string | null; fax: string | null };
  emails: { main: string | null; secondary: string | null; other: string | null };
  address: {
    country: string | null;
    province: string | null;
    district: string | null;
    zipCode: string | null;
    buildingNumber: string | null;
    fullAddress: string | null;
    latitude: string | null;
    longitude: string | null;
  };
  taxNumber: string | null;
  taxOffice: string | null;
  website: string | null;
  notes: string | null;
  sourceMetadata: Record<string, unknown>;
};

type ParsedContact = {
  rowNumber: number;
  externalNo: string;
  companyNo: string;
  fullName: string;
  title: string | null;
  department: string | null;
  workPhone: string | null;
  mobilePhone: string | null;
  otherPhone: string | null;
  workEmail: string | null;
  personalEmail: string | null;
  otherEmail: string | null;
  gender: string | null;
  birthDate: Date | null;
  decisionRoleCode: 'owner' | 'influencer' | null;
  notes: string | null;
  isPrimary: boolean;
  sourceMetadata: Record<string, unknown>;
};

type CompanyPlan = ParsedCompany & {
  existingId: string | null;
  matchKind: 'external_no' | 'tax_number' | 'legal_title' | 'new';
  importTaxNumber: string | null;
  blocked: boolean;
};

type ContactPlan = ParsedContact & {
  companyPlan: CompanyPlan | null;
  existingId: string | null;
  matchKind: 'external_no' | 'company_name' | 'new';
  blocked: boolean;
};

type Analysis = {
  companies: CompanyPlan[];
  contacts: ContactPlan[];
  issues: CompanyContactImportIssue[];
  preview: CompanyContactImportPreview;
};

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function safeCellText(value: ExcelJS.CellValue, max = 4000): string {
  if (value === null || value === undefined) return '';
  let result = '';
  if (value instanceof Date) result = value.toISOString();
  else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') result = String(value);
  else if ('formula' in value || 'sharedFormula' in value) {
    const formulaResult = value.result;
    if (formulaResult instanceof Date) result = formulaResult.toISOString();
    else if (typeof formulaResult === 'string' || typeof formulaResult === 'number' || typeof formulaResult === 'boolean') result = String(formulaResult);
  } else if ('richText' in value) result = value.richText.map((part) => part.text).join('');
  else if ('text' in value) result = String(value.text ?? '');
  return result.trim().replace(/\s+/gu, ' ').slice(0, max);
}

function value(row: RawRow, header: string, max = 4000): string {
  return safeCellText(row[normalizeHeader(header)], max);
}

function optional(value: string): string | null {
  return value.trim() || null;
}

function normalizedNo(input: string): string {
  return input.trim().replace(/\.0$/, '').slice(0, 32);
}

function normalizedTax(input: string): string {
  return input.replace(/[^0-9A-Z]/gi, '').toLocaleUpperCase('tr-TR');
}

function matchKey(input: string): string {
  return normalizeHeader(input).replace(/\s+/g, ' ');
}

function importedCompanyGroupCode(input: string): string {
  const slug = normalizeHeader(input).replace(/\s+/g, '_').slice(0, 58);
  return `excel_${slug || 'grup'}`;
}

function normalizedEmail(input: string): string | null {
  const candidate = input.trim().toLocaleLowerCase('tr-TR');
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate) && candidate.length <= 255 ? candidate : null;
}

function normalizedWebsite(input: string): string | null {
  const candidate = input.trim();
  if (!candidate) return null;
  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(candidate) ? candidate : `https://${candidate}`;
  try {
    return new URL(withProtocol).toString().slice(0, 512);
  } catch {
    return null;
  }
}

function coordinate(input: string, min: number, max: number): string | null {
  if (!input.trim()) return null;
  const parsed = Number(input.replace(',', '.'));
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? String(parsed) : null;
}

function parsedDate(raw: ExcelJS.CellValue): Date | null {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw;
  const text = safeCellText(raw, 64);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function companyRelationType(input: string): ParsedCompany['relationTypeCode'] {
  const key = matchKey(input);
  if (key.includes('rakip')) return 'competitor';
  if (key.includes('tedarikci') && key.includes('musteri')) return 'supplier_customer';
  if (key.includes('tedarikci')) return 'supplier';
  return 'customer';
}

function companyStatus(input: string): ParsedCompany['statusCode'] {
  const key = matchKey(input);
  if (key.includes('cari')) return 'active';
  if (key.includes('bloke')) return 'blacklist';
  if (key.includes('kaybedil') || key.includes('pasif')) return 'passive';
  return 'potential';
}

function contactDecisionRole(input: string): ParsedContact['decisionRoleCode'] {
  const key = matchKey(input);
  if (key.includes('yardimci') || key.includes('etkileyici')) return 'influencer';
  if (key.includes('karar verici')) return 'owner';
  return null;
}

async function forChunks<T>(rows: T[], run: (chunk: T[]) => Promise<unknown>) {
  for (let index = 0; index < rows.length; index += BATCH_SIZE) await run(rows.slice(index, index + BATCH_SIZE));
}

@Injectable()
export class CompanyContactImportService {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    private readonly audit: AuditService,
  ) {}

  private assertAllowed(actor: AuthContext) {
    if (!actor.roles.includes('super_admin')) throw new ForbiddenError('Firma ve kontak toplu aktarımı yalnızca süper yöneticiye açıktır');
  }

  private decodeFile(file: ImportFile): Buffer {
    if (!file.fileName.toLocaleLowerCase('tr-TR').endsWith('.xlsx')) throw new ValidationError('Yalnızca XLSX dosyası yüklenebilir');
    if (file.mimeType && !XLSX_MIME_TYPES.has(file.mimeType.toLocaleLowerCase('tr-TR'))) {
      throw new ValidationError(`${file.fileName} dosyasının MIME tipi geçersiz`);
    }
    const buffer = Buffer.from(file.fileBase64, 'base64');
    if (!buffer.length || buffer.length > MAX_FILE_BYTES) throw new ValidationError('Excel dosyası 10 MB sınırını aşıyor');
    if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) throw new ValidationError(`${file.fileName} geçerli bir XLSX dosyası değil`);
    return buffer;
  }

  private async workbookRows(file: ImportFile, requiredHeaders: string[]): Promise<Array<{ rowNumber: number; row: RawRow }>> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(this.decodeFile(file) as any);
    if (!workbook.worksheets.length || workbook.worksheets.length > MAX_SHEETS) throw new ValidationError('Excel çalışma sayfası sayısı geçersiz');
    const sheet = workbook.worksheets[0];
    if (sheet.rowCount > MAX_ROWS + 1 || sheet.columnCount > MAX_COLUMNS) throw new ValidationError('Excel satır veya sütun sınırını aşıyor');
    const headers = (sheet.getRow(1).values as ExcelJS.CellValue[]).slice(1).map((cell) => normalizeHeader(safeCellText(cell, 128)));
    const missing = requiredHeaders.filter((header) => !headers.includes(normalizeHeader(header)));
    if (missing.length) throw new ValidationError(`${file.fileName} içinde zorunlu kolonlar eksik`, { missing });

    const rows: Array<{ rowNumber: number; row: RawRow }> = [];
    sheet.eachRow((excelRow, rowNumber) => {
      if (rowNumber === 1) return;
      const record: RawRow = {};
      headers.forEach((header, index) => {
        if (header) record[header] = excelRow.getCell(index + 1).value;
      });
      if (Object.values(record).some((cell) => safeCellText(cell).length > 0)) rows.push({ rowNumber, row: record });
    });
    return rows;
  }

  private async parseCompanies(file: ImportFile, issues: CompanyContactImportIssue[]): Promise<ParsedCompany[]> {
    const rows = await this.workbookRows(file, ['NO', 'FİRMA ADI']);
    return rows.map(({ rowNumber, row }) => {
      const externalNo = normalizedNo(value(row, 'NO', 32));
      const legalTitle = value(row, 'FİRMA ADI', 255);
      const rawEmails = [value(row, 'E-POSTA', 255), value(row, 'E-POSTA 2', 255), value(row, 'E-POSTA 3', 255)];
      const emails = rawEmails.map(normalizedEmail);
      rawEmails.forEach((email, index) => {
        if (email && !emails[index]) issues.push({ kind: 'company', rowNumber, sourceNo: externalNo, severity: 'warning', message: `${index + 1}. e-posta biçimi geçersiz olduğu için aktarılmayacak` });
      });
      const rawWebsite = value(row, 'WEB', 512);
      const website = normalizedWebsite(rawWebsite);
      if (rawWebsite && !website) issues.push({ kind: 'company', rowNumber, sourceNo: externalNo, severity: 'warning', message: 'Web adresi geçersiz olduğu için aktarılmayacak' });
      const owner = value(row, 'FİRMA SAHİBİ', 255);
      const description = value(row, 'AÇIKLAMA', 4000);
      const notes = [description, owner ? `Firma sahibi: ${owner}` : ''].filter(Boolean).join('\n').slice(0, 4000) || null;
      return {
        rowNumber,
        externalNo,
        legalTitle,
        companyType: 'company',
        relationTypeCode: companyRelationType(value(row, 'TİP', 64)),
        statusCode: companyStatus(value(row, 'DURUM', 64)),
        sector: optional(value(row, 'SEKTÖR', 128)),
        groupName: optional(value(row, 'GRUP ADI', 255)),
        contactSourceName: optional(value(row, 'GRUP ADI', 255)),
        phones: {
          main: optional(value(row, 'TELEFON', 32)),
          secondary: optional(value(row, 'TELEFON 2', 32)),
          other: optional(value(row, 'TELEFON 3', 32)),
          fax: optional(value(row, 'FAKS', 32)),
        },
        emails: { main: emails[0], secondary: emails[1], other: emails[2] },
        address: {
          country: optional(value(row, 'ÜLKE', 64)) ?? 'Türkiye',
          province: optional(value(row, 'ŞEHİR', 64)),
          district: optional(value(row, 'İLÇE', 64)),
          zipCode: optional(value(row, 'POSTA KODU', 16)),
          buildingNumber: optional(value(row, 'BİNA NO', 32)),
          fullAddress: optional(value(row, 'ADRES', 4000)),
          latitude: coordinate(value(row, 'ENLEM', 32), -90, 90),
          longitude: coordinate(value(row, 'BOYLAM', 32), -180, 180),
        },
        taxNumber: optional(value(row, 'VERGİ NO', 32)),
        taxOffice: optional(value(row, 'VERGİ DAİRESİ', 128)),
        website,
        notes,
        sourceMetadata: {
          source: 'Firma Listesi',
          rowNumber,
          code: optional(value(row, 'KOD', 64)),
          currentCrm: optional(value(row, 'CARİ CRM', 64)),
          representativeNo: optional(value(row, 'TEMSİLCİ NO', 32)),
          representative: optional(value(row, 'TEMSİLCİ', 255)),
          buildingName: optional(value(row, 'BİNA ADI', 255)),
          sectorNo: optional(value(row, 'SEKTÖR NO', 32)),
          groupNo: optional(value(row, 'GRUP NO', 32)),
          paymentTerm: optional(value(row, 'VADE', 64)),
          paymentOption: optional(value(row, 'VADE OPS.', 128)),
          discount: optional(value(row, 'İSKONTO', 64)),
          recordStatus: optional(value(row, 'DURUM KAYDI', 64)),
          status: optional(value(row, 'DURUM', 64)),
          sourceCreatedBy: optional(value(row, 'OLUŞTURAN', 255)),
          sourceCreatedAt: optional(value(row, 'OLUŞTURMA', 64)),
          sourceUpdatedBy: optional(value(row, 'DÜZENLEYEN', 255)),
          sourceUpdatedAt: optional(value(row, 'DÜZENLEME', 64)),
        },
      };
    });
  }

  private async parseContacts(file: ImportFile, issues: CompanyContactImportIssue[]): Promise<ParsedContact[]> {
    const rows = await this.workbookRows(file, ['NO', 'FIRMA NO', 'KONTAK ADI']);
    return rows.map(({ rowNumber, row }) => {
      const externalNo = normalizedNo(value(row, 'NO', 32));
      const companyNo = normalizedNo(value(row, 'FIRMA NO', 32));
      const rawEmails = [value(row, 'İŞ E-POSTA', 255), value(row, 'KİŞİSEL E-POSTA', 255), value(row, 'DİĞER E-POSTA', 255)];
      const emails = rawEmails.map(normalizedEmail);
      rawEmails.forEach((email, index) => {
        if (email && !emails[index]) issues.push({ kind: 'contact', rowNumber, sourceNo: externalNo, companyNo, severity: 'warning', message: `${index + 1}. e-posta biçimi geçersiz olduğu için aktarılmayacak` });
      });
      const decision = value(row, 'KARAR VERME', 128);
      return {
        rowNumber,
        externalNo,
        companyNo,
        fullName: value(row, 'KONTAK ADI', 255),
        title: optional(value(row, 'ÜNVAN', 128)),
        department: optional(value(row, 'DEPARTMAN', 128)),
        workPhone: optional(value(row, 'İŞ TELEFONU', 32)),
        mobilePhone: optional(value(row, 'CEP TELEFONU', 32)),
        otherPhone: optional(value(row, 'DİĞER TELEFONU', 32)),
        workEmail: emails[0],
        personalEmail: emails[1],
        otherEmail: emails[2],
        gender: optional(value(row, 'CİNSİYET', 32)),
        birthDate: parsedDate(row[normalizeHeader('DOĞUM TARİHİ')]),
        decisionRoleCode: contactDecisionRole(decision),
        notes: optional(value(row, 'AÇIKLAMA', 4000)),
        isPrimary: contactDecisionRole(decision) === 'owner',
        sourceMetadata: {
          source: 'Kontak Listesi',
          rowNumber,
          sourceCompanyName: optional(value(row, 'FİRMA', 255)),
          decision: optional(decision),
          status: optional(value(row, 'DURUM', 64)),
          sourceCreatedBy: optional(value(row, 'OLUŞTURAN', 255)),
          sourceCreatedAt: optional(value(row, 'OLUŞTURMA', 64)),
          sourceUpdatedBy: optional(value(row, 'DÜZENLEYEN', 255)),
          sourceUpdatedAt: optional(value(row, 'DÜZENLEME', 64)),
        },
      };
    });
  }

  private async analyze(input: CompanyContactImportPreviewInput, actor: AuthContext): Promise<Analysis> {
    this.assertAllowed(actor);
    const issues: CompanyContactImportIssue[] = [];
    const [sourceCompanies, sourceContacts, existingCompanies, existingContacts] = await Promise.all([
      this.parseCompanies(input.companiesFile, issues),
      this.parseContacts(input.contactsFile, issues),
      this.db.query.companies.findMany({ where: and(eq(companies.tenantId, actor.tenantId), isNull(companies.deletedAt)) }),
      this.db.query.contacts.findMany({ where: and(eq(contacts.tenantId, actor.tenantId), isNull(contacts.deletedAt)) }),
    ]);

    const companyNoCounts = new Map<string, number>();
    const taxCounts = new Map<string, number>();
    for (const row of sourceCompanies) {
      if (row.externalNo) companyNoCounts.set(row.externalNo, (companyNoCounts.get(row.externalNo) ?? 0) + 1);
      const tax = normalizedTax(row.taxNumber ?? '');
      if (tax) taxCounts.set(tax, (taxCounts.get(tax) ?? 0) + 1);
    }
    const existingByNo = new Map(existingCompanies.filter((row) => row.externalCompanyNo).map((row) => [row.externalCompanyNo!, row]));
    const existingByTax = new Map<string, typeof existingCompanies>();
    const existingByTitle = new Map<string, typeof existingCompanies>();
    for (const row of existingCompanies) {
      const tax = normalizedTax(row.taxNumber ?? '');
      if (tax) existingByTax.set(tax, [...(existingByTax.get(tax) ?? []), row]);
      const title = matchKey(row.legalTitle);
      existingByTitle.set(title, [...(existingByTitle.get(title) ?? []), row]);
    }

    const companyPlans: CompanyPlan[] = sourceCompanies.map((row) => {
      let blocked = false;
      if (!row.externalNo || !row.legalTitle) {
        blocked = true;
        issues.push({ kind: 'company', rowNumber: row.rowNumber, sourceNo: row.externalNo, severity: 'error', message: 'Firma NO ve firma adı zorunludur' });
      }
      if (row.externalNo && (companyNoCounts.get(row.externalNo) ?? 0) > 1) {
        blocked = true;
        issues.push({ kind: 'company', rowNumber: row.rowNumber, sourceNo: row.externalNo, severity: 'error', message: 'Dosyada aynı firma NO birden fazla kez bulunuyor' });
      }
      const normalizedSourceTax = normalizedTax(row.taxNumber ?? '');
      const taxIsUnique = Boolean(normalizedSourceTax) && taxCounts.get(normalizedSourceTax) === 1;
      if (normalizedSourceTax && !taxIsUnique) {
        issues.push({ kind: 'company', rowNumber: row.rowNumber, sourceNo: row.externalNo, severity: 'warning', message: 'Vergi numarası dosyada tekrarlı; benzersizlik çakışmasını önlemek için bu alan aktarılmayacak' });
      }

      let existing = existingByNo.get(row.externalNo);
      let matchKind: CompanyPlan['matchKind'] = existing ? 'external_no' : 'new';
      if (!existing && taxIsUnique) {
        const matches = existingByTax.get(normalizedSourceTax) ?? [];
        if (matches.length === 1) {
          existing = matches[0];
          matchKind = 'tax_number';
        }
      }
      if (!existing) {
        const matches = existingByTitle.get(matchKey(row.legalTitle)) ?? [];
        if (matches.length === 1) {
          existing = matches[0];
          matchKind = 'legal_title';
        } else if (matches.length > 1) {
          blocked = true;
          issues.push({ kind: 'company', rowNumber: row.rowNumber, sourceNo: row.externalNo, severity: 'error', message: 'Aynı unvanla birden fazla mevcut firma bulundu; otomatik eşleştirme yapılmadı' });
        }
      }
      if (existing?.externalCompanyNo && existing.externalCompanyNo !== row.externalNo) {
        blocked = true;
        issues.push({ kind: 'company', rowNumber: row.rowNumber, sourceNo: row.externalNo, severity: 'error', message: 'Eşleşen mevcut kaydın firma numarası dosyadaki değerle farklı' });
      }
      return {
        ...row,
        existingId: existing?.id ?? null,
        matchKind,
        importTaxNumber: taxIsUnique ? row.taxNumber : null,
        blocked,
      };
    });

    const companyPlanByNo = new Map(companyPlans.map((plan) => [plan.externalNo, plan]));
    const contactNoCounts = new Map<string, number>();
    for (const row of sourceContacts) if (row.externalNo) contactNoCounts.set(row.externalNo, (contactNoCounts.get(row.externalNo) ?? 0) + 1);
    const existingContactByNo = new Map(existingContacts.filter((row) => row.externalContactNo).map((row) => [row.externalContactNo!, row]));
    const existingContactByCompanyAndName = new Map<string, typeof existingContacts>();
    for (const row of existingContacts) {
      const key = `${row.companyId}:${matchKey(row.fullName)}`;
      existingContactByCompanyAndName.set(key, [...(existingContactByCompanyAndName.get(key) ?? []), row]);
    }

    const contactPlans: ContactPlan[] = sourceContacts.map((row) => {
      let blocked = false;
      if (!row.externalNo || !row.companyNo || !row.fullName) {
        blocked = true;
        issues.push({ kind: 'contact', rowNumber: row.rowNumber, sourceNo: row.externalNo, companyNo: row.companyNo, severity: 'error', message: 'Kontak NO, firma NO ve kontak adı zorunludur' });
      }
      if (row.externalNo && (contactNoCounts.get(row.externalNo) ?? 0) > 1) {
        blocked = true;
        issues.push({ kind: 'contact', rowNumber: row.rowNumber, sourceNo: row.externalNo, companyNo: row.companyNo, severity: 'error', message: 'Dosyada aynı kontak NO birden fazla kez bulunuyor' });
      }
      const companyPlan = companyPlanByNo.get(row.companyNo) ?? null;
      if (!companyPlan || companyPlan.blocked) {
        blocked = true;
        issues.push({ kind: 'contact', rowNumber: row.rowNumber, sourceNo: row.externalNo, companyNo: row.companyNo, severity: 'error', message: 'Firma NO, firma dosyasında bulunamadı veya firma satırı aktarılamıyor' });
      }

      let existing = existingContactByNo.get(row.externalNo);
      let matchKind: ContactPlan['matchKind'] = existing ? 'external_no' : 'new';
      if (!existing && companyPlan?.existingId) {
        const matches = existingContactByCompanyAndName.get(`${companyPlan.existingId}:${matchKey(row.fullName)}`) ?? [];
        if (matches.length === 1) {
          existing = matches[0];
          matchKind = 'company_name';
        } else if (matches.length > 1) {
          blocked = true;
          issues.push({ kind: 'contact', rowNumber: row.rowNumber, sourceNo: row.externalNo, companyNo: row.companyNo, severity: 'error', message: 'Aynı firma ve adla birden fazla kontak bulundu; otomatik eşleştirme yapılmadı' });
        }
      }
      if (existing?.externalContactNo && existing.externalContactNo !== row.externalNo) {
        blocked = true;
        issues.push({ kind: 'contact', rowNumber: row.rowNumber, sourceNo: row.externalNo, companyNo: row.companyNo, severity: 'error', message: 'Eşleşen mevcut kontağın kontak numarası dosyadaki değerle farklı' });
      }
      return { ...row, companyPlan, existingId: existing?.id ?? null, matchKind, blocked };
    });

    const companySkipped = companyPlans.filter((row) => row.blocked).length;
    const contactSkipped = contactPlans.filter((row) => row.blocked).length;
    const preview: CompanyContactImportPreview = {
      files: { companies: input.companiesFile.fileName, contacts: input.contactsFile.fileName },
      summary: {
        companyRows: companyPlans.length,
        companyCreates: companyPlans.filter((row) => !row.blocked && !row.existingId).length,
        companyUpdates: companyPlans.filter((row) => !row.blocked && Boolean(row.existingId)).length,
        companySkipped,
        contactRows: contactPlans.length,
        contactCreates: contactPlans.filter((row) => !row.blocked && !row.existingId).length,
        contactUpdates: contactPlans.filter((row) => !row.blocked && Boolean(row.existingId)).length,
        contactSkipped,
        warnings: issues.filter((issue) => issue.severity === 'warning').length,
        errors: issues.filter((issue) => issue.severity === 'error').length,
      },
      issues: issues.slice(0, 250),
    };
    return { companies: companyPlans, contacts: contactPlans, issues, preview };
  }

  async preview(input: CompanyContactImportPreviewInput, actor: AuthContext): Promise<CompanyContactImportPreview> {
    return (await this.analyze(input, actor)).preview;
  }

  async commit(input: CompanyContactImportCommitInput, actor: AuthContext): Promise<CompanyContactImportCommitResult> {
    const analysis = await this.analyze(input, actor);
    const validCompanies = analysis.companies.filter((row) => !row.blocked);
    const validContacts = analysis.contacts.filter((row) => !row.blocked && row.companyPlan && !row.companyPlan.blocked);
    const divisionId = input.divisionId ?? (actor.activeDivisionId !== 'all' ? actor.activeDivisionId : null) ?? actor.primaryDivisionId;
    if (!divisionId) throw new ValidationError('Yeni firmaları bağlamak için bir bölüm seçilmelidir', { field: 'divisionId' });
    if (!actor.canViewAllDivisions && !actor.divisionIds.includes(divisionId)) throw new ForbiddenError('Seçilen bölüme aktarım yetkiniz yok');

    const [relations, statuses, groups, sources, roles] = await Promise.all([
      this.db.select().from(companyRelationTypes),
      this.db.select().from(companyStatuses),
      this.db.select().from(companyGroups),
      this.db.select().from(contactSources),
      this.db.select().from(decisionRoles),
    ]);
    const relationMap = new Map(relations.map((row) => [row.code, row.id]));
    const statusMap = new Map(statuses.map((row) => [row.code, row.id]));
    const groupMap = new Map(groups.flatMap((row) => [[matchKey(row.code), row.id], [matchKey(row.name), row.id]] as Array<[string, string]>));
    const sourceMap = new Map(sources.flatMap((row) => [[matchKey(row.code), row.id], [matchKey(row.name), row.id]] as Array<[string, string]>));
    const roleMap = new Map(roles.map((row) => [row.code, row.id]));
    const companyIdByNo = new Map<string, string>();
    const contactIdByNo = new Map<string, string>();

    await this.db.transaction(async (tx) => {
      const missingGroupNames = Array.from(new Map(
        validCompanies
          .filter((row) => row.groupName && !groupMap.has(matchKey(row.groupName)))
          .map((row) => [matchKey(row.groupName!), row.groupName!] as const),
      ).values());
      if (missingGroupNames.length) {
        await tx
          .insert(companyGroups)
          .values(missingGroupNames.map((name, index) => ({
            code: importedCompanyGroupCode(name),
            name,
            description: 'Firma Listesi Excel aktarımından oluşturuldu',
            sortOrder: 1_000 + index,
          })))
          .onConflictDoNothing();
        const refreshedGroups = await tx.select().from(companyGroups);
        groupMap.clear();
        for (const row of refreshedGroups) {
          groupMap.set(matchKey(row.code), row.id);
          groupMap.set(matchKey(row.name), row.id);
        }
      }

      for (const row of validCompanies.filter((item) => item.existingId && item.matchKind !== 'external_no')) {
        await tx.update(companies).set({ externalCompanyNo: row.externalNo, updatedBy: actor.userId }).where(eq(companies.id, row.existingId!));
      }

      const companyValues = validCompanies.map((row) => ({
        tenantId: actor.tenantId,
        externalCompanyNo: row.externalNo,
        companyType: row.companyType,
        relationTypeId: relationMap.get(row.relationTypeCode) ?? null,
        customerStatusId: statusMap.get(row.statusCode) ?? null,
        companyGroupId: row.groupName ? groupMap.get(matchKey(row.groupName)) ?? null : null,
        contactSourceId: row.contactSourceName ? sourceMap.get(matchKey(row.contactSourceName)) ?? null : null,
        sector: row.sector,
        legalTitle: normalizeCompanyName(row.legalTitle),
        taxOffice: row.taxOffice,
        taxNumber: row.importTaxNumber,
        website: row.website,
        notes: row.notes,
        sourceMetadata: row.sourceMetadata,
        createdBy: actor.userId,
        updatedBy: actor.userId,
      }));
      await forChunks(companyValues, async (chunk) => {
        const returned = await tx
          .insert(companies)
          .values(chunk)
          .onConflictDoUpdate({
            target: [companies.tenantId, companies.externalCompanyNo],
            targetWhere: sql`${companies.deletedAt} is null and ${companies.externalCompanyNo} is not null`,
            set: {
              companyType: sql`excluded.company_type`,
              relationTypeId: sql`excluded.relation_type_id`,
              customerStatusId: sql`excluded.customer_status_id`,
              companyGroupId: sql`coalesce(excluded.company_group_id, ${companies.companyGroupId})`,
              contactSourceId: sql`coalesce(excluded.contact_source_id, ${companies.contactSourceId})`,
              sector: sql`coalesce(excluded.sector, ${companies.sector})`,
              legalTitle: sql`excluded.legal_title`,
              taxOffice: sql`coalesce(excluded.tax_office, ${companies.taxOffice})`,
              taxNumber: sql`coalesce(excluded.tax_number, ${companies.taxNumber})`,
              website: sql`coalesce(excluded.website, ${companies.website})`,
              notes: sql`coalesce(excluded.notes, ${companies.notes})`,
              sourceMetadata: sql`excluded.source_metadata`,
              updatedBy: actor.userId,
              updatedAt: new Date(),
            },
          })
          .returning({ id: companies.id, externalCompanyNo: companies.externalCompanyNo });
        for (const row of returned) if (row.externalCompanyNo) companyIdByNo.set(row.externalCompanyNo, row.id);
      });

      const companyIds = [...companyIdByNo.values()];
      await forChunks(
        companyIds.map((companyId) => ({ tenantId: actor.tenantId, companyId, divisionId, addedByUserId: actor.userId })),
        (chunk) => tx.insert(companyDivisions).values(chunk).onConflictDoNothing(),
      );
      const groupAssignments = validCompanies.flatMap((row) => {
        const companyId = companyIdByNo.get(row.externalNo);
        const companyGroupId = row.groupName ? groupMap.get(matchKey(row.groupName)) : null;
        return companyId && companyGroupId ? [{ tenantId: actor.tenantId, companyId, companyGroupId }] : [];
      });
      await forChunks(groupAssignments, (chunk) => tx.insert(companyGroupAssignments).values(chunk).onConflictDoNothing());

      const [currentAddresses, currentPhones, currentEmails] = companyIds.length
        ? await Promise.all([
            tx.select().from(companyAddresses).where(and(inArray(companyAddresses.companyId, companyIds), isNull(companyAddresses.deletedAt))),
            tx.select().from(companyPhones).where(and(inArray(companyPhones.companyId, companyIds), isNull(companyPhones.deletedAt))),
            tx.select().from(companyEmails).where(and(inArray(companyEmails.companyId, companyIds), isNull(companyEmails.deletedAt))),
          ])
        : [[], [], []];
      const addressByCompany = new Map<string, (typeof currentAddresses)[number]>();
      for (const row of currentAddresses) if (!addressByCompany.has(row.companyId) || row.isDefault) addressByCompany.set(row.companyId, row);
      const phoneByKey = new Map(currentPhones.map((row) => [`${row.companyId}:${row.phoneType}`, row]));
      const emailByKey = new Map(currentEmails.map((row) => [`${row.companyId}:${row.emailType}`, row]));

      const addressValues = validCompanies.flatMap((row) => {
        const companyId = companyIdByNo.get(row.externalNo);
        if (!companyId || !Object.values(row.address).some(Boolean)) return [];
        const current = addressByCompany.get(companyId);
        return [{
          id: current?.id,
          tenantId: actor.tenantId,
          companyId,
          addressType: current?.addressType ?? 'office',
          country: row.address.country ?? current?.country ?? 'Türkiye',
          province: row.address.province ?? current?.province ?? null,
          district: row.address.district ?? current?.district ?? null,
          zipCode: row.address.zipCode ?? current?.zipCode ?? null,
          buildingNumber: row.address.buildingNumber ?? current?.buildingNumber ?? null,
          fullAddress: row.address.fullAddress ?? current?.fullAddress ?? null,
          latitude: row.address.latitude ?? current?.latitude ?? null,
          longitude: row.address.longitude ?? current?.longitude ?? null,
          locationSource: row.address.latitude && row.address.longitude ? 'import' : current?.locationSource ?? null,
          isDefault: true,
          isShipping: current?.isShipping ?? true,
          isBilling: current?.isBilling ?? true,
          deletedAt: null,
        }];
      });
      await forChunks(addressValues, (chunk) => tx.insert(companyAddresses).values(chunk).onConflictDoUpdate({
        target: companyAddresses.id,
        set: {
          country: sql`excluded.country`, province: sql`excluded.province`, district: sql`excluded.district`,
          zipCode: sql`excluded.zip_code`, buildingNumber: sql`excluded.building_number`, fullAddress: sql`excluded.full_address`,
          latitude: sql`excluded.latitude`, longitude: sql`excluded.longitude`, locationSource: sql`excluded.location_source`,
          isDefault: sql`excluded.is_default`, isShipping: sql`excluded.is_shipping`, isBilling: sql`excluded.is_billing`,
          deletedAt: null, updatedAt: new Date(),
        },
      }));

      const phoneValues = validCompanies.flatMap((row) => {
        const companyId = companyIdByNo.get(row.externalNo);
        if (!companyId) return [];
        return (Object.entries(row.phones) as Array<[string, string | null]>).flatMap(([phoneType, phone]) => {
          if (!phone) return [];
          const current = phoneByKey.get(`${companyId}:${phoneType}`);
          return [{ id: current?.id, tenantId: actor.tenantId, companyId, phoneType, phone, isDefault: phoneType === 'main', deletedAt: null }];
        });
      });
      await forChunks(phoneValues, (chunk) => tx.insert(companyPhones).values(chunk).onConflictDoUpdate({
        target: companyPhones.id,
        set: { phone: sql`excluded.phone`, isDefault: sql`excluded.is_default`, deletedAt: null, updatedAt: new Date() },
      }));

      const emailValues = validCompanies.flatMap((row) => {
        const companyId = companyIdByNo.get(row.externalNo);
        if (!companyId) return [];
        return (Object.entries(row.emails) as Array<[string, string | null]>).flatMap(([emailType, email]) => {
          if (!email) return [];
          const current = emailByKey.get(`${companyId}:${emailType}`);
          return [{ id: current?.id, tenantId: actor.tenantId, companyId, emailType, email, isDefault: emailType === 'main', deletedAt: null }];
        });
      });
      await forChunks(emailValues, (chunk) => tx.insert(companyEmails).values(chunk).onConflictDoUpdate({
        target: companyEmails.id,
        set: { email: sql`excluded.email`, isDefault: sql`excluded.is_default`, deletedAt: null, updatedAt: new Date() },
      }));

      for (const row of validContacts.filter((item) => item.existingId && item.matchKind !== 'external_no')) {
        await tx.update(contacts).set({ externalContactNo: row.externalNo, updatedBy: actor.userId }).where(eq(contacts.id, row.existingId!));
      }
      const contactValues = validContacts.flatMap((row) => {
        const companyId = companyIdByNo.get(row.companyNo);
        if (!companyId) return [];
        return [{
          tenantId: actor.tenantId,
          companyId,
          externalContactNo: row.externalNo,
          fullName: normalizePersonName(row.fullName),
          title: row.title,
          department: row.department,
          decisionRoleId: row.decisionRoleCode ? roleMap.get(row.decisionRoleCode) ?? null : null,
          workPhone: row.workPhone,
          mobilePhone: row.mobilePhone,
          otherPhone: row.otherPhone,
          workEmail: row.workEmail,
          personalEmail: row.personalEmail,
          otherEmail: row.otherEmail,
          gender: row.gender,
          birthDate: row.birthDate,
          notes: row.notes,
          isPrimary: row.isPrimary,
          sourceMetadata: row.sourceMetadata,
          createdBy: actor.userId,
          updatedBy: actor.userId,
        }];
      });
      await forChunks(contactValues, async (chunk) => {
        const returned = await tx.insert(contacts).values(chunk).onConflictDoUpdate({
          target: [contacts.tenantId, contacts.externalContactNo],
          targetWhere: sql`${contacts.deletedAt} is null and ${contacts.externalContactNo} is not null`,
          set: {
            companyId: sql`excluded.company_id`, fullName: sql`excluded.full_name`,
            title: sql`coalesce(excluded.title, ${contacts.title})`, department: sql`coalesce(excluded.department, ${contacts.department})`,
            decisionRoleId: sql`coalesce(excluded.decision_role_id, ${contacts.decisionRoleId})`,
            workPhone: sql`coalesce(excluded.work_phone, ${contacts.workPhone})`, mobilePhone: sql`coalesce(excluded.mobile_phone, ${contacts.mobilePhone})`,
            otherPhone: sql`coalesce(excluded.other_phone, ${contacts.otherPhone})`, workEmail: sql`coalesce(excluded.work_email, ${contacts.workEmail})`,
            personalEmail: sql`coalesce(excluded.personal_email, ${contacts.personalEmail})`, otherEmail: sql`coalesce(excluded.other_email, ${contacts.otherEmail})`,
            gender: sql`coalesce(excluded.gender, ${contacts.gender})`, birthDate: sql`coalesce(excluded.birth_date, ${contacts.birthDate})`,
            notes: sql`coalesce(excluded.notes, ${contacts.notes})`, isPrimary: sql`excluded.is_primary`,
            sourceMetadata: sql`excluded.source_metadata`, updatedBy: actor.userId, updatedAt: new Date(),
          },
        }).returning({ id: contacts.id, externalContactNo: contacts.externalContactNo });
        for (const row of returned) if (row.externalContactNo) contactIdByNo.set(row.externalContactNo, row.id);
      });
      const contactLinks = validContacts.flatMap((row) => {
        const contactId = contactIdByNo.get(row.externalNo);
        const companyId = companyIdByNo.get(row.companyNo);
        return contactId && companyId ? [{ tenantId: actor.tenantId, contactId, companyId, isPrimary: true, role: row.title }] : [];
      });
      await forChunks(contactLinks, (chunk) => tx.insert(contactCompanies).values(chunk).onConflictDoUpdate({
        target: [contactCompanies.contactId, contactCompanies.companyId],
        set: { isPrimary: true, role: sql`excluded.role` },
      }));
    });

    const result: CompanyContactImportCommitResult = {
      ok: true,
      companies: {
        created: validCompanies.filter((row) => !row.existingId).length,
        updated: validCompanies.filter((row) => Boolean(row.existingId)).length,
        skipped: analysis.companies.length - validCompanies.length,
      },
      contacts: {
        created: validContacts.filter((row) => !row.existingId).length,
        updated: validContacts.filter((row) => Boolean(row.existingId)).length,
        skipped: analysis.contacts.length - validContacts.length,
      },
      warnings: analysis.issues.filter((issue) => issue.severity === 'warning').length,
      errors: analysis.issues.filter((issue) => issue.severity === 'error').length,
    };
    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'company_contact_excel_import.committed',
      resourceType: 'company_contact_import',
      oldValues: { companiesFile: input.companiesFile.fileName, contactsFile: input.contactsFile.fileName },
      newValues: result,
    });
    return result;
  }
}
