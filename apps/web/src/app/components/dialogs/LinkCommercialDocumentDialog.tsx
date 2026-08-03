import { useEffect, useMemo, useState } from "react";
import { Link2, Save } from "lucide-react";
import { toast } from "sonner";
import type { DocumentItem } from "../../lib/mock";
import { useStore } from "../../lib/store";
import { documentService } from "../../../lib/services";
import { Button } from "../ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "../ui/dialog";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";

const LINKABLE_TYPES: DocumentItem["type"][] = ["Proforma", "Contract", "CommercialInvoice"];

export function LinkCommercialDocumentDialog({
  document,
  trigger,
  onLinked,
}: {
  document: DocumentItem;
  trigger: React.ReactNode;
  onLinked?: () => void | Promise<void>;
}) {
  const { offers, cases, customers, refresh } = useStore();
  const [open, setOpen] = useState(false);
  const [quoteId, setQuoteId] = useState("");
  const [saving, setSaving] = useState(false);
  const candidates = useMemo(() => [...offers]
    .filter((offer) => {
      const salesCase = cases.find((item) => item.id === offer.salesCaseId);
      return offer.salesCaseId === document.salesCaseId
        || Boolean(document.companyId && (offer.companyId === document.companyId || salesCase?.customerId === document.companyId));
    })
    .sort((left, right) => right.revision - left.revision || right.date.localeCompare(left.date)), [cases, document.companyId, document.salesCaseId, offers]);

  useEffect(() => {
    if (open) setQuoteId(candidates[0]?.id ?? "");
  }, [candidates, open]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!LINKABLE_TYPES.includes(document.type) || !document.fileId) {
      toast.error("Bu belge bağlanamaz", { description: "Yalnız yüklenmiş proforma, sözleşme ve ticari fatura PDF'leri desteklenir." });
      return;
    }
    if (!quoteId) {
      toast.error("Kaynak teklif seçin");
      return;
    }
    setSaving(true);
    try {
      const today = new Date();
      if (document.type === "Proforma") {
        await documentService.createProforma({ quoteId, issueDate: today, statusCode: "draft", fileId: document.fileId });
      } else if (document.type === "Contract") {
        await documentService.createContract({ quoteId, signedDate: today, statusCode: "draft", fileId: document.fileId });
      } else {
        await documentService.createCommercialInvoice({ quoteId, invoiceDate: today, statusCode: "draft", fileId: document.fileId });
      }
      await refresh();
      await onLinked?.();
      toast.success("Belge kaynağa bağlandı", { description: "PDF artık seçilen teklif revizyonunun ticari zincirinde görünecek." });
      setOpen(false);
    } catch (error: unknown) {
      toast.error("Bağlantı tamamlanamadı", { description: error instanceof Error ? error.message : "API isteği başarısız oldu." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="w-[min(560px,calc(100vw-2rem))] max-w-none sm:max-w-none">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Link2 className="size-5 text-primary" /> Ticari belge bağlantısını tamamla</DialogTitle>
          <DialogDescription>{document.fileName} dosyasını gerçek kaynak teklif revizyonuna bağlayın.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label>Kaynak Teklif *</Label>
            <Select value={quoteId || undefined} onValueChange={setQuoteId}>
              <SelectTrigger className="mt-1 bg-white"><SelectValue placeholder="Teklif seçin" /></SelectTrigger>
              <SelectContent>
                {candidates.map((offer) => {
                  const salesCase = cases.find((item) => item.id === offer.salesCaseId);
                  const company = customers.find((item) => item.id === (offer.companyId || salesCase?.customerId));
                  return <SelectItem key={offer.id} value={offer.id}>{offer.quoteNo} · R{offer.revision} · {company?.name ?? "Firma"}</SelectItem>;
                })}
              </SelectContent>
            </Select>
            {candidates.length === 0 && <p className="mt-2 text-xs text-destructive">Bu belgeyle aynı firma veya fırsata bağlı teklif bulunamadı. Önce teklif oluşturun.</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>Vazgeç</Button>
            <Button type="submit" disabled={saving || !quoteId}><Save className="mr-1 size-4" /> {saving ? "Bağlanıyor…" : "Bağlantıyı tamamla"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
