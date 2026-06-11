import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { eq } from 'drizzle-orm';
import { JwtTokenService } from './jwt.service';
import { DB } from '../database/database.module';
import { Inject } from '@nestjs/common';
import type { DbClient } from '../../db/client';
import { users } from '../../db/schema/users';
import { UnauthorizedError } from '../utils/errors';
import './auth.types';
import { rolePermissionsCacheKey } from './rbac.cache';

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

    req.auth = {
      userId: user.id,
      tenantId: user.tenantId,
      email: user.email,
      roles: payload.roles,
      permissions: perms,
      sessionId: payload.sid,
    };
    return true;
  }
}
