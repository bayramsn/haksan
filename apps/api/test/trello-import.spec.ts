import { describe, expect, it, vi } from 'vitest';
import {
  trelloImportCommitRequestSchema,
  trelloImportPreviewRequestSchema,
} from '@haksan/shared';
import { OpportunitiesService } from '../src/modules/opportunities/opportunities.service';
import {
  extractTrelloCompanyCandidate,
  scoreTrelloCompanyCandidate,
} from '../src/shared/utils/trello-company-resolution';

function previewService(existingReferences: string[] = []) {
  const db = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue(
          existingReferences.map((externalReference) => ({ externalReference }))
        ),
      })),
    })),
  };
  return new OpportunitiesService(db as any, {} as any, {} as any);
}

const actor = {
  tenantId: '11111111-1111-4111-8111-111111111111',
  userId: '22222222-2222-4222-8222-222222222222',
  roles: ['super_admin'],
  permissions: new Set<string>(),
  accessScopes: [],
  divisionIds: [],
  departmentIds: [],
  activeDivisionId: null,
  activeDepartmentId: null,
  primaryDivisionId: null,
  primaryDepartmentId: null,
  canViewAllDivisions: true,
} as any;

describe('Trello CSV sales-card import', () => {
  it('parses quoted Trello CSV rows, maps list stages and skips duplicate cards', async () => {
    const csv = [
      'Card ID,Card Name,Card Description,Board Name,List Name,Card URL,Due Date,Archived',
      'abc-1,"Yeni, CNC talebi","Satır 1',
      'Satır 2","Haksan, Satış",Teklif,https://trello.com/c/abc123,2026-08-01,false',
      'abc-1,"Aynı kart",,"Haksan, Satış",Teklif,https://trello.com/c/abc123,,false',
      'abc-2,,Eksik başlık,Haksan,Lead,https://trello.com/c/def456,,false',
    ].join('\n');
    const service = previewService();

    const result = await service.previewTrelloImport(
      {
        fileName: 'trello-export.csv',
        fileBase64: Buffer.from(csv, 'utf8').toString('base64'),
      },
      actor
    );

    expect(result.summary).toEqual({ total: 3, create: 1, skip: 1, error: 1 });
    expect(result.rows[0]).toMatchObject({
      title: 'Yeni, CNC talebi',
      description: 'Satır 1\nSatır 2',
      boardName: 'Haksan, Satış',
      listName: 'Teklif',
      stageCode: 'quote',
      status: 'create',
    });
    expect(result.rows[1].status).toBe('skip');
    expect(result.rows[2].errors).toContain('Kart adı boş');
  });

  it('marks a card already stored in CRM as duplicate', async () => {
    const csv = [
      'Card ID,Card Name,List Name,Card URL',
      'abc-1,Mevcut kart,Lead,https://trello.com/c/abc123',
    ].join('\n');
    const service = previewService(['https://trello.com/c/abc123']);

    const result = await service.previewTrelloImport(
      {
        fileName: 'trello.csv',
        fileBase64: Buffer.from(csv, 'utf8').toString('base64'),
      },
      actor
    );

    expect(result.summary).toEqual({ total: 1, create: 0, skip: 1, error: 0 });
    expect(result.rows[0].warnings).toContain('Bu Trello kartı daha önce aktarıldı');
  });

  it('rejects non-CSV preview files and more than 500 commit rows', () => {
    expect(
      trelloImportPreviewRequestSchema.safeParse({
        fileName: 'trello.xlsx',
        fileBase64: 'YWJj',
      }).success
    ).toBe(false);

    const row = {
      rowNumber: 1,
      trelloCardId: 'abc-1',
      externalReference: 'trello:abc-1',
      title: 'Kart',
      stageCode: 'sales',
      archived: false,
    };
    const parsed = trelloImportCommitRequestSchema.safeParse({
      divisionId: '33333333-3333-4333-8333-333333333333',
      currencyCode: 'EUR',
      rows: Array.from({ length: 501 }, (_, index) => ({ ...row, rowNumber: index + 1 })),
    });
    expect(parsed.success).toBe(false);
  });

  it('extracts editable company/contact data and scores CRM as the master record', () => {
    const candidate = extractTrelloCompanyCandidate(
      'Göler Makina / Afyon',
      'Göler Makina Ömer Göler 0544 631 22 70 info@golermakina.com.tr'
    );
    expect(candidate).toMatchObject({
      companyTitle: 'Göler Makina',
      province: 'Afyon',
      phone: '0544 631 22 70',
      email: 'info@golermakina.com.tr',
    });
    const match = scoreTrelloCompanyCandidate(candidate, {
      id: 'company-1',
      legalTitle: 'GÖLER MAKİNA SANAYİ VE TİCARET LTD. ŞTİ.',
      shortName: 'GÖLER MAKİNA',
      primaryPhone: '+90 544 631 22 70',
      primaryEmail: 'muhasebe@golermakina.com.tr',
      website: 'https://golermakina.com.tr',
      province: 'Afyon',
    });
    expect(match?.confidence).toBe('strong');
    expect(match?.score).toBeGreaterThanOrEqual(90);
    expect(match?.reasons).toContain('Telefon aynı');
  });

  it('requires an explicit existing, create or skip company decision per imported card', () => {
    const base = {
      rowNumber: 1,
      trelloCardId: 'abc-1',
      externalReference: 'trello:abc-1',
      title: 'Göler Makina / Afyon',
      stageCode: 'sales',
      archived: false,
      candidate: { companyTitle: 'Göler Makina' },
    };
    expect(
      trelloImportCommitRequestSchema.safeParse({
        divisionId: '33333333-3333-4333-8333-333333333333',
        currencyCode: 'EUR',
        rows: [base],
      }).success
    ).toBe(false);
    expect(
      trelloImportCommitRequestSchema.safeParse({
        divisionId: '33333333-3333-4333-8333-333333333333',
        currencyCode: 'EUR',
        rows: [{ ...base, resolution: { action: 'skip' } }],
      }).success
    ).toBe(true);
  });
});
