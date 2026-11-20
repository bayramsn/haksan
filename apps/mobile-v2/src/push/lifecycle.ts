export type PushOwner = {
  apiOrigin: string;
  tenantId: string;
  userId: string;
};

export type PushRegistration = PushOwner & {
  token: string;
};

export type PendingPushUnregistration = PushRegistration & {
  id: string;
  attempts: number;
  createdAt: number;
  nextAttemptAt: number;
};

const MAX_ID_LENGTH = 160;
const MAX_ORIGIN_LENGTH = 512;
const MAX_TOKEN_LENGTH = 4_096;
const MAX_RETRY_DELAY_MS = 6 * 60 * 60 * 1_000;

function isBoundedString(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max;
}

function isScopedId(value: unknown): value is string {
  return isBoundedString(value, MAX_ID_LENGTH) && /^[a-zA-Z0-9_-]+$/.test(value);
}

function isApiScope(value: unknown): value is string {
  if (!isBoundedString(value, MAX_ORIGIN_LENGTH)) return false;
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'https:' || url.protocol === 'http:') &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

function decodeBase64Url(value: string): string | null {
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return globalThis.atob(padded);
  } catch {
    return null;
  }
}

/**
 * JWT imzası burada doğrulanmaz; bu bilgi yalnızca cihazdaki kayıtları doğru
 * kullanıcı/tenant kovasına ayırmak için kullanılır. Sunucu her istekte imzayı
 * ve sahipliği yeniden doğrular.
 */
export function ownerFromAccessToken(accessToken: string | null, apiOrigin: string): PushOwner | null {
  if (!accessToken || !isApiScope(apiOrigin)) return null;
  const encodedPayload = accessToken.split('.')[1];
  if (!encodedPayload) return null;
  const decoded = decodeBase64Url(encodedPayload);
  if (!decoded) return null;
  try {
    const payload = JSON.parse(decoded) as { sub?: unknown; tid?: unknown };
    if (!isScopedId(payload.sub) || !isScopedId(payload.tid)) return null;
    return { apiOrigin, tenantId: payload.tid, userId: payload.sub };
  } catch {
    return null;
  }
}

export function isPushOwner(value: unknown): value is PushOwner {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<PushOwner>;
  return (
    isApiScope(candidate.apiOrigin) && isScopedId(candidate.tenantId) && isScopedId(candidate.userId)
  );
}

export function isPushRegistration(value: unknown): value is PushRegistration {
  if (!isPushOwner(value)) return false;
  return isBoundedString((value as Partial<PushRegistration>).token, MAX_TOKEN_LENGTH);
}

export function isPendingPushUnregistration(value: unknown): value is PendingPushUnregistration {
  if (!isPushRegistration(value)) return false;
  const candidate = value as Partial<PendingPushUnregistration>;
  return (
    isBoundedString(candidate.id, MAX_ID_LENGTH) &&
    Number.isInteger(candidate.attempts) &&
    (candidate.attempts ?? -1) >= 0 &&
    typeof candidate.createdAt === 'number' &&
    Number.isFinite(candidate.createdAt) &&
    candidate.createdAt >= 0 &&
    typeof candidate.nextAttemptAt === 'number' &&
    Number.isFinite(candidate.nextAttemptAt) &&
    candidate.nextAttemptAt >= candidate.createdAt
  );
}

export function samePushOwner(left: PushOwner, right: PushOwner): boolean {
  return (
    left.apiOrigin === right.apiOrigin && left.tenantId === right.tenantId && left.userId === right.userId
  );
}

export function samePushRegistration(left: PushRegistration, right: PushRegistration): boolean {
  return samePushOwner(left, right) && left.token === right.token;
}

export function retryDelayMs(attempts: number): number {
  const normalized = Number.isFinite(attempts) ? Math.floor(attempts) : 1;
  const safeAttempts = Math.max(1, Math.min(32, normalized));
  return Math.min(MAX_RETRY_DELAY_MS, 30_000 * 2 ** (safeAttempts - 1));
}

export function createPendingUnregistration(
  registration: PushRegistration,
  id: string,
  now: number
): PendingPushUnregistration {
  return { ...registration, id, attempts: 0, createdAt: now, nextAttemptAt: now };
}

export function markPendingAttemptFailed(
  pending: PendingPushUnregistration,
  now: number
): PendingPushUnregistration {
  const attempts = pending.attempts + 1;
  return { ...pending, attempts, nextAttemptAt: now + retryDelayMs(attempts) };
}

export function canRetryPending(
  pending: PendingPushUnregistration,
  owner: PushOwner,
  now: number
): boolean {
  return samePushOwner(pending, owner) && pending.nextAttemptAt <= now;
}
