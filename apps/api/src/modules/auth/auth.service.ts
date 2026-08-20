import { Inject, Injectable, Optional } from '@nestjs/common';
import { and, eq, gt, isNull, or, sql } from 'drizzle-orm';
import * as argon2 from 'argon2';
import { randomBytes, randomUUID } from 'node:crypto';
import { hashPassword } from '../../shared/security/password';
import type { DbClient } from '../../db/client';
import {
  users,
  loginSessions,
  refreshTokens,
  passwordResetTokens,
  userRoles,
  roles as rolesTable,
  userAccessScopes,
  userDepartmentAssignments,
  userDivisions,
} from '../../db/schema/users';
import { departments, divisions, tenants } from '../../db/schema/tenants';
import { DB } from '../../shared/database/database.module';
import { JwtTokenService } from '../../shared/security/jwt.service';
import { ForbiddenError, LockedError, NotFoundError, UnauthorizedError, ValidationError } from '../../shared/utils/errors';
import { loadEnv } from '../../config/env';
import { AuditService } from '../../shared/database/audit.service';
import { invalidateRbacCache, rolePermissionsCacheKey } from '../../shared/security/rbac.cache';
import { MailerService } from '../../shared/mailer/mailer.service';
import { logger } from '../../shared/utils/logger';
import type { NavigationVisibilityKey } from '@haksan/shared';

const REFRESH_REPLAY_GRACE_MS = 10_000;

/**
 * Giriş başarısızlığında dönen TEK mesaj. "Kullanıcı yok" ile "şifre yanlış"
 * ayrımı kullanıcı numaralandırmasına (user enumeration) yol açtığı için her iki
 * durumda da bu sabit kullanılır — kullanıcı adı yolu için de geçerlidir.
 * Yeni bir başarısızlık dalı eklerken bu sabiti kullanın, yeni metin yazmayın.
 */
const INVALID_CREDENTIALS_MESSAGE = 'Kullanıcı adı/e-posta veya şifre hatalı';

interface AccessSessionResult {
  accessToken: string;
  user: {
    id: string;
    email: string;
    fullName: string;
    tenantId: string;
    roles: string[];
  };
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
  user: AccessSessionResult['user'];
}

export type RefreshResult = LoginResult | AccessSessionResult;

@Injectable()
export class AuthService {
  private env = loadEnv();

  constructor(
    @Inject(DB) private readonly db: DbClient,
    private readonly jwt: JwtTokenService,
    private readonly audit: AuditService,
    @Optional() private readonly mailer?: MailerService
  ) {}

  private parseDurationToMs(input: string): number {
    const m = /^(\d+)([smhd])$/.exec(input);
    if (!m) return 0;
    const v = Number(m[1]);
    const unit = m[2];
    return unit === 's' ? v * 1000 : unit === 'm' ? v * 60_000 : unit === 'h' ? v * 3_600_000 : v * 86_400_000;
  }

  /**
   * Girişte kullanılan tanımlayıcıdan (kullanıcı adı VEYA e-posta) hesabı bulur.
   *
   * Karşılaştırma büyük/küçük harf duyarsız ama TAM eşleşmelidir. Önceki
   * uygulama `ilike` kullanıyordu; `ilike` girdideki `%` ve `_` karakterlerini
   * joker olarak yorumlar, yani `%` göndermek tenant'taki rastgele bir hesabı
   * hedeflemeye yarardı. `lower(...) = ...` bunu kapatır ve 0106 migration'ında
   * eklenen ifade indekslerini kullanır.
   *
   * Kullanıcı adı NULL olan kayıtlarda `lower(username) = $1` sonucu NULL'dır,
   * yani hiçbir zaman eşleşmez — e-posta yolu bozulmadan kalır.
   */
  private async resolveAuthUser(identifier: string, tenantSlug?: string | null) {
    const normalized = identifier.trim().toLowerCase();
    if (!normalized) return null;
    const filters = [
      or(sql`lower(${users.email}) = ${normalized}`, sql`lower(${users.username}) = ${normalized}`),
      isNull(users.deletedAt),
      eq(tenants.isActive, true),
      isNull(tenants.deletedAt),
    ];
    if (tenantSlug) filters.push(eq(tenants.slug, tenantSlug.trim().toLowerCase()));
    const rows = await this.db
      .select({ user: users })
      .from(users)
      .innerJoin(tenants, eq(users.tenantId, tenants.id))
      .where(and(...filters))
      .limit(2);
    // Tenant belirtilmemişse aynı tanımlayıcının (kullanıcı adı ya da e-posta)
    // birden çok tenant'ta bulunması hangi hesaba erişileceğini açıkça seçmeyi
    // zorunlu kılar. Belirsizlik sessizce "bulunamadı" sayılır — çağıran taraf
    // yine aynı genel hata mesajını görür.
    return rows.length === 1 ? rows[0].user : null;
  }

