import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { API_BASE_URL } from "../../lib/apiClient";

/**
 * Döviz kuru altyapısı — genel/baz para birimi USD.
 *
 * - Günlük kur USD bazlı tutulur: rates = { USD: 1, EUR: x, TRY: y } (1 USD karşılığı).
 * - Kurlar günde bir kez frankfurter.app (ECB verisi) üzerinden otomatik çekilir,
 *   tarih bazında localStorage'da önbelleğe alınır. Çekme başarısızsa son bilinen
 *   ya da fallback değerler kullanılır (uygulama asla NaN göstermez).
 * - convert(amount, from, to): herhangi iki para birimi arası USD üzerinden çevirir.
 */

export type FxCurrency = "USD" | "EUR" | "TRY";
type Rates = Record<FxCurrency, number>;

/** Çevrimdışı / ilk açılış için makul fallback (canlı kur gelene kadar). */
const FALLBACK: Rates = { USD: 1, EUR: 0.92, TRY: 38 };
const STORAGE_KEY = "haksan_fx_v1";
// Kurları kendi backend'imizden çekeriz (sunucu tarafı proxy → CORS yok).
const FX_ENDPOINT = `${API_BASE_URL}/fx/rates`;

export type FxState = {
  /** 1 USD karşılığı kurlar. */
  rates: Rates;
  /** Kurların ait olduğu tarih (YYYY-MM-DD). */
  date: string;
  /** true: canlı çekildi · false: fallback/önbellek. */
  live: boolean;
  loading: boolean;
};

type FxContextValue = FxState & {
  convert: (amount: number, from: FxCurrency, to: FxCurrency) => number;
  /** 1 USD = ? TL */
  usdTry: number;
  /** 1 EUR = ? TL */
  eurTry: number;
  refresh: () => void;
};

const FxContext = createContext<FxContextValue | null>(null);

const todayStr = () => new Date().toISOString().slice(0, 10);

export function FxProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<FxState>(() => {
    try {
      const cached = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (cached?.rates?.USD) return { ...cached, loading: cached.date !== todayStr() };
    } catch {
      /* yok say */
    }
    return { rates: FALLBACK, date: "", live: false, loading: true };
  });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    try {
      const res = await fetch(FX_ENDPOINT);
      if (!res.ok) throw new Error(`FX ${res.status}`);
      const data = await res.json();
      const rates: Rates = {
        USD: 1,
        EUR: Number(data?.rates?.EUR) || FALLBACK.EUR,
        TRY: Number(data?.rates?.TRY) || FALLBACK.TRY,
      };
      const next: FxState = { rates, date: data?.date || todayStr(), live: data?.live ?? true, loading: false };
      setState(next);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* yok say */
      }
    } catch {
      // Canlı çekme başarısız: mevcut (önbellek/fallback) kurla devam et.
      setState((s) => ({ ...s, loading: false }));
    }
  }, []);

  useEffect(() => {
    if (!state.live || state.date !== todayStr()) load();
    // yalnızca ilk açılışta tetikle
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const convert = useCallback(
    (amount: number, from: FxCurrency, to: FxCurrency) => {
      if (!Number.isFinite(amount)) return 0;
      if (from === to) return amount;
      const r = state.rates;
      const usd = amount / (r[from] || 1);
      return usd * (r[to] || 1);
    },
    [state.rates]
  );

  const usdTry = state.rates.TRY;
  const eurTry = state.rates.EUR ? state.rates.TRY / state.rates.EUR : 0;

  return (
    <FxContext.Provider value={{ ...state, convert, usdTry, eurTry, refresh: load }}>
      {children}
    </FxContext.Provider>
  );
}

export function useFx() {
  const ctx = useContext(FxContext);
  if (!ctx) throw new Error("useFx must be used within FxProvider");
  return ctx;
}

const CUR_SYMBOL: Record<FxCurrency, string> = { USD: "$", EUR: "€", TRY: "₺" };

/** Küçük "günlük kur" rozeti — başlıklarda/diyaloglarda kullanılır. */
export function FxRateBadge({ className = "" }: { className?: string }) {
  const { usdTry, eurTry, date, live, loading } = useFx();
  const fmt = (n: number) => n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-2.5 py-1 text-[11px] text-muted-foreground ${className}`}
      title={live ? `Günlük kur · ${date} (ECB/frankfurter)` : "Kur çekilemedi · tahmini değerler"}
    >
      <span className={`size-1.5 rounded-full ${loading ? "bg-amber-400" : live ? "bg-emerald-500" : "bg-zinc-400"}`} />
      <span className="tabular-nums">{CUR_SYMBOL.USD}1 = ₺{fmt(usdTry)}</span>
      <span className="text-border">·</span>
      <span className="tabular-nums">{CUR_SYMBOL.EUR}1 = ₺{fmt(eurTry)}</span>
    </span>
  );
}
