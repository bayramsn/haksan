import { useMemo } from "react";
import { BookmarkPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../ui/select";
import { Textarea } from "../ui/textarea";
import type { NoteTemplate } from "../../lib/store";
import { QUOTE_NOTE_VARIANTS } from "../../lib/print";

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
  includeBuiltInVariants?: boolean;
  onBuiltInTemplateSelected?: (key: string) => void;
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
  includeBuiltInVariants = true,
  onBuiltInTemplateSelected,
}: Props) {
  const savedTemplates = useTermsTemplates(noteTemplates, templateScope);
  const selectedSavedTemplate = savedTemplates.find((template) => template.selectKey === selectedTemplateKey);

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

    const builtIn = QUOTE_NOTE_VARIANTS.find((variant) => variant.key === key);
    if (!builtIn) return;
    onBuiltInTemplateSelected?.(key);
    onChange({
      paymentTerms: builtIn.odeme.join("\n"),
      deliveryTerms: builtIn.teslimat.join("\n"),
      warrantyTerms: builtIn.garanti.join("\n"),
    });
  };

  const saveAsNewTemplate = async () => {
    if (!value.paymentTerms.trim() && !value.deliveryTerms.trim() && !value.warrantyTerms.trim()) {
      return toast.error("Önce belge şartı girin");
    }
    const titleInput = window.prompt("Yeni şablon başlığı:", selectedSavedTemplate ? `${selectedSavedTemplate.title} kopya` : "");
    if (!titleInput?.trim()) return;
    try {
      const created = await addNoteTemplate({
        title: titleInput.trim(),
        body: currentBody(),
        scope: templateScope,
      });
      onSelectedTemplateKeyChange(termsTemplateKey(created.id));
      toast.success("Belge şartları yeni şablon olarak kaydedildi");
    } catch (err: any) {
      toast.error("Şablon kaydedilemedi", { description: err?.message });
    }
  };

  const updateSelectedTemplate = async () => {
    if (!selectedSavedTemplate) return;
    const titleInput = window.prompt("Şablon başlığı:", selectedSavedTemplate.title);
    if (!titleInput?.trim()) return;
    try {
      await updateNoteTemplate(selectedSavedTemplate.id, {
        title: titleInput.trim(),
        body: currentBody(),
        scope: templateScope,
      });
      toast.success("Belge şartları şablonu güncellendi");
    } catch (err: any) {
      toast.error("Şablon güncellenemedi", { description: err?.message });
    }
  };

  const deleteSelectedTemplate = async () => {
    if (!selectedSavedTemplate) return;
    if (!window.confirm(`"${selectedSavedTemplate.title}" şablonu silinsin mi?`)) return;
    try {
      await deleteNoteTemplate(selectedSavedTemplate.id);
      onSelectedTemplateKeyChange("");
      toast.success("Belge şartları şablonu silindi");
    } catch (err: any) {
      toast.error("Şablon silinemedi", { description: err?.message });
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
              {includeBuiltInVariants && QUOTE_NOTE_VARIANTS.map((variant) => (
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3">
        <div>
          <Label className="text-xs">Ödeme Şartları</Label>
          <Textarea
            className="mt-1.5 min-h-28"
            value={value.paymentTerms}
            onChange={(event) => updateValue({ paymentTerms: event.target.value })}
            placeholder="Her satıra bir madde yazın..."
          />
        </div>
        <div>
          <Label className="text-xs">Teslimat Şartları</Label>
          <Textarea
            className="mt-1.5 min-h-28"
            value={value.deliveryTerms}
            onChange={(event) => updateValue({ deliveryTerms: event.target.value })}
            placeholder="Her satıra bir madde yazın..."
          />
        </div>
        <div>
          <Label className="text-xs">Garanti Şartları</Label>
          <Textarea
            className="mt-1.5 min-h-28"
            value={value.warrantyTerms}
            onChange={(event) => updateValue({ warrantyTerms: event.target.value })}
            placeholder="Her satıra bir madde yazın..."
          />
        </div>
      </div>
    </div>
  );
}
