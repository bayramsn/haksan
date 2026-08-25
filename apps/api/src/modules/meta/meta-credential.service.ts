import { Injectable } from '@nestjs/common';
import { loadEnv } from '../../config/env';
import { decryptCredential, encryptCredential } from '../../shared/mailer/credential-crypto';
import { MetaConfigurationError } from './meta.errors';

@Injectable()
export class MetaCredentialService {
  private encryptionKey(): string {
    const key = loadEnv().META_CREDENTIAL_ENCRYPTION_KEY;
    if (!key) throw new MetaConfigurationError();
    return key;
  }

  encryptAccessToken(tenantId: string, connectionId: string, token: string): string {
    return encryptCredential(token, this.encryptionKey(), `meta:${tenantId}:${connectionId}:access-token`);
  }

  decryptAccessToken(tenantId: string, connectionId: string, envelope: string): string {
    try {
      return decryptCredential(envelope, this.encryptionKey(), `meta:${tenantId}:${connectionId}:access-token`);
    } catch {
      throw new MetaConfigurationError('Meta erişim bilgisi çözülemedi');
    }
  }
}
