import { useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from "../ui/select";
import { useStore } from "../../lib/store";
import { SALES_STAGES, salesStageLabel } from "../../lib/mock";
import { toast } from "sonner";
import { Building2, User as UserIcon } from "lucide-react";
import { serviceService, fileService } from "../../../lib/services";

/* ---------- Customer ---------- */
const COMPANY_GROUP_OPTIONS = [
  { code: "cnc", label: "CNC" },
  { code: "universal", label: "Üniversal" },
  { code: "sac_isleme", label: "Sac İşleme" },
];

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
  const [type, setType] = useState<"company" | "person">("company");
  const [firmType, setFirmType] = useState<"customer" | "supplier_customer" | "supplier">("customer");
  const [salesStatus, setSalesStatus] = useState<"potential" | "active_customer">("potential");
  const [form, setForm] = useState(emptyCompanyForm());

  const reset = () => setForm(emptyCompanyForm());

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
            <Field label="Firma Sektörü" value={form.sector} onChange={(v) => setForm({ ...form, sector: v })} />
            <Field label={type === "company" ? "Firma Ünvanı *" : "Ad Soyad *"} value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
            <Field label="Telefon-1" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} placeholder="+90 ..." />
            <Field label="Telefon-2" value={form.phone2} onChange={(v) => setForm({ ...form, phone2: v })} placeholder="+90 ..." />
            <Field label="Faks" value={form.fax} onChange={(v) => setForm({ ...form, fax: v })} placeholder="+90 ..." />
            <Field label="Mail-1" value={form.email} onChange={(v) => setForm({ ...form, email: v })} type="email" />
            <Field label="Mail-2" value={form.email2} onChange={(v) => setForm({ ...form, email2: v })} type="email" />
            <Field label="Web Sitesi" value={form.website} onChange={(v) => setForm({ ...form, website: v })} placeholder="https://..." />
            <Field label="Açık Adres" value={form.address} onChange={(v) => setForm({ ...form, address: v })} className="col-span-2" />
            <Field label="İlçe" value={form.district} onChange={(v) => setForm({ ...form, district: v })} />
            <Field label="İl" value={form.city} onChange={(v) => setForm({ ...form, city: v })} />
            <Field label="Ülke" value={form.country} onChange={(v) => setForm({ ...form, country: v })} />
            <Field label="Vergi Dairesi" value={form.taxOffice} onChange={(v) => setForm({ ...form, taxOffice: v })} />
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
  const [form, setForm] = useState(emptyContactForm(defaultCustomerId));

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
    if (nextOpen) reset();
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
export function CreateCaseDialog({ trigger, defaultCustomerId }: { trigger: React.ReactNode; defaultCustomerId?: string }) {
  const { customers, addCase, users, products } = useStore();
  const [open, setOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [form, setForm] = useState({
    customerId: defaultCustomerId ?? "",
    assignedUserId: users.find((u) => u.role === "Sales" || u.role === "Admin")?.id ?? users[0]?.id ?? "",
    requestedProduct: "",
    requestedModel: "",
    quantity: 1,
    estimatedAmount: 0,
    currency: "EUR" as "EUR" | "USD" | "TRY",
    stage: "lead" as (typeof SALES_STAGES)[number],
    department: "Satış",
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customerId) return toast.error("Müşteri seçiniz");
    if (!form.requestedProduct) return toast.error("Ürün giriniz");
    try {
      const sc = await addCase(form as any);
      toast.success("Satış kartı oluşturuldu", { description: `#${sc.id.toUpperCase()}` });
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
              <Select value={form.customerId} onValueChange={(v) => setForm({ ...form, customerId: v })}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="Müşteri seçin..." /></SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name} <span className="text-muted-foreground text-xs ml-2">{c.city}</span></SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Talep Edilen Ürün ve Model *</Label>
              <Select
                value={selectedProductId}
                onValueChange={(v) => {
                  const p = products.find((pr) => pr.id === v);
                  setSelectedProductId(v);
                  if (p) {
                    const line = [p.brand, p.model].filter(Boolean).join(" ").trim();
                    setForm((f) => ({ ...f, requestedProduct: line, requestedModel: p.model ?? "" }));
                  }
                }}
              >
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="Ürün ve model seçin..." /></SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {[p.brand, p.model].filter(Boolean).join(" ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

/* ---------- Offer ---------- */
export function CreateOfferDialog({ trigger, defaultCaseId }: { trigger: React.ReactNode; defaultCaseId?: string }) {
  const { cases, customers, offers, addOffer } = useStore();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    salesCaseId: defaultCaseId ?? "",
    quoteNo: "",
    amount: 0,
    currency: "EUR" as "EUR" | "USD" | "TRY",
    status: "Draft" as "Draft" | "Sent" | "Approved" | "Rejected",
    note: "",
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.salesCaseId) return toast.error("Satış kartı seçiniz");
    if (!form.quoteNo.trim()) return toast.error("Teklif numarası giriniz");
    if (!form.amount || form.amount <= 0) return toast.error("Tutar giriniz");
    const existing = offers.filter((o) => o.salesCaseId === form.salesCaseId).length;
    try {
      const o = await addOffer({ ...form, revision: existing + 1 });
      toast.success("Teklif oluşturuldu", { description: `${o.quoteNo} · R${o.revision}` });
      setOpen(false);
      setForm({ salesCaseId: defaultCaseId ?? "", quoteNo: "", amount: 0, currency: "EUR", status: "Draft", note: "" });
    } catch (err: any) {
      toast.error("Teklif oluşturulamadı", { description: err?.message ?? "API isteği başarısız oldu." });
    }
  };

  const nextQuoteNo = () => {
    const year = new Date().getFullYear();
    const seq = String(offers.length + 1).padStart(4, "0");
    setForm((f) => ({ ...f, quoteNo: `TKL-${year}-${seq}` }));
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v && !form.quoteNo) nextQuoteNo(); }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Yeni Teklif</DialogTitle>
          <DialogDescription>Bir satış kartı için teklif (revizyon) oluşturun.</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label className="text-xs">Satış Kartı *</Label>
              <Select value={form.salesCaseId} onValueChange={(v) => setForm({ ...form, salesCaseId: v })}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="Satış kartı seçin..." /></SelectTrigger>
                <SelectContent>
                  {cases
                    .filter((s) => s.stage !== "Lost" && s.stage !== "Completed" && s.stage !== "cancelled" && s.stage !== "delivered")
                    .map((s) => {
                      const c = customers.find((x) => x.id === s.customerId);
                      return (
                        <SelectItem key={s.id} value={s.id}>
                          #{s.id.toUpperCase()} · {c?.name} — {s.requestedProduct}
                        </SelectItem>
                      );
                    })}
                </SelectContent>
              </Select>
            </div>
            <Field label="Teklif No *" value={form.quoteNo} onChange={(v) => setForm({ ...form, quoteNo: v })} placeholder="TKL-2026-0001" />
            <Field label="Tutar *" type="number" value={String(form.amount)} onChange={(v) => setForm({ ...form, amount: Number(v) || 0 })} />
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
              <Label className="text-xs">Durum</Label>
              <Select value={form.status} onValueChange={(v: any) => setForm({ ...form, status: v })}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Draft">Taslak</SelectItem>
                  <SelectItem value="Sent">Gönderildi</SelectItem>
                  <SelectItem value="Approved">Onaylandı</SelectItem>
                  <SelectItem value="Rejected">Reddedildi</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Not</Label>
              <Textarea className="mt-1.5" rows={3} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Ödeme şartları, teslim süresi, kapsam vb." />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Vazgeç</Button>
            <Button type="submit">Teklifi Oluştur</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Stock Item ---------- */
const WAREHOUSES = ["İstanbul Ana Depo", "Ankara Şube", "İzmir Depo", "Bursa Depo"];
const BRANDS = ["Acme", "Beta", "Gamma", "Delta"];
const COUNTER_TYPES = ["Endüstriyel", "Hafif", "Yüksek Kapasite", "Mobil"];
const CONTROL_PANELS = ["CP-Pro", "CP-Lite", "CP-Max"];
const STATUSES: Array<"Available" | "Reserved" | "Sold" | "Inactive"> = ["Available", "Reserved", "Sold", "Inactive"];

export function CreateStockDialog({ trigger }: { trigger: React.ReactNode }) {
  const { addStock, stock } = useStore();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    brand: "Acme",
    counterType: "Endüstriyel",
    counterModel: "",
    serialNumber: "",
    controlPanel: "CP-Pro",
    stockCode: "",
    warehouse: "İstanbul Ana Depo",
    status: "Available" as "Available" | "Reserved" | "Sold" | "Inactive",
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.counterModel.trim()) return toast.error("Model giriniz");
    if (!form.serialNumber.trim()) return toast.error("Seri numarası giriniz");
    if (!form.stockCode.trim()) return toast.error("Stok kodu giriniz");
    if (stock.some((s) => s.serialNumber === form.serialNumber)) return toast.error("Bu seri numarası zaten kayıtlı");
    if (stock.some((s) => s.stockCode === form.stockCode)) return toast.error("Bu stok kodu zaten kullanılıyor");
    try {
      const created = await addStock(form);
      toast.success("Stok kalemi eklendi", { description: `${created.stockCode} · ${created.serialNumber}` });
      setOpen(false);
      setForm({ brand: "Acme", counterType: "Endüstriyel", counterModel: "", serialNumber: "", controlPanel: "CP-Pro", stockCode: "", warehouse: "İstanbul Ana Depo", status: "Available" });
    } catch (err: any) {
      toast.error("Stok kalemi eklenemedi", { description: err?.message ?? "API isteği başarısız oldu." });
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Marka</Label>
              <Select value={form.brand} onValueChange={(v) => setForm({ ...form, brand: v })}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BRANDS.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Sayaç Tipi</Label>
              <Select value={form.counterType} onValueChange={(v) => setForm({ ...form, counterType: v })}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COUNTER_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Field label="Model *" value={form.counterModel} onChange={(v) => setForm({ ...form, counterModel: v })} placeholder="X-200" />
            <Field label="Seri No *" value={form.serialNumber} onChange={(v) => setForm({ ...form, serialNumber: v })} placeholder="SN-200-0001" />
            <div>
              <Label className="text-xs">Kontrol Paneli</Label>
              <Select value={form.controlPanel} onValueChange={(v) => setForm({ ...form, controlPanel: v })}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONTROL_PANELS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
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
              <Select value={form.warehouse} onValueChange={(v) => setForm({ ...form, warehouse: v })}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WAREHOUSES.map((w) => <SelectItem key={w} value={w}>{w}</SelectItem>)}
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

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Vazgeç</Button>
            <Button type="submit">Stoğa Ekle</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Activity ---------- */
const ACTIVITY_TYPES = ["Çağrı", "Toplantı", "E-posta", "Ziyaret", "Not"];

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
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (o: boolean) => { onOpenChange ? onOpenChange(o) : setInternalOpen(o); };

  const [form, setForm] = useState({
    type: "Çağrı",
    title: "",
    note: "",
    date: new Date().toISOString().slice(0, 10),
    byUserId: users[0]?.id ?? "u1",
  });

  const reset = () => setForm({
    type: "Çağrı", title: "", note: "",
    date: new Date().toISOString().slice(0, 10),
    byUserId: users[0]?.id ?? "u1",
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
              <Label className="text-xs">Tip</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ACTIVITY_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
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
import type { Product, ProductSpec } from "../../lib/mock";
import { ClipboardList, Plus, Trash2, X, Upload, Loader2, Package, UserRound, Wrench } from "lucide-react";

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

function Field({ label, value, onChange, type = "text", placeholder, className = "" }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string; className?: string;
}) {
  return (
    <div className={className}>
      <Label className="text-xs">{label}</Label>
      <Input className="mt-1.5" type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
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
  const [form, setForm] = useState({
    companyId: customers[0]?.id ?? "",
    contactId: "",
    customerDeviceId: "",
    scheduledDate: new Date().toISOString().slice(0, 10),
    assignedToUserId: users.find((u) => u.role === "Service" || u.department === "Servis")?.id ?? users[0]?.id ?? "",
    location: "",
    notes: "",
  });

  const reset = () => setForm({
    companyId: customers[0]?.id ?? "",
    contactId: "",
    customerDeviceId: "",
    scheduledDate: new Date().toISOString().slice(0, 10),
    assignedToUserId: users.find((u) => u.role === "Service" || u.department === "Servis")?.id ?? users[0]?.id ?? "",
    location: "",
    notes: "",
  });

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
