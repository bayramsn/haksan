import { useEffect, useMemo, useState } from "react";
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
import { useFx, FxRateBadge } from "../../lib/fx";
import { useAuth } from "../../../lib/auth";
import { quoteService } from "../../../lib/services";
import { toast } from "sonner";
import { Plus, Trash2, Save, BookmarkPlus, Bold } from "lucide-react";
import type { Product, ProductSpec } from "../../lib/mock";
import { normalizeProductSpecKey, productSpecDefaults, specsForProductType } from "../../lib/productSpecTemplates";
import { quoteDefaultsFromCase } from "../../lib/workflow";
import { matchQuoteNoteVariantKey, QUOTE_NOTE_VARIANTS } from "../../lib/print";
import { DialogSplitLayout, DialogSidebarSection } from "../shared/DialogSplitLayout";
import {
  DocumentTermsTemplateEditor,
  matchSavedTermsTemplate,
  useTermsTemplates,
} from "./DocumentTermsTemplateEditor";

// Şablon eşleşmesi: edit modunda yüklenen şartlar bir şablonla birebir aynıysa
// o şablonu önseç (proforma otomatik tespitiyle aynı yardımcıyı kullanır).
const matchNoteVariant = matchQuoteNoteVariantKey;
const TERMS_TEMPLATE_SCOPE = "quote_terms";

type Currency = "USD" | "EUR" | "TRY";

const DELIVERY_TERMS = [
  { code: "cif_istanbul", label: "Tezgah CİF İstanbul", importCostsExcluded: true },
  { code: "export_address", label: "İhracat Adrese Teslim", importCostsExcluded: true },
  { code: "nationalized", label: "Millileştirilmiş Teklif", importCostsExcluded: false },
  { code: "customs", label: "Gümrük Teklif", importCostsExcluded: true },
  { code: "ex_works", label: "İşletme Teslim", importCostsExcluded: false },
  { code: "fob", label: "F.O.B Teslim", importCostsExcluded: true },
] as const;

const DELIVERY_NOTE_VARIANT: Record<string, string> = {
  cif_istanbul: "cif-istanbul",
  export_address: "ihracat",
  nationalized: "millilestirilmis",
  customs: "gumruk",
  ex_works: "isletme-teslim",
  fob: "fob",
};

const NOTE_VARIANT_DELIVERY: Record<string, string> = Object.fromEntries(
  Object.entries(DELIVERY_NOTE_VARIANT).map(([delivery, variant]) => [variant, delivery])
);

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
  groupCode: string;
  categoryCode: string;
  subcategoryCode: string;
  productId: string;
  stockCode: string;
  description: string; // ürün adı / modeli
  technicalSpecs: ProductSpec[];
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

const emptyLine = (): LineState => ({ groupCode: "", categoryCode: "", subcategoryCode: "", productId: "", stockCode: "", description: "", technicalSpecs: [], quantity: "1", unitPrice: "", discount: "0", vatRate: "20", options: [], compatibility: emptyCompatibility() });
const emptyOption = (vatRate = "20"): OptionInput => ({ productId: "", description: "", quantity: "1", unitPrice: "0", discount: "0", vatRate });

const cleanTechnicalSpecs = (specs: ProductSpec[] = []) =>
  specs
    .map((spec) => ({
      key: spec.key.trim(),
      value: spec.value.trim(),
      unit: (spec.unit ?? spec.specUnit ?? "").trim() || undefined,
      specUnit: (spec.unit ?? spec.specUnit ?? "").trim() || undefined,
      groupCode: spec.groupCode?.trim() || undefined,
      groupName: spec.groupName?.trim() || undefined,
      group: spec.groupName?.trim() || spec.groupCode?.trim() || undefined,
    }))
    .filter((spec) => spec.key && spec.value);

const technicalSpecsFromProduct = (product?: Product): ProductSpec[] =>
  product ? specsForProductType(product.productTypeCode, product.specs ?? []) : [];

const isProductTypeTemplateSpec = (product: Product | undefined, spec: ProductSpec) =>
  productSpecDefaults(product?.productTypeCode).some((templateSpec) => normalizeProductSpecKey(templateSpec.key) === normalizeProductSpecKey(spec.key));

