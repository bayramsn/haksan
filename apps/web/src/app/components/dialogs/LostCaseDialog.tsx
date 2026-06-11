import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Button } from "../ui/button";
import { useStore } from "../../lib/store";
import { competitorService } from "../../../lib/services";
import { toast } from "sonner";

/**
 * Seed'deki cancellation_reasons kodlarıyla aynı (demo.ts §9b). Backend kodu
 * bulamazsa otomatik oluşturur, ama burada Türkçe etiketli sabit liste sunuyoruz.
 */
const LOST_REASONS: { code: string; name: string }[] = [
  { code: "price", name: "Fiyat / Bütçe Yetersiz" },
  { code: "competitor", name: "Rakip Tercih Edildi" },
  { code: "timing", name: "Zamanlama / Yatırım Ertelendi" },
  { code: "spec", name: "Teknik Şartname Karşılanamadı" },
  { code: "no_budget", name: "Bütçe Onayı Çıkmadı" },
  { code: "other", name: "Diğer" },
];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caseId: string | null;
  caseName?: string;
};

/**
 * Bir satış fırsatını "Kaybedildi" (cancelled) olarak işaretler; gerçek ret
 * nedeni + (opsiyonel) tercih edilen rakip ve rakip modelini yakalar.
 */
export function LostCaseDialog({ open, onOpenChange, caseId, caseName }: Props) {
  const { markCaseLost } = useStore();
  const [reasonCode, setReasonCode] = useState("");
  const [competitorId, setCompetitorId] = useState("");
  const [competitorModel, setCompetitorModel] = useState("");
  const [competitors, setCompetitors] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setReasonCode("");
    setCompetitorId("");
    setCompetitorModel("");
    competitorService
      .list({ pageSize: 100 })
      .then((r) => setCompetitors((r.data ?? []).map((c: any) => ({ id: c.id, name: c.name }))))
      .catch(() => setCompetitors([]));
  }, [open]);

  const submit = async () => {
    if (!caseId || !reasonCode) {
      toast.error("Lütfen bir kaybetme nedeni seçin.");
      return;
    }
    try {
      setSaving(true);
      await markCaseLost(caseId, {
        reasonCode,
        competitorId: competitorId || undefined,
        competitorProductModel: competitorModel.trim() || undefined,
      });
      toast.success("Fırsat kaybedildi olarak işaretlendi");
      onOpenChange(false);
    } catch (e: any) {
      toast.error("İşlem başarısız", { description: e?.message ?? "Bilinmeyen hata" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Kaybedildi olarak işaretle</DialogTitle>
          <DialogDescription>
            {caseName ? `${caseName} — ` : ""}Bu fırsatı neden kaybettiğinizi belirtin. Bu bilgi karlılık raporundaki
            kaybetme nedenleri kırılımını besler.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Kaybetme Nedeni *</Label>
            <Select value={reasonCode} onValueChange={setReasonCode}>
              <SelectTrigger>
                <SelectValue placeholder="Neden seçin" />
              </SelectTrigger>
              <SelectContent>
                {LOST_REASONS.map((r) => (
                  <SelectItem key={r.code} value={r.code}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Tercih Edilen Rakip (opsiyonel)</Label>
            <Select value={competitorId} onValueChange={setCompetitorId}>
              <SelectTrigger>
                <SelectValue placeholder={competitors.length ? "Rakip seçin" : "Kayıtlı rakip yok"} />
              </SelectTrigger>
              <SelectContent>
                {competitors.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Rakip Ürün / Model (opsiyonel)</Label>
            <Input
              value={competitorModel}
              onChange={(e) => setCompetitorModel(e.target.value)}
              placeholder="Örn. DMG MORI CMX 1100 V"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Vazgeç
          </Button>
          <Button onClick={submit} disabled={saving || !reasonCode} className="bg-red-600 hover:bg-red-700 text-white">
            {saving ? "Kaydediliyor…" : "Kaybedildi İşaretle"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
