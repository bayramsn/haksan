import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { and, asc, eq } from 'drizzle-orm';
import { JwtTokenService } from './jwt.service';
import { DB } from '../database/database.module';
import { Inject } from '@nestjs/common';
import type { DbClient } from '../../db/client';
import { users, userDivisions } from '../../db/schema/users';
import { divisions } from '../../db/schema/tenants';
import { UnauthorizedError } from '../utils/errors';
import './auth.types';
import { rolePermissionsCacheKey } from './rbac.cache';
import { ACTIVE_DIVISION_HEADER } from '../utils/division-scope';

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
    const activeHeader =
      req.headers[ACTIVE_DIVISION_HEADER] ?? req.headers['x-active-department'];
    const activeDivisionId = Array.isArray(activeHeader) ? activeHeader[0] : activeHeader ?? null;

    req.auth = {
      userId: user.id,
      tenantId: user.tenantId,
      email: user.email,
      roles: payload.roles,
      permissions: perms,
      sessionId: payload.sid,
      divisionIds,
      primaryDivisionId,
      canViewAllDivisions,
      activeDivisionId,
    };
    return true;
  }
}
