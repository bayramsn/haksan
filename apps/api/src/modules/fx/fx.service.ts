import { Injectable } from '@nestjs/common';

export type FxRates = { USD: number; EUR: number; TRY: number };
export type FxRateSource = 'live' | 'period_average' | 'last_known' | 'fallback';

export interface FxSnapshot {
  base: 'USD';
  date: string;
  rates: FxRates;
  live: boolean;
  source: FxRateSource;
}

/** 1 USD karşılığı para birimi miktarı. */
const FALLBACK: FxRates = { USD: 1, EUR: 0.92, TRY: 38 };

const isPositiveRate = (value: unknown) => Number.isFinite(Number(value)) && Number(value) > 0;

export const amountToUsd = (amount: number, currencyCode: string | null | undefined, rates: FxRates) => {
  if (!Number.isFinite(amount)) return null;
  const code = (currencyCode || 'USD').trim().toUpperCase() as keyof FxRates;
  const rate = rates[code];
  if (!isPositiveRate(rate)) return null;
  return amount / rate;
};

const monthBounds = (period: string) => {
  const [year, month] = period.split('-').map(Number);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null;
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
};

@Injectable()
export class FxService {
  private latestCache: FxSnapshot | null = null;
  private latestCacheDay = '';
  private latestRetryAt = 0;
  private latestRequest: Promise<FxSnapshot> | null = null;
  private readonly periodCache = new Map<string, FxSnapshot>();
  private readonly periodRequests = new Map<string, Promise<FxSnapshot>>();

  async rates(): Promise<FxSnapshot> {
    const today = new Date().toISOString().slice(0, 10);
    if (this.latestCache && this.latestCacheDay === today && (this.latestCache.live || Date.now() < this.latestRetryAt)) {
      return this.latestCache;
    }
    if (this.latestRequest) return this.latestRequest;

    this.latestRequest = (async () => {
      const fetched = await this.fetchLatest();
      this.latestCacheDay = today;
      if (fetched) {
        this.latestCache = { base: 'USD', date: fetched.date || today, rates: fetched.rates, live: true, source: 'live' };
        return this.latestCache;
      }
      this.latestRetryAt = Date.now() + 10 * 60 * 1000;
      this.latestCache = this.latestCache
        ? { ...this.latestCache, live: false, source: 'last_known' }
        : { base: 'USD', date: today, rates: FALLBACK, live: false, source: 'fallback' };
      return this.latestCache;
    })();
    try {
      return await this.latestRequest;
    } finally {
      this.latestRequest = null;
    }
  }

  /**
   * Hedef raporları için geçmiş ayda ECB günlük kurlarının dönem ortalamasını,
   * güncel/gelecek ayda en son kuru kullanır. Böylece farklı para birimleri
   * doğrudan toplanmaz ve tüm parasal hedefler USD ile karşılaştırılır.
   */
  async ratesForPeriod(period: string): Promise<FxSnapshot> {
    const currentPeriod = new Date().toISOString().slice(0, 7);
    if (period >= currentPeriod) return this.rates();

    const cached = this.periodCache.get(period);
    if (cached) return cached;
    const inFlight = this.periodRequests.get(period);
    if (inFlight) return inFlight;
    const bounds = monthBounds(period);
    if (!bounds) return this.rates();

    const request = (async () => {
      try {
        const response = await fetch(
          `https://api.frankfurter.app/${bounds.start}..${bounds.end}?from=USD&to=EUR,TRY`,
          { signal: AbortSignal.timeout(4_000) },
        );
        if (response.ok) {
          const data = (await response.json()) as { rates?: Record<string, { EUR?: number; TRY?: number }> };
          const rows = Object.entries(data.rates ?? {}).filter(([, row]) => isPositiveRate(row.EUR) && isPositiveRate(row.TRY));
          if (rows.length) {
            const totals = rows.reduce(
              (sum, [, row]) => ({ EUR: sum.EUR + Number(row.EUR), TRY: sum.TRY + Number(row.TRY) }),
              { EUR: 0, TRY: 0 },
            );
            const snapshot: FxSnapshot = {
              base: 'USD',
              date: `${rows[0][0]}…${rows[rows.length - 1][0]}`,
              rates: { USD: 1, EUR: totals.EUR / rows.length, TRY: totals.TRY / rows.length },
              live: true,
              source: 'period_average',
            };
            this.periodCache.set(period, snapshot);
            return snapshot;
          }
        }
      } catch {
        // Güncel/son bilinen güvenli kura düş.
      }
      return this.rates();
    })();
    this.periodRequests.set(period, request);
    try {
      return await request;
    } finally {
      this.periodRequests.delete(period);
    }
  }

  private async fetchLatest(): Promise<{ date: string; rates: FxRates } | null> {
    try {
      const response = await fetch('https://api.frankfurter.app/latest?from=USD&to=EUR,TRY', {
        signal: AbortSignal.timeout(4_000),
      });
      if (response.ok) {
        const data = (await response.json()) as { date?: string; rates?: { EUR?: number; TRY?: number } };
        if (isPositiveRate(data.rates?.TRY)) {
          return {
            date: data.date ?? '',
            rates: {
              USD: 1,
              EUR: isPositiveRate(data.rates?.EUR) ? Number(data.rates?.EUR) : FALLBACK.EUR,
              TRY: Number(data.rates?.TRY),
            },
          };
        }
      }
    } catch {
      // Yedek kaynağa geç.
    }

    try {
      const response = await fetch('https://open.er-api.com/v6/latest/USD', {
        signal: AbortSignal.timeout(4_000),
      });
      if (response.ok) {
        const data = (await response.json()) as { time_last_update_utc?: string; rates?: { EUR?: number; TRY?: number } };
        if (isPositiveRate(data.rates?.TRY)) {
          return {
            date: data.time_last_update_utc ? new Date(data.time_last_update_utc).toISOString().slice(0, 10) : '',
            rates: {
              USD: 1,
              EUR: isPositiveRate(data.rates?.EUR) ? Number(data.rates?.EUR) : FALLBACK.EUR,
              TRY: Number(data.rates?.TRY),
            },
          };
        }
      }
    } catch {
      // Fallback rates() içinde uygulanır.
    }
    return null;
  }
}
