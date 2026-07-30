import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const VERSION = 'v1';

export function decodeCredentialKey(encodedKey: string): Buffer {
  const key = Buffer.from(encodedKey, 'base64');
  if (key.length !== 32) throw new Error('Credential encryption key must contain 32 bytes');
  return key;
}

export function encryptCredential(plainText: string, encodedKey: string, aad: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, decodeCredentialKey(encodedKey), iv);
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join('.');
}

export function decryptCredential(envelope: string, encodedKey: string, aad: string): string {
  const [version, ivEncoded, tagEncoded, encryptedEncoded, ...rest] = envelope.split('.');
  if (version !== VERSION || !ivEncoded || !tagEncoded || !encryptedEncoded || rest.length > 0) {
    throw new Error('Invalid credential envelope');
  }
  const iv = Buffer.from(ivEncoded, 'base64');
  const tag = Buffer.from(tagEncoded, 'base64');
  if (iv.length !== 12 || tag.length !== 16) throw new Error('Invalid credential envelope');
  const decipher = createDecipheriv(ALGORITHM, decodeCredentialKey(encodedKey), iv);
  decipher.setAAD(Buffer.from(aad, 'utf8'));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(Buffer.from(encryptedEncoded, 'base64')), decipher.final()]).toString('utf8');
}
