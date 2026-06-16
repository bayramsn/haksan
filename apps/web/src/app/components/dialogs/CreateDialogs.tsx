import { useEffect, useRef, useState, useMemo } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { Combobox } from "../ui/combobox";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from "../ui/select";
import { useStore } from "../../lib/store";
import { usePersistentState } from "../../lib/persist";
import { SALES_STAGES, salesStageLabel, SHIPMENT_STATUSES, DELIVERY_STATUSES, type ShipmentStatus, type DeliveryStatus, type Customer, type Contact, type Product, type ProductSpec } from "../../lib/mock";
import { toast } from "sonner";
import {
  Building2, User as UserIcon, Wallet, Truck, ClipboardCheck, ChevronDown, Receipt, Upload,
  ClipboardList, Plus, Trash2, X, Loader2, Package, UserRound, Wrench,
} from "lucide-react";
import { serviceService, fileService, financeService, activityService, inventoryService } from "../../../lib/services";
import { useAuth } from "../../../lib/auth";
import {
  computeInstallationFee,
  INSTALLATION_LOCATION_LABELS,
  type InstallationLocationType,
  COMPANY_SECTOR_OPTIONS,
  COUNTRY_OPTIONS,
  DISTRICTS_BY_PROVINCE,
  TAX_OFFICE_OPTIONS,
  ACTIVITY_TYPE_OPTIONS,
  STOCK_CATEGORY_CODES,
  STOCK_CATEGORY_LABELS,
  type StockCategoryCode,
} from "@haksan/shared";
import { PROVINCE_NAMES } from "../../lib/geo";
import { QuoteDialog } from "./QuoteDialog";

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

const CONTACT_SOURCE_OPTIONS = [
  { code: "email", label: "Mail" },
  { code: "phone", label: "Telefon" },
  { code: "dealer", label: "Bayi" },
  { code: "digital_market", label: "Dijital Pazar" },
  { code: "fair", label: "Fuar" },
  { code: "musiad", label: "MÜSİAD" },
];

