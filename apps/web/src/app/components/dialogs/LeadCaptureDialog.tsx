import { useEffect, useMemo, useState } from "react";
import { Building2, CalendarClock, UserPlus } from "lucide-react";
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
import { Combobox } from "../ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Textarea } from "../ui/textarea";

/**
 * Firma bilgisi henüz kesinleşmemiş talebi, firma/kontak ana kayıtlarını kirletmeden
 * doğrudan lead aşamasında bir satış kartına dönüştürür.
 */
export function LeadCaptureDialog({ trigger }: { trigger?: React.ReactNode }) {
  const { refresh, customers, contacts } = useStore();
  const { user, activeDivision } = useAuth();
  const divisions = user?.divisions ?? [];
  const defaultDivision = activeDivision && activeDivision !== "all"
    ? activeDivision
    : divisions.find((d) => d.isPrimary)?.id ?? divisions[0]?.id ?? "";

  const [open, setOpen] = useState(false);
  // Kayıtlı firma/kontak seçildiyse dolu; elle yazıldığında boş kalır ve talep
  // eskisi gibi firma ana kaydı açmadan lead alanlarına yazılır.
  const [companyId, setCompanyId] = useState("");
  const [contactId, setContactId] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactMethod, setContactMethod] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("");
  const [companyTitle, setCompanyTitle] = useState("");
  const [product, setProduct] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [temperature, setTemperature] = useState<LeadTemperature>("unknown");
  const [nextAction, setNextAction] = useState("");
  const [nextActionAt, setNextActionAt] = useState("");
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

  const companyOptions = useMemo(
    () =>
      customers
        .filter((customer) => customer.status !== "passive")
        .map((customer) => ({
          value: customer.id,
          label: customer.name,
          hint: [customer.city, customer.sector].filter(Boolean).join(" · "),
        }))
        .sort((a, b) => a.label.localeCompare(b.label, "tr-TR")),
    [customers]
  );

  // Kontak listesi yalnız seçili firmaya daralır; firma seçilmediyse elle giriş kalır.
  const contactOptions = useMemo(() => {
    if (!companyId) return [];
    return contacts
      .filter((contact) => contact.customerId === companyId || contact.companyIds?.includes(companyId))
      .map((contact) => ({
        value: contact.id,
        label: contact.name,
        hint: [contact.title, contact.department].filter(Boolean).join(" · "),
      }))
      .sort((a, b) => a.label.localeCompare(b.label, "tr-TR"));
  }, [contacts, companyId]);

  /** Kayıtlı firma seçildiğinde boş alanları firma kaydından doldurur. */
  const pickCompany = (id: string) => {
    const customer = customers.find((item) => item.id === id);
    if (!customer) return;
    setCompanyId(id);
    setCompanyTitle(customer.name);
    setContactId("");
    if (!city.trim() && customer.city) setCity(customer.city);
    if (!phone.trim() && customer.phone) setPhone(customer.phone);
    if (!email.trim() && customer.email) setEmail(customer.email);
    if (!contactName.trim() && customer.contactPerson) setContactName(customer.contactPerson);
  };

  /** Kayıtlı kontak seçildiğinde iletişim alanlarını kontaktan doldurur. */
  const pickContact = (id: string) => {
    const contact = contacts.find((item) => item.id === id);
    if (!contact) return;
    setContactId(id);
    setContactName(contact.name);
    if (contact.mobilePhone || contact.phone) setPhone(contact.mobilePhone || contact.phone);
    if (contact.email) setEmail(contact.email);
  };

  const reset = () => {
    setCompanyId("");
    setContactId("");
    setContactName("");
    setContactMethod("");
    setPhone("");
    setEmail("");
    setCity("");
    setCompanyTitle("");
    setProduct("");
    setQuantity("1");
    setTemperature("unknown");
    setNextAction("");
    setNextActionAt("");
    setDivisionId(defaultDivision);
  };

  const qtyNum = Number(quantity) > 0 ? Math.floor(Number(quantity)) : 0;
  // Telefon ve e-posta birlikte zorunlu değil: biri girilince diğeri serbest kalır.
  const phoneFilled = phone.trim().length > 0;
  const emailFilled = email.trim().length > 0;
  const hasContactChannel = phoneFilled || emailFilled;
  const emailValid = !emailFilled || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const phoneValid = !phoneFilled || phone.replace(/\D/g, "").length >= 7;
  const actionPlanValid = !nextActionAt || nextAction.trim().length > 0;
  // Kayıtlı firma bağlandıysa kontak ismi zorunlu değildir; aksi halde kartın
  // kime ait olduğu belirsiz kalmasın diye istenir.
  const partyIdentified = contactName.trim().length > 0 || companyId.length > 0;
  const canSubmit =
    partyIdentified &&
    product.trim().length > 0 &&
    city.trim().length > 0 &&
    hasContactChannel &&
    emailValid &&
    phoneValid &&
    actionPlanValid &&
    (divisions.length === 0 || !!divisionId);

  const submit = async () => {
    if (!canSubmit) {
      toast.error("Eksik bilgi", {
        description: !hasContactChannel
          ? "Telefon veya e-postadan en az biri zorunludur."
          : !phoneValid
            ? "Telefon en az 7 rakam içermelidir."
            : !actionPlanValid
              ? "Takip zamanı seçtiyseniz ilk takip aksiyonunu da yazın."
            : !emailValid
              ? "Geçerli bir e-posta adresi girin."
              : !partyIdentified
                ? "Kayıtlı bir firma seçin ya da kontak ismini yazın."
                : "Şehir ve istenen ürün zorunludur.",
      });
      return;
    }
    setSaving(true);
    try {
      const divisionArg = divisionId || undefined;
      const title = qtyNum > 0 ? `${product.trim()} (${qtyNum} adet)` : product.trim();
      await opportunityService.create({
        // Kayıtlı seçim varsa gerçek ilişki kurulur; yoksa lead alanlarında kalır.
        companyId: companyId || undefined,
        primaryContactId: companyId && contactId ? contactId : undefined,
        leadContactName: contactName.trim() || undefined,
        leadCompanyTitle: companyTitle.trim() || undefined,
        // Eski kayıtlarla uyum için birincil irtibat tek alanda da tutulur.
        leadContactValue: (phone.trim() || email.trim()) || undefined,
        leadPhone: phone.trim() || undefined,
        leadEmail: email.trim() || undefined,
        leadCity: city.trim(),
        leadTemperature: temperature,
        leadFollowUpStatus: "new",
        nextAction: nextAction.trim() || undefined,
        nextActionAt: nextActionAt ? new Date(nextActionAt) : undefined,
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
      toast.success("Lead satış kartı oluşturuldu", {
        description: `${companyTitle.trim() || contactName.trim()} · ${title}`,
      });
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
            <Label className="inline-flex items-center gap-1.5">
              <Building2 className="size-3.5" /> Firma{" "}
              <span className="font-normal text-muted-foreground">(kayıtlıysa seçin, değilse yazın)</span>
            </Label>
            <Combobox
              className="mt-1.5"
              options={companyOptions}
              value={companyId}
              onChange={pickCompany}
              placeholder={companyTitle || "Kayıtlı firmadan seçin veya yazın"}
              searchPlaceholder="Firma ara…"
              emptyText="Kayıtlı firma bulunamadı"
              onCreate={(label) => {
                // Kayıt yoksa firma ana kaydı açılmaz; ünvan lead alanında kalır.
                setCompanyId("");
                setContactId("");
                setCompanyTitle(label);
              }}
              createLabel={(query) => `"${query}" firmasını lead olarak yaz`}
            />
            {companyId ? (
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Kayıtlı firma bağlandı; kart doğrudan C aşamasına hazır açılır.
              </p>
            ) : companyTitle.trim() ? (
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Elle giriş: “{companyTitle.trim()}” yalnız lead alanına yazılır, firma kaydı oluşturulmaz.
              </p>
            ) : null}
          </div>
          <div>
            <Label htmlFor="lead-contact">
              Kontak ismi {companyId ? <span className="font-normal text-muted-foreground">(opsiyonel)</span> : "*"}
            </Label>
            {contactOptions.length > 0 ? (
              <Combobox
                className="mt-1.5"
                options={contactOptions}
                value={contactId}
                onChange={pickContact}
                placeholder={contactName || "Firmanın kontağını seçin veya yazın"}
                searchPlaceholder="Kontak ara…"
                emptyText="Bu firmada kayıtlı kontak yok"
                onCreate={(label) => {
                  setContactId("");
                  setContactName(label);
                }}
                createLabel={(query) => `"${query}" kişisini lead olarak yaz`}
              />
            ) : (
              <Input
                id="lead-contact"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="Ahmet Yılmaz"
                autoFocus
              />
            )}
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
          <div className="rounded-lg border border-primary/15 bg-blue-50/55 p-3">
            <div className="grid gap-3 sm:grid-cols-[1fr_190px]">
              <div>
                <Label htmlFor="lead-next-action">İlk takip aksiyonu</Label>
                <Textarea
                  id="lead-next-action"
                  className="mt-1.5 min-h-16 bg-white"
                  maxLength={1000}
                  value={nextAction}
                  onChange={(event) => setNextAction(event.target.value)}
                  placeholder="Örn. Teknik ihtiyaç için satın alma müdürünü ara"
                />
              </div>
              <div>
                <Label htmlFor="lead-next-action-at" className="inline-flex items-center gap-1.5">
                  <CalendarClock className="size-3.5" /> Takip zamanı
                </Label>
                <Input
                  id="lead-next-action-at"
                  className="mt-1.5 bg-white"
                  type="datetime-local"
                  value={nextActionAt}
                  onChange={(event) => setNextActionAt(event.target.value)}
                />
                <p className="mt-1.5 text-[10px] leading-4 text-muted-foreground">
                  Kart, zamanı gelince aksiyon listesinde öne çıkar.
                </p>
              </div>
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
