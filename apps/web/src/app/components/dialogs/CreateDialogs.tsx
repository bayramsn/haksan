import { useEffect, useRef, useState, useMemo } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { Combobox, type ComboboxOption } from "../ui/combobox";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from "../ui/select";
import { MultiSelect } from "../ui/multi-select";
import { Checkbox } from "../ui/checkbox";
import { useStore } from "../../lib/store";
import { usePersistentState } from "../../lib/persist";
import { SALES_STAGES, salesStageLabel, SHIPMENT_STATUSES, DELIVERY_STATUSES, type ShipmentStatus, type DeliveryStatus, type Delivery, type Customer, type Contact, type Machine, type Product, type ProductSpec, type ServiceTicketType, type StockItem } from "../../lib/mock";

const SERVICE_TICKET_TYPE_OPTIONS: { value: ServiceTicketType; label: string }[] = [
  { value: "complaint", label: "Şikayet" },
  { value: "request", label: "Talep" },
  { value: "warranty_claim", label: "Garanti" },
  { value: "question", label: "Soru / Bilgi" },
];
const NO_SERVICE_MACHINE = "__no_service_machine__";
const contactCompanyIds = (contact: Contact) =>
  Array.from(new Set([contact.customerId, ...(contact.companyIds ?? [])].filter(Boolean)));
const contactBelongsToCustomer = (contact: Contact, customerId: string) =>
  Boolean(customerId && contactCompanyIds(contact).includes(customerId));
const machineCustomerId = (machine?: Machine | null) =>
  machine?.customerId || machine?.userCompanyId || "";
const preferredServiceContact = (items: Contact[], customerId: string) => {
  const matches = items.filter((contact) => contactBelongsToCustomer(contact, customerId));
  return matches.find((contact) => contact.isPrimary && contact.customerId === customerId) ??
    matches.find((contact) => contact.customerId === customerId) ??
    matches.find((contact) => contact.isPrimary) ??
    matches[0];
};
import { toast } from "sonner";
import {
  Building2, User as UserIcon, Wallet, Truck, ClipboardCheck, ChevronDown, Receipt, Upload,
  ClipboardList, Plus, Trash2, X, Loader2, Package, UserRound, Wrench, Check,
} from "lucide-react";
import { serviceService, fileService, financeService, activityService, inventoryService, contactService, productService, lookupService } from "../../../lib/services";
import { Badge } from "../ui/badge";
import { useAuth } from "../../../lib/auth";
import {
  INSTALLATION_LOCATION_LABELS,
  type InstallationLocationType,
  COMPANY_SECTOR_OPTIONS,
  COUNTRY_OPTIONS,
  TAX_OFFICE_OPTIONS,
  ACTIVITY_TYPE_OPTIONS,
  STOCK_CATEGORY_CODES,
  STOCK_CATEGORY_LABELS,
  type StockCategoryCode,
  type AllowedFileExtension,
  type AllowedMimeType,
} from "@haksan/shared";
import { provincesForCountry, districtsForCountry } from "../../lib/geoByCountry";
import {
  allCatalogProductSpecs,
  groupProductSpecsForType,
  normalizeProductSpecKey,
  productSpecDefaults,
  specsForProductTypeStrict,
} from "../../lib/productSpecTemplates";
import { QuoteDialog } from "./QuoteDialog";
import { ProductSpecsTable } from "../shared/ProductSpecsTable";
import { OsmCompanySearch } from "../company/OsmCompanySearch";
import { relatedDeliveryFormNo, resolveServiceFormNo } from "../../lib/serviceFormNo";

/* ---------- Customer ---------- */
const COMPANY_GROUP_OPTIONS = [
  { code: "cnc", label: "CNC" },
  { code: "universal", label: "Üniversal" },
  { code: "sac_isleme", label: "Sac İşleme" },
];

const toComboboxOptions = (values: readonly string[]) =>
  values.map((v) => ({ value: v, label: v }));

function LookupCombobox({
  label,
  options,
  value,
  onChange,
  placeholder,
  allowCustom = true,
  className = "",
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  allowCustom?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label className="text-xs">{label}</Label>
      <div className="mt-1.5">
        <Combobox
          options={options}
          value={value}
          onChange={onChange}
          placeholder={placeholder ?? "Seçin..."}
          searchPlaceholder="Ara..."
          emptyText="Sonuç yok."
          onCreate={allowCustom ? (v) => onChange(v) : undefined}
          createLabel={(q) => `"${q}" kullan`}
        />
      </div>
    </div>
  );
}

/**
 * Kayıtlı kayda (id) bağlanabilen VEYA serbest metin girilebilen combobox.
 * - Listeden seçim → onPick(id); id set edilir, serbest metin temizlenir.
 * - Listede olmayan bir değer yazıp "kullan" → onFreeText(text); id temizlenir.
 * Serbest metin, seçili görünmesi için options'a geçici bir kayıt olarak eklenir.
 */
const FREE_TEXT_PREFIX = "__free__:";
function FreeTextCombobox({
  idValue,
  textValue,
  options,
  onPick,
  onFreeText,
  placeholder,
}: {
  idValue: string;
  textValue: string;
  options: ComboboxOption[];
  onPick: (id: string) => void;
  onFreeText: (text: string) => void;
  placeholder?: string;
}) {
  const mergedOptions = useMemo<ComboboxOption[]>(
    () => (!idValue && textValue ? [{ value: FREE_TEXT_PREFIX + textValue, label: textValue }, ...options] : options),
    [idValue, textValue, options],
  );
  const value = idValue || (textValue ? FREE_TEXT_PREFIX + textValue : "");
  return (
    <Combobox
      options={mergedOptions}
      value={value}
      onChange={(v) => {
        if (v.startsWith(FREE_TEXT_PREFIX)) return;
        onPick(v);
      }}
      onCreate={(label) => onFreeText(label)}
      placeholder={placeholder ?? "Seçin veya yazın..."}
      searchPlaceholder="Ara veya yaz..."
      emptyText="Sonuç yok — yazıp ekleyebilirsiniz."
      createLabel={(q) => `"${q}" kullan`}
    />
  );
}

const CONTACT_SOURCE_OPTIONS = [
  { code: "email", label: "Mail" },
  { code: "phone", label: "Telefon" },
  { code: "dealer", label: "Bayi" },
  { code: "digital_market", label: "Dijital Pazar" },
  { code: "fair", label: "Fuar" },
  { code: "musiad", label: "MÜSİAD" },
];

type LookupRow = { id?: string; code: string; name: string; province?: string; sortOrder?: number; isActive?: boolean };

function useLookupRows(name: string, fallback: LookupRow[] = []) {
  const [rows, setRows] = useState<LookupRow[]>(fallback);
  useEffect(() => {
    let alive = true;
    lookupService
      .byName(name)
      .then((items) => {
        if (!alive) return;
        const normalized = (items ?? [])
          .map((item: any) => ({ id: item.id, code: item.code, name: item.name, province: item.province, sortOrder: item.sortOrder, isActive: item.isActive }))
          .filter((item: LookupRow) => item.code && item.name);
        setRows(normalized.length ? normalized : fallback);
      })
      .catch(() => alive && setRows(fallback));
    return () => {
      alive = false;
    };
  }, [name]);
  return rows;
}

function useTaxOfficeRows(city: string) {
  const fallback = useMemo<LookupRow[]>(
    () =>
      TAX_OFFICE_OPTIONS
        .filter((name) => !city || name.toLocaleLowerCase("tr-TR").includes(city.toLocaleLowerCase("tr-TR")))
        .map((name, index) => ({ code: name, name, province: city, sortOrder: index })),
    [city],
  );
  const [rows, setRows] = useState<LookupRow[]>(fallback);
  useEffect(() => {
    let alive = true;
    lookupService
      .taxOffices(city || undefined)
      .then((items) => {
        if (!alive) return;
        const normalized = (items ?? [])
          .map((item: any) => ({ id: item.id, code: item.code, name: item.name, province: item.province, sortOrder: item.sortOrder, isActive: item.isActive }))
          .filter((item: LookupRow) => item.code && item.name);
        setRows(normalized.length ? normalized : fallback);
      })
      .catch(() => alive && setRows(fallback));
    return () => {
      alive = false;
    };
  }, [city, fallback]);
  return rows;
}

const lookupCodeOptions = (rows: LookupRow[]) => rows.map((row) => ({ code: row.code, label: row.name }));
const lookupNameOptions = (rows: LookupRow[]) => rows.map((row) => ({ value: row.name, label: row.name }));

const emptyCompanyForm = () => ({
  name: "",
  sector: "",
  phone: "",
  phone2: "",
  fax: "",
  email: "",
  email2: "",
  address: "",
  latitude: "",
  longitude: "",
  osmDisplayName: "",
  district: "",
  city: "",
  country: "Türkiye",
  taxOffice: "",
  taxNumber: "",
  website: "",
  initialNote: "",
  companyGroupCode: "cnc",
  contactSourceCode: "email",
});

