import { useState } from "react";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  discountAmountFromPercent,
  discountPercentOf,
  formatMoneyInput,
  parseMoneyInput,
  proformaRowError,
  type DocumentDiscount,
  type ProformaPriceRow,
  type ProformaTotals,
} from "../../lib/proformaPricing";

const amount = (value: number) =>
  value.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const quantityLabel = (row: ProformaPriceRow) =>
  `${row.quantity.toLocaleString("tr-TR", { maximumFractionDigits: 3 })} ${row.unitCode}`;

/**
 * Proforma kalem tablosu — teklif formundaki satır düzenini birebir izler:
 * açıklama, adet, düzenlenebilir brüt birim fiyat ve iskonto, KDV ve satır toplamı.
 * Fiyat/iskonto değişiklikleri yalnız bu belgeye yazılır.
 */
export function ProformaItemsEditor({
  rows,
  onRowsChange,
  currency,
  loading = false,
  idPrefix,
  title = "Proforma Kalemleri",
  description = "Brüt birim fiyatı ve iskontoyu düzenleyin. Değişiklikler bağlı teklifi etkilemez.",
  emptyText = "Seçilen teklifte fiyatlandırılacak ürün kalemi bulunamadı.",
}: {
  rows: ProformaPriceRow[];
  onRowsChange: (next: ProformaPriceRow[]) => void;
  currency: string;
  loading?: boolean;
  /** Aynı sayfada birden fazla editör olabildiği için input id'lerini ayırır. */
  idPrefix: string;
  title?: string;
  description?: string;
  emptyText?: string;
}) {
  // Düzenlenen hücrenin ham metni; odaktayken serbest yazım, odaktan çıkınca yeniden biçimlenir.
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const setUnitPrice = (quoteItemId: string, unitPrice: number) => {
    onRowsChange(rows.map((row) => (row.quoteItemId === quoteItemId ? { ...row, unitPrice } : row)));
  };
  const setDiscount = (quoteItemId: string, discountAmount: number) => {
    onRowsChange(rows.map((row) => (row.quoteItemId === quoteItemId ? { ...row, discountAmount } : row)));
  };

  return (
    <section className="overflow-hidden rounded-xl border border-border/70 bg-card">
      <div className="border-b border-border/60 bg-muted/20 px-3 py-2.5">
        <p className="text-xs font-semibold">{title}</p>
        <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">{description}</p>
      </div>

      {loading ? (
        <p className="px-3 py-8 text-center text-xs text-muted-foreground">Fiyatlar yükleniyor…</p>
      ) : rows.length === 0 ? (
        <p className="px-3 py-8 text-center text-xs text-muted-foreground">{emptyText}</p>
      ) : (
        <div className="overflow-x-hidden md:overflow-x-auto">
          <div className="min-w-0 md:min-w-[660px]">
            <div className="hidden grid-cols-[minmax(0,1fr)_72px_132px_92px_62px_48px_108px] gap-2 border-b border-border/60 bg-muted/10 px-3 py-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground md:grid">
              <span>Açıklama</span>
              <span className="text-center">Adet</span>
              <span className="text-right">Brüt Birim Fiyat</span>
              <span className="text-right">İskonto</span>
              <span className="text-right">İsk. %</span>
              <span className="text-center">KDV</span>
              <span className="text-right">Satır Toplamı</span>
            </div>
            <div className="divide-y divide-border/60">
              {rows.map((row, index) => {
                const error = proformaRowError(row);
                const lineTotal = Math.max(0, row.quantity * row.unitPrice - row.discountAmount);
                return (
                  <div
                    key={row.quoteItemId}
                    className="grid grid-cols-2 items-end gap-3 px-3 py-3 md:grid-cols-[minmax(0,1fr)_72px_132px_92px_62px_48px_108px] md:items-center md:gap-2 md:py-2.5"
                  >
                    <p className="col-span-2 min-w-0 break-words text-xs font-medium md:col-span-1 md:truncate" title={row.description}>
                      {row.description || `Ürün ${index + 1}`}
                    </p>
                    <div>
                      <span className="block text-[10px] text-muted-foreground md:hidden">Adet</span>
                      <span className="block text-left text-xs text-muted-foreground md:text-center">{quantityLabel(row)}</span>
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground md:sr-only" htmlFor={`${idPrefix}-${row.quoteItemId}`}>
                        {row.description || `Ürün ${index + 1}`} brüt birim fiyatı
                      </Label>
                      <div className="relative">
                        <Input
                          id={`${idPrefix}-${row.quoteItemId}`}
                          type="text"
                          inputMode="decimal"
                          aria-invalid={error ? true : undefined}
                          className="h-9 pr-11 text-right font-data tabular-nums"
                          value={drafts[row.quoteItemId] ?? formatMoneyInput(row.unitPrice)}
                          onFocus={(event) => {
                            setDrafts((current) => ({ ...current, [row.quoteItemId]: String(row.unitPrice) }));
                            event.target.select();
                          }}
                          onChange={(event) => {
                            const text = event.target.value;
                            setDrafts((current) => ({ ...current, [row.quoteItemId]: text }));
                            setUnitPrice(row.quoteItemId, parseMoneyInput(text));
                          }}
                          onBlur={() => {
                            setDrafts((current) => {
                              const next = { ...current };
                              delete next[row.quoteItemId];
                              return next;
                            });
                          }}
                        />
                        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
                          {currency}
                        </span>
                      </div>
                      {error && <p className="mt-1 text-[10px] text-warning">{error}</p>}
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground md:sr-only" htmlFor={`${idPrefix}-${row.quoteItemId}-discount`}>
                        {row.description || `Ürün ${index + 1}`} iskontosu
                      </Label>
                      <Input
                        id={`${idPrefix}-${row.quoteItemId}-discount`}
                        type="text"
                        inputMode="decimal"
                        aria-invalid={error ? true : undefined}
                        className="h-9 text-right font-data tabular-nums"
                        value={drafts[`${row.quoteItemId}-discount`] ?? formatMoneyInput(row.discountAmount)}
                        onFocus={(event) => {
                          setDrafts((current) => ({ ...current, [`${row.quoteItemId}-discount`]: String(row.discountAmount) }));
                          event.target.select();
                        }}
                        onChange={(event) => {
                          const text = event.target.value;
                          setDrafts((current) => ({ ...current, [`${row.quoteItemId}-discount`]: text }));
                          setDiscount(row.quoteItemId, parseMoneyInput(text));
                        }}
                        onBlur={() => setDrafts((current) => {
                          const next = { ...current };
                          delete next[`${row.quoteItemId}-discount`];
                          return next;
                        })}
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground md:sr-only" htmlFor={`${idPrefix}-${row.quoteItemId}-discount-percent`}>
                        {row.description || `Ürün ${index + 1}`} iskonto yüzdesi
                      </Label>
                      <Input
                        id={`${idPrefix}-${row.quoteItemId}-discount-percent`}
                        type="text"
                        inputMode="decimal"
                        aria-invalid={error ? true : undefined}
                        className="h-9 text-right font-data tabular-nums"
                        value={drafts[`${row.quoteItemId}-percent`] ?? String(discountPercentOf(row))}
                        onFocus={(event) => {
                          setDrafts((current) => ({ ...current, [`${row.quoteItemId}-percent`]: String(discountPercentOf(row)) }));
                          event.target.select();
                        }}
                        onChange={(event) => {
                          const text = event.target.value;
                          setDrafts((current) => ({ ...current, [`${row.quoteItemId}-percent`]: text }));
                          setDiscount(row.quoteItemId, discountAmountFromPercent(row, parseMoneyInput(text)));
                        }}
                        onBlur={() => setDrafts((current) => {
                          const next = { ...current };
                          delete next[`${row.quoteItemId}-percent`];
                          return next;
                        })}
                      />
                    </div>
                    <div>
                      <span className="block text-[10px] text-muted-foreground md:hidden">KDV</span>
                      <span className="block text-left text-xs text-muted-foreground md:text-center">%{row.vatRate}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] text-muted-foreground md:hidden">Satır Toplamı</span>
                      <span className="block text-right font-data text-xs font-medium tabular-nums">{amount(lineTotal)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * Belge geneline uygulanan iskonto. Satır iskontosundan ayrıdır ve bağlı
 * teklifi değiştirmez: boş bırakılırsa belge teklifin genel iskontosunu
 * devralır, doldurulduğunda onun yerine geçer. Yüzde ve tutar birbirini
 * dışlar — biri girildiğinde diğeri sıfırlanır.
 */
export function DocumentDiscountFields({
  value,
  onChange,
  currency,
  idPrefix,
  disabled = false,
}: {
  value: DocumentDiscount;
  onChange: (next: DocumentDiscount) => void;
  currency: string;
  idPrefix: string;
  disabled?: boolean;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const draft = (key: string, fallback: string) => drafts[key] ?? fallback;
  const clearDraft = (key: string) =>
    setDrafts((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });

  return (
    <section className="rounded-xl border border-border/70 bg-card px-3 py-2.5">
      <p className="text-xs font-semibold">Belge Geneli İskonto</p>
      <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
        Satır iskontosundan ayrı, belgenin tamamına uygulanır. Boş bırakılırsa bağlı teklifin genel iskontosu kullanılır; bağlı teklif değişmez.
      </p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <div>
          <Label className="text-[10px] text-muted-foreground" htmlFor={`${idPrefix}-header-discount-amount`}>Tutar</Label>
          <div className="relative">
            <Input
              id={`${idPrefix}-header-discount-amount`}
              type="text"
              inputMode="decimal"
              disabled={disabled}
              className="h-9 pr-11 text-right font-data tabular-nums"
              value={draft("amount", formatMoneyInput(value.amount))}
              onFocus={(event) => {
                setDrafts((current) => ({ ...current, amount: String(value.amount) }));
                event.target.select();
              }}
              onChange={(event) => {
                const text = event.target.value;
                setDrafts((current) => ({ ...current, amount: text }));
                onChange({ amount: parseMoneyInput(text), percent: 0 });
              }}
              onBlur={() => clearDraft("amount")}
            />
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
              {currency}
            </span>
          </div>
        </div>
        <div>
          <Label className="text-[10px] text-muted-foreground" htmlFor={`${idPrefix}-header-discount-percent`}>Yüzde</Label>
          <div className="relative">
            <Input
              id={`${idPrefix}-header-discount-percent`}
              type="text"
              inputMode="decimal"
              disabled={disabled}
              className="h-9 pr-8 text-right font-data tabular-nums"
              value={draft("percent", String(value.percent))}
              onFocus={(event) => {
                setDrafts((current) => ({ ...current, percent: String(value.percent) }));
                event.target.select();
              }}
              onChange={(event) => {
                const text = event.target.value;
                setDrafts((current) => ({ ...current, percent: text }));
                onChange({ amount: 0, percent: Math.min(100, parseMoneyInput(text)) });
              }}
              onBlur={() => clearDraft("percent")}
            />
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">%</span>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Sağ paneldeki proforma toplam özeti — yazdırılan belgedeki kırılımın aynısı. */
export function ProformaTotalsPanel({
  totals,
  currency,
  note,
}: {
  totals: ProformaTotals;
  currency: string;
  note?: string;
}) {
  return (
    <div className="space-y-1 rounded-lg border border-border/60 bg-muted/20 p-3 text-sm">
      <Row label="Ara Toplam" value={amount(totals.gross)} currency={currency} />
      {totals.lineDiscount > 0 && (
        <Row label="Satır İskontosu" value={`-${amount(totals.lineDiscount)}`} currency={currency} />
      )}
      {totals.headerDiscount > 0 && (
        <Row label="Genel İskonto" value={`-${amount(totals.headerDiscount)}`} currency={currency} />
      )}
      <Row label="KDV" value={amount(totals.vat)} currency={currency} />
      {totals.customs > 0 && (
        <Row label="Millileştirme / Gümrük" value={amount(totals.customs)} currency={currency} />
      )}
      <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-1.5 font-medium">
        <span>Genel Toplam</span>
        <span className="font-data tabular-nums text-success">{amount(totals.grand)} {currency}</span>
      </div>
      {note && <p className="pt-1 text-[10px] leading-relaxed text-muted-foreground">{note}</p>}
    </div>
  );
}

function Row({ label, value, currency }: { label: string; value: string; currency: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-data tabular-nums">{value} {currency}</span>
    </div>
  );
}
