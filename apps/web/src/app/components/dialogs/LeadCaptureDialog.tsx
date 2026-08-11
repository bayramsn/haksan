import { useEffect, useMemo, useState } from "react";
import { Building2, CalendarClock, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useStore } from "../../lib/store";
import { useAuth } from "../../../lib/auth";
import { lookupService, opportunityService } from "../../../lib/services";
import { districtsForCountry, provincesForCountry } from "../../lib/geoByCountry";
import { Button } from "../ui/button";
import { Combobox } from "../ui/combobox";
import { RemoteCompanyCombobox } from "../shared/RemoteCompanyCombobox";
import { RemoteContactCombobox, useRemoteContactDetail } from "../shared/RemoteContactCombobox";
import { useCompanyDetail } from "../../lib/companyServerData";
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
  const { refresh } = useStore();
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
  const [district, setDistrict] = useState("");
  const [companyTitle, setCompanyTitle] = useState("");
  const [product, setProduct] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [nextAction, setNextAction] = useState("");
  const [nextActionAt, setNextActionAt] = useState("");
  const [divisionId, setDivisionId] = useState(defaultDivision);
  const [ownerUserId, setOwnerUserId] = useState("");
  const [ownerCandidates, setOwnerCandidates] = useState<Array<{ id: string; name: string; divisionIds: string[] }>>([]);
  const [saving, setSaving] = useState(false);
  const [contactMethods, setContactMethods] = useState<Array<{ code: string; name: string }>>([
    { code: "email", name: "Mail" },
    { code: "phone", name: "Telefon" },
    { code: "dealer", name: "Bayi" },
    { code: "digital_market", name: "Dijital Pazar" },
    { code: "fair", name: "Fuar" },
  ]);
  const selectedCompanyQuery = useCompanyDetail(companyId);
  const selectedContactQuery = useRemoteContactDetail(contactId);

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

  useEffect(() => {
    let active = true;
    opportunityService
      .assignees()
      .then((rows) => {
        if (active) setOwnerCandidates(rows);
      })
      .catch(() => {
        if (active) setOwnerCandidates([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const assignableUsers = useMemo(() => {
    const canAssignOthers = user?.roles?.some((role) => role === "super_admin" || role === "sales") ?? false;
    return ownerCandidates
      .filter((item) => canAssignOthers || item.id === user?.id)
      .filter((item) => !divisionId || item.divisionIds?.length === 0 || item.divisionIds?.includes(divisionId))
      .sort((a, b) => a.name.localeCompare(b.name, "tr-TR"));
  }, [divisionId, ownerCandidates, user?.id, user?.roles]);

  // Hızlı lead yurt içi taleple açılır; il/ilçe önerileri Türkiye listesinden
  // gelir. Listede olmayan bir yer yine serbest metin olarak yazılabilir.
  const provinceOptions = useMemo(
    () => provincesForCountry("Türkiye").map((name) => ({ value: name, label: name })),
    [],
  );
  const districtOptions = useMemo(
    () => districtsForCountry("Türkiye", city).map((name) => ({ value: name, label: name })),
    [city],
  );

  /** Kayıtlı firma seçildiğinde kimliği ayarla; alanlar tam detay yanıtından dolar. */
  const pickCompany = (id: string) => {
    setCompanyId(id);
    setCompanyTitle("");
    setContactId("");
  };

  useEffect(() => {
    const company = selectedCompanyQuery.data;
    if (!companyId || !company || company.id !== companyId) return;
    setCompanyTitle(company.name);
    setCity((current) => current.trim() ? current : company.city || "");
    setDistrict((current) => current.trim() ? current : company.district || "");
    setPhone((current) => current.trim() ? current : company.phone || "");
    setEmail((current) => current.trim() ? current : company.email || "");
  }, [companyId, selectedCompanyQuery.data]);

  useEffect(() => {
    const contact = selectedContactQuery.data;
    if (!contactId || !contact || contact.id !== contactId) return;
    setContactName(contact.name);
    setPhone(contact.mobilePhone || contact.phone || contact.otherPhone || "");
    setEmail(contact.email || contact.personalEmail || contact.otherEmail || "");
  }, [contactId, selectedContactQuery.data]);

  const reset = () => {
    setCompanyId("");
    setContactId("");
    setContactName("");
    setContactMethod("");
    setPhone("");
    setEmail("");
    setCity("");
    setDistrict("");
    setCompanyTitle("");
    setProduct("");
    setQuantity("1");
    setNextAction("");
    setNextActionAt("");
    setDivisionId(defaultDivision);
    setOwnerUserId("");
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
                : "İl ve istenen ürün zorunludur.",
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
        leadDistrict: district.trim() || undefined,
        leadFollowUpStatus: "new",
        nextAction: nextAction.trim() || undefined,
        nextActionAt: nextActionAt ? new Date(nextActionAt) : undefined,
        sourceCode: contactMethod || undefined,
        title,
        description: [
          `İstenen ürün: ${product.trim()}`,
          qtyNum > 0 ? `Adet: ${qtyNum}` : null,
          `Şehir: ${[city.trim(), district.trim()].filter(Boolean).join(" / ")}`,
          "Kaynak: Hızlı lead",
        ].filter(Boolean).join("\n"),
        divisionId: divisionArg,
        ownerUserId: ownerUserId || undefined,
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
            <RemoteCompanyCombobox
              className="mt-1.5"
              value={companyId}
              onValueChange={pickCompany}
              placeholder={companyTitle || "Kayıtlı firmadan seçin veya yazın"}
              searchPlaceholder="Firma ara…"
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
            {companyId && (
              <RemoteContactCombobox
                className="mt-1.5"
                companyId={companyId}
                value={contactId}
                onValueChange={setContactId}
                placeholder="Firmanın kontağını seçin"
                searchPlaceholder="Kontak ara…"
                noneLabel="Elle girilen ismi kullan"
              />
            )}
            <Input
              id="lead-contact"
              className={companyId ? "mt-2" : "mt-1.5"}
              value={contactName}
              onChange={(event) => {
                setContactName(event.target.value);
                if (contactId) setContactId("");
              }}
              placeholder={companyId ? "Veya kontak ismini elle yazın" : "Ahmet Yılmaz"}
              autoFocus={!companyId}
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
              <Label>İl *</Label>
              <Combobox
                ariaLabel="İl"
                className="mt-1.5"
                options={provinceOptions}
                value={city}
                onChange={(value) => {
                  setCity(value);
                  // İl değişince eski ilçe geçersiz kalır.
                  setDistrict("");
                }}
                placeholder="İl seçin veya yazın"
                searchPlaceholder="İl ara…"
                emptyText="İl bulunamadı"
                onCreate={(label) => {
                  setCity(label);
                  setDistrict("");
                }}
                createLabel={(query) => `"${query}" ilini kullan`}
              />
            </div>
            <div>
              <Label>İlçe <span className="font-normal text-muted-foreground">(opsiyonel)</span></Label>
              <Combobox
                ariaLabel="İlçe"
                className="mt-1.5"
                options={districtOptions}
                value={district}
                onChange={setDistrict}
                placeholder={city ? "İlçe seçin veya yazın" : "Önce il seçin"}
                searchPlaceholder="İlçe ara…"
                emptyText="İlçe bulunamadı"
                onCreate={setDistrict}
                createLabel={(query) => `"${query}" ilçesini kullan`}
              />
            </div>
          </div>
          <div>
            <Label>İrtibat şekli <span className="font-normal text-muted-foreground">(opsiyonel)</span></Label>
            <Select
              value={contactMethod || "__none__"}
              onValueChange={(value) => setContactMethod(value === "__none__" ? "" : value)}
            >
              <SelectTrigger className="mt-1.5"><SelectValue placeholder="Seçim zorunlu değil" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Seçilmedi</SelectItem>
                {contactMethods.map((method) => (
                  <SelectItem key={method.code} value={method.code}>{method.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
          <div>
            <Label>Sorumlu <span className="font-normal text-muted-foreground">(opsiyonel)</span></Label>
            <Select
              value={ownerUserId || "__auto__"}
              onValueChange={(value) => setOwnerUserId(value === "__auto__" ? "" : value)}
            >
              <SelectTrigger className="mt-1.5"><SelectValue placeholder="Sorumlu seçin" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__auto__">Atama kuralına bırak</SelectItem>
                {assignableUsers.map((item) => (
                  <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Seçim yapmazsanız mevcut lead atama kuralları uygulanır; uygun kural yoksa kayıt sahipsiz açılır.
            </p>
          </div>
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
