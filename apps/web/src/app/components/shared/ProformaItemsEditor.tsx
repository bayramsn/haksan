import { useState } from "react";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  formatMoneyInput,
  parseMoneyInput,
  proformaRowError,
  type ProformaPriceRow,
  type ProformaTotals,
} from "../../lib/proformaPricing";

const amount = (value: number) =>
  value.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const quantityLabel = (row: ProformaPriceRow) =>
  `${row.quantity.toLocaleString("tr-TR", { maximumFractionDigits: 3 })} ${row.unitCode}`;

/**
 * Proforma kalem tablosu — teklif formundaki satır düzenini birebir izler:
 * açıklama, adet, düzenlenebilir brüt birim fiyat, tekliften gelen iskonto, KDV ve
 * satır toplamı. Yalnızca birim fiyat düzenlenebilir; iskonto/adet bağlı teklife aittir.
 */
export function ProformaItemsEditor({
  rows,
  onRowsChange,
  currency,
  loading = false,
  idPrefix,
  title = "Proforma Kalemleri",
  description = "Brüt birim fiyatları düzenleyin. İskonto ve adet bağlı teklifden gelir; buradaki değişiklik teklifi etkilemez.",
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
        <div className="overflow-x-auto">
          <div className="min-w-[600px]">
            <div className="grid grid-cols-[minmax(0,1fr)_76px_140px_96px_52px_116px] gap-2 border-b border-border/60 bg-muted/10 px-3 py-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              <span>Açıklama</span>
              <span className="text-center">Adet</span>
              <span className="text-right">Brüt Birim Fiyat</span>
              <span className="text-right">İskonto</span>
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
                    className="grid grid-cols-[minmax(0,1fr)_76px_140px_96px_52px_116px] items-center gap-2 px-3 py-2.5"
                  >
                    <p className="min-w-0 truncate text-xs font-medium" title={row.description}>
                      {row.description || `Ürün ${index + 1}`}
                    </p>
                    <span className="text-center text-xs text-muted-foreground">{quantityLabel(row)}</span>
                    <div>
                      <Label className="sr-only" htmlFor={`${idPrefix}-${row.quoteItemId}`}>
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
                    <span className="text-right font-data text-xs tabular-nums text-muted-foreground">
                      {row.discountAmount > 0 ? `-${amount(row.discountAmount)}` : "—"}
                    </span>
                    <span className="text-center text-xs text-muted-foreground">%{row.vatRate}</span>
                    <span className="text-right font-data text-xs font-medium tabular-nums">{amount(lineTotal)}</span>
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
        <Row label="Teklif İskontosu" value={`-${amount(totals.headerDiscount)}`} currency={currency} />
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