export function CreateCustomerDialog({ trigger, onCreated }: { trigger: React.ReactNode; onCreated?: (id: string) => void }) {
  const { addCustomer } = useStore();
  const [open, setOpen] = useState(false);
  // Taslaklar yenilemede korunur; başarılı kayıtta temizlenir.
  const [type, setType] = usePersistentState<"company" | "person">("draft.customer.type", "company");
  const [firmType, setFirmType] = usePersistentState<"customer" | "supplier_customer" | "supplier">("draft.customer.firmType", "customer");
  const [salesStatus, setSalesStatus] = usePersistentState<"potential" | "active_customer">("draft.customer.salesStatus", "potential");
  const [form, setForm] = usePersistentState("draft.customer.form", emptyCompanyForm());

  const provinceOptions = useMemo(() => toComboboxOptions(provincesForCountry(form.country)), [form.country]);
  const districtOptions = useMemo(
    () => toComboboxOptions(districtsForCountry(form.country, form.city)),
    [form.country, form.city],
  );
  const companyGroupRows = useLookupRows("company-groups", COMPANY_GROUP_OPTIONS.map((g) => ({ code: g.code, name: g.label })));
  const contactSourceRows = useLookupRows("contact-sources", CONTACT_SOURCE_OPTIONS.map((s) => ({ code: s.code, name: s.label })));
  const sectorRows = useLookupRows("company-sectors", COMPANY_SECTOR_OPTIONS.map((name, index) => ({ code: name, name, sortOrder: index })));
  const taxOfficeRows = useTaxOfficeRows(form.city);

  const reset = () => {
    setForm(emptyCompanyForm());
    setType("company");
    setFirmType("customer");
    setSalesStatus("potential");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Firma ünvanı zorunludur");
      return;
    }
    try {
      const { latitude: latitudeRaw, longitude: longitudeRaw, ...companyForm } = form;
      const latitude = latitudeRaw ? Number(latitudeRaw) : undefined;
      const longitude = longitudeRaw ? Number(longitudeRaw) : undefined;
      const c = await addCustomer({
        ...companyForm,
        type,
        firmType,
        salesStatus: firmType === "supplier" ? undefined : salesStatus,
        latitude: Number.isFinite(latitude) ? latitude : undefined,
        longitude: Number.isFinite(longitude) ? longitude : undefined,
        contactPerson: "",
        wantedProduct: "",
        source: contactSourceRows.find((s) => s.code === form.contactSourceCode)?.name ?? "",
        companyGroupName: companyGroupRows.find((g) => g.code === form.companyGroupCode)?.name ?? "",
      });
      toast.success("Firma oluşturuldu", { description: c.name });
      reset();
      setOpen(false);
      onCreated?.(c.id);
    } catch (err: any) {
      toast.error("Firma oluşturulamadı", { description: err?.message ?? "API isteği başarısız oldu." });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Yeni Firma</DialogTitle>
          <DialogDescription>Kurumsal veya bireysel firma kaydı oluşturun.</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setType("company")}
              className={`flex-1 px-3 py-2.5 rounded-lg border text-sm flex items-center gap-2 ${type === "company" ? "border-primary bg-primary/5 text-primary" : "border-border"}`}
            >
              <Building2 className="size-4" /> Kurumsal
            </button>
            <button
              type="button"
              onClick={() => setType("person")}
              className={`flex-1 px-3 py-2.5 rounded-lg border text-sm flex items-center gap-2 ${type === "person" ? "border-primary bg-primary/5 text-primary" : "border-border"}`}
            >
              <UserIcon className="size-4" /> Bireysel
            </button>
          </div>

          <div>
            <Label className="text-xs">Firma Tipi *</Label>
            <div className="grid grid-cols-3 gap-2 mt-1.5">
              {([
                { k: "customer", l: "Müşteri" },
                { k: "supplier", l: "Tedarikçi" },
                { k: "supplier_customer", l: "Müşteri + Tedarikçi" },
              ] as const).map((opt) => (
                <button
                  key={opt.k}
                  type="button"
                  onClick={() => setFirmType(opt.k)}
                  className={`px-3 py-2 rounded-lg border text-xs ${firmType === opt.k ? "border-primary bg-primary/5 text-primary" : "border-border"}`}
                >
                  {opt.l}
                </button>
              ))}
            </div>
          </div>

          {firmType !== "supplier" && (
            <div>
              <Label className="text-xs">Müşteri Statüsü</Label>
              <div className="grid grid-cols-2 gap-2 mt-1.5">
                {([
                  { k: "active_customer", l: "Cari" },
                  { k: "potential", l: "Potansiyel" },
                ] as const).map((opt) => (
                  <button
                    key={opt.k}
                    type="button"
                    onClick={() => setSalesStatus(opt.k)}
                    className={`px-3 py-2 rounded-lg border text-xs ${salesStatus === opt.k ? "border-primary bg-primary/5 text-primary" : "border-border"}`}
                  >
                    {opt.l}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Firma Grubu</Label>
              <Select value={form.companyGroupCode} onValueChange={(v) => setForm({ ...form, companyGroupCode: v })}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {lookupCodeOptions(companyGroupRows).map((g) => (
                    <SelectItem key={g.code} value={g.code}>{g.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Firma İrtibat Şekli</Label>
              <Select value={form.contactSourceCode} onValueChange={(v) => setForm({ ...form, contactSourceCode: v })}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {lookupCodeOptions(contactSourceRows).map((s) => (
                    <SelectItem key={s.code} value={s.code}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <LookupCombobox
              label="Firma Sektörü"
              options={lookupNameOptions(sectorRows)}
              value={form.sector}
              onChange={(v) => setForm({ ...form, sector: v })}
              placeholder="Sektör seçin..."
            />
            <Field label={type === "company" ? "Firma Ünvanı *" : "Ad Soyad *"} value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
            <Field label="Telefon-1" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} placeholder="+90 ..." />
            <Field label="Telefon-2" value={form.phone2} onChange={(v) => setForm({ ...form, phone2: v })} placeholder="+90 ..." />
            <Field label="Faks" value={form.fax} onChange={(v) => setForm({ ...form, fax: v })} placeholder="+90 ..." />
            <Field label="Mail-1" value={form.email} onChange={(v) => setForm({ ...form, email: v })} type="email" />
            <Field label="Mail-2" value={form.email2} onChange={(v) => setForm({ ...form, email2: v })} type="email" />
            <Field label="Web Sitesi" value={form.website} onChange={(v) => setForm({ ...form, website: v })} placeholder="https://..." />
            <Field label="Açık Adres" value={form.address} onChange={(v) => setForm({ ...form, address: v })} className="col-span-2" />
            <LookupCombobox
              label="Ülke"
              options={toComboboxOptions(COUNTRY_OPTIONS)}
              value={form.country}
              onChange={(v) => setForm({ ...form, country: v, city: "", district: "" })}
              placeholder="Ülke seçin..."
            />
            <LookupCombobox
              label="İl"
              options={provinceOptions}
              value={form.city}
              onChange={(v) => setForm({ ...form, city: v, district: "" })}
              placeholder={provinceOptions.length ? "İl seçin veya yazın..." : "İl yazın..."}
            />
            <LookupCombobox
              label="İlçe"
              options={districtOptions}
              value={form.district}
              onChange={(v) => setForm({ ...form, district: v })}
              placeholder={!form.city ? "Önce il seçin" : districtOptions.length ? "İlçe seçin veya yazın..." : "İlçe yazın..."}
            />
            <div className="col-span-2">
              <OsmCompanySearch
                query={form.name}
                address={form.address}
                city={form.city}
                district={form.district}
                onSelect={(result) => {
                  setForm({
                    ...form,
                    latitude: String(result.latitude),
                    longitude: String(result.longitude),
                    osmDisplayName: result.displayName,
                    address: form.address.trim() ? form.address : result.displayName,
                  });
                  toast.success("Konum seçildi", { description: `${result.latitude.toFixed(5)}, ${result.longitude.toFixed(5)}` });
                }}
              />
              {form.latitude && form.longitude && (
                <div className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                  Harita konumu kayda eklenecek: {Number(form.latitude).toFixed(5)}, {Number(form.longitude).toFixed(5)}
                </div>
              )}
            </div>
            <LookupCombobox
              label="Vergi Dairesi"
              options={lookupNameOptions(taxOfficeRows)}
              value={form.taxOffice}
              onChange={(v) => setForm({ ...form, taxOffice: v })}
              placeholder="Vergi dairesi seçin..."
            />
            <Field label="T.C. / Vergi Kimlik Numarası" value={form.taxNumber} onChange={(v) => setForm({ ...form, taxNumber: v })} />
            <div className="col-span-2">
              <Label className="text-xs">Notlar</Label>
              <Textarea className="mt-1.5" rows={3} value={form.initialNote} onChange={(e) => setForm({ ...form, initialNote: e.target.value })} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Vazgeç</Button>
            <Button type="submit">Firmayı Oluştur</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Contact ---------- */
const emptyContactForm = (defaultCustomerId?: string) => ({
  customerId: defaultCustomerId ?? "",
  name: "",
  title: "",
  department: "",
  phone: "",
  phoneExtension: "",
  mobilePhone: "",
  otherPhone: "",
  email: "",
  personalEmail: "",
  otherEmail: "",
  gender: "",
  birthDate: "",
  decisionRoleCode: "",
  favoriteTeam: "",
  hometown: "",
  knownIllness: "",
  favoriteColor: "",
  graduatedSchool: "",
  politicalView: "",
  isPrimary: false,
  note: "",
  isBlacklisted: false,
  blacklistReason: "",
});

export function CreateContactDialog({
  trigger,
  defaultCustomerId,
  onCreated,
}: {
  trigger: React.ReactNode;
  defaultCustomerId?: string;
  onCreated?: (id: string) => void;
}) {
  const { customers, addContact, addCustomer } = useStore();
  const [open, setOpen] = useState(false);
  // Taslak yenilemede korunur; açılışta sıfırlanmaz, yalnızca başarılı kayıtta temizlenir.
  const [form, setForm] = usePersistentState("draft.contact.form", emptyContactForm(defaultCustomerId));

  const reset = () => setForm(emptyContactForm(defaultCustomerId));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customerId) return toast.error("Firma seçiniz");
    if (!form.name.trim()) return toast.error("Adı soyadı zorunludur");

    try {
      const contact = await addContact({
        customerId: form.customerId,
        name: form.name.trim(),
        title: form.title.trim(),
        department: form.department.trim(),
        phone: form.phone.trim(),
        phoneExtension: form.phoneExtension.trim(),
        mobilePhone: form.mobilePhone.trim(),
        otherPhone: form.otherPhone.trim(),
        email: form.email.trim(),
        personalEmail: form.personalEmail.trim(),
        otherEmail: form.otherEmail.trim(),
        gender: form.gender,
        birthDate: form.birthDate,
        decisionRoleCode: form.decisionRoleCode,
        favoriteTeam: form.favoriteTeam.trim(),
        hometown: form.hometown.trim(),
        knownIllness: form.knownIllness.trim(),
        favoriteColor: form.favoriteColor.trim(),
        graduatedSchool: form.graduatedSchool.trim(),
        politicalView: form.politicalView.trim(),
        isPrimary: form.isPrimary,
        note: form.note.trim(),
        isBlacklisted: form.isBlacklisted,
        blacklistReason: form.isBlacklisted ? form.blacklistReason.trim() : "",
      });
      toast.success("Kontak oluşturuldu", { description: contact.name });
      reset();
      setOpen(false);
      onCreated?.(contact.id);
    } catch (err: any) {
      toast.error("Kontak oluşturulamadı", { description: err?.message ?? "API isteği başarısız oldu." });
    }
  };

  const handleOpen = (nextOpen: boolean) => {
    setOpen(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Yeni Kontak</DialogTitle>
          <DialogDescription>Firmaya bağlı kişi kaydı oluşturun.</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label className="text-xs">Firma *</Label>
              <div className="mt-1.5">
                <Combobox
                  options={customers.map((c) => ({ value: c.id, label: c.name, hint: c.city }))}
                  value={form.customerId}
                  onChange={(v) => setForm({ ...form, customerId: v })}
                  placeholder="Firma seçin veya adını yazın..."
                  searchPlaceholder="Firma adı / şehir ara..."
                  emptyText="Firma bulunamadı."
                  onCreate={async (label) => {
                    try {
                      const created = await addCustomer({
                        type: "company", firmType: "customer", name: label,
                        contactPerson: "", phone: "", email: "", city: "", address: "",
                        taxNumber: "", wantedProduct: "", initialNote: "", source: "Kontak",
                      } as any);
                      setForm((f) => ({ ...f, customerId: created.id }));
                      toast.success("Firma oluşturuldu", { description: label });
                    } catch (err: any) {
                      toast.error("Firma oluşturulamadı", { description: err?.message ?? "İstek başarısız oldu." });
                    }
                  }}
                  createLabel={(q) => `"${q}" adıyla yeni firma oluştur`}
                />
              </div>
            </div>

            <Field label="Adı Soyadı *" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
            <Field label="Ünvan" value={form.title} onChange={(v) => setForm({ ...form, title: v })} />
            <Field label="Departman" value={form.department} onChange={(v) => setForm({ ...form, department: v })} />
            <div>
              <Label className="text-xs">Karar Yetkisi</Label>
              <Select
                value={form.decisionRoleCode || "none"}
                onValueChange={(v) => setForm({ ...form, decisionRoleCode: v === "none" ? "" : v })}
              >
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Belirtilmedi</SelectItem>
                  <SelectItem value="owner">Karar Verici</SelectItem>
                  <SelectItem value="influencer">Karar Verici Yardımcısı</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="İş Telefonu" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} placeholder="+90 ..." />
            <Field label="Dahili Numarası" value={form.phoneExtension} onChange={(v) => setForm({ ...form, phoneExtension: v })} placeholder="Örn: 112" />
            <Field label="Cep Telefonu" value={form.mobilePhone} onChange={(v) => setForm({ ...form, mobilePhone: v })} placeholder="+90 ..." />
            <Field label="Diğer Telefon" value={form.otherPhone} onChange={(v) => setForm({ ...form, otherPhone: v })} placeholder="+90 ..." />
            <Field label="İş E-posta" value={form.email} onChange={(v) => setForm({ ...form, email: v })} type="email" />
            <Field label="Kişisel E-posta" value={form.personalEmail} onChange={(v) => setForm({ ...form, personalEmail: v })} type="email" />
            <Field label="Diğer E-posta" value={form.otherEmail} onChange={(v) => setForm({ ...form, otherEmail: v })} type="email" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Cinsiyet</Label>
              <Select value={form.gender || "none"} onValueChange={(v) => setForm({ ...form, gender: v === "none" ? "" : v })}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Belirtilmedi</SelectItem>
                  <SelectItem value="Kadın">Kadın</SelectItem>
                  <SelectItem value="Erkek">Erkek</SelectItem>
                  <SelectItem value="Diğer">Diğer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Field label="Doğum Tarihi" type="date" value={form.birthDate} onChange={(v) => setForm({ ...form, birthDate: v })} />
            <Field label="Tuttuğu Takım" value={form.favoriteTeam} onChange={(v) => setForm({ ...form, favoriteTeam: v })} />
            <Field label="Memleketi" value={form.hometown} onChange={(v) => setForm({ ...form, hometown: v })} />
            <Field label="Bilinen Hastalık" value={form.knownIllness} onChange={(v) => setForm({ ...form, knownIllness: v })} />
            <Field label="Sevdiği Renk" value={form.favoriteColor} onChange={(v) => setForm({ ...form, favoriteColor: v })} />
            <Field label="Mezun Olduğu Okul" value={form.graduatedSchool} onChange={(v) => setForm({ ...form, graduatedSchool: v })} />
            <Field label="Siyasi Görüş / Parti" value={form.politicalView} onChange={(v) => setForm({ ...form, politicalView: v })} />
            <div className="col-span-2">
              <Label className="text-xs">Not</Label>
              <Textarea className="mt-1.5" rows={3} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </div>
            <label className="col-span-2 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isPrimary}
                onChange={(e) => setForm({ ...form, isPrimary: e.target.checked })}
              />
              Birincil kontak
            </label>
            <label className="col-span-2 flex items-center gap-2 text-sm text-red-700">
              <input
                type="checkbox"
                checked={form.isBlacklisted}
                onChange={(e) => setForm({ ...form, isBlacklisted: e.target.checked })}
              />
              Kara listeye al
            </label>
            {form.isBlacklisted && (
              <div className="col-span-2">
                <Label className="text-xs">Kara Liste Sebebi</Label>
                <Textarea
                  className="mt-1.5"
                  rows={2}
                  value={form.blacklistReason}
                  onChange={(e) => setForm({ ...form, blacklistReason: e.target.value })}
                  placeholder="Neden kara listeye alındığını yazın"
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Vazgeç</Button>
            <Button type="submit">Kontak Oluştur</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Sales Case ---------- */
/* ---------- Firma düzenleme (controlled) ---------- */
export function EditCustomerDialog({ customer, onClose }: { customer: Customer | null; onClose: () => void }) {
  const { updateCustomer } = useStore();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "", sector: "", phone: "", email: "", city: "", district: "", country: "Türkiye",
    taxNumber: "", taxOffice: "", website: "",
  });

  const provinceOptions = useMemo(() => toComboboxOptions(provincesForCountry(form.country)), [form.country]);
  const districtOptions = useMemo(
    () => toComboboxOptions(districtsForCountry(form.country, form.city)),
    [form.country, form.city],
  );
  const sectorRows = useLookupRows("company-sectors", COMPANY_SECTOR_OPTIONS.map((name, index) => ({ code: name, name, sortOrder: index })));
  const taxOfficeRows = useTaxOfficeRows(form.city);

  useEffect(() => {
    if (customer)
      setForm({
        name: customer.name ?? "",
        sector: customer.sector ?? "",
        phone: customer.phone ?? "",
        email: customer.email ?? "",
        city: customer.city ?? "",
        district: customer.district ?? "",
        country: customer.country ?? "Türkiye",
        taxNumber: customer.taxNumber ?? "",
        taxOffice: customer.taxOffice ?? "",
        website: customer.website ?? "",
      });
  }, [customer]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customer) return;
    if (!form.name.trim()) return toast.error("Firma ünvanı zorunludur");
    setSaving(true);
    try {
      await updateCustomer(customer.id, form);
      toast.success("Firma güncellendi", { description: form.name });
      onClose();
    } catch (err: any) {
      toast.error("Firma güncellenemedi", { description: err?.message ?? "API isteği başarısız oldu." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!customer} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Firma Düzenle</DialogTitle>
          <DialogDescription>Firma temel bilgilerini güncelleyin.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <Field label="Ünvan *" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
          <div className="grid grid-cols-2 gap-3">
            <LookupCombobox
              label="Sektör"
              options={lookupNameOptions(sectorRows)}
              value={form.sector}
              onChange={(v) => setForm({ ...form, sector: v })}
            />
            <Field label="Web" value={form.website} onChange={(v) => setForm({ ...form, website: v })} />
            <Field label="Telefon" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
            <Field label="E-posta" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
            <LookupCombobox
              label="Ülke"
              options={toComboboxOptions(COUNTRY_OPTIONS)}
              value={form.country}
              onChange={(v) => setForm({ ...form, country: v, city: "", district: "" })}
            />
            <LookupCombobox
              label="İl"
              options={provinceOptions}
              value={form.city}
              onChange={(v) => setForm({ ...form, city: v, district: "" })}
            />
            <LookupCombobox
              label="İlçe"
              options={districtOptions}
              value={form.district}
              onChange={(v) => setForm({ ...form, district: v })}
            />
            <Field label="VKN" value={form.taxNumber} onChange={(v) => setForm({ ...form, taxNumber: v })} />
            <LookupCombobox
              label="Vergi Dairesi"
              options={lookupNameOptions(taxOfficeRows)}
              value={form.taxOffice}
              onChange={(v) => setForm({ ...form, taxOffice: v })}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Vazgeç</Button>
            <Button type="submit" disabled={saving}>{saving ? "Kaydediliyor..." : "Kaydet"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Kontak düzenleme (controlled) ---------- */
export function EditContactDialog({ contact, onClose }: { contact: Contact | null; onClose: () => void }) {
  const { updateContact } = useStore();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", title: "", department: "", phone: "", mobilePhone: "", email: "", isBlacklisted: false, blacklistReason: "" });
  const [linkedCompanies, setLinkedCompanies] = useState<{ id: string; legalTitle: string; shortName: string | null; isPrimary: boolean }[]>([]);
  const [companyBusy, setCompanyBusy] = useState<string | null>(null);

  const handleSetPrimary = async (companyId: string) => {
    if (!contact) return;
    setCompanyBusy(companyId);
    try {
      setLinkedCompanies(await contactService.setPrimaryCompany(contact.id, companyId));
      toast.success("Birincil firma güncellendi");
    } catch (err: any) {
      toast.error("Güncellenemedi", { description: err?.message ?? "İşlem başarısız." });
    } finally {
      setCompanyBusy(null);
    }
  };
  const handleUnlinkCompany = async (companyId: string) => {
    if (!contact) return;
    setCompanyBusy(companyId);
    try {
      setLinkedCompanies(await contactService.unlinkCompany(contact.id, companyId));
      toast.success("Firma bağı kaldırıldı");
    } catch (err: any) {
      toast.error("Kaldırılamadı", { description: err?.message ?? "İşlem başarısız." });
    } finally {
      setCompanyBusy(null);
    }
  };

  useEffect(() => {
    if (!contact) {
      setLinkedCompanies([]);
      return;
    }
    let alive = true;
    contactService
      .companies(contact.id)
      .then((rows) => alive && setLinkedCompanies(rows))
      .catch(() => alive && setLinkedCompanies([]));
    return () => {
      alive = false;
    };
  }, [contact]);

  useEffect(() => {
    if (contact)
      setForm({
        name: contact.name ?? "",
        title: contact.title ?? "",
        department: contact.department ?? "",
        phone: contact.phone ?? "",
        mobilePhone: contact.mobilePhone ?? "",
        email: contact.email ?? "",
        isBlacklisted: contact.isBlacklisted ?? false,
        blacklistReason: contact.blacklistReason ?? "",
      });
  }, [contact]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contact) return;
    if (!form.name.trim()) return toast.error("Adı soyadı zorunludur");
    setSaving(true);
    try {
      await updateContact(contact.id, {
        name: form.name.trim(),
        title: form.title.trim(),
        department: form.department.trim(),
        phone: form.phone.trim(),
        mobilePhone: form.mobilePhone.trim(),
        email: form.email.trim(),
        isBlacklisted: form.isBlacklisted,
        blacklistReason: form.isBlacklisted ? form.blacklistReason.trim() : "",
      });
      toast.success("Kontak güncellendi", { description: form.name });
      onClose();
    } catch (err: any) {
      toast.error("Kontak güncellenemedi", { description: err?.message ?? "API isteği başarısız oldu." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!contact} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Kontak Düzenle</DialogTitle>
          <DialogDescription>Kontak bilgilerini güncelleyin.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <Field label="Ad Soyad *" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Ünvan" value={form.title} onChange={(v) => setForm({ ...form, title: v })} />
            <Field label="Departman" value={form.department} onChange={(v) => setForm({ ...form, department: v })} />
            <Field label="İş Telefonu" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
            <Field label="Cep Telefonu" value={form.mobilePhone} onChange={(v) => setForm({ ...form, mobilePhone: v })} />
          </div>
          <Field label="E-posta" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
          {linkedCompanies.length > 0 && (
            <div>
              <Label className="text-xs">Bağlı Firmalar {linkedCompanies.length > 1 && `(${linkedCompanies.length})`}</Label>
              <div className="mt-1.5 space-y-1">
                {linkedCompanies.map((c) => {
                  const busy = companyBusy === c.id;
                  return (
                    <div key={c.id} className="flex items-center gap-2 rounded-md border border-border/60 px-2.5 py-1.5 text-sm">
                      <Building2 className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">{c.shortName || c.legalTitle}</span>
                      {c.isPrimary ? (
                        <Badge variant="default" className="text-[10px]">Birincil</Badge>
                      ) : (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          disabled={busy}
                          onClick={() => handleSetPrimary(c.id)}
                        >
                          {busy ? <Loader2 className="size-3.5 animate-spin" /> : "Birincil yap"}
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7 text-muted-foreground hover:text-destructive"
                        aria-label="Firmadan ayır"
                        title={linkedCompanies.length <= 1 ? "Kontağın en az bir firmaya bağlı kalması gerekir" : "Firmadan ayır"}
                        disabled={busy || linkedCompanies.length <= 1}
                        onClick={() => handleUnlinkCompany(c.id)}
                      >
                        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                      </Button>
                    </div>
                  );
                })}
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">Aynı kişi birden çok firmada yetkili olabilir. "Birincil yap" ile varsayılan firmayı değiştir, çöp kutusuyla bağı kaldır.</p>
            </div>
          )}
          <label className="flex items-center gap-2 text-sm text-red-700">
            <input
              type="checkbox"
              checked={form.isBlacklisted}
              onChange={(e) => setForm({ ...form, isBlacklisted: e.target.checked })}
            />
            Kara listeye al
          </label>
          {form.isBlacklisted && (
            <div>
              <Label className="text-xs">Kara Liste Sebebi</Label>
              <Textarea
                className="mt-1.5"
                rows={2}
                value={form.blacklistReason}
                onChange={(e) => setForm({ ...form, blacklistReason: e.target.value })}
                placeholder="Neden kara listeye alındığını yazın"
              />
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Vazgeç</Button>
            <Button type="submit" disabled={saving}>{saving ? "Kaydediliyor..." : "Kaydet"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CreateCaseDialog({ trigger, defaultCustomerId }: { trigger: React.ReactNode; defaultCustomerId?: string }) {
  const { customers, addCase, addCustomer, users, products } = useStore();
  const { user, activeDivision, hasRole } = useAuth();
  const isSuperAdmin = hasRole("super_admin");
  const canPickDivision = isSuperAdmin && (user?.canViewAllDivisions ?? false);
  const divisions = user?.divisions ?? [];
  const defaultDivisionId = activeDivision && activeDivision !== "all" ? activeDivision : divisions[0]?.id ?? "";
  const [open, setOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [saving, setSaving] = useState(false);
  const makeEmptyCase = () => ({
    customerId: defaultCustomerId ?? "",
    assignedUserId: user?.id ?? users.find((u) => u.role === "Sales" || u.role === "Admin")?.id ?? users[0]?.id ?? "",
    requestedProduct: "",
    requestedModel: "",
    quantity: 1,
    estimatedAmount: 0,
    paymentTermDays: undefined as number | undefined,
    currency: "USD" as "USD" | "EUR" | "TRY",
    stage: "lead" as (typeof SALES_STAGES)[number],
    department: "Satış",
    divisionId: canPickDivision ? defaultDivisionId : "",
  });
  // Taslak yenilemede korunur; başarılı kayıtta temizlenir.
  const [form, setForm] = usePersistentState("draft.case.form", makeEmptyCase());
  // Super admin olmayan kullanıcılar için her zaman kendi ID'lerine kilitle.
  useEffect(() => {
    if (!isSuperAdmin && user?.id && form.assignedUserId !== user.id) {
      setForm((f) => ({ ...f, assignedUserId: user.id }));
    }
  }, [user?.id, isSuperAdmin]);

  // Satış kartı ürün seçici: yalnızca tezgahlar (satış kalemi), aktif/seçili bölüme
  // (CNC/Üniversal/Sac) göre daraltılır. Serbest ürün adı yine elle yazılabilir.
  const machineProductOptions = useMemo(() => {
    const activeDivId = canPickDivision ? form.divisionId : (activeDivision && activeDivision !== "all" ? activeDivision : "");
    const divCode = activeDivId ? divisions.find((d) => d.id === activeDivId)?.code?.toLocaleUpperCase("en-US") : null;
    return products
      .filter((p) => (p.categoryCode ?? "").toLocaleUpperCase("en-US") === "TEZGAH")
      .filter((p) => !divCode || (p.productGroupCode ?? "").toLocaleUpperCase("en-US") === divCode)
      .map((p) => ({ value: p.id, label: [p.brand, p.model].filter(Boolean).join(" "), hint: p.type }));
  }, [products, canPickDivision, form.divisionId, activeDivision, divisions]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (!form.customerId) return toast.error("Müşteri seçiniz");
    if (!form.requestedProduct) return toast.error("Ürün giriniz");
    if (canPickDivision && !form.divisionId) return toast.error("Bölüm seçiniz", { description: "Satış kartını CNC / Üniversal / Sac bölümlerinden birine atayın." });
    setSaving(true);
    try {
      const sc = await addCase(form as any);
      toast.success("Satış kartı oluşturuldu", { description: `#${sc.id.toUpperCase()}` });
      setForm(makeEmptyCase());
      setSelectedProductId("");
      setOpen(false);
    } catch (err: any) {
      toast.error("Satış kartı oluşturulamadı", { description: err?.message ?? "API isteği başarısız oldu." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Yeni Satış Kartı</DialogTitle>
          <DialogDescription>Bir müşteri için satış fırsatı (kanban kartı) oluşturun.</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label className="text-xs">Müşteri *</Label>
              <div className="mt-1.5">
                <Combobox
                  options={customers.map((c) => ({ value: c.id, label: c.name, hint: c.city }))}
                  value={form.customerId}
                  onChange={(v) => setForm({ ...form, customerId: v })}
                  placeholder="Firma seçin veya adını yazın..."
                  searchPlaceholder="Firma adı / şehir ara..."
                  emptyText="Firma bulunamadı."
                  onCreate={async (label) => {
                    try {
                      const created = await addCustomer({
                        type: "company", firmType: "customer", name: label,
                        contactPerson: "", phone: "", email: "", city: "", address: "",
                        taxNumber: "", wantedProduct: "", initialNote: "", source: "Satış kartı",
                      } as any);
                      setForm((f) => ({ ...f, customerId: created.id }));
                      toast.success("Firma oluşturuldu", { description: label });
                    } catch (err: any) {
                      toast.error("Firma oluşturulamadı", { description: err?.message ?? "İstek başarısız oldu." });
                    }
                  }}
                  createLabel={(q) => `"${q}" adıyla yeni firma oluştur`}
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Talep Edilen Ürün *</Label>
              <div className="mt-1.5">
                <Combobox
                  options={machineProductOptions}
                  value={selectedProductId}
                  onChange={(v) => {
                    const p = products.find((pr) => pr.id === v);
                    setSelectedProductId(v);
                    if (p) {
                      // Tahmini tutar peşin fiyattan otomatik çekilir (yoksa liste
                      // fiyatı) ve adetle çarpılır; kullanıcı el ile değiştirebilir.
                      const unit = p.cashPrice ?? p.listPrice ?? 0;
                      setForm((f) => ({
                        ...f,
                        requestedProduct: p.brand || p.type || p.model,
                        requestedModel: p.model ?? "",
                        estimatedAmount: unit ? unit * (Number(f.quantity) || 1) : f.estimatedAmount,
                        currency: (p.currency as typeof f.currency) ?? f.currency,
                      }));
                    }
                  }}
                  placeholder="Tezgah seçin veya yazın..."
                  searchPlaceholder="Marka / model ara..."
                  emptyText="Tezgah bulunamadı."
                  onCreate={(label) => {
                    setSelectedProductId("");
                    setForm((f) => ({ ...f, requestedProduct: label }));
                  }}
                  createLabel={(q) => `"${q}" serbest ürün olarak ekle`}
                />
              </div>
            </div>
            <Field label="Model" value={form.requestedModel} onChange={(v) => setForm({ ...form, requestedModel: v })} placeholder="Model elle girilebilir" />
            <Field label="Adet" type="number" value={String(form.quantity)} onChange={(v) => setForm({ ...form, quantity: Number(v) || 1 })} />
            <Field label="Tahmini Tutar" type="number" value={String(form.estimatedAmount)} onChange={(v) => setForm({ ...form, estimatedAmount: Number(v) || 0 })} />
            <Field
              label="Vade (gün)"
              type="number"
              value={form.paymentTermDays === undefined ? "" : String(form.paymentTermDays)}
              onChange={(v) => setForm({ ...form, paymentTermDays: v.trim() === "" ? undefined : Math.max(0, Number(v) || 0) })}
              placeholder="Örn. 90"
            />
            <div>
              <Label className="text-xs">Para Birimi</Label>
              <Select value={form.currency} onValueChange={(v: any) => setForm({ ...form, currency: v })}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="TRY">TRY</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {isSuperAdmin && (
              <div>
                <Label className="text-xs">Atanan Kullanıcı</Label>
                <Select value={form.assignedUserId} onValueChange={(v) => setForm({ ...form, assignedUserId: v })}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(users.filter((u) => u.role === "Sales" || u.role === "Admin").length > 0 ? users.filter((u) => u.role === "Sales" || u.role === "Admin") : users).map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {canPickDivision && (
              <div className="col-span-2">
                <Label className="text-xs">Bölüm *</Label>
                <Select value={form.divisionId} onValueChange={(v) => setForm({ ...form, divisionId: v })}>
                  <SelectTrigger className="mt-1.5"><SelectValue placeholder="Bölüm seçin (CNC / Üniversal / Sac)..." /></SelectTrigger>
                  <SelectContent>
                    {divisions.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="col-span-2">
              <Label className="text-xs">Başlangıç Aşaması</Label>
              <Select value={form.stage} onValueChange={(v: any) => setForm({ ...form, stage: v })}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SALES_STAGES.filter((s) => s !== "cancelled" && s !== "delivered").map((s) => (
                    <SelectItem key={s} value={s}>{salesStageLabel(s)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>Vazgeç</Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Oluşturuluyor..." : "Satış Kartını Oluştur"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Offer (legacy alias → full quote wizard) ---------- */
export function CreateOfferDialog({ trigger, defaultCaseId }: { trigger: React.ReactNode; defaultCaseId?: string }) {
  const { cases } = useStore();
  const sc = cases.find((c) => c.id === defaultCaseId);
  return (
    <QuoteDialog
      defaultCaseId={defaultCaseId}
      defaultCustomerId={sc?.customerId}
      trigger={trigger}
    />
  );
}

function AutocompleteInput({ value, onChange, options, placeholder }: { value: string, onChange: (v: string) => void, options: string[], placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const filtered = options.filter(o => o.toLocaleLowerCase("tr-TR").includes(value.toLocaleLowerCase("tr-TR")));

  return (
    <div className="relative mt-1.5">
      <Input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setTimeout(() => setOpen(false), 200);
        }}
        placeholder={placeholder}
        className="bg-white h-10 w-full pr-8"
      />
      <ChevronDown className="absolute right-3 top-3 h-4 w-4 opacity-50 pointer-events-none" />
      
      {open && filtered.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-border shadow-md rounded-md overflow-hidden animate-in fade-in-0 zoom-in-95">
          <div className="max-h-60 overflow-y-auto p-1">
            {filtered.map(o => (
              <div
                key={o}
                className="px-2 py-1.5 text-sm rounded-sm hover:bg-muted cursor-pointer flex items-center text-foreground"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(o);
                  setOpen(false);
                }}
              >
                {o}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Stock Item ---------- */
const STATUSES: Array<StockItem["status"]> = ["Available", "Reserved", "InTransit", "Sold", "Inactive"];

const emptyStockForm = () => ({
  brand: "",
  counterType: "",
  counterModel: "",
  serialNumber: "",
  controlPanel: "",
  stockCode: "",
  warehouse: "",
  status: "Available" as StockItem["status"],
  categoryCode: "TEZGAH" as StockCategoryCode,
  optionalHardware: "",
  spareParts: "",
  productId: "",
  parentInventoryItemId: null as string | null,
});

export function CreateStockDialog({ trigger }: { trigger: React.ReactNode }) {
  const { addStock, stock, products, refresh } = useStore();
  const [open, setOpen] = useState(false);
  // Mod: "single" = tek seri-no'lu kalem · "bulk" = bir üründen N adet seri-no üret.
  const [mode, setMode] = useState<"single" | "bulk">("single");
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("5");
  const [saving, setSaving] = useState(false);
  const [warehouses, setWarehouses] = useState<string[]>([]);
  const [form, setForm] = useState(emptyStockForm);
  const [linkedOptionalIds, setLinkedOptionalIds] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    inventoryService.listWarehouses()
      .then((rows) => setWarehouses(rows.map((w: { name?: string }) => w.name).filter(Boolean) as string[]))
      .catch(() => setWarehouses([]));
  }, [open]);

  const catalogProducts = useMemo(
    () => products.filter((p) => (p.categoryCode ?? "TEZGAH") === form.categoryCode),
    [products, form.categoryCode],
  );

  const allBrands = Array.from(new Set([...catalogProducts.map((p) => p.brand), ...stock.filter((s) => s.categoryCode === form.categoryCode).map((s) => s.brand), form.brand].filter(Boolean)));
  const allTypes = Array.from(new Set([...catalogProducts.map((p) => p.type), ...stock.filter((s) => s.categoryCode === form.categoryCode).map((s) => s.counterType), form.counterType].filter(Boolean)));
  const allPanels = Array.from(new Set([...catalogProducts.map((p) => p.controlPanel), ...stock.filter((s) => s.categoryCode === form.categoryCode).map((s) => s.controlPanel), form.controlPanel].filter(Boolean)));
  const warehouseOptions = Array.from(new Set([...warehouses, ...stock.map((s) => s.warehouse), form.warehouse].filter(Boolean)));
  const machineStockOptions = stock.filter((s) => (s.categoryCode ?? "TEZGAH") === "TEZGAH" && !s.parentInventoryItemId);
  const independentOptionalEquipment = stock.filter((s) => s.categoryCode === "OPSIYONEL_DONANIM" && !s.parentInventoryItemId);

  // Katalogdan seçilen ürünle stok alanlarını otomatik doldur. 
  // Artık tüm alanlar serbest metin (datalist destekli) olduğu için
  // ürün verileri doğrudan forma aktarılır.
  const fillFromProduct = (id: string) => {
    setProductId(id);
    const p = products.find((x) => x.id === id);
    if (!p) return;
    const codePrefix = (p.brand || "").slice(0, 3).toUpperCase();
    const codeModel = (p.model || "").replace(/[^A-Z0-9]/gi, "").toUpperCase();
    setForm((f) => ({
      ...f,
      productId: id,
      brand: p.brand || f.brand,
      counterModel: p.model || f.counterModel,
      controlPanel: p.controlPanel || f.controlPanel,
      counterType: p.type || f.counterType,
      categoryCode: (p.categoryCode as StockCategoryCode) || f.categoryCode,
      stockCode: p.stockCode || `${codePrefix}-${codeModel || "MOD"}`,
    }));
  };

  const reset = () => {
    setMode("single"); setProductId(""); setQuantity("5");
    setLinkedOptionalIds([]);
    setForm(emptyStockForm());
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.counterModel.trim()) return toast.error("Model giriniz");
    if (!form.stockCode.trim()) return toast.error("Stok kodu giriniz");
    setSaving(true);
    try {
      if (mode === "bulk") {
        const qty = parseInt(quantity || "0", 10) || 0;
        if (qty < 1) { setSaving(false); return toast.error("Adet en az 1 olmalı"); }
        if (qty > 100) { setSaving(false); return toast.error("Tek seferde en fazla 100 kalem"); }
        const used = new Set(stock.map((s) => s.serialNumber));
        let seq = 1;
        let created = 0;
        for (let i = 0; i < qty; i++) {
          // Çakışmayan bir seri no bul: {stokKodu}-{sıra}
          let serial = `${form.stockCode}-${String(seq).padStart(3, "0")}`;
          while (used.has(serial)) { seq++; serial = `${form.stockCode}-${String(seq).padStart(3, "0")}`; }
          used.add(serial);
          seq++;
          // eslint-disable-next-line no-await-in-loop
          await addStock({ ...form, serialNumber: serial, stockCode: serial });
          created++;
        }
        toast.success(`${created} adet stok kalemi eklendi`, { description: `${form.counterModel} · ${form.stockCode}` });
      } else {
        if (!form.serialNumber.trim()) { setSaving(false); return toast.error("Seri numarası giriniz"); }
        if (stock.some((s) => s.serialNumber === form.serialNumber)) { setSaving(false); return toast.error("Bu seri numarası zaten kayıtlı"); }
        if (stock.some((s) => s.stockCode === form.stockCode)) { setSaving(false); return toast.error("Bu stok kodu zaten kullanılıyor"); }
        const c = await addStock(form);
        if (form.categoryCode === "TEZGAH" && linkedOptionalIds.length) {
          await Promise.all(linkedOptionalIds.map((id) => inventoryService.update(id, { parentInventoryItemId: c.id })));
          await refresh();
        }
        toast.success("Stok kalemi eklendi", { description: `${c.stockCode} · ${c.serialNumber}` });
      }
      setOpen(false);
      reset();
    } catch (err: any) {
      toast.error("Stok kalemi eklenemedi", { description: err?.message ?? "API isteği başarısız oldu." });
    } finally {
      setSaving(false);
    }
  };

  const autoStockCode = () => {
    const prefix = form.brand.slice(0, 3).toUpperCase();
    const model = form.counterModel.replace(/[^A-Z0-9]/gi, "").toUpperCase();
    const seq = String(stock.length + 1).padStart(3, "0");
    setForm((f) => ({ ...f, stockCode: `${prefix}-${model || "MOD"}-${seq}` }));
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v && !form.stockCode) autoStockCode(); }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Yeni Stok Kalemi</DialogTitle>
          <DialogDescription>Sayaç / cihaz bazında yeni stok kaydı oluşturun.</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label className="text-xs">Stok Kategorisi</Label>
            <Select
              value={form.categoryCode}
              onValueChange={(v: StockCategoryCode) => {
                setProductId("");
                setLinkedOptionalIds([]);
                setForm((f) => ({ ...f, categoryCode: v, counterModel: "", counterType: "", brand: "", controlPanel: "", parentInventoryItemId: null }));
              }}
            >
              <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STOCK_CATEGORY_CODES.map((code) => (
                  <SelectItem key={code} value={code}>{STOCK_CATEGORY_LABELS[code]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground mt-1">
              {form.categoryCode === "TEZGAH"
                ? "Tezgah stoku yalnızca satış süreçlerinde kullanılır."
                : form.categoryCode === "OPSIYONEL_DONANIM"
                  ? "Opsiyonel donanım bağımsız stok kalemi olarak kalabilir veya bir tezgaha bağlanabilir."
                  : "Bu kategori seri no ile stok ve sevkiyat süreçlerinde takip edilir."}
            </p>
          </div>

          {form.categoryCode === "OPSIYONEL_DONANIM" && (
            <div>
              <Label className="text-xs" htmlFor="stock-parent-machine">Bağlı Tezgah</Label>
              <Select
                value={form.parentInventoryItemId ?? "independent"}
                onValueChange={(v) => setForm({ ...form, parentInventoryItemId: v === "independent" ? null : v })}
              >
                <SelectTrigger id="stock-parent-machine" className="mt-1.5">
                  <SelectValue placeholder="Bağımsız stok kalemi" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="independent">Bağımsız stok kalemi</SelectItem>
                  {machineStockOptions.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.brand} {item.counterModel} · {item.serialNumber}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {form.categoryCode === "TEZGAH" && independentOptionalEquipment.length > 0 && mode === "single" && (
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
              <Label className="text-xs">Bağlanacak Opsiyonel Donanımlar</Label>
              <div className="mt-2 grid gap-2 max-h-32 overflow-y-auto">
                {independentOptionalEquipment.map((item) => (
                  <label key={item.id} className="flex items-center gap-2 rounded-md bg-white px-2 py-1.5 text-sm">
                    <Checkbox
                      checked={linkedOptionalIds.includes(item.id)}
                      onCheckedChange={(checked) => {
                        setLinkedOptionalIds((prev) =>
                          checked ? [...prev, item.id] : prev.filter((id) => id !== item.id),
                        );
                      }}
                    />
                    <span className="truncate">{item.brand} {item.counterModel} · {item.serialNumber}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Katalogdan ürün seç → alanları otomatik doldur */}
          <div className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs" htmlFor="stock-product">Üründen Doldur (katalog)</Label>
              {/* Mod: tekli / toplu */}
              <div className="inline-flex rounded-md border border-border/60 bg-white p-0.5 text-xs">
                <button type="button" onClick={() => setMode("single")} className={`px-2.5 py-1 rounded ${mode === "single" ? "bg-primary text-white" : "text-muted-foreground"}`}>Tekli</button>
                <button type="button" onClick={() => setMode("bulk")} className={`px-2.5 py-1 rounded ${mode === "bulk" ? "bg-primary text-white" : "text-muted-foreground"}`}>Toplu</button>
              </div>
            </div>
            <Select value={productId || "none"} onValueChange={(v) => v === "none" ? setProductId("") : fillFromProduct(v)}>
              <SelectTrigger id="stock-product" className="bg-white"><SelectValue placeholder="Ürün seçin (opsiyonel)..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Seçilmedi (elle gir)</SelectItem>
                {catalogProducts.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{[p.brand, p.model].filter(Boolean).join(" ")}{p.type ? ` · ${p.type}` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {mode === "bulk" && (
              <div className="flex items-center gap-2">
                <Label className="text-xs whitespace-nowrap" htmlFor="stock-qty">Adet</Label>
                <Input id="stock-qty" name="stock-qty" type="number" min={1} max={100} className="bg-white h-8 w-24" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
                <span className="text-[11px] text-muted-foreground">Seri no'lar <b>{form.stockCode || "KOD"}-001…</b> şeklinde otomatik üretilir.</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Marka</Label>
              <AutocompleteInput
                options={allBrands}
                value={form.brand}
                onChange={(v) => setForm({ ...form, brand: v })}
                placeholder="Marka seç veya yaz..."
              />
            </div>
            <div>
              <Label className="text-xs">Sayaç Tipi</Label>
              <AutocompleteInput
                options={allTypes}
                value={form.counterType}
                onChange={(v) => setForm({ ...form, counterType: v })}
                placeholder="Tip seç veya yaz..."
              />
            </div>
            <Field label="Model *" name="stock-model" value={form.counterModel} onChange={(v) => setForm({ ...form, counterModel: v })} placeholder="X-200" />
            {mode === "single" ? (
              <Field label="Seri No *" name="stock-serial" value={form.serialNumber} onChange={(v) => setForm({ ...form, serialNumber: v })} placeholder="SN-200-0001" />
            ) : (
              <div>
                <Label className="text-xs">Seri No</Label>
                <div className="mt-1.5 h-10 rounded-md border border-dashed border-border/60 bg-muted/30 px-3 flex items-center text-sm text-muted-foreground">Otomatik (×{parseInt(quantity || "0", 10) || 0})</div>
              </div>
            )}
            <div>
              <Label className="text-xs">Kontrol Paneli</Label>
              <AutocompleteInput
                options={allPanels}
                value={form.controlPanel}
                onChange={(v) => setForm({ ...form, controlPanel: v })}
                placeholder="Panel seç veya yaz..."
              />
            </div>
            <div>
              <Label className="text-xs">Stok Kodu *</Label>
              <div className="flex gap-1.5 mt-1.5">
                <Input value={form.stockCode} onChange={(e) => setForm({ ...form, stockCode: e.target.value })} placeholder="ACM-X200-001" />
                <Button type="button" variant="outline" size="sm" onClick={autoStockCode}>Otomatik</Button>
              </div>
            </div>
            <div>
              <Label className="text-xs">Depo</Label>
              <Select value={form.warehouse || undefined} onValueChange={(v) => setForm({ ...form, warehouse: v })}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="Depo seçin" /></SelectTrigger>
                <SelectContent>
                  {warehouseOptions.map((w) => <SelectItem key={w} value={w}>{w}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Durum</Label>
              <Select value={form.status} onValueChange={(v: any) => setForm({ ...form, status: v })}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-1.5">
            <Field label="Opsiyon Donanım" name="stock-opts" value={form.optionalHardware || ""} onChange={(v) => setForm({ ...form, optionalHardware: v })} placeholder="Opsiyon donanım..." />
            <Field label="Yedek Parça" name="stock-spares" value={form.spareParts || ""} onChange={(v) => setForm({ ...form, spareParts: v })} placeholder="Yedek parça..." />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Vazgeç</Button>
            <Button type="submit" disabled={saving}>{saving ? "Kaydediliyor..." : mode === "bulk" ? `${parseInt(quantity || "0", 10) || 0} Kalem Üret` : "Stoğa Ekle"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Activity ---------- */

export function AddActivityDialog({
  trigger, salesCaseId, customerId, open: controlledOpen, onOpenChange,
}: {
  trigger?: React.ReactNode;
  salesCaseId: string;
  customerId: string;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
}) {
  const { addActivity, users } = useStore();
  const { user } = useAuth();
  const defaultUserId = user?.id ?? users[0]?.id ?? "";
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (o: boolean) => { onOpenChange ? onOpenChange(o) : setInternalOpen(o); };

  const [form, setForm] = usePersistentState<{
    type: string;
    title: string;
    note: string;
    result: string;
    date: string;
    byUserId: string;
  }>(`draft.activity.${salesCaseId || customerId}`, {
    type: ACTIVITY_TYPE_OPTIONS[0].label,
    title: "",
    note: "",
    result: "",
    date: new Date().toISOString().slice(0, 10),
    byUserId: defaultUserId,
  });
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const activityFileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setForm({
      type: ACTIVITY_TYPE_OPTIONS[0].label,
      title: "",
      note: "",
      result: "",
      date: new Date().toISOString().slice(0, 10),
      byUserId: defaultUserId,
    });
    setPendingFiles([]);
    if (activityFileRef.current) activityFileRef.current.value = "";
  };

  const activityFileExt = (file: File) => {
    const lowerName = file.name.toLocaleLowerCase("tr-TR");
    if (file.type === "application/pdf" || lowerName.endsWith(".pdf")) return { extension: "pdf" as const, mimeType: "application/pdf" as const };
    if (file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || lowerName.endsWith(".docx")) return { extension: "docx" as const, mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" as const };
    if (file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" || lowerName.endsWith(".xlsx")) return { extension: "xlsx" as const, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" as const };
    if (file.type === "image/png" || lowerName.endsWith(".png")) return { extension: "png" as const, mimeType: "image/png" as const };
    if (file.type === "image/jpeg" || lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) return { extension: "jpg" as const, mimeType: "image/jpeg" as const };
    if (file.type === "image/webp" || lowerName.endsWith(".webp")) return { extension: "webp" as const, mimeType: "image/webp" as const };
    return null;
  };

  const uploadActivityFiles = async (activityId: string) => {
    for (const file of pendingFiles) {
      const meta = activityFileExt(file);
      if (!meta) throw new Error(`${file.name}: desteklenmeyen dosya tipi`);
      if (file.size > 25 * 1024 * 1024) throw new Error(`${file.name}: dosya boyutu 25 MB'ı aşamaz`);
      const upload = await fileService.signedUpload({
        bucket: "erp-service-documents",
        entityType: "sales_activity",
        entityId: activityId,
        filename: file.name,
        mimeType: meta.mimeType,
        extension: meta.extension,
        sizeBytes: file.size,
      });
      await fileService.uploadBinary(upload, file, meta.mimeType);
      await fileService.link({
        fileId: upload.fileId,
        entityType: "sales_activity",
        entityId: activityId,
        documentTypeCode: "activity_document",
        description: file.name,
      });
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      toast.error("Başlık zorunludur");
      return;
    }
    try {
      const created = await addActivity({
        salesCaseId,
        customerId,
        type: form.type,
        title: form.title.trim(),
        note: form.note.trim(),
        result: form.result.trim(),
        date: form.date,
        byUserId: form.byUserId,
      });
      if (pendingFiles.length) await uploadActivityFiles(created.id);
      toast.success("Aktivite eklendi", { description: form.title.trim() });
      reset();
      setOpen(false);
    } catch (err: any) {
      toast.error("Aktivite eklenemedi", { description: err?.message ?? "API isteği başarısız oldu." });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Yeni Aktivite</DialogTitle>
          <DialogDescription>Bu satış kartına aktivite ekleyin.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Aktivite Türü</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ACTIVITY_TYPE_OPTIONS.map((t) => <SelectItem key={t.code} value={t.label}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Tarih</Label>
              <Input type="date" className="mt-1.5" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Başlık *</Label>
            <Input className="mt-1.5" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Müşteri ile görüşme" />
          </div>
          <div>
            <Label className="text-xs">Not</Label>
            <Textarea className="mt-1.5 min-h-[80px]" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Detaylar..." />
          </div>
          <div>
            <Label className="text-xs">Sonuç / Ne Yapıldı</Label>
            <Textarea className="mt-1.5 min-h-[64px]" value={form.result} onChange={(e) => setForm({ ...form, result: e.target.value })} placeholder="Yapılan işlem ve sonuç..." />
          </div>
          <div>
            <Label className="text-xs">Dosyalar</Label>
            <Input
              ref={activityFileRef}
              type="file"
              multiple
              className="mt-1.5"
              accept=".pdf,.docx,.xlsx,.png,.jpg,.jpeg,.webp"
              onChange={(e) => setPendingFiles(Array.from(e.target.files ?? []))}
            />
            {pendingFiles.length > 0 && (
              <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                {pendingFiles.map((file) => (
                  <div key={`${file.name}-${file.size}`} className="flex items-center gap-2">
                    <Upload className="size-3.5" />
                    <span className="truncate">{file.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <Label className="text-xs">Atanan</Label>
            <Select value={form.byUserId} onValueChange={(v) => setForm({ ...form, byUserId: v })}>
              <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>İptal</Button>
            <Button type="submit">Ekle</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Quick Create ---------- */
export function QuickCreateDialog({ trigger }: { trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Hızlı Oluştur</DialogTitle>
          <DialogDescription>Hangi kaydı oluşturmak istersiniz?</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          <CreateCustomerDialog
            trigger={
              <button className="flex flex-col items-start gap-1 p-4 rounded-lg border hover:border-primary hover:bg-primary/5 transition-colors text-left">
                <Building2 className="size-5 text-primary" />
                <div className="text-sm">Yeni Müşteri</div>
                <div className="text-xs text-muted-foreground">Kurumsal / Bireysel</div>
              </button>
            }
          />
          <CreateContactDialog
            trigger={
              <button className="flex flex-col items-start gap-1 p-4 rounded-lg border hover:border-primary hover:bg-primary/5 transition-colors text-left">
                <UserIcon className="size-5 text-primary" />
                <div className="text-sm">Yeni Kontak</div>
                <div className="text-xs text-muted-foreground">Firma kişisi</div>
              </button>
            }
          />
          <CreateCaseDialog
            trigger={
              <button className="flex flex-col items-start gap-1 p-4 rounded-lg border hover:border-primary hover:bg-primary/5 transition-colors text-left">
                <UserIcon className="size-5 text-primary" />
                <div className="text-sm">Satış Kartı</div>
                <div className="text-xs text-muted-foreground">Yeni fırsat</div>
              </button>
            }
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Product (create / edit) ---------- */

type ProductOption = { code: string; label: string };
type ProductTypeOption = ProductOption & { categoryCode?: string; subcategoryCode?: string; productGroupCode?: string };

const PRODUCT_BRANDS = ["LK", "LK Machinery", "ECOCA", "MANFORD", "Manford", "MAXİMART", "Maximart"];
const PRODUCT_GROUPS: ProductOption[] = [
  { code: "CNC", label: "CNC" },
  { code: "UNIVERSAL", label: "Üniversal" },
  { code: "SAC_ISLEME", label: "Sac İşleme" },
];
const PRODUCT_CATEGORIES: ProductOption[] = [
  { code: "TEZGAH", label: "Tezgah" },
  { code: "YEDEK_PARCA", label: "Yedek Parça" },
  { code: "OPSIYONEL_DONANIM", label: "Opsiyonel Donanım" },
  { code: "ISCILIK", label: "İşçilik" },
  { code: "AKSESUAR", label: "Aksesuar" },
];
const PRODUCT_SUBCATEGORIES: ProductOption[] = [
  { code: "ISLEME_MERKEZI", label: "İşleme Merkezi" },
  { code: "TORNA", label: "Torna" },
];
const PRODUCT_TYPE_GROUPS: Array<{ label: string; options: ProductTypeOption[] }> = [
  {
    label: "İşleme Merkezi",
    options: [
      { code: "CNC_DIK_ISLEME_MERKEZ", label: "CNC Dik İşleme Merkezi", categoryCode: "TEZGAH", subcategoryCode: "ISLEME_MERKEZI", productGroupCode: "CNC" },
      { code: "CNC_KOPRU_TIPI_ISLEME_MERKEZI", label: "CNC Köprü Tipi İşleme Merkezi", categoryCode: "TEZGAH", subcategoryCode: "ISLEME_MERKEZI", productGroupCode: "CNC" },
      { code: "CNC_5_EKSEN_ISLEME_MERKEZI", label: "CNC 5 Eksen İşleme Merkezi", categoryCode: "TEZGAH", subcategoryCode: "ISLEME_MERKEZI", productGroupCode: "CNC" },
      { code: "CNC_TAPPING_CENTER", label: "CNC Tapping Center", categoryCode: "TEZGAH", subcategoryCode: "ISLEME_MERKEZI", productGroupCode: "CNC" },
    ],
  },
  {
    label: "Torna",
    options: [
      { code: "CNC_YATAY_TORNA_TEZGAHI", label: "CNC Yatay Torna Tezgahı", categoryCode: "TEZGAH", subcategoryCode: "TORNA", productGroupCode: "CNC" },
      { code: "CNC_DIK_TORNA_TEZGAHI", label: "CNC Dik Torna Tezgahı", categoryCode: "TEZGAH", subcategoryCode: "TORNA", productGroupCode: "CNC" },
    ],
  },
  {
    label: "Yedek Parça",
    options: [
      { code: "ELEKTRONIK", label: "Elektronik", categoryCode: "YEDEK_PARCA" },
      { code: "ELEKTRIK", label: "Elektrik", categoryCode: "YEDEK_PARCA" },
      { code: "MEKANIK", label: "Mekanik", categoryCode: "YEDEK_PARCA" },
    ],
  },
  {
    label: "Opsiyonel Donanım",
    options: [
      { code: "KONTROL_UNITESI", label: "Kontrol Ünitesi", categoryCode: "OPSIYONEL_DONANIM" },
      { code: "SPINDLE", label: "Spindle", categoryCode: "OPSIYONEL_DONANIM" },
    ],
  },
  {
    label: "İşçilik",
    options: [{ code: "ISCILIK", label: "İşçilik", categoryCode: "ISCILIK" }],
  },
  {
    label: "Aksesuar",
    options: [
      { code: "YAG_SIYIRICI", label: "Yağ Sıyırıcı", categoryCode: "AKSESUAR" },
      { code: "TUTUCU_TAKIMLAR", label: "Tutucu & Takımlar", categoryCode: "AKSESUAR" },
      { code: "DIVIZOR", label: "Divizör", categoryCode: "AKSESUAR" },
      { code: "REGULATOR", label: "Regülatör", categoryCode: "AKSESUAR" },
    ],
  },
];
const PRODUCT_TYPE_OPTIONS = PRODUCT_TYPE_GROUPS.flatMap((g) => g.options);
const PRODUCT_CURRENCIES: Array<{ code: "USD" | "TRY" | "EUR"; label: string }> = [
  { code: "USD", label: "USD" },
  { code: "TRY", label: "TL" },
  { code: "EUR", label: "EUR" },
];
const PRODUCT_VAT_RATES = ["10", "20"];
const DEFAULT_PRODUCT_VAT_RATE = "20";

const normalizeProductVatRate = (value: string | number | null | undefined) => {
  const rate = String(value ?? DEFAULT_PRODUCT_VAT_RATE);
  return PRODUCT_VAT_RATES.includes(rate) ? rate : DEFAULT_PRODUCT_VAT_RATE;
};

const catalogSpecs = (specs: ProductSpec[] = [], emptyValue = "", productTypeCode?: string) =>
  (productTypeCode ? specsForProductTypeStrict(productTypeCode, specs) : specs).map((spec) => ({
    key: spec.key,
    value: spec.value?.trim() ? spec.value : emptyValue,
    unit: spec.unit ?? spec.specUnit ?? "",
    specUnit: spec.unit ?? spec.specUnit ?? "",
    groupCode: spec.groupCode,
    groupName: spec.groupName,
  }));

const ALL_MACHINE_TEMPLATE_KEYS = new Set(
  allCatalogProductSpecs([], "").map((spec) => normalizeProductSpecKey(spec.key)),
);

const templateKeysForProductType = (productTypeCode?: string) =>
  new Set(productSpecDefaults(productTypeCode).map((spec) => normalizeProductSpecKey(spec.key)));

const hasSpecContent = (spec: ProductSpec) => Boolean(spec.key.trim() || spec.value.trim());

const specsForSelectedProductType = (specs: ProductSpec[] = [], productTypeCode?: string, emptyValue = "") => {
  if (!productTypeCode) return catalogSpecs(specs.filter(hasSpecContent), emptyValue);

  const selectedTemplateKeys = templateKeysForProductType(productTypeCode);
  const source = specs.filter((spec) => {
    const normalizedKey = normalizeProductSpecKey(spec.key);
    if (selectedTemplateKeys.has(normalizedKey)) return true;
    if (ALL_MACHINE_TEMPLATE_KEYS.has(normalizedKey)) return false;
    return hasSpecContent(spec);
  });

  return catalogSpecs(source, emptyValue, productTypeCode);
};

// Ürün Grubu → Ürün Kategorisi → Ürün Alt Kategorisi → Ürün Tipi sırasıyla daraltılır.
// Alt kategori (İşleme Merkezi/Torna) her grupta geçerli olabilir (ör. Üniversal Torna, Sac İşleme
// Tezgahı gerçek üründe de görülüyor); yalnızca Tip listesi katalogda tanımlı gruba göre daralır.
// Tipin productGroupCode'u yoksa (Yedek Parça/Opsiyonel Donanım/İşçilik/Aksesuar gibi) her grupta geçerlidir.
const typeMatchesGroup = (type: ProductTypeOption, groupCode?: string) =>
  !type.productGroupCode || !groupCode || type.productGroupCode === groupCode;

const subcategoriesForProductCategory = (categoryCode: string) =>
  PRODUCT_SUBCATEGORIES.filter((subcategory) =>
    PRODUCT_TYPE_OPTIONS.some((type) => type.categoryCode === categoryCode && type.subcategoryCode === subcategory.code),
  );

type ProductFormState = {
  brand: string;
  productGroupCode: string; productGroup: string;
  categoryCode: string; category: string;
  subcategoryCode: string; subcategory: string;
  productTypeCode: string; type: string;
  compatibleMachineType: string;
  supplierCompanyId: string;
  optionalCompatibilityGroupCodes: string[];
  optionalCompatibilityCategoryCodes: string[];
  optionalCompatibilitySubcategoryCodes: string[];
  optionalCompatibilityTypeCodes: string[];
  optionalCompatibilityBrandIds: string[];
  model: string; modelName: string; controlPanel: string;
  imageUrl: string; shortDescription: string; description: string;
  listPrice: string; cashPrice: string; currency: "USD" | "EUR" | "TRY";
  vatRate: string; originCountry: string; hsCode: string; stockCode: string;
  specs: ProductSpec[]; standardEquipment: string[]; optionalEquipment: string[];
  muadilProductIds: string[];
  status: "active" | "passive";
};

const findLabel = (options: ProductOption[], code: string, fallback = "") =>
  options.find((o) => o.code === code)?.label ?? fallback;

const codeFromLabel = (options: ProductOption[], label: string, fallback: string) =>
  options.find((o) => o.label.toLocaleLowerCase("tr-TR") === label.toLocaleLowerCase("tr-TR"))?.code ?? fallback;

const compactProductCode = (value: string) =>
  value
    .trim()
    .toLocaleUpperCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);

const moneyNumber = (value: string) => Number(value.replace(",", ".")) || 0;
const OPTIONAL_EQUIPMENT_CATEGORY_CODE = "OPSIYONEL_DONANIM";
type OptionalEquipmentDraft = { machine: string; product: string; serial: string; type: string; category: string };
const emptyOptionalEquipmentDraft = (): OptionalEquipmentDraft => ({ machine: "", product: "", serial: "", type: "", category: "" });
const OPTIONAL_EQUIPMENT_LABELS: Array<{ key: keyof OptionalEquipmentDraft; label: string }> = [
  { key: "machine", label: "Makine" },
  { key: "product", label: "Ürün" },
  { key: "serial", label: "Seri" },
  { key: "type", label: "Tip" },
  { key: "category", label: "Kategori" },
];

type ProductMachineSource = {
  brand?: string;
  model?: string;
  modelName?: string;
  shortDescription?: string;
  type?: string;
  stockCode?: string;
  productTypeCode?: string;
  category?: string;
  categoryCode?: string;
};

const productMachineLabel = (p: ProductMachineSource) =>
  [p.brand, p.model].filter(Boolean).join(" ").trim() ||
  [p.brand, p.modelName].filter(Boolean).join(" ").trim() ||
  p.shortDescription?.trim() ||
  p.stockCode?.trim() ||
  p.type?.trim() ||
  "Makine";
const OPTIONAL_EQUIPMENT_SERIES_PREFIX_RE = /^(DL|VM|MV|VC|SL|MT|SJ|TC|HT|LH|D|C)(?=[-\d\s/]|$)/i;
const productSeriesLabelForEquipment = (p: ProductMachineSource) => {
  const model = (p.model || p.modelName || p.shortDescription || "").trim().toLocaleUpperCase("tr-TR");
  const code = model.match(OPTIONAL_EQUIPMENT_SERIES_PREFIX_RE)?.[1]?.toLocaleUpperCase("tr-TR");
  return code ? `${code} Serisi` : (p.modelName || p.model || "").trim();
};
const optionalEquipmentDefaultsForMachine = (machine: ProductMachineSource | null | undefined) => ({
  serial: machine ? productSeriesLabelForEquipment(machine) : "",
  type: machine?.type || findLabel(PRODUCT_TYPE_OPTIONS, machine?.productTypeCode ?? "", ""),
  category: machine?.category || findLabel(PRODUCT_CATEGORIES, machine?.categoryCode ?? "", ""),
});
const optionalEquipmentDraftForMachine = (machine: ProductMachineSource | null | undefined): OptionalEquipmentDraft => ({
  ...emptyOptionalEquipmentDraft(),
  machine: machine ? productMachineLabel(machine) : "",
  ...optionalEquipmentDefaultsForMachine(machine),
});

const formatOptionalEquipment = (draft: OptionalEquipmentDraft) =>
  OPTIONAL_EQUIPMENT_LABELS
    .map(({ key, label }) => {
      const value = draft[key].trim();
      return value ? `${label}: ${value}` : "";
    })
    .filter(Boolean)
    .join(" | ");

const parseOptionalEquipment = (value: string): OptionalEquipmentDraft => {
  const parsed = emptyOptionalEquipmentDraft();
  let matched = false;
  for (const part of value.split("|")) {
    const [rawLabel, ...rest] = part.split(":");
    const label = rawLabel?.trim().toLocaleLowerCase("tr-TR");
    const content = rest.join(":").trim();
    const field = OPTIONAL_EQUIPMENT_LABELS.find((item) => item.label.toLocaleLowerCase("tr-TR") === label);
    if (field && content) {
      parsed[field.key] = content;
      matched = true;
    }
  }
  return matched ? parsed : { ...parsed, product: value };
};

const emptyProduct = (): ProductFormState => ({
  brand: "",
  productGroupCode: "CNC", productGroup: "CNC",
  categoryCode: "TEZGAH", category: "Tezgah",
  subcategoryCode: "ISLEME_MERKEZI", subcategory: "İşleme Merkezi",
  productTypeCode: "", type: "",
  compatibleMachineType: "",
  supplierCompanyId: "",
  optionalCompatibilityGroupCodes: [],
  optionalCompatibilityCategoryCodes: [],
  optionalCompatibilitySubcategoryCodes: [],
  optionalCompatibilityTypeCodes: [],
  optionalCompatibilityBrandIds: [],
  model: "", modelName: "", controlPanel: "",
  imageUrl: "", shortDescription: "", description: "",
  listPrice: "", cashPrice: "", currency: "USD",
  vatRate: DEFAULT_PRODUCT_VAT_RATE, originCountry: "", hsCode: "", stockCode: "",
  specs: [], standardEquipment: [], optionalEquipment: [],
  muadilProductIds: [],
  status: "active",
});

const fromProduct = (p: Product): ProductFormState => ({
  brand: p.brand,
  productGroupCode: p.productGroupCode || codeFromLabel(PRODUCT_GROUPS, p.productGroup ?? "", "CNC"),
  productGroup: p.productGroup || findLabel(PRODUCT_GROUPS, p.productGroupCode ?? "CNC", "CNC"),
  categoryCode: p.categoryCode || codeFromLabel(PRODUCT_CATEGORIES, p.category || "", "TEZGAH"),
  category: p.category || findLabel(PRODUCT_CATEGORIES, p.categoryCode ?? "TEZGAH", "Tezgah"),
  subcategoryCode: p.subcategoryCode || codeFromLabel(PRODUCT_SUBCATEGORIES, p.subcategory ?? "", "ISLEME_MERKEZI"),
  subcategory: p.subcategory || findLabel(PRODUCT_SUBCATEGORIES, p.subcategoryCode ?? "ISLEME_MERKEZI", "İşleme Merkezi"),
  productTypeCode: p.productTypeCode ?? "",
  type: p.type,
  compatibleMachineType: p.compatibleMachineTypeCode ?? "",
  supplierCompanyId: p.supplierCompanyId ?? "",
  optionalCompatibilityGroupCodes: p.optionalCompatibilityGroupCodes ?? [],
  optionalCompatibilityCategoryCodes: p.optionalCompatibilityCategoryCodes ?? [],
  optionalCompatibilitySubcategoryCodes: p.optionalCompatibilitySubcategoryCodes ?? [],
  optionalCompatibilityTypeCodes: p.optionalCompatibilityTypeCodes ?? [],
  optionalCompatibilityBrandIds: p.optionalCompatibilityBrandIds ?? [],
  model: p.model,
  modelName: p.modelName ?? "",
  controlPanel: p.controlPanel,
  imageUrl: p.imageUrl, shortDescription: p.shortDescription, description: p.description,
  listPrice: String(p.listPrice || ""), cashPrice: p.cashPrice ? String(p.cashPrice) : "", currency: p.currency,
  vatRate: normalizeProductVatRate(p.vatRate),
  originCountry: p.originCountry ?? "",
  hsCode: p.hsCode ?? "",
  stockCode: p.stockCode || p.model,
  specs: catalogSpecs(p.specs, "", p.productTypeCode),
  standardEquipment: [...p.standardEquipment], optionalEquipment: [...p.optionalEquipment],
  muadilProductIds: p.muadilProductIds?.length ? p.muadilProductIds : (p.muadilProductId ? [p.muadilProductId] : []),
  status: p.status,
});

export function ProductDialog({
  trigger, mode = "create", product, open: controlledOpen, onOpenChange,
}: {
  trigger?: React.ReactNode;
  mode?: "create" | "edit";
  product?: Product;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
}) {
  const { addProduct, updateProduct, products, customers } = useStore();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (o: boolean) => { onOpenChange ? onOpenChange(o) : setInternalOpen(o); };

  const [form, setForm] = useState<ProductFormState>(
    mode === "edit" && product ? fromProduct(product) : emptyProduct()
  );
  const [stdInput, setStdInput] = useState("");
  const [optionalEquipmentDraft, setOptionalEquipmentDraft] = useState<OptionalEquipmentDraft>(emptyOptionalEquipmentDraft);
  const [brandRows, setBrandRows] = useState<Array<{ id: string; name: string }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    void productService.listBrands()
      .then((rows) => setBrandRows((rows ?? []).map((row: any) => ({ id: row.id, name: row.name })).filter((row: any) => row.id && row.name)))
      .catch(() => setBrandRows([]));
  }, [open]);

  const reset = () => {
    setForm(mode === "edit" && product ? fromProduct(product) : emptyProduct());
    setStdInput("");
    setOptionalEquipmentDraft(emptyOptionalEquipmentDraft());
  };

  const IMAGE_MIME_TO_EXT: Record<string, "png" | "jpg" | "webp"> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
  };

  const handleImageFile = async (file?: File | null) => {
    if (!file) return;
    const ext = IMAGE_MIME_TO_EXT[file.type];
    if (!ext) {
      toast.error("Sadece PNG, JPG veya WEBP yükleyebilirsiniz");
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      toast.error("Dosya boyutu 25 MB'ı aşamaz");
      return;
    }
    setUploadingImage(true);
    try {
      const mimeType = file.type as "image/png" | "image/jpeg" | "image/webp";
      const upload = await fileService.signedUpload({
        bucket: "erp-product-images",
        entityType: "product",
        entityId: product?.id ?? "new",
        filename: file.name,
        mimeType,
        extension: ext,
        sizeBytes: file.size,
      });
      await fileService.uploadBinary(upload, file, mimeType);
      // Ham (private) MinIO URL'i yerine auth'suz public product-media yolunu sakla;
      // resolveMediaUrl bunu API tabanıyla birleştirir ve teklif/katalog print'inde
      // (auth cookie'siz açılan pencerede) yüklenebilir olur.
      setForm((f) => ({ ...f, imageUrl: `/products/media/${upload.fileId}` }));
      toast.success("Fotoğraf yüklendi");
    } catch (err: any) {
      toast.error("Fotoğraf yüklenemedi", { description: err?.message ?? "İstek başarısız oldu." });
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleOpen = (o: boolean) => {
    setOpen(o);
    if (o && mode === "edit") reset();
  };

  const updSpec = (i: number, patch: Partial<ProductSpec>) => {
    setForm((f) => ({ ...f, specs: f.specs.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) }));
  };
  const rmSpec = (i: number) => setForm((f) => {
    const next = f.specs.filter((_, idx) => idx !== i);
    return { ...f, specs: next.length ? next : [{ key: "", value: "" }] };
  });

  const addChip = (which: "standardEquipment" | "optionalEquipment", val: string, setInput: (s: string) => void) => {
    const v = val.trim();
    if (!v) return;
    setForm((f) => ({ ...f, [which]: [...f[which], v] }));
    setInput("");
  };
  const rmChip = (which: "standardEquipment" | "optionalEquipment", i: number) => {
    setForm((f) => ({ ...f, [which]: f[which].filter((_, idx) => idx !== i) }));
  };
  const addOptionalEquipment = () => {
    if (!optionalEquipmentDraft.product.trim()) {
      toast.error("Opsiyonel donanım için ürün alanı zorunludur");
      return;
    }
    const value = formatOptionalEquipment({ ...optionalEquipmentDraft, machine: productMachineLabel(form) });
    setForm((f) => ({ ...f, optionalEquipment: [...f.optionalEquipment, value] }));
    setOptionalEquipmentDraft(optionalEquipmentDraftForMachine(form));
  };

  const availableProductSubcategories = subcategoriesForProductCategory(form.categoryCode);
  const categoryUsesSubcategory = availableProductSubcategories.length > 0;

  // Ürün tipini seçili gruba, kategoriye ve (tezgahsa) alt kategoriye göre filtrele
  const typeMatches = (o: ProductTypeOption, categoryCode: string, subcategoryCode: string, groupCode?: string) => {
    if (!typeMatchesGroup(o, groupCode)) return false;
    if (o.categoryCode !== categoryCode) return false;
    if (subcategoriesForProductCategory(categoryCode).length > 0) return o.subcategoryCode === subcategoryCode;
    return true;
  };

  const isTypeAllowed = (o: ProductTypeOption, categoryCode: string, subcategoryCode: string, groupCode?: string) =>
    typeMatches(o, categoryCode, subcategoryCode, groupCode);

  const typeGroups = PRODUCT_TYPE_GROUPS
    .map((group) => ({
      label: group.label,
      options: group.options.filter((o) => isTypeAllowed(o, form.categoryCode, form.subcategoryCode, form.productGroupCode)),
    }))
    .filter((group) => group.options.length > 0);
  const productCategoryOptions = PRODUCT_CATEGORIES;
  const isMachineProduct = form.categoryCode === "TEZGAH";
  const isOptionalEquipmentProduct = form.categoryCode === OPTIONAL_EQUIPMENT_CATEGORY_CODE;
  const isLaborProduct = form.categoryCode === "ISCILIK" || form.productTypeCode === "ISCILIK";
  const supplierOptions = customers.filter((c) => c.firmType === "supplier" || c.firmType === "supplier_customer");
  const compatibilityGroupOptions = PRODUCT_GROUPS.map((o) => ({ value: o.code, label: o.label }));
  const compatibilityCategoryOptions = PRODUCT_CATEGORIES
    .filter((o) => o.code !== OPTIONAL_EQUIPMENT_CATEGORY_CODE)
    .map((o) => ({ value: o.code, label: o.label }));
  const compatibilitySubcategoryOptions = PRODUCT_SUBCATEGORIES.map((o) => ({ value: o.code, label: o.label }));
  const compatibilityTypeOptions = PRODUCT_TYPE_OPTIONS
    .filter((o) => o.categoryCode === "TEZGAH")
    .map((o) => ({ value: o.code, label: o.label }));
  const compatibilityBrandOptions = brandRows.map((row) => ({ value: row.id, label: row.name }));
  const productBrandOptions = Array.from(new Set([
    ...products
      .filter((p) => {
        if (form.productGroupCode && p.productGroupCode && p.productGroupCode !== form.productGroupCode) return false;
        if (form.categoryCode && p.categoryCode && p.categoryCode !== form.categoryCode) return false;
        if (form.subcategoryCode && p.subcategoryCode && p.subcategoryCode !== form.subcategoryCode) return false;
        if (form.productTypeCode && p.productTypeCode && p.productTypeCode !== form.productTypeCode) return false;
        return true;
      })
      .map((p) => p.brand),
    ...PRODUCT_BRANDS,
    form.brand,
  ].filter(Boolean))).sort((a, b) => a.localeCompare(b, "tr-TR"));
  const canSelectProductBrand = Boolean(form.productTypeCode);
  const specValueOptionsByKey = useMemo(() => {
    const valuesByKey = new Map<string, Set<string>>();
    const addValue = (key?: string, value?: string) => {
      const cleanKey = key?.trim();
      const cleanValue = value?.trim();
      if (!cleanKey || !cleanValue) return;
      const values = valuesByKey.get(cleanKey) ?? new Set<string>();
      values.add(cleanValue);
      valuesByKey.set(cleanKey, values);
    };

    for (const item of products) {
      for (const spec of item.specs ?? []) addValue(spec.key, spec.value);
    }
    for (const spec of form.specs) addValue(spec.key, spec.value);

    return valuesByKey;
  }, [products, form.specs]);
  const specValueOptionsFor = (spec: ProductSpec) => {
    const values = new Set(specValueOptionsByKey.get(spec.key.trim()) ?? []);
    if (spec.value.trim()) values.add(spec.value.trim());
    values.add("-");
    return [...values]
      .sort((a, b) => a.localeCompare(b, "tr-TR", { numeric: true }))
      .map((value) => ({ value, label: value }));
  };

  const muadilOptions = products.filter((p) => p.id !== product?.id && p.categoryCode !== OPTIONAL_EQUIPMENT_CATEGORY_CODE);
  const validMuadilIds = new Set(muadilOptions.map((p) => p.id));
  const selectedMuadilIds = form.muadilProductIds.filter((id) => validMuadilIds.has(id));
  const selectedMuadils = muadilOptions.filter((p) => selectedMuadilIds.includes(p.id));
  const selectedProductTypeLabel = form.productTypeCode
    ? PRODUCT_TYPE_OPTIONS.find((option) => option.code === form.productTypeCode)?.label ?? form.type
    : "";
  const selectedProductTypeTemplateCount = productSpecDefaults(form.productTypeCode).length;
  const technicalSpecGroups = useMemo(
    () => groupProductSpecsForType(form.productTypeCode, form.specs.map((spec, index) => ({ ...spec, index }))),
    [form.productTypeCode, form.specs],
  );
  const groupMuadils = (items: Product[]) =>
    items.reduce<Record<string, Product[]>>((acc, item) => {
      const key = item.category || "Kategorisiz";
      acc[key] = [...(acc[key] ?? []), item];
      return acc;
    }, {});
  const muadilGroups = groupMuadils(muadilOptions);
  const selectedMuadilGroups = groupMuadils(selectedMuadils);
  const toggleMuadil = (id: string) => {
    setForm((current) => ({
      ...current,
      muadilProductIds: current.muadilProductIds.includes(id)
        ? current.muadilProductIds.filter((item) => item !== id)
        : [...current.muadilProductIds, id],
    }));
  };

  // Grup/kategori/alt kategori değişince mevcut ürün tipi artık uymuyorsa sıfırla
  const keepTypeIfValid = (categoryCode: string, subcategoryCode: string, groupCode: string) => {
    const opt = PRODUCT_TYPE_OPTIONS.find((o) => o.code === form.productTypeCode);
    if (opt && isTypeAllowed(opt, categoryCode, subcategoryCode, groupCode)) {
      return { productTypeCode: form.productTypeCode, type: form.type };
    }
    return { productTypeCode: "", type: "" };
  };

  // Ürün tipi/kategori değişse de sabit teknik katalog korunur.
  const specsAfterChange = (kept: { productTypeCode: string }) =>
    specsForSelectedProductType(form.specs, kept.productTypeCode);

  const onProductGroupChange = (code: string) => {
    // Ürün Grubu → Ürün Kategorisi → Ürün Alt Kategorisi → Ürün Tipi: grup değişince,
    // katalogdaki Ürün Tipi seçili gruba artık uymuyorsa sıfırlanır.
    const kept = keepTypeIfValid(form.categoryCode, form.subcategoryCode, code);
    setForm({
      ...form,
      productGroupCode: code,
      productGroup: findLabel(PRODUCT_GROUPS, code),
      ...kept,
      brand: "",
      specs: specsAfterChange(kept),
    });
  };

  const onCategoryChange = (code: string) => {
    const subcategoryOptions = subcategoriesForProductCategory(code);
    const usesSubcategory = subcategoryOptions.length > 0;
    const subcategoryCode = usesSubcategory && subcategoryOptions.some((option) => option.code === form.subcategoryCode)
      ? form.subcategoryCode
      : subcategoryOptions[0]?.code ?? "";
    const subcategory = usesSubcategory ? findLabel(PRODUCT_SUBCATEGORIES, subcategoryCode, subcategoryOptions[0]?.label ?? "") : "";
    const machineType = code === "OPSIYONEL_DONANIM" ? form.compatibleMachineType : "";
    const kept = keepTypeIfValid(code, subcategoryCode, form.productGroupCode);
    setForm({
      ...form,
      categoryCode: code,
      category: findLabel(PRODUCT_CATEGORIES, code),
      subcategoryCode,
      subcategory,
      compatibleMachineType: machineType,
      optionalCompatibilityGroupCodes: code === OPTIONAL_EQUIPMENT_CATEGORY_CODE ? form.optionalCompatibilityGroupCodes : [],
      optionalCompatibilityCategoryCodes: code === OPTIONAL_EQUIPMENT_CATEGORY_CODE ? form.optionalCompatibilityCategoryCodes : [],
      optionalCompatibilitySubcategoryCodes: code === OPTIONAL_EQUIPMENT_CATEGORY_CODE ? form.optionalCompatibilitySubcategoryCodes : [],
      optionalCompatibilityTypeCodes: code === OPTIONAL_EQUIPMENT_CATEGORY_CODE ? form.optionalCompatibilityTypeCodes : [],
      optionalCompatibilityBrandIds: code === OPTIONAL_EQUIPMENT_CATEGORY_CODE ? form.optionalCompatibilityBrandIds : [],
      ...kept,
      brand: "",
      specs: specsAfterChange(kept),
    });
  };

  const onSubcategoryChange = (code: string) => {
    const kept = keepTypeIfValid(form.categoryCode, code, form.productGroupCode);
    setForm({
      ...form,
      subcategoryCode: code,
      subcategory: findLabel(PRODUCT_SUBCATEGORIES, code),
      ...kept,
      brand: "",
      specs: specsAfterChange(kept),
    });
  };

  const onTypeChange = (code: string) => {
    const opt = PRODUCT_TYPE_OPTIONS.find((item) => item.code === code);
    if (!opt) return;
    const categoryCode = opt.categoryCode ?? form.categoryCode;
    const subcategoryCode = opt.subcategoryCode ?? form.subcategoryCode;
    setForm({
      ...form,
      productTypeCode: opt.code,
      type: opt.label,
      categoryCode,
      category: findLabel(PRODUCT_CATEGORIES, categoryCode, form.category),
      subcategoryCode,
      subcategory: findLabel(PRODUCT_SUBCATEGORIES, subcategoryCode, form.subcategory),
      brand: opt.code === form.productTypeCode ? form.brand : "",
      specs: specsForSelectedProductType(form.specs, opt.code),
    });
    void productService
      .specTemplates(opt.code)
      .then((rows) => {
        const templateSpecs = (rows ?? [])
          .filter((row: any) => row.isActive !== false && row.specKey)
          .map((row: any) => ({
            key: row.specKey,
            value: row.defaultValue ?? "",
            unit: row.specUnit ?? "",
            specUnit: row.specUnit ?? "",
            groupCode: row.specGroupCode ?? undefined,
          }));
        if (!templateSpecs.length) return;
        setForm((current) => {
          if (current.productTypeCode !== opt.code) return current;
          return { ...current, specs: specsForSelectedProductType([...current.specs, ...templateSpecs], opt.code) };
        });
      })
      .catch(() => undefined);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (!form.productTypeCode) {
      toast.error("Ürün tipi seçin");
      return;
    }
    if ((!isLaborProduct && !form.brand.trim()) || !form.shortDescription.trim()) {
      toast.error(isLaborProduct ? "Ürün adı zorunludur" : "Marka ve ürün adı zorunludur");
      return;
    }
    const cleanSpecs = catalogSpecs(form.specs, "-", form.productTypeCode).filter((s) => s.key.trim());
    const modelCode = form.stockCode.trim() || form.model.trim() || compactProductCode(form.shortDescription) || "URUN";
    const payload = {
      brand: isLaborProduct ? (form.brand.trim() || "Haksan") : form.brand.trim(),
      productGroup: form.productGroup,
      productGroupCode: form.productGroupCode,
      model: modelCode,
      modelName: form.modelName.trim(),
      type: form.type.trim() || "—",
      productTypeCode: form.productTypeCode,
      controlPanel: form.controlPanel.trim() || form.subcategory || "—",
      category: form.category,
      categoryCode: form.categoryCode,
      subcategory: form.subcategory,
      subcategoryCode: form.subcategoryCode,
      imageUrl: form.imageUrl.trim(),
      shortDescription: form.shortDescription.trim(),
      description: form.description.trim(),
      listPrice: moneyNumber(form.listPrice),
      cashPrice: form.cashPrice ? moneyNumber(form.cashPrice) : undefined,
      currency: form.currency,
      vatRate: Number(normalizeProductVatRate(form.vatRate)),
      originCountry: form.originCountry.trim(),
      hsCode: form.hsCode.trim(),
      stockCode: form.stockCode.trim(),
      supplierCompanyId: form.supplierCompanyId || null,
      optionalCompatibilityGroupCodes: form.optionalCompatibilityGroupCodes,
      optionalCompatibilityCategoryCodes: form.optionalCompatibilityCategoryCodes,
      optionalCompatibilitySubcategoryCodes: form.optionalCompatibilitySubcategoryCodes,
      optionalCompatibilityTypeCodes: form.optionalCompatibilityTypeCodes,
      optionalCompatibilityBrandIds: form.optionalCompatibilityBrandIds,
      specs: cleanSpecs,
      standardEquipment: form.standardEquipment,
      optionalEquipment: form.optionalEquipment,
      compatibleMachineTypeCode: form.compatibleMachineType || null,
      muadilProductId: isOptionalEquipmentProduct ? null : (selectedMuadilIds[0] ?? null),
      muadilProductIds: isOptionalEquipmentProduct ? [] : selectedMuadilIds,
      status: form.status,
    };

    setSubmitting(true);
    try {
      if (mode === "edit" && product) {
        await updateProduct(product.id, payload);
        toast.success("Ürün güncellendi", { description: `${payload.brand} ${payload.model}` });
      } else {
        const p = await addProduct(payload);
        toast.success("Ürün oluşturuldu", { description: `${p.brand} ${p.model}` });
      }
      reset();
      setOpen(false);
    } catch (err: any) {
      toast.error(mode === "edit" ? "Ürün güncellenemedi" : "Ürün oluşturulamadı", { description: err?.message ?? "API isteği başarısız oldu." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="w-[95vw] sm:max-w-[1180px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "edit" ? "Ürünü Düzenle" : "Yeni Ürün"}</DialogTitle>
          <DialogDescription>
            Ürün sınıflandırması, fiyat, stok kodu, fotoğraf ve teknik bilgileri tek ekranda yönetin.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="overflow-hidden rounded-lg border border-border/70 bg-white">
            <ProductSheetRow label="Ürün Grubu">
              <Select
                value={form.productGroupCode}
                onValueChange={onProductGroupChange}
              >
                <SelectTrigger className="h-8 max-w-xs"><SelectValue placeholder="Grup seçin" /></SelectTrigger>
                <SelectContent>
                  {PRODUCT_GROUPS.map((o) => <SelectItem key={o.code} value={o.code}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </ProductSheetRow>

            <ProductSheetRow label="Ürün Kategorisi">
              <Select value={form.categoryCode} onValueChange={onCategoryChange}>
                <SelectTrigger className="h-8 max-w-xs"><SelectValue placeholder="Kategori seçin" /></SelectTrigger>
                <SelectContent>
                  {productCategoryOptions.map((o) => <SelectItem key={o.code} value={o.code}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </ProductSheetRow>

            {categoryUsesSubcategory && (
              <ProductSheetRow label="Ürün Alt Kategorisi">
                <Select value={form.subcategoryCode} onValueChange={onSubcategoryChange}>
                  <SelectTrigger className="h-8 max-w-xs"><SelectValue placeholder="Alt kategori seçin" /></SelectTrigger>
                  <SelectContent>
                    {availableProductSubcategories.map((o) => <SelectItem key={o.code} value={o.code}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </ProductSheetRow>
            )}

            <ProductSheetRow label="Ürün Tipi">
              <Select value={form.productTypeCode} onValueChange={onTypeChange}>
                <SelectTrigger className="h-8 max-w-md">
                  <SelectValue placeholder={typeGroups.length ? "Ürün tipi seçin" : "Önce kategori seçin"} />
                </SelectTrigger>
                <SelectContent>
                  {typeGroups.length === 0 ? (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">
                      {isMachineProduct
                        ? "Bu ürün grubu için tezgah tipi tanımlı değil"
                        : "Bu kategori için ürün tipi yok"}
                    </div>
                  ) : (
                    typeGroups.map((group) => (
                      <SelectGroup key={group.label}>
                        <SelectLabel>{group.label}</SelectLabel>
                        {group.options.map((o) => <SelectItem key={o.code} value={o.code}>{o.label}</SelectItem>)}
                      </SelectGroup>
                    ))
                  )}
                </SelectContent>
              </Select>
            </ProductSheetRow>

            {!isLaborProduct && (
              <ProductSheetRow label="Ürün Markası">
                <Select
                  value={form.brand}
                  onValueChange={(v) => setForm({ ...form, brand: v })}
                  disabled={!canSelectProductBrand}
                >
                  <SelectTrigger className="h-8 max-w-xs">
                    <SelectValue placeholder={canSelectProductBrand ? "Marka seçin" : "Önce ürün tipi seçin"} />
                  </SelectTrigger>
                  <SelectContent>
                    {productBrandOptions.map((brand) => <SelectItem key={brand} value={brand}>{brand}</SelectItem>)}
                  </SelectContent>
                </Select>
              </ProductSheetRow>
            )}

            {isMachineProduct && (
              <ProductSheetRow label="Ürün Tedarikçisi">
                <Select
                  value={form.supplierCompanyId || "__none"}
                  onValueChange={(v) => setForm({ ...form, supplierCompanyId: v === "__none" ? "" : v })}
                >
                  <SelectTrigger className="h-8 max-w-md"><SelectValue placeholder="Tedarikçi seçin" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Belirtilmedi</SelectItem>
                    {supplierOptions.map((supplier) => (
                      <SelectItem key={supplier.id} value={supplier.id}>{supplier.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </ProductSheetRow>
            )}

            {isOptionalEquipmentProduct && (
              <>
                <ProductSheetRow label="Uyumlu Ürün Grupları" className="items-start">
                  <MultiSelect
                    options={compatibilityGroupOptions}
                    selected={form.optionalCompatibilityGroupCodes}
                    onChange={(next) => setForm({ ...form, optionalCompatibilityGroupCodes: next })}
                    placeholder="Grup seçin"
                  />
                </ProductSheetRow>
                <ProductSheetRow label="Uyumlu Ürün Kategorileri" className="items-start">
                  <MultiSelect
                    options={compatibilityCategoryOptions}
                    selected={form.optionalCompatibilityCategoryCodes}
                    onChange={(next) => setForm({ ...form, optionalCompatibilityCategoryCodes: next })}
                    placeholder="Kategori seçin"
                  />
                </ProductSheetRow>
                <ProductSheetRow label="Uyumlu Ürün Alt Kategorileri" className="items-start">
                  <MultiSelect
                    options={compatibilitySubcategoryOptions}
                    selected={form.optionalCompatibilitySubcategoryCodes}
                    onChange={(next) => setForm({ ...form, optionalCompatibilitySubcategoryCodes: next })}
                    placeholder="Alt kategori seçin"
                  />
                </ProductSheetRow>
                <ProductSheetRow label="Uyumlu Ürün Tipleri" className="items-start">
                  <MultiSelect
                    options={compatibilityTypeOptions}
                    selected={form.optionalCompatibilityTypeCodes}
                    onChange={(next) => setForm({ ...form, optionalCompatibilityTypeCodes: next })}
                    placeholder="Tip seçin"
                  />
                </ProductSheetRow>
                <ProductSheetRow label="Uyumlu Ürün Markaları" className="items-start">
                  <MultiSelect
                    options={compatibilityBrandOptions}
                    selected={form.optionalCompatibilityBrandIds}
                    onChange={(next) => setForm({ ...form, optionalCompatibilityBrandIds: next })}
                    placeholder="Marka seçin"
                    emptyText="Marka bulunamadı"
                  />
                </ProductSheetRow>
              </>
            )}

            <ProductSheetRow label="Ürün Adı">
              <Input className="h-8" value={form.shortDescription} onChange={(e) => setForm({ ...form, shortDescription: e.target.value })} placeholder="Ürün adı" />
            </ProductSheetRow>

            <ProductSheetRow label="Ürün Para Birimi">
              <ChoiceGrid
                value={form.currency}
                options={PRODUCT_CURRENCIES}
                onChange={(code) => setForm({ ...form, currency: code as ProductFormState["currency"] })}
              />
            </ProductSheetRow>

            <ProductSheetRow label="Liste Fiyatı">
              <Input className="h-8 max-w-xs" inputMode="decimal" value={form.listPrice} onChange={(e) => setForm({ ...form, listPrice: e.target.value })} placeholder="0" />
            </ProductSheetRow>

            <ProductSheetRow label="Peşin Fiyatı">
              <Input className="h-8 max-w-xs" inputMode="decimal" value={form.cashPrice} onChange={(e) => setForm({ ...form, cashPrice: e.target.value })} placeholder="0" />
            </ProductSheetRow>

            {!isLaborProduct && (
              <>
                <ProductSheetRow label="Menşei">
                  <Input className="h-8 max-w-xs" value={form.originCountry} onChange={(e) => setForm({ ...form, originCountry: e.target.value })} placeholder="Ülke" />
                </ProductSheetRow>

                <ProductSheetRow label="GTIP Kodu">
                  <Input className="h-8 max-w-xs" value={form.hsCode} onChange={(e) => setForm({ ...form, hsCode: e.target.value })} />
                </ProductSheetRow>
              </>
            )}

            <ProductSheetRow label="Ürün KDV">
              <ChoiceGrid
                value={form.vatRate}
                options={PRODUCT_VAT_RATES.map((rate) => ({ code: rate, label: `${rate}%` }))}
                onChange={(code) => setForm({ ...form, vatRate: code })}
              />
            </ProductSheetRow>

            <ProductSheetRow label="Ürün Stok Kodu">
              <Input className="h-8 max-w-xs" value={form.stockCode} onChange={(e) => setForm({ ...form, stockCode: e.target.value })} />
            </ProductSheetRow>

            <ProductSheetRow label="Ürün Fotoğrafı">
              <div className="grid gap-3 lg:grid-cols-[1fr_160px]">
                <div className="space-y-1.5">
                  <div className="flex gap-2">
                    <Input
                      className="h-8"
                      value={form.imageUrl}
                      onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
                      placeholder="https://... veya dosya yükleyin"
                    />
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={(e) => handleImageFile(e.target.files?.[0])}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1 shrink-0"
                      disabled={uploadingImage}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {uploadingImage ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                      {uploadingImage ? "Yükleniyor…" : "Yükle"}
                    </Button>
                    {form.imageUrl && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={() => setForm({ ...form, imageUrl: "" })}
                      >
                        <X className="size-4 text-muted-foreground" />
                      </Button>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">PNG, JPG veya WEBP · en fazla 25 MB</p>
                </div>
                <div className="h-20 overflow-hidden rounded-md border border-border/70 bg-muted/30 grid place-items-center">
                  {form.imageUrl ? (
                    <img src={form.imageUrl} alt="" className="h-full w-full object-cover" onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")} />
                  ) : (
                    <span className="text-[11px] text-muted-foreground">Fotoğraf yok</span>
                  )}
                </div>
              </div>
            </ProductSheetRow>

            <ProductSheetRow label="Durum">
              <Select value={form.status} onValueChange={(v: "active" | "passive") => setForm({ ...form, status: v })}>
                <SelectTrigger className="h-8 max-w-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Aktif</SelectItem>
                  <SelectItem value="passive">Pasif</SelectItem>
                </SelectContent>
              </Select>
            </ProductSheetRow>

            {!isLaborProduct && !isOptionalEquipmentProduct && (
            <ProductSheetRow label="Muadil Ürünler" className="items-start">
              <div className="space-y-3">
                {Object.entries(muadilGroups).length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">Muadil olarak seçilebilecek ürün yok.</p>
                ) : (
                  <div className="max-h-80 overflow-y-auto rounded-lg border border-border/70 bg-white">
                    {Object.entries(muadilGroups).map(([category, items]) => (
                      <div key={category} className="border-b border-border/60 last:border-b-0">
                        <div className="bg-muted/30 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{category}</div>
                        <div className="divide-y divide-border/60">
                          {items.map((p) => {
                            const active = form.muadilProductIds.includes(p.id);
                            return (
                              <div
                                key={p.id}
                                role="button"
                                tabIndex={0}
                                className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-muted/30"
                                onClick={() => toggleMuadil(p.id)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    toggleMuadil(p.id);
                                  }
                                }}
                              >
                                <Checkbox
                                  checked={active}
                                  onCheckedChange={() => toggleMuadil(p.id)}
                                  onClick={(e) => e.stopPropagation()}
                                  aria-label={`${[p.brand, p.model].filter(Boolean).join(" ") || p.shortDescription} muadil seçimi`}
                                />
                                <Package className="size-3.5 shrink-0 text-muted-foreground" />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate">{[p.brand, p.model].filter(Boolean).join(" ") || p.shortDescription}</span>
                                  <span className="block truncate text-[11px] text-muted-foreground">{p.type || p.stockCode || "—"}</span>
                                </span>
                                {p.listPrice ? (
                                  <span className="shrink-0 text-xs tabular-nums text-brand-blue">
                                    {p.listPrice.toLocaleString("tr-TR")} {p.currency}
                                  </span>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {selectedMuadils.length > 0 ? (
                  <div className="space-y-2 rounded-lg border border-blue-200 bg-brand-blue-soft p-2.5">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-brand-blue">Seçili Muadil Ürünler</div>
                    {Object.entries(selectedMuadilGroups).map(([category, items]) => (
                      <div key={category} className="space-y-1">
                        <div className="text-[10px] font-medium text-muted-foreground">{category}</div>
                        <div className="divide-y divide-blue-100 overflow-hidden rounded-md border border-blue-100 bg-white/70">
                          {items.map((p) => (
                            <div key={p.id} className="flex items-center justify-between gap-2 px-2 py-1.5 text-xs">
                              <span className="min-w-0 truncate">{p.brand} {p.model}</span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                                onClick={() => toggleMuadil(p.id)}
                                aria-label={`${p.brand} ${p.model} muadil seçimini kaldır`}
                              >
                                <X className="size-3.5" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground">Birden fazla muadil ürün kategori bazında seçilebilir.</p>
                )}
              </div>
            </ProductSheetRow>
            )}

            {!isLaborProduct && (
            <ProductSheetRow label="Teknik Bilgiler" className="items-start">
              <div className="space-y-2">
                {!form.productTypeCode ? (
                  <div className="rounded-md border border-dashed border-border/70 bg-muted/20 px-3 py-6 text-center">
                    <div className="text-sm font-medium">Teknik bilgiler ürün tipi seçilince gelir</div>
                    <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
                      Örneğin CNC Dik İşleme Merkezi seçildiğinde yalnızca o tipe ait tabla, eksen, fener mili, motor ve takım değiştirici alanları açılır.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                        <Badge variant="secondary">{selectedProductTypeLabel}</Badge>
                        <span>{selectedProductTypeTemplateCount || form.specs.length} teknik alan</span>
                        <span>Etiket ve birim sabittir; sadece değer girilir.</span>
                      </div>
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7"
                          onClick={() => setForm((f) => ({
                            ...f,
                            specs: specsForSelectedProductType(f.specs, f.productTypeCode),
                          }))}
                        >
                          Sabit listeyi tamamla
                        </Button>
                      </div>
                    </div>
                    {technicalSpecGroups.length ? (
                      <div className="space-y-2">
                        {technicalSpecGroups.map(({ group, specs }) => (
                          <div key={group.code} className="grid grid-cols-[48px_minmax(0,1fr)] overflow-hidden rounded-md border border-border/60 bg-white">
                            <div className="flex items-center justify-center border-r border-border/60 bg-muted/50 px-1 py-2">
                              <div className="rotate-180 text-center text-[10px] font-semibold uppercase tracking-[0.16em] text-foreground/80 [writing-mode:vertical-rl]">
                                {group.label}
                              </div>
                            </div>
                            <div className="min-w-0 divide-y divide-dotted divide-foreground/30">
                              {specs.map((s) => {
                                return (
                                  <div key={s.index} className="grid grid-cols-[minmax(160px,1fr)_minmax(140px,0.9fr)_88px_36px] items-center gap-2 px-2 py-1.5">
                                    <div className="min-w-0 truncate text-xs font-medium text-foreground" title={s.key}>
                                      {s.key}
                                    </div>
                                    <Combobox
                                      className="h-8 bg-white"
                                      options={specValueOptionsFor(s)}
                                      value={s.value}
                                      onChange={(value) => updSpec(s.index, { value })}
                                      placeholder="Boş / -"
                                      searchPlaceholder="Değer ara..."
                                      emptyText="Değer bulunamadı"
                                      onCreate={(value) => updSpec(s.index, { value })}
                                      createLabel={(query) => `"${query}" kullan`}
                                    />
                                    <div className="h-8 rounded-md border border-border/70 bg-muted/30 px-2 text-center text-xs leading-8 text-muted-foreground" title={s.unit ?? s.specUnit ?? ""}>
                                      {s.unit || s.specUnit || "-"}
                                    </div>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      title="Satırı kaldır"
                                      onClick={() => rmSpec(s.index)}
                                      aria-label={`${s.key} satırını kaldır`}
                                    >
                                      <Trash2 className="size-4 text-muted-foreground hover:text-destructive" />
                                    </Button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-md border border-dashed border-border/70 bg-muted/20 px-3 py-6 text-center text-sm text-muted-foreground">
                        Bu ürün tipi için kayıtlı teknik bilgi şablonu yok.
                      </div>
                    )}
                  </>
                )}
              </div>
            </ProductSheetRow>
            )}

          </div>

          {!isLaborProduct && (
            <ChipField
              label="Standart Donanımlar"
              chips={form.standardEquipment}
              input={stdInput}
              setInput={setStdInput}
              onAdd={() => addChip("standardEquipment", stdInput, setStdInput)}
              onRemove={(i) => rmChip("standardEquipment", i)}
              placeholder="Standart donanım ekleyip Enter'a basın"
            />
          )}

          {mode === "edit" && form.categoryCode === "TEZGAH" && (
            <OptionalEquipmentField
              chips={form.optionalEquipment}
              draft={optionalEquipmentDraft}
              setDraft={setOptionalEquipmentDraft}
              onAdd={addOptionalEquipment}
              onRemove={(i) => rmChip("optionalEquipment", i)}
              machineLabel={productMachineLabel(form)}
              machineDefaults={optionalEquipmentDefaultsForMachine(form)}
            />
          )}

          <div>
            <Label className="text-xs">Notlar</Label>
            <Textarea
              className="mt-1.5 min-h-[72px]"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Ürünle ilgili ek notlar"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={submitting}>İptal</Button>
            <Button type="submit" disabled={submitting}>{submitting ? "Kaydediliyor..." : mode === "edit" ? "Güncelle" : "Oluştur"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function OptionalEquipmentDialog({ trigger }: { trigger: React.ReactNode }) {
  const { products, updateProduct } = useStore();
  const [open, setOpen] = useState(false);
  const [machineId, setMachineId] = useState("");
  const [draft, setDraft] = useState<OptionalEquipmentDraft>(emptyOptionalEquipmentDraft);
  const [saving, setSaving] = useState(false);
  const machineProducts = useMemo(
    () => products
      .filter((p) => p.categoryCode === "TEZGAH" || p.category?.toLocaleLowerCase("tr-TR") === "tezgah")
      .slice()
      .sort((a, b) => productMachineLabel(a).localeCompare(productMachineLabel(b), "tr")),
    [products]
  );
  const selectedMachine = machineProducts.find((p) => p.id === machineId) ?? null;
  const selectedMachineLabel = selectedMachine ? productMachineLabel(selectedMachine) : "";

  const reset = () => {
    setMachineId("");
    setDraft(emptyOptionalEquipmentDraft());
    setSaving(false);
  };
  const handleOpen = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) reset();
  };
  const machineDefaults = optionalEquipmentDefaultsForMachine(selectedMachine);
  const persistEquipment = async (nextEquipment: string[], successMessage: string) => {
    if (!selectedMachine) {
      toast.error("Makine seçiniz");
      return;
    }
    setSaving(true);
    try {
      const machinePatch = Object.fromEntries(
        Object.entries(selectedMachine).filter(([key]) => key !== "id")
      ) as Omit<Product, "id">;
      await updateProduct(selectedMachine.id, { ...machinePatch, optionalEquipment: nextEquipment });
      toast.success(successMessage, { description: selectedMachineLabel });
    } catch (err: any) {
      toast.error("Opsiyonel donanım kaydedilemedi", { description: err?.message ?? "API isteği başarısız oldu." });
    } finally {
      setSaving(false);
    }
  };
  const addEquipment = async () => {
    if (!selectedMachine) {
      toast.error("Makine seçiniz");
      return;
    }
    if (!draft.product.trim()) {
      toast.error("Opsiyonel donanım için ürün alanı zorunludur");
      return;
    }
    const value = formatOptionalEquipment({ ...draft, machine: selectedMachineLabel });
    await persistEquipment([...(selectedMachine.optionalEquipment ?? []), value], "Opsiyonel donanım makineye eklendi");
    setDraft(optionalEquipmentDraftForMachine(selectedMachine));
  };
  const removeEquipment = async (index: number) => {
    if (!selectedMachine || saving) return;
    const nextEquipment = (selectedMachine.optionalEquipment ?? []).filter((_, itemIndex) => itemIndex !== index);
    await persistEquipment(nextEquipment, "Opsiyonel donanım kaldırıldı");
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="w-[95vw] sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Opsiyonel Donanım Ekle</DialogTitle>
          <DialogDescription>Mevcut tezgah seçerek opsiyonel donanım listesini yönetin.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-xs">Makine</Label>
            <Select value={machineId} onValueChange={setMachineId}>
              <SelectTrigger className="mt-1.5 h-9">
                <SelectValue placeholder="Makine seçin" />
              </SelectTrigger>
              <SelectContent>
                {machineProducts.length === 0 ? (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">Kayıtlı tezgah bulunamadı</div>
                ) : (
                  machineProducts.map((machine) => (
                    <SelectItem key={machine.id} value={machine.id}>
                      {[productMachineLabel(machine), machine.type].filter(Boolean).join(" · ")}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <OptionalEquipmentField
            chips={selectedMachine?.optionalEquipment ?? []}
            draft={draft}
            setDraft={setDraft}
            onAdd={() => void addEquipment()}
            onRemove={(index) => void removeEquipment(index)}
            machineLabel={selectedMachineLabel}
            machineDefaults={machineDefaults}
            disabled={!selectedMachine || saving}
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpen(false)}>Kapat</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProductSheetRow({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`grid grid-cols-1 border-b border-border/60 last:border-b-0 md:grid-cols-[220px_minmax(0,1fr)] ${className}`}>
      <div className="bg-muted/35 px-3 py-2 text-[12px] font-semibold uppercase tracking-wide text-foreground md:border-r md:border-border/60">
        {label}
      </div>
      <div className="min-w-0 px-3 py-2">{children}</div>
    </div>
  );
}

function ChoiceGrid({ value, options, onChange }: { value: string; options: ProductOption[]; onChange: (code: string) => void }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {options.map((option) => {
        const active = value === option.code;
        return (
          <button
            key={option.code}
            type="button"
            onClick={() => onChange(option.code)}
            className={`min-h-8 rounded-md border px-2 py-1 text-left text-xs font-medium transition-colors ${
              active ? "border-primary bg-primary/10 text-primary" : "border-border/70 bg-white hover:border-primary/50 hover:bg-primary/5"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function ChipField({ label, chips, input, setInput, onAdd, onRemove, placeholder }: {
  label: string; chips: string[]; input: string; setInput: (v: string) => void;
  onAdd: () => void; onRemove: (i: number) => void; placeholder?: string;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="mt-1.5 flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onAdd(); } }}
          placeholder={placeholder}
        />
        <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={onAdd}>
          <Plus className="size-4" />
        </Button>
      </div>
      <div className="mt-2 overflow-hidden rounded-md border border-border/70">
        {chips.length === 0 ? (
          <div className="px-3 py-3 text-xs text-muted-foreground">Henüz eklenmedi</div>
        ) : (
          <ol className="divide-y divide-border/60">
            {chips.map((c, i) => (
              <li key={`${c}-${i}`} className="group flex min-w-0 items-start gap-3 px-3 py-2">
                <span className="mt-0.5 min-w-6 text-right text-xs font-medium tabular-nums text-muted-foreground">
                  {i + 1}.
                </span>
                <span className="min-w-0 flex-1 whitespace-pre-wrap break-words text-sm leading-5">
                  {c}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => onRemove(i)}
                  aria-label={`${c} donanımını sil`}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function OptionalEquipmentField({
  chips,
  draft,
  setDraft,
  onAdd,
  onRemove,
  machineLabel = "",
  machineDefaults,
  disabled = false,
}: {
  chips: string[];
  draft: OptionalEquipmentDraft;
  setDraft: React.Dispatch<React.SetStateAction<OptionalEquipmentDraft>>;
  onAdd: () => void;
  onRemove: (i: number) => void;
  machineLabel?: string;
  machineDefaults?: Pick<OptionalEquipmentDraft, "serial" | "type" | "category">;
  disabled?: boolean;
}) {
  useEffect(() => {
    if (!machineLabel && !machineDefaults) return;
    setDraft((current) => {
      const machineChanged = Boolean(machineLabel) && current.machine !== machineLabel;
      const next: OptionalEquipmentDraft = {
        ...current,
        machine: machineLabel || current.machine,
        product: machineChanged ? "" : current.product,
        serial: machineDefaults?.serial && (machineChanged || !current.serial) ? machineDefaults.serial : current.serial,
        type: machineDefaults?.type && (machineChanged || !current.type) ? machineDefaults.type : current.type,
        category: machineDefaults?.category && (machineChanged || !current.category) ? machineDefaults.category : current.category,
      };
      return next.machine === current.machine &&
        next.product === current.product &&
        next.serial === current.serial &&
        next.type === current.type &&
        next.category === current.category
        ? current
        : next;
    });
  }, [machineLabel, machineDefaults?.serial, machineDefaults?.type, machineDefaults?.category, setDraft]);

  const update = (key: keyof OptionalEquipmentDraft, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };
  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      onAdd();
    }
  };

  return (
    <div>
      <Label className="text-xs">Opsiyonel Donanımlar</Label>
      <div className="mt-1.5 grid gap-2 lg:grid-cols-[1.2fr_0.9fr_0.9fr_0.9fr_40px]">
        <Input
          value={draft.product}
          onChange={(e) => update("product", e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ürün"
          aria-label="Opsiyonel donanım ürün"
          disabled={disabled}
        />
        <Input
          value={draft.serial}
          onChange={(e) => update("serial", e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Seri"
          aria-label="Opsiyonel donanım seri"
          disabled={disabled}
        />
        <Input
          value={draft.type}
          onChange={(e) => update("type", e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Tip"
          aria-label="Opsiyonel donanım tip"
          disabled={disabled}
        />
        <Input
          value={draft.category}
          onChange={(e) => update("category", e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Kategori"
          aria-label="Opsiyonel donanım kategori"
          disabled={disabled}
        />
        <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={onAdd} aria-label="Opsiyonel donanım ekle" disabled={disabled}>
          <Plus className="size-4" />
        </Button>
      </div>
      <div className="mt-2 overflow-hidden rounded-md border border-border/70">
        {chips.length === 0 ? (
          <div className="px-3 py-3 text-xs text-muted-foreground">Henüz eklenmedi</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-muted/35 text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="w-12 px-3 py-2 text-right font-semibold">#</th>
                  <th className="px-3 py-2 text-left font-semibold">Makine</th>
                  <th className="px-3 py-2 text-left font-semibold">Ürün</th>
                  <th className="px-3 py-2 text-left font-semibold">Seri</th>
                  <th className="px-3 py-2 text-left font-semibold">Tip</th>
                  <th className="px-3 py-2 text-left font-semibold">Kategori</th>
                  <th className="w-12 px-2 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {chips.map((chip, index) => {
                  const item = parseOptionalEquipment(chip);
                  return (
                    <tr key={`${chip}-${index}`} className="align-top">
                      <td className="px-3 py-2 text-right text-xs font-medium tabular-nums text-muted-foreground">{index + 1}.</td>
                      <td className="px-3 py-2 text-muted-foreground">{item.machine || machineLabel || "—"}</td>
                      <td className="px-3 py-2">{item.product || "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{item.serial || "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{item.type || "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{item.category || "—"}</td>
                      <td className="px-2 py-1.5 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => onRemove(index)}
                          aria-label={`${item.product || chip} opsiyonel donanımını sil`}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", placeholder, className = "", name }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string; className?: string; name?: string;
}) {
  // name verilirse id/name olarak uygulanır → tarayıcı autofill uyarısını giderir.
  return (
    <div className={className}>
      <Label className="text-xs" htmlFor={name}>{label}</Label>
      <Input className="mt-1.5" id={name} name={name} type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

/* ---------- Sevkiyat ---------- */
type ShipmentTransportMode = "road" | "air" | "sea" | "local_cargo";
const TRANSPORT_MODE_LABELS: Record<ShipmentTransportMode, string> = {
  road: "Karayolu",
  air: "Havayolu",
  sea: "Deniz Yolu",
  local_cargo: "Yerel Kargo",
};

type ShipmentLineForm = {
  id: string;
  productModelId: string;
  inventoryItemId: string;
  description: string;
  serialNumber: string;
  quantity: string;
  packageCount: string;
  palletCount: string;
  packageLengthCm: string;
  packageWidthCm: string;
  packageHeightCm: string;
  grossWeightKg: string;
  packageNotes: string;
};

const emptyShipmentLine = (): ShipmentLineForm => ({
  id: globalThis.crypto?.randomUUID?.() ?? `line-${Date.now()}-${Math.random()}`,
  productModelId: "",
  inventoryItemId: "",
  description: "",
  serialNumber: "",
  quantity: "1",
  packageCount: "1",
  palletCount: "0",
  packageLengthCm: "",
  packageWidthCm: "",
  packageHeightCm: "",
  grossWeightKg: "",
  packageNotes: "",
});

export function CreateShipmentDialog({ trigger, onCreated }: { trigger: React.ReactNode; onCreated?: () => void }) {
  const { addShipment, cases, customers, products, stock } = useStore();
  const customerName = (id: string) => customers.find((c) => c.id === id)?.name ?? "—";
  const [open, setOpen] = useState(false);
  const [warehouses, setWarehouses] = useState<Array<{ id: string; name: string }>>([]);
  const [senderCompanies, setSenderCompanies] = useState<Array<{ id: string; legalTitle: string; shortName?: string | null }>>([]);
  const [carrierCompanies, setCarrierCompanies] = useState<Array<{ id: string; legalTitle: string; shortName?: string | null }>>([]);
  // Satır bazında, seçilen tezgahla uyumlu opsiyonel donanım önerileri (ürün-id → sonuç önbelleği).
  const [optionalByLine, setOptionalByLine] = useState<Record<string, Array<{ id: string; label: string }>>>({});
  const optionalCache = useRef<Record<string, Array<{ id: string; label: string }>>>({});
  const emptyForm = () => ({
    salesCaseId: cases[0]?.id ?? "",
    senderCompanyId: "",
    senderName: "",
    carrierCompanyId: "",
    transportMode: "road" as ShipmentTransportMode,
    productCategoryCode: "TEZGAH" as StockCategoryCode,
    destinationWarehouseId: "",
    loadingDate: new Date().toISOString().slice(0, 10),
    trackingNo: `TRK-${Math.floor(100000 + Math.random() * 900000)}`,
    carrier: "",
    origin: "",
    destination: "",
    eta: new Date().toISOString().slice(0, 10),
    status: "Hazırlanıyor" as ShipmentStatus,
    items: [emptyShipmentLine()],
  });
  const [form, setForm] = useState(emptyForm);
  const reset = () => setForm(emptyForm());

  useEffect(() => {
    if (!open) return;
    inventoryService.listWarehouses()
      .then((rows) => setWarehouses(rows.map((w: any) => ({ id: w.id, name: w.name })).filter((w: any) => w.id && w.name)))
      .catch(() => setWarehouses([]));
    serviceService.shipmentCompanyOptions({ purpose: "sender" })
      .then(setSenderCompanies)
      .catch(() => setSenderCompanies([]));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    serviceService.shipmentCompanyOptions({ purpose: "carrier", transportMode: form.transportMode })
      .then((rows) => {
        setCarrierCompanies(rows);
        if (form.carrierCompanyId && !rows.some((row: any) => row.id === form.carrierCompanyId)) {
          setForm((prev) => ({ ...prev, carrierCompanyId: "", carrier: "" }));
        }
      })
      .catch(() => setCarrierCompanies([]));
  }, [open, form.transportMode]);

  const productOptions = useMemo(
    () => products.filter((p) => (p.categoryCode ?? "TEZGAH") === form.productCategoryCode),
    [products, form.productCategoryCode],
  );

  const updateLine = (id: string, patch: Partial<ShipmentLineForm>) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((line) => (line.id === id ? { ...line, ...patch } : line)),
    }));
  };

  // Seçilen tezgahla uyumlu opsiyonel donanımı getir (önbellekli); ürün temizlenince listeyi kaldır.
  const loadOptionalEquipment = async (lineId: string, productId: string) => {
    if (!productId) {
      setOptionalByLine((prev) => {
        const next = { ...prev };
        delete next[lineId];
        return next;
      });
      return;
    }
    if (optionalCache.current[productId]) {
      setOptionalByLine((prev) => ({ ...prev, [lineId]: optionalCache.current[productId] }));
      return;
    }
    try {
      const rows = await productService.compatibleOptionalEquipment(productId);
      const mapped = (rows ?? [])
        .map((r: any) => ({
          id: r.product?.id ?? r.id,
          label:
            r.product?.fullName ||
            [r.brand?.name, r.product?.modelName ?? r.product?.modelCode].filter(Boolean).join(" ") ||
            "Opsiyonel donanım",
        }))
        .filter((x: { id?: string }) => !!x.id);
      optionalCache.current[productId] = mapped;
      setOptionalByLine((prev) => ({ ...prev, [lineId]: mapped }));
    } catch {
      setOptionalByLine((prev) => ({ ...prev, [lineId]: [] }));
    }
  };

  // Opsiyonel donanımı yeni bir sevkiyat satırı olarak ekle (aynı ürün iki kez eklenmez).
  const addOptionalLine = (eq: { id: string; label: string }) => {
    setForm((prev) =>
      prev.items.some((l) => l.productModelId === eq.id)
        ? prev
        : { ...prev, items: [...prev.items, { ...emptyShipmentLine(), productModelId: eq.id, description: eq.label }] },
    );
  };

  const productLabel = (productId: string) => {
    const p = products.find((x) => x.id === productId);
    return [p?.brand, p?.model].filter(Boolean).join(" ") || p?.modelName || "Ürün";
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.trackingNo.trim()) return toast.error("Takip no giriniz");
    if (!form.senderCompanyId && !form.senderName.trim()) return toast.error("Gönderici firma seçin veya yazın");
    if (!form.carrierCompanyId && !form.carrier.trim()) return toast.error("Taşıyıcı firma seçin veya yazın");
    if (!form.destinationWarehouseId && !form.destination.trim()) return toast.error("Varış yeri seçin veya yazın");
    if (!form.items.length || form.items.some((line) => !line.productModelId && !line.description.trim())) {
      return toast.error("Ürün satırlarını tamamlayınız");
    }
    try {
      const carrier = carrierCompanies.find((c) => c.id === form.carrierCompanyId);
      const destinationWarehouse = warehouses.find((w) => w.id === form.destinationWarehouseId);
      await addShipment({
        salesCaseId: form.salesCaseId,
        senderCompanyId: form.senderCompanyId || undefined,
        senderName: form.senderName.trim() || undefined,
        carrierCompanyId: form.carrierCompanyId || undefined,
        transportMode: form.transportMode,
        productCategoryCode: form.productCategoryCode,
        destinationWarehouseId: form.destinationWarehouseId || undefined,
        destinationWarehouseName: destinationWarehouse?.name,
        loadingDate: form.loadingDate,
        trackingNo: form.trackingNo.trim(),
        carrier: form.carrierCompanyId ? (carrier?.shortName ?? carrier?.legalTitle ?? "") : form.carrier.trim(),
        origin: form.origin.trim(),
        destination: destinationWarehouse?.name ?? form.destination.trim(),
        eta: form.eta,
        status: form.status,
        items: form.items.map((line) => ({
          productModelId: line.productModelId,
          inventoryItemId: line.inventoryItemId || undefined,
          description: line.description.trim(),
          serialNumber: line.serialNumber || undefined,
          quantity: Number(line.quantity || 1),
          packageCount: line.packageCount ? Number(line.packageCount) : undefined,
          palletCount: line.palletCount ? Number(line.palletCount) : undefined,
          packageLengthCm: line.packageLengthCm ? Number(line.packageLengthCm) : undefined,
          packageWidthCm: line.packageWidthCm ? Number(line.packageWidthCm) : undefined,
          packageHeightCm: line.packageHeightCm ? Number(line.packageHeightCm) : undefined,
          grossWeightKg: line.grossWeightKg ? Number(line.grossWeightKg) : undefined,
          packageNotes: line.packageNotes.trim() || undefined,
        })),
      });
      toast.success("Sevkiyat oluşturuldu", { description: `${form.trackingNo} · ${TRANSPORT_MODE_LABELS[form.transportMode]}` });
      setOpen(false);
      reset();
      onCreated?.();
    } catch (err: any) {
      toast.error("Sevkiyat oluşturulamadı", { description: err?.message ?? "API isteği başarısız oldu." });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) reset(); }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Truck className="size-5 text-primary" /> Yeni Sevkiyat</DialogTitle>
          <DialogDescription>Seri no, paket ve palet bilgileriyle sevkiyat kaydı oluşturun.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs" htmlFor="ship-case">Satış Kartı / Müşteri</Label>
              <Select value={form.salesCaseId || "none"} onValueChange={(v) => setForm({ ...form, salesCaseId: v === "none" ? "" : v })}>
                <SelectTrigger id="ship-case" className="mt-1.5"><SelectValue placeholder="Satış kartı seçin..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Bağımsız sevkiyat</SelectItem>
                  {cases.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{customerName(c.customerId)} · {c.requestedProduct}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Gönderici Firma *</Label>
              <div className="mt-1.5">
                <FreeTextCombobox
                  idValue={form.senderCompanyId}
                  textValue={form.senderName}
                  options={senderCompanies.map((c) => ({ value: c.id, label: c.shortName ?? c.legalTitle }))}
                  onPick={(id) => setForm({ ...form, senderCompanyId: id, senderName: "" })}
                  onFreeText={(t) => setForm({ ...form, senderCompanyId: "", senderName: t })}
                  placeholder="Firma seçin veya yazın"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs" htmlFor="ship-mode">Sevkiyat Türü *</Label>
              <Select value={form.transportMode} onValueChange={(v: ShipmentTransportMode) => setForm({ ...form, transportMode: v })}>
                <SelectTrigger id="ship-mode" className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TRANSPORT_MODE_LABELS).map(([code, label]) => <SelectItem key={code} value={code}>{label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Taşıyıcı Firma *</Label>
              <div className="mt-1.5">
                <FreeTextCombobox
                  idValue={form.carrierCompanyId}
                  textValue={form.carrier}
                  options={carrierCompanies.map((c) => ({ value: c.id, label: c.shortName ?? c.legalTitle }))}
                  onPick={(id) => setForm({ ...form, carrierCompanyId: id, carrier: "" })}
                  onFreeText={(t) => setForm({ ...form, carrierCompanyId: "", carrier: t })}
                  placeholder="Firma seçin veya yazın"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs" htmlFor="ship-category">Ürün Kategorisi</Label>
              <Select
                value={form.productCategoryCode}
                onValueChange={(v: StockCategoryCode) => setForm({ ...form, productCategoryCode: v, items: [emptyShipmentLine()] })}
              >
                <SelectTrigger id="ship-category" className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STOCK_CATEGORY_CODES.map((code) => <SelectItem key={code} value={code}>{STOCK_CATEGORY_LABELS[code]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Varış Yeri *</Label>
              <div className="mt-1.5">
                <FreeTextCombobox
                  idValue={form.destinationWarehouseId}
                  textValue={form.destination}
                  options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
                  onPick={(id) => setForm({ ...form, destinationWarehouseId: id, destination: "" })}
                  onFreeText={(t) => setForm({ ...form, destinationWarehouseId: "", destination: t })}
                  placeholder="Depo seçin veya yazın"
                />
              </div>
            </div>
            <Field label="Takip No *" name="ship-tracking" value={form.trackingNo} onChange={(v) => setForm({ ...form, trackingNo: v })} placeholder="TRK-000000" />
            <Field label="Çıkış" name="ship-origin" value={form.origin} onChange={(v) => setForm({ ...form, origin: v })} placeholder="Hamburg" />
            <Field label="Yüklenme Tarihi" name="ship-loading-date" type="date" value={form.loadingDate} onChange={(v) => setForm({ ...form, loadingDate: v })} />
            <Field label="Tahmini Varış (ETA)" name="ship-eta" type="date" value={form.eta} onChange={(v) => setForm({ ...form, eta: v })} />
            <div>
              <Label className="text-xs" htmlFor="ship-status">Durum</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as ShipmentStatus })}>
                <SelectTrigger id="ship-status" className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SHIPMENT_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Ürün ve Paket Satırları</Label>
              <Button type="button" variant="outline" size="sm" onClick={() => setForm({ ...form, items: [...form.items, emptyShipmentLine()] })}>
                <Plus className="size-4 mr-1" /> Satır
              </Button>
            </div>
            {form.items.map((line, index) => {
              const serialOptions = stock.filter((s) =>
                (s.categoryCode ?? "TEZGAH") === form.productCategoryCode &&
                (!line.productModelId || s.productId === line.productModelId)
              );
              return (
                <div key={line.id} className="rounded-lg border border-border/70 p-3 space-y-3">
                  <div className="grid grid-cols-12 gap-2">
                    <div className="col-span-4">
                      <Label className="text-xs">Ürün *</Label>
                      <div className="mt-1.5">
                        <FreeTextCombobox
                          idValue={line.productModelId}
                          textValue={line.productModelId ? "" : line.description}
                          options={productOptions.map((p) => ({ value: p.id, label: `${[p.brand, p.model].filter(Boolean).join(" ")}${p.type ? ` · ${p.type}` : ""}` }))}
                          onPick={(v) => {
                            updateLine(line.id, {
                              productModelId: v,
                              inventoryItemId: "",
                              serialNumber: "",
                              description: productLabel(v),
                            });
                            void loadOptionalEquipment(line.id, v);
                          }}
                          onFreeText={(t) => {
                            updateLine(line.id, { productModelId: "", inventoryItemId: "", description: t });
                            void loadOptionalEquipment(line.id, "");
                          }}
                          placeholder="Ürün seçin veya yazın"
                        />
                      </div>
                    </div>
                    <div className="col-span-3">
                      <Label className="text-xs">Seri No</Label>
                      <div className="mt-1.5">
                        <FreeTextCombobox
                          idValue={line.inventoryItemId}
                          textValue={line.serialNumber}
                          options={serialOptions.map((s) => ({ value: s.id, label: `${s.serialNumber} · ${s.brand} ${s.counterModel}` }))}
                          onPick={(v) => {
                            const item = stock.find((s) => s.id === v);
                            updateLine(line.id, {
                              inventoryItemId: v,
                              productModelId: item?.productId ?? line.productModelId,
                              serialNumber: item?.serialNumber ?? "",
                              description: line.description || [item?.brand, item?.counterModel].filter(Boolean).join(" "),
                            });
                          }}
                          onFreeText={(t) => updateLine(line.id, { inventoryItemId: "", serialNumber: t })}
                          placeholder="Seri no seçin veya yazın"
                        />
                      </div>
                    </div>
                    <Field className="col-span-3" label="Açıklama *" value={line.description} onChange={(v) => updateLine(line.id, { description: v })} placeholder="Ürün açıklaması" />
                    <div className="col-span-1">
                      <Field label="Adet" type="number" value={line.quantity} onChange={(v) => updateLine(line.id, { quantity: v })} />
                    </div>
                    <div className="col-span-1 flex items-end justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={form.items.length === 1}
                        onClick={() => setForm((prev) => ({ ...prev, items: prev.items.filter((item) => item.id !== line.id) }))}
                        aria-label={`Satır ${index + 1} sil`}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-6 gap-2">
                    <Field label="Paket" type="number" value={line.packageCount} onChange={(v) => updateLine(line.id, { packageCount: v })} />
                    <Field label="Palet" type="number" value={line.palletCount} onChange={(v) => updateLine(line.id, { palletCount: v })} />
                    <Field label="Uzunluk cm" type="number" value={line.packageLengthCm} onChange={(v) => updateLine(line.id, { packageLengthCm: v })} />
                    <Field label="Genişlik cm" type="number" value={line.packageWidthCm} onChange={(v) => updateLine(line.id, { packageWidthCm: v })} />
                    <Field label="Yükseklik cm" type="number" value={line.packageHeightCm} onChange={(v) => updateLine(line.id, { packageHeightCm: v })} />
                    <Field label="Brüt kg" type="number" value={line.grossWeightKg} onChange={(v) => updateLine(line.id, { grossWeightKg: v })} />
                  </div>
                  <Field label="Paket Notu" value={line.packageNotes} onChange={(v) => updateLine(line.id, { packageNotes: v })} placeholder="Paket bilgisi" />
                  {(optionalByLine[line.id]?.length ?? 0) > 0 && (
                    <div className="rounded-md border border-dashed border-border/70 bg-muted/20 p-2.5">
                      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <Wrench className="size-3.5" /> Uyumlu Opsiyonel Donanım
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {optionalByLine[line.id]!.map((eq) => {
                          const added = form.items.some((l) => l.productModelId === eq.id);
                          return (
                            <Button
                              key={eq.id}
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7"
                              disabled={added}
                              onClick={() => addOptionalLine(eq)}
                            >
                              {added ? <Check className="size-3.5 mr-1" /> : <Plus className="size-3.5 mr-1" />}
                              {eq.label}
                            </Button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Vazgeç</Button>
            <Button type="submit">Sevkiyatı Kaydet</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Teslimat (Kurulum Tutanağı) ---------- */

export type DeliveryFormState = {
  customerId: string;
  salesCaseId: string;
  machineId: string;
  date: string;
  kurulumTarihi: string;
  formNo: string;
  signedBy: string;
  kurulumuYapan: string;
  ilgili: string;
  status: DeliveryStatus;
  tezgahMarka: string;
  tezgahTip: string;
  tezgahModel: string;
  tezgahSeriNo: string;
  cncMarka: string;
  cncModel: string;
  cncSeriNo: string;
  cncMainSw: string;
  technicalSpecs: ProductSpec[];
};

function machineToDeliveryFields(m?: {
  brand?: string;
  type?: string;
  model: string;
  serialNumber: string;
  controlUnit?: string;
  controlUnitSerial?: string;
  technicalSpecs?: ProductSpec[];
}) {
  if (!m) return {};
  return {
    tezgahMarka: m.brand ?? "",
    tezgahTip: m.type ?? "",
    tezgahModel: m.model ?? "",
    tezgahSeriNo: m.serialNumber ?? "",
    cncMarka: m.controlUnit?.split(" ")[0] ?? "",
    cncModel: m.controlUnit?.split(" ").slice(1).join(" ") ?? "",
    cncSeriNo: m.controlUnitSerial ?? "",
    technicalSpecs: (m.technicalSpecs ?? []).map((spec) => ({ ...spec })),
  };
}

export function deliveryFormToPayload(form: DeliveryFormState) {
  return {
    formNo: form.formNo.trim() || undefined,
    kurulumTarihi: form.kurulumTarihi || undefined,
    machineId: form.machineId || undefined,
    ilgili: form.ilgili.trim() || undefined,
    kurulumuYapan: form.kurulumuYapan.trim() || undefined,
    tezgah: {
      marka: form.tezgahMarka.trim() || undefined,
      tip: form.tezgahTip.trim() || undefined,
      model: form.tezgahModel.trim() || undefined,
      seriNo: form.tezgahSeriNo.trim() || undefined,
    },
    cnc: {
      marka: form.cncMarka.trim() || undefined,
      model: form.cncModel.trim() || undefined,
      seriNo: form.cncSeriNo.trim() || undefined,
      mainSw: form.cncMainSw.trim() || undefined,
    },
    technicalSpecs: form.technicalSpecs
      .filter((spec) => spec.key.trim() && spec.value.trim())
      .map((spec) => ({
        key: spec.key.trim(),
        value: spec.value.trim(),
        unit: (spec.unit ?? spec.specUnit ?? "").trim() || undefined,
        specUnit: (spec.unit ?? spec.specUnit ?? "").trim() || undefined,
      })),
  };
}

export function deliveryToFormState(d: {
  customerId: string;
  salesCaseId: string;
  date: string;
  signedBy: string;
  status: DeliveryStatus;
  formData?: {
    formNo?: string;
    kurulumTarihi?: string;
    machineId?: string;
    ilgili?: string;
    kurulumuYapan?: string;
    tezgah?: { marka?: string; tip?: string; model?: string; seriNo?: string };
    cnc?: { marka?: string; model?: string; seriNo?: string; mainSw?: string };
    technicalSpecs?: ProductSpec[];
  };
}, contactPerson?: string): DeliveryFormState {
  const fd = d.formData;
  return {
    customerId: d.customerId,
    salesCaseId: d.salesCaseId,
    machineId: fd?.machineId ?? "",
    date: d.date,
    kurulumTarihi: fd?.kurulumTarihi ?? "",
    formNo: fd?.formNo ?? "",
    signedBy: d.signedBy === "—" ? "" : d.signedBy,
    kurulumuYapan: fd?.kurulumuYapan ?? "",
    ilgili: fd?.ilgili ?? contactPerson ?? "",
    status: d.status,
    tezgahMarka: fd?.tezgah?.marka ?? "",
    tezgahTip: fd?.tezgah?.tip ?? "",
    tezgahModel: fd?.tezgah?.model ?? "",
    tezgahSeriNo: fd?.tezgah?.seriNo ?? "",
    cncMarka: fd?.cnc?.marka ?? "",
    cncModel: fd?.cnc?.model ?? "",
    cncSeriNo: fd?.cnc?.seriNo ?? "",
    cncMainSw: fd?.cnc?.mainSw ?? "",
    technicalSpecs: (fd?.technicalSpecs ?? []).map((spec) => ({ ...spec })),
  };
}

export function DeliveryFormFields({
  form,
  setForm,
  customers,
  casesForCustomer,
  machinesForCustomer,
  relatedDeliveries = [],
}: {
  form: DeliveryFormState;
  setForm: React.Dispatch<React.SetStateAction<DeliveryFormState>>;
  customers: Customer[];
  casesForCustomer: { id: string; requestedProduct: string }[];
  machinesForCustomer: {
    id: string;
    brand?: string;
    model: string;
    serialNumber: string;
    technicalSpecs?: ProductSpec[];
  }[];
  relatedDeliveries?: Delivery[];
}) {
  const applyMachine = (machineId: string) => {
    const m = machinesForCustomer.find((x) => x.id === machineId);
    setForm((prev) => ({
      ...prev,
      machineId,
      formNo: resolveServiceFormNo({
        currentFormNo: prev.formNo,
        relatedFormNo: relatedDeliveryFormNo(relatedDeliveries, { salesCaseId: prev.salesCaseId, machineId }),
        salesCaseId: prev.salesCaseId,
        machineId,
      }),
      ...machineToDeliveryFields(m as any),
    }));
  };

  return (
    <div className="space-y-4 max-h-[min(62dvh,560px)] overflow-y-auto pr-1">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label className="text-xs" htmlFor="del-customer">Müşteri *</Label>
          <Select
            value={form.customerId}
            onValueChange={(v) => {
              const cust = customers.find((c) => c.id === v);
              setForm({
                ...form,
                customerId: v,
                salesCaseId: "",
                machineId: "",
                ilgili: cust?.contactPerson ?? "",
                technicalSpecs: [],
              });
            }}
          >
            <SelectTrigger id="del-customer" className="mt-1.5"><SelectValue placeholder="Müşteri seçin..." /></SelectTrigger>
            <SelectContent>
              {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Satış Kartı</Label>
          <Select
            value={form.salesCaseId || "none"}
            onValueChange={(v) => {
              const salesCaseId = v === "none" ? "" : v;
              setForm({
                ...form,
                salesCaseId,
                formNo: resolveServiceFormNo({
                  currentFormNo: form.formNo,
                  relatedFormNo: relatedDeliveryFormNo(relatedDeliveries, { salesCaseId, machineId: form.machineId }),
                  salesCaseId,
                  machineId: form.machineId,
                }),
              });
            }}
          >
            <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Belirtilmedi</SelectItem>
              {casesForCustomer.map((c) => <SelectItem key={c.id} value={c.id}>{c.requestedProduct}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Makine / Tezgah</Label>
          <Select
            value={form.machineId || "none"}
            onValueChange={(v) => (
              v === "none"
                ? setForm({ ...form, machineId: "", technicalSpecs: [] })
                : applyMachine(v)
            )}
          >
            <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Belirtilmedi</SelectItem>
              {machinesForCustomer.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {[m.brand, m.model].filter(Boolean).join(" ")} · {m.serialNumber}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-3">
        <div className="text-xs font-medium text-foreground/80">Tarihler & Form</div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Tezgah Teslim Tarihi" type="date" value={form.date} onChange={(v) => setForm({ ...form, date: v })} />
          <Field label="Tezgah Kurulum Tarihi" type="date" value={form.kurulumTarihi} onChange={(v) => setForm({ ...form, kurulumTarihi: v })} />
          <Field label="Form No" value={form.formNo} onChange={(v) => setForm({ ...form, formNo: v })} placeholder="00001" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-border/60 p-3 space-y-2">
          <div className="text-xs font-medium text-center">Tezgah Bilgileri</div>
          <Field label="Tezgah Markası" value={form.tezgahMarka} onChange={(v) => setForm({ ...form, tezgahMarka: v })} />
          <Field label="Tezgah Tipi" value={form.tezgahTip} onChange={(v) => setForm({ ...form, tezgahTip: v })} />
          <Field label="Tezgah Modeli" value={form.tezgahModel} onChange={(v) => setForm({ ...form, tezgahModel: v })} />
          <Field label="Tezgah Seri No" value={form.tezgahSeriNo} onChange={(v) => setForm({ ...form, tezgahSeriNo: v })} />
        </div>
        <div className="rounded-lg border border-border/60 p-3 space-y-2">
          <div className="text-xs font-medium text-center">Kontrol Ünitesi Bilgileri</div>
          <Field label="Cnc Markası" value={form.cncMarka} onChange={(v) => setForm({ ...form, cncMarka: v })} />
          <Field label="Cnc Modeli" value={form.cncModel} onChange={(v) => setForm({ ...form, cncModel: v })} />
          <Field label="Cnc Seri No" value={form.cncSeriNo} onChange={(v) => setForm({ ...form, cncSeriNo: v })} />
          <Field label="Cnc Main S/W" value={form.cncMainSw} onChange={(v) => setForm({ ...form, cncMainSw: v })} />
        </div>
      </div>

      <div className="rounded-lg border border-border/60 p-3 space-y-2">
        <div className="text-xs font-medium text-center">Teknik Bilgiler</div>
        <ProductSpecsTable specs={form.technicalSpecs} emptyText="Seçilen makine için teknik bilgi bulunamadı." />
      </div>

      <div className="rounded-lg border border-border/60 p-3 space-y-2">
        <div className="text-xs font-medium text-center">İmza Bilgileri</div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="İlgili Kişi" value={form.ilgili} onChange={(v) => setForm({ ...form, ilgili: v })} />
          <Field label="Kurulumu Yapan" value={form.kurulumuYapan} onChange={(v) => setForm({ ...form, kurulumuYapan: v })} />
          <Field label="Tezgahı Teslim Alan" value={form.signedBy} onChange={(v) => setForm({ ...form, signedBy: v })} placeholder="Ad Soyad" />
          <div>
            <Label className="text-xs">Durum</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as DeliveryStatus })}>
              <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                {DELIVERY_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </div>
  );
}

export function CreateDeliveryDialog({ trigger, onCreated }: { trigger: React.ReactNode; onCreated?: () => void }) {
  const { addDelivery, cases, customers, machines, deliveries } = useStore();
  const customerName = (id: string) => customers.find((c) => c.id === id)?.name ?? "—";
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const emptyForm = (): DeliveryFormState => ({
    customerId: customers[0]?.id ?? "",
    salesCaseId: "",
    machineId: "",
    date: new Date().toISOString().slice(0, 10),
    kurulumTarihi: "",
    formNo: "",
    signedBy: "",
    kurulumuYapan: "",
    ilgili: customers[0]?.contactPerson ?? "",
    status: "Bekliyor",
    tezgahMarka: "",
    tezgahTip: "",
    tezgahModel: "",
    tezgahSeriNo: "",
    cncMarka: "",
    cncModel: "",
    cncSeriNo: "",
    cncMainSw: "",
    technicalSpecs: [],
  });
  const [form, setForm] = useState(emptyForm);
  const reset = () => setForm(emptyForm());
  const casesForCustomer = cases.filter((c) => c.customerId === form.customerId);
  const machinesForCustomer = machines.filter((m) => m.customerId === form.customerId);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customerId) return toast.error("Müşteri seçiniz");
    setSaving(true);
    try {
      await addDelivery({
        customerId: form.customerId,
        salesCaseId: form.salesCaseId,
        date: form.date,
        signedBy: form.signedBy.trim() || "—",
        status: form.status,
        formData: deliveryFormToPayload(form),
      });
      toast.success("Teslimat kaydı oluşturuldu", { description: `${customerName(form.customerId)} · ${form.date}` });
      setOpen(false);
      reset();
      onCreated?.();
    } catch (err: any) {
      toast.error("Teslimat kaydedilemedi", { description: err?.message ?? "Backend isteği başarısız oldu." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) reset(); }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="w-[min(760px,calc(100vw-2rem))] max-w-none sm:max-w-none">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ClipboardCheck className="size-5 text-primary" /> Yeni Teslimat / Kurulum Tutanağı</DialogTitle>
          <DialogDescription>DR.MAK kurulum tutanağı formatında teslimat bilgilerini girin.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <DeliveryFormFields
            form={form}
            setForm={setForm}
            customers={customers}
            casesForCustomer={casesForCustomer}
            machinesForCustomer={machinesForCustomer}
            relatedDeliveries={deliveries}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>Vazgeç</Button>
            <Button type="submit" disabled={saving}>{saving ? "Kaydediliyor..." : "Teslimatı Kaydet"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Kasa Hareketi (Ödeme) ---------- */
const PAYMENT_METHOD_LABELS = {
  bank_transfer: "Banka Havalesi",
  cash: "Nakit",
  credit_card: "Kredi Kartı",
  check: "Çek",
  other: "Diğer",
} as const;
type PaymentMethodCode = keyof typeof PAYMENT_METHOD_LABELS;
const PAYMENT_CURRENCIES = ["USD", "EUR", "TRY"] as const;
const PAYMENT_DOC_EXT_TO_MIME = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
} satisfies Record<string, AllowedMimeType>;
type PaymentDocExtension = keyof typeof PAYMENT_DOC_EXT_TO_MIME;
const fmtPaymentDocBytes = (b: number) =>
  b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`;
const paymentDocTypeLabel = (t: "AccountingInvoice" | "CommercialInvoice") =>
  t === "AccountingInvoice" ? "Fiş" : "Fatura";
const paymentDocMeta = (file: File): { extension: AllowedFileExtension; mimeType: AllowedMimeType } | null => {
  const ext = file.name.split(".").pop()?.toLocaleLowerCase("tr-TR") ?? "";
  if (!Object.prototype.hasOwnProperty.call(PAYMENT_DOC_EXT_TO_MIME, ext)) return null;
  const extension = ext as PaymentDocExtension;
  return { extension, mimeType: PAYMENT_DOC_EXT_TO_MIME[extension] };
};

/**
 * Manuel kasa hareketi oluşturma. Yön ('in' = alınan/giren, 'out' = ödenen/çıkan)
 * doğrudan companyId ile backend'e yazılır; alacağa (receivable) bağlanmaz.
 * Kaydedilen hareket backend tarafında 'paid' statüsüyle oluşur, yani anında
 * kasa bakiyesine yansır.
 */
export function CreatePaymentDialog({
  trigger,
  onCreated,
  defaultDirection = "in",
}: {
  trigger: React.ReactNode;
  onCreated?: () => void;
  defaultDirection?: "in" | "out";
}) {
  const { customers, addDocument } = useStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const emptyForm = () => ({
    direction: defaultDirection as "in" | "out",
    companyId: customers[0]?.id ?? "",
    amount: "",
    currencyCode: "USD" as (typeof PAYMENT_CURRENCIES)[number],
    paymentDate: new Date().toISOString().slice(0, 10),
    paymentMethod: "bank_transfer" as PaymentMethodCode,
    invoiceNo: "",
    notes: "",
  });
  const [form, setForm] = useState(emptyForm);
  const [docType, setDocType] = useState<"AccountingInvoice" | "CommercialInvoice">("CommercialInvoice");
  const [file, setFile] = useState<File | null>(null);
  const reset = () => {
    setForm(emptyForm());
    setDocType("CommercialInvoice");
    setFile(null);
    if (inputRef.current) inputRef.current.value = "";
  };
  const [saving, setSaving] = useState(false);

  const uploadInvoice = async (paymentId: string, companyId: string) => {
    if (!file) return;
    const meta = paymentDocMeta(file);
    if (!meta) throw new Error("Desteklenmeyen dosya tipi");
    const up = await fileService.signedUpload({
      bucket: "erp-invoice-documents",
      entityType: "company",
      entityId: companyId,
      filename: file.name,
      mimeType: meta.mimeType,
      extension: meta.extension,
      sizeBytes: file.size,
    });
    await fileService.uploadBinary(up, file, meta.mimeType);
    await fileService.link({
      fileId: up.fileId,
      entityType: "company",
      entityId: companyId,
      documentTypeCode: "commercial_invoice_pdf",
      description: `Kasa hareketi #${paymentId.toUpperCase()} · ${paymentDocTypeLabel(docType)}`,
    });
    await addDocument({
      id: up.fileId,
      fileId: up.fileId,
      salesCaseId: "",
      companyId,
      type: docType,
      fileName: file.name,
      size: fmtPaymentDocBytes(file.size),
      mimeType: meta.mimeType,
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.companyId) return toast.error("Firma seçiniz");
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) return toast.error("Geçerli bir tutar giriniz");
    if (!file) return toast.error("Fatura veya fiş dosyası seçiniz");
    if (file.size > 25 * 1024 * 1024) return toast.error("Dosya boyutu 25 MB'ı aşamaz");
    const meta = paymentDocMeta(file);
    if (!meta) {
      return toast.error("Desteklenmeyen dosya tipi", { description: "PDF, PNG, JPG, WEBP, DOCX veya XLSX" });
    }
    setSaving(true);
    try {
      let paymentId: string;
      if (form.direction === "in") {
        const receivable = await financeService.createReceivable({
          companyId: form.companyId,
          amount,
          currencyCode: form.currencyCode,
          dueDate: new Date(form.paymentDate),
          movementType: "manual",
          notes: form.notes || undefined,
          invoiceNo: form.invoiceNo || undefined,
        });
        const payment = await financeService.createPayment({
          direction: form.direction,
          receivableId: receivable.id,
          amount,
          currencyCode: form.currencyCode,
          paymentDate: new Date(form.paymentDate),
          paymentMethod: form.paymentMethod,
          notes: form.notes || undefined,
          invoiceNo: form.invoiceNo || undefined,
        });
        paymentId = payment.id;
      } else {
        const payment = await financeService.createPayment({
          direction: form.direction,
          companyId: form.companyId,
          amount,
          currencyCode: form.currencyCode,
          paymentDate: new Date(form.paymentDate),
          paymentMethod: form.paymentMethod,
          notes: form.notes || undefined,
          invoiceNo: form.invoiceNo || undefined,
        });
        paymentId = payment.id;
      }
      try {
        await uploadInvoice(paymentId, form.companyId);
      } catch (uploadErr: any) {
        toast.error("Hareket kaydedildi ancak fatura yüklenemedi", {
          description: uploadErr?.message ?? "Dosyayı detay ekranından tekrar ekleyebilirsiniz.",
        });
        setOpen(false);
        reset();
        onCreated?.();
        return;
      }
      toast.success(form.direction === "in" ? "Tahsilat (giren) eklendi" : "Ödeme (çıkan) eklendi", {
        description: `${paymentDocTypeLabel(docType)}: ${file.name}`,
      });
      setOpen(false);
      reset();
      onCreated?.();
    } catch (err: any) {
      toast.error("Kasa hareketi eklenemedi", { description: err?.message ?? "API isteği başarısız oldu." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) reset(); }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Yeni Kasa Hareketi</DialogTitle>
          <DialogDescription>Alınan (giren) veya ödenen (çıkan) hareket kaydedin. Fatura veya fiş dosyası zorunludur.</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          {/* Yön seçimi */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setForm({ ...form, direction: "in" })}
              className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                form.direction === "in"
                  ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                  : "border-border/60 text-muted-foreground hover:bg-muted/40"
              }`}
            >
              <Wallet className="size-4" /> Alınan (Giren)
            </button>
            <button
              type="button"
              onClick={() => setForm({ ...form, direction: "out" })}
              className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                form.direction === "out"
                  ? "border-red-300 bg-red-50 text-red-700"
                  : "border-border/60 text-muted-foreground hover:bg-muted/40"
              }`}
            >
              <Wallet className="size-4" /> Ödenen (Çıkan)
            </button>
          </div>

          <div>
            <Label className="text-xs">Firma *</Label>
            <Select value={form.companyId} onValueChange={(v) => setForm({ ...form, companyId: v })}>
              <SelectTrigger className="mt-1.5"><SelectValue placeholder="Firma seçin..." /></SelectTrigger>
              <SelectContent>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Tutar *" type="number" value={form.amount} placeholder="0" onChange={(v) => setForm({ ...form, amount: v })} />
            <div>
              <Label className="text-xs">Para Birimi</Label>
              <Select value={form.currencyCode} onValueChange={(v) => setForm({ ...form, currencyCode: v as (typeof PAYMENT_CURRENCIES)[number] })}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Tarih" type="date" value={form.paymentDate} onChange={(v) => setForm({ ...form, paymentDate: v })} />
            <Field label="Fatura No" value={form.invoiceNo} placeholder="FTR-2026-001" onChange={(v) => setForm({ ...form, invoiceNo: v })} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Ödeme Yöntemi</Label>
              <Select value={form.paymentMethod} onValueChange={(v) => setForm({ ...form, paymentMethod: v as PaymentMethodCode })}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethodCode[]).map((k) => (
                    <SelectItem key={k} value={k}>{PAYMENT_METHOD_LABELS[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-xs">Notlar</Label>
            <Textarea className="mt-1.5" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>

          <div className="rounded-lg border border-border/60 p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Receipt className="size-4 text-primary" />
              Fiş / Fatura *
            </div>
            <div className="flex items-center gap-2">
              <Select value={docType} onValueChange={(v) => setDocType(v as "AccountingInvoice" | "CommercialInvoice")}>
                <SelectTrigger className="h-9 w-24 bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="AccountingInvoice">Fiş</SelectItem>
                  <SelectItem value="CommercialInvoice">Fatura</SelectItem>
                </SelectContent>
              </Select>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="flex-1 min-w-0 rounded-md border border-dashed border-border/80 bg-muted/20 px-3 py-2 text-left text-sm hover:bg-muted/40 truncate"
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.xlsx"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                {file ? `${file.name} · ${fmtPaymentDocBytes(file.size)}` : "Dosya seç (PDF, görsel, ...)"}
              </button>
            </div>
            {!file && (
              <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Upload className="size-3" /> Hareket kaydı için fatura veya fiş yüklemeniz gerekir.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Vazgeç</Button>
            <Button type="submit" disabled={saving || !file}>{saving ? "Kaydediliyor..." : "Hareketi Kaydet"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Satış kartına bağlı beklenen tahsilat (receivable) oluşturur. Bir teklife
 * (quoteId) bağlandığında, alacak ilgili satış kartının "Ödemeler" sekmesinde
 * görünür. Kasa hareketinden farklı olarak burada dosya zorunlu değildir ve
 * kayıt "beklenen" (pending) statüsünde açılır.
 */
export function CreateReceivableDialog({
  trigger,
  onCreated,
  defaultCompanyId,
  quoteOptions = [],
  defaultQuoteId,
}: {
  trigger: React.ReactNode;
  onCreated?: () => void;
  defaultCompanyId?: string;
  quoteOptions?: { id: string; quoteNo: string; revision: number }[];
  defaultQuoteId?: string;
}) {
  const { customers } = useStore();
  const [open, setOpen] = useState(false);
  const emptyForm = () => ({
    companyId: defaultCompanyId ?? customers[0]?.id ?? "",
    quoteId: defaultQuoteId ?? quoteOptions[0]?.id ?? "",
    amount: "",
    currencyCode: "USD" as (typeof PAYMENT_CURRENCIES)[number],
    dueDate: new Date().toISOString().slice(0, 10),
    invoiceNo: "",
    notes: "",
  });
  const [form, setForm] = useState(emptyForm);
  const reset = () => setForm(emptyForm());
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.companyId) return toast.error("Firma seçiniz");
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) return toast.error("Geçerli bir tutar giriniz");
    if (!form.dueDate) return toast.error("Vade tarihi giriniz");
    setSaving(true);
    try {
      await financeService.createReceivable({
        companyId: form.companyId,
        quoteId: form.quoteId || undefined,
        amount,
        currencyCode: form.currencyCode,
        dueDate: new Date(form.dueDate),
        movementType: "manual",
        invoiceNo: form.invoiceNo || undefined,
        notes: form.notes || undefined,
      });
      toast.success("Tahsilat (beklenen) eklendi", {
        description: `${amount.toLocaleString()} ${form.currencyCode} · vade ${form.dueDate}`,
      });
      setOpen(false);
      reset();
      onCreated?.();
    } catch (err: any) {
      toast.error("Tahsilat eklenemedi", { description: err?.message ?? "API isteği başarısız oldu." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) reset(); }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Tahsilat Ekle</DialogTitle>
          <DialogDescription>Satış kartına bağlı beklenen tahsilat (vade ve tutar) kaydedin.</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label className="text-xs">Firma *</Label>
            <Select value={form.companyId} onValueChange={(v) => setForm({ ...form, companyId: v })}>
              <SelectTrigger className="mt-1.5"><SelectValue placeholder="Firma seçin..." /></SelectTrigger>
              <SelectContent>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {quoteOptions.length > 0 && (
            <div>
              <Label className="text-xs">Teklif (opsiyonel)</Label>
              <Select value={form.quoteId || "none"} onValueChange={(v) => setForm({ ...form, quoteId: v === "none" ? "" : v })}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="Teklif seçin..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Bağlama</SelectItem>
                  {quoteOptions.map((q) => (
                    <SelectItem key={q.id} value={q.id}>{q.quoteNo} · R{q.revision}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Tutar *" type="number" value={form.amount} placeholder="0" onChange={(v) => setForm({ ...form, amount: v })} />
            <div>
              <Label className="text-xs">Para Birimi</Label>
              <Select value={form.currencyCode} onValueChange={(v) => setForm({ ...form, currencyCode: v as (typeof PAYMENT_CURRENCIES)[number] })}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Vade Tarihi *" type="date" value={form.dueDate} onChange={(v) => setForm({ ...form, dueDate: v })} />
            <Field label="Fatura No" value={form.invoiceNo} placeholder="FTR-2026-001" onChange={(v) => setForm({ ...form, invoiceNo: v })} />
          </div>

          <div>
            <Label className="text-xs">Notlar</Label>
            <Textarea className="mt-1.5" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Vazgeç</Button>
            <Button type="submit" disabled={saving}>{saving ? "Kaydediliyor..." : "Tahsilat Ekle"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CreateServiceRequestDialog({ trigger, defaultMachineId }: { trigger: React.ReactNode; defaultMachineId?: string }) {
  const { customers, contacts, addService, machines: machinesAll, users } = useStore();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const serviceUsers = useMemo(() => users.filter((u) => u.role === "Service" || u.department === "Servis"), [users]);
  const [form, setForm] = useState<{
    customerId: string;
    contactId: string;
    machineId: string;
    assignedUserId: string;
    ticketType: ServiceTicketType;
    diagnosisNote: string;
    quoteRequired: boolean;
    serviceNote: string;
  }>({
    customerId: "",
    contactId: "",
    machineId: defaultMachineId ?? "",
    assignedUserId: (serviceUsers[0] ?? users[0])?.id ?? "",
    ticketType: "complaint",
    diagnosisNote: "",
    quoteRequired: false,
    serviceNote: "",
  });

  useEffect(() => {
    if (!open) return;
    const defaultMachine = machinesAll.find((machine) => machine.id === defaultMachineId);
    const customerId = machineCustomerId(defaultMachine);
    const preferredContact = preferredServiceContact(contacts, customerId);
    setForm({
      customerId,
      contactId: preferredContact?.id ?? "",
      machineId: defaultMachine?.id ?? "",
      assignedUserId: (serviceUsers[0] ?? users[0])?.id ?? "",
      ticketType: "complaint",
      diagnosisNote: "",
      quoteRequired: false,
      serviceNote: "",
    });
  }, [open, defaultMachineId, contacts, machinesAll, serviceUsers, users]);

  const customerOptions = useMemo(
    () => customers.map((customer) => ({ value: customer.id, label: customer.name })),
    [customers],
  );
  const selectedCustomer = customers.find((customer) => customer.id === form.customerId);
  const companyMachines = useMemo(
    () => machinesAll.filter((machine) => machineCustomerId(machine) === form.customerId),
    [machinesAll, form.customerId],
  );
  const companyContacts = useMemo(
    () => contacts.filter((contact) => contactBelongsToCustomer(contact, form.customerId)),
    [contacts, form.customerId],
  );
  const selectedMachine = machinesAll.find((m) => m.id === form.machineId);
  const selectedContact = contacts.find((contact) => contact.id === form.contactId);
  const contactPhone = selectedContact?.mobilePhone || selectedContact?.phone || selectedContact?.otherPhone || selectedCustomer?.phone || selectedCustomer?.phone2 || "";
  const contactEmail = selectedContact?.email || selectedContact?.personalEmail || selectedContact?.otherEmail || selectedCustomer?.email || selectedCustomer?.email2 || "";
  const assignedUser = (serviceUsers.length > 0 ? serviceUsers : users).find((u) => u.id === form.assignedUserId);
  const machineOptionText = (machine: typeof machinesAll[number]) =>
    [machine.model, machine.serialNumber].filter(Boolean).join(" · ") || "Makine";
  // Diğer firmalardaki makineler de seçilebilir; seçilince selectMachine formu
  // makinenin sahibi firmaya geçirir (servis formunda firmalar arası makine desteği).
  const machineOptions = useMemo(() => {
    const otherCompanyMachines = machinesAll.filter((machine) => machineCustomerId(machine) !== form.customerId);
    const companyNameOf = (machine: typeof machinesAll[number]) =>
      customers.find((customer) => customer.id === machineCustomerId(machine))?.name ?? "Diğer firma";
    return [
      { value: NO_SERVICE_MACHINE, label: "Makine bağlama" },
      ...companyMachines.map((machine) => ({
        value: machine.id,
        label: machineOptionText(machine),
        hint: machine.status === "Out of Warranty" ? "Garanti dışı" : machine.status === "Decommissioned" ? "Devre dışı" : "Aktif",
      })),
      ...otherCompanyMachines.map((machine) => ({
        value: machine.id,
        label: machineOptionText(machine),
        hint: companyNameOf(machine),
      })),
    ];
  }, [companyMachines, machinesAll, customers, form.customerId]);

  const selectCustomer = (customerId: string) => {
    const preferredContact = preferredServiceContact(contacts, customerId);
    const currentMachine = machinesAll.find((machine) => machine.id === form.machineId);
    const currentMachineBelongsToCustomer = machineCustomerId(currentMachine) === customerId;
    const nextMachines = machinesAll.filter((machine) => machineCustomerId(machine) === customerId);
    setForm((current) => ({
      ...current,
      customerId,
      contactId: preferredContact?.id ?? "",
      machineId: currentMachineBelongsToCustomer ? current.machineId : nextMachines.length === 1 ? nextMachines[0].id : "",
    }));
  };

  const selectMachine = (machineId: string) => {
    if (machineId === NO_SERVICE_MACHINE) {
      setForm((current) => ({ ...current, machineId: "" }));
      return;
    }
    const machine = machinesAll.find((item) => item.id === machineId);
    const customerId = machineCustomerId(machine) || form.customerId;
    const preferredContact = selectedContact && contactBelongsToCustomer(selectedContact, customerId)
      ? selectedContact
      : preferredServiceContact(contacts, customerId);
    setForm((current) => ({
      ...current,
      customerId,
      contactId: preferredContact?.id ?? "",
      machineId: machine ? machineId : "",
    }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customerId) {
      toast.error("Firma seçimi zorunludur");
      return;
    }
    if (selectedMachine && machineCustomerId(selectedMachine) !== form.customerId) {
      toast.error("Seçilen makine firmaya ait değil");
      return;
    }
    setSaving(true);
    try {
      const created = await addService({
        machineId: form.machineId,
        customerId: form.customerId,
        contactId: form.contactId || undefined,
        assignedUserId: form.assignedUserId,
        ticketType: form.ticketType,
        diagnosisNote: form.diagnosisNote,
        quoteRequired: form.quoteRequired,
        serviceNote: form.serviceNote,
      });
      toast.success("Servis talebi oluşturuldu", { description: `#${created.id.toUpperCase()}` });
      setOpen(false);
    } catch (err: any) {
      toast.error("Servis talebi oluşturulamadı", { description: err?.message ?? "API isteği başarısız oldu." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="w-[min(760px,calc(100vw-2rem))] max-w-none sm:max-w-none max-h-[90dvh] overflow-hidden p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/60">
          <div className="flex items-start gap-3 pr-8">
            <div className="size-11 rounded-lg bg-primary/10 text-primary grid place-items-center shrink-0">
              <Wrench className="size-5" />
            </div>
            <div className="min-w-0">
              <DialogTitle>Yeni Servis Talebi</DialogTitle>
              <DialogDescription className="mt-1">
                Firma ve ilgili kişiyi seçin; kurulu makine yoksa talebi makinesiz de açabilirsiniz.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={submit} className="min-w-0">
          <div className="max-h-[calc(90dvh-154px)] overflow-y-auto px-6 py-5">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
              <div className="min-w-0 space-y-4">
                <div className="min-w-0">
                  <Label className="text-xs">Firma *</Label>
                  <div className="mt-1.5">
                    <Combobox
                      options={customerOptions}
                      value={form.customerId}
                      onChange={selectCustomer}
                      placeholder="Firma seçin"
                      searchPlaceholder="Firma ara..."
                      emptyText="Firma bulunamadı."
                    />
                  </div>
                </div>

                <div className="min-w-0">
                  <Label className="text-xs">Makine (opsiyonel)</Label>
                  <div className="mt-1.5">
                    <Combobox
                      options={machineOptions}
                      value={form.customerId ? form.machineId : ""}
                      onChange={selectMachine}
                      placeholder={form.customerId ? "Makine seçin (opsiyonel)" : "Önce firma seçin"}
                      searchPlaceholder="Makine ara..."
                      emptyText="Seçili firmada kayıtlı makine yok."
                      disabled={!form.customerId}
                    />
                  </div>
                </div>

                <div className="min-w-0">
                  <Label className="text-xs">İlgili Kişi</Label>
                  <Select value={form.contactId || "none"} onValueChange={(v) => setForm({ ...form, contactId: v === "none" ? "" : v })}>
                    <SelectTrigger className="mt-1.5 min-w-0 [&_[data-slot=select-value]]:min-w-0 [&_[data-slot=select-value]]:truncate">
                      <SelectValue placeholder="İlgili kişi seçin" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Firma genel iletişimi</SelectItem>
                      {companyContacts.map((contact) => (
                        <SelectItem key={contact.id} value={contact.id}>
                          {contact.name}{contact.title ? ` · ${contact.title}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <Input value={contactPhone} readOnly placeholder="Telefon bulunamadı" aria-label="İlgili kişi telefonu" />
                    <Input value={contactEmail} readOnly placeholder="E-posta bulunamadı" aria-label="İlgili kişi e-postası" />
                  </div>
                </div>

                <div className="min-w-0">
                  <Label className="text-xs">Atanan Servis Personeli</Label>
                  <Select value={form.assignedUserId} onValueChange={(v) => setForm({ ...form, assignedUserId: v })}>
                    <SelectTrigger className="mt-1.5 min-w-0 [&_[data-slot=select-value]]:min-w-0 [&_[data-slot=select-value]]:truncate">
                      <SelectValue placeholder="Personel seçin" />
                    </SelectTrigger>
                    <SelectContent>
                      {(serviceUsers.length > 0 ? serviceUsers : users).map((u) => (
                        <SelectItem key={u.id} value={u.id}>{u.name} · {u.department}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="min-w-0">
                  <Label className="text-xs">Kayıt Tipi *</Label>
                  <Select value={form.ticketType} onValueChange={(v) => setForm({ ...form, ticketType: v as ServiceTicketType })}>
                    <SelectTrigger className="mt-1.5 min-w-0">
                      <SelectValue placeholder="Kayıt tipi seçin" />
                    </SelectTrigger>
                    <SelectContent>
                      {SERVICE_TICKET_TYPE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs">Arıza / Talep Açıklaması</Label>
                  <Textarea
                    className="mt-1.5 min-h-24"
                    rows={4}
                    placeholder="Müşterinin bildirdiği problem..."
                    value={form.diagnosisNote}
                    onChange={(e) => setForm({ ...form, diagnosisNote: e.target.value })}
                  />
                </div>

                <div>
                  <Label className="text-xs">Servis Notu</Label>
                  <Textarea
                    className="mt-1.5 min-h-20"
                    rows={3}
                    placeholder="İç not / planlama..."
                    value={form.serviceNote}
                    onChange={(e) => setForm({ ...form, serviceNote: e.target.value })}
                  />
                </div>
              </div>

              <div className="min-w-0 space-y-3">
                <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                  <div className="mb-3 flex items-center gap-2 text-xs font-medium text-foreground/80">
                    <ClipboardList className="size-4 text-primary" />
                    Talep özeti
                  </div>
                  <div className="space-y-3 text-sm">
                    <div className="min-w-0">
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Firma</div>
                      <div className="mt-0.5 truncate font-medium">{selectedCustomer?.name ?? "Firma seçin"}</div>
                      <div className="truncate text-[11px] text-muted-foreground">{selectedCustomer?.city ?? "—"}</div>
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">İlgili Kişi</div>
                      <div className="mt-0.5 truncate font-medium">{selectedContact?.name ?? selectedCustomer?.contactPerson ?? "Firma genel iletişimi"}</div>
                      <div className="truncate text-[11px] text-muted-foreground">{contactPhone || contactEmail || "İletişim bilgisi yok"}</div>
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Makine</div>
                      <div className="mt-0.5 truncate font-medium">{selectedMachine?.model ?? "—"}</div>
                      <div className="truncate text-[11px] text-muted-foreground">{selectedMachine?.serialNumber ?? "Seri no yok"}</div>
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Sorumlu</div>
                      <div className="mt-0.5 flex items-center gap-2">
                        <span className="grid size-7 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                          <UserRound className="size-3.5" />
                        </span>
                        <div className="min-w-0">
                          <div className="truncate font-medium">{assignedUser?.name ?? "Atanmamış"}</div>
                          <div className="truncate text-[11px] text-muted-foreground">{assignedUser?.department ?? "—"}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <label className="flex items-start gap-2 rounded-lg border border-border/60 bg-white p-3 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 rounded border-border accent-primary"
                    checked={form.quoteRequired}
                    onChange={(e) => setForm({ ...form, quoteRequired: e.target.checked })}
                  />
                  <span className="min-w-0">
                    <span className="block leading-tight">Servis teklifi gerekli</span>
                    <span className="mt-1 block text-[11px] leading-snug text-muted-foreground">Yedek parça veya işçilik bedeli için teklif akışı açılır.</span>
                  </span>
                </label>
              </div>
            </div>
          </div>

          <DialogFooter className="border-t border-border/60 bg-muted/20 px-6 py-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Vazgeç</Button>
            <Button type="submit" disabled={saving}>{saving ? "Oluşturuluyor..." : "Talebi Oluştur"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CreateInstallationDialog({
  trigger,
  onCreated,
}: {
  trigger: React.ReactNode;
  onCreated?: () => void;
}) {
  const { customers, contacts, users, machines, deliveries } = useStore();
  const [open, setOpen] = useState(false);
  const emptyForm = () => {
    const companyId = customers[0]?.id ?? "";
    return {
    companyId,
    contactId: contacts.find((c) => c.customerId === companyId)?.id ?? "",
    customerDeviceId: machines.find((m) => m.customerId === companyId || m.userCompanyId === companyId)?.id ?? "",
    scheduledDate: new Date().toISOString().slice(0, 10),
    assignedToUserId: users.find((u) => u.role === "Service" || u.department === "Servis")?.id ?? users[0]?.id ?? "",
    location: "",
    locationType: "istanbul_ici" as InstallationLocationType,
    durationHours: "1",
    durationMinutes: "0",
    notes: "",
    };
  };
  const [form, setForm] = useState(emptyForm);

  const reset = () => setForm(emptyForm());

  // Süre (saat + dk) → toplam dakika.
  const totalMinutes = (parseInt(form.durationHours || "0", 10) || 0) * 60 + (parseInt(form.durationMinutes || "0", 10) || 0);

  const selectedContacts = contacts.filter((c) => c.customerId === form.companyId);
  // Kurulum tutanağındaki tezgah/CNC alanları bu makineden doldurulur.
  const selectedMachines = machines.filter((m) => m.customerId === form.companyId || m.userCompanyId === form.companyId);
  const selectedMachine = selectedMachines.find((m) => m.id === form.customerDeviceId) ?? null;
  const serviceUsers = users.filter((u) => u.role === "Service" || u.department === "Servis");
  const onCompanyChange = (companyId: string) => {
    const contactId = contacts.find((c) => c.customerId === companyId)?.id ?? "";
    const customerDeviceId = machines.find((m) => m.customerId === companyId || m.userCompanyId === companyId)?.id ?? "";
    setForm({ ...form, companyId, contactId, customerDeviceId });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.companyId) return toast.error("Firma seçiniz");
    try {
      const formNo = resolveServiceFormNo({
        relatedFormNo: relatedDeliveryFormNo(deliveries, { machineId: form.customerDeviceId }),
        machineId: form.customerDeviceId,
      });
      await serviceService.createInstallation({
        companyId: form.companyId,
        contactId: form.contactId || undefined,
        customerDeviceId: form.customerDeviceId || undefined,
        scheduledDate: form.scheduledDate || undefined,
        assignedToUserId: form.assignedToUserId || undefined,
        location: form.location || undefined,
        locationType: form.locationType,
        durationMinutes: totalMinutes > 0 ? totalMinutes : undefined,
        notes: form.notes || undefined,
        formData: formNo
          ? {
              formNo,
              machineId: form.customerDeviceId || undefined,
            }
          : undefined,
      });
      toast.success("Kurulum oluşturuldu");
      setOpen(false);
      reset();
      onCreated?.();
    } catch (err: any) {
      toast.error("Kurulum oluşturulamadı", { description: err?.message ?? "API isteği başarısız oldu." });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) reset(); }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="w-[min(920px,calc(100vw-2rem))] max-w-none sm:max-w-none">
        <DialogHeader>
          <DialogTitle>Yeni Kurulum</DialogTitle>
          <DialogDescription>Saha kurulum planı oluşturun.</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label className="text-xs">Firma *</Label>
              <Select
                value={form.companyId}
                onValueChange={onCompanyChange}
              >
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="Firma seçin..." /></SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Kontak</Label>
              <Select
                value={form.contactId || "none"}
                onValueChange={(v) => setForm({ ...form, contactId: v === "none" ? "" : v })}
              >
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Belirtilmedi</SelectItem>
                  {selectedContacts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Makine</Label>
              <Select
                value={form.customerDeviceId || "none"}
                onValueChange={(v) => setForm({ ...form, customerDeviceId: v === "none" ? "" : v })}
              >
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Belirtilmedi</SelectItem>
                  {selectedMachines.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {[m.brand, m.model].filter(Boolean).join(" ")} · {m.serialNumber}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedMachine && (
                <div className="mt-2 rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  <div className="font-medium text-foreground">{[selectedMachine.brand, selectedMachine.model].filter(Boolean).join(" ") || selectedMachine.model}</div>
                  <div className="mt-0.5 grid gap-1 sm:grid-cols-3">
                    <span>Seri No: {selectedMachine.serialNumber || "—"}</span>
                    <span>CNC: {selectedMachine.controlUnit || "—"}</span>
                    <span>Teslim: {selectedMachine.deliveryDate || "—"}</span>
                  </div>
                </div>
              )}
            </div>
            <Field label="Planlanan Tarih" type="date" value={form.scheduledDate} onChange={(v) => setForm({ ...form, scheduledDate: v })} />
            <div>
              <Label className="text-xs">Teknisyen</Label>
              <Select value={form.assignedToUserId || "none"} onValueChange={(v) => setForm({ ...form, assignedToUserId: v === "none" ? "" : v })}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Belirtilmedi</SelectItem>
                  {(serviceUsers.length ? serviceUsers : users).map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Field label="Lokasyon" value={form.location} onChange={(v) => setForm({ ...form, location: v })} />

            {/* ── Saha planlama ── */}
            <div className="col-span-2 grid grid-cols-2 gap-3 rounded-lg border border-border/60 bg-muted/30 p-3">
              <div>
                <Label className="text-xs">Konum Tipi</Label>
                <Select value={form.locationType} onValueChange={(v) => setForm({ ...form, locationType: v as InstallationLocationType })}>
                  <SelectTrigger className="mt-1.5 bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(INSTALLATION_LOCATION_LABELS) as InstallationLocationType[]).map((k) => (
                      <SelectItem key={k} value={k}>{INSTALLATION_LOCATION_LABELS[k]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Süre (saat / dk)</Label>
                <div className="mt-1.5 flex items-center gap-2">
                  <Input type="number" min={0} className="bg-white" value={form.durationHours} onChange={(e) => setForm({ ...form, durationHours: e.target.value })} />
                  <span className="text-muted-foreground text-sm">saat</span>
                  <Input type="number" min={0} max={59} className="bg-white" value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })} />
                  <span className="text-muted-foreground text-sm">dk</span>
                </div>
              </div>
            </div>

            <div className="col-span-2">
              <Label className="text-xs">Notlar</Label>
              <Textarea className="mt-1.5" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Vazgeç</Button>
            <Button type="submit">Kurulumu Oluştur</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CreateMachineDialog({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const { customers, stock, machines, products, addMachine } = useStore();
  const [form, setForm] = useState({
    customerId: "",
    stockItemId: "",
    model: "",
    serialNumber: "",
    installationDate: "",
    warrantyStart: "",
    warrantyEnd: "",
  });
  const [warrantyTouched, setWarrantyTouched] = useState({ start: false, end: false });

  const machineStockUsed = useMemo(
    () => new Set(machines.map((machine) => machine.stockItemId).filter(Boolean)),
    [machines],
  );

  const stockCandidatesForCustomer = (customerId: string) =>
    customerId
      ? stock.filter((item) => {
          const categoryCode = item.categoryCode ?? "TEZGAH";
          return (
            categoryCode === "TEZGAH" &&
            item.reservedCompanyId === customerId &&
            item.status !== "Inactive" &&
            !machineStockUsed.has(item.id)
          );
        })
      : [];

  const companyStockCandidates = useMemo(
    () => stockCandidatesForCustomer(form.customerId),
    [form.customerId, stock, machineStockUsed],
  );

  const addYears = (dateString: string, years: number) => {
    if (!dateString) return "";
    const [year, month, day] = dateString.split("-").map(Number);
    if (!year || !month || !day) return "";
    const date = new Date(Date.UTC(year, month - 1, day));
    date.setUTCFullYear(date.getUTCFullYear() + years);
    return date.toISOString().slice(0, 10);
  };

  const applyStock = (item: (typeof stock)[number], base = form) => ({
    ...base,
    stockItemId: item.id,
    model: item.counterModel || item.counterType || base.model,
    serialNumber: item.serialNumber || base.serialNumber,
  });

  const resetForm = () => {
    setWarrantyTouched({ start: false, end: false });
    setForm({
      customerId: "",
      stockItemId: "",
      serialNumber: "",
      model: "",
      installationDate: "",
      warrantyStart: "",
      warrantyEnd: "",
    });
  };

  const selectCustomer = (value: string) => {
    const customerId = value === "none" ? "" : value;
    const candidates = stockCandidatesForCustomer(customerId);
    const next = {
      ...form,
      customerId,
      stockItemId: "",
      model: "",
      serialNumber: "",
    };
    setForm(candidates[0] ? applyStock(candidates[0], next) : next);
  };

  const selectStock = (value: string) => {
    if (value === "none") {
      setForm({ ...form, stockItemId: "", model: "", serialNumber: "" });
      return;
    }
    const item = companyStockCandidates.find((candidate) => candidate.id === value);
    if (item) setForm(applyStock(item));
  };

  const setInstallationDate = (installationDate: string) => {
    setForm((current) => ({
      ...current,
      installationDate,
      warrantyStart: warrantyTouched.start ? current.warrantyStart : installationDate,
      warrantyEnd: warrantyTouched.end ? current.warrantyEnd : addYears(installationDate, 2),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customerId || !form.model || !form.serialNumber) {
      toast.error("Lütfen gerekli alanları doldurun.");
      return;
    }
    try {
      await addMachine({
        ...form,
        salesCaseId: "",
      });
      toast.success("Makine başarıyla eklendi.");
      setOpen(false);
      resetForm();
    } catch (err) {
      toast.error("Makine eklenirken hata oluştu.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Yeni Makine / Varlık Ekle</DialogTitle>
          <DialogDescription>Müşteriye satılmış ve kurulumu yapılmış cihazı kaydedin.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label className="text-xs">Firma Seçimi <span className="text-destructive">*</span></Label>
              <Select value={form.customerId || "none"} onValueChange={selectCustomer}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="Firma Seçin" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Seçilmedi</SelectItem>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {form.customerId && companyStockCandidates.length > 0 && (
              <div className="col-span-2">
                <Label className="text-xs">Stok / Seri No</Label>
                <Select value={form.stockItemId || "none"} onValueChange={selectStock}>
                  <SelectTrigger className="mt-1.5"><SelectValue placeholder="Makine seçin" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Manuel giriş</SelectItem>
                    {companyStockCandidates.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {[item.counterModel || item.counterType, item.serialNumber].filter(Boolean).join(" · ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Field label="Model *" value={form.model} onChange={(v) => setForm({ ...form, model: v })} />
            <Field label="Seri No *" value={form.serialNumber} onChange={(v) => setForm({ ...form, serialNumber: v })} />
            <Field label="Kurulum Tarihi" type="date" value={form.installationDate} onChange={setInstallationDate} />
            <div />
            <Field
              label="Garanti Başlangıç"
              type="date"
              value={form.warrantyStart}
              onChange={(v) => {
                setWarrantyTouched((current) => ({ ...current, start: true }));
                setForm((current) => ({
                  ...current,
                  warrantyStart: v,
                  warrantyEnd: warrantyTouched.end ? current.warrantyEnd : addYears(v, 2),
                }));
              }}
            />
            <Field
              label="Garanti Bitiş"
              type="date"
              value={form.warrantyEnd}
              onChange={(v) => {
                setWarrantyTouched((current) => ({ ...current, end: true }));
                setForm((current) => ({ ...current, warrantyEnd: v }));
              }}
            />
          </div>
          {(() => {
            // Teknik bilgiler makineye bağlı üründen şablon olarak gelir; etiket
            // ve birim sabittir, değerler ürün kartında yönetilir.
            const stockItem = stock.find((item) => item.id === form.stockItemId);
            const product = stockItem?.productId ? products.find((item) => item.id === stockItem.productId) : undefined;
            if (!form.stockItemId) return null;
            return (
              <div className="space-y-1.5">
                <Label className="text-xs">Teknik Bilgiler (üründen otomatik)</Label>
                {product ? (
                  <ProductSpecsTable
                    specs={specsForProductTypeStrict(product.productTypeCode, product.specs ?? [])}
                    productTypeCode={product.productTypeCode}
                    emptyText="Ürün kartında teknik bilgi girilmemiş."
                  />
                ) : (
                  <div className="rounded-md border border-dashed border-border/70 px-3 py-2 text-xs text-muted-foreground">
                    Seçilen stok bir katalog ürününe bağlı değil; teknik bilgiler ürün kartından gelir.
                  </div>
                )}
              </div>
            );
          })()}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Vazgeç</Button>
            <Button type="submit">Kaydet</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Müşteri aktivite kaydı (ziyaret, telefon, mail, toplantı vb.). */
export function LogActivityDialog({
  customerId,
  trigger,
  defaultKind = "visit",
  onLogged,
}: {
  customerId: string;
  trigger: React.ReactNode;
  defaultKind?: (typeof ACTIVITY_TYPE_OPTIONS)[number]["code"];
  onLogged?: () => void;
}) {
  const { contacts, refresh } = useStore();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<(typeof ACTIVITY_TYPE_OPTIONS)[number]["code"]>(defaultKind);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [location, setLocation] = useState("");
  const [purpose, setPurpose] = useState("");
  const [result, setResult] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [contactId, setContactId] = useState("");
  const [saving, setSaving] = useState(false);

  const customerContacts = contacts.filter((c) => c.customerId === customerId);

  const reset = () => {
    setKind(defaultKind);
    setDate(new Date().toISOString().slice(0, 10));
    setLocation("");
    setPurpose("");
    setResult("");
    setNextAction("");
    setContactId("");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const base = {
        companyId: customerId,
        contactId: contactId || undefined,
      };
      if (kind === "visit") {
        await activityService.createVisit({
          ...base,
          visitDate: new Date(date),
          visitLocation: location.trim() || undefined,
          visitPurpose: purpose.trim() || undefined,
          visitResult: result.trim() || undefined,
          nextAction: nextAction.trim() || undefined,
        });
        toast.success("Ziyaret kaydedildi");
      } else if (kind === "call") {
        await activityService.createCall({
          ...base,
          callDate: new Date(date),
          callResult: result.trim() || undefined,
          nextAction: nextAction.trim() || undefined,
        });
        toast.success("Arama kaydedildi");
      } else {
        const label = ACTIVITY_TYPE_OPTIONS.find((o) => o.code === kind)?.label ?? kind;
        await activityService.create({
          ...base,
          activityTypeCode: kind,
          subject: label,
          description: [result.trim(), nextAction.trim() ? `Sonraki adım: ${nextAction.trim()}` : ""].filter(Boolean).join("\n"),
          activityDate: new Date(date),
        });
        toast.success("Aktivite kaydedildi");
      }
      await refresh();
      onLogged?.();
      setOpen(false);
      reset();
    } catch (err: any) {
      toast.error("Aktivite kaydedilemedi", { description: err?.message ?? "API isteği başarısız oldu." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
        else setKind(defaultKind);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {ACTIVITY_TYPE_OPTIONS.find((o) => o.code === kind)?.label ?? "Aktivite"} Kaydı
          </DialogTitle>
          <DialogDescription>Firma ile yapılan görüşmeyi CRM aktivite geçmişine ekleyin.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4 py-1">
          <div>
            <Label className="text-xs">Aktivite Türü</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
              <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ACTIVITY_TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.code} value={o.code}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Field label="Tarih *" type="date" value={date} onChange={setDate} />
          {customerContacts.length > 0 && (
            <div>
              <Label className="text-xs">Kontak</Label>
              <Select value={contactId || "none"} onValueChange={(v) => setContactId(v === "none" ? "" : v)}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="Opsiyonel" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Seçilmedi</SelectItem>
                  {customerContacts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {kind === "visit" && (
            <>
              <Field label="Konum" value={location} onChange={setLocation} />
              <Field label="Amaç" value={purpose} onChange={setPurpose} />
            </>
          )}
          <div>
            <Label className="text-xs">Sonuç</Label>
            <Textarea className="mt-1.5 min-h-[72px]" value={result} onChange={(e) => setResult(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Sonraki adım</Label>
            <Textarea className="mt-1.5 min-h-[56px]" value={nextAction} onChange={(e) => setNextAction(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>İptal</Button>
            <Button type="submit" disabled={saving}>{saving ? "Kaydediliyor…" : "Kaydet"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
