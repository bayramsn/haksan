import 'dotenv/config';
import { z } from 'zod';

const envBoolean = z.preprocess((value) => {
  if (typeof value !== 'string') return value;
  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  return value;
}, z.boolean());

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  API_PREFIX: z.string().default('/api/v1'),

  // Database
  DB_PROVIDER: z.enum(['postgres', 'mysql', 'sqlite', 'sqlserver']).default('postgres'),
  DATABASE_URL: z.string().min(1),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),
  // Managed Postgres (Supabase/RDS/Azure) için TLS. Self-hosted/docker'da false bırak.
  DATABASE_SSL: envBoolean.default(false),

  // CORS allowlist (comma-separated)
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173')
    .transform((s) =>
      s
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)
    ),

  // Cookies
  COOKIE_DOMAIN: z.string().default('localhost'),
  COOKIE_SECURE: envBoolean.default(false),
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),

  // JWT
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),

  // Auth lockout
  AUTH_MAX_FAILED_ATTEMPTS: z.coerce.number().int().positive().default(5),
  AUTH_LOCKOUT_MINUTES: z.coerce.number().int().positive().default(15),

  // Rate limit
  RATE_LIMIT_GLOBAL: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_LOGIN: z.coerce.number().int().positive().default(5),

  // Sohbet gerçek-zaman (Socket.IO). Varsayılan KAPALI — Render ücretsiz planda
  // soketler uyku/yeniden başlatmada kopar; polling fallback çalışır. VDS'te
  // CHAT_REALTIME_ENABLED=true yapılınca anlık iletim devreye girer.
  CHAT_REALTIME_ENABLED: envBoolean.default(false),

  // Storage
  S3_PROVIDER: z.enum(['minio', 'supabase', 's3', 'r2']).default('minio'),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_BUCKET_PREFIX: z.string().default('erp'),
  S3_FORCE_PATH_STYLE: envBoolean.default(true),

  // Supabase (used when S3_PROVIDER=supabase)
  SUPABASE_URL: z.string().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

  // Upload constraints
  MAX_UPLOAD_SIZE_MB: z.coerce.number().int().positive().default(25),
  SIGNED_URL_EXPIRE_SECONDS: z.coerce.number().int().positive().default(300),

  // Password reset
  RESET_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(60),
  AUTH_DEV_RESET_TOKEN_RESPONSE: envBoolean.default(false),

  // Mail
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  SMTP_FROM: z.string().default('noreply@haksan.local'),
}).superRefine((env, ctx) => {
  if (env.NODE_ENV !== 'production') return;
  if (!env.COOKIE_SECURE) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['COOKIE_SECURE'],
      message: 'COOKIE_SECURE must be true in production',
    });
  }
  if (env.AUTH_DEV_RESET_TOKEN_RESPONSE) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['AUTH_DEV_RESET_TOKEN_RESPONSE'],
      message: 'Password reset dev token responses must be disabled in production',
    });
  }
  if (env.CORS_ORIGINS.some((origin) => /localhost|127\.0\.0\.1|\[?::1\]?/i.test(origin))) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['CORS_ORIGINS'],
      message: 'Production CORS_ORIGINS must not include localhost origins',
    });
  }
});

export type AppEnv = z.infer<typeof envSchema>;

let cached: AppEnv | undefined;

export function loadEnv(): AppEnv {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}
