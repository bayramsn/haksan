// Belge anlık görüntüsündeki imza bloğunu yazdırma katmanının beklediği şekle
// çevirir. Ad, ünvan ve görsel canlı imza kaydından değil `document_snapshot`
// içindeki kopyadan gelir: imza sonradan değişse veya silinse bile belge kendi
// bastığı imzayı korur.

import { resolveMediaUrl } from "../../../lib/apiClient";
import type { PrintSignature } from "./templates";

/**
 * Görselin adresi API tabanına göre çözülür ve auth GEREKTİRMEYEN
 * `/signatures/media/:fileId` ucuna gider: yazdırma penceresi ayrı bir
 * pencerede açıldığı için oturum çerezi taşımaz, korumalı bir URL sessizce
 * boş görsel olarak basılırdı.
 */
export function printSignatureFromSnapshot(snapshot: unknown): PrintSignature | undefined {
  if (!snapshot || typeof snapshot !== "object") return undefined;
  const record = snapshot as Record<string, unknown>;
  const ad = typeof record.name === "string" ? record.name.trim() : "";
  if (!ad) return undefined;
  const unvan = typeof record.title === "string" ? record.title.trim() : "";
  const imageUrl = typeof record.imageUrl === "string" ? record.imageUrl : "";
  return {
    ad,
    ...(unvan ? { unvan } : {}),
    ...(imageUrl ? { gorselUrl: resolveMediaUrl(imageUrl) } : {}),
  };
}

/** `document_snapshot` gövdesinden imzayı okur (alan adı: `signature`). */
export function printSignatureFromDocumentSnapshot(
  documentSnapshot: unknown,
): PrintSignature | undefined {
  if (!documentSnapshot || typeof documentSnapshot !== "object") return undefined;
  return printSignatureFromSnapshot((documentSnapshot as Record<string, unknown>).signature);
}
