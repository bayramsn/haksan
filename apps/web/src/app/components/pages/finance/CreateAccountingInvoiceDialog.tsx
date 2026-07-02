import { useEffect, useMemo, useState } from "react";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from "../../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "../../ui/dialog";
import { Textarea } from "../../ui/textarea";
import { Badge } from "../../ui/badge";
import { useStore } from "../../../lib/store";
import { financeService } from "../../../../lib/services";
import { toast } from "sonner";
import { Boxes, Package, Plus, Receipt, ShoppingCart, Trash2 } from "lucide-react";

type InstallmentRow = { installmentNo: number; dueDate: string; amount: string };
type InvoiceCategory = "commercial" | "administrative";
type PaymentType = "cash" | "leasing" | "term";
type LineKind = "product" | "stock" | "expense";
type InvoiceLineRow = {
  id: string;
  kind: LineKind; // stock = tezgah seri no (satış); expense = idari gider kalemi
  inventoryItemId?: string;
  productModelId?: string;
  categoryCode?: string;
  description: string;
  quantity: string;
  listPrice: string;
  unitPrice: string;
  discountAmount: string;
  vatRate: string;
  expectedDate: string;
};

export type AccountingInvoicePrefill = {
  companyId: string;
  invoiceCategory?: InvoiceCategory;
  amount?: number;
  grandTotal: number;
  vatRate?: number;
  vatAmount?: number;
  currencyCode?: string;
  invoiceNo?: string;
  invoiceDate?: string;
  quoteId?: string;
  salesOrderId?: string;
  firstDueDate?: string;
  lastDueDate?: string | null;
  installmentCount?: number;
  installments?: InstallmentRow[];
  notes?: string;
  type?: "sales" | "purchase";
  paymentType?: PaymentType;
  paymentTermDays?: number | string | null;
  previousPaymentTermDays?: number | string | null;
  termChangeReason?: string | null;
  incoterm?: string | null;
  shipmentReference?: string | null;
  orderNo?: string | null;
  expectedDate?: string | null;
  commercialPurchaseLines?: Array<{
    saleType?: "tezgah" | "product" | null;
    inventoryItemId?: string | null;
    productModelId?: string | null;
    categoryCode?: string | null;
    description?: string | null;
    quantity?: string | number;
    listPrice?: string | number | null;
    unitPrice?: string | number | null;
    discountAmount?: string | number | null;
    vatRate?: string | number | null;
    expectedDate?: string | null;
  }>;
};

const defaultForm = (companyId = "") => ({
  type: "sales" as "sales" | "purchase",
  invoiceCategory: "commercial" as InvoiceCategory,
  companyId,
  invoiceNo: "",
  invoiceDate: new Date().toISOString().slice(0, 10),
  amount: "",
  vatRate: "20",
  vatAmount: "0",
  grandTotal: "",
  currencyCode: "USD",
  paymentType: "cash" as PaymentType,
  paymentTermDays: "0",
  previousPaymentTermDays: "",
  termChangeReason: "",
  incoterm: "",
  shipmentReference: "",
  orderNo: "",
  expectedDate: "",
  firstDueDate: new Date().toISOString().slice(0, 10),
  lastDueDate: "",
  installmentCount: "1",
  notes: "",
});

const VAT_RATE_OPTIONS = ["20", "18", "10", "8", "1", "0"] as const;

const roundMoney = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
const parseMoneyInput = (value: string | number | undefined) => {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
};
const vatAmountFromRate = (amount: string | number | undefined, vatRate: string | number | undefined) =>
  roundMoney(Math.max(parseMoneyInput(amount), 0) * (Math.max(parseMoneyInput(vatRate), 0) / 100));

const deriveVatRate = (amount: number, vatAmount?: number, grandTotal?: number, fallback = 20) => {
  if (!Number.isFinite(amount) || amount <= 0) return fallback;
  const vat = Number.isFinite(vatAmount) && Number(vatAmount) > 0
    ? Number(vatAmount)
    : Math.max(0, Number(grandTotal ?? 0) - amount);
  if (!Number.isFinite(vat) || vat <= 0) return fallback;
  return roundMoney((vat / amount) * 100);
};
const blankLine = (category: InvoiceCategory): InvoiceLineRow => ({
  id: crypto.randomUUID(),
  kind: category === "administrative" ? "expense" : "product",
  productModelId: "",
  categoryCode: "",
  description: "",
  quantity: "1",
  listPrice: "",
  unitPrice: "",
  discountAmount: "0",
  vatRate: "20",
  expectedDate: "",
});
const productTitle = (product: any) =>
  product?.fullName || [product?.brand?.name ?? product?.brandName ?? product?.brand, product?.modelCode ?? product?.model].filter(Boolean).join(" · ");
