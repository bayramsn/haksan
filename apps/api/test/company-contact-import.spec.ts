import ExcelJS from 'exceljs';
import { describe, expect, it, vi } from 'vitest';
import { companyContactImportCommitSchema, companyContactImportPreviewSchema } from '@haksan/shared';
import { CompanyContactImportService } from '../src/modules/companies/company-contact-import.service';

const superAdmin = {
  tenantId: '11111111-1111-4111-8111-111111111111',
  userId: '22222222-2222-4222-8222-222222222222',
  roles: ['super_admin'],
  permissions: new Set<string>(),
  accessScopes: [],
  divisionIds: ['33333333-3333-4333-8333-333333333333'],
  departmentIds: [],
  activeDivisionId: '33333333-3333-4333-8333-333333333333',
  activeDepartmentId: null,
  primaryDivisionId: '33333333-3333-4333-8333-333333333333',
  primaryDepartmentId: null,
  canViewAllDivisions: true,
} as any;

function service(existingCompanies: any[] = [], existingContacts: any[] = []) {
  const db = {
    query: {
      companies: { findMany: vi.fn().mockResolvedValue(existingCompanies) },
      contacts: { findMany: vi.fn().mockResolvedValue(existingContacts) },
    },
  };
  return new CompanyContactImportService(db as any, { write: vi.fn() } as any);
}

async function workbookFile(fileName: string, headers: string[], rows: Array<Array<string | number | Date>>) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Liste');
  sheet.addRow(headers);
  rows.forEach((row) => sheet.addRow(row));
  const buffer = await workbook.xlsx.writeBuffer();
  return {
    fileName,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    fileBase64: Buffer.from(buffer).toString('base64'),
  };
}

async function sampleInput() {
  return {
    companiesFile: await workbookFile(
      'Firma-Listesi.xlsx',
      ['NO', 'FİRMA ADI', 'TİP', 'DURUM', 'E-POSTA', 'TELEFON', 'ŞEHİR', 'VERGİ NO'],
      [
        [100, 'Örnek Makina Ltd. Şti.', 'Müşteri', 'Cari', 'teklif@ornek.test', '+90 212 000 00 01', 'İstanbul', '1234567890'],
        [200, 'İkinci Sanayi A.Ş.', 'Tedarikçi', 'Potansiyel', 'gecersiz-adres', '', 'Bursa', ''],
      ]
    ),
    contactsFile: await workbookFile(
      'Kontak-Listesi.xlsx',
      ['NO', 'FİRMA', 'FIRMA NO', 'KONTAK ADI', 'ÜNVAN', 'İŞ E-POSTA', 'KARAR VERME'],
      [
        [10, 'Örnek Makina Ltd. Şti.', 100, 'Ayşe Yılmaz', 'Satın Alma Müdürü', 'ayse@ornek.test', 'Karar Verici'],
        [11, 'Dosyada olmayan firma', 999, 'Mehmet Demir', 'Yetkili', 'mehmet@example.test', ''],
      ]
    ),
    divisionId: superAdmin.activeDivisionId,
  };
}

describe('firma ve kontak Excel aktarımı', () => {
  it('Firma NO ile kontakları eşleştirir ve sorunlu satırları önizlemede ayırır', async () => {
    const input = await sampleInput();
    const preview = await service().preview(input, superAdmin);

    expect(preview.summary).toEqual({
      companyRows: 2,
      companyCreates: 2,
      companyUpdates: 0,
      companySkipped: 0,
      contactRows: 2,
      contactCreates: 1,
      contactUpdates: 0,
      contactSkipped: 1,
      warnings: 1,
      errors: 1,
    });
    expect(preview.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'company', sourceNo: '200', severity: 'warning' }),
      expect.objectContaining({ kind: 'contact', sourceNo: '11', companyNo: '999', severity: 'error' }),
    ]));
  });

  it('mevcut Firma NO ve Kontak NO kayıtlarını güncelleme olarak sınıflandırır', async () => {
    const input = await sampleInput();
    const preview = await service(
      [{ id: 'company-100', tenantId: superAdmin.tenantId, externalCompanyNo: '100', legalTitle: 'ESKİ UNVAN', taxNumber: null, deletedAt: null }],
      [{ id: 'contact-10', tenantId: superAdmin.tenantId, companyId: 'company-100', externalContactNo: '10', fullName: 'ESKİ KİŞİ', deletedAt: null }]
    ).preview(input, superAdmin);

    expect(preview.summary.companyUpdates).toBe(1);
    expect(preview.summary.companyCreates).toBe(1);
    expect(preview.summary.contactUpdates).toBe(1);
    expect(preview.summary.contactCreates).toBe(0);
  });

  it('yalnızca XLSX ve açık onaylı commit şemasını kabul eder; normal kullanıcıyı engeller', async () => {
    const input = await sampleInput();
    expect(companyContactImportPreviewSchema.safeParse(input).success).toBe(true);
    expect(companyContactImportCommitSchema.safeParse({ ...input, confirmed: false }).success).toBe(false);
    expect(companyContactImportCommitSchema.safeParse({ ...input, confirmed: true }).success).toBe(true);
    await expect(service().preview(input, { ...superAdmin, roles: ['admin'] })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});
