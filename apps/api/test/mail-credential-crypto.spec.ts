import { describe, expect, it } from 'vitest';
import { decryptCredential, encryptCredential } from '../src/shared/mailer/credential-crypto';

const key = Buffer.alloc(32, 7).toString('base64');
const aad = 'tenant-1:user-1';

describe('Webmail credential encryption', () => {
  it('AES-256-GCM zarfını yalnız doğru anahtar ve kullanıcı bağlamıyla açar', () => {
    const encrypted = encryptCredential('gizli-webmail-parolasi', key, aad);
    expect(encrypted).not.toContain('gizli-webmail-parolasi');
    expect(decryptCredential(encrypted, key, aad)).toBe('gizli-webmail-parolasi');
    expect(() => decryptCredential(encrypted, key, 'tenant-1:user-2')).toThrow();
  });

  it('değiştirilmiş şifreli veriyi reddeder', () => {
    const encrypted = encryptCredential('parola', key, aad);
    const tampered = `${encrypted.slice(0, -2)}AA`;
    expect(() => decryptCredential(tampered, key, aad)).toThrow();
  });
});
