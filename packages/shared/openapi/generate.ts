/**
 * Tek doğruluk kaynağı: `@haksan/shared` zod şemalarından OpenAPI 3.0 dokümanı üretir.
 *
 * - `components.schemas`: src/index.ts'ten dışa aktarılan TÜM zod şemaları otomatik
 *   kaydedilir (Input + Response DTO'lar). Bu, native (Swift/Kotlin) model codegen'in
 *   girdisidir; böylece mobil app'ler backend sözleşmesinden sürüklenmez.
 * - `paths`: el yazımı, gerçek NestJS route'larına göre. Şimdilik çekirdek dikey dilim
 *   (auth + opportunities/kanban) tanımlı; diğer modüller aynı desenle eklenir.
 *
 * Çalıştır:  npm --workspace @haksan/shared run openapi
 * Çıktı:     packages/shared/openapi/openapi.json
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { extendZodWithOpenApi, OpenAPIRegistry, OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import * as shared from '../src/index';

extendZodWithOpenApi(z);

const registry = new OpenAPIRegistry();

// ───── Güvenlik şeması (Bearer access token) ─────
registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
});

// ───── Standart hata zarfı: { error: { code, message, details? } } ─────
const errorEnvelope = registry.register(
  'ErrorEnvelope',
  z.object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
    }),
  })
);

// ───── Tüm zod şemalarını otomatik kaydet (components.schemas) ─────
// Export adı `xxxSchema` → component adı `Xxx` (örn. opportunityCreateSchema → OpportunityCreate).
const componentByExport = new Map<string, ReturnType<typeof registry.register>>();
const usedNames = new Set<string>(['ErrorEnvelope']);

function componentName(exportName: string): string {
  const base = exportName.replace(/Schema$/, '');
  let name = base.charAt(0).toUpperCase() + base.slice(1);
  if (usedNames.has(name)) name = exportName.charAt(0).toUpperCase() + exportName.slice(1);
  usedNames.add(name);
  return name;
}

/** Bir şemanın OpenAPI'ye çevrilebildiğini izole et (örn. z.never() içerenler çevrilemez). */
function canGenerate(name: string, schema: z.ZodType): boolean {
  try {
    const probe = new OpenAPIRegistry();
    probe.register(name, schema);
    new OpenApiGeneratorV3(probe.definitions).generateComponents();
    return true;
  } catch {
    return false;
  }
}

const skipped: string[] = [];
for (const [exportName, value] of Object.entries(shared)) {
  if (!(value instanceof z.ZodType)) continue;
  const name = componentName(exportName);
  if (!canGenerate(name, value)) {
    skipped.push(exportName);
    continue;
  }
  const ref = registry.register(name, value);
  componentByExport.set(exportName, ref);
}

/** Kayıtlı şemayı export adıyla getir (path tanımlarında $ref üretmek için). */
function ref(exportName: keyof typeof shared & string) {
  const r = componentByExport.get(exportName);
  if (!r) throw new Error(`Şema kayıtlı değil: ${String(exportName)}`);
  return r;
}

/** Liste uçları için sayfalı zarf (data + meta). */
function paginated(item: z.ZodTypeAny) {
  return z.object({
    data: z.array(item),
    meta: z.object({
      page: z.number().int(),
      pageSize: z.number().int(),
      total: z.number().int(),
      totalPages: z.number().int(),
    }),
  });
}

const json = (schema: z.ZodTypeAny) => ({ content: { 'application/json': { schema } } });
const SECURED = [{ bearerAuth: [] as string[] }];

// ───── Opportunity yanıt DTO'su — gerçek liste yanıtına göre (opportunities.service.ts list()).
// Not: estimatedValue numeric(18,4) → JSON'da string; stage/company/currency leftJoin → nesne ve nullable.
// (Bu shared zod değil; yalnız native codegen sözleşmesi. İleride shared response şemasına taşınır.)
const opportunityDto = registry.register(
  'OpportunityDTO',
  z.object({
    id: z.string(),
    companyId: z.string(),
    title: z.string(),
    description: z.string().nullable(),
    estimatedValue: z.string().nullable(),
    probability: z.number().int(),
    expectedCloseDate: z.string().nullable(),
    ownerUserId: z.string().nullable(),
    createdAt: z.string(),
    company: z
      .object({ id: z.string(), legalTitle: z.string(), shortName: z.string().nullable() })
      .nullable(),
    stage: z
      .object({ id: z.string(), code: z.string(), name: z.string() })
      .nullable(),
    currency: z
      .object({ id: z.string(), code: z.string() })
      .nullable(),
  })
);

