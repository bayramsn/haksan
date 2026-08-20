import { useId, useMemo, useState } from "react";
import { BookmarkPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../ui/select";
import { Input } from "../ui/input";
import { NumberedLinesTextarea, markedLineCount, type LineMarkerStyle } from "../shared/NumberedLinesTextarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import type { NoteTemplate } from "../../lib/store";
import type { QuoteNoteVariant } from "../../lib/print";

const TERMS_TEMPLATE_PREFIX = "template:";

export type TermsValue = {
  paymentTerms: string;
  deliveryTerms: string;
  warrantyTerms: string;
};

export type TermsTemplate = TermsValue & {
  id: string;
  title: string;
  selectKey: string;
};

export const termsTemplateKey = (id: string) => `${TERMS_TEMPLATE_PREFIX}${id}`;

export const encodeTermsTemplateBody = (input: TermsValue) =>
  JSON.stringify({
    paymentTermsText: input.paymentTerms,
    deliveryTermsText: input.deliveryTerms,
    warrantyTermsText: input.warrantyTerms,
  });

export const parseTermsTemplate = (template: NoteTemplate): TermsTemplate | null => {
  try {
    const parsed = JSON.parse(template.body) as Record<string, unknown>;
    return {
      id: template.id,
      title: template.title,
      selectKey: termsTemplateKey(template.id),
      paymentTerms: String(parsed.paymentTermsText ?? parsed.paymentTerms ?? ""),
      deliveryTerms: String(parsed.deliveryTermsText ?? parsed.deliveryTerms ?? ""),
      warrantyTerms: String(parsed.warrantyTermsText ?? parsed.warrantyTerms ?? ""),
    };
  } catch {
    return null;
  }
};

const normalizeTermsText = (value: string) =>
  value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).join("\n");

export const matchSavedTermsTemplate = (
  paymentTerms: string,
  deliveryTerms: string,
  warrantyTerms: string,
  templates: TermsTemplate[],
) => {
  const payment = normalizeTermsText(paymentTerms);
  const delivery = normalizeTermsText(deliveryTerms);
  const warranty = normalizeTermsText(warrantyTerms);
  return templates.find((template) =>
    normalizeTermsText(template.paymentTerms) === payment &&
    normalizeTermsText(template.deliveryTerms) === delivery &&
    normalizeTermsText(template.warrantyTerms) === warranty
  )?.selectKey ?? "";
};

type Props = {
  title?: string;
  description?: string;
  templateScope: string;
  noteTemplates: NoteTemplate[];
  selectedTemplateKey: string;
  onSelectedTemplateKeyChange: (key: string) => void;
  value: TermsValue;
  onChange: (value: TermsValue) => void;
  addNoteTemplate: (t: { title: string; body: string; scope?: string }) => Promise<NoteTemplate>;
  updateNoteTemplate: (id: string, patch: { title?: string; body?: string; scope?: string }) => Promise<NoteTemplate>;
  deleteNoteTemplate: (id: string) => Promise<void>;
  /**
   * Bu belgeye AİT hazır şablonlar. Eskiden `includeBuiltInVariants` boolean'ı
   * vardı ve varsayılanı `true` olduğu için TEKLİF şablonları proforma ve
   * sözleşme pencerelerine de düşüyordu — imza masasında teklif dili basılıyordu.
   * Artık her ekran kendi setini açıkça verir; verilmezse hazır şablon çıkmaz.
   */
  builtInVariants?: QuoteNoteVariant[];
  onBuiltInTemplateSelected?: (key: string) => void;
  /**
   * Madde işaretinin biçimi — metnin basılacağı belgeye göre seçilir:
   * teklif `alpha` (`a. b. c.`), proforma `decimal`, sözleşme `none`
   * (şart metni orada madde madde numaralanmaz). Bkz. `LineMarkerStyle`.
   */
  markerStyle?: LineMarkerStyle;
  /**
   * Proforma çıktısı ödeme + teslimat + garanti maddelerini tek kesintisiz
   * listede basar; bu kipte ikinci ve üçüncü kutunun sayacı 1'den başlamaz,
   * bir öncekinin bittiği yerden devam eder.
   */
  continuousNumbering?: boolean;
};

export function useTermsTemplates(noteTemplates: NoteTemplate[], templateScope: string) {
  return useMemo(
    () => noteTemplates
      .filter((template) => template.scope === templateScope)
      .map(parseTermsTemplate)
      .filter((template): template is TermsTemplate => Boolean(template)),
    [noteTemplates, templateScope]
  );
}

