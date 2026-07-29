import { useCallback } from "react";
import { useAuth } from "../../../../lib/auth";

export const ALL_DIVISIONS = "all";

type DivisionLike = { id: string; code?: string | null; name?: string | null };

function normalizeDivisionText(value?: string | null) {
  return String(value ?? "").trim().toLocaleUpperCase("tr-TR");
}

export function isCncDivision(divisions: DivisionLike[], divisionId?: string) {
  if (!divisionId || divisionId === ALL_DIVISIONS) return false;
  const division = divisions.find((item) => item.id === divisionId);
  return normalizeDivisionText(division?.code) === "CNC" || normalizeDivisionText(division?.name) === "CNC";
}

/** Aksan/harf farklarını silerek karşılaştırma metni üretir (ÜNİVERSAL → UNIVERSAL). */
function asciiDivisionText(value?: string | null) {
  return normalizeDivisionText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "I");
}

/**
 * Seçili bölümü şablon katalogundaki ürün grubu koduna eşler.
 * Teknik Bilgi kartındaki bölüm bazlı tip fallback'leri ve Alan Ayarları
 * "önerilen kurulum" bu eşlemeyi kullanır.
 */
export function divisionCatalogGroupCode(
  divisions: DivisionLike[],
  divisionId?: string,
): "CNC" | "UNIVERSAL" | "SAC_ISLEME" | undefined {
  if (!divisionId || divisionId === ALL_DIVISIONS) return undefined;
  const division = divisions.find((item) => item.id === divisionId);
  const text = asciiDivisionText(division?.code) || asciiDivisionText(division?.name);
  if (!text) return undefined;
  if (text.includes("CNC")) return "CNC";
  if (text.includes("UNIVERSAL")) return "UNIVERSAL";
  if (text.includes("SAC")) return "SAC_ISLEME";
  return undefined;
}

/**
 * Ayar ekranlarının bölüm filtresi = uygulama genelindeki aktif bölüm
 * (üst bardaki "Bölüm seç"). Ayrı bir ayar-bölümü saklanmaz; ayarlardan
 * bölüm değiştirmek üst barı da değiştirir, böylece "CNC'deyim ama Tümü'ne
 * ekledi" tutarsızlığı oluşmaz.
 */
export function usePersistedSettingsDivision() {
  const { activeDivision, setActiveDivision } = useAuth();

  const setDivisionId = useCallback(
    (nextDivisionId: string) => {
      setActiveDivision(nextDivisionId || ALL_DIVISIONS);
    },
    [setActiveDivision],
  );

  return [activeDivision || ALL_DIVISIONS, setDivisionId] as const;
}
