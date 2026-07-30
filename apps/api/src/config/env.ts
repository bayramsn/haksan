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

const envOptionalText = z.preprocess((value) => {
  if (typeof value === 'string' && value.trim() === '') return undefined;
  return value;
}, z.string().min(1).optional());

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
  // Sertifika doğrulaması varsayılan olarak zorunludur. Özel CA kullanan
  // kurulumlar DATABASE_SSL_CA ile kök sertifikayı sağlayabilir.
  DATABASE_SSL_REJECT_UNAUTHORIZED: envBoolean.default(true),
  DATABASE_SSL_CA: z.string().min(1).optional(),
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

  // Sohbet gerçek-zaman (Socket.IO). Varsayılan AÇIK — soket kopması durumunda
  // istemci polling fallback'e döner; Render ücretsiz plan gibi soket dostu
  // olmayan ortamlarda CHAT_REALTIME_ENABLED=false ile kapatılabilir.
  CHAT_REALTIME_ENABLED: envBoolean.default(true),

  // Zamanlanmış otomasyon işleri: sabah brifingi, vadesi geçen tahsilat,
  // garanti bitişi ve cevapsız teklif hatırlatmaları. Test ortamında ve
  // AUTOMATION_ENABLED=false iken hiçbir iş çalışmaz. E-posta özeti yalnız
  // SMTP yapılandırılmış VE AUTOMATION_DIGEST_EMAILS=true iken gönderilir.
  AUTOMATION_ENABLED: envBoolean.default(true),
  AUTOMATION_TIMEZONE: z.string().default('Europe/Istanbul'),
  AUTOMATION_STALE_QUOTE_DAYS: z.coerce.number().int().positive().max(90).default(7),
  AUTOMATION_WARRANTY_WINDOW_DAYS: z.coerce.number().int().positive().max(365).default(30),
  AUTOMATION_DIGEST_EMAILS: envBoolean.default(false),
  // Virgülle ayrılmış brifing e-posta alıcıları (örn. yonetim@firma.com,satis@firma.com).
  AUTOMATION_DIGEST_TO: envOptionalText,
  // Lead/fırsat süreç takibi. Eşikler paylaşılan sabitlerden gelir; buradaki
  // anahtarlar yalnız bildirim üretimini açıp kapatır ve listeyi sınırlar.
  AUTOMATION_LEAD_SLA_ENABLED: envBoolean.default(true),
  AUTOMATION_ROTTING_ENABLED: envBoolean.default(true),

  // Santral/VoIP çağrı webhook doğrulaması. Production'da zorunlu; dev/test'te
  // boşsa varsayılan test sırrı `dev-call-secret` kabul edilir.
  CALL_WEBHOOK_SECRET: z.string().min(8).optional(),

  // WhatsApp Business (Meta Cloud API). Tümü boşsa özellik KAPALI: giden mesaj
  // gönderilmez, gelen webhook çağrıları 200 döner ama işlenmez. Anahtar
  // sunucuda tutulur, istemciye asla dönülmez.
  WHATSAPP_ENABLED: envBoolean.default(false),
  WHATSAPP_PHONE_NUMBER_ID: envOptionalText,
  WHATSAPP_ACCESS_TOKEN: envOptionalSecret,
  WHATSAPP_API_VERSION: z.string().default('v21.0'),
  // Meta webhook doğrulama (GET hub.verify_token) — abonelik el sıkışması için.
  WHATSAPP_VERIFY_TOKEN: envOptionalText,
  // Gelen mesajların hangi tenant'a düşeceği (tek tenant kurulumda zorunlu).
  WHATSAPP_DEFAULT_TENANT_ID: z.string().uuid().optional(),

  // CRM Asistanı LLM ayarları. API key sadece backend ortamında tutulur; boşsa
  // asistan CRM verilerinden deterministik yanıt üretir. NVIDIA NIM hosted API
  // OpenAI uyumlu chat/completions sözleşmesiyle çağrılır.
  ASSISTANT_LLM_PROVIDER: z.enum(['none', 'openrouter', 'groq', 'anthropic', 'nvidia']).default('none'),
  ASSISTANT_MODEL: z.string().max(128).default('openrouter/free'),
  ASSISTANT_API_KEY: envOptionalSecret,
  ASSISTANT_MAX_TOKENS: z.coerce.number().int().positive().max(4000).default(700),
  // CRM özetlerinde tutarlılık için düşük yaratıcılık kullanılır. Sağlayıcının
  // desteklemediği özel reasoning parametreleri bilinçli olarak gönderilmez.
  ASSISTANT_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.2),
  ASSISTANT_TOP_P: z.coerce.number().gt(0).max(1).default(0.8),
  // Kullanıcı başına GÜNLÜK kümülatif LLM token tavanı (input+output). Aşınca
  // asistan chat LLM'i atlar, deterministik cevaba düşer. 0 = sınırsız (kapalı).
  ASSISTANT_DAILY_TOKEN_BUDGET: z.coerce.number().int().nonnegative().default(50_000),
  // Kullanıcıya özel bir tutar atanmadığında uygulanacak günlük USD maliyet tavanı.
  // 0, varsayılan kullanıcılar için LLM'i kapatır; kullanıcı bazlı limit yine atanabilir.
  ASSISTANT_DEFAULT_DAILY_USD_LIMIT: z.coerce.number().min(0).max(1000).default(1),
  // Sağlayıcının/modelin sözleşme fiyatı değişebileceği için fiyatlar kodda sabitlenmez;
  // buradaki USD / 1M token oranları bütçe muhasebesinde kullanılır.
  ASSISTANT_INPUT_USD_PER_MILLION_TOKENS: z.coerce.number().positive().max(10_000).default(0.1),
  ASSISTANT_OUTPUT_USD_PER_MILLION_TOKENS: z.coerce.number().positive().max(10_000).default(0.4),

  // Prometheus endpoint'i production'da bearer token ile korunur. Boş değer
  // yalnız private local/test ağlarında kabul edilir.
  METRICS_TOKEN: envOptionalSecret,

  // Storage
  S3_PROVIDER: z.enum(['minio', 'supabase', 's3', 'r2']).default('minio'),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('us-east-1'),
  // AWS S3 production uses the EC2/ECS IAM role when these are empty. MinIO
  // and R2 require an explicit application credential pair.
  S3_ACCESS_KEY_ID: envOptionalText,
  S3_SECRET_ACCESS_KEY: envOptionalText,
  // AWS bucket names are global. Logical app buckets remain in the DB and are
  // mapped to prefixes under this account-specific physical bucket.
  S3_BUCKET_NAME: envOptionalText,
  S3_BUCKET_PREFIX: z.string().default('erp'),
  S3_FORCE_PATH_STYLE: envBoolean.default(true),

  // Şema migration öncesi opsiyonel offsite PostgreSQL yedeği. Etkinleştirilen
  // production kurulumlarında başarısız yedek deploy'u durdurur.
  DB_BACKUP_ENABLED: envBoolean.default(false),
  DB_BACKUP_REQUIRED: envBoolean.default(false),
  DB_BACKUP_TIMEOUT_SECONDS: z.coerce.number().int().min(30).max(7_200).default(1_800),
  S3_BACKUP_BUCKET: z.string().min(1).optional(),

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

  // Kamuya açık şikayet formu bağlantıları kalıcı bearer credential olmamalıdır.
  PUBLIC_COMPLAINT_LINK_TTL_DAYS: z.coerce.number().int().positive().max(365).default(30),

  // Mail
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  SMTP_USER: envOptionalText,
  SMTP_PASSWORD: envOptionalText,
  SMTP_SECURE: envBoolean.default(false),
  SMTP_FROM: z.string().default('noreply@haksan.local'),
  APP_PUBLIC_URL: z.string().url().optional(),
  // Kullanıcının kendi kurumsal webmail hesabıyla gönderim yapması. SMTP hostu
  // istemciden alınmaz; SSRF riskini önlemek için deployment config'inde sabittir.
  USER_MAIL_ENABLED: envBoolean.default(false),
  USER_MAIL_SMTP_HOST: envOptionalText,
  USER_MAIL_SMTP_PORT: z.coerce.number().int().min(1).max(65_535).default(465),
  USER_MAIL_SMTP_SECURE: envBoolean.default(true),
  USER_MAIL_ALLOWED_EMAIL_DOMAINS: envOptionalText,
  // `openssl rand -base64 32` ile üretilmiş 32-byte AES anahtarı.
  USER_MAIL_CREDENTIAL_ENCRYPTION_KEY: envOptionalSecret,
  // Operasyon ekibi gerektiğinde uygulama güncellemeden uyumlu bir Nominatim
  // sağlayıcısına geçebilsin. API çağrıları yalnız backend üzerinden yapılır.
  OSM_NOMINATIM_URL: z.string().url().default('https://nominatim.openstreetmap.org/search'),
}).superRefine((env, ctx) => {
  if (!!env.S3_ACCESS_KEY_ID !== !!env.S3_SECRET_ACCESS_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['S3_ACCESS_KEY_ID'],
      message: 'S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY must be configured together',
    });
  }
  if (env.S3_PROVIDER === 's3' && !env.S3_BUCKET_NAME) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['S3_BUCKET_NAME'],
      message: 'S3_BUCKET_NAME must be set when S3_PROVIDER=s3',
    });
  }
  if (env.S3_PROVIDER !== 's3' && env.S3_PROVIDER !== 'supabase' && (!env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['S3_ACCESS_KEY_ID'],
      message: 'S3-compatible providers other than AWS require an access-key pair',
    });
  }

  if (env.ASSISTANT_LLM_PROVIDER !== 'none' && !env.ASSISTANT_API_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['ASSISTANT_API_KEY'],
      message: 'ASSISTANT_API_KEY must be set when ASSISTANT_LLM_PROVIDER is enabled',
    });
  }

  if (env.USER_MAIL_ENABLED) {
    if (!env.USER_MAIL_SMTP_HOST) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['USER_MAIL_SMTP_HOST'],
        message: 'USER_MAIL_SMTP_HOST must be set when personal webmail is enabled',
      });
    }
    if (!env.USER_MAIL_ALLOWED_EMAIL_DOMAINS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['USER_MAIL_ALLOWED_EMAIL_DOMAINS'],
        message: 'At least one allowed corporate email domain is required',
      });
    }
    const key = env.USER_MAIL_CREDENTIAL_ENCRYPTION_KEY;
    if (!key || !/^[A-Za-z0-9+/]{43}=$/.test(key) || Buffer.from(key, 'base64').length !== 32) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['USER_MAIL_CREDENTIAL_ENCRYPTION_KEY'],
        message: 'USER_MAIL_CREDENTIAL_ENCRYPTION_KEY must be a base64-encoded 32-byte key',
      });
    }
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
  if (
    env.ASSISTANT_LLM_PROVIDER === 'nvidia' &&
    !/^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/i.test(env.ASSISTANT_MODEL)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['ASSISTANT_MODEL'],
      message: 'NVIDIA NIM assistant model must use publisher/model format',
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
  if (!env.METRICS_TOKEN) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['METRICS_TOKEN'],
      message: 'METRICS_TOKEN must be set in production',
    });
  }
  if (env.DB_BACKUP_ENABLED && !env.DB_BACKUP_REQUIRED) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['DB_BACKUP_REQUIRED'],
      message: 'DB_BACKUP_REQUIRED must be true when DB_BACKUP_ENABLED is enabled in production',
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
  if (!env.APP_PUBLIC_URL) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['APP_PUBLIC_URL'],
      message: 'APP_PUBLIC_URL must be set in production for password reset links',
    });
  }
  if (!!env.SMTP_USER !== !!env.SMTP_PASSWORD) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['SMTP_USER'],
      message: 'SMTP_USER and SMTP_PASSWORD must be configured together',
    });
  }
  if (env.SMTP_USER && /^(localhost|127\.0\.0\.1)$/i.test(env.SMTP_HOST)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['SMTP_HOST'],
      message: 'Authenticated production SMTP must not use a localhost host',
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