// ───────────────────────────────────────────────────────────────────────────
// PATHS — gerçek NestJS route'larına göre (global prefix /api/v1).
// ───────────────────────────────────────────────────────────────────────────

// ── Auth ──
registry.registerPath({
  method: 'post',
  path: '/auth/login',
  operationId: 'login',
  tags: ['auth'],
  summary: 'E-posta + parola ile giriş; refresh token httpOnly cookie olarak set edilir.',
  request: { body: json(ref('loginSchema')) },
  responses: {
    200: { description: 'Başarılı giriş', ...json(ref('loginResponseSchema')) },
    401: { description: 'Geçersiz kimlik', ...json(errorEnvelope) },
  },
});

registry.registerPath({
  method: 'post',
  path: '/auth/refresh',
  operationId: 'refresh',
  tags: ['auth'],
  summary: 'Cookie refresh token ile yeni access token (gövdesiz POST).',
  responses: {
    200: { description: 'Yeni access token', ...json(z.object({ accessToken: z.string() })) },
    401: { description: 'Oturum süresi doldu', ...json(errorEnvelope) },
  },
});

registry.registerPath({
  method: 'post',
  path: '/auth/logout',
  operationId: 'logout',
  tags: ['auth'],
  summary: 'Oturumu kapatır; refresh cookie temizlenir.',
  responses: { 204: { description: 'Çıkış yapıldı' } },
});

registry.registerPath({
  method: 'post',
  path: '/auth/forgot-password',
  operationId: 'forgotPassword',
  tags: ['auth'],
  request: { body: json(ref('forgotPasswordSchema')) },
  responses: { 200: { description: 'Sıfırlama tetiklendi', ...json(z.object({ ok: z.boolean(), token: z.string().optional() })) } },
});

registry.registerPath({
  method: 'post',
  path: '/auth/reset-password',
  operationId: 'resetPassword',
  tags: ['auth'],
  request: { body: json(ref('resetPasswordSchema')) },
  responses: { 200: { description: 'Parola güncellendi', ...json(z.object({ ok: z.boolean() })) } },
});

registry.registerPath({
  method: 'get',
  path: '/auth/me',
  operationId: 'getMe',
  tags: ['auth'],
  summary: 'Oturum sahibi kullanıcı + tenant + bölümler/izinler.',
  security: SECURED,
  responses: {
    200: { description: 'Profil', ...json(ref('meResponseSchema')) },
    401: { description: 'Yetkisiz', ...json(errorEnvelope) },
  },
});

// ── Opportunities (satış kartları / kanban) ──
const idParam = z.object({ id: z.string() });

registry.registerPath({
  method: 'get',
  path: '/opportunities',
  operationId: 'listOpportunities',
  tags: ['opportunities'],
  summary: 'Satış kartları listesi (sayfalı, kanban için stage bazlı filtrelenebilir).',
  security: SECURED,
  request: {
    query: z.object({
      page: z.coerce.number().int().optional(),
      pageSize: z.coerce.number().int().optional(),
      stage: z.string().optional(),
      companyId: z.string().optional(),
      ownerUserId: z.string().optional(),
      q: z.string().optional(),
    }),
  },
  responses: { 200: { description: 'Sayfalı liste', ...json(paginated(opportunityDto)) } },
});

registry.registerPath({
  method: 'get',
  path: '/opportunities/{id}',
  operationId: 'getOpportunity',
  tags: ['opportunities'],
  security: SECURED,
  request: { params: idParam },
  responses: {
    200: { description: 'Satış kartı', ...json(opportunityDto) },
    404: { description: 'Bulunamadı', ...json(errorEnvelope) },
  },
});

registry.registerPath({
  method: 'post',
  path: '/opportunities',
  operationId: 'createOpportunity',
  tags: ['opportunities'],
  security: SECURED,
  request: { body: json(ref('opportunityCreateSchema')) },
  responses: { 201: { description: 'Oluşturuldu', ...json(opportunityDto) } },
});

registry.registerPath({
  method: 'patch',
  path: '/opportunities/{id}',
  operationId: 'updateOpportunity',
  tags: ['opportunities'],
  security: SECURED,
  request: { params: idParam, body: json(ref('opportunityUpdateSchema')) },
  responses: { 200: { description: 'Güncellendi', ...json(opportunityDto) } },
});

