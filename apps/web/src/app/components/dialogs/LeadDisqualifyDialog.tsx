import { useEffect, useState } from "react";
import { LEAD_DISQUALIFY_REASONS } from "@haksan/shared";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Textarea } from "../ui/textarea";
import { Label } from "../ui/label";
import { Button } from "../ui/button";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadName: string;
  onConfirm: (payload: { reasonCode: string; note?: string }) => Promise<void>;
};

/**
 * Lead'i "Uygun değil" durumuna alırken eleme nedenini yakalar. Neden kodu
 * backend'de zorunludur; kayıp nedenleriyle aynı lookup tablosuna yazılır ve
 * kaynak bazlı eleme dağılımı raporunu besler.
 */
export function LeadDisqualifyDialog({ open, onOpenChange, leadName, onConfirm }: Props) {
  const [reasonCode, setReasonCode] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setReasonCode("");
    setNote("");
  }, [open]);

  const submit = async () => {
    if (!reasonCode) return;
    setSaving(true);
    try {
      await onConfirm({ reasonCode, note: note.trim() || undefined });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Lead'i ele</DialogTitle>
          <DialogDescription>
            {leadName ? `${leadName} — ` : ""}Bu lead'in neden takip edilmeyeceğini belirtin. Elenen lead
            fırsata çevrilemez; nedeni değiştirirseniz kart yeniden açılabilir.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Eleme nedeni *</Label>
            <Select value={reasonCode} onValueChange={setReasonCode}>
              <SelectTrigger>
                <SelectValue placeholder="Neden seçin" />
              </SelectTrigger>
              <SelectContent>
                {LEAD_DISQUALIFY_REASONS.map((reason) => (
                  <SelectItem key={reason.code} value={reason.code}>
                    {reason.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Not <span className="font-normal text-muted-foreground">(opsiyonel)</span></Label>
            <Textarea
              className="min-h-16"
              maxLength={1000}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Örn. 2026 yatırım planına alınmadı, yıl sonunda tekrar aranacak."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Vazgeç
          </Button>
          <Button
            onClick={() => void submit()}
            disabled={saving || !reasonCode}
            className="bg-red-600 text-white hover:bg-red-700"
          >
            {saving ? "Kaydediliyor…" : "Elendi İşaretle"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
