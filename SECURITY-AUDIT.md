# Güvenlik Denetimi — Haksan ERP/CRM

**Tarih:** 2026-06-26
**Kapsam:** `apps/api` (NestJS + Fastify + Drizzle) ve `apps/web` (React + Vite). `packages/shared` kapsam dışı.
**Yöntem:** Otomatik tarama (`ruflo security` + `npm audit`) + manuel kod-seviyesi denetim. **Her bulgu kaynak kodda teyit edildi**; araçların ürettiği aday bulgular tek tek doğrulanıp false-positive'ler elendi.
**Not:** İlk sürüm bir **tespit** raporuydu; **2026-06-26 itibarıyla bulunan açıklar düzeltildi** (aşağıdaki Remediation Durumu).

---

## Remediation Durumu (2026-06-26)

| ID | Açık | Durum | Düzeltme |
|----|------|-------|----------|
| **H-1** | Rol-atama yetki yükseltmesi | 🟢 Düzeltildi | `createUser`/`updateUser`'da `super_admin` için `requireSuperAdmin()` + boş `.set()` 500 fix. Regresyon testi eklendi. |
| **M-1** | Bağımlılık CVE'leri | 🟢 Kısmen | Web runtime HIGH'ları kapatıldı: `react-router` 7.13→7.18, `axios` 1.8→1.18. Kalanlar dev/build-tooling veya kırıcı major gerektiren transitive (aşağıda). |
| **M-2** | X-Forwarded-For IP sahtekarlığı | 🟢 Düzeltildi | `trustProxy: TRUST_PROXY_HOPS` (vars. 1) + `getIp()` artık `req.ip`. |
| **M-3** | Dosya yükleme magic-byte doğrulaması yok | 🟢 Düzeltildi | `uploadContent`'e `validateActualFile(body)` eklendi. |
| **L-1** | Access token sessionStorage'da | 🟢 Düzeltildi | Token artık yalnız bellekte; reload'da httpOnly cookie ile yenileniyor. |
| **L-2** | reset-password throttle yok | 🟢 Düzeltildi | `@Throttle(LOGIN_THROTTLE)` eklendi. |
| **L-3** | Repoda dev fallback secret'lar | 🟡 Kabul | Prod env guard'ları ile korunuyor (localhost/dev). `.env.example` güncellendi. |
| **L-4** | Prod'da DATABASE_SSL zorunlu değil | 🟢 Düzeltildi | superRefine: prod'da `DATABASE_SSL=true` (veya `DATABASE_ALLOW_PLAINTEXT`). |
| **L-5** | Cookie secret = JWT_REFRESH_SECRET | 🟢 Düzeltildi | Ayrı `COOKIE_SECRET` env (verilmezse fallback). |
| **L-6** | argon2 parametreleri sabit değil | 🟢 Düzeltildi | `shared/security/password.ts` (OWASP m=19MiB,t=2,p=1); tüm çağrılar merkezi. |
| **#7** | X-Frame-Options SAMEORIGIN | 🟢 Düzeltildi | helmet `frameguard: { action: 'deny' }`. |
| **#2** | Dosya yükleme rate-limit yok | 🟢 Düzeltildi | files upload endpoint'lerine `@Throttle(UPLOAD_THROTTLE)`. |

