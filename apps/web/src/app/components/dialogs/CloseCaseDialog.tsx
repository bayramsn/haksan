import { useEffect, useMemo, useState } from "react";
import { Ban, Trophy } from "lucide-react";
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
  { code: "spec", name: "Teknik Şartname Karşılanamadı" },
  { code: "delivery", name: "Teslim Süresi Uymadı" },
  { code: "payment_terms", name: "Ödeme Şartları Uymadı" },
  { code: "service", name: "Servis / Garanti Şartları" },
  { code: "other", name: "Diğer" },
];

/**
 * İptal = yatırım düştü, rakibe kaybedilmedi. Ayrı liste tutulur ki kayıp
 * analizi yalnız gerçekten rakibe giden fırsatları saysın.
 */
const CANCEL_REASONS: { code: string; name: string }[] = [
  { code: "cancel_no_budget", name: "Bütçe Yok / Bütçe Ayrılmadı" },
  { code: "cancel_other_investment", name: "Başka Yere Yatırım Yaptı" },
  { code: "cancel_second_hand", name: "2. El Makine Aldı" },
  { code: "cancel_postponed", name: "Yatırım Ertelendi" },
  { code: "cancel_no_need", name: "İhtiyaç Ortadan Kalktı" },
  { code: "cancel_company_closed", name: "Firma / Proje Kapandı" },
  { code: "cancel_duplicate", name: "Mükerrer Kayıt" },
  { code: "cancel_other", name: "Diğer" },
];

type CloseOutcome = "cancelled" | "lost";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caseId: string | null;
  caseName?: string;
  productName?: string;
};

/**
 * Fırsatı Kapat: kapanış nedeni önce seçilir, alanlar ona göre açılır.
 * "İptal" kartı iptal edilmiş olarak kapatır; "Kaybedildi" ise rakip, ürün ve
 * karşılanmayan şartlarla kayıp analizini besler.
 */
export function CloseCaseDialog({ open, onOpenChange, caseId, caseName, productName: initialProductName }: Props) {
  const { markCaseLost, cancelCase } = useStore();
  const [outcome, setOutcome] = useState<CloseOutcome | "">("");
  const [reasonCode, setReasonCode] = useState("");
  const [cancelNote, setCancelNote] = useState("");
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
    setOutcome("");
    setReasonCode("");
    setCancelNote("");
    setProductName(initialProductName?.trim() ?? "");
    setUnmetConditions("");
    setCompetitorId("__none__");
    setCompetitorName("");
    setCompetitorModel("");
  }, [initialProductName, open]);

  // Rakip kataloğu yalnız kayıp seçilince gerekir; iptalde istek atılmaz.
  useEffect(() => {
    if (!open || outcome !== "lost" || competitors.length || competitorsLoading) return;
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
  }, [competitors.length, competitorsLoading, open, outcome]);

  const missingFields = !caseId
    || !outcome
    || !reasonCode
    || (outcome === "lost" && (!productName.trim() || !unmetConditions.trim() || (competitorId === "__manual__" && !competitorName.trim())));

  const submit = async () => {
    if (missingFields) {
      toast.error(outcome === "lost"
        ? "Ürün, kayıp nedeni ve uymayan şartlar tamamlanmalıdır."
        : "Kapanış nedenini seçin.");
      return;
    }
    try {
      setSaving(true);
      if (outcome === "cancelled") {
        await cancelCase(caseId!, { reasonCode, note: cancelNote.trim() || undefined });
        toast.success("Fırsat iptal edildi olarak kapatıldı");
      } else {
        await markCaseLost(caseId!, {
          reasonCode,
          productName: productName.trim(),
          unmetConditions: unmetConditions.trim(),
          competitorId: competitorId !== "__none__" && competitorId !== "__manual__" ? competitorId : undefined,
          competitorName: competitorId === "__manual__" ? competitorName.trim() : undefined,
          competitorProductModel: competitorModel.trim() || undefined,
        });
        toast.success("Fırsat kaybedildi olarak işaretlendi");
      }
      onOpenChange(false);
    } catch (e: any) {
      toast.error("İşlem başarısız", { description: e?.message ?? "Bilinmeyen hata" });
    } finally {
      setSaving(false);
    }
  };

  const reasons = outcome === "lost" ? LOST_REASONS : CANCEL_REASONS;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Fırsatı Kapat</DialogTitle>
          <DialogDescription>
            Önce kapanış nedenini seçin. Kart silinmez, “Geçmiş” görünümünde kalır. Müşteri yalnız ileri bir
            tarih verdiyse bu ekranı kullanmayın; fırsat detayındaki “Takibe al” ile tarihli görev oluşturun.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[65dvh] space-y-3 overflow-y-auto pr-1">
          <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Kapatılan fırsat</div>
            <div className="mt-1 text-sm font-medium">{caseName || "Firma bilgisi bekleniyor"}</div>
          </div>

          <div className="space-y-1.5">
            <Label>Kapanış türü *</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {([
                { value: "cancelled" as const, label: "İptal edildi", detail: "Yatırım düştü, rakibe gitmedi", icon: Ban },
                { value: "lost" as const, label: "Kaybedildi", detail: "Rakip tercih edildi", icon: Trophy },
              ]).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => { setOutcome(option.value); setReasonCode(""); }}
                  aria-pressed={outcome === option.value}
                  className={`flex items-start gap-2 rounded-lg border p-3 text-left transition ${
                    outcome === option.value ? "border-primary bg-primary/5" : "border-border/60 hover:bg-muted/40"
                  }`}
                >
                  <option.icon className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{option.label}</span>
                    <span className="block text-[11px] text-muted-foreground">{option.detail}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          {outcome && (
            <div className="space-y-1.5">
              <Label>{outcome === "lost" ? "Kaybetme Nedeni *" : "İptal Nedeni *"}</Label>
              <Select value={reasonCode} onValueChange={setReasonCode}>
                <SelectTrigger>
                  <SelectValue placeholder="Neden seçin" />
                </SelectTrigger>
                <SelectContent>
                  {reasons.map((r) => (
                    <SelectItem key={r.code} value={r.code}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {outcome === "cancelled" && (
            <div className="space-y-1.5">
              <Label htmlFor="cancel-note">Açıklama</Label>
              <Textarea
                id="cancel-note"
                value={cancelNote}
                onChange={(event) => setCancelNote(event.target.value.slice(0, 1000))}
                placeholder="Müşterinin gerekçesi, tekrar görüşülecek tarih, not…"
                className="min-h-20 resize-y"
                maxLength={1000}
              />
            </div>
          )}

          {outcome === "lost" && (
            <>
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
                <Label id="lost-competitor-label">Hangi firmaya kaybedildi?</Label>
                {/* Tek kutu: yazarak listede ara, listede yoksa yazdığın adı olduğu gibi kabul et. */}
                <Combobox
                  ariaLabel="Hangi firmaya kaybedildi?"
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
                <Label>Hangi ürüne kaybedildi? (rakip model)</Label>
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
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Vazgeç
          </Button>
          <Button
            onClick={submit}
            disabled={saving || missingFields}
            className={outcome === "lost" ? "bg-red-600 text-white hover:bg-red-700" : undefined}
          >
            {saving ? "Kaydediliyor…" : outcome === "lost" ? "Kaybedildi İşaretle" : "Fırsatı Kapat"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
