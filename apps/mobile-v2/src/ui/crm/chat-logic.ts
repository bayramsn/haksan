/** Web ChatPage/GroupDialogs ile aynı sohbet kuralları; saf mantık. */

export const CHAT_EMOJIS = [
  '😀', '😁', '😂', '😍', '🥳', '😎', '🤝', '👍', '👏',
  '🙏', '🎉', '✅', '❤️', '🔥', '💯', '📌', '🚀', '💬',
] as const;

type MemberLike = { userId: string; role?: string; lastReadAt?: string | null; email?: string; fullName?: string };
type DetailLike = { type: 'dm' | 'group'; members: MemberLike[]; myRole?: string; onlyAdminsCanPost?: boolean };

/**
 * Başlık alt satırı (web ChatPage): grupta gerçek üye sayısı, birebirde karşı
 * tarafın e-postası. Sunucu presence verisi sağlamadığı için "çevrimiçi"
 * bilgisi üretilmez; veri yoksa null.
 */
export function memberSubtitle(detail: DetailLike | null | undefined, myId?: string): string | null {
  if (!detail) return null;
  if (detail.type === 'dm') return detail.members.find((member) => member.userId !== myId)?.email || null;
  const count = detail.members.length;
  if (count === 0) return null;
  return `${count} üye${detail.onlyAdminsCanPost ? ' · yalnız yöneticiler yazabilir' : ''}`;
}

/** Web convDisplay: grupta başlık, birebirde karşı tarafın adı. */
export function conversationDisplayName(
  detail: { type: 'dm' | 'group'; title: string | null; members: MemberLike[] } | null | undefined,
  myId: string | undefined,
  fallback = 'Sohbet',
): string {
  if (!detail) return fallback;
  if (detail.type === 'group') return detail.title || fallback;
  const other = detail.members.find((member) => member.userId !== myId);
  return other?.fullName || other?.email || detail.title || fallback;
}

/** Web: yalnız birebir sohbette, karşı tarafın lastReadAt'i mesajı kapsıyorsa ✓✓. */
export function isSeenByOther(
  message: { senderId: string; createdAt: string },
  detail: DetailLike | null | undefined,
  myId: string | undefined,
): boolean {
  if (!detail || detail.type !== 'dm' || !myId || message.senderId !== myId) return false;
  const other = detail.members.find((member) => member.userId !== myId);
  if (!other?.lastReadAt) return false;
  return new Date(other.lastReadAt).getTime() >= new Date(message.createdAt).getTime();
}

export function canManageGroup(detail: DetailLike | null | undefined, isSuperAdmin: boolean): boolean {
  if (!detail || detail.type !== 'group') return false;
  return isSuperAdmin || detail.myRole === 'admin';
}

/** Web listesi: "Okunmamış" (unreadCount>0) ve "Tüm" grupları. */
export function groupConversations<T extends { unreadCount: number }>(rows: T[]): { unread: T[]; rest: T[] } {
  const unread: T[] = [];
  const rest: T[] = [];
  for (const row of rows) (row.unreadCount > 0 ? unread : rest).push(row);
  return { unread, rest };
}

export type NormalizedAttachment = {
  fileId: string;
  filename: string;
  mimeType: string | null;
  isImage: boolean;
  url: string | null;
  sizeBytes: number | null;
};

/**
 * Sunucu `{fileId, url, filename, mimeType, sizeBytes, isImage}` döner; eski
 * istemci tipi `{id, fileName}` varsayıyordu. İkisini de güvenle okur.
 */
export function normalizeAttachment(raw: unknown): NormalizedAttachment | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const fileId = typeof value.fileId === 'string' ? value.fileId : typeof value.id === 'string' ? value.id : null;
  if (!fileId) return null;
  const filename =
    typeof value.filename === 'string' ? value.filename : typeof value.fileName === 'string' ? value.fileName : 'Dosya';
  const mimeType = typeof value.mimeType === 'string' ? value.mimeType : null;
  const isImage = value.isImage === true || Boolean(mimeType?.startsWith('image/'));
  return {
    fileId,
    filename,
    mimeType,
    isImage,
    url: typeof value.url === 'string' ? value.url : null,
    sizeBytes: typeof value.sizeBytes === 'number' ? value.sizeBytes : null,
  };
}

export type RefCard = { type: string; id: string; title: string; subtitle: string | null; missing?: boolean };

export function parseRefCard(raw: unknown): RefCard | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.type !== 'string' || typeof value.id !== 'string') return null;
  return {
    type: value.type,
    id: value.id,
    title: typeof value.title === 'string' ? value.title : 'Kayıt',
    subtitle: typeof value.subtitle === 'string' ? value.subtitle : null,
    missing: value.missing === true,
  };
}

export const REF_TYPE_LABELS: Record<string, string> = {
  company: 'Firma',
  quote: 'Teklif',
  opportunity: 'Satış Kartı',
  service_ticket: 'Servis',
};

/** refCard → mobil rota; bilinmeyen türde null. */
export function refCardRoute(card: RefCard): string | null {
  if (card.missing) return null;
  switch (card.type) {
    case 'company':
      return `/(tabs)/modules/companies/${card.id}`;
    case 'quote':
      return `/(tabs)/modules/quotes/${card.id}`;
    case 'opportunity':
      return `/(tabs)/modules/opportunities/${card.id}`;
    case 'service_ticket':
      return `/(tabs)/modules/service-tickets/${card.id}`;
    default:
      return null;
  }
}

/** Mesaj içi arama: sunucu en az 2 karakter ister. */
export function canSearchMessages(term: string): boolean {
  return term.trim().length >= 2;
}
