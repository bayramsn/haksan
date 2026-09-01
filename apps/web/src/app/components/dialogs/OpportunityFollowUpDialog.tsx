import { useEffect, useState } from "react";
import { CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { useStore } from "../../lib/store";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caseId: string;
  caseName: string;
  defaultAction?: string;
};

function defaultFollowUpDate() {
  const date = new Date();
  date.setMonth(date.getMonth() + 2);
  date.setHours(10, 0, 0, 0);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

/** Fırsatı kaybetmeden ileri tarihe taşıyan, tarihli görev üreten karar akışı. */
export function OpportunityFollowUpDialog({ open, onOpenChange, caseId, caseName, defaultAction }: Props) {
  const { postponeCase } = useStore();
  const [reason, setReason] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [followUpAt, setFollowUpAt] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setReason("");
    setNextAction(defaultAction?.trim() || "Müşteriyi tekrar ara");
    setFollowUpAt(defaultFollowUpDate());
  }, [defaultAction, open]);

  const submit = async () => {
    const date = new Date(followUpAt);
    if (!reason.trim() || !nextAction.trim() || !followUpAt || Number.isNaN(date.getTime())) {
      toast.error("Takip nedeni, sonraki aksiyon ve tarih zorunludur.");
      return;
    }
    if (date.getTime() <= Date.now()) {
      toast.error("Takip tarihi gelecekte olmalıdır.");
      return;
    }
    setSaving(true);
    try {
      await postponeCase(caseId, {
        reason: reason.trim(),
        nextAction: nextAction.trim(),
        followUpAt: date.toISOString(),
      });
      toast.success("Fırsat takibe alındı", {
        description: `${date.toLocaleString("tr-TR")} için görev oluşturuldu.`,
      });
      onOpenChange(false);
    } catch (error: any) {
      toast.error("Fırsat takibe alınamadı", { description: error?.message ?? "İşlem başarısız oldu." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><CalendarClock className="size-5 text-warning" /> Fırsatı takibe al</DialogTitle>
          <DialogDescription>
            <b>{caseName}</b> kaybedilmiş sayılmaz; fırsat açık kalır ve seçtiğiniz tarihe otomatik görev eklenir.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="follow-up-reason">Neden şimdi kapanmıyor? *</Label>
            <Textarea
              id="follow-up-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Örn. Müşteri yatırımı iki ay sonraya erteledi; bütçe onayını bekliyor."
              maxLength={1000}
              className="min-h-20"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="follow-up-action">Sonraki aksiyon *</Label>
            <Input
              id="follow-up-action"
              value={nextAction}
              onChange={(event) => setNextAction(event.target.value)}
              placeholder="Müşteriyi arayıp yatırım durumunu sor"
              maxLength={255}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="follow-up-date">Takip tarihi ve saati *</Label>
            <Input id="follow-up-date" type="datetime-local" value={followUpAt} onChange={(event) => setFollowUpAt(event.target.value)} />
          </div>
          <div className="rounded-lg border border-warning/25 bg-warning-soft/40 p-3 text-xs text-muted-foreground">
            Bu işlem fırsatı arşivlemez. Gerekçe aktivite akışına, takip işi de görevler alanına eklenir.
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>Vazgeç</Button>
          <Button type="button" disabled={saving} onClick={() => void submit()}>
            {saving ? "Kaydediliyor…" : "Takibe al ve görev oluştur"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