**Doğrulama:** API typecheck temiz; güvenlik-kritik test paketleri geçiyor (permissions+H-1 regresyon, auth+lockout+reset, file-upload, finance, service…); web `vite build` başarılı (react-router/axios bump'ları uyumlu).

**Kalan bağımlılık riski (M-1):** picomatch (vite build-tooling, ReDoS), uuid (exceljs/@aws-sdk transitive — kırıcı major gerektirir), form-data (yalnız supertest/test), webpack/@nestjs-cli/@angular-devkit (dev). Bunlar **production runtime saldırı yüzeyinde değil**; `npm audit fix` bir dev peer-conflict (vitest/coverage-v8) yüzünden bloke; kırıcı major upgrade'ler ayrı, test edilerek yapılmalı.

---

## Özet Tablosu

| Önem | Adet | Başlıca konu |
|------|------|--------------|
| 🔴 Yüksek | 1 | Yetki yükseltme (rol atama) |
| 🟠 Orta | 2 | Bağımlılık CVE'leri, X-Forwarded-For güveni |
| 🟡 Düşük | 6 | sessionStorage token, reset throttle, dev fallback secret'lar, DB SSL, cookie secret reuse, argon2 parametreleri |
| ⚪ Bilgi/Temiz | — | Doğrulanıp güvenli bulunan veya elenen aday bulgular (aşağıda) |

Genel değerlendirme: kod tabanı **güvenlik açısından olgun** — güçlü prod env guard'ları, parametreli sorgular, hash'li token'lar, magic-byte dosya doğrulaması, sağlam çok-kiracılı izolasyon. Tek gerçek erişim-kontrolü hatası rol-atama yetki yükseltmesidir; gerisi sıkılaştırma (hardening) niteliğindedir.

---

## 🔴 YÜKSEK

### H-1 — Yetki yükseltme: `users.create` / `users.update` ile `super_admin` rolü atanabiliyor
**Konum:** [admin.controller.ts](apps/api/src/modules/admin/admin.controller.ts) (`createUser`, `updateUser`)
**OWASP:** A01 Broken Access Control · **CLAUDE.md:** #4 (rol kontrolleri)
**Durum:** ✅ Teyitli → 🟢 **DÜZELTİLDİ (2026-06-26)**

> **Düzeltme:** `createUser` ve `updateUser` artık `super_admin` rolüne dokunan (atayan VEYA kaldıran) işlemlerde `requireSuperAdmin()` çağırıyor; normal rol yönetimi etkilenmedi. Ayrıca yalnız rol/bölüm değişen PATCH'lerde boş `.set()` nedeniyle oluşan 500 hatası giderildi. Regresyon testi: `test/permissions.spec.ts › admin (users.*) cannot escalate by assigning super_admin`. Tüm 63 ilgili test geçiyor.

`createUser` yalnızca `@RequirePermissions('users.create')`, `updateUser` yalnızca `@RequirePermissions('users.update')` ile korunuyor. İkisi de `body.roleCodes` içindeki **herhangi bir rolü** (kiracı içinde) atıyor — `super_admin` dâhil — ve **`requireSuperAdmin()` kontrolü yok**. Oysa aynı dosyadaki `createRole`/`updateRole` ([L394](apps/api/src/modules/admin/admin.controller.ts:394), [L417](apps/api/src/modules/admin/admin.controller.ts:417)) bu korumayı çağırıyor. Yani koruma mekanizması mevcut ama kullanıcı-rol atamasında uygulanmamış.

**Exploit:** `users.update` iznine sahip bir kullanıcı (örn. bir "İK/Yönetici" rolü):
```
PATCH /api/v1/admin/users/<kendi-id>   { "roleCodes": ["super_admin"] }
```
→ kendini `super_admin` yapar, kiracı üzerinde tam kontrol elde eder. Aynı şekilde `createUser` ile `roleCodes:["super_admin"]` vererek yeni süper admin hesap açılabilir.

**Sınır:** Rol araması `eq(roles.tenantId, user.tenantId)` ile filtreli → yalnız **kendi kiracısı** içinde geçerli (çapraz-kiracı değil). Yine de kiracı içi tam yetki yükseltmesidir.

**Düzeltme önerisi:** `createUser`/`updateUser` içinde, `roleCodes` ayrıcalıklı bir rol (en azından `super_admin`) içeriyorsa `this.requireSuperAdmin(user)` çağır; ideal olarak "atayan, sahip olmadığı izni atayamaz" hiyerarşi kontrolü ekle.

---

## 🟠 ORTA

### M-1 — Savunmasız bağımlılıklar (CVE)
**Kaynak:** `npm audit` + `ruflo security cve` · **OWASP:** A06 · **CLAUDE.md:** #10
**Durum:** ✅ Teyitli (araç)

| Workspace | Toplam | Kritik | Yüksek |
|-----------|--------|--------|--------|
| `@haksan/api` | 69 | 7 | 16 |
| `@haksan/web` | 18 | 3 | 10 |

Çoğu **dev/build araç zinciri** (çalışma zamanı değil): `@nestjs/cli`, `@angular-devkit/*`, `webpack` (build-time SSRF), `concurrently → shell-quote` (kritik), `vite` (dev-server path traversal/arbitrary file read — yalnız geliştirme sunucusu). **Çalışma zamanını ilgilendirenler:** `uuid <11.1.1` (buffer bounds — `@aws-sdk` ve `exceljs` altında), `react-router` (PUT/PATCH/DELETE üzerinden CSRF — web runtime), `tar` (file smuggling).

**Düzeltme önerisi:** `npm audit fix` (kırıcı olmayanlar) + çalışma zamanını etkileyen `uuid`/`react-router`/`tar`'ı öncelikli güncelle. Dev-only paketleri ayrı değerlendir (saldırı yüzeyi düşük ama yine güncellenmeli).

### M-2 — `X-Forwarded-For` güveni: IP-bazlı limit/lockout atlatma + log zehirlenmesi
**Konum:** [main.ts:26](apps/api/src/main.ts:26) (`trustProxy: true`) + [auth.controller.ts:45-49](apps/api/src/modules/auth/auth.controller.ts:45) (`getIp` en **soldaki** XFF'i alır)
**OWASP:** A04/A09 · **CLAUDE.md:** #2
**Durum:** ✅ Teyitli

`trustProxy: true` tüm proxy zincirine güvenir ve `getIp()` `x-forwarded-for`'un **istemci-kontrollü en sol değerini** döndürür. Saldırgan her istekte XFF başlığını değiştirerek IP-bazlı throttle'ı (login/genel) ve audit log IP'sini manipüle edebilir.

**Hafifletici:** Hesap kilidi **hesap-bazlı** ([auth.service.ts:67-88](apps/api/src/modules/auth/auth.service.ts:67) — `lockedUntil`/`failedLoginAttempts` kullanıcı satırında), bu yüzden tek hesaba brute-force 5 denemede kilitlenir. Asıl risk: **çok sayıda hesaba dağıtık credential-stuffing** için per-IP limitin etkisizleşmesi ve **log/iz bütünlüğü**.

**Düzeltme önerisi:** `trustProxy`'yi bilinen proxy sayısına/CIDR'ına sabitle; IP'yi XFF'in en **sağından** (proxy'nin eklediği) veya `req.ip`'ten al. Render arkasında çalışırken güvenilir hop sayısını ayarla.

---

### M-3 — Dosya yükleme: magic-byte içerik doğrulaması hiç çağrılmıyor (istemci-beyanlı MIME'a güven)
**Konum:** [storage.service.ts:43](apps/api/src/shared/storage/storage.service.ts:43) (`validateActualFile` tanımlı ama çağrılmıyor) · kullanım: [files.service.ts:139](apps/api/src/modules/files/files.service.ts:139), [service-complaints.controller.ts:833](apps/api/src/modules/service/service-complaints.controller.ts:833)
**OWASP:** A04/A08 · **CLAUDE.md:** #3, #8
**Durum:** ✅ Teyitli

`validateActualFile(buf)` (gerçek baytlardan `file-type` ile MIME tespiti) yazılmış ama **hiçbir yerden çağrılmıyor**. Yükleme yollarının tamamı yalnız `validateUploadIntent` ile **istemcinin beyan ettiği** `mimeType`/`extension`/`sizeBytes`'ı allowlist'e karşı kontrol ediyor. Sunucunun baytları gördüğü proxy yolunda bile ([files.service.ts:127-161 `uploadContent`](apps/api/src/modules/files/files.service.ts:127)) içerik doğrulaması yapılmıyor.

**Exploit/etki:** Kullanıcı `mimeType:'image/png', extension:'png'` beyan edip içeriğe HTML/SVG (script gömülü) veya çalıştırılabilir koyabilir. Dosyalar S3'ten signed URL ile sunulduğundan inline-XSS riski sınırlı ama SVG/HTML + image MIME ile içerik-tipi karışıklığı ve zararlı içerik dağıtımı mümkün. CLAUDE.md #8 "istemcinin iddiasına asla güvenme" ihlali.

**Düzeltme önerisi:** Proxy yükleme yolunda (`uploadContent`) `await this.storage.validateActualFile(body)` çağır; presigned (doğrudan-S3) yolunda yüklemeyi sunucu üzerinden proxylemek veya yükleme-sonrası bir doğrulama (lambda/worker) eklemek gerekir.

## 🟡 DÜŞÜK / Sıkılaştırma

### L-1 — Access token `sessionStorage`'da (XSS ile sızdırılabilir)
[apiClient.ts:93,101](apps/web/src/lib/apiClient.ts:93). **Hafifletici:** refresh token httpOnly+secure cookie'de ([auth.controller.ts:27](apps/api/src/modules/auth/auth.controller.ts:27)) ve web'de gerçek XSS yüzeyi temiz (aşağıya bkz). Defense-in-depth: access token'ı yalnız bellekte tut. CLAUDE.md #4/#11.

### L-2 — `reset-password` endpoint'inde sıkı throttle yok
[auth.controller.ts:114](apps/api/src/modules/auth/auth.controller.ts:114). `forgot-password` throttle'lı ([L100](apps/api/src/modules/auth/auth.controller.ts:100)) ama `reset-password` yalnız global limitte. Token'lar 32-byte rastgele + hash'li olduğundan brute-force pratik değil; yine de `@Throttle(LOGIN_THROTTLE)` ekle. CLAUDE.md #2.

### L-3 — Repoya gömülü dev fallback kimlik bilgileri
`drizzle.config.ts:11` (`postgres://haksan:haksan_dev_pwd@localhost…`), [call-assistant.service.ts:73](apps/api/src/modules/call-assistant/call-assistant.service.ts:73) (`'dev-call-secret'`), `apps/api/.env.example` `DATABASE_URL`. Hepsi localhost/dev ve **prod'da env.ts superRefine ile zorunlu kılınmış** ([env.ts:90-119](apps/api/src/config/env.ts:90)) — gerçek `.env` ise git'te değil. Belirgin placeholder'lara çevir. CLAUDE.md #1.

### L-4 — Production'da `DATABASE_SSL` zorunlu değil
[env.ts:22](apps/api/src/config/env.ts:22) varsayılan `false`; superRefine prod guard'ında SSL şartı yok. Managed Postgres'te TLS'siz bağlantı MITM riski. Managed sağlayıcılarda prod için zorunlu kıl.

### L-5 — Cookie imzalama sırrı = `JWT_REFRESH_SECRET`
[main.ts:35](apps/api/src/main.ts:35). Sır yeniden kullanımı (least-privilege). Ayrı bir `COOKIE_SECRET` env'i tanımla.

### L-6 — argon2 parametreleri sabitlenmemiş
[auth.service.ts:388](apps/api/src/modules/auth/auth.service.ts:388) ve diğer `argon2.hash` çağrıları yalnız `type: argon2id` veriyor; m/t/p kütüphane varsayılanına bağlı. Açıkça sabitle (örn. `memoryCost`, `timeCost`, `parallelism`).

---

## ⚪ Doğrulandı — Güvenli / Elenen Aday Bulgular

Ön taramada işaretlenip **kodda teyit sonucu güvenli bulunan** veya yanlış-pozitif çıkan maddeler (tekrar işaretlenmesini önlemek için kayıt altında):

- **Exception filter sızıntısı — TEMİZ.** 500'ler genel mesaj döner, stack trace yok; yalnız uygulama-kontrollü `details` döner ([all-exceptions.filter.ts:24-34](apps/api/src/shared/filters/all-exceptions.filter.ts:24)).
- **SQL injection — TEMİZ.** Tüm `sql\`\`` interpolasyonları Drizzle ile parametreleniyor; string birleştirme yok. ORM tabanlı.
- **CORS — DOĞRU.** Açık allowlist + prod'da localhost yasağı ([env.ts:106](apps/api/src/config/env.ts:106)); wildcard yok.
- **Dosya yükleme — GÜÇLÜ.** Uzantı + magic-byte (`file-type`) + boyut doğrulaması ([storage.service.ts:27-45](apps/api/src/shared/storage/storage.service.ts:27)); object key randomize.
- **Çok-kiracılı / division izolasyonu — SAĞLAM.** İncelenen modüller (admin, finance, calendar, chat) tutarlı `tenantId`/`ownerUserId` filtreliyor; `X-Active-Division` başlığı tenant filtresiyle sınırlanıyor ([division-scope.ts](apps/api/src/shared/utils/division-scope.ts)). Mevcut `tenant-isolation.spec`/`division-isolation.spec` testleri güvenlik ağı.
- **Web XSS — TEMİZ.** Tek `dangerouslySetInnerHTML` ([chart.tsx:83](apps/web/src/app/components/ui/chart.tsx:83)) kod-tanımlı `ChartConfig`'ten CSS üretir, kullanıcı girdisi değil. Başka `innerHTML`/`eval`/`new Function` yok.
- **Refresh token — GÜVENLİ.** httpOnly+secure cookie, path `/api/v1/auth`, hash'li saklanıyor, rotasyonlu.
- **`calendar.controller.ts` — KORUMALI.** Tüm route'lar `@UseGuards(AuthGuard, PermissionsGuard)` + `@RequirePermissions`.
- **`chat.postSystemMessage` tenant kontrolü yok — LATENT.** İç yardımcı fonksiyon, HTTP'ye açık değil; çağıranlar `actor.tenantId` geçiyor. Sertleştirme için tenant assertion eklenebilir ([chat.service.ts:420](apps/api/src/modules/chat/chat.service.ts:420)).
- **Genel AuthGuard global değil — LATENT.** Guard controller başına opt-in ([app.module.ts:71](apps/api/src/app.module.ts:71)); taramada korumasız bırakılmış hassas endpoint **bulunmadı** (public olanlar — auth, fx, product-media, call-assistant webhook — kasıtlı ve ek kontrollü). Yine de `APP_GUARD` ile global default + `@Public()` istisnası daha savunmacı olur.

### Housekeeping (güvenlik değil)
`apps/api/src/modules/calendar/` altında Finder kaynaklı yinelenmiş dosyalar var (`calendar.controller 2.ts`, `calendar.service 2.ts`, `ics-parser 2.ts`, `calendar.module 2.ts`) — **git'te takipli değil, hiçbir yerden import edilmiyor**. Yerel kalıntı; silinmesi önerilir.

---

## CLAUDE.md 12 Kural Uyum Matrisi

| # | Kural | Durum | Açık / Not |
|---|-------|-------|-----------|
| 1 | Secret yönetimi | 🟢 Uyumlu (minör) | Gerçek `.env` gitignore'da; frontend'de yalnız `VITE_API_BASE_URL`. Repoda dev fallback creds → **L-3**. |
| 2 | Rate limiting | 🟡 Kısmi | Global 100/dk + login & forgot-password 5/dk var. **Açık:** `reset-password` (**L-2**) ve dosya-yükleme endpoint'lerinde özel limit yok (yalnız global). |
| 3 | Input validation | 🟢 Uyumlu (minör) | Zod + `ZodValidationPipe` + CI `audit:contracts`. Minör: bazı `@Param` id'leri string, format doğrulaması yok. |
| 4 | Auth & yetki | 🟢 Uyumlu | argon2id, JWT `min(32)`, hesap-bazlı lockout, httpOnly+secure refresh cookie. Rol kontrolü açığı **H-1 düzeltildi**. |
| 5 | SQL injection | 🟢 Uyumlu | Drizzle ORM; tüm `sql\`\`` parametreli, string birleştirme yok. |
| 6 | CORS | 🟢 Uyumlu | Açık allowlist + prod'da localhost yasağı; wildcard yok. |
| 7 | HTTP güvenlik header'ları | 🟢 Uyumlu (minör) | `@fastify/helmet` defaults: HSTS, `nosniff`, X-Frame-Options, `X-Powered-By` yok. Minör: CSP yalnız prod'da (dev'de kapalı), X-Frame `SAMEORIGIN` (kural `DENY` öneriyor). |
| 8 | Dosya yükleme | 🟠 **AÇIK** | Uzantı + boyut + UUID isim + tenant izolasyonu + signed-URL TTL var. **Açık:** magic-byte içerik doğrulaması (`validateActualFile`) hiç çağrılmıyor → istemci-beyanlı MIME'a güveniliyor → **M-3**. |
| 9 | Hata yönetimi | 🟢 Uyumlu | Stack trace sızmıyor, pino yapısal log, Sentry opsiyonel, 4xx/5xx ayrımı net. |
| 10 | Bağımlılık güvenliği | 🟡 Kısmi | Lock dosyaları sabit. **Açık:** `npm audit`'te kritik/yüksek var (çoğu dev-tooling) → **M-1**. |
| 11 | XSS önleme | 🟢 Uyumlu | Kullanıcı verisinde `dangerouslySetInnerHTML`/`eval`/`innerHTML` yok (tek kullanım kod-tanımlı CSS). |
| 12 | Deploy kontrol listesi | 🟢 Uyumlu (minör) | `.env` commitli değil, prod env guard'ları (superRefine), prod'da debug log kapalı, rate-limit + CORS aktif. **Açık:** prod'da `DATABASE_SSL` zorunlu değil → **L-4**. |
| 🤖 | AI/LLM | ⚪ N/A | Projede LLM/AI entegrasyonu yok (OpenAI/Anthropic/LangChain vb. bulunmadı). |

**Özet:** 7 kural tam uyumlu, 3 kural kısmi/açık (#2 rate-limit, #8 dosya yükleme, #10 bağımlılık), AI/LLM N/A. En kritik **yeni** açık: **#8 / M-3** (magic-byte doğrulaması devrede değil). #4 (yetki) bu oturumda kapatıldı.

## Araç Notları
- `ruflo security secrets/scan/cve`: secret taraması yalnız dev fallback connection string'lerini yakaladı (gerçek `.env` zaten gitignore'da); CVE listesi `npm audit` ile aynı 69 paketi düşük detayla doğruladı. Asıl uygulamaya-özel açıklar (H-1 gibi) yalnız manuel kod denetimiyle çıktı.
- Tam IDOR/yetki taraması her endpoint için yapılmadı; örneklenen modüller temsilî alındı. H-1 ışığında tüm `admin`/yazma endpoint'lerinin yetki hiyerarşisi gözden geçirilmeli.
