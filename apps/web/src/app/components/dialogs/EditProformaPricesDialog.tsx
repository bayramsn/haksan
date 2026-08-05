import { useEffect, useMemo, useState } from "react";
import { BadgeDollarSign, Save } from "lucide-react";
import { toast } from "sonner";
import type { DocumentItem } from "../../lib/mock";
import {
  computeProformaTotals, proformaRowError, quoteToProformaPriceRows, snapshotToProformaPriceRows,
  type ProformaPriceRow,
} from "../../lib/proformaPricing";
import { useStore } from "../../lib/store";
import { documentService, quoteService } from "../../../lib/services";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";
import { ProformaItemsEditor, ProformaTotalsPanel } from "../shared/ProformaItemsEditor";

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
  // Toplamların yazdırılan belgeyle örtüşmesi için teklifin iskonto/gümrük bağlamı.
  const [quoteTotals, setQuoteTotals] = useState({ discountTotal: 0, customsTotal: 0 });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const currency = String(
    document.documentSnapshot?.currency?.code
      ?? offers.find((offer) => offer.id === document.quoteId)?.currency
      ?? "USD",
  );
  const totals = useMemo(
    () => computeProformaTotals(rows, {
      quoteDiscountTotal: quoteTotals.discountTotal,
      customsTotal: quoteTotals.customsTotal,
    }),
    [rows, quoteTotals],
  );
  const rowError = rows.map(proformaRowError).find(Boolean) ?? null;

  useEffect(() => {
    if (!open || !document.quoteId) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const quote: any = await quoteService.get(document.quoteId!);
        if (cancelled) return;
        const storedRows = snapshotToProformaPriceRows(document.documentSnapshot);
        const quoteRows = quoteToProformaPriceRows(quote);
        const storedById = new Map(storedRows.map((row) => [row.quoteItemId, row]));
        setRows(quoteRows.map((row) => {
          const stored = storedById.get(row.quoteItemId);
          return stored ? { ...row, unitPrice: stored.unitPrice } : row;
        }));
        setQuoteTotals({
          // İskonto tabanı canlı tekliftir: API teklif geneli iskontoyu her kayıtta
          // güncel teklifden yeniden türetir. Gümrük ise belgede saklanan değerdir —
          // yazdırılan çıktı da onu kullanır.
          discountTotal: Number(quote.discountTotal ?? 0) || 0,
          customsTotal:
            Number(document.documentSnapshot?.quote?.customsTotal ?? quote.customsTotal ?? 0) || 0,
        });
      } catch (error: unknown) {
        if (cancelled) return;
        toast.error("Proforma fiyatları alınamadı", {
          description: error instanceof Error ? error.message : "Bağlı teklif okunamadı.",
        });
        setRows([]);
        setQuoteTotals({ discountTotal: 0, customsTotal: 0 });
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
    if (rowError) return toast.error("Proforma fiyatları güncellenemedi", { description: rowError });
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
        className="w-[min(880px,calc(100vw-2rem))] max-w-none sm:max-w-none"
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BadgeDollarSign className="size-5 text-primary" />
            Proforma Fiyatlarını Düzenle
          </DialogTitle>
          <DialogDescription>
            {document.fileName} için brüt birim fiyatları düzenleyin. Bağlı teklif fiyatları değişmez.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[56vh] overflow-y-auto">
          <ProformaItemsEditor
            rows={rows}
            onRowsChange={setRows}
            currency={currency}
            loading={loading}
            idPrefix="edit-proforma-price"
            description="Yalnızca brüt birim fiyat düzenlenir; iskonto ve adet bağlı teklifden gelir."
            emptyText="Fiyatlandırılacak ürün kalemi bulunamadı."
          />
        </div>

        <ProformaTotalsPanel
          totals={totals}
          currency={currency}
          note={
            totals.customs > 0
              ? "Millileştirme tutarı bağlı teklifin güncel değeridir; kayıtta fiyatlara göre yeniden hesaplanır."
              : undefined
          }
        />

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
