import { useEffect, useMemo, useState } from "react";
import { FileText, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Combobox } from "../ui/combobox";
import { useStore } from "../../lib/store";
import { documentService } from "../../../lib/services";

/**
 * Yüklemesiz proforma kaydı oluşturur — sadece tekliften no/tarih bilgisi ile
 * referans satırı açar. Dosya yüklemek gerekmez; yazdırma "Girilen verilerle"
 * üretilir.
 */
export function CreateProformaDialog({
  trigger,
  defaultQuoteId,
  open: controlledOpen,
  onOpenChange,
  onCreated,
}: {
  trigger?: React.ReactNode;
  defaultQuoteId?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onCreated?: (id: string) => void;
}) {
  const { offers, customers, cases, documents, refresh } = useStore();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (next: boolean) => {
    onOpenChange?.(next);
    if (controlledOpen === undefined) setInternalOpen(next);
  };

  const today = new Date().toISOString().slice(0, 10);
  const customerName = (id: string) => customers.find((c) => c.id === id)?.name ?? "";

  const [quoteId, setQuoteId] = useState(defaultQuoteId ?? "");
  const [documentNo, setDocumentNo] = useState("");
  const [issueDate, setIssueDate] = useState(today);
  const [saving, setSaving] = useState(false);

  const proformaCount = documents.filter((d) => d.type === "Proforma").length;
  const suggestNo = () => `PRF-${new Date().getFullYear()}/${String(proformaCount + 1).padStart(3, "0")}`;

  useEffect(() => {
    if (!open) return;
    setQuoteId(defaultQuoteId ?? "");
    setDocumentNo(suggestNo());
    setIssueDate(today);
    // suggestNo, today: stable per open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultQuoteId]);

  const quoteOptions = useMemo(
    () =>
      [...offers]
        .sort((a, b) => b.quoteNo.localeCompare(a.quoteNo, "tr", { numeric: true }))
        .map((o) => {
          const sc = cases.find((c) => c.id === o.salesCaseId);
          const cust = sc ? customerName(sc.customerId) : customerName(o.companyId ?? "");
          return {
            value: o.id,
            label: `${o.quoteNo} · ${cust || "—"}`,
            hint: o.amount ? `${o.amount.toLocaleString("tr-TR")} ${o.currency}` : undefined,
          };
        }),
    [offers, cases, customers]
  );

  const selectedOffer = offers.find((o) => o.id === quoteId) ?? null;
  const selectedCase = selectedOffer ? cases.find((c) => c.id === selectedOffer.salesCaseId) : null;
  const selectedCustomer = selectedOffer
    ? customers.find((c) => c.id === (selectedOffer.companyId || selectedCase?.customerId))
    : null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!quoteId) return toast.error("Bağlı teklif seçiniz");
    if (!documentNo.trim()) return toast.error("Proforma no zorunludur");
    setSaving(true);
    try {
      const created = await documentService.createProforma({
        quoteId,
        documentNo: documentNo.trim(),
        issueDate: new Date(issueDate),
        statusCode: "draft",
      });
      toast.success("Proforma oluşturuldu", { description: documentNo.trim() });
      await refresh();
      onCreated?.(created?.id ?? "");
      setOpen(false);
    } catch (err: any) {
      toast.error("Proforma oluşturulamadı", { description: err?.message ?? "İstek başarısız oldu." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="w-[min(560px,calc(100vw-2rem))] max-w-none sm:max-w-none">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="size-5 text-primary" />
            Yeni Proforma
          </DialogTitle>
          <DialogDescription>Teklife bağlı proforma kaydı oluşturun. Dosya yüklemek gerekmez.</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label className="text-xs">Bağlı Teklif *</Label>
            <div className="mt-1.5">
              <Combobox
                options={quoteOptions}
                value={quoteId}
                onChange={setQuoteId}
                placeholder="Teklif no ile arayın..."
                searchPlaceholder="Teklif no / müşteri ara..."
                emptyText="Eşleşen teklif yok."
                disabled={Boolean(defaultQuoteId)}
              />
            </div>
            {selectedOffer && (
              <p className="text-[11px] text-muted-foreground mt-1.5">
                {selectedCustomer?.name ?? ""} · {selectedOffer.amount.toLocaleString("tr-TR")} {selectedOffer.currency}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Proforma No *</Label>
              <div className="mt-1.5 flex gap-1.5">
                <Input value={documentNo} onChange={(e) => setDocumentNo(e.target.value)} placeholder="Otomatik" />
                <Button type="button" variant="outline" size="sm" onClick={() => setDocumentNo(suggestNo())}>
                  Öner
                </Button>
              </div>
            </div>
            <div>
              <Label className="text-xs">Tarih</Label>
              <Input type="date" className="mt-1.5" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>Vazgeç</Button>
            <Button type="submit" disabled={saving} className="gap-1">
              <Save className="size-4" /> {saving ? "Oluşturuluyor…" : "Proforma Oluştur"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
