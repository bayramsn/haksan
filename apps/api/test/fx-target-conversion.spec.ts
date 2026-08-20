import { describe, expect, it, vi, afterEach } from 'vitest';
import { amountToUsd, FxService } from '../src/modules/fx/fx.service';

describe('target currency normalization', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('converts supported currencies to USD and rejects unknown currencies', () => {
    const rates = { USD: 1, EUR: 0.5, TRY: 20 };
    expect(amountToUsd(100, 'USD', rates)).toBe(100);
    expect(amountToUsd(100, 'EUR', rates)).toBe(200);
    expect(amountToUsd(1_000, 'TRY', rates)).toBe(50);
    expect(amountToUsd(100, 'GBP', rates)).toBeNull();
  });

  it('uses the average daily ECB rate for a completed target period', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      rates: {
        '2024-01-02': { EUR: 0.5, TRY: 20 },
        '2024-01-03': { EUR: 1, TRY: 40 },
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } })));

    const snapshot = await new FxService().ratesForPeriod('2024-01');
    expect(snapshot.source).toBe('period_average');
    expect(snapshot.rates.EUR).toBe(0.75);
    expect(snapshot.rates.TRY).toBe(30);
    expect(snapshot.date).toBe('2024-01-02…2024-01-03');
  });
});
