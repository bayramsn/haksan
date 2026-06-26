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
// Login & şifre-sıfırlama için sıkı IP-bazlı limit (global 'default' throttler'ı
// bu route'larda override eder). Brute-force / credential-stuffing koruması.
const LOGIN_THROTTLE = { default: { limit: loadEnv().RATE_LIMIT_LOGIN, ttl: 60_000 } };

function cookieDomain(env: ReturnType<typeof loadEnv>): string | undefined {
  // Explicit `Domain=localhost` breaks supertest's cookie jar and some browsers;
  // omit domain on localhost so the host-only cookie is used.
  const d = env.COOKIE_DOMAIN?.trim();
  if (!d || d === 'localhost' || d === '127.0.0.1') return undefined;
  return d;
}

function setRefreshCookie(res: FastifyReply, token: string, expiresAt: Date): void {
  const env = loadEnv();
  res.setCookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAMESITE,
    ...(cookieDomain(env) ? { domain: cookieDomain(env) } : {}),
    path: '/api/v1/auth',
    expires: expiresAt,
  });
}

function clearRefreshCookie(res: FastifyReply): void {
  const env = loadEnv();
  res.clearCookie(REFRESH_COOKIE, {
    path: '/api/v1/auth',
    ...(cookieDomain(env) ? { domain: cookieDomain(env) } : {}),
  });
}

function getIp(req: FastifyRequest): string | undefined {
  // Fastify, trustProxy (TRUST_PROXY_HOPS) ayarına göre X-Forwarded-For'u doğru
  // değerlendirip güvenilir istemci IP'sini req.ip'e koyar. Başlığın en solunu
  // (istemci-kontrollü) elle okumak IP sahtekarlığına açıktı; req.ip kullan.
  return req.ip;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle(LOGIN_THROTTLE)
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
  @Throttle(LOGIN_THROTTLE)
  @Post('forgot-password')
  async forgot(@Body(new ZodValidationPipe(forgotPasswordSchema)) body: ForgotPasswordInput) {
    const token = await this.auth.forgotPassword(body.email);
    const env = loadEnv();
    // Test/dev token echo is opt-in so accidental non-production NODE_ENV on a live server
    // does not expose reset tokens by default. Omit devToken when no user matched so
    // callers cannot distinguish "unknown email" from "token minted".
    if (env.NODE_ENV !== 'production' && env.AUTH_DEV_RESET_TOKEN_RESPONSE && token) {
      return { ok: true, devToken: token };
    }
    return { ok: true };
  }

  @Public()
  @Throttle(LOGIN_THROTTLE)
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
