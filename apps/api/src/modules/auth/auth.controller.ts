import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { loginSchema, forgotPasswordSchema, resetPasswordSchema, type LoginInput, type ForgotPasswordInput, type ResetPasswordInput } from '@haksan/shared';
import { AuthService } from './auth.service';
import { ZodValidationPipe } from '../../shared/utils/zod-pipe';
import { Public, AuthGuard } from '../../shared/security/auth.guard';
import { CurrentUser } from '../../shared/security/current-user.decorator';
import type { AuthContext } from '../../shared/security/auth.types';
import { loadEnv } from '../../config/env';
import { Throttle } from '@nestjs/throttler';

const REFRESH_COOKIE = 'haksan_rt';

function setRefreshCookie(res: FastifyReply, token: string, expiresAt: Date): void {
  const env = loadEnv();
  res.setCookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAMESITE,
    domain: env.COOKIE_DOMAIN,
    path: '/api/v1/auth',
    expires: expiresAt,
  });
}

function clearRefreshCookie(res: FastifyReply): void {
  const env = loadEnv();
  res.clearCookie(REFRESH_COOKIE, {
    path: '/api/v1/auth',
    domain: env.COOKIE_DOMAIN,
  });
}

function getIp(req: FastifyRequest): string | undefined {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string') return xf.split(',')[0]?.trim();
  return req.ip;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ login: { limit: 5, ttl: 60_000 } })
  @Post('login')
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply
  ) {
    const ua = req.headers['user-agent'];
    const result = await this.auth.login(body.email, body.password, getIp(req), typeof ua === 'string' ? ua : undefined);
    setRefreshCookie(res, result.refreshToken, result.refreshTokenExpiresAt);
    return {
      accessToken: result.accessToken,
      user: result.user,
    };
  }

  @Public()
  @Post('refresh')
  async refresh(@Req() req: FastifyRequest, @Res({ passthrough: true }) res: FastifyReply) {
    const cookies = (req as unknown as { cookies: Record<string, string | undefined> }).cookies ?? {};
    const raw = cookies[REFRESH_COOKIE];
    if (!raw) return { accessToken: null };
    const ua = req.headers['user-agent'];
    try {
      const result = await this.auth.refresh(raw, getIp(req), typeof ua === 'string' ? ua : undefined);
      setRefreshCookie(res, result.refreshToken, result.refreshTokenExpiresAt);
      return { accessToken: result.accessToken, user: result.user };
    } catch (err) {
      clearRefreshCookie(res);
      throw err;
    }
  }

  @Public()
  @Post('logout')
  async logout(@Req() req: FastifyRequest, @Res({ passthrough: true }) res: FastifyReply) {
    const cookies = (req as unknown as { cookies: Record<string, string | undefined> }).cookies ?? {};
    const raw = cookies[REFRESH_COOKIE];
    await this.auth.logout(raw);
    clearRefreshCookie(res);
    return { ok: true };
  }

  @Public()
  @Throttle({ login: { limit: 5, ttl: 60_000 } })
  @Post('forgot-password')
  async forgot(@Body(new ZodValidationPipe(forgotPasswordSchema)) body: ForgotPasswordInput) {
    const token = await this.auth.forgotPassword(body.email);
    // In dev we surface the token to make testing easy. In production, send via email + remove this field.
    return loadEnv().NODE_ENV === 'production' ? { ok: true } : { ok: true, devToken: token };
  }

  @Public()
  @Post('reset-password')
  async reset(@Body(new ZodValidationPipe(resetPasswordSchema)) body: ResetPasswordInput) {
    await this.auth.resetPassword(body.token, body.newPassword);
    return { ok: true };
  }

  @UseGuards(AuthGuard)
  @Get('me')
  async me(@CurrentUser() user: AuthContext) {
    return this.auth.me(user.userId);
  }
}
