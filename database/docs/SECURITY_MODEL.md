# Security Model

## Threat model

Aşağıdaki tehditlere karşı korunmak için tasarlandı:
1. **Cross-tenant data leak** — A tenant'ı B tenant'ının verisini görmesin
2. **Privilege escalation** — sales kullanıcısı admin endpoint'ine erişmesin
3. **Credential theft** — şifre/token loglara sızmasın, signed URL secret içermesin
4. **SQL Injection** — parametre binding zorunlu (Drizzle)
5. **Brute force** — rate limit + login lockout
6. **Replay** — refresh token rotation, kullanıldıktan sonra geçersiz

## Tenant isolation

**Her ana tabloda `tenant_id` kolonu var (FK → tenants.id).**

Backend katmanları:
1. **AuthGuard** JWT'den `tid` claim'ini okur ve `req.auth.tenantId`'ye koyar
2. Tüm servisler `actor.tenantId`'yi sorgu where clause'una ekler
3. Object-level kontrol: `companies.findFirst({ where: and(eq(id), eq(tenantId)) })`
4. Cross-tenant FK eklenirken yine tenant kontrol (`opportunities.create` companyId tenant'a ait mi?)

Test edildi: `apps/api/test/tenant-isolation.spec.ts`

## RBAC

Permission formatı: `<resource>.<action>` (örn `quotes.create`).

Permission kataloğu seed'de oluşur (29 resource × 7 action = 203 permission).

Roller:
- `super_admin`: tüm permission'lar
- `admin`: tenants.read/update hariç hepsi
- `sales`: companies/contacts/leads/opportunities/quotes/activities CRUD
- `service`: customer_devices/installations/service_tickets CRUD
- `finance`: receivables/payments CRUD + quotes approve/reject
- `stock`: warehouses/inventory CRUD + shipments
- `readonly`: tüm resource'larda sadece `read`

Yeni endpoint eklerken @RequirePermissions('resource.action') decorator zorunlu.

## Şifre saklama

- argon2id (memory-hard, GPU-resistant)
- 65536 KiB memory, 3 iteration, 4 parallelism
- Plain text password ASLA DB'de değil, asla loglarda değil

## JWT yapısı

**Access token (15 dk):**
```json
{
  "sub": "<user_uuid>",
  "tid": "<tenant_uuid>",
  "email": "...",
  "roles": ["admin"],
  "sid": "<session_uuid>"
}
```
HS256 ile imzalı, `JWT_ACCESS_SECRET` ≥ 32 byte.

**Refresh token (30 gün):**
- 256-bit opak rastgele string
- httpOnly + SameSite + (prod) Secure cookie
- SHA-256(token) DB'de saklanır
- Kullanıldığında rotate edilir, eski hash `revoked_at` + `replaced_by_id` ile işaretlenir
- Logout tüm aktif token'ları iptal eder
- Password reset tüm token'ları geçersiz kılar

## Login security

- Rate limit: 5 deneme/dk per IP (nestjs-throttler)
- Failed login attempt sayılır
- 5 hata → 15 dk hesap kilidi
- Audit log her başarılı/başarısız girişte
- E-posta sayım (enumeration) önlemek için yanlış şifre ve yok olan user aynı süreyi alır (constant-time)

## Dosya güvenliği

- MIME type whitelist: pdf, docx, xlsx, png, jpg, jpeg, webp
- Extension whitelist (MIME ile cross-check)
- Magic byte sniff (file-type kütüphanesi) — yüklenen dosyanın gerçek tipini doğrular
- Max boyut env'den (default 25 MB)
- Object key formatı sabit: `tenant/{tenant_id}/...` (cross-tenant erişim engellendi)
- Signed URL TTL ≤ 1 saat, default 5 dk
- Download öncesi tenant ownership kontrolü (`tenantFromObjectKey()`)
- Soft delete (lifecycle policy 30 gün sonra fiziksel sil)

## Audit log

Tetiklenen olaylar:
- Login başarı/başarısızlık
- Logout
- Password reset request
- User/role/permission değişimi
- Company/quote/opportunity create/update/delete
- Stage transition (opportunity)
- Quote approve/reject/send
- Inventory reserve/sell
- File upload/download/delete
- Payment/receivable işlemleri

Audit log alanları: tenant_id, actor_user_id, action, resource_type, resource_id, old_values (redacted), new_values (redacted), ip_address, user_agent, request_id, created_at.

Hassas alanlar (password, token, secret, access_key) redact() ile maskelenir.

## Headers

helmet middleware:
- X-Content-Type-Options: nosniff
- X-Frame-Options: DENY
- Strict-Transport-Security (prod)
- Referrer-Policy: no-referrer
- X-DNS-Prefetch-Control: off

Production'da reverse proxy ayrıca Content-Security-Policy header ekler.

## CORS

Allowlist (`CORS_ORIGINS` env). Hiçbir wildcard yok, credentials: true.

## Secrets

- `.env` git'te değil (`.gitignore`)
- `.env.example` placeholder'lar var
- Production: AWS Secrets Manager / Vault / Doppler önerilir
- JWT secret rotation: tabloya `jwt_secret_versions` eklenip ileride yapılabilir; v1'de manuel deploy ile rotate.
