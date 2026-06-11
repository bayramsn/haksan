import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { AuthContext } from './auth.types';
import { UnauthorizedError } from '../utils/errors';

/**
 * Reads `req.auth` set by AuthGuard. Throws if not authenticated.
 * Usage:
 *   @Get()
 *   list(@CurrentUser() user: AuthContext) { … }
 */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthContext => {
  const req = ctx.switchToHttp().getRequest<FastifyRequest>();
  if (!req.auth) throw new UnauthorizedError();
  return req.auth;
});