const num = (s: string) => {
  const n = Number(String(s).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const money = (n: number, c: Currency) =>
  `${n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${c === "TRY" ? "TL" : c}`;

export function QuoteDialog({
  trigger, defaultCustomerId, defaultCaseId, offerId,
  open: controlledOpen, onOpenChange,
}: {
  trigger?: React.ReactNode;
  defaultCustomerId?: string;
  defaultCaseId?: string;
  /** Verilirse dialog düzenleme modunda açılır ve mevcut teklif yüklenir. */
  offerId?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const { customers, contacts, products, users, cases, offers, noteTemplates, createQuoteFull, addNoteTemplate, updateNoteTemplate, deleteNoteTemplate, refresh } = useStore();
  const editing = Boolean(offerId);
  const { convert } = useFx();
  const { user, activeDivision, hasRole } = useAuth();
  // Bölüm seçici yalnızca süper admin'e açıktır; diğer roller kendi birincil
  // bölümüne auth/header seviyesinde kilitlenir.
  const canPickDivision = hasRole("super_admin") && (user?.canViewAllDivisions ?? false);
  const divisions = user?.divisions ?? [];
  const defaultDivisionId = activeDivision && activeDivision !== "all" ? activeDivision : divisions[0]?.id ?? "";
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const [saving, setSaving] = useState(false);
  const [loadingEdit, setLoadingEdit] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const suggestNo = () => `${new Date().getFullYear()}/${String(offers.length + 1).padStart(3, "0")}`;

  const [companyId, setCompanyId] = useState(defaultCustomerId ?? "");
  const [contactId, setContactId] = useState("");
  const [caseId, setCaseId] = useState(defaultCaseId ?? "");
  const [divisionId, setDivisionId] = useState(canPickDivision ? defaultDivisionId : "");
  const [quoteDate, setQuoteDate] = useState(today);
  const [validityDays, setValidityDays] = useState("");
  const [documentNo, setDocumentNo] = useState("");
  const [senderId, setSenderId] = useState("");
  const [currency, setCurrency] = useState<Currency>("USD");
  const [vatEnabled, setVatEnabled] = useState(false);
  const [deliveryCode, setDeliveryCode] = useState<string>("");
  const [noteVariantKey, setNoteVariantKey] = useState<string>("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [deliveryTerms, setDeliveryTerms] = useState("");
  const [warrantyTerms, setWarrantyTerms] = useState("");
  const [lines, setLines] = useState<LineState[]>([emptyLine()]);
  const [headerDiscountType, setHeaderDiscountType] = useState<"amount" | "percent">("amount");
  const [headerDiscountValue, setHeaderDiscountValue] = useState("0");
  const [note, setNote] = useState("");
  const [noteFontSize, setNoteFontSize] = useState("14");
  const [noteBold, setNoteBold] = useState(false);
  const noteSnippetTemplates = useMemo(
    () => noteTemplates.filter((template) => (template.scope ?? "quote") === "quote"),
    [noteTemplates]
  );
  const savedTermsTemplates = useTermsTemplates(noteTemplates, TERMS_TEMPLATE_SCOPE);

  const reset = () => {
    setCompanyId(defaultCustomerId ?? "");
    setContactId("");
    setCaseId(defaultCaseId ?? "");
    setDivisionId(canPickDivision ? defaultDivisionId : "");
    setQuoteDate(today);
    setValidityDays("");
    setDocumentNo("");
    setSenderId(users.find((u) => u.id === user?.id)?.id ?? users[0]?.id ?? "");
    setVatEnabled(false);
    setDeliveryCode("");
    setNoteVariantKey("");
    setPaymentTerms("");
    setDeliveryTerms("");
    setWarrantyTerms("");
    setHeaderDiscountType("amount");
    setHeaderDiscountValue("0");
    // Faz 1 · Satış kartı carry-over: kart üzerinden açıldıysa ilk satırı + para birimini ön-doldur.
    const seedCase = defaultCaseId ? cases.find((c) => c.id === defaultCaseId) : undefined;
    if (seedCase) {
      const def = quoteDefaultsFromCase(seedCase, products);
      setCurrency(def.currency);
      setLines([{ ...emptyLine(), ...def.line }]);
    } else {
      setCurrency("USD");
      setLines([emptyLine()]);
    }
    setNote("");
    setNoteFontSize("14");
    setNoteBold(false);
  };

  const setOpen = (next: boolean) => {
    onOpenChange?.(next);
    if (controlledOpen === undefined) setInternalOpen(next);
  };

  // Edit modunda mevcut teklifi yükle; aksi halde yeni teklif için sıfırla.
  const loadForEdit = async (id: string) => {
    setLoadingEdit(true);
    try {
      const data: any = await quoteService.get(id);
      setCompanyId(data.companyId ?? "");
      setContactId(data.contactId ?? "");
      setCaseId(data.opportunityId ?? "");
      setQuoteDate((data.quoteDate as string)?.slice(0, 10) ?? today);
      setValidityDays(data.validityDays ? String(data.validityDays) : "");
      setDocumentNo(data.documentNo ?? "");
      setSenderId(data.projectOwnerUserId ?? "");
      const offer = offers.find((o) => o.id === id);
      const currencyCode = (offer?.currency ?? "USD") as Currency;
      setCurrency(currencyCode);
      setDeliveryCode("");
      const loadedPayment = data.terms?.paymentTermsText ?? data.paymentTerms ?? "";
      const loadedDelivery = data.terms?.deliveryTermsText ?? data.deliveryTerms ?? "";
      const loadedWarranty = data.terms?.warrantyTermsText ?? data.warrantyTerms ?? "";
      setPaymentTerms(loadedPayment);
      setDeliveryTerms(loadedDelivery);
      setWarrantyTerms(loadedWarranty);
      const loadedHeaderPercent = num(String(data.headerDiscountPercent ?? "0"));
      const loadedHeaderAmount = num(String(data.headerDiscountAmount ?? "0"));
      setHeaderDiscountType(loadedHeaderPercent > 0 ? "percent" : "amount");
      setHeaderDiscountValue(String(loadedHeaderPercent > 0 ? loadedHeaderPercent : loadedHeaderAmount));
      // Yüklenen şartlar bir şablonla birebir aynıysa o şablonu önseç (yoksa "Özel").
      setNoteVariantKey(
        matchNoteVariant(loadedPayment, loadedDelivery, loadedWarranty) ||
        matchSavedTermsTemplate(loadedPayment, loadedDelivery, loadedWarranty, savedTermsTemplates)
      );
      setNote(data.notes ?? "");
      setNoteFontSize("14");
      setNoteBold(false);
      const items: any[] = Array.isArray(data.items) ? data.items : [];
      setVatEnabled(
        Number(data.vatAmount ?? 0) > 0 ||
        items.some((it) => Number(it.vatRate ?? 0) > 0 || Number(it.vatAmount ?? 0) > 0)
      );
      const mainItems = items.filter((it) => !String(it.description ?? "").startsWith("↳ Opsiyon:"));
      const optionItems = items.filter((it) => String(it.description ?? "").startsWith("↳ Opsiyon:"));
      const mapped: LineState[] = mainItems.map((it) => {
        const product = it.productModelId ? products.find((p) => p.id === it.productModelId) : undefined;
        const storedSpecs = Array.isArray(it.compatibility?.technicalSpecs)
          ? cleanTechnicalSpecs(it.compatibility.technicalSpecs)
          : [];
        const desc = String(it.description ?? "");
        const dashIdx = desc.indexOf(" — ");
        const stockCode = it.stockCode ?? (dashIdx > -1 ? desc.slice(0, dashIdx) : product?.stockCode ?? "");
        const description = it.stockCode ? desc : dashIdx > -1 ? desc.slice(dashIdx + 3) : desc;
        return {
          groupCode: product?.productGroupCode ?? "",
          categoryCode: product?.categoryCode ?? "",
          subcategoryCode: product?.subcategoryCode ?? "",
          productId: it.productModelId ?? "",
          stockCode,
          description,
          technicalSpecs: storedSpecs.length ? storedSpecs : technicalSpecsFromProduct(product),
          quantity: String(it.quantity ?? "1"),
          unitPrice: String(it.unitPrice ?? "0"),
          discount: String(it.discountAmount ?? "0"),
          vatRate: String(it.vatRate ?? "20"),
          options: [],
          compatibility: it.compatibility
            ? {
                machineIds: it.compatibility.machineIds ?? [],
                brands: it.compatibility.brands ?? [],
                controlUnits: it.compatibility.controlUnits ?? [],
                supplierIds: it.compatibility.supplierIds ?? [],
              }
            : emptyCompatibility(),
        };
      });
      // Opsiyonları ilk Tezgah satırına ata (mümkünse) — basit ama edit/print için yeterli.
      if (optionItems.length && mapped.length) {
        const target = mapped.findIndex((l) => l.categoryCode === "TEZGAH");
        const idx = target >= 0 ? target : 0;
        mapped[idx] = {
          ...mapped[idx],
          options: optionItems.map((it) => ({
            productId: it.productModelId ?? "",
            description: String(it.description ?? "").replace(/^↳ Opsiyon:\s*/, ""),
            quantity: String(it.quantity ?? "1"),
            unitPrice: String(it.unitPrice ?? "0"),
            discount: String(it.discountAmount ?? "0"),
            vatRate: String(it.vatRate ?? "20"),
          })),
        };
      }
      setLines(mapped.length ? mapped : [emptyLine()]);
    } catch (err: any) {
      toast.error("Teklif yüklenemedi", { description: err?.message ?? "İstek başarısız oldu." });
    } finally {
      setLoadingEdit(false);
    }
  };

  const handleOpen = (o: boolean) => {
    setOpen(o);
    if (o) {
      if (editing && offerId) {
        reset();
        void loadForEdit(offerId);
      }
    }
  };

  // Controlled açılırken (offerId değişimi dahil) yükle.
  useEffect(() => {
    if (!open) return;
    if (editing && offerId) {
      reset();
      void loadForEdit(offerId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, offerId]);

  const companyContacts = contacts.filter((c) => c.customerId === companyId);
  const companyCases = cases.filter((c) => c.customerId === companyId);

  const onTermsBuiltInSelected = (key: string) => {
    if (key && NOTE_VARIANT_DELIVERY[key]) setDeliveryCode(NOTE_VARIANT_DELIVERY[key]);
  };

  // Teslim şekli seçilince eşleşen yerleşik belge şartları şablonunu uygula.
  const applyNoteVariant = (key: string) => {
    setNoteVariantKey(key);
    const builtIn = QUOTE_NOTE_VARIANTS.find((variant) => variant.key === key);
    if (!builtIn) return;
    setPaymentTerms(builtIn.odeme.join("\n"));
    setDeliveryTerms(builtIn.teslimat.join("\n"));
    setWarrantyTerms(builtIn.garanti.join("\n"));
  };

  const setLine = (i: number, patch: Partial<LineState>) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const addLine = () => setLines((ls) => [...ls, emptyLine()]);
  const rmLine = (i: number) => setLines((ls) => (ls.length > 1 ? ls.filter((_, idx) => idx !== i) : ls));

  // Faz 1 carry-over: satış kartı seçilince ilk satır el değmemişse kart verisini aktar.
  const onCaseChange = (value: string) => {
    const id = value === "auto" ? "" : value;
    setCaseId(id);
    const sc = id ? cases.find((c) => c.id === id) : undefined;
    if (!sc) return;
    const def = quoteDefaultsFromCase(sc, products);
    setCurrency(def.currency);
    setLines((ls) => {
      const first = ls[0];
      const untouched = !first || (!first.productId && !first.description.trim() && !first.stockCode.trim());
      if (!untouched) return ls;
      const seeded = { ...emptyLine(), ...def.line };
      return ls.length ? [seeded, ...ls.slice(1)] : [seeded];
    });
    if (def.matchedProduct) {
      toast.success("Satış kartından aktarıldı", {
        description: `${def.matchedProduct.brand} ${def.matchedProduct.model} · ${sc.quantity} adet`,
      });
    } else {
      toast.message("Satış kartı talebi satıra aktarıldı", { description: def.line.description || undefined });
    }
  };

  const onPickProduct = (i: number, productId: string) => {
    const p = products.find((x) => x.id === productId);
    if (!p) return setLine(i, { productId });
    setLine(i, {
      productId,
      groupCode: p.productGroupCode || "",
      categoryCode: p.categoryCode || "",
      subcategoryCode: p.subcategoryCode || "",
      stockCode: p.stockCode || p.model || "",
      description: p.shortDescription?.trim() || [p.brand, p.model].filter(Boolean).join(" "),
      technicalSpecs: technicalSpecsFromProduct(p),
      unitPrice: p.listPrice ? String(p.listPrice) : "",
      vatRate: String(p.vatRate ?? 20),
    });
    // İlk kalemde para birimini üründen al
    if (i === 0 && p.currency) setCurrency(p.currency as Currency);
  };

  // Ürün Grubu → Ürün Kategorisi → Ürün Alt Kategorisi → Ürün Tipi sırasıyla daraltılır.
  // Bir üst seviye değişince alttaki seçim ve seçili ürün artık uymuyorsa sıfırlanır.
  const onPickGroup = (i: number, code: string) => {
    setLines((ls) => ls.map((l, idx) => {
      if (idx !== i) return l;
      const prod = products.find((x) => x.id === l.productId);
      const keep = prod && (prod.productGroupCode || "") === code;
      return keep
        ? { ...l, groupCode: code }
        : { ...l, groupCode: code, subcategoryCode: "", productId: "", stockCode: "", description: "", technicalSpecs: [], options: [] };
    }));
  };

  const onPickCategory = (i: number, code: string) => {
    setLines((ls) => ls.map((l, idx) => {
      if (idx !== i) return l;
      const prod = products.find((x) => x.id === l.productId);
      // Seçili ürün yeni kategoriye uymuyorsa temizle
      const keep = prod && prod.categoryCode === code;
      return keep
        ? { ...l, categoryCode: code }
        : { ...l, categoryCode: code, subcategoryCode: "", productId: "", stockCode: "", description: "", technicalSpecs: [], options: [] };
    }));
  };

  const onPickSubcategory = (i: number, code: string) => {
    setLines((ls) => ls.map((l, idx) => {
      if (idx !== i) return l;
      const prod = products.find((x) => x.id === l.productId);
      const keep = prod && (prod.subcategoryCode || "") === code;
      return keep
        ? { ...l, subcategoryCode: code }
        : { ...l, subcategoryCode: code, productId: "", stockCode: "", description: "", technicalSpecs: [], options: [] };
    }));
  };

  const setTechnicalSpec = (i: number, j: number, patch: Partial<ProductSpec>) =>
    setLines((ls) => ls.map((l, idx) => (
      idx === i
        ? { ...l, technicalSpecs: l.technicalSpecs.map((spec, specIdx) => (specIdx === j ? { ...spec, ...patch } : spec)) }
        : l
    )));
  const addTechnicalSpec = (i: number) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, technicalSpecs: [...l.technicalSpecs, { key: "", value: "" }] } : l)));
  const rmTechnicalSpec = (i: number, j: number) =>
    setLines((ls) => ls.map((l, idx) => (
      idx === i ? { ...l, technicalSpecs: l.technicalSpecs.filter((_, specIdx) => specIdx !== j) } : l
    )));
  const resetTechnicalSpecsFromProduct = (i: number) =>
    setLines((ls) => ls.map((l, idx) => {
      if (idx !== i) return l;
      return { ...l, technicalSpecs: technicalSpecsFromProduct(products.find((p) => p.id === l.productId)) };
    }));

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
    let subtotal = 0, lineDiscount = 0;
    const vatRows: Array<{ netBeforeHeader: number; vatRate: number }> = [];
    const rows = lines.flatMap((l) => [l, ...l.options]);
    for (const r of rows) {
      const net = netUnitPrice(r);
      const qty = num(r.quantity);
      const disc = num(r.discount);
      const rowNet = Math.max(0, qty * net - disc);
      subtotal += qty * net;
      lineDiscount += Math.max(0, disc);
      vatRows.push({ netBeforeHeader: rowNet, vatRate: effVatRate(r) });
    }
    const taxableBeforeHeader = Math.max(0, subtotal - lineDiscount);
    const rawHeaderDiscount = headerDiscountType === "percent"
      ? taxableBeforeHeader * Math.max(0, num(headerDiscountValue)) / 100
      : Math.max(0, num(headerDiscountValue));
    const headerDiscount = Math.min(rawHeaderDiscount, taxableBeforeHeader);
    const ratio = taxableBeforeHeader > 0 ? (taxableBeforeHeader - headerDiscount) / taxableBeforeHeader : 1;
    const vat = vatRows.reduce((sum, row) => sum + (row.netBeforeHeader * ratio * (row.vatRate / 100)), 0);
    const discount = lineDiscount + headerDiscount;
    const grand = taxableBeforeHeader - headerDiscount + vat;
    return { subtotal, lineDiscount, headerDiscount, discount, vat, grand };
  }, [lines, vatEnabled, headerDiscountType, headerDiscountValue]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId) return toast.error("Firma seçiniz");
    if (num(validityDays) < 1) return toast.error("Geçerlilik süresini giriniz");
    if (canPickDivision && !divisionId) return toast.error("Bölüm seçiniz", { description: "Teklifi CNC / Üniversal / Sac bölümlerinden birine atayın." });
    const valid = lines.filter((l) => (l.productId || l.description.trim() || l.stockCode.trim()) && num(l.quantity) > 0);
    if (valid.length === 0) return toast.error("En az bir ürün satırı ekleyin");

    const preset = DELIVERY_TERMS.find((d) => d.code === deliveryCode);
    const headerDiscountAmount = headerDiscountType === "amount" ? totals.headerDiscount : 0;
    const headerDiscountPercent = headerDiscountType === "percent" ? Math.max(0, num(headerDiscountValue)) : 0;

    // Ana ürün + teklife özel opsiyonel donanımları tek kalem listesine düzleştir
    const items = valid.flatMap((l) => {
      const mainName = l.description.trim() || "Ürün";
      const technicalSpecs = cleanTechnicalSpecs(l.technicalSpecs);
      const lineCompatibility = {
        ...(COMPAT_CATEGORIES.includes(l.categoryCode) && hasCompatibility(l.compatibility) ? l.compatibility : emptyCompatibility()),
        ...(technicalSpecs.length ? { technicalSpecs } : {}),
      };
      const hasLineCompatibility = hasCompatibility(lineCompatibility) || technicalSpecs.length > 0;
      const main = {
        productModelId: l.productId || undefined,
        stockCode: l.stockCode.trim() || undefined,
        description: mainName,
        quantity: num(l.quantity),
        unitPrice: Number(netUnitPrice(l).toFixed(4)),
        discountAmount: num(l.discount),
        vatRate: effVatRate(l),
        compatibility: hasLineCompatibility ? lineCompatibility : undefined,
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
      if (editing && offerId) {
        await quoteService.update(offerId, {
          companyId,
          contactId: contactId || undefined,
          opportunityId: caseId || undefined,
          quoteDate: new Date(quoteDate),
          validityDays: num(validityDays),
          documentNo: documentNo.trim() || undefined,
          currencyCode: currency,
          headerDiscountAmount,
          headerDiscountPercent,
          projectOwnerUserId: senderId || undefined,
          notes: note.trim() || undefined,
          paymentTerms: paymentTerms.trim() || undefined,
          deliveryTerms: deliveryTerms.trim() || undefined,
          warrantyTerms: warrantyTerms.trim() || undefined,
        } as any);
        await quoteService.terms(offerId, {
          paymentTermsText: paymentTerms.trim() || undefined,
          deliveryTermsText: deliveryTerms.trim() || undefined,
          warrantyTermsText: warrantyTerms.trim() || undefined,
          importCostsExcluded: preset?.importCostsExcluded ?? true,
        } as any);
        // Kalemleri tamamen yeniden yaz: önce eskileri sil, sonra yenilerini ekle.
        const existing: any = await quoteService.get(offerId);
        for (const it of existing.items ?? []) {
          await quoteService.deleteItem(offerId, it.id);
        }
        for (let i = 0; i < items.length; i++) {
          await quoteService.addItem(offerId, { ...items[i], sortOrder: i } as any);
        }
        toast.success("Teklif güncellendi", { description: documentNo });
        await refresh();
      } else {
        const res = await createQuoteFull({
          opportunityId: caseId || undefined,
          companyId,
          divisionId: canPickDivision ? divisionId || undefined : undefined,
          contactId: contactId || undefined,
          quoteDate: new Date(quoteDate).toISOString(),
          validityDays: num(validityDays),
          documentNo: documentNo.trim() || undefined,
          currencyCode: currency,
          headerDiscountAmount,
          headerDiscountPercent,
          projectOwnerUserId: senderId || undefined,
          notes: note.trim() || undefined,
          paymentTermsText: paymentTerms.trim() || undefined,
          deliveryTermsText: deliveryTerms.trim() || undefined,
          warrantyTermsText: warrantyTerms.trim() || undefined,
          importCostsExcluded: preset?.importCostsExcluded ?? true,
          caseTitle: valid[0].description || undefined,
          items,
        });
        toast.success("Teklif kaydedildi", { description: res.documentNo });
      }
      setOpen(false);
    } catch (err: any) {
      toast.error(editing ? "Teklif güncellenemedi" : "Teklif kaydedilemedi", { description: err?.message ?? "API isteği başarısız oldu." });
    } finally {
      setSaving(false);
    }
  };

  const applyTemplate = (id: string) => {
    const t = noteSnippetTemplates.find((x) => x.id === id);
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
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="w-[95vw] sm:max-w-[1180px] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Teklifi Düzenle" : "Yeni Teklif"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Mevcut teklifin satırlarını, koşullarını ve notlarını güncelleyin."
              : "Firma, ürünler, fiyatlandırma, teslim şekli ve notları tek ekranda yönetin."}
            {loadingEdit && <span className="ml-2 text-xs text-muted-foreground">· yükleniyor…</span>}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit}>
          <DialogSplitLayout
            aside={
              <>
                <DialogSidebarSection>
                  <div>
                    <Label className="text-xs">Teslim Şekli</Label>
                    <Select
                      value={deliveryCode}
                      onValueChange={(value) => {
                        setDeliveryCode(value);
                        const variantKey = DELIVERY_NOTE_VARIANT[value];
                        if (variantKey) applyNoteVariant(variantKey);
                        else {
                          setNoteVariantKey("");
                          setDeliveryTerms(DELIVERY_TERMS.find((item) => item.code === value)?.label ?? "");
                        }
                      }}
                    >
                      <SelectTrigger className="mt-1.5"><SelectValue placeholder="Teslim şekli seçin..." /></SelectTrigger>
                      <SelectContent>
                        {DELIVERY_TERMS.map((d) => <SelectItem key={d.code} value={d.code}>{d.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </DialogSidebarSection>
                <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-sm space-y-1">
                  <div className="flex justify-between"><span className="text-muted-foreground">Ara Toplam</span><span className="tabular-nums">{money(totals.subtotal, currency)}</span></div>
                  {totals.lineDiscount > 0 && (
                    <div className="flex justify-between"><span className="text-muted-foreground">Satır İndirimi</span><span className="tabular-nums">-{money(totals.lineDiscount, currency)}</span></div>
                  )}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-muted-foreground">Teklif İskontosu</span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Select value={headerDiscountType} onValueChange={(value) => setHeaderDiscountType(value as "amount" | "percent")}>
                        <SelectTrigger className="h-7 w-[88px] text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="amount">Tutar</SelectItem>
                          <SelectItem value="percent">Yüzde</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        className="h-7 w-24 text-right"
                        inputMode="decimal"
                        value={headerDiscountValue}
                        onChange={(event) => setHeaderDiscountValue(event.target.value)}
                        placeholder={headerDiscountType === "percent" ? "0" : "0,00"}
                      />
                      <span className="tabular-nums">-{money(totals.headerDiscount, currency)}</span>
                    </div>
                  </div>
                  <div className="flex justify-between"><span className="text-muted-foreground">KDV</span><span className="tabular-nums">{money(totals.vat, currency)}</span></div>
                  <div className="flex justify-between border-t border-border/60 pt-1 font-medium"><span>Genel Toplam</span><span className="tabular-nums">{money(totals.grand, currency)}</span></div>
                  <div className="flex justify-between items-center gap-2 pt-1.5 mt-1 border-t border-dashed border-border/60 flex-wrap">
                    <FxRateBadge />
                    <span className="tabular-nums text-xs text-muted-foreground">
                      {currency === "TRY"
                        ? `≈ ${money(convert(totals.grand, "TRY", "USD"), "USD")}`
                        : `≈ ${money(convert(totals.grand, currency, "TRY"), "TRY")} · ${money(convert(totals.grand, currency, "USD"), "USD")}`}
                    </span>
                  </div>
                </div>
                <DialogFooter className="sm:flex-col-reverse">
                  <Button type="button" variant="outline" className="w-full" onClick={() => setOpen(false)}>Vazgeç</Button>
                  <Button type="submit" disabled={saving || loadingEdit} className="w-full gap-1">
                    <Save className="size-4" />
                    {saving ? (editing ? "Güncelleniyor…" : "Kaydediliyor…") : editing ? "Teklifi Güncelle" : "Teklifi Kaydet"}
                  </Button>
                </DialogFooter>
              </>
            }
          >
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
              <Select value={caseId || "auto"} onValueChange={onCaseChange} disabled={!companyId}>
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
              <Label className="text-xs">Geçerlilik Süresi (Gün) *</Label>
              <Input
                type="number"
                min={1}
                max={365}
                className="mt-1.5"
                value={validityDays}
                onChange={(event) => setValidityDays(event.target.value)}
                placeholder="Örn. 15"
              />
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
            {canPickDivision && (
              <div>
                <Label className="text-xs">Bölüm *</Label>
                <Select value={divisionId} onValueChange={setDivisionId}>
                  <SelectTrigger className="mt-1.5"><SelectValue placeholder="Bölüm seçin (CNC / Üniversal / Sac)..." /></SelectTrigger>
                  <SelectContent>
                    {divisions.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
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
                // Ürün Grubu → Ürün Kategorisi → Ürün Alt Kategorisi → Ürün Tipi sırasıyla daralt;
                // seçenekler gerçek ürün verisinden türetilir.
                const productsInGroup = products.filter((p) => !l.groupCode || (p.productGroupCode || "") === l.groupCode);
                const productsInCategory = productsInGroup.filter((p) => !l.categoryCode || p.categoryCode === l.categoryCode);
                const lineProducts = productsInCategory.filter((p) => !l.subcategoryCode || (p.subcategoryCode || "") === l.subcategoryCode);
                const groupOptionsMap = new Map<string, string>();
                for (const p of products) if (p.productGroupCode) groupOptionsMap.set(p.productGroupCode, p.productGroup || p.productGroupCode);
                const groupOptions = Array.from(groupOptionsMap, ([code, label]) => ({ code, label }));
                const subcategoryOptionsMap = new Map<string, string>();
                for (const p of productsInCategory) if (p.subcategoryCode) subcategoryOptionsMap.set(p.subcategoryCode, p.subcategory || p.subcategoryCode);
                const subcategoryOptions = Array.from(subcategoryOptionsMap, ([code, label]) => ({ code, label }));
                const isLaborLine = l.categoryCode === "ISCILIK";
                return (
                  <div key={i} className="p-3 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {groupOptions.length > 0 && (
                        <Select value={l.groupCode || "all"} onValueChange={(v) => onPickGroup(i, v === "all" ? "" : v)}>
                          <SelectTrigger className="h-8 w-full sm:w-36"><SelectValue placeholder="Ürün Grubu" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Tüm gruplar</SelectItem>
                            {groupOptions.map((g) => <SelectItem key={g.code} value={g.code}>{g.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      )}
                      <Select value={l.categoryCode || "all"} onValueChange={(v) => onPickCategory(i, v === "all" ? "" : v)}>
                        <SelectTrigger className="h-8 w-full sm:w-36"><SelectValue placeholder="Kategori" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Tüm kategoriler</SelectItem>
                          {PRODUCT_CATEGORIES.map((c) => <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      {subcategoryOptions.length > 0 && (
                        <Select value={l.subcategoryCode || "all"} onValueChange={(v) => onPickSubcategory(i, v === "all" ? "" : v)}>
                          <SelectTrigger className="h-8 w-full sm:w-36"><SelectValue placeholder="Alt Kategori" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Tüm alt kategoriler</SelectItem>
                            {subcategoryOptions.map((s) => <SelectItem key={s.code} value={s.code}>{s.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      )}
                      <Select value={l.productId || "custom"} onValueChange={(v) => onPickProduct(i, v === "custom" ? "" : v)}>
                        <SelectTrigger className="h-8 flex-1 min-w-[180px]"><SelectValue placeholder="Ürün seçin" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="custom">Serbest kalem</SelectItem>
                          {lineProducts.map((p: Product) => (
                            <SelectItem key={p.id} value={p.id}>{p.brand} {p.model}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => rmLine(i)}>
                        <Trash2 className="size-4 text-muted-foreground" />
                      </Button>
                    </div>
                    <div className={isLaborLine ? "grid grid-cols-1 gap-2" : "grid grid-cols-1 md:grid-cols-[220px_1fr] gap-2"}>
                      {!isLaborLine && (
                        <Input className="h-8" value={l.stockCode} onChange={(e) => setLine(i, { stockCode: e.target.value })} placeholder="Stok Kodu" />
                      )}
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
                        <Input className="h-8" inputMode="decimal" value={l.vatRate} disabled={!vatEnabled} onChange={(e) => setLine(i, { vatRate: e.target.value })} />
                      </div>
                      <div className="text-right">
                        <Label className="text-[10px] uppercase text-muted-foreground">Satır (net)</Label>
                        <div className="h-8 flex items-center justify-end text-sm tabular-nums">{money(lineTotal, currency)}</div>
                      </div>
                    </div>

                    {l.categoryCode === "TEZGAH" && (
                      <details className="rounded-md border border-dashed border-border/70 bg-muted/20 p-2">
                        <summary className="cursor-pointer select-none text-[11px] font-medium text-muted-foreground">
                          Teknik Bilgiler · bu teklife özel ({cleanTechnicalSpecs(l.technicalSpecs).length || l.technicalSpecs.length})
                        </summary>
                        <div className="mt-2 space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-[11px] text-muted-foreground">
                              Ürün kartındaki değerler buraya kopyalanır; burada yapılan değişiklik yalnızca bu teklife yazılır.
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                              {product && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={() => resetTechnicalSpecsFromProduct(i)}
                                >
                                  Üründen yenile
                                </Button>
                              )}
                              <Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => addTechnicalSpec(i)}>
                                <Plus className="size-3.5" /> Özellik Ekle
                              </Button>
                            </div>
                          </div>
                          {l.technicalSpecs.length === 0 ? (
                            <div className="rounded-md border border-border/60 bg-white px-3 py-2 text-xs text-muted-foreground">
                              Teknik özellik yok. Özellik ekleyebilir veya ürün seçerek katalog değerlerini çekebilirsiniz.
                            </div>
                          ) : (
                            <div className="space-y-1.5">
                              {l.technicalSpecs.map((spec, specIndex) => {
                                const lockedTemplateRow = isProductTypeTemplateSpec(product, spec);
                                const unit = spec.unit ?? spec.specUnit ?? "";
                                return (
                                  <div key={specIndex} className="grid grid-cols-[minmax(150px,1fr)_minmax(150px,1.2fr)_72px_32px] gap-1.5">
                                    {lockedTemplateRow ? (
                                      <div className="flex h-8 min-w-0 items-center rounded-md border border-border/70 bg-muted/30 px-2 text-xs font-medium text-foreground" title={spec.key}>
                                        <span className="truncate">{spec.key}</span>
                                      </div>
                                    ) : (
                                      <Input
                                        className="h-8 bg-white"
                                        value={spec.key}
                                        onChange={(event) => setTechnicalSpec(i, specIndex, { key: event.target.value })}
                                        placeholder="Özellik"
                                      />
                                    )}
                                    <Input
                                      className="h-8 bg-white"
                                      value={spec.value}
                                      onChange={(event) => setTechnicalSpec(i, specIndex, { value: event.target.value })}
                                      placeholder="Değer"
                                    />
                                    <div className="h-8 rounded-md border border-border/70 bg-muted/30 px-2 text-center text-xs leading-8 text-muted-foreground" title={unit}>
                                      {unit || "-"}
                                    </div>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      disabled={lockedTemplateRow}
                                      title={lockedTemplateRow ? "Şablon satırı silinemez" : "Satırı kaldır"}
                                      onClick={() => rmTechnicalSpec(i, specIndex)}
                                    >
                                      <Trash2 className={`size-4 ${lockedTemplateRow ? "text-muted-foreground/30" : "text-muted-foreground"}`} />
                                    </Button>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </details>
                    )}

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

          <DocumentTermsTemplateEditor
            description="Şablon seçin, metinleri gerekiyorsa düzenleyin; değişiklikler teklif/proforma belgesine eklenir."
            templateScope={TERMS_TEMPLATE_SCOPE}
            noteTemplates={noteTemplates}
            selectedTemplateKey={noteVariantKey}
            onSelectedTemplateKeyChange={setNoteVariantKey}
            value={{ paymentTerms, deliveryTerms, warrantyTerms }}
            onChange={(next) => {
              setPaymentTerms(next.paymentTerms);
              setDeliveryTerms(next.deliveryTerms);
              setWarrantyTerms(next.warrantyTerms);
            }}
            addNoteTemplate={addNoteTemplate}
            updateNoteTemplate={updateNoteTemplate}
            deleteNoteTemplate={deleteNoteTemplate}
            onBuiltInTemplateSelected={onTermsBuiltInSelected}
          />

          {/* NOTES */}
          <div>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <Label className="text-xs">Notlar</Label>
              <div className="flex items-center gap-2 flex-wrap">
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
                    {noteSnippetTemplates.length === 0 ? (
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">Şablon yok</div>
                    ) : (
                      noteSnippetTemplates.map((t) => <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>)
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

          </DialogSplitLayout>
        </form>
      </DialogContent>
    </Dialog>
  );
}
