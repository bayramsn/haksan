#!/usr/bin/env bash
#
# Sözleşme codegen hattı — zod → openapi.json
#
# Mobil istemci: @haksan/shared (zod şemaları) + apps/mobile/src/api/services.ts
# Web istemci: apps/web/src/lib/services.ts
#
# Kullanım:  bash packages/shared/openapi/codegen.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SHARED="$(cd "$HERE/.." && pwd)"
ROOT="$(cd "$SHARED/../.." && pwd)"
SPEC="$HERE/openapi.json"
OUT="$HERE/generated"

echo "▶ openapi.json üretiliyor…"
( cd "$SHARED" && npm run --silent openapi )

JAR="$(ls "$ROOT"/node_modules/@openapitools/openapi-generator-cli/versions/*.jar \
        "$SHARED"/node_modules/@openapitools/openapi-generator-cli/versions/*.jar 2>/dev/null | sort -V | tail -1 || true)"
if [ -z "${JAR:-}" ]; then
  echo "✗ openapi-generator jar bulunamadı. Önce: npm i -w @haksan/shared -D @openapitools/openapi-generator-cli" >&2
  exit 1
fi
echo "▶ generator: $JAR"

echo "▶ Kotlin istemcisi üretiliyor (opsiyonel arşiv)…"
rm -rf "$OUT/kotlin"
java -jar "$JAR" generate \
  -i "$SPEC" \
  -g kotlin \
  --library jvm-retrofit2 \
  --additional-properties=serializationLibrary=kotlinx_serialization,useCoroutines=true,packageName=com.haksan.api,artifactId=haksan-api-client \
  -o "$OUT/kotlin" >/dev/null

echo "▶ Swift istemcisi üretiliyor (opsiyonel arşiv)…"
rm -rf "$OUT/swift"
java -jar "$JAR" generate \
  -i "$SPEC" \
  -g swift5 \
  --library urlsession \
  --additional-properties=responseAs=AsyncAwait,projectName=HaksanApi,useSPMFileStructure=true \
  -o "$OUT/swift" >/dev/null

echo "✓ Bitti."
echo "  openapi.json : $SPEC"
echo "  Mobil/Web    : @haksan/shared + apps/mobile|web API servisleri"
echo "  Kotlin arşiv : $OUT/kotlin/src/main/kotlin/com/haksan/api"
echo "  Swift arşiv  : $OUT/swift/Sources/HaksanApi"
