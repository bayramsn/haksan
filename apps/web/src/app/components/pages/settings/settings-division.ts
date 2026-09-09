import { useCallback, useEffect, useState } from "react";
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

export const settingsDivisionKey = (tenantId?: string, userId?: string) =>
  `haksan:settings-division:${JSON.stringify([tenantId ?? '', userId ?? ''])}`;

export function resolveSettingsDivision(divisions: DivisionLike[], stored?: string | null, initial?: string | null) {
  const allowed = divisions.filter((division) => divisionCatalogGroupCode(divisions, division.id));
  return allowed.find((division) => division.id === stored)?.id
    ?? allowed.find((division) => division.id === initial)?.id
    ?? allowed[0]?.id ?? '';
}

/** Settings has its own scope; changing it never changes the application's global filter. */
export function usePersistedSettingsDivision() {
  const { user, activeDivision } = useAuth();
  const divisions = user?.divisions ?? [];
  const key = settingsDivisionKey(user?.tenantId, user?.id);
  const allowedKey = divisions.map((division) => `${division.id}:${division.code}`).join('|');
  const read = () => {
    try { return resolveSettingsDivision(divisions, localStorage.getItem(key), activeDivision); }
    catch { return resolveSettingsDivision(divisions, null, activeDivision); }
  };
  const [divisionId, setLocalDivisionId] = useState(read);
  useEffect(() => { setLocalDivisionId(read()); }, [key, allowedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const setDivisionId = useCallback(
    (nextDivisionId: string) => {
      const next = resolveSettingsDivision(divisions, nextDivisionId);
      setLocalDivisionId(next);
      try { localStorage.setItem(key, next); } catch { /* In-memory selection still works. */ }
    },
    [key, allowedKey], // eslint-disable-line react-hooks/exhaustive-deps
  );

  return [divisionId, setDivisionId] as const;
}
