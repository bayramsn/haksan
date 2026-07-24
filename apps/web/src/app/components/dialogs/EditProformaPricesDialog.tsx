import { useEffect, useMemo, useState } from "react";
import { BadgeDollarSign, Save } from "lucide-react";
import { toast } from "sonner";
import type { DocumentItem } from "../../lib/mock";
import { quoteToProformaPriceRows, snapshotToProformaPriceRows, type ProformaPriceRow } from "../../lib/proformaPricing";
import { useStore } from "../../lib/store";
import { documentService, quoteService } from "../../../lib/services";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

/** Net birim fiyatı tr-TR biçiminde gösterir (binlik ayraç + virgüllü ondalık). */
const formatMoney = (value: number) =>
  value.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 4 });

/** tr-TR ("1.234,56") veya düz ("1234.56") girdiyi sayıya çevirir. */
const parseMoney = (raw: string): number => {
  const cleaned = raw.replace(/[^\d.,-]/g, "").trim();
  if (!cleaned) return 0;
  let normalized = cleaned;
  if (cleaned.includes(",") && cleaned.includes(".")) {
    // Hem nokta hem virgül varsa nokta binlik, virgül ondalıktır (tr-TR).
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (cleaned.includes(",")) {
    normalized = cleaned.replace(",", ".");
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

export function EditProformaPricesDialog({
  document,
  trigger,
}: {
  document: DocumentItem;
  trigger: React.ReactNode;
}) {
  const { offers, refresh } = useStore();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ProformaPriceRow[]>([]);
  // Düzenlenen hücrenin ham metni; odaktayken serbest yazım, odaktan çıkınca yeniden biçimlenir.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const currency = String(
    document.documentSnapshot?.currency?.code
      ?? offers.find((offer) => offer.id === document.quoteId)?.currency
      ?? "USD",
  );
  const subtotal = useMemo(
    () => rows.reduce((sum, row) => sum + row.quantity * row.unitPrice, 0),
    [rows],
  );

  useEffect(() => {
    if (!open || !document.quoteId) return;
    let cancelled = false;
    setLoading(true);
    setDrafts({});
    void (async () => {
      try {
        const quote = await quoteService.get(document.quoteId!);
        if (cancelled) return;
        const storedRows = snapshotToProformaPriceRows(document.documentSnapshot);
        const quoteRows = quoteToProformaPriceRows(quote);
        const storedById = new Map(storedRows.map((row) => [row.quoteItemId, row]));
        setRows(quoteRows.map((row) => {
          const stored = storedById.get(row.quoteItemId);
          return stored ? { ...row, unitPrice: stored.unitPrice } : row;
        }));
      } catch (error: unknown) {
        if (cancelled) return;
        toast.error("Proforma fiyatları alınamadı", {
          description: error instanceof Error ? error.message : "Bağlı teklif okunamadı.",
        });
        setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, document.documentSnapshot, document.quoteId]);

  const save = async () => {
    if (!rows.length) return;
    setSaving(true);
    try {
      await documentService.updateProforma(document.id, {
        items: rows.map((row) => ({ quoteItemId: row.quoteItemId, unitPrice: row.unitPrice })),
      });
      await refresh();
      toast.success("Proforma fiyatları güncellendi", { description: document.fileName });
      setOpen(false);
    } catch (error: unknown) {
      toast.error("Proforma fiyatları güncellenemedi", {
        description: error instanceof Error ? error.message : "İstek başarısız oldu.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      {/* Portallı içerik React ağacında satıra kadar kabarabildiği için tıklama/işaretçi
          olaylarını burada durdur; aksi halde satırın onClick'i belge detayını açıyor. */}
      <DialogContent
        className="w-[min(760px,calc(100vw-2rem))] max-w-none sm:max-w-none"
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BadgeDollarSign className="size-5 text-primary" />
            Proforma Fiyatlarını Düzenle
          </DialogTitle>
          <DialogDescription>
            {document.fileName} için net birim fiyatları düzenleyin. Bağlı teklif fiyatları değişmez.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[56vh] overflow-y-auto rounded-xl border border-border/70">
          {loading ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">Fiyatlar yükleniyor…</p>
          ) : rows.length ? (
            <div className="divide-y divide-border/60">
              {rows.map((row, index) => (
                <div key={row.quoteItemId} className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_80px_210px] sm:items-center">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{row.description || `Ürün ${index + 1}`}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">KDV %{row.vatRate}</p>
                  </div>
                  <span className="text-xs text-muted-foreground sm:text-center">{row.quantity.toLocaleString("tr-TR")} adet</span>
                  <div>
                    <Label className="sr-only" htmlFor={`edit-proforma-price-${row.quoteItemId}`}>Net birim fiyat</Label>
                    <div className="relative">
                      <Input
                        id={`edit-proforma-price-${row.quoteItemId}`}
                        type="text"
                        inputMode="decimal"
                        className="pr-12 text-right font-data tabular-nums"
                        value={drafts[row.quoteItemId] ?? formatMoney(row.unitPrice)}
                        onFocus={(event) => {
                          setDrafts((current) => ({ ...current, [row.quoteItemId]: String(row.unitPrice) }));
                          event.target.select();
                        }}
                        onChange={(event) => {
                          const text = event.target.value;
                          const unitPrice = parseMoney(text);
                          setDrafts((current) => ({ ...current, [row.quoteItemId]: text }));
                          setRows((current) => current.map((item) =>
                            item.quoteItemId === row.quoteItemId ? { ...item, unitPrice } : item
                          ));
                        }}
                        onBlur={() => {
                          setDrafts((current) => {
                            const next = { ...current };
                            delete next[row.quoteItemId];
                            return next;
                          });
                        }}
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
                        {currency}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">Fiyatlandırılacak ürün kalemi bulunamadı.</p>
          )}
        </div>

        <div className="flex items-center justify-between rounded-lg bg-muted/25 px-4 py-3">
          <span className="text-xs text-muted-foreground">Ara toplam</span>
          <span className="font-data text-sm font-semibold text-emerald-600">
            {subtotal.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency}
          </span>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>Vazgeç</Button>
          <Button type="button" className="gap-1.5" onClick={() => void save()} disabled={saving || loading || !rows.length}>
            <Save className="size-4" />
            {saving ? "Kaydediliyor…" : "Fiyatları Kaydet"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
