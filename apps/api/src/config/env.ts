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
  DEPLOYMENT_PROFILE: z.enum(['local', 'staging', 'production']).default('local'),
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
  // WebRTC medyası için opsiyonel coturn REST kimlik bilgileri. Paylaşılan sır
  // yalnız backend'de kalır; istemciye saatlik HMAC credential döndürülür.
  WEBRTC_TURN_URLS: envOptionalText,
  WEBRTC_TURN_SHARED_SECRET: envOptionalSecret,
  WEBRTC_TURN_TTL_SECONDS: z.coerce.number().int().min(300).max(86_400).default(3_600),

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

  // Meta Business entegrasyonu. Uygulama kimliği ve imza sırları yalnız
  // backend'de kalır; tenant erişim tokenları ayrı AES-256-GCM anahtarıyla
  // veritabanında şifrelenir. Değerler boşsa CRM açılır, Meta bağlantı ekranı
  // yapılandırma eksikliğini kontrollü biçimde gösterir.
  META_APP_ID: envOptionalText,
  META_APP_SECRET: envOptionalSecret,
  META_WEBHOOK_VERIFY_TOKEN: envOptionalSecret,
  META_CREDENTIAL_ENCRYPTION_KEY: envOptionalSecret,
  META_GRAPH_API_VERSION: z.string().regex(/^v\d+\.\d+$/).default('v25.0'),
  META_GRAPH_BASE_URL: z.string().url().default('https://graph.facebook.com'),
  // Operasyon ekibi gerektiğinde uygulama güncellemeden uyumlu bir Nominatim
  // sağlayıcısına geçebilsin. API çağrıları yalnız backend üzerinden yapılır.
  OSM_NOMINATIM_URL: z.string().url().default('https://nominatim.openstreetmap.org/search'),
}).superRefine((env, ctx) => {
  if (!!env.WEBRTC_TURN_URLS !== !!env.WEBRTC_TURN_SHARED_SECRET) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['WEBRTC_TURN_URLS'],
      message: 'WEBRTC_TURN_URLS and WEBRTC_TURN_SHARED_SECRET must be configured together',
    });
  }
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
  const metaConfiguredValues = [env.META_APP_ID, env.META_APP_SECRET, env.META_WEBHOOK_VERIFY_TOKEN, env.META_CREDENTIAL_ENCRYPTION_KEY];
  if (metaConfiguredValues.some(Boolean) && !metaConfiguredValues.every(Boolean)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['META_APP_ID'],
      message: 'META_APP_ID, META_APP_SECRET, META_WEBHOOK_VERIFY_TOKEN and META_CREDENTIAL_ENCRYPTION_KEY must be configured together',
    });
  }
  if (env.META_CREDENTIAL_ENCRYPTION_KEY) {
    const key = env.META_CREDENTIAL_ENCRYPTION_KEY;
    if (!/^[A-Za-z0-9+/]{43}=$/.test(key) || Buffer.from(key, 'base64').length !== 32) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['META_CREDENTIAL_ENCRYPTION_KEY'],
        message: 'META_CREDENTIAL_ENCRYPTION_KEY must be a base64-encoded 32-byte key',
      });
    }
  }
  if (env.NODE_ENV !== 'production') return;
  if (env.DEPLOYMENT_PROFILE === 'local') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['DEPLOYMENT_PROFILE'],
      message: 'Production NODE_ENV requires an explicit staging or production deployment profile',
    });
  }
  if (env.DEPLOYMENT_PROFILE === 'production' && (!env.DB_BACKUP_ENABLED || !env.DB_BACKUP_REQUIRED)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['DB_BACKUP_REQUIRED'],
      message: 'The production deployment profile requires enabled and mandatory database backups',
    });
  }
  if (env.DEPLOYMENT_PROFILE === 'staging' && (env.DB_BACKUP_ENABLED || env.DB_BACKUP_REQUIRED)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['DB_BACKUP_ENABLED'],
      message: 'The disposable staging deployment profile must not claim production backup guarantees',
    });
  }
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
