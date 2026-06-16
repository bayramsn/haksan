import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Badge } from "../../ui/badge";
import { Label } from "../../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { Textarea } from "../../ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../../ui/dialog";
import { StatusBadge } from "../../Layout";
import { MiniKpi } from "../../shared/MiniKpi";
import { FormField, SummaryLine } from "../shared/formFields";
import { purchaseOrderService, companyService, productService } from "../../../../lib/services";
import { ExportExcelButton } from "../../ui/ExportExcelButton";
import { formatCurrency, formatDate } from "../../../lib/pageHelpers";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { Plus, Search, ShoppingCart, Package, Receipt, Clock, Trash2 } from "lucide-react";
import { toast } from "sonner";

export function PurchaseOrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");

  const loadOrders = (cancelledRef?: { current: boolean }) => {
    setLoading(true);
    purchaseOrderService
      .list({ pageSize: 100 })
      .then((res) => {
        if (!cancelledRef?.current) setOrders(res.data);
      })
      .catch(() => {
        if (!cancelledRef?.current) {
          setOrders([]);
          toast.error("Satın alma siparişleri yüklenemedi");
        }
      })
      .finally(() => {
        if (!cancelledRef?.current) setLoading(false);
      });
  };

  useEffect(() => {
    const cancelledRef = { current: false };
    loadOrders(cancelledRef);
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  const total = orders.length;
  const commercial = orders.filter((p) => (p.purchaseType ?? "commercial") === "commercial").length;
  const administrative = orders.filter((p) => p.purchaseType === "administrative").length;
  const pending = orders.filter((p) => p.status?.code === "draft" || p.status?.code === "sent").length;
  const totalAmount = orders.reduce((a, p) => a + Number(p.grandTotal ?? 0), 0);

  const filtered = orders.filter((p) => {
    const supplier = p.supplier?.shortName || p.supplier?.legalTitle || "";
    return [p.orderNo, p.invoiceNo, supplier].some((value) => String(value ?? "").toLowerCase().includes(q.toLowerCase()));
  });

  const supplierStats = Array.from(new Set(filtered.map((p) => p.supplier?.shortName || p.supplier?.legalTitle || "—")))
    .map((s) => ({
      name: s,
      tutar: filtered
        .filter((p) => (p.supplier?.shortName || p.supplier?.legalTitle || "—") === s)
        .reduce((a, p) => a + Number(p.grandTotal ?? 0), 0),
    }));

  const poExportParams = q ? { search: q } : undefined;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MiniKpi tone="violet" icon={<ShoppingCart className="size-[18px]" />} label="Toplam Sipariş" value={total} sub={formatCurrency(totalAmount, "USD")} delta={6} />
        <MiniKpi tone="emerald" icon={<Package className="size-[18px]" />} label="Ticari" value={commercial} sub="mal/hizmet alımı" delta={3} />
        <MiniKpi tone="blue" icon={<Receipt className="size-[18px]" />} label="İdari" value={administrative} sub="genel gider" delta={2} />
        <MiniKpi tone="amber" icon={<Clock className="size-[18px]" />} label="Bekleyen" value={pending} sub="onay bekliyor" delta={1} />
      </div>

      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="tracking-tight">Tedarikçi Yüküne Göre</CardTitle>
          <p className="text-xs text-muted-foreground">Açık siparişlerdeki adet</p>
        </CardHeader>
        <CardContent className="h-56 pl-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={supplierStats} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" horizontal={false} />
              <XAxis type="number" stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="name" stroke="#6b7280" fontSize={11} width={120} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }} />
              <Bar dataKey="tutar" fill="#000c69" barSize={22} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-sm overflow-hidden">
        <CardHeader className="flex flex-col gap-3 pb-3 lg:flex-row lg:items-center lg:justify-between">
          <CardTitle className="tracking-tight">Satın Alma Siparişleri</CardTitle>
          <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto">
            <div className="relative w-full sm:w-64">
              <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="PO / tedarikçi..." className="pl-9 h-9 bg-white" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <ExportExcelButton path="/exports/purchase-orders" filename="satinalma-siparisleri.xlsx" params={poExportParams} className="h-9" />
            <CreatePurchaseOrderDialog onCreated={() => loadOrders()} />
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead>Tedarikçi</TableHead>
                <TableHead>Tip</TableHead>
                <TableHead>Sipariş</TableHead>
                <TableHead>Fatura No</TableHead>
                <TableHead>Tarih</TableHead>
                <TableHead>ETA</TableHead>
                <TableHead className="text-right">KDV</TableHead>
                <TableHead className="text-right">Tutar</TableHead>
                <TableHead>Durum</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => (
                <TableRow key={p.id} className="group">
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <div className="size-8 rounded-md bg-gradient-to-br from-primary/15 to-primary/5 text-primary grid place-items-center shrink-0">
                        <ShoppingCart className="size-4" />
                      </div>
                      <div>
                        <div className="text-sm leading-tight">{p.supplier?.shortName || p.supplier?.legalTitle || "—"}</div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">#{p.id.toUpperCase()}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="h-6 text-[11px]">{purchaseTypeLabel(p.purchaseType)}</Badge>
                  </TableCell>
                  <TableCell className="text-sm tabular-nums">{p.orderNo}</TableCell>
                  <TableCell className="text-sm tabular-nums text-muted-foreground">{p.invoiceNo || "—"}</TableCell>
                  <TableCell className="text-sm tabular-nums text-muted-foreground">{formatDate(p.orderDate)}</TableCell>
                  <TableCell className="text-sm tabular-nums text-muted-foreground">{formatDate(p.expectedDate)}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                    {formatCurrency(Number(p.vatAmount ?? 0), p.currency?.code ?? "USD")}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    {formatCurrency(Number(p.grandTotal ?? 0), p.currency?.code ?? "USD")}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={p.status?.name ?? p.status?.code ?? "Taslak"} />
                      {p.status?.code === "pending_manager_approval" && (
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="h-6 px-2 text-[10px] uppercase tracking-wider font-semibold border-amber-200 text-amber-700 hover:bg-amber-50"
                          onClick={async () => {
                            try {
                              await purchaseOrderService.approve(p.id);
                              toast.success("Yönetici onayı verildi");
                              loadOrders();
                            } catch (err: unknown) {
                              const msg = err instanceof Error ? err.message : "API isteği başarısız oldu.";
                              toast.error("Onay başarısız", { description: msg });
                            }
                          }}
                        >
                          Onayla
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!loading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12 text-sm text-muted-foreground">
                    Satın alma siparişi bulunamadı.
                  </TableCell>
                </TableRow>
              )}
              {loading && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12 text-sm text-muted-foreground">
                    Siparişler yükleniyor...
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

type PurchaseType = "commercial" | "administrative";
type PurchaseLineForm = {
  productModelId: string;
  description: string;
  quantity: string;
  unitPrice: string;
  discountAmount: string;
  vatRate: string;
  expectedDate: string;
};

const purchaseTypeLabel = (value?: string) => value === "administrative" ? "İdari" : "Ticari";
const todayInput = () => new Date().toISOString().slice(0, 10);
const blankPurchaseLine = (type: PurchaseType): PurchaseLineForm => ({
  productModelId: "",
  description: type === "administrative" ? "İdari satın alma gideri" : "",
  quantity: "1",
  unitPrice: "",
  discountAmount: "0",
  vatRate: "20",
  expectedDate: "",
});
const toDecimal = (value: string | number | undefined) => {
  const number = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(number) ? number : 0;
};
const lineTotals = (line: PurchaseLineForm) => {
  const gross = toDecimal(line.quantity) * toDecimal(line.unitPrice);
  const discount = toDecimal(line.discountAmount);
  const taxable = Math.max(gross - discount, 0);
  const vat = taxable * (toDecimal(line.vatRate) / 100);
  return { gross, discount, taxable, vat, total: taxable + vat };
};

function CreatePurchaseOrderDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [companies, setCompanies] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    purchaseType: "commercial" as PurchaseType,
    supplierCompanyId: "",
    invoiceNo: "",
    orderNo: "",
    orderDate: todayInput(),
    expectedDate: "",
    currencyCode: "USD" as "USD" | "EUR" | "TRY",
    incoterm: "",
    shipmentReference: "",
    notes: "",
    lines: [blankPurchaseLine("commercial")],
  });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    Promise.all([
      companyService.list({ pageSize: 200 }).catch(() => ({ data: [] })),
      productService.list({ pageSize: 200 }).catch(() => ({ data: [] })),
    ]).then(([companyRes, productRes]) => {
      if (cancelled) return;
      setCompanies(companyRes.data ?? []);
      setProducts(productRes.data ?? []);
      setForm((current) => ({
        ...current,
        supplierCompanyId: current.supplierCompanyId || companyRes.data?.[0]?.id || "",
      }));
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const setPurchaseType = (purchaseType: PurchaseType) => {
    setForm((current) => ({
      ...current,
      purchaseType,
      incoterm: purchaseType === "administrative" ? "" : current.incoterm,
      shipmentReference: purchaseType === "administrative" ? "" : current.shipmentReference,
      lines: current.lines.map((line, index) => ({
        ...line,
        productModelId: purchaseType === "administrative" ? "" : line.productModelId,
        description: line.description || blankPurchaseLine(purchaseType).description || (index === 0 ? "" : line.description),
      })),
    }));
  };

  const updateLine = (index: number, patch: Partial<PurchaseLineForm>) => {
    setForm((current) => ({
      ...current,
      lines: current.lines.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    }));
  };

  const addLine = () => {
    setForm((current) => ({ ...current, lines: [...current.lines, blankPurchaseLine(current.purchaseType)] }));
  };

  const removeLine = (index: number) => {
    setForm((current) => {
      const lines = current.lines.filter((_, i) => i !== index);
      return { ...current, lines: lines.length ? lines : [blankPurchaseLine(current.purchaseType)] };
    });
  };

  const totals = form.lines.reduce(
    (acc, line) => {
      const t = lineTotals(line);
      acc.subtotal += t.taxable;
      acc.discount += t.discount;
      acc.vat += t.vat;
      acc.total += t.total;
      return acc;
    },
    { subtotal: 0, discount: 0, vat: 0, total: 0 }
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    // İdari satın almada firma opsiyonel; sadece ticari için zorunlu.
    if (form.purchaseType !== "administrative" && !form.supplierCompanyId) {
      toast.error("Ticari satın alma için firma seçimi zorunludur");
      return;
    }
    const cleanLines = form.lines
      .map((line) => ({ ...line, description: line.description.trim() }))
      .filter((line) => line.description && toDecimal(line.quantity) > 0 && toDecimal(line.unitPrice) >= 0);
    if (!cleanLines.length) {
      toast.error("En az bir satın alma kalemi girin");
      return;
    }
    setSubmitting(true);
    try {
      const created = await purchaseOrderService.create({
        supplierCompanyId: form.supplierCompanyId || undefined,
        purchaseType: form.purchaseType,
        invoiceNo: form.invoiceNo.trim() || undefined,
        orderNo: form.orderNo.trim() || undefined,
        orderDate: form.orderDate,
        expectedDate: form.expectedDate || undefined,
        currencyCode: form.currencyCode,
        incoterm: form.purchaseType === "commercial" ? form.incoterm.trim() || undefined : undefined,
        shipmentReference: form.shipmentReference.trim() || undefined,
        notes: form.notes.trim() || undefined,
      });
      for (const [index, line] of cleanLines.entries()) {
        const description = form.purchaseType === "administrative" && line.productModelId
          ? `${line.productModelId.trim()} - ${line.description}`
          : line.description;
        await purchaseOrderService.addItem(created.id, {
          productModelId: form.purchaseType === "commercial" && line.productModelId ? line.productModelId : undefined,
          description,
          quantity: toDecimal(line.quantity),
          unitCode: "adet",
          unitPrice: toDecimal(line.unitPrice),
          discountAmount: toDecimal(line.discountAmount),
          vatRate: toDecimal(line.vatRate),
          expectedDate: line.expectedDate || form.expectedDate || undefined,
          sortOrder: index + 1,
        });
      }
      toast.success("Satın alma siparişi oluşturuldu", { description: created.orderNo });
      setOpen(false);
      setForm({
        purchaseType: "commercial",
        supplierCompanyId: "",
        invoiceNo: "",
        orderNo: "",
        orderDate: todayInput(),
        expectedDate: "",
        currencyCode: "USD",
        incoterm: "",
        shipmentReference: "",
        notes: "",
        lines: [blankPurchaseLine("commercial")],
      });
      onCreated();
    } catch (err: any) {
      toast.error("Satın alma siparişi oluşturulamadı", { description: err?.message ?? "API isteği başarısız oldu." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-9 gap-1"><Plus className="size-4" /> Yeni Sipariş</Button>
      </DialogTrigger>
      <DialogContent className="w-[95vw] sm:max-w-[1100px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Satın Alma Siparişi Oluştur</DialogTitle>
          <DialogDescription>Ticari veya idari satın alma için firma, fatura ve kalem bilgilerini girin.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4 min-w-0">
          <div className="grid gap-3 lg:grid-cols-[260px_1fr]">
            <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
              <Label className="text-xs">Satın Alma Tipi</Label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {(["commercial", "administrative"] as PurchaseType[]).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setPurchaseType(type)}
                    className={`rounded-md border px-3 py-2 text-left text-xs font-medium ${
                      form.purchaseType === type ? "border-primary bg-primary/10 text-primary" : "border-border/70 bg-white hover:border-primary/50"
                    }`}
                  >
                    {purchaseTypeLabel(type)}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <FormField label={form.purchaseType === "administrative" ? "Firma / Müşteri (opsiyonel)" : "Firma / Müşteri Listesi"}>
                <Select
                  value={form.supplierCompanyId || "__none"}
                  onValueChange={(v) => setForm({ ...form, supplierCompanyId: v === "__none" ? "" : v })}
                >
                  <SelectTrigger className="h-9"><SelectValue placeholder="Firma seçin" /></SelectTrigger>
                  <SelectContent>
                    {form.purchaseType === "administrative" && <SelectItem value="__none">Firma seçmeden</SelectItem>}
                    {companies.map((company) => (
                      <SelectItem key={company.id} value={company.id}>{company.shortName || company.legalTitle}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="Fatura Numarası">
                <Input className="h-9" value={form.invoiceNo} onChange={(e) => setForm({ ...form, invoiceNo: e.target.value })} placeholder="FTR-..." />
              </FormField>
              <FormField label="Sipariş No">
                <Input className="h-9" value={form.orderNo} onChange={(e) => setForm({ ...form, orderNo: e.target.value })} placeholder="Boşsa otomatik" />
              </FormField>
              <FormField label="Para Birimi">
                <Select value={form.currencyCode} onValueChange={(currencyCode: "USD" | "EUR" | "TRY") => setForm({ ...form, currencyCode })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="TRY">TL</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="Sipariş Tarihi">
                <Input className="h-9" type="date" value={form.orderDate} onChange={(e) => setForm({ ...form, orderDate: e.target.value })} />
              </FormField>
              <FormField label="Beklenen Tarih">
                <Input className="h-9" type="date" value={form.expectedDate} onChange={(e) => setForm({ ...form, expectedDate: e.target.value })} />
              </FormField>
              <FormField label={form.purchaseType === "commercial" ? "Incoterm" : "İdari Kategori"}>
                <Input
                  className="h-9"
                  value={form.incoterm}
                  onChange={(e) => setForm({ ...form, incoterm: e.target.value })}
                  placeholder={form.purchaseType === "commercial" ? "EXW / FOB / CIF" : "Ofis / bakım / hizmet"}
                />
              </FormField>
              <FormField label="Referans">
                <Input className="h-9" value={form.shipmentReference} onChange={(e) => setForm({ ...form, shipmentReference: e.target.value })} placeholder="İrsaliye / talep no" />
              </FormField>
            </div>
          </div>

          <div className="rounded-lg border border-border/60 overflow-x-auto">
            <div className="grid min-w-[900px] grid-cols-[1.1fr_1.7fr_90px_120px_110px_90px_120px_40px] gap-2 bg-muted/30 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <div>{form.purchaseType === "commercial" ? "Ürün" : "Gider Türü"}</div>
              <div>Açıklama</div>
              <div>Adet</div>
              <div>Birim Fiyat</div>
              <div>İndirim</div>
              <div>KDV</div>
              <div className="text-right">Son Tutar</div>
              <div />
            </div>
            <div className="divide-y divide-border/60">
              {form.lines.map((line, index) => {
                const t = lineTotals(line);
                return (
                  <div key={index} className="grid min-w-[900px] grid-cols-[1.1fr_1.7fr_90px_120px_110px_90px_120px_40px] gap-2 px-3 py-2 items-center">
                    {form.purchaseType === "commercial" ? (
                      <Select value={line.productModelId || "__none"} onValueChange={(value) => {
                        const product = products.find((p) => p.id === value);
                        updateLine(index, {
                          productModelId: value === "__none" ? "" : value,
                          description: product ? product.fullName ?? product.modelCode ?? line.description : line.description,
                        });
                      }}>
                        <SelectTrigger className="h-8"><SelectValue placeholder="Ürün seç" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none">Ürün seçmeden</SelectItem>
                          {products.map((product) => (
                            <SelectItem key={product.id} value={product.id}>
                              {[product.brand?.name, product.modelCode, product.fullName].filter(Boolean).join(" · ")}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input className="h-8" value={line.productModelId} onChange={(e) => updateLine(index, { productModelId: e.target.value })} placeholder="Ofis, bakım..." />
                    )}
                    <Input className="h-8" value={line.description} onChange={(e) => updateLine(index, { description: e.target.value })} placeholder="Kalem açıklaması" />
                    <Input className="h-8 text-right" inputMode="decimal" value={line.quantity} onChange={(e) => updateLine(index, { quantity: e.target.value })} />
                    <Input className="h-8 text-right" inputMode="decimal" value={line.unitPrice} onChange={(e) => updateLine(index, { unitPrice: e.target.value })} placeholder="0" />
                    <Input className="h-8 text-right" inputMode="decimal" value={line.discountAmount} onChange={(e) => updateLine(index, { discountAmount: e.target.value })} />
                    <Select value={line.vatRate} onValueChange={(vatRate) => updateLine(index, { vatRate })}>
                      <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1%</SelectItem>
                        <SelectItem value="10">10%</SelectItem>
                        <SelectItem value="20">20%</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="text-right text-sm tabular-nums">{formatCurrency(t.total, form.currencyCode)}</div>
                    <Button type="button" variant="ghost" size="icon" className="size-8" onClick={() => removeLine(index)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-start justify-between gap-4">
            <Button type="button" variant="outline" size="sm" className="gap-1" onClick={addLine}>
              <Plus className="size-4" /> Kalem Ekle
            </Button>
            <div className="grid w-full max-w-md grid-cols-2 gap-2 text-sm">
              <SummaryLine label="Ara Toplam" value={formatCurrency(totals.subtotal, form.currencyCode)} />
              <SummaryLine label="İndirim" value={formatCurrency(totals.discount, form.currencyCode)} />
              <SummaryLine label="KDV" value={formatCurrency(totals.vat, form.currencyCode)} />
              <SummaryLine label="Son Tutar" value={formatCurrency(totals.total, form.currencyCode)} strong />
            </div>
          </div>

          <FormField label="Notlar">
            <Textarea className="min-h-[72px]" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </FormField>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>İptal</Button>
            <Button type="submit" disabled={submitting}>{submitting ? "Kaydediliyor..." : "Sipariş Oluştur"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
