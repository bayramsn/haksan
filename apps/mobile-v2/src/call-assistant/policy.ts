export const PENDING_TTL = 30 * 60_000;
export const CALL_RETURN_TTL = 2 * 60 * 60_000;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const ACTIONS = ['after_call', 'post_call', 'open_today', 'find_opportunities', 'new_opportunity', 'add_note', 'create_task', 'new_service_ticket'] as const;
export type CommandAction = typeof ACTIONS[number];
export type PendingAction = { id: string; action: CommandAction; createdAt: number; scope?: string; text?: string; command?: string; query?: string; dueAt?: string; phoneNumber?: string; direction?: 'inbound' | 'outbound'; eventType?: 'completed' | 'missed' | 'unknown' };
export function validPending(value: unknown, scope: string, now = Date.now()): value is PendingAction {
  if (!value || typeof value !== 'object') return false;
  const p = value as PendingAction;
  return typeof p.id === 'string' && UUID.test(p.id) && ACTIONS.includes(p.action) && Number.isFinite(p.createdAt)
    && p.createdAt <= now + 60_000 && now - p.createdAt <= PENDING_TTL
    && (p.scope === scope) && (p.text === undefined || (typeof p.text === 'string' && p.text.length <= 2000))
    && (p.command === undefined || (typeof p.command === 'string' && p.command.length <= 2000))
    && (p.query === undefined || (typeof p.query === 'string' && p.query.length <= 300))
    && (p.dueAt === undefined || (typeof p.dueAt === 'string' && p.dueAt.length <= 100 && /^\d{4}-\d\d-\d\dT/.test(p.dueAt) && Number.isFinite(Date.parse(p.dueAt))))
    && (p.phoneNumber === undefined || (typeof p.phoneNumber === 'string' && /^\+?[1-9]\d{6,14}$/.test(p.phoneNumber)))
    && (p.direction === undefined || ['inbound', 'outbound'].includes(p.direction))
    && (p.eventType === undefined || ['completed', 'missed', 'unknown'].includes(p.eventType));
}
export type ParsedCommand = { action: CommandAction | null; query: string; text?: string; dueAt?: string; needsDate?: boolean; error?: string };

