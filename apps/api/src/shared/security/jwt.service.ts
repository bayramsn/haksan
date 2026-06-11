import { Injectable } from '@nestjs/common';
import { JwtService as NestJwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import { loadEnv } from '../../config/env';

export interface AccessTokenPayload {
  sub: string;       // user id
  tid: string;       // tenant id
  email: string;
  roles: string[];
  sid: string;       // session id
}

@Injectable()
export class JwtTokenService {
  private env = loadEnv();

  constructor(private readonly nest: NestJwtService) {}

  signAccess(payload: AccessTokenPayload): string {
    return this.nest.sign(payload, {
      secret: this.env.JWT_ACCESS_SECRET,
      expiresIn: this.env.JWT_ACCESS_TTL,
    });
  }

  verifyAccess(token: string): AccessTokenPayload {
    return this.nest.verify<AccessTokenPayload>(token, { secret: this.env.JWT_ACCESS_SECRET });
  }

  /**
   * Refresh tokens are opaque: a 256-bit random secret stored in an httpOnly cookie.
   * The server stores SHA-256(token) in DB. On rotation the old hash is marked
   * revoked + replaced_by_id.
   */
  generateRefreshToken(): { raw: string; hash: string } {
    const raw = randomBytes(32).toString('base64url');
    const hash = createHash('sha256').update(raw).digest('hex');
    return { raw, hash };
  }

  hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }
}
