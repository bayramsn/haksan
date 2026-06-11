import { useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../ui/select";
import { MultiSelect } from "../ui/multi-select";
import { useStore } from "../../lib/store";
import { useAuth } from "../../../lib/auth";
import { toast } from "sonner";
import { Plus, Trash2, Save, BookmarkPlus, Bold } from "lucide-react";
import type { Product } from "../../lib/mock";

type Currency = "USD" | "EUR" | "TRY";

const DELIVERY_TERMS = [
  { code: "nationalized", label: "Millileştirilmiş Teklif", importCostsExcluded: false },
  { code: "customs", label: "Gümrük Teklif", importCostsExcluded: true },
  { code: "ex_works", label: "İşletme Teslim", importCostsExcluded: false },
  { code: "fob", label: "F.O.B Teslim", importCostsExcluded: true },
] as const;

// Ürün ekle ekranındakiyle aynı kategoriler
const PRODUCT_CATEGORIES = [
  { code: "TEZGAH", label: "Tezgah" },
  { code: "YEDEK_PARCA", label: "Yedek Parça" },
  { code: "OPSIYONEL_DONANIM", label: "Opsiyonel Donanım" },
  { code: "ISCILIK", label: "İşçilik" },
  { code: "AKSESUAR", label: "Aksesuar" },
];
const NOTE_FONT_SIZES = [
  { code: "12", label: "Küçük" },
  { code: "14", label: "Normal" },
  { code: "16", label: "Büyük" },
  { code: "18", label: "Çok Büyük" },
];
// Uyumlu kontrol ünitesi seçenekleri (CNC kontrol üniteleri)
const CONTROL_UNITS = [
  "FANUC", "FANUC 0i-MF", "FANUC 31i", "SIEMENS 828D", "SIEMENS 840D",
  "MITSUBISHI", "HEIDENHAIN", "FAGOR", "OKUMA OSP", "MAZAK MAZATROL", "SYNTEC", "DELEM",
];
// Uyumluluk kategorileri: yalnızca opsiyonel donanım ve yedek parça satırlarında gösterilir
const COMPAT_CATEGORIES = ["OPSIYONEL_DONANIM", "YEDEK_PARCA"];

type PricedRow = { unitPrice: string; vatRate: string };

// Teklife özel opsiyonel donanım — açıklaması (teknik bilgi) yalnızca bu teklif için düzenlenir
type OptionInput = {
  productId: string;
  description: string;
  quantity: string;
  unitPrice: string;
  discount: string;
  vatRate: string;
};

type LineCompatibility = {
  machineIds: string[];
  brands: string[];
  controlUnits: string[];
  supplierIds: string[];
};

type LineState = {
  categoryCode: string;
  productId: string;
  stockCode: string;
  description: string; // ürün adı / modeli
  quantity: string;
  unitPrice: string;
  discount: string;
  vatRate: string;
  options: OptionInput[];
  compatibility: LineCompatibility;
};

const emptyCompatibility = (): LineCompatibility => ({ machineIds: [], brands: [], controlUnits: [], supplierIds: [] });
const hasCompatibility = (c: LineCompatibility) =>
  c.machineIds.length > 0 || c.brands.length > 0 || c.controlUnits.length > 0 || c.supplierIds.length > 0;

const emptyLine = (): LineState => ({ categoryCode: "", productId: "", stockCode: "", description: "", quantity: "1", unitPrice: "", discount: "0", vatRate: "20", options: [], compatibility: emptyCompatibility() });
const emptyOption = (vatRate = "20"): OptionInput => ({ productId: "", description: "", quantity: "1", unitPrice: "0", discount: "0", vatRate });

const num = (s: string) => {
  const n = Number(String(s).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const money = (n: number, c: Currency) =>
  `${n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${c === "TRY" ? "TL" : c}`;

export function QuoteDialog({
  trigger, defaultCustomerId, defaultCaseId,
}: {
  trigger: React.ReactNode;
  defaultCustomerId?: string;
  defaultCaseId?: string;
}) {
  const { customers, contacts, products, users, cases, offers, noteTemplates, createQuoteFull, addNoteTemplate } = useStore();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const suggestNo = () => `${new Date().getFullYear()}/${String(offers.length + 1).padStart(3, "0")}`;

  const [companyId, setCompanyId] = useState(defaultCustomerId ?? "");
  const [contactId, setContactId] = useState("");
  const [caseId, setCaseId] = useState(defaultCaseId ?? "");
  const [quoteDate, setQuoteDate] = useState(today);
  const [documentNo, setDocumentNo] = useState("");
  const [senderId, setSenderId] = useState("");
  const [currency, setCurrency] = useState<Currency>("USD");
  const [vatEnabled, setVatEnabled] = useState(true);
  const [deliveryCode, setDeliveryCode] = useState<string>("ex_works");
  const [lines, setLines] = useState<LineState[]>([emptyLine()]);
  const [note, setNote] = useState("");
  const [noteFontSize, setNoteFontSize] = useState("14");
  const [noteBold, setNoteBold] = useState(false);

  const reset = () => {
    setCompanyId(defaultCustomerId ?? "");
    setContactId("");
    setCaseId(defaultCaseId ?? "");
    setQuoteDate(today);
    setDocumentNo("");
    setSenderId(users.find((u) => u.id === user?.id)?.id ?? users[0]?.id ?? "");
    setCurrency("USD");
    setVatEnabled(true);
    setDeliveryCode("ex_works");
    setLines([emptyLine()]);
    setNote("");
    setNoteFontSize("14");
    setNoteBold(false);
  };

  const handleOpen = (o: boolean) => {
    setOpen(o);
    if (o) reset();
  };

  const companyContacts = contacts.filter((c) => c.customerId === companyId);
  const companyCases = cases.filter((c) => c.customerId === companyId);

  const setLine = (i: number, patch: Partial<LineState>) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const addLine = () => setLines((ls) => [...ls, emptyLine()]);
  const rmLine = (i: number) => setLines((ls) => (ls.length > 1 ? ls.filter((_, idx) => idx !== i) : ls));

  const onPickProduct = (i: number, productId: string) => {
    const p = products.find((x) => x.id === productId);
    if (!p) return setLine(i, { productId });
    setLine(i, {
      productId,
      categoryCode: p.categoryCode || "",
      stockCode: p.stockCode || p.model || "",
      description: p.shortDescription?.trim() || [p.brand, p.model].filter(Boolean).join(" "),
      unitPrice: p.listPrice ? String(p.listPrice) : "",
      vatRate: String(p.vatRate ?? 20),
    });
    // İlk kalemde para birimini üründen al
    if (i === 0 && p.currency) setCurrency(p.currency as Currency);
  };

  const onPickCategory = (i: number, code: string) => {
    setLines((ls) => ls.map((l, idx) => {
      if (idx !== i) return l;
      const prod = products.find((x) => x.id === l.productId);
      // Seçili ürün yeni kategoriye uymuyorsa temizle
      const keep = prod && prod.categoryCode === code;
      return keep ? { ...l, categoryCode: code } : { ...l, categoryCode: code, productId: "", stockCode: "", description: "", options: [] };
    }));
  };

  const setOption = (i: number, j: number, patch: Partial<OptionInput>) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, options: l.options.map((o, k) => (k === j ? { ...o, ...patch } : o)) } : l)));
  const addOption = (i: number, seed?: Partial<OptionInput>) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, options: [...l.options, { ...emptyOption(l.vatRate), ...seed }] } : l)));
  const rmOption = (i: number, j: number) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, options: l.options.filter((_, k) => k !== j) } : l)));

  const onPickOptionProduct = (i: number, j: number, productId: string) => {
    const p = products.find((x) => x.id === productId);
    if (!p) return setOption(i, j, { productId });
    // Ürünün teknik bilgisini açıklamaya taşı (yalnızca bu teklif için düzenlenebilir)
    const tech = p.specs?.filter((s) => s.key && s.value).map((s) => `${s.key}: ${s.value}`).join(" · ");
    setOption(i, j, {
      productId,
      description: [p.shortDescription?.trim() || `${p.brand} ${p.model}`, tech].filter(Boolean).join(" — "),
      unitPrice: p.listPrice ? String(p.listPrice) : "0",
      vatRate: String(p.vatRate ?? 20),
    });
  };

  const optionalProducts = useMemo(
    () => products.filter((p) => p.categoryCode === "OPSIYONEL_DONANIM"),
    [products]
  );

  // Uyumluluk seçimi için kaynak listeler (çoklu seçim)
  const setCompat = (i: number, patch: Partial<LineCompatibility>) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, compatibility: { ...l.compatibility, ...patch } } : l)));

  const machineOptions = useMemo(
    () => products.filter((p) => p.categoryCode === "TEZGAH").map((p) => ({ value: p.id, label: `${p.brand} ${p.model}`.trim() })),
    [products]
  );
  const brandOptions = useMemo(
    () => Array.from(new Set(products.map((p) => p.brand).filter(Boolean))).sort().map((b) => ({ value: b, label: b })),
    [products]
  );
  const supplierOptions = useMemo(
    () => customers.filter((c) => c.firmType === "supplier" || c.firmType === "supplier_customer").map((c) => ({ value: c.id, label: c.name })),
    [customers]
  );
  const controlUnitOptions = useMemo(() => CONTROL_UNITS.map((c) => ({ value: c, label: c })), []);

  // Girilen fiyat KDV hariç (net). KDV yalnızca "KDV Hesapla" açıkken eklenir.
  const netUnitPrice = (r: PricedRow) => num(r.unitPrice);
  const effVatRate = (r: PricedRow) => (vatEnabled ? num(r.vatRate) : 0);

  const lineTotalNet = (r: { quantity: string; unitPrice: string; discount: string; vatRate: string }) =>
    num(r.quantity) * netUnitPrice(r) - num(r.discount);

  const totals = useMemo(() => {
    let subtotal = 0, discount = 0, vat = 0;
    const rows = lines.flatMap((l) => [l, ...l.options]);
    for (const r of rows) {
      const net = netUnitPrice(r);
      const qty = num(r.quantity);
      const disc = num(r.discount);
      const rowNet = qty * net - disc;
      subtotal += qty * net;
      discount += disc;
      vat += rowNet * (effVatRate(r) / 100);
    }
    const grand = subtotal - discount + vat;
    return { subtotal, discount, vat, grand };
  }, [lines, vatEnabled]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId) return toast.error("Firma seçiniz");
    const valid = lines.filter((l) => (l.productId || l.description.trim() || l.stockCode.trim()) && num(l.quantity) > 0);
    if (valid.length === 0) return toast.error("En az bir ürün satırı ekleyin");

    const preset = DELIVERY_TERMS.find((d) => d.code === deliveryCode);

    // Ana ürün + teklife özel opsiyonel donanımları tek kalem listesine düzleştir
    const items = valid.flatMap((l) => {
      const mainName = [l.stockCode.trim(), l.description.trim()].filter(Boolean).join(" — ") || "Ürün";
      const main = {
        productModelId: l.productId || undefined,
        description: mainName,
        quantity: num(l.quantity),
        unitPrice: Number(netUnitPrice(l).toFixed(4)),
        discountAmount: num(l.discount),
        vatRate: effVatRate(l),
        compatibility:
          COMPAT_CATEGORIES.includes(l.categoryCode) && hasCompatibility(l.compatibility)
            ? l.compatibility
            : undefined,
      };
      const opts = (l.categoryCode === "TEZGAH" ? l.options : [])
        .filter((o) => o.productId || o.description.trim())
        .map((o) => ({
          productModelId: o.productId || undefined,
          description: `↳ Opsiyon: ${o.description.trim() || "Opsiyonel donanım"}`,
          quantity: num(o.quantity) || 1,
          unitPrice: Number(netUnitPrice(o).toFixed(4)),
          discountAmount: num(o.discount),
          vatRate: effVatRate(o),
        }));
      return [main, ...opts];
    });

    setSaving(true);
    try {
      const res = await createQuoteFull({
        opportunityId: caseId || undefined,
        companyId,
        contactId: contactId || undefined,
        quoteDate: new Date(quoteDate).toISOString(),
        documentNo: documentNo.trim() || undefined,
        currencyCode: currency,
        projectOwnerUserId: senderId || undefined,
        notes: note.trim() || undefined,
        deliveryTermsText: preset?.label,
        importCostsExcluded: preset?.importCostsExcluded ?? true,
        caseTitle: valid[0].description || undefined,
        items,
      });
      toast.success("Teklif kaydedildi", { description: res.documentNo });
      setOpen(false);
    } catch (err: any) {
      toast.error("Teklif kaydedilemedi", { description: err?.message ?? "API isteği başarısız oldu." });
    } finally {
      setSaving(false);
    }
  };

  const applyTemplate = (id: string) => {
    const t = noteTemplates.find((x) => x.id === id);
    if (!t) return;
    setNote((n) => (n.trim() ? `${n}\n${t.body}` : t.body));
  };

  const saveTemplate = async () => {
    const body = note.trim();
    if (!body) return toast.error("Önce not yazın");
    const title = window.prompt("Şablon başlığı:");
    if (!title?.trim()) return;
    try {
      await addNoteTemplate({ title: title.trim(), body, scope: "quote" });
      toast.success("Not şablonu kaydedildi");
    } catch (err: any) {
      toast.error("Şablon kaydedilemedi", { description: err?.message });
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="w-[95vw] sm:max-w-[1080px] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Yeni Teklif</DialogTitle>
          <DialogDescription>Firma, ürünler, fiyatlandırma, teslim şekli ve notları tek ekranda yönetin.</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-5">
          {/* META */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-1">
              <Label className="text-xs">Firma *</Label>
              <Select value={companyId} onValueChange={(v) => { setCompanyId(v); setContactId(""); setCaseId(""); }}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="Firma seçin..." /></SelectTrigger>
                <SelectContent>
                  {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Kontak</Label>
              <Select value={contactId || "none"} onValueChange={(v) => setContactId(v === "none" ? "" : v)} disabled={!companyId}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="Kontak seçin" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Belirtilmedi</SelectItem>
                  {companyContacts.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Satış Kartı</Label>
              <Select value={caseId || "auto"} onValueChange={(v) => setCaseId(v === "auto" ? "" : v)} disabled={!companyId}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Otomatik oluştur</SelectItem>
                  {companyCases.map((c) => <SelectItem key={c.id} value={c.id}>#{c.id.slice(0, 8).toUpperCase()} · {c.requestedProduct}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">Teklif Tarihi</Label>
              <Input type="date" className="mt-1.5" value={quoteDate} onChange={(e) => setQuoteDate(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Teklif No</Label>
              <div className="flex gap-1.5 mt-1.5">
                <Input value={documentNo} onChange={(e) => setDocumentNo(e.target.value)} placeholder="Otomatik" />
                <Button type="button" variant="outline" size="sm" onClick={() => setDocumentNo(suggestNo())}>Öner</Button>
              </div>
            </div>
            <div>
              <Label className="text-xs">Teklifi Gönderen</Label>
              <Select value={senderId} onValueChange={setSenderId}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="Seçin" /></SelectTrigger>
                <SelectContent>
                  {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* PRODUCTS */}
          <div className="rounded-lg border border-border/70">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border/60 bg-muted/30">
              <div className="text-sm font-medium">Ürünler</div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs">
                  <input type="checkbox" checked={vatEnabled} onChange={(e) => setVatEnabled(e.target.checked)} />
                  KDV Hesapla
                </label>
                <Select value={currency} onValueChange={(v: Currency) => setCurrency(v)}>
                  <SelectTrigger className="h-8 w-24"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="TRY">TL</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="divide-y divide-border/60">
              {lines.map((l, i) => {
                const lineTotal = lineTotalNet(l);
                const product = products.find((x) => x.id === l.productId);
                const suggestions = product?.optionalEquipment ?? [];
                const lineProducts = products.filter((p) => !l.categoryCode || p.categoryCode === l.categoryCode);
                return (
                  <div key={i} className="p-3 space-y-2">
                    <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr_auto] gap-2">
                      <Select value={l.categoryCode || "all"} onValueChange={(v) => onPickCategory(i, v === "all" ? "" : v)}>
                        <SelectTrigger className="h-8"><SelectValue placeholder="Kategori" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Tüm kategoriler</SelectItem>
                          {PRODUCT_CATEGORIES.map((c) => <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Select value={l.productId || "custom"} onValueChange={(v) => onPickProduct(i, v === "custom" ? "" : v)}>
                        <SelectTrigger className="h-8"><SelectValue placeholder="Ürün seçin" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="custom">Serbest kalem</SelectItem>
                          {lineProducts.map((p: Product) => (
                            <SelectItem key={p.id} value={p.id}>{p.brand} {p.model}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 justify-self-end" onClick={() => rmLine(i)}>
                        <Trash2 className="size-4 text-muted-foreground" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-2">
                      <Input className="h-8" value={l.stockCode} onChange={(e) => setLine(i, { stockCode: e.target.value })} placeholder="Stok Kodu" />
                      <Input className="h-8" value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} placeholder="Ürün adı / modeli" />
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
                      <div>
                        <Label className="text-[10px] uppercase text-muted-foreground">Adet</Label>
                        <Input className="h-8" inputMode="decimal" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} />
                      </div>
                      <div>
                        <Label className="text-[10px] uppercase text-muted-foreground">Liste Fiyatı</Label>
                        <Input className="h-8" inputMode="decimal" value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: e.target.value })} placeholder="0" />
                      </div>
                      <div>
                        <Label className="text-[10px] uppercase text-muted-foreground">İndirim</Label>
                        <Input className="h-8" inputMode="decimal" value={l.discount} onChange={(e) => setLine(i, { discount: e.target.value })} placeholder="0" />
                      </div>
                      <div>
                        <Label className="text-[10px] uppercase text-muted-foreground">KDV %</Label>
                        <Input className="h-8" inputMode="decimal" value={l.vatRate} onChange={(e) => setLine(i, { vatRate: e.target.value })} />
                      </div>
                      <div className="text-right">
                        <Label className="text-[10px] uppercase text-muted-foreground">Satır (net)</Label>
                        <div className="h-8 flex items-center justify-end text-sm tabular-nums">{money(lineTotal, currency)}</div>
                      </div>
                    </div>

                    {/* Teklife özel opsiyonel donanım — yalnızca Tezgah kategorisinde */}
                    {l.categoryCode === "TEZGAH" && (
                    <div className="mt-1 rounded-md border border-dashed border-border/70 bg-muted/20 p-2 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-medium text-muted-foreground">Opsiyonel Donanım · bu teklife özel</span>
                        <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => addOption(i)}>
                          <Plus className="size-3.5" /> Opsiyon Ekle
                        </Button>
                      </div>

                      {suggestions.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {suggestions.map((s, k) => (
                            <button
                              key={`${s}-${k}`}
                              type="button"
                              onClick={() => addOption(i, { description: s })}
                              className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-white px-2 py-0.5 text-[11px] hover:border-primary/50 hover:bg-primary/5"
                            >
                              <Plus className="size-3" /> {s}
                            </button>
                          ))}
                        </div>
                      )}

                      {l.options.map((o, j) => (
                        <div key={j} className="rounded-md border border-border/60 bg-white p-2 space-y-2">
                          <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-2">
                            <Select value={o.productId || "custom"} onValueChange={(v) => onPickOptionProduct(i, j, v === "custom" ? "" : v)}>
                              <SelectTrigger className="h-8"><SelectValue placeholder="Opsiyonel donanım ürünü / serbest" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="custom">Serbest opsiyon</SelectItem>
                                {optionalProducts.map((p: Product) => (
                                  <SelectItem key={p.id} value={p.id}>{p.brand} {p.model}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 justify-self-end" onClick={() => rmOption(i, j)}>
                              <Trash2 className="size-4 text-muted-foreground" />
                            </Button>
                          </div>
                          <Input className="h-8" value={o.description} onChange={(e) => setOption(i, j, { description: e.target.value })} placeholder="Teknik bilgi / açıklama (yalnızca bu teklif)" />
                          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
                            <div>
                              <Label className="text-[10px] uppercase text-muted-foreground">Adet</Label>
                              <Input className="h-8" inputMode="decimal" value={o.quantity} onChange={(e) => setOption(i, j, { quantity: e.target.value })} />
                            </div>
                            <div>
                              <Label className="text-[10px] uppercase text-muted-foreground">Fiyat</Label>
                              <Input className="h-8" inputMode="decimal" value={o.unitPrice} onChange={(e) => setOption(i, j, { unitPrice: e.target.value })} placeholder="0" />
                            </div>
                            <div>
                              <Label className="text-[10px] uppercase text-muted-foreground">İndirim</Label>
                              <Input className="h-8" inputMode="decimal" value={o.discount} onChange={(e) => setOption(i, j, { discount: e.target.value })} placeholder="0" />
                            </div>
                            <div>
                              <Label className="text-[10px] uppercase text-muted-foreground">KDV %</Label>
                              <Input className="h-8" inputMode="decimal" value={o.vatRate} onChange={(e) => setOption(i, j, { vatRate: e.target.value })} />
                            </div>
                            <div className="text-right">
                              <Label className="text-[10px] uppercase text-muted-foreground">Satır (net)</Label>
                              <div className="h-8 flex items-center justify-end text-sm tabular-nums">{money(lineTotalNet(o), currency)}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    )}

                    {/* Uyumluluk — yalnızca opsiyonel donanım & yedek parça satırlarında (çoklu seçim) */}
                    {COMPAT_CATEGORIES.includes(l.categoryCode) && (
                    <div className="mt-1 rounded-md border border-dashed border-blue-200 bg-brand-blue-soft p-2 space-y-2">
                      <span className="text-[11px] font-medium text-brand-blue">Uyumluluk · çoklu seçim</span>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <div>
                          <Label className="text-[10px] uppercase text-muted-foreground">Uyumlu Makineler</Label>
                          <MultiSelect options={machineOptions} selected={l.compatibility.machineIds} onChange={(v) => setCompat(i, { machineIds: v })} placeholder="Makine seçin" emptyText="Tezgah ürünü yok" />
                        </div>
                        <div>
                          <Label className="text-[10px] uppercase text-muted-foreground">Uyumlu Markalar</Label>
                          <MultiSelect options={brandOptions} selected={l.compatibility.brands} onChange={(v) => setCompat(i, { brands: v })} placeholder="Marka seçin" />
                        </div>
                        <div>
                          <Label className="text-[10px] uppercase text-muted-foreground">Uyumlu Kontrol Üniteleri</Label>
                          <MultiSelect options={controlUnitOptions} selected={l.compatibility.controlUnits} onChange={(v) => setCompat(i, { controlUnits: v })} placeholder="Kontrol ünitesi seçin" />
                        </div>
                        <div>
                          <Label className="text-[10px] uppercase text-muted-foreground">Tedarikçiler</Label>
                          <MultiSelect options={supplierOptions} selected={l.compatibility.supplierIds} onChange={(v) => setCompat(i, { supplierIds: v })} placeholder="Tedarikçi seçin" emptyText="Tedarikçi firma yok" />
                        </div>
                      </div>
                    </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="px-3 py-2 border-t border-border/60">
              <Button type="button" variant="outline" size="sm" className="h-8 gap-1" onClick={addLine}>
                <Plus className="size-3.5" /> Satır Ekle
              </Button>
            </div>
          </div>

          {/* PRICING + DELIVERY */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Teslim Şekli</Label>
              <Select value={deliveryCode} onValueChange={setDeliveryCode}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DELIVERY_TERMS.map((d) => <SelectItem key={d.code} value={d.code}>{d.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-sm space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Ara Toplam</span><span className="tabular-nums">{money(totals.subtotal, currency)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">İndirim</span><span className="tabular-nums">-{money(totals.discount, currency)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">KDV</span><span className="tabular-nums">{money(totals.vat, currency)}</span></div>
              <div className="flex justify-between border-t border-border/60 pt-1 font-medium"><span>Genel Toplam</span><span className="tabular-nums">{money(totals.grand, currency)}</span></div>
            </div>
          </div>

          {/* NOTES */}
          <div>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <Label className="text-xs">Notlar</Label>
              <div className="flex items-center gap-2">
                {/* Yazı puntosu */}
                <Select value={noteFontSize} onValueChange={setNoteFontSize}>
                  <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {NOTE_FONT_SIZES.map((f) => <SelectItem key={f.code} value={f.code}>{f.label} ({f.code}px)</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant={noteBold ? "default" : "outline"}
                  size="icon"
                  className="h-7 w-7"
                  title="Kalın"
                  onClick={() => setNoteBold((b) => !b)}
                >
                  <Bold className="size-3.5" />
                </Button>
                <Select value="" onValueChange={applyTemplate}>
                  <SelectTrigger className="h-7 w-44 text-xs"><SelectValue placeholder="Hazır not ekle" /></SelectTrigger>
                  <SelectContent>
                    {noteTemplates.length === 0 ? (
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">Şablon yok</div>
                    ) : (
                      noteTemplates.map((t) => <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>)
                    )}
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={saveTemplate}>
                  <BookmarkPlus className="size-3.5" /> Şablon kaydet
                </Button>
              </div>
            </div>
            <Textarea
              className="mt-1.5"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ödeme şartları, teslim süresi, kapsam vb."
              style={{ fontSize: `${noteFontSize}px`, fontWeight: noteBold ? 600 : 400 }}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Vazgeç</Button>
            <Button type="submit" disabled={saving} className="gap-1">
              <Save className="size-4" /> {saving ? "Kaydediliyor…" : "Teklifi Kaydet"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
