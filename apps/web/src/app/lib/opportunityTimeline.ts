/**
 * Fırsat zaman çizelgesinin hangi aktiviteleri göstereceğini belirleyen saf
 * kurallar. Bileşenden ayrı tutuluyor ki testler React/Radix grafiğini import
 * etmeden koşabilsin.
 */

type TimelineActivityInput = {
  type: string;
  typeCode?: string;
  origin?: "manual" | "system";
  note?: string;
  result?: string;
};

/** Kullanıcının elle yazdığı yorum/not kaydı: detay şartı aranmaz. */
export const isManualTimelineComment = (activity: Pick<TimelineActivityInput, "type" | "typeCode" | "origin">) =>
  activity.origin === "manual" && (activity.typeCode === "note" || activity.type === "Not" || activity.type === "Yorum");

/**
 * Fırsat çizelgesinde gösterilecek müşteri teması.
 *
 * `origin === "manual"` sistem olaylarını zaten eliyor, yazılı detay şartı da
 * boş kayıtları. Buna ek bir tip beyaz listesi tutmak toplantı, gelen arama ve
 * e-posta gibi gerçek temasları düşürüyordu: kullanıcı kaydı giriyor, kayıt
 * çizelgede hiç görünmüyordu.
 */
export const isOpportunityTimelineActivity = (activity: TimelineActivityInput) => {
  if (isManualTimelineComment(activity)) return true;
  if (activity.origin !== "manual") return false;
  return Boolean(activity.note?.trim() || activity.result?.trim());
};
