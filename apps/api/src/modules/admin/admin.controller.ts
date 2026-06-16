import { Body, Controller, Get, Inject, Patch, Post, Param, Query, UseGuards } from '@nestjs/common';
import * as argon2 from 'argon2';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { DbClient } from '../../db/client';
import { users, roles, permissions, userRoles, rolePermissions, userTargets, departmentTargets } from '../../db/schema/users';
import { departments, tenants } from '../../db/schema/tenants';
import { auditLogs } from '../../db/schema/audit';
import { DB } from '../../shared/database/database.module';
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
  type TenantUpdateInput,
  type Pagination,
  type UserCreateInput,
  type UserUpdateInput,
  type RoleCreateInput,
  type RoleUpdateInput,
  type DepartmentCreateInput,
  type DepartmentUpdateInput,
  type AuditLogQuery,
  type TargetPeriodQuery,
  type TargetUpsertInput,
} from '@haksan/shared';
import { buildPaginated, pageOffset } from '../../shared/utils/pagination';

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
    const deptRows = await this.db.query.departments.findMany({ where: eq(departments.tenantId, user.tenantId) });
    const deptById = new Map(deptRows.map((d) => [d.id, d]));
    const out = [];
    for (const u of rows) {
      const userRoleRows = await this.db
        .select({ code: roles.code, name: roles.name })
        .from(userRoles)
        .innerJoin(roles, eq(userRoles.roleId, roles.id))
        .where(eq(userRoles.userId, u.id));
      const department = u.departmentId ? deptById.get(u.departmentId) : null;
      out.push({
        id: u.id,
        email: u.email,
        fullName: u.fullName,
        phone: u.phone,
        status: u.status,
        departmentId: u.departmentId,
        department: department ? { id: department.id, code: department.code, name: department.name } : null,
        purchaseApprovalLimit: u.purchaseApprovalLimit,
        managerId: u.managerId,
        lastLoginAt: u.lastLoginAt,
        mfaEnabled: u.mfaEnabled,
        roles: userRoleRows,
      });
    }
    return out;
  }

  @RequirePermissions('users.create')
  @Post('users')
  async createUser(@Body(new ZodValidationPipe(userCreateSchema)) body: UserCreateInput, @CurrentUser() user: AuthContext) {
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
  async updateUser(@Param('id') id: string, @Body(new ZodValidationPipe(userUpdateSchema)) body: UserUpdateInput, @CurrentUser() user: AuthContext) {
    const existing = await this.db.query.users.findFirst({
      where: and(eq(users.id, id), eq(users.tenantId, user.tenantId), isNull(users.deletedAt)),
    });
    if (!existing) throw new NotFoundError('Kullanıcı');
    const patch: Record<string, unknown> = {};
    for (const k of ['fullName', 'phone', 'departmentId', 'status'] as const) {
      if ((body as any)[k] !== undefined) patch[k] = (body as any)[k];
    }
    if (body.purchaseApprovalLimit !== undefined) {
      patch.purchaseApprovalLimit = body.purchaseApprovalLimit;
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

    const values = {
      tenantId: user.tenantId,
      userId: id,
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
      where: and(eq(userTargets.tenantId, user.tenantId), eq(userTargets.userId, id), eq(userTargets.period, body.period)),
    });
    if (existing) {
      const [row] = await this.db.update(userTargets).set(values).where(eq(userTargets.id, existing.id)).returning();
      return row;
    }
    const [row] = await this.db.insert(userTargets).values(values).returning();
    return row;
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
      where: and(eq(departments.id, id), eq(departments.tenantId, user.tenantId)),
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
  async createDept(@Body(new ZodValidationPipe(departmentCreateSchema)) body: DepartmentCreateInput, @CurrentUser() user: AuthContext) {
    const code = body.code.trim().toLowerCase();
    const existing = await this.db.query.departments.findFirst({
      where: and(eq(departments.tenantId, user.tenantId), eq(departments.code, code)),
    });
    if (existing) throw new ConflictError('Bu departman kodu zaten kayıtlı');
    const [row] = await this.db
      .insert(departments)
      .values({ tenantId: user.tenantId, code, name: body.name.trim(), description: body.description?.trim() || null })
      .returning();
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
      where: and(eq(departments.id, id), eq(departments.tenantId, user.tenantId)),
    });
    if (!existing) throw new NotFoundError('Departman');
    const patch: Record<string, unknown> = {};
    if (body.name !== undefined) patch.name = body.name;
    if (body.description !== undefined) patch.description = body.description;
    const [row] = await this.db.update(departments).set(patch).where(eq(departments.id, id)).returning();
    return row;
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
    for (const k of ['name', 'taxNumber', 'email', 'phone'] as const) {
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
        oldValues: { name: tenant.name, taxNumber: tenant.taxNumber, email: tenant.email, phone: tenant.phone },
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
    };
  }
}