const lineTotals = (line: InvoiceLineRow) => {
  const gross = parseMoneyInput(line.quantity) * parseMoneyInput(line.unitPrice);
  const discount = Math.min(Math.max(parseMoneyInput(line.discountAmount), 0), gross);
  const taxable = Math.max(gross - discount, 0);
  const vat = taxable * (parseMoneyInput(line.vatRate) / 100);
  return { gross, discount, taxable, vat, total: taxable + vat };
};
const isValidLine = (line: InvoiceLineRow) =>
  Boolean(line.description.trim()) && parseMoneyInput(line.quantity) > 0 && parseMoneyInput(line.unitPrice) > 0;
const isBlankLine = (line: InvoiceLineRow) =>
  !line.description.trim() && !line.productModelId && !line.inventoryItemId && !(line.categoryCode ?? "").trim() &&
  parseMoneyInput(line.unitPrice) <= 0 && parseMoneyInput(line.listPrice) <= 0;

const lineFromPrefill = (
  entry: NonNullable<AccountingInvoicePrefill["commercialPurchaseLines"]>[number],
  category: InvoiceCategory,
): InvoiceLineRow => ({
  ...blankLine(category),
  kind: entry.inventoryItemId ? "stock" : entry.productModelId ? "product" : category === "administrative" ? "expense" : "product",
  inventoryItemId: entry.inventoryItemId ?? undefined,
  productModelId: entry.productModelId ?? "",
  categoryCode: entry.categoryCode ?? "",
  description: entry.description ?? "",
  quantity: String(entry.quantity ?? 1),
  listPrice: entry.listPrice === null || entry.listPrice === undefined ? "" : String(entry.listPrice),
  unitPrice: entry.unitPrice === null || entry.unitPrice === undefined ? "" : String(entry.unitPrice),
  discountAmount: entry.discountAmount === null || entry.discountAmount === undefined ? "0" : String(entry.discountAmount),
  vatRate: entry.vatRate === null || entry.vatRate === undefined ? "20" : String(entry.vatRate),
  expectedDate: entry.expectedDate?.slice(0, 10) ?? "",
});

