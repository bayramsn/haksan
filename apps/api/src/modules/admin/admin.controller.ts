import { Body, Controller, Get, Inject, Patch, Post, Param, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import * as argon2 from 'argon2';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { DbClient } from '../../db/client';
import { users, roles, permissions, userRoles, rolePermissions } from '../../db/schema/users';
import { departments } from '../../db/schema/tenants';
import { auditLogs } from '../../db/schema/audit';
import { DB } from '../../shared/database/database.module';
import { ZodValidationPipe } from '../../shared/utils/zod-pipe';
import { AuthGuard } from '../../shared/security/auth.guard';
import { PermissionsGuard, RequirePermissions } from '../../shared/security/permissions.guard';
import { CurrentUser } from '../../shared/security/current-user.decorator';
import type { AuthContext } from '../../shared/security/auth.types';
import { ConflictError, ForbiddenError, NotFoundError } from '../../shared/utils/errors';
import { invalidateRbacCache } from '../../shared/security/rbac.cache';
import { paginationSchema, type Pagination } from '@haksan/shared';
import { buildPaginated, pageOffset } from '../../shared/utils/pagination';

const userCreate = z.object({
  fullName: z.string().min(1).max(255),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  phone: z.string().max(32).optional(),
  departmentId: z.string().optional(),
  roleCodes: z.array(z.string()).default([]),
});
const userUpdate = z.object({
  fullName: z.string().min(1).max(255).optional(),
  phone: z.string().max(32).optional(),
  departmentId: z.string().nullable().optional(),
  status: z.enum(['active', 'passive']).optional(),
  roleCodes: z.array(z.string()).optional(),
  password: z.string().min(8).max(128).optional(),
});

const roleCreate = z.object({
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  permissionCodes: z.array(z.string()).default([]),
});

const roleUpdate = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).nullable().optional(),
  permissionCodes: z.array(z.string()).optional(),
});

const deptCreate = z.object({
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
});

const auditQuery = z.object({
  resourceType: z.string().max(64).optional(),
  actorUserId: z.string().optional(),
});

@UseGuards(AuthGuard, PermissionsGuard)
@Controller()
export class AdminController {
  constructor(@Inject(DB) private readonly db: DbClient) {}

  private requireSuperAdmin(user: AuthContext) {
    if (!user.roles.includes('super_admin')) {
      throw new ForbiddenError('Rolleri yalnızca Süper Admin yönetebilir');
    }
  }

  @RequirePermissions('users.read')
  @Get('users')
  async listUsers(@CurrentUser() user: AuthContext) {
    const rows = await this.db.query.users.findMany({
      where: and(eq(users.tenantId, user.tenantId), isNull(users.deletedAt)),
    });
    const out = [];
    for (const u of rows) {
      const userRoleRows = await this.db
        .select({ code: roles.code, name: roles.name })
        .from(userRoles)
        .innerJoin(roles, eq(userRoles.roleId, roles.id))
        .where(eq(userRoles.userId, u.id));
      out.push({
        id: u.id,
        email: u.email,
        fullName: u.fullName,
        phone: u.phone,
        status: u.status,
        departmentId: u.departmentId,
        lastLoginAt: u.lastLoginAt,
        mfaEnabled: u.mfaEnabled,
        roles: userRoleRows,
      });
    }
    return out;
  }

  @RequirePermissions('users.create')
  @Post('users')
  async createUser(@Body(new ZodValidationPipe(userCreate)) body: z.infer<typeof userCreate>, @CurrentUser() user: AuthContext) {
    const existing = await this.db.query.users.findFirst({
      where: and(eq(users.tenantId, user.tenantId), eq(users.email, body.email)),
    });
    if (existing) throw new ConflictError('Bu e-posta zaten kayıtlı');
    const hash = await argon2.hash(body.password, { type: argon2.argon2id });
    const [created] = await this.db
      .insert(users)
      .values({
        tenantId: user.tenantId,
        fullName: body.fullName,
        email: body.email,
        phone: body.phone ?? null,
        passwordHash: hash,
        departmentId: body.departmentId ?? null,
      })
      .returning();
    for (const code of body.roleCodes) {
      const role = await this.db.query.roles.findFirst({
        where: and(eq(roles.tenantId, user.tenantId), eq(roles.code, code)),
      });
      if (role) await this.db.insert(userRoles).values({ userId: created.id, roleId: role.id }).onConflictDoNothing();
    }
    return { id: created.id, email: created.email, fullName: created.fullName };
  }

  @RequirePermissions('users.update')
  @Patch('users/:id')
  async updateUser(@Param('id') id: string, @Body(new ZodValidationPipe(userUpdate)) body: z.infer<typeof userUpdate>, @CurrentUser() user: AuthContext) {
    const existing = await this.db.query.users.findFirst({
      where: and(eq(users.id, id), eq(users.tenantId, user.tenantId), isNull(users.deletedAt)),
    });
    if (!existing) throw new NotFoundError('Kullanıcı');
    const patch: Record<string, unknown> = {};
    for (const k of ['fullName', 'phone', 'departmentId', 'status'] as const) {
      if ((body as any)[k] !== undefined) patch[k] = (body as any)[k];
    }
    if (body.password) patch.passwordHash = await argon2.hash(body.password, { type: argon2.argon2id });
    await this.db.update(users).set(patch).where(eq(users.id, id));
    if (body.roleCodes) {
      // Replace user_roles
      const allRoles = await this.db.query.roles.findMany({ where: eq(roles.tenantId, user.tenantId) });
      const wantIds = allRoles.filter((r) => body.roleCodes!.includes(r.code)).map((r) => r.id);
      await this.db.delete(userRoles).where(eq(userRoles.userId, id));
      for (const roleId of wantIds) {
        await this.db.insert(userRoles).values({ userId: id, roleId }).onConflictDoNothing();
      }
      invalidateRbacCache(id);
    }
    return { ok: true };
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
  async createRole(@Body(new ZodValidationPipe(roleCreate)) body: z.infer<typeof roleCreate>, @CurrentUser() user: AuthContext) {
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
    @Body(new ZodValidationPipe(roleUpdate)) body: z.infer<typeof roleUpdate>,
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
      for (const row of affectedUsers) invalidateRbacCache(row.userId);
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
    return this.db.query.departments.findMany({ where: eq(departments.tenantId, user.tenantId) });
  }

  @RequirePermissions('departments.create')
  @Post('departments')
  async createDept(@Body(new ZodValidationPipe(deptCreate)) body: z.infer<typeof deptCreate>, @CurrentUser() user: AuthContext) {
    const [row] = await this.db
      .insert(departments)
      .values({ tenantId: user.tenantId, code: body.code, name: body.name, description: body.description ?? null })
      .returning();
    return row;
  }

  @RequirePermissions('audit.read')
  @Get('audit-logs')
  async listAuditLogs(
    @Query(new ZodValidationPipe(auditQuery.merge(paginationSchema))) qp: z.infer<typeof auditQuery> & Pagination,
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
}
