import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt } from 'drizzle-orm';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import type { DbClient } from '../../db/client';
import {
  users,
  loginSessions,
  refreshTokens,
  passwordResetTokens,
  userRoles,
  roles as rolesTable,
} from '../../db/schema/users';
import { tenants } from '../../db/schema/tenants';
import { DB } from '../../shared/database/database.module';
import { JwtTokenService } from '../../shared/security/jwt.service';
import { ForbiddenError, LockedError, NotFoundError, UnauthorizedError, ValidationError } from '../../shared/utils/errors';
import { loadEnv } from '../../config/env';
import { AuditService } from '../../shared/database/audit.service';
import { invalidateRbacCache, rolePermissionsCacheKey } from '../../shared/security/rbac.cache';

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
  user: {
    id: string;
    email: string;
    fullName: string;
    tenantId: string;
    roles: string[];
  };
}

@Injectable()
export class AuthService {
  private env = loadEnv();

  constructor(
    @Inject(DB) private readonly db: DbClient,
    private readonly jwt: JwtTokenService,
    private readonly audit: AuditService
  ) {}

  private parseDurationToMs(input: string): number {
    const m = /^(\d+)([smhd])$/.exec(input);
    if (!m) return 0;
    const v = Number(m[1]);
    const unit = m[2];
    return unit === 's' ? v * 1000 : unit === 'm' ? v * 60_000 : unit === 'h' ? v * 3_600_000 : v * 86_400_000;
  }

