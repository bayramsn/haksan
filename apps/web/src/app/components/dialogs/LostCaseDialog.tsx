import { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Combobox } from "../ui/combobox";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
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
  productName?: string;
};

/**
 * Bir satış fırsatını "Kaybedildi" (cancelled) olarak işaretler; gerçek ret
 * nedeni + (opsiyonel) tercih edilen rakip ve rakip modelini yakalar.
 */
export function LostCaseDialog({ open, onOpenChange, caseId, caseName, productName: initialProductName }: Props) {
  const { markCaseLost } = useStore();
  const [reasonCode, setReasonCode] = useState("");
  const [productName, setProductName] = useState("");
  const [unmetConditions, setUnmetConditions] = useState("");
  const [competitorId, setCompetitorId] = useState("__none__");
  const [competitorName, setCompetitorName] = useState("");
  const [competitorModel, setCompetitorModel] = useState("");
  const [competitors, setCompetitors] = useState<{ id: string; name: string }[]>([]);
  const [competitorsLoading, setCompetitorsLoading] = useState(false);
  const [competitorLoadError, setCompetitorLoadError] = useState(false);
  const [saving, setSaving] = useState(false);

  // Listedeki rakipler + "yok" seçeneği + elle yazılan ad tek kutuda toplanır.
  const competitorOptions = useMemo(
    () => [
      { value: "__none__", label: "Rakip yok / bilinmiyor" },
      ...competitors.map((competitor) => ({ value: competitor.id, label: competitor.name })),
      ...(competitorName.trim() ? [{ value: "__manual__", label: competitorName.trim(), hint: "elle girildi" }] : []),
    ],
    [competitorName, competitors],
  );

  useEffect(() => {
    if (!open) return;
    setReasonCode("");
    setProductName(initialProductName?.trim() ?? "");
    setUnmetConditions("");
    setCompetitorId("__none__");
    setCompetitorName("");
    setCompetitorModel("");
    setCompetitorsLoading(true);
    setCompetitorLoadError(false);
    competitorService
      .list({ pageSize: 100 })
      .then((r) => setCompetitors((r.data ?? []).map((c: any) => ({ id: c.id, name: c.name }))))
      .catch(() => {
        setCompetitors([]);
        setCompetitorLoadError(true);
      })
      .finally(() => setCompetitorsLoading(false));
  }, [initialProductName, open]);

  const submit = async () => {
    if (
      !caseId
      || !reasonCode
      || !productName.trim()
      || !unmetConditions.trim()
      || (competitorId === "__manual__" && !competitorName.trim())
    ) {
      toast.error("Firma, ürün, kayıp nedeni ve uymayan şartlar tamamlanmalıdır.");
      return;
    }
    try {
      setSaving(true);
      await markCaseLost(caseId, {
        reasonCode,
        productName: productName.trim(),
        unmetConditions: unmetConditions.trim(),
        competitorId: competitorId !== "__none__" && competitorId !== "__manual__" ? competitorId : undefined,
        competitorName: competitorId === "__manual__" ? competitorName.trim() : undefined,
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
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Kaybedildi olarak işaretle</DialogTitle>
          <DialogDescription>
            Firma, kaybedilen ürün, rakip ve karşılanmayan şartları kaydedin. Bu bilgiler kart geçmişinde
            değişmeden korunur ve kayıp analizini besler.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[65dvh] space-y-3 overflow-y-auto pr-1">
          <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Kaybedilen firma</div>
            <div className="mt-1 text-sm font-medium">{caseName || "Firma bilgisi bekleniyor"}</div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="lost-product-name">Kaybedilen Ürün / Makine *</Label>
            <Input
              id="lost-product-name"
              value={productName}
              onChange={(event) => setProductName(event.target.value)}
              placeholder="Örn. HAXAN MMT-1170"
              maxLength={512}
            />
          </div>

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
            <Label id="lost-competitor-label">Rakip Kim?</Label>
            {/* Tek kutu: yazarak listede ara, listede yoksa yazdığın adı olduğu gibi kabul et. */}
            <Combobox
              ariaLabel="Rakip Kim?"
              value={competitorId}
              onChange={(value) => {
                setCompetitorId(value);
                if (value !== "__manual__") setCompetitorName("");
              }}
              options={competitorOptions}
              placeholder={competitorsLoading ? "Rakipler yükleniyor…" : competitorLoadError ? "Rakip listesi yüklenemedi" : "Rakip seçin veya yazın"}
              searchPlaceholder="Rakip adı yazın…"
              emptyText="Kayıtlı rakip bulunamadı — adı yazıp ekleyin."
              onCreate={(label) => {
                setCompetitorName(label.slice(0, 255));
                setCompetitorId("__manual__");
              }}
              createLabel={(query) => `Listede yok — "${query}" olarak kaydet`}
            />
            {competitorLoadError && (
              <p className="text-[11px] text-destructive" role="alert">
                Rakip kataloğu alınamadı. Pencereyi kapatıp yeniden açarak tekrar deneyin.
              </p>
            )}
            {competitorId === "__manual__" && (
              <div className="space-y-1.5 pt-1">
                <Label htmlFor="lost-competitor-name">Rakip adı *</Label>
                <Input
                  id="lost-competitor-name"
                  value={competitorName}
                  onChange={(event) => setCompetitorName(event.target.value)}
                  placeholder="Rakip firma adını yazın"
                  maxLength={255}
                />
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Rakip Ürün / Model</Label>
            <Input
              value={competitorModel}
              onChange={(e) => setCompetitorModel(e.target.value)}
              placeholder="Örn. DMG MORI CMX 1100 V"
              maxLength={255}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="lost-unmet-conditions">Hangi Şartlarımız Uymadı? *</Label>
            <Textarea
              id="lost-unmet-conditions"
              value={unmetConditions}
              onChange={(event) => setUnmetConditions(event.target.value)}
              placeholder="Fiyat, teslim süresi, ödeme şekli, teknik kapasite, garanti veya servis şartlarını açıkça yazın."
              className="min-h-24 resize-y"
              maxLength={2000}
            />
            <div className="text-right text-[10px] text-muted-foreground">{unmetConditions.length}/2000</div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Vazgeç
          </Button>
          <Button
            onClick={submit}
            disabled={
              saving
              || !reasonCode
              || !productName.trim()
              || !unmetConditions.trim()
              || (competitorId === "__manual__" && !competitorName.trim())
            }
            className="bg-red-600 text-white hover:bg-red-700"
          >
            {saving ? "Kaydediliyor…" : "Kaybedildi İşaretle"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
