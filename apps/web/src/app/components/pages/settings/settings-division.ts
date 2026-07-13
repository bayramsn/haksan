import { useCallback, useEffect, useState } from "react";

export const ALL_DIVISIONS = "all";

const SETTINGS_DIVISION_STORAGE_KEY = "haksan:settings:product-division";
const SETTINGS_DIVISION_EVENT = "haksan:settings-product-division";

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

function readStoredDivision() {
  if (typeof window === "undefined") return ALL_DIVISIONS;
  return localStorage.getItem(SETTINGS_DIVISION_STORAGE_KEY) || ALL_DIVISIONS;
}

export function usePersistedSettingsDivision() {
  const [divisionId, setDivisionIdState] = useState(readStoredDivision);

  const setDivisionId = useCallback((nextDivisionId: string) => {
    const value = nextDivisionId || ALL_DIVISIONS;
    setDivisionIdState(value);
    localStorage.setItem(SETTINGS_DIVISION_STORAGE_KEY, value);
    window.dispatchEvent(new CustomEvent(SETTINGS_DIVISION_EVENT, { detail: value }));
  }, []);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === SETTINGS_DIVISION_STORAGE_KEY) setDivisionIdState(event.newValue || ALL_DIVISIONS);
    };
    const handleLocalChange = (event: Event) => {
      setDivisionIdState((event as CustomEvent<string>).detail || ALL_DIVISIONS);
    };
    window.addEventListener("storage", handleStorage);
    window.addEventListener(SETTINGS_DIVISION_EVENT, handleLocalChange);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(SETTINGS_DIVISION_EVENT, handleLocalChange);
    };
  }, []);

  return [divisionId, setDivisionId] as const;
}