/** System input remains a search hint and a draft preview, never a CRM authority. */
export function previewPendingAction(pending: PendingAction, now = new Date()): ParsedCommand {
  const mapped = pending.action === 'post_call' ? 'after_call' : pending.action;
  const command = pending.command !== undefined ? parseCommand(pending.command, now) : null;
  // Preserve old Siri note handoffs, but don't treat arbitrary note prose as a customer name.
  const legacy = pending.text ? parseCommand(pending.text, now) : null;
  const parsed = command ?? (legacy?.action === mapped && !legacy.error ? legacy : null);
  const action = command ? command.action : mapped;
  const explicitDate = pending.dueAt && Number.isFinite(Date.parse(pending.dueAt)) && Date.parse(pending.dueAt) > now.getTime() ? pending.dueAt : undefined;
  const dueAt = action === 'create_task' ? (pending.dueAt !== undefined ? explicitDate : parsed?.dueAt) : undefined;
  return {
    action, query: pending.query?.trim() || parsed?.query || '',
    text: action === 'add_note' ? (pending.text ?? parsed?.text) : undefined,
    dueAt, needsDate: action === 'create_task' && !dueAt,
    ...(command?.error ? { error: command.error } : {}),
  };
}
const words = (text: string) => text.toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i');
/** A small allowlist, never an LLM executor: the user reviews every proposed action. */
export function parseCommand(input: string, now = new Date()): ParsedCommand {
  const raw = input.trim().slice(0, 2000), clean = words(raw);
  if (/\b(sil|onayla|kesinlestir|odeme yap|para gonder|fiyat degistir)\b/.test(clean)) return { action: null, query: '', error: 'Bu işlem sesli yardımcıdan yürütülmez. İlgili kaydı uygulamada açın.' };
  if (/bugunku|bugun.*isler|gunluk/.test(clean)) return { action: 'open_today', query: '' };
  let action: CommandAction | null = /servis/.test(clean) ? 'new_service_ticket'
    : /gorev|takip/.test(clean) ? 'create_task'
    : /not/.test(clean) ? 'add_note'
    : /yeni firsat|firsat.*hazirla|firsat.*olustur/.test(clean) ? 'new_opportunity'
    : /firsat/.test(clean) ? 'find_opportunities'
    : /gorusme|arama sonrasi/.test(clean) ? 'after_call' : null;
  if (!action) return { action, query: raw, error: 'Komut anlaşılamadı. Yapılacak işlemi aşağıdan seçebilirsiniz.' };
  // Search hints only: selecting a CRM record remains an explicit user step.
  const withoutPrefix = raw.replace(/^(?:Siri[, ]+)?Haksan(?:['’]da|da)?\s+/i, '').replace(/^Siri[, ]+/i, '');
  const normalized = words(withoutPrefix);
  const split = normalized.search(/\s+(?:icin|icindeki|firsatlarini|firsatlari|ile|gorusme|yeni|takip|servis|not|yarin|bugun|saat)\b/);
  const query = (split < 0 ? withoutPrefix : withoutPrefix.slice(0, split)).replace(/['’](?:e|a|ye|ya)$/i, '').trim();
  let dueAt: string | undefined;
  if (action === 'create_task') dueAt = commandDate(clean, now);

  return { action, query: /^(?:gorusme|arama|yarin|bugun|bu musteri(?:ye|nin|yle)?|bana)\b/.test(words(query)) ? '' : query, text: action === 'add_note' ? raw : undefined, dueAt, needsDate: action === 'create_task' && !dueAt };
}

/** Only an explicit today/tomorrow and unambiguous clock become a date. */
function commandDate(clean: string, now: Date): string | undefined {
  if (!/\b(?:yarin|bugun)\b/.test(clean)) return undefined;
  const tail = clean.match(/\bsaat\s+(.+)/)?.[1];
  if (!tail) return undefined;
  let hour: number, minute = 0;
  const numeric = tail.match(/^(\d{1,2})(?:[:.]([0-5]\d))?(?:['’]?(?:te|ta|de|da))?(?=\s|$)/);
  if (numeric) { hour = Number(numeric[1]); minute = Number(numeric[2] ?? 0); }
  else {
    const hours: Record<string, number> = { bir: 1, iki: 2, uc: 3, dort: 4, bes: 5, alti: 6, yedi: 7, sekiz: 8, dokuz: 9, on: 10, 'on bir': 11, 'on iki': 12 };
    const spoken = tail.match(/^(on iki|on bir|sekiz|dokuz|dort|yedi|alti|bes|iki|bir|uc|on)(?:['’]?(?:te|ta|de|da))?(?=\s|$)/);
    if (!spoken) return undefined;
    hour = hours[spoken[1]!]!;
    const rest = tail.slice(spoken[0].length).trim();
    if (/^bucuk(?:ta|te)?\b/.test(rest)) minute = 30;
    else if (/^(?:ceyrek|\d|yirmi|otuz|kirk|elli|gece|kala)\b/.test(rest)) return undefined;
  }
  if (hour > 23 || !Number.isFinite(now.getTime())) return undefined;
  if (/\b(?:aksam|ogle(?:den)? sonra|gece)\b/.test(clean)) { if (hour > 12 || hour === 12) return undefined; hour += 12; }
  else if (/\bsabah\b/.test(clean) && hour === 12) hour = 0;
  const date = new Date(now); date.setHours(hour, minute, 0, 0);
  if (/\byarin\b/.test(clean)) date.setDate(date.getDate() + 1);
  // Ask again for a past time or a clock which local DST rules normalized.
  if (date <= now || date.getHours() !== hour || date.getMinutes() !== minute) return undefined;
  return date.toISOString();
}

/** "0532 … / 0212 …", "dahili 12" gibi kayıtlarda aranabilir ilk numara. */
export function dialablePhone(phone: string): string | null {
  const first = phone.split(/[/,;]|dahili|ext\.?|\bx\b/i)[0] ?? '';
  const cleaned = first.replace(/[^\d+]/g, '');
  return cleaned.replace(/\D/g, '').length >= 3 ? cleaned : null;
}
