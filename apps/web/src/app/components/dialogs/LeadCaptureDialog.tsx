import { useEffect, useState } from "react";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useStore } from "../../lib/store";
import { useAuth } from "../../../lib/auth";
import { lookupService, opportunityService } from "../../../lib/services";
import {
  LEAD_TEMPERATURE_HINTS,
  LEAD_TEMPERATURE_LABELS,
  LEAD_TEMPERATURE_ORDER,
  LEAD_TEMPERATURE_STYLES,
  type LeadTemperature,
} from "../../lib/mock";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";

/**
 * Firma bilgisi henüz kesinleşmemiş talebi, firma/kontak ana kayıtlarını kirletmeden
 * doğrudan lead aşamasında bir satış kartına dönüştürür.
 */
export function LeadCaptureDialog({ trigger }: { trigger?: React.ReactNode }) {
  const { refresh } = useStore();
  const { user, activeDivision } = useAuth();
  const divisions = user?.divisions ?? [];
  const defaultDivision = activeDivision && activeDivision !== "all"
    ? activeDivision
    : divisions.find((d) => d.isPrimary)?.id ?? divisions[0]?.id ?? "";

  const [open, setOpen] = useState(false);
  const [contactName, setContactName] = useState("");
  const [contactMethod, setContactMethod] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("");
  const [companyTitle, setCompanyTitle] = useState("");
  const [product, setProduct] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [temperature, setTemperature] = useState<LeadTemperature>("unknown");
  const [divisionId, setDivisionId] = useState(defaultDivision);
  const [saving, setSaving] = useState(false);
  const [contactMethods, setContactMethods] = useState<Array<{ code: string; name: string }>>([
    { code: "email", name: "Mail" },
    { code: "phone", name: "Telefon" },
    { code: "dealer", name: "Bayi" },
    { code: "digital_market", name: "Dijital Pazar" },
    { code: "fair", name: "Fuar" },
  ]);

  useEffect(() => {
    let active = true;
    lookupService
      .byName("contact-sources")
      .then((rows) => {
        if (!active) return;
        const normalized = (rows ?? [])
          .filter((row: any) => row?.code && row?.name && row?.isActive !== false)
          .map((row: any) => ({ code: String(row.code), name: String(row.name) }));
        if (normalized.length) setContactMethods(normalized);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const reset = () => {
    setContactName("");
    setContactMethod("");
    setPhone("");
    setEmail("");
    setCity("");
    setCompanyTitle("");
    setProduct("");
    setQuantity("1");
    setTemperature("unknown");
    setDivisionId(defaultDivision);
  };

  const qtyNum = Number(quantity) > 0 ? Math.floor(Number(quantity)) : 0;
  // Telefon ve e-posta birlikte zorunlu değil: biri girilince diğeri serbest kalır.
  const phoneFilled = phone.trim().length > 0;
  const emailFilled = email.trim().length > 0;
  const hasContactChannel = phoneFilled || emailFilled;
  const emailValid = !emailFilled || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const phoneValid = !phoneFilled || phone.replace(/\D/g, "").length >= 7;
  const canSubmit =
    contactName.trim().length > 0 &&
    product.trim().length > 0 &&
    city.trim().length > 0 &&
    hasContactChannel &&
    emailValid &&
    phoneValid &&
    (divisions.length === 0 || !!divisionId);

  const submit = async () => {
    if (!canSubmit) {
      toast.error("Eksik bilgi", {
        description: !hasContactChannel
          ? "Telefon veya e-postadan en az biri zorunludur."
          : !phoneValid
            ? "Telefon en az 7 rakam içermelidir."
            : !emailValid
              ? "Geçerli bir e-posta adresi girin."
              : "Kontak ismi, şehir ve istenen ürün zorunludur.",
      });
      return;
    }
    setSaving(true);
    try {
      const divisionArg = divisionId || undefined;
      const title = qtyNum > 0 ? `${product.trim()} (${qtyNum} adet)` : product.trim();
      await opportunityService.create({
        leadContactName: contactName.trim(),
        leadCompanyTitle: companyTitle.trim() || undefined,
        // Eski kayıtlarla uyum için birincil irtibat tek alanda da tutulur.
        leadContactValue: (phone.trim() || email.trim()) || undefined,
        leadPhone: phone.trim() || undefined,
        leadEmail: email.trim() || undefined,
        leadCity: city.trim(),
        leadTemperature: temperature,
        sourceCode: contactMethod || undefined,
        title,
        description: [
          `İstenen ürün: ${product.trim()}`,
          qtyNum > 0 ? `Adet: ${qtyNum}` : null,
          `Şehir: ${city.trim()}`,
          "Kaynak: Hızlı lead",
        ].filter(Boolean).join("\n"),
        divisionId: divisionArg,
        currencyCode: "USD",
      } as any);

      await refresh();
      toast.success("Lead satış kartı oluşturuldu", { description: `${contactName.trim()} · ${title}` });
      reset();
      setOpen(false);
    } catch (error: unknown) {
      toast.error("Lead oluşturulamadı", {
        description: error instanceof Error ? error.message : "İstek başarısız oldu.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (next) setDivisionId(defaultDivision); }}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" className="h-9 gap-1.5">
            <UserPlus className="size-4" /> Hızlı Lead
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="w-[min(560px,calc(100vw-2rem))]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="size-5 text-primary" /> Hızlı Lead
          </DialogTitle>
          <DialogDescription>
            Talebi lead olarak kaydedin. Bu adımda firma veya kontak ana kaydı oluşturulmaz; teklif hazırlarken firma bağlanır.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div>
            <Label htmlFor="lead-contact">Kontak ismi *</Label>
            <Input
              id="lead-contact"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="Ahmet Yılmaz"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="lead-phone">
                Telefon {phoneFilled || !emailFilled ? <span className="text-destructive">*</span> : <span className="font-normal text-muted-foreground">(opsiyonel)</span>}
              </Label>
              <Input
                id="lead-phone"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="05xx xxx xx xx"
                aria-invalid={!phoneValid}
              />
            </div>
            <div>
              <Label htmlFor="lead-email">
                E-posta {emailFilled || !phoneFilled ? <span className="text-destructive">*</span> : <span className="font-normal text-muted-foreground">(opsiyonel)</span>}
              </Label>
              <Input
                id="lead-email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ornek@firma.com"
                aria-invalid={!emailValid}
              />
            </div>
          </div>
          <p className={`-mt-1.5 text-[11px] ${hasContactChannel ? "text-muted-foreground" : "text-warning"}`}>
            Telefon veya e-postadan en az biri zorunludur; birini yazınca diğeri opsiyonel olur.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="lead-city">Şehir *</Label>
              <Input
                id="lead-city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="İstanbul"
              />
            </div>
            <div>
              <Label>İrtibat şekli <span className="font-normal text-muted-foreground">(opsiyonel)</span></Label>
              <Select
                value={contactMethod || "__none__"}
                onValueChange={(value) => setContactMethod(value === "__none__" ? "" : value)}
              >
                <SelectTrigger><SelectValue placeholder="Seçim zorunlu değil" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Seçilmedi</SelectItem>
                  {contactMethods.map((method) => (
                    <SelectItem key={method.code} value={method.code}>{method.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="lead-company">Firma ünvanı <span className="font-normal text-muted-foreground">(opsiyonel)</span></Label>
            <Input
              id="lead-company"
              value={companyTitle}
              onChange={(e) => setCompanyTitle(e.target.value)}
              placeholder="Biliniyorsa yazın"
            />
          </div>
          <div>
            <Label>Alım niyeti</Label>
            <div className="mt-1 grid grid-cols-4 gap-1.5">
              {LEAD_TEMPERATURE_ORDER.map((code) => {
                const active = temperature === code;
                const style = LEAD_TEMPERATURE_STYLES[code];
                return (
                  <button
                    key={code}
                    type="button"
                    aria-pressed={active}
                    title={LEAD_TEMPERATURE_HINTS[code]}
                    className={`flex h-9 items-center justify-center gap-1.5 rounded-md border text-xs font-medium transition-colors ${
                      active ? `${style.badge} border-transparent` : "border-border bg-background text-muted-foreground hover:bg-muted"
                    }`}
                    onClick={() => setTemperature(code)}
                  >
                    <span className={`size-1.5 rounded-full ${active ? style.dot : "bg-muted-foreground/40"}`} />
                    {LEAD_TEMPERATURE_LABELS[code]}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid grid-cols-[1fr_96px] gap-3">
            <div>
              <Label htmlFor="lead-product">İstenen ürün *</Label>
              <Input id="lead-product" value={product} onChange={(e) => setProduct(e.target.value)} placeholder="İşleme Merkezi" />
            </div>
            <div>
              <Label htmlFor="lead-qty">Adet</Label>
              <Input id="lead-qty" inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="1" />
            </div>
          </div>
          {divisions.length > 1 && (
            <div>
              <Label>Bölüm</Label>
              <Select value={divisionId} onValueChange={setDivisionId}>
                <SelectTrigger><SelectValue placeholder="Bölüm seçin" /></SelectTrigger>
                <SelectContent>
                  {divisions.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>Vazgeç</Button>
          <Button type="button" onClick={() => void submit()} disabled={saving || !canSubmit}>
            {saving ? "Oluşturuluyor…" : "Lead Kartı Oluştur"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
