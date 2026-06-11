import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { ForbiddenError, UnauthorizedError } from '../utils/errors';

export const PERMISSIONS_KEY = 'requiredPermissions';

/**
 * @RequirePermissions('quotes.create', 'quotes.read')
 * — caller needs ALL listed permissions.
 *
 * super_admin (via role) gets all permissions automatically because seed
 * adds every permission code to its role_permissions.
 */
export const RequirePermissions = (...codes: string[]) => SetMetadata(PERMISSIONS_KEY, codes);

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required?.length) return true;

    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    if (!req.auth) throw new UnauthorizedError();
    for (const code of required) {
      if (!req.auth.permissions.has(code)) {
        throw new ForbiddenError(`Yetki gerekli: ${code}`);
      }
    }
    return true;
  }
}