const emptyCompanyForm = () => ({
  name: "",
  sector: "",
  phone: "",
  phone2: "",
  fax: "",
  email: "",
  email2: "",
  address: "",
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

  const provinceOptions = useMemo(() => toComboboxOptions(PROVINCE_NAMES), []);
  const districtOptions = useMemo(() => {
    const districts = DISTRICTS_BY_PROVINCE[form.city] ?? [];
    return toComboboxOptions(districts);
  }, [form.city]);

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
      const c = await addCustomer({
        ...form,
        type,
        firmType,
        salesStatus: firmType === "supplier" ? undefined : salesStatus,
        contactPerson: "",
        wantedProduct: "",
        source: CONTACT_SOURCE_OPTIONS.find((s) => s.code === form.contactSourceCode)?.label ?? "",
        companyGroupName: COMPANY_GROUP_OPTIONS.find((g) => g.code === form.companyGroupCode)?.label ?? "",
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
                  {COMPANY_GROUP_OPTIONS.map((g) => (
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
                  {CONTACT_SOURCE_OPTIONS.map((s) => (
                    <SelectItem key={s.code} value={s.code}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <LookupCombobox
              label="Firma Sektörü"
              options={toComboboxOptions(COMPANY_SECTOR_OPTIONS)}
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
              onChange={(v) => setForm({ ...form, country: v })}
              placeholder="Ülke seçin..."
            />
            <LookupCombobox
              label="İl"
              options={provinceOptions}
              value={form.city}
              onChange={(v) => setForm({ ...form, city: v, district: "" })}
              placeholder="İl seçin..."
            />
            <LookupCombobox
              label="İlçe"
              options={districtOptions}
              value={form.district}
              onChange={(v) => setForm({ ...form, district: v })}
              placeholder={form.city ? "İlçe seçin..." : "Önce il seçin"}
            />
            <LookupCombobox
              label="Vergi Dairesi"
              options={toComboboxOptions(TAX_OFFICE_OPTIONS)}
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
  const { customers, addContact } = useStore();
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
              <Select value={form.customerId} onValueChange={(v) => setForm({ ...form, customerId: v })}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="Firma seçin..." /></SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

  const provinceOptions = useMemo(() => toComboboxOptions(PROVINCE_NAMES), []);
  const districtOptions = useMemo(() => {
    const districts = DISTRICTS_BY_PROVINCE[form.city] ?? [];
    return toComboboxOptions(districts);
  }, [form.city]);

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
              options={toComboboxOptions(COMPANY_SECTOR_OPTIONS)}
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
              onChange={(v) => setForm({ ...form, country: v })}
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
              options={toComboboxOptions(TAX_OFFICE_OPTIONS)}
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
  const [form, setForm] = useState({ name: "", title: "", department: "", phone: "", mobilePhone: "", email: "" });

  useEffect(() => {
    if (contact)
      setForm({
        name: contact.name ?? "",
        title: contact.title ?? "",
        department: contact.department ?? "",
        phone: contact.phone ?? "",
        mobilePhone: contact.mobilePhone ?? "",
        email: contact.email ?? "",
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
  const [open, setOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState("");
  const makeEmptyCase = () => ({
    customerId: defaultCustomerId ?? "",
    assignedUserId: users.find((u) => u.role === "Sales" || u.role === "Admin")?.id ?? users[0]?.id ?? "",
    requestedProduct: "",
    requestedModel: "",
    quantity: 1,
    estimatedAmount: 0,
    currency: "USD" as "USD" | "EUR" | "TRY",
    stage: "lead" as (typeof SALES_STAGES)[number],
    department: "Satış",
  });
  // Taslak yenilemede korunur; başarılı kayıtta temizlenir.
  const [form, setForm] = usePersistentState("draft.case.form", makeEmptyCase());

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customerId) return toast.error("Müşteri seçiniz");
    if (!form.requestedProduct) return toast.error("Ürün giriniz");
    try {
      const sc = await addCase(form as any);
      toast.success("Satış kartı oluşturuldu", { description: `#${sc.id.toUpperCase()}` });
      setForm(makeEmptyCase());
      setSelectedProductId("");
      setOpen(false);
    } catch (err: any) {
      toast.error("Satış kartı oluşturulamadı", { description: err?.message ?? "API isteği başarısız oldu." });
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
            <div className="col-span-2">
              <Label className="text-xs">Talep Edilen Ürün ve Model *</Label>
              <div className="mt-1.5">
                <Combobox
                  options={products.map((p) => ({ value: p.id, label: [p.brand, p.model].filter(Boolean).join(" "), hint: p.type }))}
                  value={selectedProductId}
                  onChange={(v) => {
                    const p = products.find((pr) => pr.id === v);
                    setSelectedProductId(v);
                    if (p) {
                      const line = [p.brand, p.model].filter(Boolean).join(" ").trim();
                      setForm((f) => ({ ...f, requestedProduct: line, requestedModel: p.model ?? "" }));
                    }
                  }}
                  placeholder="Ürün ve model seçin veya yazın..."
                  searchPlaceholder="Marka / model ara..."
                  emptyText="Ürün bulunamadı."
                  onCreate={(label) => {
                    setSelectedProductId("");
                    setForm((f) => ({ ...f, requestedProduct: label, requestedModel: label }));
                  }}
                  createLabel={(q) => `"${q}" serbest ürün olarak ekle`}
                />
              </div>
            </div>
            <Field label="Adet" type="number" value={String(form.quantity)} onChange={(v) => setForm({ ...form, quantity: Number(v) || 1 })} />
            <Field label="Tahmini Tutar" type="number" value={String(form.estimatedAmount)} onChange={(v) => setForm({ ...form, estimatedAmount: Number(v) || 0 })} />
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
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Vazgeç</Button>
            <Button type="submit">Satış Kartını Oluştur</Button>
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
const STATUSES: Array<"Available" | "Reserved" | "Sold" | "Inactive"> = ["Available", "Reserved", "Sold", "Inactive"];

const emptyStockForm = () => ({
  brand: "",
  counterType: "",
  counterModel: "",
  serialNumber: "",
  controlPanel: "",
  stockCode: "",
  warehouse: "",
  status: "Available" as "Available" | "Reserved" | "Sold" | "Inactive",
  categoryCode: "TEZGAH" as StockCategoryCode,
  optionalHardware: "",
  spareParts: "",
  productId: "",
});

export function CreateStockDialog({ trigger }: { trigger: React.ReactNode }) {
  const { addStock, stock, products } = useStore();
  const [open, setOpen] = useState(false);
  // Mod: "single" = tek seri-no'lu kalem · "bulk" = bir üründen N adet seri-no üret.
  const [mode, setMode] = useState<"single" | "bulk">("single");
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("5");
  const [saving, setSaving] = useState(false);
  const [warehouses, setWarehouses] = useState<string[]>([]);
  const [form, setForm] = useState(emptyStockForm);

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
                setForm((f) => ({ ...f, categoryCode: v, counterModel: "", counterType: "", brand: "", controlPanel: "" }));
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
                : "Yedek parça stoku hem satış hem servis süreçlerinde kullanılır."}
            </p>
          </div>

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

  const [form, setForm] = useState({
    type: ACTIVITY_TYPE_OPTIONS[0].label,
    title: "",
    note: "",
    date: new Date().toISOString().slice(0, 10),
    byUserId: defaultUserId,
  });

  const reset = () => setForm({
    type: ACTIVITY_TYPE_OPTIONS[0].label, title: "", note: "",
    date: new Date().toISOString().slice(0, 10),
    byUserId: defaultUserId,
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      toast.error("Başlık zorunludur");
      return;
    }
    try {
      await addActivity({
        salesCaseId,
        customerId,
        type: form.type,
        title: form.title.trim(),
        note: form.note.trim(),
        date: form.date,
        byUserId: form.byUserId,
      });
      toast.success("Aktivite eklendi", { description: form.title.trim() });
      reset();
      setOpen(false);
    } catch (err: any) {
      toast.error("Aktivite eklenemedi", { description: err?.message ?? "API isteği başarısız oldu." });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) reset(); }}>
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
type ProductTypeOption = ProductOption & { categoryCode?: string; subcategoryCode?: string };

const PRODUCT_BRANDS = ["LK", "ECOCA", "MANFORD", "MAXİMART"];
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
    label: "Ürün tipi işleme merkezi için liste",
    options: [
      { code: "CNC_DIK_ISLEME_MERKEZ", label: "CNC Dik İşleme Merkezi", categoryCode: "TEZGAH", subcategoryCode: "ISLEME_MERKEZI" },
      { code: "CNC_YATAY_ISLEME_MERKEZI", label: "CNC Yatay İşleme Merkezi", categoryCode: "TEZGAH", subcategoryCode: "ISLEME_MERKEZI" },
      { code: "CNC_KOPRU_TIPI_ISLEME_MERKEZI", label: "CNC Köprü Tipi İşleme Merkezi", categoryCode: "TEZGAH", subcategoryCode: "ISLEME_MERKEZI" },
      { code: "CNC_5_EKSEN_ISLEME_MERKEZI", label: "CNC 5 Eksen İşleme Merkezi", categoryCode: "TEZGAH", subcategoryCode: "ISLEME_MERKEZI" },
    ],
  },
  {
    label: "Ürün tipi torna",
    options: [
      { code: "CNC_YATAY_TORNA_TEZGAHI", label: "CNC Yatay Torna Tezgahı", categoryCode: "TEZGAH", subcategoryCode: "TORNA" },
      { code: "CNC_DIK_TORNA_TEZGAHI", label: "CNC Dik Torna Tezgahı", categoryCode: "TEZGAH", subcategoryCode: "TORNA" },
    ],
  },
  {
    label: "Ürün tipi yedek parça",
    options: [
      { code: "ELEKTRONIK", label: "Elektronik", categoryCode: "YEDEK_PARCA" },
      { code: "ELEKTRIK", label: "Elektrik", categoryCode: "YEDEK_PARCA" },
      { code: "MEKANIK", label: "Mekanik", categoryCode: "YEDEK_PARCA" },
    ],
  },
  {
    label: "Ürün tipi opsiyonel donanım",
    options: [
      { code: "KONTROL_UNITESI", label: "Kontrol Ünitesi", categoryCode: "OPSIYONEL_DONANIM" },
      { code: "SPINDLE", label: "Spindle", categoryCode: "OPSIYONEL_DONANIM" },
    ],
  },
  {
    label: "Ürün tipi işçilik",
    options: [{ code: "ISCILIK", label: "İşçilik", categoryCode: "ISCILIK" }],
  },
  {
    label: "Ürün tipi aksesuar",
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
const PRODUCT_VAT_RATES = ["1", "10", "20"];

// "Dik İşleme Merkezi" ürün tipi kodu — spindle kuralı için referans
const DIK_ISLEME_MERKEZI_CODE = "CNC_DIK_ISLEME_MERKEZ";

// Opsiyonel donanımın "uyumlu makine tipi" seçenekleri (tezgah tipleri)
const MACHINE_TYPE_OPTIONS: ProductOption[] = PRODUCT_TYPE_OPTIONS
  .filter((o) => o.categoryCode === "TEZGAH")
  .map((o) => ({ code: o.code, label: o.label }));

// Ürün tipine göre örnek teknik bilgi şablonları (anahtarlar; değerleri kullanıcı doldurur)
const SPEC_TEMPLATE_BY_TYPE: Record<string, string[]> = {
  CNC_DIK_ISLEME_MERKEZ: ["X / Y / Z Eksen Stroku", "Tabla Ölçüsü", "Spindle Devri (rpm)", "Spindle Gücü (kW)", "Spindle Konik", "Takım Magazini Kapasitesi", "Hızlı İlerleme (m/dk)"],
  CNC_YATAY_ISLEME_MERKEZI: ["X / Y / Z Eksen Stroku", "Pallet Ölçüsü", "Pallet Sayısı", "Spindle Devri (rpm)", "Spindle Konik", "Takım Magazini Kapasitesi"],
  CNC_KOPRU_TIPI_ISLEME_MERKEZI: ["X / Y / Z Eksen Stroku", "Köprü Açıklığı", "Tabla Ölçüsü", "Spindle Devri (rpm)", "Spindle Gücü (kW)"],
  CNC_5_EKSEN_ISLEME_MERKEZI: ["X / Y / Z Eksen Stroku", "A / C Eksen Dönüş Aralığı", "Tabla Çapı", "Spindle Devri (rpm)", "Spindle Konik"],
  CNC_YATAY_TORNA_TEZGAHI: ["Ayna Ölçüsü", "Maks. Tornalama Çapı", "Maks. Tornalama Boyu", "Fener Mili Devri (rpm)", "Taret İstasyon Sayısı", "Çubuk Geçiş Çapı"],
  CNC_DIK_TORNA_TEZGAHI: ["Ayna Ölçüsü", "Maks. Tornalama Çapı", "Maks. Tornalama Yüksekliği", "Fener Mili Devri (rpm)", "Taret İstasyon Sayısı"],
  ELEKTRONIK: ["Parça No", "Uyumlu Model", "Marka", "Garanti Süresi"],
  ELEKTRIK: ["Parça No", "Uyumlu Model", "Voltaj / Akım", "Marka"],
  MEKANIK: ["Parça No", "Uyumlu Model", "Malzeme", "Ölçü"],
  KONTROL_UNITESI: ["Marka / Model", "Eksen Sayısı", "Ekran Boyutu", "Bağlantı Arayüzleri"],
  SPINDLE: ["Devir (rpm)", "Güç (kW)", "Konik Tipi", "Soğutma Tipi", "Uyumlu Makine"],
  ISCILIK: ["Hizmet Türü", "Süre (saat)", "Birim", "Kapsam"],
  YAG_SIYIRICI: ["Uyumlu Model", "Kapasite", "Marka"],
  TUTUCU_TAKIMLAR: ["Uyumlu Model", "Tip", "Ölçü", "Marka"],
  DIVIZOR: ["Uyumlu Model", "Tabla Çapı", "Bölme Hassasiyeti"],
  REGULATOR: ["Uyumlu Model", "Giriş / Çıkış", "Kapasite (kVA)"],
};

// Kategori bazlı yedek şablon (ürün tipi seçilmeden / tipe özel şablon yoksa)
const SPEC_TEMPLATE_BY_CATEGORY: Record<string, string[]> = {
  TEZGAH: ["X / Y / Z Eksen Stroku", "Tabla / Ayna Ölçüsü", "Spindle / Fener Mili Devri (rpm)"],
  YEDEK_PARCA: ["Parça No", "Uyumlu Model", "Marka"],
  OPSIYONEL_DONANIM: ["Uyumlu Makine", "Marka / Model", "Teknik Özellik"],
  ISCILIK: ["Hizmet Türü", "Süre (saat)", "Birim"],
  AKSESUAR: ["Uyumlu Model", "Ölçü", "Marka"],
};

const toSpecs = (keys: string[]): ProductSpec[] =>
  keys.length ? keys.map((key) => ({ key, value: "" })) : [{ key: "", value: "" }];

const specsForType = (typeCode: string, categoryCode: string): ProductSpec[] =>
  toSpecs(SPEC_TEMPLATE_BY_TYPE[typeCode] ?? SPEC_TEMPLATE_BY_CATEGORY[categoryCode] ?? []);

const specsForCategory = (categoryCode: string): ProductSpec[] =>
  toSpecs(SPEC_TEMPLATE_BY_CATEGORY[categoryCode] ?? []);

type ProductFormState = {
  brand: string;
  productGroupCode: string; productGroup: string;
  categoryCode: string; category: string;
  subcategoryCode: string; subcategory: string;
  productTypeCode: string; type: string;
  compatibleMachineType: string;
  model: string; modelName: string; controlPanel: string;
  imageUrl: string; shortDescription: string; description: string;
  listPrice: string; cashPrice: string; currency: "USD" | "EUR" | "TRY";
  vatRate: string; originCountry: string; hsCode: string; stockCode: string;
  specs: ProductSpec[]; standardEquipment: string[]; optionalEquipment: string[];
  muadilProductId: string;
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

const emptyProduct = (): ProductFormState => ({
  brand: "",
  productGroupCode: "CNC", productGroup: "CNC",
  categoryCode: "TEZGAH", category: "Tezgah",
  subcategoryCode: "ISLEME_MERKEZI", subcategory: "İşleme Merkezi",
  productTypeCode: "", type: "",
  compatibleMachineType: "",
  model: "", modelName: "", controlPanel: "",
  imageUrl: "", shortDescription: "", description: "",
  listPrice: "", cashPrice: "", currency: "USD",
  vatRate: "20", originCountry: "", hsCode: "", stockCode: "",
  specs: [{ key: "", value: "" }], standardEquipment: [], optionalEquipment: [],
  muadilProductId: "",
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
  // UI-only: spindle ürünü ise düzenlemede "dik işleme merkezi" varsayılır (kural görünür kalsın)
  compatibleMachineType: p.productTypeCode === "SPINDLE" ? DIK_ISLEME_MERKEZI_CODE : "",
  model: p.model,
  modelName: p.modelName ?? "",
  controlPanel: p.controlPanel,
  imageUrl: p.imageUrl, shortDescription: p.shortDescription, description: p.description,
  listPrice: String(p.listPrice || ""), cashPrice: p.cashPrice ? String(p.cashPrice) : "", currency: p.currency,
  vatRate: String(p.vatRate ?? 20),
  originCountry: p.originCountry ?? "",
  hsCode: p.hsCode ?? "",
  stockCode: p.stockCode || p.model,
  specs: p.specs.length ? [...p.specs] : [{ key: "", value: "" }],
  standardEquipment: [...p.standardEquipment], optionalEquipment: [...p.optionalEquipment],
  muadilProductId: p.muadilProductId ?? "",
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
  const { addProduct, updateProduct, products } = useStore();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (o: boolean) => { onOpenChange ? onOpenChange(o) : setInternalOpen(o); };

  const [form, setForm] = useState<ProductFormState>(
    mode === "edit" && product ? fromProduct(product) : emptyProduct()
  );
  const [stdInput, setStdInput] = useState("");
  const [optInput, setOptInput] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const reset = () => {
    setForm(mode === "edit" && product ? fromProduct(product) : emptyProduct());
    setStdInput("");
    setOptInput("");
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
      const { uploadUrl } = await fileService.signedUpload({
        bucket: "erp-product-images",
        entityType: "product",
        entityId: product?.id ?? "new",
        filename: file.name,
        mimeType: file.type,
        extension: ext,
        sizeBytes: file.size,
      });
      const res = await fetch(uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!res.ok) throw new Error(`Depoya yükleme başarısız (${res.status})`);
      const publicUrl = uploadUrl.split("?")[0];
      setForm((f) => ({ ...f, imageUrl: publicUrl }));
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
    if (o) reset();
  };

  const updSpec = (i: number, patch: Partial<ProductSpec>) => {
    setForm((f) => ({ ...f, specs: f.specs.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) }));
  };
  const addSpec = () => setForm((f) => ({ ...f, specs: [...f.specs, { key: "", value: "" }] }));
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

  // Yalnızca TEZGAH kategorisinde alt kategori (işleme merkezi / torna) ayrımı var
  const categoryUsesSubcategory = form.categoryCode === "TEZGAH";

  // Ürün tipini seçili kategoriye ve (tezgahsa) alt kategoriye göre filtrele
  const typeMatches = (o: ProductTypeOption, categoryCode: string, subcategoryCode: string) => {
    if (o.categoryCode !== categoryCode) return false;
    if (categoryCode === "TEZGAH" && o.subcategoryCode) return o.subcategoryCode === subcategoryCode;
    return true;
  };

  // Spindle yalnızca uyumlu makine tipi "dik işleme merkezi" iken listelenir
  const isTypeAllowed = (o: ProductTypeOption, categoryCode: string, subcategoryCode: string, machineType: string) => {
    if (!typeMatches(o, categoryCode, subcategoryCode)) return false;
    if (o.code === "SPINDLE" && machineType !== DIK_ISLEME_MERKEZI_CODE) return false;
    return true;
  };

  const typeGroups = PRODUCT_TYPE_GROUPS
    .map((group) => ({
      label: group.label,
      options: group.options.filter((o) => isTypeAllowed(o, form.categoryCode, form.subcategoryCode, form.compatibleMachineType)),
    }))
    .filter((group) => group.options.length > 0);

  // Opsiyonel donanım kategorisinde "uyumlu makine tipi" alanı gösterilir
  const showMachineType = form.categoryCode === "OPSIYONEL_DONANIM";

  // Muadil ürün seçimi: ürün kendi kendine muadil olamaz; seçiliyse örnek önizleme gösterilir
  const muadilOptions = products.filter((p) => p.id !== product?.id);
  const selectedMuadil = products.find((p) => p.id === form.muadilProductId) ?? null;

  // Kategori/alt kategori/makine tipi değişince mevcut ürün tipi artık uymuyorsa sıfırla
  const keepTypeIfValid = (categoryCode: string, subcategoryCode: string, machineType: string) => {
    const opt = PRODUCT_TYPE_OPTIONS.find((o) => o.code === form.productTypeCode);
    if (opt && isTypeAllowed(opt, categoryCode, subcategoryCode, machineType)) {
      return { productTypeCode: form.productTypeCode, type: form.type };
    }
    return { productTypeCode: "", type: "" };
  };

  // Ürün tipi/kategoriye göre teknik bilgi şablonu uygula (tip değiştiyse)
  const specsAfterChange = (kept: { productTypeCode: string }, categoryCode: string) => {
    if (kept.productTypeCode === form.productTypeCode) return form.specs;
    return kept.productTypeCode ? specsForType(kept.productTypeCode, categoryCode) : specsForCategory(categoryCode);
  };

  const onCategoryChange = (code: string) => {
    const subcategoryCode = code === "TEZGAH" ? form.subcategoryCode || "ISLEME_MERKEZI" : "";
    const subcategory = code === "TEZGAH" ? form.subcategory || "İşleme Merkezi" : "";
    const machineType = code === "OPSIYONEL_DONANIM" ? form.compatibleMachineType : "";
    const kept = keepTypeIfValid(code, subcategoryCode, machineType);
    setForm({
      ...form,
      categoryCode: code,
      category: findLabel(PRODUCT_CATEGORIES, code),
      subcategoryCode,
      subcategory,
      compatibleMachineType: machineType,
      ...kept,
      specs: specsAfterChange(kept, code),
    });
  };

  const onSubcategoryChange = (code: string) => {
    const kept = keepTypeIfValid(form.categoryCode, code, form.compatibleMachineType);
    setForm({
      ...form,
      subcategoryCode: code,
      subcategory: findLabel(PRODUCT_SUBCATEGORIES, code),
      ...kept,
      specs: specsAfterChange(kept, form.categoryCode),
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
      specs: specsForType(opt.code, categoryCode),
    });
  };

  const onMachineTypeChange = (code: string) => {
    const kept = keepTypeIfValid(form.categoryCode, form.subcategoryCode, code);
    setForm({ ...form, compatibleMachineType: code, ...kept });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.brand.trim() || !form.shortDescription.trim()) {
      toast.error("Marka ve ürün adı zorunludur");
      return;
    }
    const cleanSpecs = form.specs.filter((s) => s.key.trim() && s.value.trim());
    const modelCode = form.stockCode.trim() || form.model.trim() || compactProductCode(form.shortDescription) || "URUN";
    const payload = {
      brand: form.brand.trim(),
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
      vatRate: Number(form.vatRate) || 20,
      originCountry: form.originCountry.trim(),
      hsCode: form.hsCode.trim(),
      stockCode: form.stockCode.trim(),
      specs: cleanSpecs,
      standardEquipment: form.standardEquipment,
      optionalEquipment: form.optionalEquipment,
      muadilProductId: form.muadilProductId || null,
      status: form.status,
    };

    try {
      if (mode === "edit" && product) {
        await updateProduct(product.id, payload);
        toast.success("Ürün güncellendi", { description: `${payload.brand} ${payload.model}` });
      } else {
        const p = await addProduct(payload);
        toast.success("Ürün oluşturuldu", { description: `${p.brand} ${p.model}` });
      }
      setOpen(false);
    } catch (err: any) {
      toast.error(mode === "edit" ? "Ürün güncellenemedi" : "Ürün oluşturulamadı", { description: err?.message ?? "API isteği başarısız oldu." });
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
            <ProductSheetRow label="Ürün Markası">
              <Select value={form.brand} onValueChange={(v) => setForm({ ...form, brand: v })}>
                <SelectTrigger className="h-8 max-w-xs"><SelectValue placeholder="Marka seçin" /></SelectTrigger>
                <SelectContent>
                  {PRODUCT_BRANDS.map((brand) => <SelectItem key={brand} value={brand}>{brand}</SelectItem>)}
                </SelectContent>
              </Select>
            </ProductSheetRow>

            <ProductSheetRow label="Ürün Grubu">
              <Select
                value={form.productGroupCode}
                onValueChange={(code) => setForm({ ...form, productGroupCode: code, productGroup: findLabel(PRODUCT_GROUPS, code) })}
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
                  {PRODUCT_CATEGORIES.map((o) => <SelectItem key={o.code} value={o.code}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </ProductSheetRow>

            {categoryUsesSubcategory && (
              <ProductSheetRow label="Ürün Alt Kategori Tezgah">
                <Select value={form.subcategoryCode} onValueChange={onSubcategoryChange}>
                  <SelectTrigger className="h-8 max-w-xs"><SelectValue placeholder="Alt kategori seçin" /></SelectTrigger>
                  <SelectContent>
                    {PRODUCT_SUBCATEGORIES.map((o) => <SelectItem key={o.code} value={o.code}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </ProductSheetRow>
            )}

            {showMachineType && (
              <ProductSheetRow label="Uyumlu Makine Tipi">
                <div className="space-y-1.5">
                  <Select value={form.compatibleMachineType} onValueChange={onMachineTypeChange}>
                    <SelectTrigger className="h-8 max-w-md"><SelectValue placeholder="Makine tipi seçin" /></SelectTrigger>
                    <SelectContent>
                      {MACHINE_TYPE_OPTIONS.map((o) => <SelectItem key={o.code} value={o.code}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">Spindle yalnızca "Dik İşleme Merkezi" seçiliyken ürün tipinde listelenir.</p>
                </div>
              </ProductSheetRow>
            )}

            <ProductSheetRow label="Ürün Tipi">
              <Select value={form.productTypeCode} onValueChange={onTypeChange}>
                <SelectTrigger className="h-8 max-w-md">
                  <SelectValue placeholder={typeGroups.length ? "Ürün tipi seçin" : "Önce kategori seçin"} />
                </SelectTrigger>
                <SelectContent>
                  {typeGroups.length === 0 ? (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">Bu kategori için ürün tipi yok</div>
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

            <ProductSheetRow label="Menşei">
              <Input className="h-8 max-w-xs" value={form.originCountry} onChange={(e) => setForm({ ...form, originCountry: e.target.value })} placeholder="Ülke" />
            </ProductSheetRow>

            <ProductSheetRow label="GTIP Kodu">
              <Input className="h-8 max-w-xs" value={form.hsCode} onChange={(e) => setForm({ ...form, hsCode: e.target.value })} />
            </ProductSheetRow>

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

            <ProductSheetRow label="Muadil Ürün" className="items-start">
              <div className="space-y-2">
                <Select
                  value={form.muadilProductId || "__none"}
                  onValueChange={(v) => setForm({ ...form, muadilProductId: v === "__none" ? "" : v })}
                >
                  <SelectTrigger className="h-8 max-w-md"><SelectValue placeholder="Muadil ürün seçin" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Muadil yok</SelectItem>
                    {muadilOptions.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {[p.brand, p.model, p.shortDescription].filter(Boolean).join(" · ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedMuadil ? (
                  <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-brand-blue-soft p-2.5">
                    <div className="size-12 shrink-0 overflow-hidden rounded-md border border-blue-200 bg-white grid place-items-center">
                      {selectedMuadil.imageUrl ? (
                        <img src={selectedMuadil.imageUrl} alt={selectedMuadil.model} className="h-full w-full object-cover" />
                      ) : (
                        <Package className="size-5 text-blue-400" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-brand-blue">Örnek Muadil Ürün</div>
                      <div className="truncate text-sm">{selectedMuadil.brand} {selectedMuadil.model}</div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {[selectedMuadil.category, selectedMuadil.type].filter(Boolean).join(" · ") || "—"}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-sm tabular-nums">
                        {selectedMuadil.listPrice ? `${selectedMuadil.listPrice.toLocaleString("tr-TR")} ${selectedMuadil.currency}` : "—"}
                      </div>
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Liste Fiyatı</div>
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground">Bir muadil ürün seçilirse örnek ürün kartı burada görünür.</p>
                )}
              </div>
            </ProductSheetRow>

            <ProductSheetRow label="Teknik Bilgiler" className="items-start">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[11px] text-muted-foreground">Ürün tipine göre değişiklik gösterecek teknik satırlar.</div>
                  <Button type="button" variant="outline" size="sm" className="h-7 gap-1" onClick={addSpec}>
                    <Plus className="size-3.5" /> Özellik Ekle
                  </Button>
                </div>
                <div className="space-y-2">
                  {form.specs.map((s, i) => (
                    <div key={i} className="grid grid-cols-[minmax(120px,1fr)_minmax(160px,1.5fr)_36px] gap-2">
                      <Input className="h-8" placeholder="Örn: Tabla ölçüsü" value={s.key} onChange={(e) => updSpec(i, { key: e.target.value })} />
                      <Input className="h-8" placeholder="Örn: 1200 x 600 mm" value={s.value} onChange={(e) => updSpec(i, { value: e.target.value })} />
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => rmSpec(i)}>
                        <Trash2 className="size-4 text-muted-foreground" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </ProductSheetRow>

          </div>

          <ChipField
            label="Standart Donanımlar"
            chips={form.standardEquipment}
            input={stdInput}
            setInput={setStdInput}
            onAdd={() => addChip("standardEquipment", stdInput, setStdInput)}
            onRemove={(i) => rmChip("standardEquipment", i)}
            placeholder="Standart donanım ekleyip Enter'a basın"
          />

          <ChipField
            label="Opsiyonel Donanımlar"
            chips={form.optionalEquipment}
            input={optInput}
            setInput={setOptInput}
            onAdd={() => addChip("optionalEquipment", optInput, setOptInput)}
            onRemove={(i) => rmChip("optionalEquipment", i)}
            placeholder="Opsiyonel donanım ekleyip Enter'a basın"
          />

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
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>İptal</Button>
            <Button type="submit">{mode === "edit" ? "Güncelle" : "Oluştur"}</Button>
          </DialogFooter>
        </form>
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
      <div className="mt-2 flex flex-wrap gap-1.5 min-h-[28px]">
        {chips.length === 0 && <span className="text-[11px] text-muted-foreground">Henüz eklenmedi</span>}
        {chips.map((c, i) => (
          <span key={`${c}-${i}`} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px]">
            {c}
            <button type="button" onClick={() => onRemove(i)} className="hover:text-destructive">
              <X className="size-3" />
            </button>
          </span>
        ))}
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
const SHIPMENT_CARRIERS = ["DHL", "UPS", "FedEx", "MNG", "Aras", "Yurtiçi", "Sürat", "Diğer"];
export function CreateShipmentDialog({ trigger, onCreated }: { trigger: React.ReactNode; onCreated?: () => void }) {
  const { addShipment, cases, customers } = useStore();
  const customerName = (id: string) => customers.find((c) => c.id === id)?.name ?? "—";
  const [open, setOpen] = useState(false);
  const emptyForm = () => ({
    salesCaseId: cases[0]?.id ?? "",
    trackingNo: `TRK-${Math.floor(100000 + Math.random() * 900000)}`,
    carrier: "DHL",
    origin: "",
    destination: "",
    eta: new Date().toISOString().slice(0, 10),
    status: "Hazırlanıyor" as ShipmentStatus,
  });
  const [form, setForm] = useState(emptyForm);
  const reset = () => setForm(emptyForm());

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.trackingNo.trim()) return toast.error("Takip no giriniz");
    if (!form.destination.trim()) return toast.error("Varış noktası giriniz");
    try {
      await addShipment({
        salesCaseId: form.salesCaseId,
        trackingNo: form.trackingNo.trim(),
        carrier: form.carrier,
        origin: form.origin.trim(),
        destination: form.destination.trim(),
        eta: form.eta,
        status: form.status,
      });
      toast.success("Sevkiyat oluşturuldu", { description: `${form.trackingNo} · ${form.carrier}` });
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
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Truck className="size-5 text-primary" /> Yeni Sevkiyat</DialogTitle>
          <DialogDescription>Bir satış kartına bağlı sevkiyat takibi oluşturun.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label className="text-xs" htmlFor="ship-case">Satış Kartı / Müşteri</Label>
            <Select value={form.salesCaseId} onValueChange={(v) => setForm({ ...form, salesCaseId: v })}>
              <SelectTrigger id="ship-case" className="mt-1.5"><SelectValue placeholder="Satış kartı seçin..." /></SelectTrigger>
              <SelectContent>
                {cases.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{customerName(c.customerId)} · {c.requestedProduct}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Takip No *" name="ship-tracking" value={form.trackingNo} onChange={(v) => setForm({ ...form, trackingNo: v })} placeholder="TRK-000000" />
            <div>
              <Label className="text-xs" htmlFor="ship-carrier">Taşıyıcı</Label>
              <Select value={form.carrier} onValueChange={(v) => setForm({ ...form, carrier: v })}>
                <SelectTrigger id="ship-carrier" className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SHIPMENT_CARRIERS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Field label="Çıkış" name="ship-origin" value={form.origin} onChange={(v) => setForm({ ...form, origin: v })} placeholder="Hamburg" />
            <Field label="Varış *" name="ship-dest" value={form.destination} onChange={(v) => setForm({ ...form, destination: v })} placeholder="İstanbul" />
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
};

function machineToDeliveryFields(m?: { brand?: string; type?: string; model: string; serialNumber: string; controlUnit?: string; controlUnitSerial?: string }) {
  if (!m) return {};
  return {
    tezgahMarka: m.brand ?? "",
    tezgahTip: m.type ?? "",
    tezgahModel: m.model ?? "",
    tezgahSeriNo: m.serialNumber ?? "",
    cncMarka: m.controlUnit?.split(" ")[0] ?? "",
    cncModel: m.controlUnit?.split(" ").slice(1).join(" ") ?? "",
    cncSeriNo: m.controlUnitSerial ?? "",
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
  };
}

export function DeliveryFormFields({
  form,
  setForm,
  customers,
  casesForCustomer,
  machinesForCustomer,
}: {
  form: DeliveryFormState;
  setForm: React.Dispatch<React.SetStateAction<DeliveryFormState>>;
  customers: Customer[];
  casesForCustomer: { id: string; requestedProduct: string }[];
  machinesForCustomer: { id: string; brand?: string; model: string; serialNumber: string }[];
}) {
  const applyMachine = (machineId: string) => {
    const m = machinesForCustomer.find((x) => x.id === machineId);
    setForm((prev) => ({
      ...prev,
      machineId,
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
          <Select value={form.salesCaseId || "none"} onValueChange={(v) => setForm({ ...form, salesCaseId: v === "none" ? "" : v })}>
            <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Belirtilmedi</SelectItem>
              {casesForCustomer.map((c) => <SelectItem key={c.id} value={c.id}>{c.requestedProduct}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Makine / Tezgah</Label>
          <Select value={form.machineId || "none"} onValueChange={(v) => (v === "none" ? setForm({ ...form, machineId: "" }) : applyMachine(v))}>
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
  const { addDelivery, cases, customers, machines } = useStore();
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
const PAYMENT_METHOD_LABELS: Record<string, string> = {
  bank_transfer: "Banka Havalesi",
  cash: "Nakit",
  credit_card: "Kredi Kartı",
  check: "Çek",
  other: "Diğer",
};
const PAYMENT_CURRENCIES = ["USD", "EUR", "TRY"] as const;
const PAYMENT_DOC_EXT_TO_MIME: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};
const fmtPaymentDocBytes = (b: number) =>
  b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`;
const paymentDocTypeLabel = (t: "AccountingInvoice" | "CommercialInvoice") =>
  t === "AccountingInvoice" ? "Fiş" : "Fatura";

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
    paymentMethod: "bank_transfer",
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
    const ext = file.name.split(".").pop()?.toLocaleLowerCase("tr-TR") ?? "";
    const mime = file.type || PAYMENT_DOC_EXT_TO_MIME[ext];
    const up = await fileService.signedUpload({
      bucket: "erp-invoice-documents",
      entityType: "company",
      entityId: companyId,
      filename: file.name,
      mimeType: mime,
      extension: ext,
      sizeBytes: file.size,
    });
    const res = await fetch(up.uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": mime } });
    if (!res.ok) throw new Error(`Depoya yükleme başarısız (${res.status})`);
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
      mimeType: mime,
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.companyId) return toast.error("Firma seçiniz");
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) return toast.error("Geçerli bir tutar giriniz");
    if (!file) return toast.error("Fatura veya fiş dosyası seçiniz");
    if (file.size > 25 * 1024 * 1024) return toast.error("Dosya boyutu 25 MB'ı aşamaz");
    const ext = file.name.split(".").pop()?.toLocaleLowerCase("tr-TR") ?? "";
    const mime = file.type || PAYMENT_DOC_EXT_TO_MIME[ext];
    if (!PAYMENT_DOC_EXT_TO_MIME[ext] || !mime) {
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
          dueDate: form.paymentDate,
          notes: form.notes || undefined,
          invoiceNo: form.invoiceNo || undefined,
        });
        const payment = await financeService.createPayment({
          direction: form.direction,
          receivableId: receivable.id,
          amount,
          currencyCode: form.currencyCode,
          paymentDate: form.paymentDate,
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
          paymentDate: form.paymentDate,
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
              <Select value={form.paymentMethod} onValueChange={(v) => setForm({ ...form, paymentMethod: v })}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.keys(PAYMENT_METHOD_LABELS).map((k) => (
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
        dueDate: form.dueDate,
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
  const { customers, addService, machines: machinesAll, users } = useStore();
  const [open, setOpen] = useState(false);
  const serviceUsers = users.filter((u) => u.role === "Service" || u.department === "Servis");
  const firstMachine = machinesAll[0];
  const [form, setForm] = useState({
    machineId: defaultMachineId ?? firstMachine?.id ?? "",
    assignedUserId: (serviceUsers[0] ?? users[0])?.id ?? "",
    diagnosisNote: "",
    quoteRequired: false,
    serviceNote: "",
  });

  const selectedMachine = machinesAll.find((m) => m.id === form.machineId);
  const customerForMachine = selectedMachine ? customers.find((c) => c.id === selectedMachine.customerId) : undefined;
  const assignedUser = (serviceUsers.length > 0 ? serviceUsers : users).find((u) => u.id === form.assignedUserId);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.machineId) {
      toast.error("Makine seçimi zorunludur");
      return;
    }
    if (!selectedMachine) return;
    try {
      const created = await addService({
        machineId: form.machineId,
        customerId: selectedMachine.customerId,
        assignedUserId: form.assignedUserId,
        diagnosisNote: form.diagnosisNote,
        quoteRequired: form.quoteRequired,
        serviceNote: form.serviceNote,
      });
      toast.success("Servis talebi oluşturuldu", { description: `#${created.id.toUpperCase()}` });
      setForm({
        machineId: firstMachine?.id ?? "",
        assignedUserId: (serviceUsers[0] ?? users[0])?.id ?? "",
        diagnosisNote: "",
        quoteRequired: false,
        serviceNote: "",
      });
      setOpen(false);
    } catch (err: any) {
      toast.error("Servis talebi oluşturulamadı", { description: err?.message ?? "API isteği başarısız oldu." });
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
                Kurulu makine, sorumlu servis personeli ve ilk talep notunu tek kayıtta oluşturun.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={submit} className="min-w-0">
          <div className="max-h-[calc(90dvh-154px)] overflow-y-auto px-6 py-5">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
              <div className="min-w-0 space-y-4">
                <div className="min-w-0">
                  <Label className="text-xs">Makine *</Label>
                  <Select value={form.machineId} onValueChange={(v) => setForm({ ...form, machineId: v })}>
                    <SelectTrigger className="mt-1.5 min-w-0 [&_[data-slot=select-value]]:min-w-0 [&_[data-slot=select-value]]:truncate">
                      <SelectValue placeholder="Makine seçin" />
                    </SelectTrigger>
                    <SelectContent className="max-w-[min(700px,calc(100vw-2rem))]">
                      {machinesAll.map((m) => {
                        const cust = customers.find((c) => c.id === m.customerId);
                        const itemLabel = `${m.model} · ${m.serialNumber}${cust ? ` — ${cust.name}` : ""}`;
                        return (
                          <SelectItem key={m.id} value={m.id}>
                            <span className="block max-w-[620px] truncate">{itemLabel}</span>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  {customerForMachine && (
                    <div className="mt-1.5 truncate text-[11px] text-muted-foreground">
                      Müşteri: {customerForMachine.name} · {customerForMachine.city}
                    </div>
                  )}
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
                      <div className="mt-0.5 truncate font-medium">{customerForMachine?.name ?? "Makine seçin"}</div>
                      <div className="truncate text-[11px] text-muted-foreground">{customerForMachine?.city ?? "—"}</div>
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
            <Button type="submit">Talebi Oluştur</Button>
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
  const { customers, contacts, users, machines } = useStore();
  const [open, setOpen] = useState(false);
  const emptyForm = () => ({
    companyId: customers[0]?.id ?? "",
    contactId: "",
    customerDeviceId: "",
    scheduledDate: new Date().toISOString().slice(0, 10),
    assignedToUserId: users.find((u) => u.role === "Service" || u.department === "Servis")?.id ?? users[0]?.id ?? "",
    location: "",
    locationType: "istanbul_ici" as InstallationLocationType,
    durationHours: "1",
    durationMinutes: "0",
    notes: "",
  });
  const [form, setForm] = useState(emptyForm);

  const reset = () => setForm(emptyForm());

  // Süre (saat + dk) → toplam dakika; ücret @haksan/shared ile hesaplanır
  // (İstanbul içi 70$/saat, dışı 100$/saat; 15/45 dk eşikli yuvarlama).
  const totalMinutes = (parseInt(form.durationHours || "0", 10) || 0) * 60 + (parseInt(form.durationMinutes || "0", 10) || 0);
  const fee = computeInstallationFee(totalMinutes, form.locationType);

  const selectedContacts = contacts.filter((c) => c.customerId === form.companyId);
  // Kurulum tutanağındaki tezgah/CNC alanları bu makineden doldurulur.
  const selectedMachines = machines.filter((m) => m.customerId === form.companyId);
  const serviceUsers = users.filter((u) => u.role === "Service" || u.department === "Servis");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.companyId) return toast.error("Firma seçiniz");
    try {
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
      <DialogContent className="max-w-2xl">
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
                onValueChange={(v) => setForm({ ...form, companyId: v, contactId: "" })}
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

            {/* ── Saha ücretlendirme ── */}
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
              <div className="col-span-2 flex items-center justify-between rounded-md bg-white border border-border/60 px-3 py-2">
                <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <Wallet className="size-4 text-emerald-600" />
                  Hesaplanan ücret
                  <span className="text-[11px]">· {fee.billedHours} saat × ${fee.hourlyRate}</span>
                </span>
                <b className="tabular-nums text-emerald-700">$ {fee.amount.toLocaleString("tr-TR")}</b>
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
  const { customers, stock, addMachine } = useStore();
  const [form, setForm] = useState({
    customerId: "",
    stockItemId: "",
    model: "",
    serialNumber: "",
    installationDate: "",
    warrantyStart: "",
    warrantyEnd: "",
  });

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
      setForm({
        customerId: "",
        stockItemId: "",
        serialNumber: "",
        model: "",
        installationDate: "",
        warrantyStart: "",
        warrantyEnd: "",
      });
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
              <Select value={form.customerId || "none"} onValueChange={(v) => setForm({ ...form, customerId: v === "none" ? "" : v })}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="Firma Seçin" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Seçilmedi</SelectItem>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Field label="Model *" value={form.model} onChange={(v) => setForm({ ...form, model: v })} />
            <Field label="Seri No *" value={form.serialNumber} onChange={(v) => setForm({ ...form, serialNumber: v })} />
            <Field label="Kurulum Tarihi" type="date" value={form.installationDate} onChange={(v) => setForm({ ...form, installationDate: v })} />
            <div />
            <Field label="Garanti Başlangıç" type="date" value={form.warrantyStart} onChange={(v) => setForm({ ...form, warrantyStart: v })} />
            <Field label="Garanti Bitiş" type="date" value={form.warrantyEnd} onChange={(v) => setForm({ ...form, warrantyEnd: v })} />
          </div>
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
          activityDate: date,
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
