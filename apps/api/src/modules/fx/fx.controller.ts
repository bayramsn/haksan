import { Controller, Get } from '@nestjs/common';
import { Public } from '../../shared/security/auth.guard';

type Rates = { USD: number; EUR: number; TRY: number };

/** Canlı kur gelmezse kullanılacak makul fallback (1 USD karşılığı). */
const FALLBACK: Rates = { USD: 1, EUR: 0.92, TRY: 38 };

interface FxSnapshot {
  date: string;
  rates: Rates;
  live: boolean;
}

/**
 * Günlük döviz kuru proxy'si — genel/baz para birimi USD.
 *
 * Kurlar sunucu tarafında çekilir (tarayıcıdaki CORS sorununu by-pass eder),
 * gün içinde in-memory önbelleğe alınır. Birincil kaynak frankfurter.app (ECB),
 * yedek kaynak open.er-api.com. İkisi de başarısız olursa son bilinen ya da
 * fallback değer döner — endpoint asla hata fırlatmaz.
 */
@Controller('fx')
export class FxController {
  private cache: FxSnapshot | null = null;

  @Public()
  @Get('rates')
  async rates(): Promise<FxSnapshot & { base: 'USD' }> {
    const today = new Date().toISOString().slice(0, 10);
    if (this.cache?.live && this.cache.date === today) {
      return { base: 'USD', ...this.cache };
    }
    const fetched = await this.fetchRates();
    if (fetched) {
      this.cache = { date: fetched.date || today, rates: fetched.rates, live: true };
      return { base: 'USD', ...this.cache };
    }
    const fallback: FxSnapshot = this.cache ?? { date: today, rates: FALLBACK, live: false };
    return { base: 'USD', ...fallback };
  }

  private async fetchRates(): Promise<{ date: string; rates: Rates } | null> {
    // 1) frankfurter.app (ECB referans kurları)
    try {
      const r = await fetch('https://api.frankfurter.app/latest?from=USD&to=EUR,TRY', {
        signal: AbortSignal.timeout(4000),
      });
      if (r.ok) {
        const d: any = await r.json();
        if (d?.rates?.TRY) {
          return {
            date: d.date ?? '',
            rates: { USD: 1, EUR: Number(d.rates.EUR) || FALLBACK.EUR, TRY: Number(d.rates.TRY) || FALLBACK.TRY },
          };
        }
      }
    } catch {
      /* yedek kaynağa geç */
    }
    // 2) open.er-api.com (yedek)
    try {
      const r = await fetch('https://open.er-api.com/v6/latest/USD', {
        signal: AbortSignal.timeout(4000),
      });
      if (r.ok) {
        const d: any = await r.json();
        if (d?.rates?.TRY) {
          const date = d.time_last_update_utc
            ? new Date(d.time_last_update_utc).toISOString().slice(0, 10)
            : '';
          return {
            date,
            rates: { USD: 1, EUR: Number(d.rates.EUR) || FALLBACK.EUR, TRY: Number(d.rates.TRY) || FALLBACK.TRY },
          };
        }
      }
    } catch {
      /* fallback'e düş */
    }
    return null;
  }
}
