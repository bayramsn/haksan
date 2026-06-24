import { useEffect, useMemo, useState } from "react";
import { FileSignature, Save } from "lucide-react";
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
 * Yüklemesiz sözleşme kaydı oluşturur — teklife referans verir; çıktısı CRM
 * verisinden basılır.
 */
export function CreateContractDialog({
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
  const [contractNo, setContractNo] = useState("");
  const [signedDate, setSignedDate] = useState(today);
  const [saving, setSaving] = useState(false);

  const contractCount = documents.filter((d) => d.type === "Contract").length;
  const suggestNo = () => `SOZ-${new Date().getFullYear()}/${String(contractCount + 1).padStart(3, "0")}`;

  useEffect(() => {
    if (!open) return;
    setQuoteId(defaultQuoteId ?? "");
    setContractNo(suggestNo());
    setSignedDate(today);
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
    if (!contractNo.trim()) return toast.error("Sözleşme no zorunludur");
    setSaving(true);
    try {
      const created = await documentService.createContract({
        quoteId,
        contractNo: contractNo.trim(),
        signedDate: new Date(signedDate),
        statusCode: "draft",
      });
      toast.success("Sözleşme oluşturuldu", { description: contractNo.trim() });
      await refresh();
      onCreated?.(created?.id ?? "");
      setOpen(false);
    } catch (err: any) {
      toast.error("Sözleşme oluşturulamadı", { description: err?.message ?? "İstek başarısız oldu." });
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
            <FileSignature className="size-5 text-primary" />
            Yeni Sözleşme
          </DialogTitle>
          <DialogDescription>Teklife bağlı sözleşme kaydı oluşturun. Dosya yüklemek gerekmez.</DialogDescription>
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
              <Label className="text-xs">Sözleşme No *</Label>
              <div className="mt-1.5 flex gap-1.5">
                <Input value={contractNo} onChange={(e) => setContractNo(e.target.value)} placeholder="Otomatik" />
                <Button type="button" variant="outline" size="sm" onClick={() => setContractNo(suggestNo())}>
                  Öner
                </Button>
              </div>
            </div>
            <div>
              <Label className="text-xs">İmza Tarihi</Label>
              <Input type="date" className="mt-1.5" value={signedDate} onChange={(e) => setSignedDate(e.target.value)} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>Vazgeç</Button>
            <Button type="submit" disabled={saving} className="gap-1">
              <Save className="size-4" /> {saving ? "Oluşturuluyor…" : "Sözleşme Oluştur"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