export function DocumentTermsTemplateEditor({
  title = "Belge Şartları",
  description = "Şablon seçin, metinleri gerekiyorsa düzenleyin; değişiklikler belgeye basılmadan önce kaydedilebilir.",
  templateScope,
  noteTemplates,
  selectedTemplateKey,
  onSelectedTemplateKeyChange,
  value,
  onChange,
  addNoteTemplate,
  updateNoteTemplate,
  deleteNoteTemplate,
  builtInVariants = [],
  onBuiltInTemplateSelected,
  markerStyle = "decimal",
  continuousNumbering = false,
}: Props) {
  const fieldId = useId();
  const [templateDialogMode, setTemplateDialogMode] = useState<"create" | "update" | "delete" | null>(null);
  const [templateTitle, setTemplateTitle] = useState("");
  const [templateBusy, setTemplateBusy] = useState(false);
  const savedTemplates = useTermsTemplates(noteTemplates, templateScope);
  const selectedSavedTemplate = savedTemplates.find((template) => template.selectKey === selectedTemplateKey);

  // Baskıda maddeler tek listede birleşiyorsa kutuların sayacı zincirlenir.
  const paymentStart = 0;
  const deliveryStart = continuousNumbering ? markedLineCount(value.paymentTerms) : 0;
  const warrantyStart = continuousNumbering ? deliveryStart + markedLineCount(value.deliveryTerms) : 0;

  const updateValue = (patch: Partial<TermsValue>) => onChange({ ...value, ...patch });
  const currentBody = () => encodeTermsTemplateBody(value);

  const applyTemplate = (key: string) => {
    onSelectedTemplateKeyChange(key);
    if (!key) return;
    if (key.startsWith(TERMS_TEMPLATE_PREFIX)) {
      const template = savedTemplates.find((item) => item.selectKey === key);
      if (!template) return;
      onChange({
        paymentTerms: template.paymentTerms,
        deliveryTerms: template.deliveryTerms,
        warrantyTerms: template.warrantyTerms,
      });
      return;
    }

    const builtIn = builtInVariants.find((variant) => variant.key === key);
    if (!builtIn) return;
    onBuiltInTemplateSelected?.(key);
    onChange({
      paymentTerms: builtIn.odeme.join("\n"),
      deliveryTerms: builtIn.teslimat.join("\n"),
      warrantyTerms: builtIn.garanti.join("\n"),
    });
  };

  const saveAsNewTemplate = () => {
    if (!value.paymentTerms.trim() && !value.deliveryTerms.trim() && !value.warrantyTerms.trim()) {
      return toast.error("Önce belge şartı girin");
    }
    setTemplateTitle(selectedSavedTemplate ? `${selectedSavedTemplate.title} kopya` : "");
    setTemplateDialogMode("create");
  };

  const updateSelectedTemplate = () => {
    if (!selectedSavedTemplate) return;
    setTemplateTitle(selectedSavedTemplate.title);
    setTemplateDialogMode("update");
  };

  const deleteSelectedTemplate = () => {
    if (!selectedSavedTemplate) return;
    setTemplateDialogMode("delete");
  };

  const submitTemplateAction = async () => {
    if (!templateDialogMode || !selectedSavedTemplate && templateDialogMode !== "create") return;
    if (templateDialogMode !== "delete" && !templateTitle.trim()) return;
    setTemplateBusy(true);
    try {
      if (templateDialogMode === "create") {
        const created = await addNoteTemplate({ title: templateTitle.trim(), body: currentBody(), scope: templateScope });
        onSelectedTemplateKeyChange(termsTemplateKey(created.id));
        toast.success("Belge şartları yeni şablon olarak kaydedildi");
      } else if (templateDialogMode === "update" && selectedSavedTemplate) {
        await updateNoteTemplate(selectedSavedTemplate.id, { title: templateTitle.trim(), body: currentBody(), scope: templateScope });
        toast.success("Belge şartları şablonu güncellendi");
      } else if (templateDialogMode === "delete" && selectedSavedTemplate) {
        await deleteNoteTemplate(selectedSavedTemplate.id);
        onSelectedTemplateKeyChange("");
        toast.success("Belge şartları şablonu silindi");
      }
      setTemplateDialogMode(null);
    } catch (err: any) {
      toast.error(templateDialogMode === "delete" ? "Şablon silinemedi" : "Şablon kaydedilemedi", { description: err?.message });
    } finally {
      setTemplateBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-border/70">
      <div className="flex flex-col gap-2 px-3 py-2.5 border-b border-border/60 bg-muted/30 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-medium">{title}</div>
          <div className="text-[11px] text-muted-foreground">{description}</div>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <Select value={selectedTemplateKey || "ozel"} onValueChange={(v) => applyTemplate(v === "ozel" ? "" : v)}>
            <SelectTrigger className="h-9 w-full sm:w-64"><SelectValue placeholder="Şablon seçin..." /></SelectTrigger>
            <SelectContent>
              {builtInVariants.map((variant) => (
                <SelectItem key={variant.key} value={variant.key}>{variant.label}</SelectItem>
              ))}
              {savedTemplates.length > 0 && (
                <div className="px-2 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Kayıtlı şablonlar</div>
              )}
              {savedTemplates.map((template) => (
                <SelectItem key={template.id} value={template.selectKey}>{template.title}</SelectItem>
              ))}
              <SelectItem value="ozel">Özel (manuel gir)</SelectItem>
            </SelectContent>
          </Select>
          <Button type="button" variant="outline" size="sm" className="h-9 gap-1" onClick={saveAsNewTemplate}>
            <BookmarkPlus className="size-3.5" /> Yeni şablon
          </Button>
        </div>
      </div>

      {selectedSavedTemplate && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-3 py-2 text-xs">
          <span className="text-muted-foreground">Kayıtlı şablon düzenleniyor: {selectedSavedTemplate.title}</span>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={updateSelectedTemplate}>Şablonu güncelle</Button>
            <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={saveAsNewTemplate}>Yeni kopya olarak kaydet</Button>
            <Button type="button" variant="ghost" size="sm" className="h-7 text-xs text-destructive" onClick={deleteSelectedTemplate}>Sil</Button>
          </div>
        </div>
      )}

      {/* Her satır bir maddedir ve belgede numaralanır; numara artık burada da
          görünür, böylece "kaçıncı madde" sorusu PDF basmadan yanıtlanır. */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3">
        <div>
          <Label className="text-xs" htmlFor={`${fieldId}-payment`}>Ödeme Şartları</Label>
          <NumberedLinesTextarea
            id={`${fieldId}-payment`}
            className="mt-1.5 min-h-28"
            markerStyle={markerStyle}
            startIndex={paymentStart}
            value={value.paymentTerms}
            onChange={(event) => updateValue({ paymentTerms: event.target.value })}
            placeholder="Her satıra bir madde yazın..."
          />
        </div>
        <div>
          <Label className="text-xs" htmlFor={`${fieldId}-delivery`}>Teslimat Şartları</Label>
          <NumberedLinesTextarea
            id={`${fieldId}-delivery`}
            className="mt-1.5 min-h-28"
            markerStyle={markerStyle}
            startIndex={deliveryStart}
            value={value.deliveryTerms}
            onChange={(event) => updateValue({ deliveryTerms: event.target.value })}
            placeholder="Her satıra bir madde yazın..."
          />
        </div>
        <div>
          <Label className="text-xs" htmlFor={`${fieldId}-warranty`}>Garanti Şartları</Label>
          <NumberedLinesTextarea
            id={`${fieldId}-warranty`}
            className="mt-1.5 min-h-28"
            markerStyle={markerStyle}
            startIndex={warrantyStart}
            value={value.warrantyTerms}
            onChange={(event) => updateValue({ warrantyTerms: event.target.value })}
            placeholder="Her satıra bir madde yazın..."
          />
        </div>
      </div>
      <Dialog open={Boolean(templateDialogMode)} onOpenChange={(open) => !open && !templateBusy && setTemplateDialogMode(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{templateDialogMode === "delete" ? "Şablon silinsin mi?" : templateDialogMode === "update" ? "Şablonu güncelle" : "Yeni belge şartları şablonu"}</DialogTitle>
            <DialogDescription>
              {templateDialogMode === "delete"
                ? `“${selectedSavedTemplate?.title ?? "Seçili şablon"}” kayıtlı şablonlardan kaldırılacak; mevcut belge metni değişmeyecek.`
                : "Ödeme, teslimat ve garanti metinlerinin mevcut hali bu başlıkla kaydedilecek."}
            </DialogDescription>
          </DialogHeader>
          {templateDialogMode !== "delete" && (
            <div>
              <Label htmlFor={`${fieldId}-template-title`} className="text-xs">Şablon başlığı</Label>
              <Input id={`${fieldId}-template-title`} className="mt-1.5" value={templateTitle} onChange={(event) => setTemplateTitle(event.target.value)} autoFocus maxLength={120} />
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={templateBusy} onClick={() => setTemplateDialogMode(null)}>Vazgeç</Button>
            <Button type="button" variant={templateDialogMode === "delete" ? "destructive" : "default"} disabled={templateBusy || (templateDialogMode !== "delete" && !templateTitle.trim())} onClick={() => void submitTemplateAction()}>
              {templateBusy ? "İşleniyor…" : templateDialogMode === "delete" ? "Şablonu sil" : templateDialogMode === "update" ? "Güncelle" : "Şablonu kaydet"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