  private async dummyPasswordVerify(password: string) {
    await argon2
      .verify(
        '$argon2id$v=19$m=65536,t=3,p=4$abcdefghijklmnopqrstuv$ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ',
        password
      )
      .catch(() => null);
  }

  private async roleCodesForUser(userId: string): Promise<string[]> {
    return (
      await this.db
        .select({ code: rolesTable.code })
        .from(userRoles)
        .innerJoin(rolesTable, eq(userRoles.roleId, rolesTable.id))
        .where(eq(userRoles.userId, userId))
    ).map((row) => row.code);
  }

  /**
   * `identifier` kullanıcı adı ya da e-posta olabilir. Hangi yoldan gelinirse
   * gelinsin başarısızlık davranışı AYNIDIR: aynı genel mesaj, aynı süre
   * (dummy argon2 doğrulaması) ve aynı hatalı-deneme sayacı. Böylece saldırgan
   * "böyle bir kullanıcı adı var mı" sorusunu yanıt üzerinden yanıtlayamaz.
   */
  async login(identifier: string, password: string, ip?: string, ua?: string, tenantSlug?: string | null): Promise<LoginResult> {
    const user = await this.resolveAuthUser(identifier, tenantSlug);
    if (!user) {
      // Take same time as a valid login to avoid user enumeration
      await this.dummyPasswordVerify(password);
      throw new UnauthorizedError(INVALID_CREDENTIALS_MESSAGE);
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
      throw new UnauthorizedError(INVALID_CREDENTIALS_MESSAGE);
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
    const userRoleCodes = await this.roleCodesForUser(user.id);

    const accessToken = this.jwt.signAccess({
      sub: user.id,
      tid: user.tenantId,
      email: user.email,
      roles: userRoleCodes,
      sid: session.id,
      ver: user.authVersion,
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

  async refresh(rawRefreshToken: string, ip?: string, ua?: string): Promise<RefreshResult> {
    const hash = this.jwt.hashToken(rawRefreshToken);
    const row = await this.db.query.refreshTokens.findFirst({
      where: eq(refreshTokens.tokenHash, hash),
    });
    if (!row) {
      throw new UnauthorizedError('Refresh token geçersiz veya süresi dolmuş');
    }
    // Reuse detection: yakın zamanlı aynı-istemci replay sekme/reload yarışı
    // olabilir. Bunun dışındaki revoked token tekrarı hırsızlık sinyalidir ve
    // oturum ailesi iptal edilir.
    if (row.revokedAt) {
      if (this.isBenignRefreshReplay(row, ip, ua)) {
        const access = await this.issueAccessForRefreshRow(row);
        await this.audit.write({
          tenantId: row.tenantId,
          actorUserId: row.userId,
          action: 'auth.refresh.replay_grace',
          resourceType: 'user',
          resourceId: row.userId,
          ipAddress: ip,
          userAgent: ua,
        });
        return access;
      }
      await this.revokeSessionFamily(row.sessionId, row.userId);
      await this.audit.write({
        tenantId: row.tenantId,
        actorUserId: row.userId,
        action: 'auth.refresh.reuse_detected',
        resourceType: 'user',
        resourceId: row.userId,
        ipAddress: ip,
        userAgent: ua,
      });
      throw new UnauthorizedError('Oturum güvenlik nedeniyle sonlandırıldı. Lütfen tekrar giriş yapın.');
    }
    if (row.expiresAt < new Date()) {
      throw new UnauthorizedError('Refresh token geçersiz veya süresi dolmuş');
    }

    const user = await this.db.query.users.findFirst({ where: eq(users.id, row.userId) });
    if (!user || user.deletedAt || user.status !== 'active' || user.tenantId !== row.tenantId || !row.sessionId) {
      throw new UnauthorizedError('Kullanıcı geçersiz');
    }

    const session = await this.db.query.loginSessions.findFirst({
      where: and(
        eq(loginSessions.id, row.sessionId),
        eq(loginSessions.userId, user.id),
        eq(loginSessions.tenantId, user.tenantId),
        isNull(loginSessions.revokedAt)
      ),
    });
    if (!session) {
      throw new UnauthorizedError('Oturum sonlandırılmış');
    }

    // Conditional revoke makes token rotation single-winner even when two tabs
    // refresh at the same instant. The replacement id is generated up front so
    // the old row and the new row are committed together in one transaction.
    const { raw: newRaw, hash: newHash } = this.jwt.generateRefreshToken();
    const refreshTtlMs = this.parseDurationToMs(this.env.JWT_REFRESH_TTL) || 30 * 86_400_000;
    const expiresAt = new Date(Date.now() + refreshTtlMs);
    const newTokenId = randomUUID();
    const claimed = await this.db.transaction(async (tx) => {
      const [oldToken] = await tx
        .update(refreshTokens)
        .set({ revokedAt: new Date(), replacedById: newTokenId })
        .where(and(eq(refreshTokens.id, row.id), isNull(refreshTokens.revokedAt)))
        .returning({ id: refreshTokens.id });
      if (!oldToken) return false;
      await tx.insert(refreshTokens).values({
        id: newTokenId,
        tenantId: user.tenantId,
        userId: user.id,
        sessionId: row.sessionId,
        tokenHash: newHash,
        expiresAt,
        ipAddress: ip ?? null,
        userAgent: ua ?? null,
      });
      return true;
    });
    if (!claimed) {
      const current = await this.db.query.refreshTokens.findFirst({ where: eq(refreshTokens.id, row.id) });
      if (current?.revokedAt && this.isBenignRefreshReplay(current, ip, ua)) {
        return this.issueAccessForRefreshRow(current);
      }
      await this.revokeSessionFamily(row.sessionId, row.userId);
      throw new UnauthorizedError('Refresh token geçersiz veya süresi dolmuş');
    }

    const userRoleCodes = await this.roleCodesForUser(user.id);

    const accessToken = this.jwt.signAccess({
      sub: user.id,
      tid: user.tenantId,
      email: user.email,
      roles: userRoleCodes,
      sid: row.sessionId,
      ver: user.authVersion,
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

  private isBenignRefreshReplay(
    row: typeof refreshTokens.$inferSelect,
    ip?: string,
    ua?: string
  ): boolean {
    if (!row.revokedAt || !row.replacedById) return false;
    if (Date.now() - row.revokedAt.getTime() > REFRESH_REPLAY_GRACE_MS) return false;
    if (row.ipAddress && ip && row.ipAddress !== ip) return false;
    if (row.userAgent && ua && row.userAgent !== ua) return false;
    return true;
  }

  private async issueAccessForRefreshRow(row: typeof refreshTokens.$inferSelect): Promise<AccessSessionResult> {
    const user = await this.db.query.users.findFirst({ where: eq(users.id, row.userId) });
    if (!user || user.deletedAt || user.status !== 'active' || user.tenantId !== row.tenantId || !row.sessionId) {
      throw new UnauthorizedError('Kullanıcı geçersiz');
    }
    const session = await this.db.query.loginSessions.findFirst({
      where: and(
        eq(loginSessions.id, row.sessionId),
        eq(loginSessions.userId, user.id),
        eq(loginSessions.tenantId, user.tenantId),
        isNull(loginSessions.revokedAt)
      ),
    });
    if (!session) throw new UnauthorizedError('Oturum sonlandırılmış');

    const userRoleCodes = await this.roleCodesForUser(user.id);

    return {
      accessToken: this.jwt.signAccess({
        sub: user.id,
        tid: user.tenantId,
        email: user.email,
        roles: userRoleCodes,
        sid: row.sessionId,
        ver: user.authVersion,
      }),
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        tenantId: user.tenantId,
        roles: userRoleCodes,
      },
    };
  }

  /**
   * Bir oturum ailesini topluca iptal eder — reuse tespitinde çağrılır.
   * sessionId varsa o oturumun tüm aktif refresh token'ları + login session'ı,
   * yoksa kullanıcının tüm aktif token'ları iptal edilir (fallback).
   */
  private async revokeSessionFamily(sessionId: string | null, userId: string): Promise<void> {
    const now = new Date();
    if (sessionId) {
      await this.db
        .update(refreshTokens)
        .set({ revokedAt: now })
        .where(and(eq(refreshTokens.sessionId, sessionId), isNull(refreshTokens.revokedAt)));
      await this.db.update(loginSessions).set({ revokedAt: now }).where(eq(loginSessions.id, sessionId));
    } else {
      await this.db
        .update(refreshTokens)
        .set({ revokedAt: now })
        .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
      await this.db
        .update(loginSessions)
        .set({ revokedAt: now })
        .where(and(eq(loginSessions.userId, userId), isNull(loginSessions.revokedAt)));
    }
    invalidateRbacCache(userId);
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
    user: {
      id: string;
      email: string;
      fullName: string;
      tenantId: string;
      departmentId: string | null;
      roles: string[];
      permissions: string[];
      mfaEnabled: boolean;
      divisions: Array<{ id: string; code: string; name: string; isPrimary: boolean }>;
      departments: Array<{ id: string; code: string; name: string; isPrimary: boolean }>;
      accessScopes: Array<{ resource: string; departmentId: string | null; divisionId: string | null; isPrimary: boolean }>;
      canViewAllDivisions: boolean;
    };
    tenant: {
      id: string;
      name: string;
      slug: string;
      hiddenNavigationKeys: NavigationVisibilityKey[];
    };
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
    const accessScopes = await this.db
      .select({
        resource: userAccessScopes.resource,
        departmentId: userAccessScopes.departmentId,
        divisionId: userAccessScopes.divisionId,
        isPrimary: userAccessScopes.isPrimary,
      })
      .from(userAccessScopes)
      .where(and(eq(userAccessScopes.userId, user.id), eq(userAccessScopes.tenantId, user.tenantId)));
    const assignedDivisions = await this.db
      .select({
        id: divisions.id,
        code: divisions.code,
        name: divisions.name,
        isPrimary: userDivisions.isPrimary,
      })
      .from(userDivisions)
      .innerJoin(divisions, eq(userDivisions.divisionId, divisions.id))
      .where(and(eq(userDivisions.userId, user.id), eq(divisions.tenantId, user.tenantId)));
    const canViewAllDivisions = perms.has('divisions.view_all');
    const hasAnyAllDivisionScope = accessScopes.some((scope) => scope.divisionId === null);
    const rawAvailableDivisions = canViewAllDivisions || hasAnyAllDivisionScope
      ? (
          await this.db.query.divisions.findMany({
            where: and(eq(divisions.tenantId, user.tenantId), eq(divisions.isActive, true)),
          })
        ).map((division) => ({
          id: division.id,
          code: division.code,
          name: division.name,
          isPrimary: assignedDivisions.some((assigned) => assigned.id === division.id && assigned.isPrimary),
        }))
      : assignedDivisions;
    const hasPrimaryDivision = rawAvailableDivisions.some((division) => division.isPrimary);
    const availableDivisions = rawAvailableDivisions.map((division, index) => ({
      ...division,
      isPrimary: division.isPrimary || (!hasPrimaryDivision && index === 0),
    }));
    const assignedDepartments = await this.db
      .select({
        id: departments.id,
        code: departments.code,
        name: departments.name,
        isPrimary: userDepartmentAssignments.isPrimary,
      })
      .from(userDepartmentAssignments)
      .innerJoin(departments, eq(userDepartmentAssignments.departmentId, departments.id))
      .where(
        and(
          eq(userDepartmentAssignments.userId, user.id),
          eq(departments.tenantId, user.tenantId),
          isNull(departments.deletedAt)
        )
      );
    const rawAvailableDepartments =
      canViewAllDivisions || userRoleCodes.includes('super_admin')
        ? await this.db
            .select({ id: departments.id, code: departments.code, name: departments.name })
            .from(departments)
            .where(and(eq(departments.tenantId, user.tenantId), isNull(departments.deletedAt)))
        : assignedDepartments.length
          ? assignedDepartments
          : user.departmentId
            ? await this.db
                .select({ id: departments.id, code: departments.code, name: departments.name })
                .from(departments)
                .where(
                  and(
                    eq(departments.id, user.departmentId),
                    eq(departments.tenantId, user.tenantId),
                    isNull(departments.deletedAt)
                  )
                )
            : [];
    const primaryDepartmentId = assignedDepartments.find((department) => department.isPrimary)?.id ?? user.departmentId ?? null;
    const hasPrimaryDepartment = rawAvailableDepartments.some((department) => department.id === primaryDepartmentId);
    const availableDepartments = rawAvailableDepartments.map((department, index) => ({
      ...department,
      isPrimary: department.id === primaryDepartmentId || (!hasPrimaryDepartment && index === 0),
    }));
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
        divisions: availableDivisions,
        departments: availableDepartments,
        accessScopes,
        canViewAllDivisions,
      },
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        hiddenNavigationKeys: tenant.hiddenNavigationKeys,
      },
    };
  }

  async forgotPassword(email: string, tenantSlug?: string | null): Promise<string | null> {
    const user = await this.resolveAuthUser(email, tenantSlug);
    if (!user) return null;
    const raw = randomBytes(32).toString('base64url');
    const hash = this.jwt.hashToken(raw);
    const ttl = this.env.RESET_TOKEN_TTL_MINUTES * 60_000;
    const now = new Date();
    const [token] = await this.db.transaction(async (tx) => {
      await tx
        .update(passwordResetTokens)
        .set({ usedAt: now })
        .where(and(eq(passwordResetTokens.userId, user.id), isNull(passwordResetTokens.usedAt)));
      return tx
        .insert(passwordResetTokens)
        .values({
          tenantId: user.tenantId,
          userId: user.id,
          tokenHash: hash,
          expiresAt: new Date(Date.now() + ttl),
        })
        .returning({ id: passwordResetTokens.id });
    });

    // A deliberately opt-in dev response keeps local/test workflows usable
    // without turning production reset tokens into API output.
    if (this.env.NODE_ENV !== 'production' && this.env.AUTH_DEV_RESET_TOKEN_RESPONSE) return raw;

    try {
      const delivered = await this.mailer?.sendPasswordReset(user.email, raw);
      if (delivered) return null;
    } catch (err) {
      logger.error({ err, userId: user.id }, '[auth] password reset mail delivery failed');
    }
    // Do not leave a usable reset credential behind when delivery was not
    // confirmed. The controller still returns the same generic response.
    await this.db.update(passwordResetTokens).set({ usedAt: new Date() }).where(eq(passwordResetTokens.id, token.id));
    logger.warn({ userId: user.id }, '[auth] password reset token invalidated because email delivery was unavailable');
    return null;
  }

  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const hash = this.jwt.hashToken(rawToken);
    const hashed = await hashPassword(newPassword);
    const now = new Date();
    const row = await this.db.transaction(async (tx) => {
      // Claim the credential first. The used/expiry predicates make parallel
      // reset submissions single-use without a read-then-write race.
      const [claimed] = await tx
        .update(passwordResetTokens)
        .set({ usedAt: now })
        .where(
          and(
            eq(passwordResetTokens.tokenHash, hash),
            isNull(passwordResetTokens.usedAt),
            gt(passwordResetTokens.expiresAt, now)
          )
        )
        .returning({ id: passwordResetTokens.id, userId: passwordResetTokens.userId, tenantId: passwordResetTokens.tenantId });
      if (!claimed) return null;
      await tx
        .update(users)
        .set({
          passwordHash: hashed,
          failedLoginAttempts: 0,
          lockedUntil: null,
          authVersion: sql`${users.authVersion} + 1`,
        })
        .where(eq(users.id, claimed.userId));
      await tx
        .update(passwordResetTokens)
        .set({ usedAt: now })
        .where(and(eq(passwordResetTokens.userId, claimed.userId), isNull(passwordResetTokens.usedAt)));
      await tx
        .update(refreshTokens)
        .set({ revokedAt: now })
        .where(and(eq(refreshTokens.userId, claimed.userId), isNull(refreshTokens.revokedAt)));
      await tx
        .update(loginSessions)
        .set({ revokedAt: now })
        .where(and(eq(loginSessions.userId, claimed.userId), isNull(loginSessions.revokedAt)));
      return claimed;
    });
    if (!row) throw new ValidationError('Token geçersiz veya süresi dolmuş');
    invalidateRbacCache(row.userId);
    await this.audit.write({
      tenantId: row.tenantId ?? undefined,
      actorUserId: row.userId,
      action: 'auth.password.reset',
      resourceType: 'user',
      resourceId: row.userId,
    });
  }
}