  async login(email: string, password: string, ip?: string, ua?: string): Promise<LoginResult> {
    const user = await this.db.query.users.findFirst({
      where: eq(users.email, email),
    });
    if (!user || user.deletedAt) {
      // Take same time as a valid login to avoid user enumeration
      await argon2.verify(
        '$argon2id$v=19$m=65536,t=3,p=4$abcdefghijklmnopqrstuv$ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ',
        password
      ).catch(() => null);
      throw new UnauthorizedError('E-posta veya şifre hatalı');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const retry = Math.max(0, Math.floor((user.lockedUntil.getTime() - Date.now()) / 1000));
      throw new LockedError('Hesap geçici olarak kilitli. Daha sonra tekrar deneyin.', retry);
    }
    if (user.status !== 'active') {
      throw new ForbiddenError('Hesap aktif değil');
    }

    let ok = false;
    try {
      ok = await argon2.verify(user.passwordHash, password);
    } catch {
      ok = false;
    }
    if (!ok) {
      const attempts = (user.failedLoginAttempts ?? 0) + 1;
      const max = this.env.AUTH_MAX_FAILED_ATTEMPTS;
      const lockMin = this.env.AUTH_LOCKOUT_MINUTES;
      const lockUntil = attempts >= max ? new Date(Date.now() + lockMin * 60_000) : null;
      await this.db
        .update(users)
        .set({ failedLoginAttempts: attempts, lockedUntil: lockUntil ?? user.lockedUntil })
        .where(eq(users.id, user.id));
      await this.audit.write({
        tenantId: user.tenantId,
        actorUserId: user.id,
        action: 'auth.login.failed',
        resourceType: 'user',
        resourceId: user.id,
        ipAddress: ip,
        userAgent: ua,
      });
      if (lockUntil) {
        throw new LockedError('Çok hatalı giriş. Hesap kilitlendi.', lockMin * 60);
      }
      throw new UnauthorizedError('E-posta veya şifre hatalı');
    }

    // Success — clear lockout, set last_login_at
    await this.db
      .update(users)
      .set({ failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() })
      .where(eq(users.id, user.id));

    // Create login session
    const [session] = await this.db
      .insert(loginSessions)
      .values({ tenantId: user.tenantId, userId: user.id, ipAddress: ip ?? null, userAgent: ua ?? null })
      .returning();

    // Build access token
    const userRoleCodes = (
      await this.db
        .select({ code: rolesTable.code })
        .from(userRoles)
        .innerJoin(rolesTable, eq(userRoles.roleId, rolesTable.id))
        .where(eq(userRoles.userId, user.id))
    ).map((r) => r.code);

    const accessToken = this.jwt.signAccess({
      sub: user.id,
      tid: user.tenantId,
      email: user.email,
      roles: userRoleCodes,
      sid: session.id,
    });

    // Issue refresh token
    const { raw, hash } = this.jwt.generateRefreshToken();
    const refreshTtlMs = this.parseDurationToMs(this.env.JWT_REFRESH_TTL) || 30 * 86_400_000;
    const expiresAt = new Date(Date.now() + refreshTtlMs);
    await this.db.insert(refreshTokens).values({
      tenantId: user.tenantId,
      userId: user.id,
      sessionId: session.id,
      tokenHash: hash,
      expiresAt,
      ipAddress: ip ?? null,
      userAgent: ua ?? null,
    });

    // Prime RBAC cache
    invalidateRbacCache(user.id);
    await rolePermissionsCacheKey(this.db, user.id);

    await this.audit.write({
      tenantId: user.tenantId,
      actorUserId: user.id,
      action: 'auth.login.success',
      resourceType: 'user',
      resourceId: user.id,
      ipAddress: ip,
      userAgent: ua,
    });

    return {
      accessToken,
      refreshToken: raw,
      refreshTokenExpiresAt: expiresAt,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        tenantId: user.tenantId,
        roles: userRoleCodes,
      },
    };
  }

  async refresh(rawRefreshToken: string, ip?: string, ua?: string): Promise<LoginResult> {
    const hash = this.jwt.hashToken(rawRefreshToken);
    const row = await this.db.query.refreshTokens.findFirst({
      where: and(eq(refreshTokens.tokenHash, hash)),
    });
    if (!row || row.revokedAt || row.expiresAt < new Date()) {
      throw new UnauthorizedError('Refresh token geçersiz veya süresi dolmuş');
    }

    const user = await this.db.query.users.findFirst({ where: eq(users.id, row.userId) });
    if (!user || user.deletedAt || user.status !== 'active') {
      throw new UnauthorizedError('Kullanıcı geçersiz');
    }

    // Rotate: revoke old, issue new
    const { raw: newRaw, hash: newHash } = this.jwt.generateRefreshToken();
    const refreshTtlMs = this.parseDurationToMs(this.env.JWT_REFRESH_TTL) || 30 * 86_400_000;
    const expiresAt = new Date(Date.now() + refreshTtlMs);
    const [newRow] = await this.db
      .insert(refreshTokens)
      .values({
        tenantId: user.tenantId,
        userId: user.id,
        sessionId: row.sessionId,
        tokenHash: newHash,
        expiresAt,
        ipAddress: ip ?? null,
        userAgent: ua ?? null,
      })
      .returning();
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date(), replacedById: newRow.id })
      .where(eq(refreshTokens.id, row.id));

    const userRoleCodes = (
      await this.db
        .select({ code: rolesTable.code })
        .from(userRoles)
        .innerJoin(rolesTable, eq(userRoles.roleId, rolesTable.id))
        .where(eq(userRoles.userId, user.id))
    ).map((r) => r.code);

    const accessToken = this.jwt.signAccess({
      sub: user.id,
      tid: user.tenantId,
      email: user.email,
      roles: userRoleCodes,
      sid: row.sessionId ?? '',
    });

    return {
      accessToken,
      refreshToken: newRaw,
      refreshTokenExpiresAt: expiresAt,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        tenantId: user.tenantId,
        roles: userRoleCodes,
      },
    };
  }

  async logout(rawRefreshToken: string | undefined): Promise<void> {
    if (!rawRefreshToken) return;
    const hash = this.jwt.hashToken(rawRefreshToken);
    const row = await this.db.query.refreshTokens.findFirst({ where: eq(refreshTokens.tokenHash, hash) });
    if (!row) return;
    await this.db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.id, row.id));
    if (row.sessionId) {
      await this.db.update(loginSessions).set({ revokedAt: new Date() }).where(eq(loginSessions.id, row.sessionId));
    }
    invalidateRbacCache(row.userId);
  }

  async me(userId: string): Promise<{
    user: { id: string; email: string; fullName: string; tenantId: string; departmentId: string | null; roles: string[]; permissions: string[]; mfaEnabled: boolean };
    tenant: { id: string; name: string; slug: string };
  }> {
    const user = await this.db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user) throw new NotFoundError('Kullanıcı');
    const tenant = await this.db.query.tenants.findFirst({ where: eq(tenants.id, user.tenantId) });
    if (!tenant) throw new NotFoundError('Tenant');
    const userRoleCodes = (
      await this.db
        .select({ code: rolesTable.code })
        .from(userRoles)
        .innerJoin(rolesTable, eq(userRoles.roleId, rolesTable.id))
        .where(eq(userRoles.userId, user.id))
    ).map((r) => r.code);
    const perms = await rolePermissionsCacheKey(this.db, user.id);
    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        tenantId: user.tenantId,
        departmentId: user.departmentId,
        roles: userRoleCodes,
        permissions: Array.from(perms).sort(),
        mfaEnabled: user.mfaEnabled,
      },
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
    };
  }

  async forgotPassword(email: string): Promise<string | null> {
    const user = await this.db.query.users.findFirst({ where: eq(users.email, email) });
    if (!user) return null;
    const raw = randomBytes(32).toString('base64url');
    const hash = this.jwt.hashToken(raw);
    const ttl = this.env.RESET_TOKEN_TTL_MINUTES * 60_000;
    await this.db.insert(passwordResetTokens).values({
      tenantId: user.tenantId,
      userId: user.id,
      tokenHash: hash,
      expiresAt: new Date(Date.now() + ttl),
    });
    return raw;
  }

  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const hash = this.jwt.hashToken(rawToken);
    const row = await this.db.query.passwordResetTokens.findFirst({
      where: and(eq(passwordResetTokens.tokenHash, hash), gt(passwordResetTokens.expiresAt, new Date())),
    });
    if (!row || row.usedAt) throw new ValidationError('Token geçersiz veya süresi dolmuş');
    const hashed = await argon2.hash(newPassword, { type: argon2.argon2id });
    await this.db
      .update(users)
      .set({ passwordHash: hashed, failedLoginAttempts: 0, lockedUntil: null })
      .where(eq(users.id, row.userId));
    await this.db
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(eq(passwordResetTokens.id, row.id));
    // Invalidate all sessions for this user
    await this.db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.userId, row.userId));
    invalidateRbacCache(row.userId);
  }
}
