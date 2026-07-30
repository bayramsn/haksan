import { describe, expect, it, vi } from 'vitest';
import { AssistantApprovalService } from '../src/modules/assistant/assistant-approval.service';

const actor = {
  userId: '33333333-3333-4333-8333-333333333333',
  tenantId: '44444444-4444-4444-8444-444444444444',
  email: 'user@example.com',
  roles: ['sales'],
  permissions: new Set(['companies.read', 'quotes.create', 'activities.create']),
  divisionIds: [],
  primaryDivisionId: null,
  departmentIds: [],
  primaryDepartmentId: null,
  canViewAllDivisions: false,
  activeDivisionId: null,
  activeDepartmentId: null,
  accessScopes: [],
};

function buildService(options: { mailConfigured?: boolean; catalogItems?: Array<Record<string, unknown>> } = {}) {
  const values = vi.fn(async () => undefined);
  const db = { insert: vi.fn(() => ({ values })) };
  const companies = {
    get: vi.fn(async () => ({
      id: '11111111-1111-4111-8111-111111111111',
      legalTitle: 'Acme Makina A.Ş.',
      shortName: 'Acme',
    })),
  };
  const mailer = {
    isConfigured: vi.fn(() => options.mailConfigured ?? true),
    canSendFor: vi.fn(async () => options.mailConfigured ?? true),
  };
  const quotes = {
    previewCatalogItems: vi.fn(async () => options.catalogItems ?? []),
  };
  const service = new AssistantApprovalService(
    db as never,
    companies as never,
    {} as never,
    quotes as never,
    {} as never,
    {} as never,
    mailer as never
  );
  return { service, values, quotes };
}

describe('Assistant approval cards', () => {
  it('işlemi çalıştırmadan sunucuda bekleyen teklif onay kartı oluşturur', async () => {
    const { service, values } = buildService();
    const card = await service.create(
      {
        kind: 'create_quote',
        arguments: {
          companyId: '11111111-1111-4111-8111-111111111111',
          currencyCode: 'USD',
          validityDays: 30,
          notes: 'Test teklif taslağı',
        },
      },
      actor,
      'Acme için teklif oluştur'
    );

    expect(card).toMatchObject({
      action: 'create_quote',
      title: 'Teklif taslağı oluştur',
      impact: 'medium',
      status: 'pending',
    });
    expect(card.fields).toContainEqual({ label: 'Firma', value: 'Acme' });
    expect(values).toHaveBeenCalledTimes(1);
    expect(values.mock.calls[0]?.[0]).toMatchObject({
      eventType: 'approval_requested',
      status: 'pending',
      action: 'create_quote',
    });
  });

  it('SMTP yapılandırılmadan dış e-posta onayı üretmez', async () => {
    const { service, values } = buildService({ mailConfigured: false });
    await expect(
      service.create(
        {
          kind: 'send_email',
          arguments: { to: 'customer@example.com', subject: 'Bilgilendirme', body: 'Merhaba' },
        },
        actor,
        'müşteriye gönder'
      )
    ).rejects.toThrow('SMTP ayarları tamamlanmamış');
    expect(values).not.toHaveBeenCalled();
  });

  it('akıllı teklifte yalnız sunucu katalog fiyatını onay kartında gösterir', async () => {
    const productModelId = '22222222-2222-4222-8222-222222222222';
    const { service, quotes } = buildService({
      catalogItems: [{
        productModelId,
        description: 'Haksan VM-2 CNC',
        quantity: 2,
        unitPrice: 125_000,
        discountPercent: 5,
        discountAmount: 12_500,
        vatRate: 20,
      }],
    });
    const card = await service.create(
      {
        kind: 'create_quote',
        arguments: {
          companyId: '11111111-1111-4111-8111-111111111111',
          currencyCode: 'USD',
          items: [{ productModelId, quantity: 2, discountPercent: 5 }],
        },
      },
      actor,
      'Acme için 2 adet VM-2 teklif hazırla'
    );

    expect(quotes.previewCatalogItems).toHaveBeenCalledWith(
      [{ productModelId, quantity: 2, discountPercent: 5 }],
      actor,
      undefined,
      'USD'
    );
    expect(card.fields).toContainEqual({ label: 'Katalog Kalemi', value: 'Haksan VM-2 CNC · 2 adet · 125.000 USD · %5 indirim' });
  });

  it('satış paketi için seçilen her alt işlemin yetkisini zorunlu tutar', async () => {
    const { service } = buildService();
    await expect(
      service.create(
        { kind: 'create_sales_package', arguments: { quoteId: '22222222-2222-4222-8222-222222222222' } },
        { ...actor, permissions: new Set(['companies.read', 'quotes.read']) },
        'satış paketi hazırla'
      )
    ).rejects.toThrow('Yetki gerekli: proformas.create');
  });

  it('e-posta başlığında header injection girişimini reddeder', async () => {
    const { service, values } = buildService();
    await expect(
      service.create(
        {
          kind: 'send_email',
          arguments: {
            to: 'customer@example.com',
            subject: 'Teklif\r\nBcc: attacker@example.com',
            body: 'Merhaba',
          },
        },
        actor,
        'müşteriye gönder'
      )
    ).rejects.toThrow('E-posta konusu satır sonu içeremez');
    expect(values).not.toHaveBeenCalled();
  });
});
