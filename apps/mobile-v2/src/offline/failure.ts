/**
 * Kuyruktaki bir işlem hata alınca ne olacağının tek karar noktası.
 * Saf tutuluyor ki MMKV/ağ olmadan test edilebilsin (failure.test.mjs).
 */
export type FailureAction = 'offline' | 'retry' | 'conflict' | 'drop';

export type FailureInput = {
  /** true ise ağ yok: kuyruk olduğu gibi beklemeli. */
  offline: boolean;
  /** HTTP durum kodu; ağ hatasında undefined. */
  status?: number;
  retryCount: number;
  maxRetries: number;
};

export function classifyFailure({ offline, status, retryCount, maxRetries }: FailureInput): FailureAction {
  if (offline) return 'offline';
  // 409 kullanıcı çözümü gerektirir; aynı isteği körlemesine tekrarlamak
  // idempotency-key/payload uyuşmazlığını veya gerçek veri çakışmasını çözmez.
  if (status === 409) return 'conflict';
  const permanent = status !== undefined && status < 500;
  if (permanent) return 'drop';
  return retryCount + 1 >= maxRetries ? 'drop' : 'retry';
}
