import { Body, Controller, Delete, Get, Inject, Patch, Post, Param, Query, UseGuards } from '@nestjs/common';
import { hashPassword } from '../../shared/security/password';
import { and, asc, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import type { DbClient } from '../../db/client';
import { users, roles, permissions, userRoles, rolePermissions, userTargets, departmentTargets, userAccessScopes, userDepartmentAssignments, userDivisions, loginSessions, refreshTokens } from '../../db/schema/users';
import { departments, tenants, divisions } from '../../db/schema/tenants';
import { auditLogs } from '../../db/schema/audit';
import { DB } from '../../shared/database/database.module';
import { AuditService } from '../../shared/database/audit.service';
import { ZodValidationPipe } from '../../shared/utils/zod-pipe';
import { AuthGuard } from '../../shared/security/auth.guard';
import { PermissionsGuard, RequirePermissions } from '../../shared/security/permissions.guard';
import { CurrentUser } from '../../shared/security/current-user.decorator';
import type { AuthContext } from '../../shared/security/auth.types';
import { ConflictError, ForbiddenError, NotFoundError } from '../../shared/utils/errors';
import { invalidateRbacCache } from '../../shared/security/rbac.cache';
import {
  paginationSchema,
  userCreateSchema,
  userUpdateSchema,
  roleCreateSchema,
  roleUpdateSchema,
  departmentCreateSchema,
  departmentUpdateSchema,
  auditLogQuerySchema,
  targetPeriodQuerySchema,
  targetUpsertSchema,
  tenantUpdateSchema,
  PERMISSION_RESOURCES,
  type TenantUpdateInput,
  type Pagination,
  type UserCreateInput,
  type UserUpdateInput,
  type UserAccessScopeInput,
  type RoleCreateInput,
  type RoleUpdateInput,
  type DepartmentCreateInput,
  type DepartmentUpdateInput,
  type AuditLogQuery,
  type TargetPeriodQuery,
  type TargetUpsertInput,
} from '@haksan/shared';
import { buildPaginated, pageOffset } from '../../shared/utils/pagination';

const DEFAULT_ACCESS_SCOPE_RESOURCES = PERMISSION_RESOURCES.filter(
  (resource) => !['tenants', 'users', 'roles', 'departments', 'divisions', 'audit', 'files'].includes(resource)
);

@UseGuards(AuthGuard, PermissionsGuard)
@Controller()
export class AdminController {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    private readonly audit: AuditService
  ) {}

  private requireSuperAdmin(user: AuthContext) {
    if (!user.roles.includes('super_admin')) {
      throw new ForbiddenError('Rolleri yalnızca Süper Admin yönetebilir');
    }
  }

  private async ensureAnotherActiveSuperAdmin(tenantId: string, excludedUserId: string) {
    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .innerJoin(users, eq(userRoles.userId, users.id))
      .where(
        and(
          eq(roles.tenantId, tenantId),
          eq(roles.code, 'super_admin'),
          eq(users.tenantId, tenantId),
          eq(users.status, 'active'),
          isNull(users.deletedAt),
          ne(users.id, excludedUserId)
        )
      );
    if ((count ?? 0) === 0) {
      throw new ConflictError('Son aktif Süper Admin devre dışı bırakılamaz veya rolü kaldırılamaz');
    }
  }

  private async revokeUserSessions(userId: string, now = new Date()) {
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: now })
      .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
    await this.db
      .update(loginSessions)
      .set({ revokedAt: now })
      .where(and(eq(loginSessions.userId, userId), isNull(loginSessions.revokedAt)));
    invalidateRbacCache(userId);
  }

  private async assertActiveDepartment(departmentId: string, tenantId: string) {
    const department = await this.db.query.departments.findFirst({
      where: and(
        eq(departments.id, departmentId),
        eq(departments.tenantId, tenantId),
        isNull(departments.deletedAt)
      ),
    });
    if (!department) throw new NotFoundError('Departman');
    return department;
  }

  /** Kullanıcı formundaki tek departman seçimini erişim bağlamındaki birincil
   * departman atamasıyla aynı tutar. Çoklu kapsamlar user_access_scopes üzerinden yönetilir. */
  private async setUserDepartmentAssignment(userId: string, departmentId: string | null | undefined) {
    await this.db.delete(userDepartmentAssignments).where(eq(userDepartmentAssignments.userId, userId));
    if (departmentId) {
      await this.db.insert(userDepartmentAssignments).values({ userId, departmentId, isPrimary: true });
    }
  }

  /** Kullanıcının bölüm (CNC/Üniversal/Sac) üyeliklerini verilen listeyle değiştirir.
   *  Yalnızca kiracıya ait aktif bölümler kabul edilir; sıradaki ilk geçerli bölüm birincil olur. */
  private async setUserDivisions(userId: string, tenantId: string, divisionIds: string[]) {
    const unique = [...new Set(divisionIds)];
    let valid: string[] = [];
    if (unique.length > 0) {
      const rows = await this.db
        .select({ id: divisions.id })
        .from(divisions)
        .where(and(eq(divisions.tenantId, tenantId), inArray(divisions.id, unique)));
      const allowed = new Set(rows.map((r) => r.id));
      // Kullanıcının gönderdiği sırayı koru (ilk = birincil).
      valid = unique.filter((id) => allowed.has(id));
    }
    await this.db.delete(userDivisions).where(eq(userDivisions.userId, userId));
    for (const [index, divisionId] of valid.entries()) {
      await this.db
        .insert(userDivisions)
        .values({ userId, divisionId, isPrimary: index === 0 })
        .onConflictDoNothing();
    }
    return valid;
  }

  private defaultAccessScopes(departmentId: string | null | undefined, divisionIds: string[], canViewAllDivisions: boolean): UserAccessScopeInput[] {
    if (canViewAllDivisions) {
      return DEFAULT_ACCESS_SCOPE_RESOURCES.map((resource) => ({
        resource,
        departmentId: departmentId ?? null,
        divisionId: null,
        isPrimary: true,
      }));
    }
    return DEFAULT_ACCESS_SCOPE_RESOURCES.flatMap((resource) =>
      divisionIds.map((divisionId, index) => ({
        resource,
        departmentId: departmentId ?? null,
        divisionId,
        isPrimary: index === 0,
      }))
    );
  }

  private async roleCodesCanViewAll(roleCodes: string[], tenantId: string): Promise<boolean> {
    if (roleCodes.length === 0) return false;
    const rows = await this.db
      .select({ code: permissions.code })
      .from(roles)
      .innerJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(and(eq(roles.tenantId, tenantId), inArray(roles.code, roleCodes), eq(permissions.code, 'divisions.view_all')));
    return rows.length > 0;
  }

  private async setUserAccessScopes(userId: string, tenantId: string, scopes: UserAccessScopeInput[]) {
    const normalized = scopes.map((scope) => ({
      resource: scope.resource,
      departmentId: scope.departmentId ?? null,
      divisionId: scope.divisionId ?? null,
      isPrimary: !!scope.isPrimary,
    }));
    const departmentIds = [...new Set(normalized.map((scope) => scope.departmentId).filter((id): id is string => !!id))];
    const divisionIds = [...new Set(normalized.map((scope) => scope.divisionId).filter((id): id is string => !!id))];
    if (departmentIds.length) {
      const rows = await this.db
        .select({ id: departments.id })
        .from(departments)
        .where(
          and(
            eq(departments.tenantId, tenantId),
            isNull(departments.deletedAt),
            inArray(departments.id, departmentIds)
          )
        );
      if (rows.length !== departmentIds.length) throw new NotFoundError('Departman');
    }
    if (divisionIds.length) {
      const rows = await this.db
        .select({ id: divisions.id })
        .from(divisions)
        .where(and(eq(divisions.tenantId, tenantId), inArray(divisions.id, divisionIds), eq(divisions.isActive, true)));
      if (rows.length !== divisionIds.length) throw new NotFoundError('Bölüm');
    }

    const hasPrimaryByResource = new Set<string>();
    for (const scope of normalized) {
      if (scope.isPrimary) hasPrimaryByResource.add(scope.resource);
    }
    const firstByResource = new Set<string>();
    const rows = normalized.map((scope) => {
      const isFirst = !firstByResource.has(scope.resource);
      firstByResource.add(scope.resource);
      return {
        ...scope,
        isPrimary: scope.isPrimary || (isFirst && !hasPrimaryByResource.has(scope.resource)),
      };
    });

    await this.db.delete(userAccessScopes).where(eq(userAccessScopes.userId, userId));
    if (rows.length) {
      await this.db
        .insert(userAccessScopes)
        .values(rows.map((scope) => ({ tenantId, userId, ...scope })))
        .onConflictDoNothing();
    }
  }

  @RequirePermissions('users.read')
  @Get('users')
  async listUsers(@CurrentUser() user: AuthContext) {
    const rows = await this.db.query.users.findMany({
      where: and(eq(users.tenantId, user.tenantId), isNull(users.deletedAt)),
    });
    const deptRows = await this.db.query.departments.findMany({
      where: and(eq(departments.tenantId, user.tenantId), isNull(departments.deletedAt)),
    });
    const deptById = new Map(deptRows.map((d) => [d.id, d]));
    // Ünvanlar tenant'tan bağımsız ortak lookup'tır; tek seferde okunup eşlenir.
    const titleRows = await this.db.query.userTitles.findMany();
    const titleById = new Map(
      titleRows.map((t) => [t.id, { id: t.id, code: t.code, name: t.name }])
    );
    const out = [];
    for (const u of rows) {
      const userRoleRows = await this.db
        .select({ code: roles.code, name: roles.name })
        .from(userRoles)
        .innerJoin(roles, eq(userRoles.roleId, roles.id))
        .where(eq(userRoles.userId, u.id));
      const userDivisionRows = await this.db
        .select({ id: divisions.id, code: divisions.code, name: divisions.name, isPrimary: userDivisions.isPrimary })
        .from(userDivisions)
        .innerJoin(divisions, eq(userDivisions.divisionId, divisions.id))
        .where(eq(userDivisions.userId, u.id))
        .orderBy(desc(userDivisions.isPrimary), asc(divisions.sortOrder));
      const accessScopeRows = await this.db
        .select({
          resource: userAccessScopes.resource,
          departmentId: userAccessScopes.departmentId,
          divisionId: userAccessScopes.divisionId,
          isPrimary: userAccessScopes.isPrimary,
        })
        .from(userAccessScopes)
        .where(eq(userAccessScopes.userId, u.id))
        .orderBy(asc(userAccessScopes.resource), desc(userAccessScopes.isPrimary));
      const department = u.departmentId ? deptById.get(u.departmentId) : null;
      out.push({
        id: u.id,
        email: u.email,
        username: u.username,
        fullName: u.fullName,
        phone: u.phone,
        status: u.status,
        departmentId: u.departmentId,
        department: department ? { id: department.id, code: department.code, name: department.name } : null,
        titleId: u.titleId,
        title: u.titleId ? titleById.get(u.titleId) ?? null : null,
        purchaseApprovalLimit: u.purchaseApprovalLimit,
        managerId: u.managerId,
        lastLoginAt: u.lastLoginAt,
        failedLoginAttempts: u.failedLoginAttempts,
        lockedUntil: u.lockedUntil,
        mfaEnabled: u.mfaEnabled,
        roles: userRoleRows,
        divisions: userDivisionRows,
        accessScopes: accessScopeRows,
      });
    }
    return out;
  }

  @RequirePermissions('users.create')
  @Post('users')
  async createUser(@Body(new ZodValidationPipe(userCreateSchema)) body: UserCreateInput, @CurrentUser() user: AuthContext) {
    // Yetki yükseltmeyi önle: super_admin rolünü yalnızca super_admin atayabilir.
    // (users.create izni tek başına yeni bir süper admin oluşturmaya yetmez.)
    if (body.roleCodes.includes('super_admin')) this.requireSuperAdmin(user);
    const existing = await this.db.query.users.findFirst({
      where: and(eq(users.tenantId, user.tenantId), eq(users.email, body.email)),
    });
    if (existing) throw new ConflictError('Bu e-posta zaten kayıtlı');
    // Kullanıcı adı şemada zaten küçük harfe çevrilip kırpılıyor; burada tekrar
    // normalize etmek şema atlanırsa da saklanan biçimin bozulmamasını sağlar.
    const username = body.username?.trim().toLowerCase() || null;
    if (username) {
      const usernameOwner = await this.db.query.users.findFirst({
        where: and(eq(users.tenantId, user.tenantId), eq(users.username, username)),
      });
      if (usernameOwner) throw new ConflictError('Bu kullanıcı adı zaten kullanılıyor');
    }
    if (body.departmentId) await this.assertActiveDepartment(body.departmentId, user.tenantId);
    const hash = await hashPassword(body.password);
    const [created] = await this.db
      .insert(users)
      .values({
        tenantId: user.tenantId,
        fullName: body.fullName,
        email: body.email,
        username,
        phone: body.phone ?? null,
        passwordHash: hash,
        departmentId: body.departmentId ?? null,
        titleId: body.titleId ?? null,
      })
      .returning();
    await this.setUserDepartmentAssignment(created.id, body.departmentId);
    for (const code of body.roleCodes) {
      const role = await this.db.query.roles.findFirst({
        where: and(eq(roles.tenantId, user.tenantId), eq(roles.code, code)),
      });
      if (role) await this.db.insert(userRoles).values({ userId: created.id, roleId: role.id }).onConflictDoNothing();
    }
    const validDivisionIds = await this.setUserDivisions(created.id, user.tenantId, body.divisionIds);
    const canViewAll = await this.roleCodesCanViewAll(body.roleCodes, user.tenantId);
    await this.setUserAccessScopes(
      created.id,
      user.tenantId,
      body.accessScopes ?? this.defaultAccessScopes(body.departmentId ?? null, validDivisionIds, canViewAll)
    );
    return { id: created.id, email: created.email, username: created.username, fullName: created.fullName };
  }

  @RequirePermissions('users.update')
  @Patch('users/:id')
  async updateUser(@Param('id') id: string, @Body(new ZodValidationPipe(userUpdateSchema)) body: UserUpdateInput, @CurrentUser() user: AuthContext) {
    const existing = await this.db.query.users.findFirst({
      where: and(eq(users.id, id), eq(users.tenantId, user.tenantId), isNull(users.deletedAt)),
    });
    if (!existing) throw new NotFoundError('Kullanıcı');
    if (body.departmentId) await this.assertActiveDepartment(body.departmentId, user.tenantId);
    const currentRoleRows = await this.db
      .select({ code: roles.code })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, id));
    const targetIsSuperAdmin = currentRoleRows.some((role) => role.code === 'super_admin');
    let effectiveRoleCodes = currentRoleRows.map((role) => role.code);
    let effectiveDivisionIds = (
      await this.db
        .select({ divisionId: userDivisions.divisionId, isPrimary: userDivisions.isPrimary })
        .from(userDivisions)
        .where(eq(userDivisions.userId, id))
        .orderBy(desc(userDivisions.isPrimary))
    ).map((row) => row.divisionId);
    const patch: Record<string, unknown> = {};
    for (const k of ['fullName', 'phone', 'departmentId', 'titleId', 'status'] as const) {
      if ((body as any)[k] !== undefined) patch[k] = (body as any)[k];
    }
    // E-posta değişimi hassas bir işlemdir: yalnızca super_admin yapabilir ve
    // tenant içinde benzersiz olmalıdır (silinmiş kullanıcılar dahil — uniq index).
    if (body.email !== undefined && body.email !== existing.email) {
      this.requireSuperAdmin(user);
      const emailOwner = await this.db.query.users.findFirst({
        where: and(eq(users.tenantId, user.tenantId), eq(users.email, body.email)),
      });
      if (emailOwner && emailOwner.id !== id) throw new ConflictError('Bu e-posta zaten kayıtlı');
      patch.email = body.email;
    }
    // Kullanıcı adı da bir giriş tanımlayıcısıdır. Bu endpoint `users.update`
    // izniyle korunuyor ve kullanıcının kendi kullanıcı adını değiştirebileceği
    // bir self-servis uç yok; yani değişiklik yalnızca yönetici eliyle yapılır.
    // Benzersizlik tenant içinde ve büyük/küçük harf duyarsızdır (0106 migration).
    let usernameChanged = false;
    if (body.username !== undefined) {
      const nextUsername = body.username === null ? null : body.username.trim().toLowerCase() || null;
      if (nextUsername !== existing.username) {
        if (nextUsername) {
          const usernameOwner = await this.db.query.users.findFirst({
            where: and(eq(users.tenantId, user.tenantId), eq(users.username, nextUsername)),
          });
          if (usernameOwner && usernameOwner.id !== id) throw new ConflictError('Bu kullanıcı adı zaten kullanılıyor');
        }
        patch.username = nextUsername;
        usernameChanged = true;
      }
    }
    if (body.purchaseApprovalLimit !== undefined) {
      patch.purchaseApprovalLimit = body.purchaseApprovalLimit;
    }
    if (body.status !== undefined && body.status !== existing.status && targetIsSuperAdmin) {
      this.requireSuperAdmin(user);
      if (body.status !== 'active') {
        await this.ensureAnotherActiveSuperAdmin(user.tenantId, id);
      }
    }
    if (body.managerId !== undefined) {
      if (body.managerId === id) throw new ConflictError('Kullanıcı kendi yöneticisi olamaz');
      if (body.managerId) {
        const manager = await this.db.query.users.findFirst({
          where: and(eq(users.id, body.managerId), eq(users.tenantId, user.tenantId), isNull(users.deletedAt)),
        });
        if (!manager) throw new NotFoundError('Yönetici');
      }
      patch.managerId = body.managerId;
    }
    // Şifre değişimi yalnızca super_admin'e açık (kullanıcılar kendi şifrelerini
    // "şifremi unuttum" e-posta akışıyla yeniler).
    if (body.password) {
      this.requireSuperAdmin(user);
      patch.passwordHash = await hashPassword(body.password);
    }
    const invalidatesSessions =
      Boolean(body.password) ||
      body.roleCodes !== undefined ||
      (body.status !== undefined && body.status !== existing.status) ||
      (body.email !== undefined && body.email !== existing.email) ||
      // Giriş tanımlayıcısının değişmesi e-postada olduğu gibi açık oturumları
      // düşürür: kullanıcı yeni kimliğiyle yeniden giriş yapmalıdır.
      usernameChanged;
    if (invalidatesSessions) {
      patch.authVersion = sql`${users.authVersion} + 1`;
    }
    // Yalnızca rol/bölüm değişen PATCH'lerde `patch` boş kalır; boş `.set()` Drizzle'da
    // "No values to set" ile 500 atar (krş. updateRole/updateTenant deseni).
    if (Object.keys(patch).length > 0) {
      await this.db.update(users).set(patch).where(eq(users.id, id));
    }
    if (body.departmentId !== undefined) {
      await this.setUserDepartmentAssignment(id, body.departmentId);
    }
    if (body.roleCodes) {
      // Yetki yükseltme/indirme koruması: super_admin rolüne dokunan (atayan VEYA
      // kaldıran) her değişiklik yalnızca super_admin tarafından yapılabilir.
      const touchesSuperAdmin =
        body.roleCodes.includes('super_admin') || currentRoleRows.some((r) => r.code === 'super_admin');
      if (touchesSuperAdmin) this.requireSuperAdmin(user);
      if (targetIsSuperAdmin && !body.roleCodes.includes('super_admin') && existing.status === 'active') {
        await this.ensureAnotherActiveSuperAdmin(user.tenantId, id);
      }
      // Replace user_roles
      const allRoles = await this.db.query.roles.findMany({ where: eq(roles.tenantId, user.tenantId) });
      const wantIds = allRoles.filter((r) => body.roleCodes!.includes(r.code)).map((r) => r.id);
      await this.db.delete(userRoles).where(eq(userRoles.userId, id));
      for (const roleId of wantIds) {
        await this.db.insert(userRoles).values({ userId: id, roleId }).onConflictDoNothing();
      }
      effectiveRoleCodes = body.roleCodes;
      invalidateRbacCache(id);
    }
    if (body.divisionIds) {
      effectiveDivisionIds = await this.setUserDivisions(id, user.tenantId, body.divisionIds);
    }
    if (body.accessScopes) {
      await this.setUserAccessScopes(id, user.tenantId, body.accessScopes);
    } else if (body.divisionIds || body.roleCodes || body.departmentId !== undefined) {
      const canViewAll = await this.roleCodesCanViewAll(effectiveRoleCodes, user.tenantId);
      const departmentId = body.departmentId !== undefined ? body.departmentId : existing.departmentId;
      await this.setUserAccessScopes(id, user.tenantId, this.defaultAccessScopes(departmentId, effectiveDivisionIds, canViewAll));
    }
    if (invalidatesSessions) await this.revokeUserSessions(id);
    return { ok: true };
  }

  @RequirePermissions('users.delete')
  @Delete('users/:id')
  async deleteUser(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    // Kullanıcı silme yalnızca super_admin'e açık (users.delete izni tek başına yetmez).
    this.requireSuperAdmin(user);
    if (id === user.userId) {
      throw new ForbiddenError('Kullanıcı kendi hesabını silemez');
    }

    const existing = await this.db.query.users.findFirst({
      where: and(eq(users.id, id), eq(users.tenantId, user.tenantId), isNull(users.deletedAt)),
    });
    if (!existing) throw new NotFoundError('Kullanıcı');

    const targetRoles = await this.db
      .select({ code: roles.code })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, id));
    const isSuperAdmin = targetRoles.some((role) => role.code === 'super_admin');

    if (isSuperAdmin) {
      const [{ count }] = await this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(userRoles)
        .innerJoin(roles, eq(userRoles.roleId, roles.id))
        .innerJoin(users, eq(userRoles.userId, users.id))
        .where(
          and(
            eq(roles.tenantId, user.tenantId),
            eq(roles.code, 'super_admin'),
            eq(users.tenantId, user.tenantId),
            eq(users.status, 'active'),
            isNull(users.deletedAt)
          )
        );
      if ((count ?? 0) <= 1) {
        throw new ConflictError('Son Süper Admin kullanıcısı silinemez');
      }
    }

    const now = new Date();
    await this.db
      .update(users)
      .set({ deletedAt: now, status: 'passive' })
      .where(eq(users.id, id));
    await this.revokeUserSessions(id, now);

    await this.audit.write({
      tenantId: user.tenantId,
      actorUserId: user.userId,
      action: 'user.deleted',
      resourceType: 'user',
      resourceId: id,
      oldValues: existing,
      newValues: { deletedAt: now, status: 'passive' },
    });

    return { ok: true };
  }

  @RequirePermissions('users.update')
  @Post('users/:id/unlock')
  async unlockUser(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    const existing = await this.db.query.users.findFirst({
      where: and(eq(users.id, id), eq(users.tenantId, user.tenantId), isNull(users.deletedAt)),
    });
    if (!existing) throw new NotFoundError('Kullanıcı');

    await this.db
      .update(users)
      .set({ failedLoginAttempts: 0, lockedUntil: null })
      .where(eq(users.id, id));

    await this.audit.write({
      tenantId: user.tenantId,
      actorUserId: user.userId,
      action: 'user.unlocked',
      resourceType: 'user',
      resourceId: id,
      oldValues: {
        failedLoginAttempts: existing.failedLoginAttempts,
        lockedUntil: existing.lockedUntil,
      },
      newValues: { failedLoginAttempts: 0, lockedUntil: null },
    });

    return { ok: true, id, failedLoginAttempts: 0, lockedUntil: null };
  }

  @RequirePermissions('users.read')
  @Get('user-targets')
  async listUserTargets(@Query(new ZodValidationPipe(targetPeriodQuerySchema)) query: TargetPeriodQuery, @CurrentUser() user: AuthContext) {
    const filters = [eq(userTargets.tenantId, user.tenantId), isNull(userTargets.deletedAt)];
    if (query.period) filters.push(eq(userTargets.period, query.period));
    return this.db.query.userTargets.findMany({
      where: and(...filters),
      orderBy: [desc(userTargets.period), desc(userTargets.updatedAt)],
    });
  }

  @Get('me/targets')
  async listMyTargets(@Query(new ZodValidationPipe(targetPeriodQuerySchema)) query: TargetPeriodQuery, @CurrentUser() user: AuthContext) {
    const filters = [eq(userTargets.tenantId, user.tenantId), eq(userTargets.userId, user.userId), isNull(userTargets.deletedAt)];
    if (query.period) filters.push(eq(userTargets.period, query.period));
    return this.db.query.userTargets.findMany({
      where: and(...filters),
      orderBy: [desc(userTargets.period), desc(userTargets.updatedAt)],
      limit: query.period ? 1 : 12,
    });
  }

  private async upsertUserTargetRow(userId: string, body: TargetUpsertInput, tenantId: string) {
    const values = {
      tenantId,
      userId,
      period: body.period,
      currency: 'USD',
      salesAmount: body.salesAmount == null ? null : body.salesAmount.toString(),
      salesNewCustomers: body.salesNewCustomers,
      serviceAmount: body.serviceAmount == null ? null : body.serviceAmount.toString(),
      serviceCompleted: body.serviceCompleted,
      digitalLeadTarget: body.digitalLeadTarget,
      digitalConversionTarget: body.digitalConversionTarget,
      digitalBudget: body.digitalBudget == null ? null : body.digitalBudget.toString(),
      visitTarget: body.visitTarget,
      callTarget: body.callTarget,
      quoteTarget: body.quoteTarget,
      targetItems: body.targetItems,
      note: body.note?.trim() || null,
    };

    const existing = await this.db.query.userTargets.findFirst({
      where: and(eq(userTargets.tenantId, tenantId), eq(userTargets.userId, userId), eq(userTargets.period, body.period)),
    });
    if (existing) {
      const [row] = await this.db.update(userTargets).set(values).where(eq(userTargets.id, existing.id)).returning();
      return row;
    }
    const [row] = await this.db.insert(userTargets).values(values).returning();
    return row;
  }

  @RequirePermissions('users.update')
  @Post('users/:id/targets')
  async upsertUserTarget(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(targetUpsertSchema)) body: TargetUpsertInput,
    @CurrentUser() user: AuthContext
  ) {
    const targetUser = await this.db.query.users.findFirst({
      where: and(eq(users.id, id), eq(users.tenantId, user.tenantId), isNull(users.deletedAt)),
    });
    if (!targetUser) throw new NotFoundError('Kullanıcı');
    return this.upsertUserTargetRow(id, body, user.tenantId);
  }

  /** Rol hedefi = toplu atama: roldeki tüm aktif kullanıcılara kişisel hedef olarak kopyalanır. */
  @RequirePermissions('roles.update')
  @Post('roles/:id/targets')
  async upsertRoleTargets(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(targetUpsertSchema)) body: TargetUpsertInput,
    @CurrentUser() user: AuthContext
  ) {
    const role = await this.db.query.roles.findFirst({
      where: and(eq(roles.id, id), eq(roles.tenantId, user.tenantId)),
    });
    if (!role) throw new NotFoundError('Rol');

    const members = await this.db
      .select({ userId: users.id })
      .from(userRoles)
      .innerJoin(users, eq(userRoles.userId, users.id))
      .where(and(eq(userRoles.roleId, id), eq(users.tenantId, user.tenantId), isNull(users.deletedAt), eq(users.status, 'active')));

    for (const member of members) {
      await this.upsertUserTargetRow(member.userId, body, user.tenantId);
    }

    await this.audit.write({
      tenantId: user.tenantId,
      actorUserId: user.userId,
      action: 'role.targets_assigned',
      resourceType: 'role',
      resourceId: id,
      newValues: { period: body.period, updatedUserCount: members.length },
    });
    return { ok: true, roleCode: role.code, period: body.period, updatedUserCount: members.length };
  }

  /** Rol hedefi atamadan önce etkilenecek kullanıcı sayısını döner (UI onayı için). */
  @RequirePermissions('roles.read')
  @Get('roles/:id/target-members')
  async roleTargetMembers(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    const role = await this.db.query.roles.findFirst({
      where: and(eq(roles.id, id), eq(roles.tenantId, user.tenantId)),
    });
    if (!role) throw new NotFoundError('Rol');
    const members = await this.db
      .select({ userId: users.id, fullName: users.fullName })
      .from(userRoles)
      .innerJoin(users, eq(userRoles.userId, users.id))
      .where(and(eq(userRoles.roleId, id), eq(users.tenantId, user.tenantId), isNull(users.deletedAt), eq(users.status, 'active')));
    return { roleCode: role.code, roleName: role.name, memberCount: members.length, members };
  }

  @RequirePermissions('users.read')
  @Get('department-targets')
  async listDepartmentTargets(@Query(new ZodValidationPipe(targetPeriodQuerySchema)) query: TargetPeriodQuery, @CurrentUser() user: AuthContext) {
    const filters = [eq(departmentTargets.tenantId, user.tenantId), isNull(departmentTargets.deletedAt)];
    if (query.period) filters.push(eq(departmentTargets.period, query.period));
    return this.db.query.departmentTargets.findMany({
      where: and(...filters),
      orderBy: [desc(departmentTargets.period), desc(departmentTargets.updatedAt)],
    });
  }

  @RequirePermissions('departments.update')
  @Post('departments/:id/targets')
  async upsertDepartmentTarget(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(targetUpsertSchema)) body: TargetUpsertInput,
    @CurrentUser() user: AuthContext
  ) {
    const dept = await this.db.query.departments.findFirst({
      where: and(eq(departments.id, id), eq(departments.tenantId, user.tenantId), isNull(departments.deletedAt)),
    });
    if (!dept) throw new NotFoundError('Departman');

    const values = {
      tenantId: user.tenantId,
      departmentId: id,
      period: body.period,
      currency: 'USD' as const,
      salesAmount: body.salesAmount == null ? null : body.salesAmount.toString(),
      salesNewCustomers: body.salesNewCustomers,
      serviceAmount: body.serviceAmount == null ? null : body.serviceAmount.toString(),
      serviceCompleted: body.serviceCompleted,
      digitalLeadTarget: body.digitalLeadTarget,
      digitalConversionTarget: body.digitalConversionTarget,
      digitalBudget: body.digitalBudget == null ? null : body.digitalBudget.toString(),
      visitTarget: body.visitTarget,
      callTarget: body.callTarget,
      quoteTarget: body.quoteTarget,
      targetItems: body.targetItems,
      note: body.note?.trim() || null,
    };
    const existing = await this.db.query.departmentTargets.findFirst({
      where: and(eq(departmentTargets.tenantId, user.tenantId), eq(departmentTargets.departmentId, id), eq(departmentTargets.period, body.period)),
    });
    if (existing) {
      const [row] = await this.db.update(departmentTargets).set(values).where(eq(departmentTargets.id, existing.id)).returning();
      return row;
    }
    const [row] = await this.db.insert(departmentTargets).values(values).returning();
    return row;
  }

  @RequirePermissions('roles.read')
  @Get('roles')
  async listRoles(@CurrentUser() user: AuthContext) {
    const rows = await this.db.query.roles.findMany({ where: eq(roles.tenantId, user.tenantId) });
    const out = [];
    for (const r of rows) {
      const perms = await this.db
        .select({ code: permissions.code, name: permissions.name })
        .from(rolePermissions)
        .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
        .where(eq(rolePermissions.roleId, r.id));
      out.push({ ...r, permissions: perms });
    }
    return out;
  }

  @RequirePermissions('roles.create')
  @Post('roles')
  async createRole(@Body(new ZodValidationPipe(roleCreateSchema)) body: RoleCreateInput, @CurrentUser() user: AuthContext) {
    this.requireSuperAdmin(user);
    const existing = await this.db.query.roles.findFirst({
      where: and(eq(roles.tenantId, user.tenantId), eq(roles.code, body.code)),
    });
    if (existing) throw new ConflictError('Bu rol kodu zaten kullanılıyor');
    const [role] = await this.db
      .insert(roles)
      .values({ tenantId: user.tenantId, code: body.code, name: body.name, description: body.description ?? null })
      .returning();
    for (const code of body.permissionCodes) {
      const perm = await this.db.query.permissions.findFirst({ where: eq(permissions.code, code) });
      if (perm) await this.db.insert(rolePermissions).values({ roleId: role.id, permissionId: perm.id }).onConflictDoNothing();
    }
    return role;
  }

  @RequirePermissions('roles.update')
  @Patch('roles/:id')
  async updateRole(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(roleUpdateSchema)) body: RoleUpdateInput,
    @CurrentUser() user: AuthContext
  ) {
    this.requireSuperAdmin(user);
    const existing = await this.db.query.roles.findFirst({
      where: and(eq(roles.id, id), eq(roles.tenantId, user.tenantId)),
    });
    if (!existing) throw new NotFoundError('Rol');

    const patch: Record<string, unknown> = {};
    if (body.name !== undefined) patch.name = body.name;
    if (body.description !== undefined) patch.description = body.description;
    if (Object.keys(patch).length > 0) {
      await this.db.update(roles).set(patch).where(eq(roles.id, id));
    }

    if (body.permissionCodes) {
      const wanted = body.permissionCodes.length
        ? await this.db.query.permissions.findMany({ where: inArray(permissions.code, body.permissionCodes) })
        : [];
      await this.db.delete(rolePermissions).where(eq(rolePermissions.roleId, id));
      if (wanted.length) {
        await this.db
          .insert(rolePermissions)
          .values(wanted.map((perm) => ({ roleId: id, permissionId: perm.id })))
          .onConflictDoNothing();
      }
      const affectedUsers = await this.db.select({ userId: userRoles.userId }).from(userRoles).where(eq(userRoles.roleId, id));
      const affectedUserIds = affectedUsers.map((row) => row.userId);
      if (affectedUserIds.length) {
        await this.db
          .update(users)
          .set({ authVersion: sql`${users.authVersion} + 1` })
          .where(inArray(users.id, affectedUserIds));
        for (const userId of affectedUserIds) await this.revokeUserSessions(userId);
      }
    }

    return { ok: true };
  }

  @RequirePermissions('roles.read')
  @Get('permissions')
  async listPermissions() {
    return this.db.query.permissions.findMany();
  }

  @RequirePermissions('departments.read')
  @Get('departments')
  async listDepts(@CurrentUser() user: AuthContext) {
    return this.db.query.departments.findMany({
      where: and(eq(departments.tenantId, user.tenantId), isNull(departments.deletedAt)),
      orderBy: [asc(departments.name)],
    });
  }

  /** Kiracının aktif bölümleri (CNC / Üniversal / Sac İşleme) — kullanıcı formundaki bölüm seçimi için. */
  @RequirePermissions('users.read')
  @Get('divisions')
  async listDivisions(@CurrentUser() user: AuthContext) {
    return this.db
      .select({ id: divisions.id, code: divisions.code, name: divisions.name, sortOrder: divisions.sortOrder })
      .from(divisions)
      .where(and(eq(divisions.tenantId, user.tenantId), eq(divisions.isActive, true)))
      .orderBy(asc(divisions.sortOrder), asc(divisions.name));
  }

  @RequirePermissions('departments.create')
  @Post('departments')
  async createDept(@Body(new ZodValidationPipe(departmentCreateSchema)) body: DepartmentCreateInput, @CurrentUser() user: AuthContext) {
    const code = body.code.trim().toLowerCase();
    const existing = await this.db.query.departments.findFirst({
      where: and(eq(departments.tenantId, user.tenantId), eq(departments.code, code)),
    });
    if (existing && !existing.deletedAt) throw new ConflictError('Bu departman kodu zaten kayıtlı');
    if (existing?.deletedAt) {
      const [restored] = await this.db
        .update(departments)
        .set({
          name: body.name.trim(),
          description: body.description?.trim() || null,
          deletedAt: null,
        })
        .where(and(eq(departments.id, existing.id), eq(departments.tenantId, user.tenantId)))
        .returning();
      await this.audit.write({
        tenantId: user.tenantId,
        actorUserId: user.userId,
        action: 'department.restored',
        resourceType: 'department',
        resourceId: existing.id,
        oldValues: existing,
        newValues: restored,
      });
      return restored;
    }
    const [row] = await this.db
      .insert(departments)
      .values({ tenantId: user.tenantId, code, name: body.name.trim(), description: body.description?.trim() || null })
      .returning();
    await this.audit.write({
      tenantId: user.tenantId,
      actorUserId: user.userId,
      action: 'department.created',
      resourceType: 'department',
      resourceId: row.id,
      newValues: row,
    });
    return row;
  }

  @RequirePermissions('departments.update')
  @Patch('departments/:id')
  async updateDept(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(departmentUpdateSchema)) body: DepartmentUpdateInput,
    @CurrentUser() user: AuthContext
  ) {
    const existing = await this.db.query.departments.findFirst({
      where: and(eq(departments.id, id), eq(departments.tenantId, user.tenantId), isNull(departments.deletedAt)),
    });
    if (!existing) throw new NotFoundError('Departman');
    const patch: Record<string, unknown> = {};
    if (body.name !== undefined) patch.name = body.name;
    if (body.description !== undefined) patch.description = body.description;
    const [row] = await this.db.update(departments).set(patch).where(eq(departments.id, id)).returning();
    await this.audit.write({
      tenantId: user.tenantId,
      actorUserId: user.userId,
      action: 'department.updated',
      resourceType: 'department',
      resourceId: id,
      oldValues: existing,
      newValues: row,
    });
    return row;
  }

  @RequirePermissions('departments.delete')
  @Delete('departments/:id')
  async deleteDept(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    const { existing, deletedAt } = await this.db.transaction(async (tx) => {
      // Departman satırını kilitle; eşzamanlı çıkarma/güncelleme sırasında bağlı
      // kayıt kontrolü aynı aktif departman üzerinde tutarlı kalsın.
      const [lockedDepartment] = await tx
        .select()
        .from(departments)
        .where(and(eq(departments.id, id), eq(departments.tenantId, user.tenantId), isNull(departments.deletedAt)))
        .limit(1)
        .for('update');
      if (!lockedDepartment) throw new NotFoundError('Departman');

      const [{ count: primaryUserCount }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(users)
        .where(and(eq(users.tenantId, user.tenantId), eq(users.departmentId, id), isNull(users.deletedAt)));
      const [{ count: assignmentCount }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(userDepartmentAssignments)
        .innerJoin(users, eq(userDepartmentAssignments.userId, users.id))
        .where(and(eq(users.tenantId, user.tenantId), eq(userDepartmentAssignments.departmentId, id), isNull(users.deletedAt)));
      const [{ count: accessScopeCount }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(userAccessScopes)
        .innerJoin(users, eq(userAccessScopes.userId, users.id))
        .where(and(eq(users.tenantId, user.tenantId), eq(userAccessScopes.departmentId, id), isNull(users.deletedAt)));

      if ((primaryUserCount ?? 0) + (assignmentCount ?? 0) + (accessScopeCount ?? 0) > 0) {
        throw new ConflictError('Bu departman kullanıcılara veya erişim alanlarına atanmış. Önce kullanıcı atamalarını değiştirin');
      }

      const deletedAt = new Date();
      await tx
        .update(departments)
        .set({ deletedAt })
        .where(and(eq(departments.id, id), eq(departments.tenantId, user.tenantId), isNull(departments.deletedAt)));
      return { existing: lockedDepartment, deletedAt };
    });
    await this.audit.write({
      tenantId: user.tenantId,
      actorUserId: user.userId,
      action: 'department.deleted',
      resourceType: 'department',
      resourceId: id,
      oldValues: existing,
      newValues: { deletedAt },
    });
    return { ok: true as const, id };
  }

  @RequirePermissions('audit.read')
  @Get('audit-logs')
  async listAuditLogs(
    @Query(new ZodValidationPipe(auditLogQuerySchema.merge(paginationSchema))) qp: AuditLogQuery & Pagination,
    @CurrentUser() user: AuthContext
  ) {
    const { page, pageSize, sortBy, sortDir, resourceType, actorUserId } = qp;
    const { limit, offset } = pageOffset({ page, pageSize, sortBy, sortDir });
    const filters = [eq(auditLogs.tenantId, user.tenantId)];
    if (resourceType) filters.push(eq(auditLogs.resourceType, resourceType));
    if (actorUserId) filters.push(eq(auditLogs.actorUserId, actorUserId));
    const where = and(...filters);
    const [{ count }] = await this.db.select({ count: sql<number>`count(*)::int` }).from(auditLogs).where(where);
    const rows = await this.db
      .select({
        audit: auditLogs,
        actor: { id: users.id, fullName: users.fullName, email: users.email },
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.actorUserId, users.id))
      .where(where)
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
      .offset(offset);
    return buildPaginated(rows.map((r) => ({ ...r.audit, actor: r.actor })), count, { page, pageSize, sortBy, sortDir });
  }

  @RequirePermissions('tenants.read')
  @Get('tenant')
  async getTenant(@CurrentUser() user: AuthContext) {
    const tenant = await this.db.query.tenants.findFirst({ where: eq(tenants.id, user.tenantId) });
    if (!tenant) throw new NotFoundError('Tenant');
    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      taxNumber: tenant.taxNumber,
      email: tenant.email,
      phone: tenant.phone,
      hiddenNavigationKeys: tenant.hiddenNavigationKeys,
    };
  }

  @RequirePermissions('tenants.update')
  @Patch('tenant')
  async updateTenant(
    @Body(new ZodValidationPipe(tenantUpdateSchema)) body: TenantUpdateInput,
    @CurrentUser() user: AuthContext
  ) {
    const tenant = await this.db.query.tenants.findFirst({ where: eq(tenants.id, user.tenantId) });
    if (!tenant) throw new NotFoundError('Tenant');
    const patch: Record<string, unknown> = {};
    for (const k of ['name', 'taxNumber', 'email', 'phone', 'hiddenNavigationKeys'] as const) {
      if (body[k] !== undefined) patch[k] = body[k];
    }
    if (Object.keys(patch).length > 0) {
      await this.db.update(tenants).set(patch).where(eq(tenants.id, user.tenantId));
      await this.db.insert(auditLogs).values({
        tenantId: user.tenantId,
        actorUserId: user.userId,
        action: 'tenant.updated',
        resourceType: 'tenant',
        resourceId: user.tenantId,
        oldValues: {
          name: tenant.name,
          taxNumber: tenant.taxNumber,
          email: tenant.email,
          phone: tenant.phone,
          hiddenNavigationKeys: tenant.hiddenNavigationKeys,
        },
        newValues: patch,
      });
    }
    const updated = await this.db.query.tenants.findFirst({ where: eq(tenants.id, user.tenantId) });
    return {
      id: updated!.id,
      name: updated!.name,
      slug: updated!.slug,
      taxNumber: updated!.taxNumber,
      email: updated!.email,
      phone: updated!.phone,
      hiddenNavigationKeys: updated!.hiddenNavigationKeys,
    };
  }
}