registry.registerPath({
  method: 'patch',
  path: '/opportunities/{id}/stage',
  operationId: 'changeOpportunityStage',
  tags: ['opportunities'],
  summary: 'Kanban aşaması değiştir (sürükle-bırak).',
  security: SECURED,
  request: { params: idParam, body: json(ref('opportunityStageChangeSchema')) },
  responses: { 200: { description: 'Aşama güncellendi', ...json(opportunityDto) } },
});

registry.registerPath({
  method: 'delete',
  path: '/opportunities/{id}',
  operationId: 'deleteOpportunity',
  tags: ['opportunities'],
  security: SECURED,
  request: { params: idParam },
  responses: { 204: { description: 'Silindi' } },
});

// ───── Company / Contact yanıt DTO'ları — gerçek list() çıktısına göre ─────
const companyDto = registry.register(
  'CompanyDTO',
  z.object({
    id: z.string(),
    legalTitle: z.string(),
    shortName: z.string().nullable(),
    sector: z.string().nullable(),
    taxNumber: z.string().nullable(),
    website: z.string().nullable(),
    createdAt: z.string(),
    primaryPhone: z.string().nullable(),
    primaryEmail: z.string().nullable(),
    relationType: z.object({ code: z.string(), name: z.string() }).nullable(),
    customerStatus: z.object({ code: z.string(), name: z.string() }).nullable(),
  })
);

const contactDto = registry.register(
  'ContactDTO',
  z.object({
    id: z.string(),
    companyId: z.string(),
    fullName: z.string(),
    title: z.string().nullable(),
    department: z.string().nullable(),
    workPhone: z.string().nullable(),
    mobilePhone: z.string().nullable(),
    workEmail: z.string().nullable(),
    personalEmail: z.string().nullable(),
    createdAt: z.string(),
    company: z.object({ id: z.string(), legalTitle: z.string(), shortName: z.string().nullable() }).nullable(),
  })
);

// ── Companies (firmalar) ──
registry.registerPath({
  method: 'get',
  path: '/companies',
  operationId: 'listCompanies',
  tags: ['companies'],
  security: SECURED,
  request: {
    query: z.object({
      page: z.coerce.number().int().optional(),
      pageSize: z.coerce.number().int().optional(),
      search: z.string().optional(),
      relationTypeCode: z.string().optional(),
      customerStatusCode: z.string().optional(),
    }),
  },
  responses: { 200: { description: 'Sayfalı firma listesi', ...json(paginated(companyDto)) } },
});

registry.registerPath({
  method: 'get',
  path: '/companies/{id}',
  operationId: 'getCompany',
  tags: ['companies'],
  security: SECURED,
  request: { params: idParam },
  responses: {
    200: { description: 'Firma', ...json(companyDto) },
    404: { description: 'Bulunamadı', ...json(errorEnvelope) },
  },
});

// ── Contacts (kontaklar) ──
registry.registerPath({
  method: 'get',
  path: '/contacts',
  operationId: 'listContacts',
  tags: ['contacts'],
  security: SECURED,
  request: {
    query: z.object({
      page: z.coerce.number().int().optional(),
      pageSize: z.coerce.number().int().optional(),
      search: z.string().optional(),
      companyId: z.string().optional(),
    }),
  },
  responses: { 200: { description: 'Sayfalı kontak listesi', ...json(paginated(contactDto)) } },
});

// ───── Doküman üret ve yaz ─────
const generator = new OpenApiGeneratorV3(registry.definitions);
const document = generator.generateDocument({
  openapi: '3.0.3',
  info: {
    title: 'Haksan CRM API',
    version: '1.0.0',
    description: 'Native (iOS/Android) istemciler için zod sözleşmesinden üretilmiş OpenAPI. Kaynak: @haksan/shared.',
  },
  servers: [{ url: '/api/v1' }],
});

const outPath = resolve(dirname(fileURLToPath(import.meta.url)), 'openapi.json');
writeFileSync(outPath, JSON.stringify(document, null, 2) + '\n', 'utf8');

const schemaCount = Object.keys(document.components?.schemas ?? {}).length;
const pathCount = Object.keys(document.paths ?? {}).length;
console.log(`✓ openapi.json yazıldı: ${schemaCount} şema, ${pathCount} path → ${outPath}`);
if (skipped.length) {
  console.warn(`⚠ OpenAPI'ye çevrilemeyen ${skipped.length} şema atlandı (örn. z.never): ${skipped.join(', ')}`);
}