export function CreateAccountingInvoiceDialog({
  trigger,
  onCreated,
  onSaved,
  defaultCompanyId,
  prefill,
  invoiceId,
}: {
  trigger: React.ReactNode;
  onCreated?: () => void;
  onSaved?: () => void;
  defaultCompanyId?: string;
  prefill?: AccountingInvoicePrefill;
  invoiceId?: string;
}) {
  const { customers, stock, products, refresh } = useStore();
  const isEditing = Boolean(invoiceId);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(defaultForm(defaultCompanyId));
  const [quoteId, setQuoteId] = useState<string | undefined>();
  const [salesOrderId, setSalesOrderId] = useState<string | undefined>();
  const [installments, setInstallments] = useState<InstallmentRow[]>([]);
  const [lines, setLines] = useState<InvoiceLineRow[]>([blankLine("commercial")]);
  // Sözleşmeden vade önerisi: kullanıcı vade alanlarına dokunana kadar otomatik uygulanır
  const [termTouched, setTermTouched] = useState(false);
  const [contractTermHint, setContractTermHint] = useState<string | null>(null);

  const availableTezgahStock = useMemo(
    () => stock.filter((s) => {
      if ((s.categoryCode ?? "TEZGAH") !== "TEZGAH") return false;
      if (s.status === "Available") return true;
      if (s.status === "Reserved" && s.reservedCompanyId === form.companyId) return true;
      return false;
    }),
    [stock, form.companyId],
  );
  const gridVisible = !isEditing;
  const isAdministrative = form.invoiceCategory === "administrative";
  const stockSummary = useMemo(() => {
    const ready = stock.filter((s) => s.status === "Available").length;
    const reserved = stock.filter((s) => s.status === "Reserved").length;
    const tezgah = stock.filter((s) => (s.categoryCode ?? "TEZGAH") === "TEZGAH").length;
    return { ready, reserved, tezgah, products: products.length };
  }, [products.length, stock]);
  const gridTotals = useMemo(
    () =>
      lines.reduce(
        (acc, line) => {
          const totals = lineTotals(line);
          acc.subtotal += totals.taxable;
          acc.discount += totals.discount;
          acc.vat += totals.vat;
          acc.total += totals.total;
          return acc;
        },
        { subtotal: 0, discount: 0, vat: 0, total: 0 },
      ),
    [lines],
  );
  const hasValidLines = useMemo(() => lines.some(isValidLine), [lines]);
  const gridDrivesTotals = gridVisible && hasValidLines;

  useEffect(() => {
    if (!open) return;
    setTermTouched(false);
    setContractTermHint(null);
    if (prefill) {
      const subtotal = prefill.amount ?? prefill.grandTotal;
      const vatRate = prefill.vatRate ?? deriveVatRate(subtotal, prefill.vatAmount, prefill.grandTotal);
      const vatAmount = prefill.vatAmount ?? vatAmountFromRate(subtotal, vatRate);
      const grandTotal = roundMoney(subtotal + vatAmount);
      const category = prefill.invoiceCategory ?? "commercial";
      setForm({
        ...defaultForm(prefill.companyId),
        type: prefill.type ?? "sales",
        invoiceCategory: category,
        companyId: prefill.companyId,
        invoiceNo: prefill.invoiceNo ?? "",
        invoiceDate: prefill.invoiceDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
        amount: String(subtotal),
        vatRate: String(vatRate),
        vatAmount: String(vatAmount),
        grandTotal: String(grandTotal),
        currencyCode: prefill.currencyCode ?? "USD",
        paymentType: prefill.paymentType ?? "cash",
        paymentTermDays: prefill.paymentTermDays === null || prefill.paymentTermDays === undefined ? "0" : String(prefill.paymentTermDays),
        previousPaymentTermDays: prefill.previousPaymentTermDays === null || prefill.previousPaymentTermDays === undefined ? "" : String(prefill.previousPaymentTermDays),
        termChangeReason: prefill.termChangeReason ?? "",
        incoterm: prefill.incoterm ?? "",
        shipmentReference: prefill.shipmentReference ?? "",
        orderNo: prefill.orderNo ?? "",
        expectedDate: prefill.expectedDate?.slice(0, 10) ?? "",
        firstDueDate: prefill.firstDueDate?.slice(0, 10) ?? prefill.invoiceDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
        lastDueDate: prefill.lastDueDate?.slice(0, 10) ?? "",
        installmentCount: String(prefill.installmentCount ?? prefill.installments?.length ?? 1),
        notes: prefill.notes ?? "",
      });
      setQuoteId(prefill.quoteId);
      setSalesOrderId(prefill.salesOrderId);
      setInstallments(prefill.installments ?? []);
      setLines(
        prefill.commercialPurchaseLines?.length
          ? prefill.commercialPurchaseLines.map((entry) => lineFromPrefill(entry, category))
          : [blankLine(category)],
      );
    } else {
      setForm(defaultForm(defaultCompanyId));
      setQuoteId(undefined);
      setSalesOrderId(undefined);
      setLines([blankLine("commercial")]);
    }
  }, [open, prefill, defaultCompanyId]);

  useEffect(() => {
    if (!open || isEditing || form.type !== "sales" || !form.companyId) {
      setContractTermHint(null);
      return;
    }
    let alive = true;
    financeService
      .paymentTermSuggestion({ companyId: form.companyId, quoteId })
      .then((s) => {
        if (!alive) return;
        if (s.source !== "contract" || s.paymentTermDays == null) {
          setContractTermHint(null);
          return;
        }
        setContractTermHint(`Vade sözleşmeden alındı${s.contractNo ? ` (${s.contractNo})` : ""}: ${s.paymentTermDays} gün`);
        if (!termTouched) {
          setForm((current) => {
            const base = new Date(current.invoiceDate);
            const due = new Date(base.getTime() + Number(s.paymentTermDays) * 24 * 60 * 60 * 1000);
            return {
              ...current,
              paymentType: "term" as PaymentType,
              paymentTermDays: String(s.paymentTermDays),
              firstDueDate: due.toISOString().slice(0, 10),
            };
          });
        }
      })
      .catch(() => {
        if (alive) setContractTermHint(null);
      });
    return () => {
      alive = false;
    };
  }, [open, isEditing, form.type, form.companyId, quoteId, termTouched]);

  useEffect(() => {
    if (!gridDrivesTotals) return;
    const amount = roundMoney(gridTotals.subtotal);
    const vatAmount = roundMoney(gridTotals.vat);
    setForm((current) => {
      const nextAmount = String(amount);
      const nextVat = String(vatAmount);
      if (current.amount === nextAmount && current.vatAmount === nextVat) return current;
      return { ...current, amount: nextAmount, vatAmount: nextVat };
    });
  }, [gridTotals.subtotal, gridTotals.vat, gridDrivesTotals]);

  const invoiceTotals = useMemo(() => {
    const amount = parseMoneyInput(form.amount);
    const vatRate = parseMoneyInput(form.vatRate);
    const typedVatAmount = parseMoneyInput(form.vatAmount);
    const net = Number.isFinite(amount) && amount > 0 ? amount : 0;
    const rate = Number.isFinite(vatRate) && vatRate >= 0 ? vatRate : 0;
    const vatAmount = roundMoney(Math.max(typedVatAmount, 0));
    return {
      amount: roundMoney(net),
      vatRate: rate,
      vatAmount,
      grandTotal: roundMoney(net + vatAmount),
    };
  }, [form.amount, form.vatAmount, form.vatRate]);

  const previewInstallments = useMemo(() => {
    const total = invoiceTotals.grandTotal;
    const count = Math.max(1, Number(form.installmentCount) || 1);
    if (!Number.isFinite(total) || total <= 0) return [];
    const base = Math.floor((total / count) * 100) / 100;
    const first = new Date(form.firstDueDate);
    const last = form.lastDueDate ? new Date(form.lastDueDate) : null;
    const stepMs = last && count > 1 ? (last.getTime() - first.getTime()) / (count - 1) : 30 * 24 * 60 * 60 * 1000;
    let allocated = 0;
    const rows: InstallmentRow[] = [];
    for (let i = 0; i < count; i++) {
      const amount = i === count - 1 ? Math.round((total - allocated) * 100) / 100 : base;
      allocated += amount;
      const d = new Date(first.getTime() + stepMs * i);
      rows.push({ installmentNo: i + 1, dueDate: d.toISOString().slice(0, 10), amount: String(amount) });
    }
    return rows;
  }, [invoiceTotals.grandTotal, form.installmentCount, form.firstDueDate, form.lastDueDate]);

  useEffect(() => {
    setInstallments(previewInstallments);
  }, [previewInstallments]);

  const updateLine = (id: string, patch: Partial<InvoiceLineRow>) => {
    setLines((current) => current.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  };

  const addLine = () => {
    setLines((current) => [...current, blankLine(form.invoiceCategory)]);
  };

  const removeLine = (id: string) => {
    setLines((current) => {
      const next = current.filter((line) => line.id !== id);
      return next.length ? next : [blankLine(form.invoiceCategory)];
    });
  };

  // Tür/sınıf değişince satırlar yeni moda taşınır; idariye geçişte ürün/seri bağları düşer.
  const retargetLines = (type: "sales" | "purchase", category: InvoiceCategory) => {
    setLines((current) => current.map((line) => {
      if (category === "administrative") {
        return { ...line, kind: "expense" as LineKind, productModelId: "", inventoryItemId: undefined };
      }
      if (type === "purchase" && line.kind === "stock") {
        return { ...line, kind: "product" as LineKind, inventoryItemId: undefined, categoryCode: "" };
      }
      if (line.kind === "expense") {
        return { ...line, kind: line.inventoryItemId ? ("stock" as LineKind) : ("product" as LineKind), categoryCode: "" };
      }
      return line;
    }));
  };

  const setInvoiceCategory = (invoiceCategory: InvoiceCategory) => {
    if (isEditing) return;
    setForm((current) => ({ ...current, invoiceCategory, incoterm: invoiceCategory === "administrative" ? "" : current.incoterm }));
    retargetLines(form.type, invoiceCategory);
  };

  const setInvoiceType = (type: "sales" | "purchase") => {
    if (isEditing) return;
    setForm((current) => ({ ...current, type }));
    retargetLines(type, form.invoiceCategory);
  };

  const onLineSourceChange = (line: InvoiceLineRow, value: string) => {
    if (value === "__none") {
      updateLine(line.id, { kind: "product", productModelId: "", inventoryItemId: undefined, categoryCode: "" });
      return;
    }
    if (value.startsWith("inv:")) {
      const itemId = value.slice(4);
      const item = availableTezgahStock.find((s) => s.id === itemId);
      updateLine(line.id, {
        kind: "stock",
        inventoryItemId: itemId,
        productModelId: "",
        categoryCode: "TEZGAH",
        quantity: "1",
        description: item ? `${item.brand} ${item.counterModel} — ${item.serialNumber}` : line.description,
      });
      return;
    }
    const productId = value.startsWith("prod:") ? value.slice(5) : value;
    const product = products.find((p) => p.id === productId);
    const commercialPrice = (product as any)?.cashPrice ?? (product as any)?.approvedPrice ?? product?.listPrice;
    updateLine(line.id, {
      kind: "product",
      inventoryItemId: undefined,
      productModelId: productId,
      categoryCode: product?.categoryCode ?? "",
      description: product ? productTitle(product) || line.description : line.description,
      listPrice: product?.listPrice ? String(product.listPrice) : line.listPrice,
      unitPrice: commercialPrice === null || commercialPrice === undefined ? line.unitPrice : String(commercialPrice),
      vatRate: product?.vatRate ? String(product.vatRate) : line.vatRate,
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.companyId) return toast.error("Firma seçin");
    const cleanLines = gridVisible
      ? lines
          .map((line) => ({ ...line, description: line.description.trim(), categoryCode: (line.categoryCode ?? "").trim() }))
          .filter(isValidLine)
      : [];
    if (gridVisible) {
      const hasPartialLines = lines.some((line) => !isBlankLine(line));
      if (hasPartialLines && cleanLines.length === 0) {
        return toast.error("En az bir geçerli kalem girin", { description: "Açıklama, adet ve olur fiyatı zorunludur." });
      }
      const invalidDiscountLine = cleanLines.find(
        (line) => parseMoneyInput(line.discountAmount) > parseMoneyInput(line.quantity) * parseMoneyInput(line.unitPrice),
      );
      if (invalidDiscountLine) {
        return toast.error("İndirim kalem tutarını aşamaz", { description: invalidDiscountLine.description });
      }
      if (cleanLines.some((line) => line.kind === "stock" && !line.inventoryItemId)) {
        return toast.error("Tezgah satışı için seri numarası seçin");
      }
      if (form.type === "sales") {
        const fractional = cleanLines.find((line) => {
          if (line.kind !== "product" || !line.productModelId) return false;
          const qty = parseMoneyInput(line.quantity);
          return Math.trunc(qty) !== qty;
        });
        if (fractional) {
          return toast.error("Ürün satışında adet tam sayı olmalı", { description: fractional.description });
        }
      }
    }
    if (!Number.isFinite(invoiceTotals.amount) || invoiceTotals.amount <= 0) return toast.error("Geçerli matrah girin");

    const invoiceLineItems = gridVisible && cleanLines.length
      ? cleanLines.map((line) => {
          const totals = lineTotals(line);
          return {
            saleType: line.kind === "stock" ? ("tezgah" as const) : line.kind === "product" && line.productModelId ? ("product" as const) : undefined,
            inventoryItemId: line.inventoryItemId,
            productModelId: line.productModelId || undefined,
            categoryCode: line.kind === "stock" ? "TEZGAH" : line.categoryCode || undefined,
            description: line.description,
            quantity: parseMoneyInput(line.quantity),
            listPrice: line.listPrice === "" ? undefined : parseMoneyInput(line.listPrice),
            unitPrice: parseMoneyInput(line.unitPrice),
            discountAmount: parseMoneyInput(line.discountAmount),
            vatRate: parseMoneyInput(line.vatRate),
            lineTotal: roundMoney(totals.total),
            expectedDate: line.expectedDate || form.expectedDate ? new Date(line.expectedDate || form.expectedDate) : undefined,
          };
        })
      : undefined;

    const textOrUndef = (value: string) => {
      const trimmed = value.trim();
      if (isEditing) return trimmed; // düzenlemede boş göndermek alanı temizler
      return trimmed || undefined;
    };
    const termDaysOrUndef = (value: string) =>
      value === "" ? undefined : Math.max(0, Math.trunc(parseMoneyInput(value)));

    setSaving(true);
    try {
      const payload = {
        companyId: form.companyId,
        type: form.type,
        invoiceCategory: form.invoiceCategory,
        invoiceNo: form.invoiceNo,
        invoiceDate: new Date(form.invoiceDate),
        amount: invoiceTotals.amount,
        vatRate: invoiceTotals.vatRate,
        vatAmount: invoiceTotals.vatAmount,
        grandTotal: invoiceTotals.grandTotal,
        currencyCode: form.currencyCode,
        paymentType: form.paymentType,
        paymentTermDays: termDaysOrUndef(form.paymentTermDays),
        previousPaymentTermDays: termDaysOrUndef(form.previousPaymentTermDays),
        termChangeReason: textOrUndef(form.termChangeReason),
        incoterm: isAdministrative ? (isEditing ? "" : undefined) : textOrUndef(form.incoterm),
        shipmentReference: textOrUndef(form.shipmentReference),
        orderNo: textOrUndef(form.orderNo),
        expectedDate: form.expectedDate ? new Date(form.expectedDate) : undefined,
        quoteId,
        salesOrderId,
        firstDueDate: new Date(form.firstDueDate),
        lastDueDate: form.lastDueDate ? new Date(form.lastDueDate) : undefined,
        installmentCount: Number(form.installmentCount) || 1,
        notes: form.notes || undefined,
        installments: installments.map((i) => ({
          installmentNo: i.installmentNo,
          dueDate: new Date(i.dueDate),
          amount: Number(i.amount),
        })),
        lineItems: invoiceLineItems,
      };
      if (invoiceId) await financeService.updateAccountingInvoice(invoiceId, payload);
      else await financeService.createAccountingInvoice(payload);
      toast.success(invoiceId ? "Fatura güncellendi" : form.type === "sales" ? "Satış faturası oluşturuldu" : "Alış faturası oluşturuldu");
      setOpen(false);
      refresh();
      onSaved?.();
      onCreated?.();
    } catch (err: any) {
      toast.error(invoiceId ? "Fatura güncellenemedi" : "Fatura oluşturulamadı", { description: err?.message });
    } finally {
      setSaving(false);
    }
  };

  const lineSourceValue = (line: InvoiceLineRow) =>
    line.inventoryItemId ? `inv:${line.inventoryItemId}` : line.productModelId ? `prod:${line.productModelId}` : "__none";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className={`${gridVisible ? "w-[95vw] sm:max-w-[1100px]" : "max-w-2xl"} max-h-[90vh] overflow-y-auto`}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Receipt className="size-5" /> {isEditing ? "Faturayı Düzenle" : "Muhasebe Faturası"}</DialogTitle>
          <DialogDescription>{isEditing ? "Fatura bilgileri ve vade planını güncelleyin." : "Satış veya alış faturası ile vade planı oluşturun; cari hareketler otomatik açılır."}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4 min-w-0">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
              <Label className="text-xs">Fatura Sınıfı</Label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {(["commercial", "administrative"] as InvoiceCategory[]).map((category) => (
                  <button
                    key={category}
                    type="button"
                    disabled={isEditing}
                    onClick={() => setInvoiceCategory(category)}
                    className={`rounded-md border px-3 py-2 text-left text-xs font-medium disabled:cursor-not-allowed disabled:opacity-70 ${
                      form.invoiceCategory === category ? "border-primary bg-primary/10 text-primary" : "border-border/70 bg-white hover:border-primary/50"
                    }`}
                  >
                    {category === "commercial" ? "Ticari" : "İdari"}
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
              <Label className="text-xs">Fatura Yönü</Label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {(["sales", "purchase"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    disabled={isEditing}
                    onClick={() => setInvoiceType(t)}
                    className={`rounded-md border px-3 py-2 text-left text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
                      form.type === t ? "border-primary bg-primary/10 text-primary" : "border-border/70 bg-white hover:border-primary/50"
                    }`}
                  >
                    {t === "sales" ? "Satış Faturası" : "Alış Faturası"}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div>
              <Label className="text-xs">Firma *</Label>
              <Select value={form.companyId} onValueChange={(v) => setForm({ ...form, companyId: v })}>
                <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="Firma" /></SelectTrigger>
                <SelectContent>
                  {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Ödeme Tipi</Label>
              <Select
                value={form.paymentType}
                onValueChange={(v) => {
                  const paymentType = v as PaymentType;
                  setTermTouched(true);
                  setForm({ ...form, paymentType, paymentTermDays: paymentType === "cash" ? "0" : form.paymentTermDays });
                }}
              >
                <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Peşin</SelectItem>
                  <SelectItem value="leasing">Leasing</SelectItem>
                  <SelectItem value="term">Vadeli</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Fatura No *</Label>
              <Input className="mt-1 h-9" value={form.invoiceNo} onChange={(e) => setForm({ ...form, invoiceNo: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Sipariş No</Label>
              <Input className="mt-1 h-9" value={form.orderNo} onChange={(e) => setForm({ ...form, orderNo: e.target.value })} placeholder="Opsiyonel" />
            </div>
            <div>
              <Label className="text-xs">Para Birimi</Label>
              <Select value={form.currencyCode} onValueChange={(v) => setForm({ ...form, currencyCode: v })}>
                <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["USD", "EUR", "TRY"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Fatura Tarihi</Label>
              <Input className="mt-1 h-9" type="date" value={form.invoiceDate} onChange={(e) => setForm({ ...form, invoiceDate: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Beklenen Tarih</Label>
              <Input className="mt-1 h-9" type="date" value={form.expectedDate} onChange={(e) => setForm({ ...form, expectedDate: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Yeni Vade (Gün)</Label>
              <Input
                className="mt-1 h-9"
                inputMode="numeric"
                value={form.paymentTermDays}
                onChange={(e) => {
                  setTermTouched(true);
                  setForm({ ...form, paymentTermDays: e.target.value });
                }}
                placeholder="0"
              />
              {contractTermHint && (
                <p className="mt-1 text-[11px] text-primary">{contractTermHint}</p>
              )}
            </div>
            <div>
              <Label className="text-xs">Önceki Vade (Gün)</Label>
              <Input className="mt-1 h-9" inputMode="numeric" value={form.previousPaymentTermDays} onChange={(e) => setForm({ ...form, previousPaymentTermDays: e.target.value })} placeholder="Opsiyonel" />
            </div>
            {!isAdministrative && (
              <div>
                <Label className="text-xs">Incoterm</Label>
                <Input className="mt-1 h-9" value={form.incoterm} onChange={(e) => setForm({ ...form, incoterm: e.target.value })} placeholder="EXW / FOB / CIF" />
              </div>
            )}
            <div>
              <Label className="text-xs">Referans</Label>
              <Input className="mt-1 h-9" value={form.shipmentReference} onChange={(e) => setForm({ ...form, shipmentReference: e.target.value })} placeholder="İrsaliye / talep no" />
            </div>
            <div>
              <Label className="text-xs">Vade Notu</Label>
              <Input className="mt-1 h-9" value={form.termChangeReason} onChange={(e) => setForm({ ...form, termChangeReason: e.target.value })} placeholder="Opsiyonel" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div>
              <Label className="text-xs">Matrah</Label>
              <Input
                className={`mt-1 h-9 ${gridDrivesTotals ? "bg-muted/40 font-medium" : ""}`}
                type="number"
                min="0"
                step="0.01"
                readOnly={gridDrivesTotals}
                value={form.amount}
                onChange={(e) => {
                  const amount = e.target.value;
                  setForm({ ...form, amount, vatAmount: String(vatAmountFromRate(amount, form.vatRate)) });
                }}
              />
            </div>
            <div>
              <Label className="text-xs">KDV Oranı</Label>
              <Select
                value={form.vatRate}
                disabled={gridDrivesTotals}
                onValueChange={(vatRate) => setForm({ ...form, vatRate, vatAmount: String(vatAmountFromRate(form.amount, vatRate)) })}
              >
                <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {!VAT_RATE_OPTIONS.includes(form.vatRate as typeof VAT_RATE_OPTIONS[number]) && form.vatRate ? (
                    <SelectItem value={form.vatRate}>%{form.vatRate}</SelectItem>
                  ) : null}
                  {VAT_RATE_OPTIONS.map((rate) => <SelectItem key={rate} value={rate}>%{rate}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">KDV Tutarı</Label>
              <Input
                className={`mt-1 h-9 ${gridDrivesTotals ? "bg-muted/40 font-medium" : ""}`}
                type="number"
                min="0"
                step="0.01"
                readOnly={gridDrivesTotals}
                value={form.vatAmount}
                onChange={(e) => setForm({ ...form, vatAmount: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Genel Toplam *</Label>
              <Input className="mt-1 h-9 bg-muted/40 font-medium" readOnly value={invoiceTotals.grandTotal.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} />
            </div>
          </div>
          {gridVisible && (
            <div className="rounded-lg border border-border/60 bg-white">
              <div className="flex flex-col gap-3 border-b border-border/60 bg-muted/20 px-3 py-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <ShoppingCart className="size-4 text-primary" /> Fatura Kalemleri
                  </div>
                  {!isAdministrative && (
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <Badge variant="secondary" className="gap-1"><Boxes className="size-3" /> Hazır {stockSummary.ready}</Badge>
                      <Badge variant="secondary" className="gap-1"><Package className="size-3" /> Rezerve {stockSummary.reserved}</Badge>
                      <Badge variant="secondary" className="gap-1">Tezgah {stockSummary.tezgah}</Badge>
                      <Badge variant="secondary" className="gap-1">Katalog {stockSummary.products}</Badge>
                    </div>
                  )}
                </div>
                <Button type="button" variant="outline" size="sm" className="h-8 gap-1" onClick={addLine}>
                  <Plus className="size-3.5" /> Kalem Ekle
                </Button>
              </div>
              <div className="overflow-x-auto">
                <div className="grid min-w-[1060px] grid-cols-[260px_260px_76px_112px_112px_96px_92px_120px_40px] gap-2 bg-muted/30 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  <div>{isAdministrative ? "Gider Türü" : form.type === "sales" ? "Ürün / Stok" : "Ürün"}</div>
                  <div>Açıklama</div>
                  <div>Adet</div>
                  <div>Liste Fiyatı</div>
                  <div>Olur Fiyatı</div>
                  <div>İndirim</div>
                  <div>KDV</div>
                  <div className="text-right">Son Tutar</div>
                  <div />
                </div>
                <div className="divide-y divide-border/60">
                  {lines.map((line) => {
                    const totals = lineTotals(line);
                    return (
                      <div key={line.id} className="grid min-w-[1060px] grid-cols-[260px_260px_76px_112px_112px_96px_92px_120px_40px] gap-2 px-3 py-2 items-center">
                        {isAdministrative ? (
                          <Input
                            className="h-8"
                            maxLength={64}
                            value={line.categoryCode ?? ""}
                            onChange={(e) => updateLine(line.id, { categoryCode: e.target.value })}
                            placeholder="Ofis, bakım, hizmet..."
                          />
                        ) : (
                          <Select value={lineSourceValue(line)} onValueChange={(value) => onLineSourceChange(line, value)}>
                            <SelectTrigger className="h-8 min-w-0"><SelectValue placeholder="Ürün seç" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none">Ürün seçmeden</SelectItem>
                              {form.type === "sales" && availableTezgahStock.length > 0 && (
                                <SelectGroup>
                                  <SelectLabel>Stok / Tezgah (Seri No)</SelectLabel>
                                  {availableTezgahStock.map((s) => (
                                    <SelectItem key={s.id} value={`inv:${s.id}`}>
                                      {s.serialNumber} · {s.brand} {s.counterModel} ({s.status === "Reserved" ? "rezerve" : "hazır"})
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              )}
                              <SelectGroup>
                                {form.type === "sales" && <SelectLabel>Katalog Ürün</SelectLabel>}
                                {products.map((product) => (
                                  <SelectItem key={product.id} value={`prod:${product.id}`}>
                                    {productTitle(product)}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                        )}
                        <Input className="h-8" value={line.description} onChange={(e) => updateLine(line.id, { description: e.target.value })} placeholder="Kalem açıklaması" />
                        <Input
                          className="h-8 text-right"
                          inputMode="decimal"
                          readOnly={line.kind === "stock"}
                          value={line.quantity}
                          onChange={(e) => updateLine(line.id, { quantity: e.target.value })}
                        />
                        <Input className="h-8 text-right" inputMode="decimal" value={line.listPrice} onChange={(e) => updateLine(line.id, { listPrice: e.target.value })} placeholder="0" />
                        <Input className="h-8 text-right" inputMode="decimal" value={line.unitPrice} onChange={(e) => updateLine(line.id, { unitPrice: e.target.value })} placeholder="0" />
                        <Input className="h-8 text-right" inputMode="decimal" value={line.discountAmount} onChange={(e) => updateLine(line.id, { discountAmount: e.target.value })} />
                        <Select value={line.vatRate} onValueChange={(vatRate) => updateLine(line.id, { vatRate })}>
                          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {!VAT_RATE_OPTIONS.includes(line.vatRate as typeof VAT_RATE_OPTIONS[number]) && line.vatRate ? (
                              <SelectItem value={line.vatRate}>%{line.vatRate}</SelectItem>
                            ) : null}
                            {VAT_RATE_OPTIONS.map((rate) => <SelectItem key={rate} value={rate}>%{rate}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <div className="text-right text-sm tabular-nums">
                          {roundMoney(totals.total).toLocaleString("tr-TR")} {form.currencyCode}
                        </div>
                        <Button type="button" variant="ghost" size="icon" className="size-8" onClick={() => removeLine(line.id)}>
                          <Trash2 className="size-4 text-muted-foreground" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="flex flex-col gap-2 border-t border-border/60 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-xs text-muted-foreground">
                  {lines.length} kalem{form.type === "sales" && !isAdministrative ? " · tezgah satışında seri no zorunludur; fatura kaydında stok düşülür ve kurulum açılır" : ""}
                </div>
                <div className="grid min-w-[280px] grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <span className="text-muted-foreground">Ara Toplam</span><span className="text-right tabular-nums">{roundMoney(gridTotals.subtotal).toLocaleString("tr-TR")} {form.currencyCode}</span>
                  <span className="text-muted-foreground">İndirim</span><span className="text-right tabular-nums">{roundMoney(gridTotals.discount).toLocaleString("tr-TR")} {form.currencyCode}</span>
                  <span className="text-muted-foreground">KDV</span><span className="text-right tabular-nums">{roundMoney(gridTotals.vat).toLocaleString("tr-TR")} {form.currencyCode}</span>
                  <span className="font-medium">Son Tutar</span><span className="text-right font-medium tabular-nums">{roundMoney(gridTotals.total).toLocaleString("tr-TR")} {form.currencyCode}</span>
                </div>
              </div>
            </div>
          )}
          <div className="rounded-lg border border-border/60 p-3 space-y-3">
            <div className="text-sm font-medium">Vade Planı</div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">İlk Vade</Label>
                <Input
                  className="mt-1 h-9"
                  type="date"
                  value={form.firstDueDate}
                  onChange={(e) => {
                    setTermTouched(true);
                    setForm({ ...form, firstDueDate: e.target.value });
                  }}
                />
              </div>
              <div>
                <Label className="text-xs">Son Vade</Label>
                <Input className="mt-1 h-9" type="date" value={form.lastDueDate} onChange={(e) => setForm({ ...form, lastDueDate: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Vade Sayısı</Label>
                <Input className="mt-1 h-9" type="number" min={1} value={form.installmentCount} onChange={(e) => setForm({ ...form, installmentCount: e.target.value })} />
              </div>
            </div>
            {installments.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Vade</TableHead>
                    <TableHead className="text-right">Tutar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {installments.map((row) => (
                    <TableRow key={row.installmentNo}>
                      <TableCell>{row.installmentNo}</TableCell>
                      <TableCell>{row.dueDate}</TableCell>
                      <TableCell className="text-right tabular-nums">{Number(row.amount).toLocaleString("tr-TR")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
          <div>
            <Label className="text-xs">Notlar</Label>
            <Textarea className="mt-1" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Vazgeç</Button>
            <Button type="submit" disabled={saving}>{saving ? "Kaydediliyor…" : isEditing ? "Güncelle" : "Faturayı Kaydet"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
