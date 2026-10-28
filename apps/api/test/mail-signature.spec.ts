import { describe, expect, it, vi } from 'vitest';
import { mailSignatureSchema } from '@haksan/shared';
import { UserMailAccountService } from '../src/shared/mailer/user-mail-account.service';

vi.mock('../src/shared/mailer/credential-crypto', () => ({ decryptCredential: () => 'test-password', encryptCredential: vi.fn() }));

vi.hoisted(() => {
  process.env.S3_ACCESS_KEY_ID = 'unit-test';
  process.env.S3_SECRET_ACCESS_KEY = 'unit-test-only';
  process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:5432/test';
  process.env.JWT_ACCESS_SECRET = 'unit-test-access-secret-with-32-characters';
  process.env.JWT_REFRESH_SECRET = 'unit-test-refresh-secret-with-32-characters';
});

const actor = { tenantId: 'tenant-a', userId: 'user-a', roles: [] } as any;
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6N1sAAAAASUVORK5CYII=';

function accountService(account: object | undefined = {}) {
  const where = vi.fn().mockResolvedValue([]);
  const set = vi.fn(() => ({ where }));
  const findFirst = vi.fn().mockResolvedValue(account);
  const target = vi.fn().mockResolvedValue({ id: actor.userId });
  const image = vi.fn().mockResolvedValue({ image: (account as any)?.signatureImage, filename: (account as any)?.signatureFilename });
  const upsert = vi.fn().mockResolvedValue([]);
  const values = vi.fn(() => ({ onConflictDoUpdate: upsert }));
  const db = { query: { userMailAccounts: { findFirst }, userMailSignatures: { findFirst: image }, users: { findFirst: target } }, update: vi.fn(() => ({ set })), insert: vi.fn(() => ({ values })) };
  // Constructor config is irrelevant to self-scoped signature validation.
  const service = Object.create(UserMailAccountService.prototype) as UserMailAccountService;
  Object.assign(service, { db, audit: { write: vi.fn().mockResolvedValue(undefined) }, defaultSignature: async () => '', env: { USER_MAIL_ENABLED: true, USER_MAIL_CREDENTIAL_ENCRYPTION_KEY: 'test-key' } });
  return { service, db, set, where, findFirst, target, values, upsert };
}

describe('Mail signature', () => {
  it('sends navy HTML, plain alternative and a matching inline image through SMTP', async () => {
    const { service } = accountService({ status: 'active', email: 'sender@example.com', displayName: 'Sender', encryptedPassword: 'test', signatureImage: png, signatureFilename: 'imza.png' });
    const sendMail = vi.fn().mockResolvedValue({ messageId: 'sent-id' });
    const close = vi.fn();
    Object.assign(service, { createTransport: () => ({ sendMail, close }) });
    const pdf = { filename: 'teklif.pdf', content: Buffer.from('pdf'), contentType: 'application/pdf' };
    await service.send({ to: 'recipient@example.com', subject: 'Teklif', text: 'Merhaba,\n\n**Ekte**.', attachments: [pdf] }, actor);
    const message = sendMail.mock.calls[0][0];
    expect(message.text).toBe('Merhaba,\n\nEkte.');
    expect(message.html).toContain('color:#17365d');
    expect(message.html).toContain('Merhaba,<br><br><strong>Ekte</strong>.');
    expect(message.attachments[0]).toEqual(pdf);
    expect(message.attachments[1].content).toBeInstanceOf(Buffer);
    expect(message.html).toContain(`cid:${message.attachments[1].cid}`);
    expect(message).toMatchObject({ disableFileAccess: true, disableUrlAccess: true });
    expect(close).toHaveBeenCalled();
  });
  it('accepts raster images and removal, rejects SVG and path filenames', () => {
    expect(mailSignatureSchema.safeParse({ image: png, filename: 'imza.png' }).success).toBe(true);
    expect(mailSignatureSchema.safeParse({ image: null, filename: null }).success).toBe(true);
    expect(mailSignatureSchema.safeParse({ image: png, filename: '../imza.png' }).success).toBe(false);
    expect(mailSignatureSchema.safeParse({ image: 'data:image/svg+xml;base64,PHN2Zz4=', filename: 'imza.svg' }).success).toBe(false);
    expect(mailSignatureSchema.safeParse({ image: png, filename: null }).success).toBe(false);
  });
  it('checks bytes, declared MIME, extension and size before saving', async () => {
    const { service, values } = accountService();
    await service.saveSignature({ image: png, filename: 'imza.png' }, actor);
    expect(values).toHaveBeenCalledWith({ tenantId: actor.tenantId, userId: actor.userId, image: png, filename: 'imza.png' });
    values.mockClear();
    await expect(service.saveSignature({ image: 'data:image/png;base64,PHNjcmlwdD4=', filename: 'imza.png' }, actor)).rejects.toThrow('eşleşmiyor');
    await expect(service.saveSignature({ image: png, filename: 'imza.jpg' }, actor)).rejects.toThrow('eşleşmiyor');
    await expect(service.saveSignature({ image: `data:image/png;base64,${Buffer.alloc(2 * 1024 * 1024 + 1).toString('base64')}`, filename: 'imza.png' }, actor)).rejects.toThrow('2 MB');
    expect(values).not.toHaveBeenCalled();
  });
  it('rejects other-user writes by ordinary admins before looking up a target', async () => {
    const { service, target, db } = accountService();
    await expect(service.saveSignature({ image: png, filename: 'imza.png' }, { ...actor, roles: ['admin'] }, 'user-b')).rejects.toThrow('süper admin');
    expect(target).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });
  it('allows super admin to prepare a signature before SMTP is connected', async () => {
    const { service, values, findFirst } = accountService(undefined);
    findFirst.mockResolvedValue(undefined);
    await service.saveSignature({ image: png, filename: 'imza.png' }, { ...actor, roles: ['super_admin'] }, 'user-b');
    expect(values).toHaveBeenCalledWith({ tenantId: actor.tenantId, userId: 'user-b', image: png, filename: 'imza.png' });
    expect(findFirst).not.toHaveBeenCalled();
  });
  it('rejects a missing or foreign-tenant target without writing', async () => {
    const { service, db, target } = accountService();
    target.mockResolvedValue(undefined);
    await expect(service.saveSignature({ image: png, filename: 'imza.png' }, { ...actor, roles: ['super_admin'] }, 'foreign-user')).rejects.toThrow('Kullanıcı');
    expect(db.insert).not.toHaveBeenCalled();
    expect(target).toHaveBeenCalledWith({ where: expect.any(Object) });
  });
});
