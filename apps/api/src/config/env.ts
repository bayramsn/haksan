import 'dotenv/config';
import { z } from 'zod';

const envBoolean = z.preprocess((value) => {
  if (typeof value !== 'string') return value;
  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  return value;
}, z.boolean());

const envOptionalSecret = z.preprocess((value) => {
  if (typeof value === 'string' && value.trim() === '') return undefined;
  return value;
}, z.string().min(8).optional());

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
  // Prod'da TLS'siz DB bağlantısına bilinçli izin (özel ağ/self-hosted). Aksi halde
  // prod'da DATABASE_SSL=true zorunludur (bkz. superRefine).
  DATABASE_ALLOW_PLAINTEXT: envBoolean.default(false),

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
  PUBLIC_LINK_SECRET: z.string().min(32).optional(),
  // Cookie imzalama sırrı. Verilmezse JWT_REFRESH_SECRET'e düşer; ayrı bir değer
  // sır yeniden-kullanımını önler (least-privilege).
  COOKIE_SECRET: z.string().min(32).optional(),

  // Auth lockout
  AUTH_MAX_FAILED_ATTEMPTS: z.coerce.number().int().positive().default(5),
  AUTH_LOCKOUT_MINUTES: z.coerce.number().int().positive().default(15),

  // Rate limit
  RATE_LIMIT_GLOBAL: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_LOGIN: z.coerce.number().int().positive().default(5),
  // Dosya yükleme endpoint'leri için sıkı limit (CLAUDE.md #2).
  RATE_LIMIT_UPLOAD: z.coerce.number().int().positive().default(5),
  // Önündeki güvenilir proxy (Render/Nginx) sayısı. trustProxy bu sayıya sabitlenir;
  // istemcinin X-Forwarded-For ile IP sahtekarlığı yapıp limit/lockout atlatmasını önler.
  TRUST_PROXY_HOPS: z.coerce.number().int().nonnegative().default(1),

  // Sohbet gerçek-zaman (Socket.IO). Varsayılan KAPALI — Render ücretsiz planda
  // soketler uyku/yeniden başlatmada kopar; polling fallback çalışır. VDS'te
  // CHAT_REALTIME_ENABLED=true yapılınca anlık iletim devreye girer.
  CHAT_REALTIME_ENABLED: envBoolean.default(false),

  // Santral/VoIP çağrı webhook doğrulaması. Production'da zorunlu; dev/test'te
  // boşsa varsayılan test sırrı `dev-call-secret` kabul edilir.
  CALL_WEBHOOK_SECRET: z.string().min(8).optional(),

  // CRM Asistanı LLM ayarları. API key sadece backend ortamında tutulur; boşsa
  // asistan CRM verilerinden deterministik yanıt üretir. OpenRouter'da ücret
  // oluşmaması için yalnız Free Router (`openrouter/free`) veya `:free`
  // varyantları kabul edilir; anthropic'te model `claude-*` olmalıdır
  // (örn. claude-haiku-4-5).
  ASSISTANT_LLM_PROVIDER: z.enum(['none', 'openrouter', 'groq', 'anthropic']).default('none'),
  ASSISTANT_MODEL: z.string().max(128).default('openrouter/free'),
  ASSISTANT_API_KEY: envOptionalSecret,
  ASSISTANT_MAX_TOKENS: z.coerce.number().int().positive().max(4000).default(700),
  // Kullanıcı başına GÜNLÜK kümülatif LLM token tavanı (input+output). Aşınca
  // asistan chat LLM'i atlar, deterministik cevaba düşer. 0 = sınırsız (kapalı).
  ASSISTANT_DAILY_TOKEN_BUDGET: z.coerce.number().int().nonnegative().default(50_000),

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
  if (env.ASSISTANT_LLM_PROVIDER !== 'none' && !env.ASSISTANT_API_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['ASSISTANT_API_KEY'],
      message: 'ASSISTANT_API_KEY must be set when ASSISTANT_LLM_PROVIDER is enabled',
    });
  }
  if (
    env.ASSISTANT_LLM_PROVIDER === 'openrouter' &&
    env.ASSISTANT_MODEL !== 'openrouter/free' &&
    !env.ASSISTANT_MODEL.endsWith(':free')
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['ASSISTANT_MODEL'],
      message: 'OpenRouter assistant model must be openrouter/free or a :free model variant',
    });
  }
  if (env.ASSISTANT_LLM_PROVIDER === 'anthropic' && !env.ASSISTANT_MODEL.startsWith('claude-')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['ASSISTANT_MODEL'],
      message: 'Anthropic assistant model must be a claude-* model (e.g. claude-haiku-4-5)',
    });
  }

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
  if (!env.CALL_WEBHOOK_SECRET) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['CALL_WEBHOOK_SECRET'],
      message: 'CALL_WEBHOOK_SECRET must be set in production',
    });
  }
  if (!env.DATABASE_SSL && !env.DATABASE_ALLOW_PLAINTEXT) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['DATABASE_SSL'],
      message:
        'Production requires DATABASE_SSL=true (or set DATABASE_ALLOW_PLAINTEXT=true for private-network/self-hosted DBs)',
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
