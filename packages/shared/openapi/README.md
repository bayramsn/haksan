# API Sözleşme Hattı (zod → OpenAPI → Swift + Kotlin)

Native (iOS/Android) istemcilerin backend ile **sürüklenmemesi** için tek doğruluk kaynağı.
Mevcut `@haksan/shared` zod şemalarından OpenAPI üretir, oradan Swift ve Kotlin model/istemci
kodu çıkarır. Böylece her iki native app aynı sözleşmeyi paylaşır (web + api gibi).

## Komutlar

```bash
# Yalnız sözleşme: zod → openapi.json
npm --workspace @haksan/shared run openapi

# Tüm hat: openapi.json + Kotlin + Swift istemcileri
npm --workspace @haksan/shared run codegen
```

## Çıktılar

| Dosya | Açıklama | Commit? |
|---|---|---|
| `openapi.json` | OpenAPI 3.0 sözleşmesi (164 şema). PR'larda gözden geçirilir. | ✅ evet |
| `generated/kotlin` | Retrofit2 + kotlinx.serialization + coroutines istemcisi (`com.haksan.api`). | ❌ build artifact |
| `generated/swift` | URLSession + async/await SPM paketi (`HaksanApi`). | ❌ build artifact |

## Nasıl çalışır

- `generate.ts`: `src/index.ts`'ten dışa aktarılan TÜM zod şemalarını otomatik `components.schemas`'a
  kaydeder. `paths` el yazımıdır ve gerçek NestJS route'larına göredir (şu an çekirdek dilim:
  `auth` + `opportunities`; diğer modüller aynı `registry.registerPath(...)` deseniyle eklenir).
- `codegen.sh`: openapi.json üretir, sonra OpenAPI Generator jar'ını **doğrudan java ile** çağırır
  (repo kökü boşluk içerdiğinden — "haksan local" — npx sarmalı yol bozar).

## Yeni modül/uç eklemek

1. Gerekiyorsa request/response şemasını `@haksan/shared`'a ekle (zod).
2. `generate.ts` içinde ilgili `registry.registerPath({ ... operationId, request, responses })` bloğunu ekle.
3. `npm --workspace @haksan/shared run codegen` çalıştır.

> Not: `z.never()` gibi OpenAPI'ye çevrilemeyen şemalar otomatik atlanır ve uyarı basılır
> (örn. `purchaseOrderItemCreateSchema`). Bunlar için ileride ayrık response şeması tanımlanmalı.
