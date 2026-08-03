import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { JwtTokenService } from './jwt.service';
import { DB } from '../database/database.module';
import { Inject } from '@nestjs/common';
import type { DbClient } from '../../db/client';
import { loginSessions, users, userAccessScopes, userDepartmentAssignments, userDivisions } from '../../db/schema/users';
import { departments, divisions } from '../../db/schema/tenants';
import { UnauthorizedError } from '../utils/errors';
import './auth.types';
import { rolePermissionsCacheKey } from './rbac.cache';
import { ACTIVE_DEPARTMENT_HEADER, ACTIVE_DIVISION_HEADER } from '../utils/division-scope';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtTokenService,
    @Inject(DB) private readonly db: DbClient
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedError('Token gerekli');

    const token = header.slice(7);
    let payload;
    try {
      payload = this.jwt.verifyAccess(token);
    } catch {
      throw new UnauthorizedError('Geçersiz veya süresi dolmuş token');
    }

    const user = await this.db.query.users.findFirst({
      where: eq(users.id, payload.sub),
    });
    if (!user || user.deletedAt || user.status !== 'active' || user.tenantId !== payload.tid) {
      throw new UnauthorizedError('Kullanıcı geçersiz');
    }
    // Access tokens are bound to both an active login session and the user's
    // auth version. Logout, password reset, role changes and deactivation take
    // effect immediately rather than waiting for access-token expiry.
    if (!payload.sid || !Number.isInteger(payload.ver) || payload.ver !== user.authVersion) {
      throw new UnauthorizedError('Oturum geçersiz');
    }
    const session = await this.db.query.loginSessions.findFirst({
      where: and(
        eq(loginSessions.id, payload.sid),
        eq(loginSessions.userId, user.id),
        eq(loginSessions.tenantId, user.tenantId),
        isNull(loginSessions.revokedAt)
      ),
    });
    if (!session) throw new UnauthorizedError('Oturum sonlandırılmış');

    // Permissions are eagerly loaded by RbacService and cached; here we just attach what's in the token
    // plus a permission set the AuthService refreshes on login.
    const perms = await rolePermissionsCacheKey(this.db, payload.sub);

    // Bölüm (CNC/Üniversal/Sac) üyelikleri — ticari verinin izolasyonu için.
    const canViewAllDivisions = perms.has('divisions.view_all');
    let divisionRows = await this.db
      .select({ divisionId: userDivisions.divisionId, isPrimary: userDivisions.isPrimary })
      .from(userDivisions)
      .where(eq(userDivisions.userId, user.id));
    if (canViewAllDivisions && divisionRows.length === 0) {
      const tenantDivisions = await this.db
        .select({ divisionId: divisions.id })
        .from(divisions)
        .where(and(eq(divisions.tenantId, user.tenantId), eq(divisions.isActive, true)))
        .orderBy(asc(divisions.sortOrder), asc(divisions.name));
      divisionRows = tenantDivisions.map((division, index) => ({ ...division, isPrimary: index === 0 }));
    }
    const divisionIds = divisionRows.map((r) => r.divisionId);
    const primaryDivisionId = divisionRows.find((r) => r.isPrimary)?.divisionId ?? divisionIds[0] ?? null;
    const activeHeader = req.headers[ACTIVE_DIVISION_HEADER];
    const activeDivisionId = Array.isArray(activeHeader) ? activeHeader[0] : activeHeader ?? null;
    const activeDepartmentHeader = req.headers[ACTIVE_DEPARTMENT_HEADER];
    const activeDepartmentId = Array.isArray(activeDepartmentHeader) ? activeDepartmentHeader[0] : activeDepartmentHeader ?? null;

    let departmentRows = await this.db
      .select({ departmentId: userDepartmentAssignments.departmentId, isPrimary: userDepartmentAssignments.isPrimary })
      .from(userDepartmentAssignments)
      .innerJoin(departments, eq(userDepartmentAssignments.departmentId, departments.id))
      .where(
        and(
          eq(userDepartmentAssignments.userId, user.id),
          eq(departments.tenantId, user.tenantId),
          isNull(departments.deletedAt)
        )
      );
    if (departmentRows.length === 0 && user.departmentId) {
      const [activeDepartment] = await this.db
        .select({ departmentId: departments.id })
        .from(departments)
        .where(
          and(
            eq(departments.id, user.departmentId),
            eq(departments.tenantId, user.tenantId),
            isNull(departments.deletedAt)
          )
        )
        .limit(1);
      if (activeDepartment) departmentRows = [{ ...activeDepartment, isPrimary: true }];
    }
    if (departmentRows.length === 0 && canViewAllDivisions) {
      const tenantDepartments = await this.db
        .select({ departmentId: departments.id })
        .from(departments)
        .where(and(eq(departments.tenantId, user.tenantId), isNull(departments.deletedAt)))
        .orderBy(asc(departments.name));
      departmentRows = tenantDepartments.map((department, index) => ({ ...department, isPrimary: index === 0 }));
    }
    const departmentIds = departmentRows.map((r) => r.departmentId);
    const primaryDepartmentId = departmentRows.find((r) => r.isPrimary)?.departmentId ?? departmentIds[0] ?? null;
    const accessScopes = await this.db
      .select({
        resource: userAccessScopes.resource,
        departmentId: userAccessScopes.departmentId,
        divisionId: userAccessScopes.divisionId,
        isPrimary: userAccessScopes.isPrimary,
      })
      .from(userAccessScopes)
      .where(and(eq(userAccessScopes.userId, user.id), eq(userAccessScopes.tenantId, user.tenantId)))
      .orderBy(asc(userAccessScopes.resource), desc(userAccessScopes.isPrimary));

    req.auth = {
      userId: user.id,
      tenantId: user.tenantId,
      email: user.email,
      roles: payload.roles,
      permissions: perms,
      sessionId: payload.sid,
      divisionIds,
      primaryDivisionId,
      departmentIds,
      primaryDepartmentId,
      canViewAllDivisions,
      activeDivisionId,
      activeDepartmentId,
      accessScopes,
    };
    return true;
  }
}
