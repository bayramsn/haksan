/**
 * Fırsat denetim günlüğünün görüntüleme kuralları.
 *
 * Bileşenden ayrı tutuluyor: `auditValue` içindeki sır maskeleme, CLAUDE.md
 * §1 ve §9'a bağlı bir kontrol ve regex'ten bir kelime düşerse UI'a sır sızar.
 * Saf modül olduğu için React grafiğini import etmeden test edilebiliyor.
 */

export const AUDIT_FIELD_LABELS: Record<string, string> = {
  qualificationStage: "Nitelik aşaması",
  leadFollowUpStatus: "Lead durumu",
  contactAttemptCount: "Temas denemesi",
  nextAction: "Sonraki aksiyon",
  nextActionAt: "Aksiyon zamanı",
  ownerUserId: "Sorumlu",
  estimatedValue: "Tahmini tutar",
  probability: "Olasılık",
  expectedCloseDate: "Kapanış tarihi",
  fitScore: "Uyum skoru",
  engagementScore: "Etkileşim skoru",
  priorityScore: "Öncelik skoru",
  overrideReason: "Dönüşüm gerekçesi",
};

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  "opportunity.created": "Kayıt oluşturuldu",
  "opportunity.converted": "Lead fırsata dönüştürüldü",
  "opportunity.owner_changed": "Sorumlu değiştirildi",
  "lead.contact_recorded": "Temas sonucu kaydedildi",
  "opportunity.approvals.invalidated": "Onaylar yeniden değerlendirmeye alındı",
};

/** Denetim günlüğünde tek bir alan değerini gösterilebilir metne çevirir. */
export const auditValue = (key: string, value: unknown, userNames?: ReadonlyMap<string, string>) => {
  // Maskeleme her şeyden önce gelmeli: alan adı hassassa değere hiç bakılmaz.
  if (/password|token|secret|hash/i.test(key)) return "••••••";
  if (value === null || value === undefined || value === "") return "Boş";
  if (key === "ownerUserId" && typeof value === "string") return userNames?.get(value) ?? value;
  if (typeof value === "boolean") return value ? "Evet" : "Hayır";
  if (typeof value === "object") return Array.isArray(value) ? value.join(", ") : "Yapılandırılmış veri";
  return String(value);
};

export const auditSide = (label: string, values: unknown, userNames?: ReadonlyMap<string, string>) => {
  if (!values || typeof values !== "object" || Array.isArray(values)) return "";
  const entries = Object.entries(values as Record<string, unknown>)
    .map(([key, value]) => `${AUDIT_FIELD_LABELS[key] ?? key}: ${auditValue(key, value, userNames)}`)
    .join(" | ");
  return entries ? `${label} — ${entries}` : "";
};

export const auditDetail = (oldValues: unknown, newValues: unknown, userNames?: ReadonlyMap<string, string>) => {
  const pairs = [auditSide("Önce", oldValues, userNames), auditSide("Sonra", newValues, userNames)]
    .filter(Boolean)
    .join(" · ");
  return pairs.length > 500 ? `${pairs.slice(0, 497)}…` : pairs;
};
