import { describe, expect, it, vi } from 'vitest';
import { AuditService } from '../src/shared/database/audit.service';

describe('AuditService secret redaction', () => {
  it('Meta kimlik bilgilerini ve iç içe token alanlarını audit kaydından çıkarır', async () => {
    const values = vi.fn().mockResolvedValue(undefined);
    const db = {
      insert: vi.fn(() => ({ values })),
    };
    const service = new AuditService(db as never);

    await service.write({
      tenantId: 'tenant-1',
      action: 'meta.connection.updated',
      resourceType: 'meta_connection',
      newValues: {
        accessToken: 'live-access-token',
        encryptedAccessToken: 'ciphertext',
        nested: {
          appSecret: 'app-secret',
          app_secret: 'snake-app-secret',
          clientSecret: 'client-secret',
          access_token: 'snake-access-token',
          webhookVerifyToken: 'verify-token',
        },
        pageId: 'page-1',
      },
    });

    expect(values).toHaveBeenCalledOnce();
    expect(values.mock.calls[0]?.[0].newValues).toEqual({
      accessToken: '[REDACTED]',
      encryptedAccessToken: '[REDACTED]',
      nested: {
        appSecret: '[REDACTED]',
        app_secret: '[REDACTED]',
        clientSecret: '[REDACTED]',
        access_token: '[REDACTED]',
        webhookVerifyToken: '[REDACTED]',
      },
      pageId: 'page-1',
    });
  });
});
