import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Badge } from "../../ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../ui/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "../../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import { Label } from "../../ui/label";
import { StatusBadge } from "../../Layout";
import { DocumentUploadDialog } from "../../dialogs/DocumentUploadDialog";
import { DocumentPreviewDialog } from "../../dialogs/DocumentPreviewDialog";
import { useStore } from "../../../lib/store";
import { DocumentItem } from "../../../lib/mock";
import { toast } from "sonner";
import { fileService } from "../../../../lib/services";
import { exportToCsv } from "../../../../lib/exportCsv";
import { ExportExcelButton } from "../../ui/ExportExcelButton";
import { FilterPopover } from "../../ui/list-controls";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "../../ui/dropdown-menu";
import {
  Search, Upload, Download, Printer, Eye, FileText, FileSignature, Receipt, Wrench, ClipboardCheck,
} from "lucide-react";
import {
  printAssetBase, trLongDate, trShortDate, proformaDoc, contractDoc,
  PROFORMA_NOTE_VARIANTS, fillNotePlaceholders,
} from "../../../lib/print";
import { printOrWarn, splitVat } from "../../../lib/pageHelpers";

const DOC_ICONS: Record<string, React.ReactNode> = {
  Proforma: <FileText className="size-4" />,
  Contract: <FileSignature className="size-4" />,
  CommercialInvoice: <Receipt className="size-4" />,
  AccountingInvoice: <Receipt className="size-4" />,
  DeliveryForm: <ClipboardCheck className="size-4" />,
  InstallationForm: <Wrench className="size-4" />,
  Other: <FileText className="size-4" />,
};

const DOC_TYPE_LABELS: Record<DocumentItem["type"], string> = {
  Proforma: "Proforma",
  Contract: "Sözleşme",
  CommercialInvoice: "Ticari fatura",
  AccountingInvoice: "Muhasebe faturası",
  DeliveryForm: "Teslim formu",
  InstallationForm: "Kurulum formu",
  Other: "Diğer",
};

export function DocumentsPage({
  initialType,
  initialQuery,
  title = "Dokümanlar",
  description = "Proforma, sözleşme, fatura ve servis/teslim formları",
}: {
  initialType?: DocumentItem["type"];
  initialQuery?: string;
  title?: string;
  description?: string;
}) {
  const { documents, cases, customers, users, offers, payments, products } = useStore();
  const customerName = (id: string) => customers.find((c) => c.id === id)?.name ?? "—";
  const userName = (id: string) => users.find((u) => u.id === id)?.name ?? "—";

  // Yazdırma için belge satırını CRM verisiyle eşler: müşteri, satış kartı,
  // en güncel teklif ve ürün kataloğu kaydı.
  const resolveDocContext = (d: (typeof documents)[number]) => {
    const sc = cases.find((s) => s.id === d.salesCaseId) ?? null;
    const cust = customers.find((c) => c.id === (d.companyId || sc?.customerId)) ?? null;
    const offer = offers
      .filter((o) => (sc && o.salesCaseId === sc.id) || (d.companyId && o.companyId === d.companyId))
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    const model = sc?.requestedModel ?? "";
    const product = products.find(
      (p) => p.model && model && (model.includes(p.model) || p.model.includes(model))
    );
    return {
      sc,
      cust,
      offer,
      product,
      amount: offer?.amount ?? sc?.estimatedAmount ?? 0,
      currency: (offer?.currency ?? sc?.currency ?? "USD") as "USD" | "EUR" | "TRY",
      adres: cust ? [cust.address, cust.district, cust.city].filter(Boolean).join(" ") : "",
      urunAdi: product?.shortDescription || [sc?.requestedProduct, sc?.requestedModel].filter(Boolean).join(" ") || d.fileName,
    };
  };

  const printProforma = (d: (typeof documents)[number], variantKey: string) => {
    const variant = PROFORMA_NOTE_VARIANTS.find((v) => v.key === variantKey) ?? PROFORMA_NOTE_VARIANTS[0];
    const ctx = resolveDocContext(d);
    const vat = splitVat(ctx.amount, { subtotal: ctx.offer?.subtotal, vatTotal: ctx.offer?.vatTotal });
    printOrWarn(
      proformaDoc(
        {
          firma: ctx.cust?.name ?? "",
          ilgili: ctx.cust?.contactPerson,
          mobil: ctx.cust?.phone2,
          adres: ctx.adres,
          tel: ctx.cust?.phone,
          faks: ctx.cust?.fax,
          vergiDairesi: ctx.cust?.taxOffice,
          vergiNo: ctx.cust?.taxNumber,
          tarih: trLongDate(d.uploadedAt) || trLongDate(new Date()),
          belgeNo: d.fileName,
          items: [
            {
              aciklama: ctx.urunAdi,
              marka: ctx.product?.brand,
              mensei: ctx.product?.originCountry,
              gtip: ctx.product?.hsCode,
              birim: `${ctx.sc?.quantity ?? 1} Adet`,
              tutar: vat.net,
            },
          ],
          kdvOran: vat.oran,
          kdvTutar: vat.kdv,
          currency: ctx.currency,
          notlar: fillNotePlaceholders(variant.notlar, { alici: ctx.cust?.name }),
        },
        printAssetBase()
      )
    );
  };

  const printContract = (d: (typeof documents)[number]) => {
    const ctx = resolveDocContext(d);
    // Sözleşme KDV hariç fiyatlandırılır (madde 3.3) → net tutar kullan.
    const vat = splitVat(ctx.amount, { subtotal: ctx.offer?.subtotal, vatTotal: ctx.offer?.vatTotal });
    // Ödeme planı: teklife bağlı beklenen tahsilatlar; yoksa tek satır peşin.
    const expected = payments
      .filter((p) => p.paymentType === "expected" && ctx.offer && p.salesCaseId === ctx.offer.id)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const odemePlani = expected.length
      ? expected.map((p, i) => ({
          label: i === 0 ? "Peşin" : `Vade ${trShortDate(p.dueDate)}`,
          tutar: p.amount,
          senet: i > 0,
        }))
      : [{ label: "Peşin", tutar: vat.net }];
    printOrWarn(
      contractDoc(
        {
          alici: {
            unvan: ctx.cust?.name ?? "",
            yetkili: ctx.cust?.contactPerson,
            adres: ctx.adres,
            vergiDairesi: ctx.cust?.taxOffice,
            vergiNo: ctx.cust?.taxNumber,
            tel: ctx.cust?.phone,
            faks: ctx.cust?.fax,
          },
          sozlesmeTarihi: d.uploadedAt || new Date().toISOString().slice(0, 10),
          model: ctx.urunAdi,
          adet: ctx.sc?.quantity ?? 1,
          ozellikler: ctx.product?.specs?.slice(0, 14) ?? [],
          aksesuarlar: ctx.product?.standardEquipment ?? [],
          fiyat: vat.net,
          currency: ctx.currency,
          teslimSekli: "Millileştirilmiş",
          kdvOran: vat.oran,
          odemePlani,
        },
        printAssetBase()
      )
    );
  };
  const [q, setQ] = useState("");
  const [docType, setDocType] = useState("all");
  const [previewDoc, setPreviewDoc] = useState<(typeof documents)[number] | null>(null);
  const types = ["Proforma", "Contract", "CommercialInvoice", "AccountingInvoice", "DeliveryForm", "InstallationForm", "Other"];
  const visibleTypes = initialType ? [initialType] : types;
  const counts = visibleTypes.map((t) => ({ type: t, count: documents.filter((d) => d.type === t).length }));

  useEffect(() => {
    setDocType(initialType ?? "all");
  }, [initialType]);

  useEffect(() => {
    if (initialQuery) setQ(initialQuery);
  }, [initialQuery]);

  const filtered = documents.filter((d) => {
    const sc = cases.find((s) => s.id === d.salesCaseId);
    const companyId = d.companyId || sc?.customerId || "";
    if (docType !== "all" && d.type !== docType) return false;
    return (
      d.fileName.toLowerCase().includes(q.toLowerCase()) ||
      customerName(companyId).toLowerCase().includes(q.toLowerCase())
    );
  });

  const downloadDocument = async (d: (typeof documents)[number]) => {
    const sc = cases.find((s) => s.id === d.salesCaseId);
    const fallbackCustomer = customerName(sc?.customerId || d.companyId || "");
    if (!d.fileId) {
      exportToCsv(d.fileName || "dokuman", ["Dosya", "Tip", "Müşteri", "Boyut", "Tarih"], [[d.fileName, d.type, fallbackCustomer, d.size, d.uploadedAt]]);
      return;
    }
    try {
      const signed = await fileService.signedDownload(d.fileId);
      const a = document.createElement("a");
      a.href = signed.downloadUrl;
      a.download = signed.filename || d.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err: any) {
      toast.error("Doküman indirilemedi", { description: err?.message ?? "İstek başarısız oldu." });
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {counts.map((c) => (
          <Card
            key={c.type}
            role="button"
            tabIndex={0}
            onClick={() => setDocType(c.type)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setDocType(c.type); } }}
            className={`border-border/60 shadow-sm hover:shadow-md transition-shadow cursor-pointer ${docType === c.type ? "ring-2 ring-primary/30" : ""}`}
          >
            <CardContent className="p-3 flex items-center gap-2.5">
              <div className="size-8 rounded-md bg-primary/10 text-primary grid place-items-center shrink-0">
                {DOC_ICONS[c.type]}
              </div>
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground truncate">{DOC_TYPE_LABELS[c.type as DocumentItem["type"]] ?? c.type}</div>
                <div className="text-[18px] tabular-nums leading-none mt-1">{c.count}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-border/60 shadow-sm overflow-hidden">
        <CardHeader className="flex flex-col gap-3 pb-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <CardTitle className="tracking-tight">{title}</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap lg:w-auto lg:justify-end">
            <div className="relative w-full sm:w-64">
              <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Dosya / müşteri ara..." className="pl-9 h-9 bg-white" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            {!initialType && (
              <FilterPopover
                filters={[{ label: "Tip", value: docType, onChange: setDocType, options: types.map((t) => ({ value: t, label: DOC_TYPE_LABELS[t as DocumentItem["type"]] ?? t })) }]}
              />
            )}
            <ExportExcelButton path="/exports/documents" filename="dokumanlar.xlsx" className="h-9 justify-center" />
            <DocumentUploadDialog
              defaultType={initialType}
              trigger={<Button size="sm" className="h-9 justify-center gap-1"><Upload className="size-4" /> {initialType ? `${DOC_TYPE_LABELS[initialType]} Yükle` : "Yükle"}</Button>}
            />
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead>Dosya</TableHead>
                <TableHead>Tip</TableHead>
                <TableHead>Müşteri</TableHead>
                <TableHead>Boyut</TableHead>
                <TableHead>Yükleyen</TableHead>
                <TableHead>Tarih</TableHead>
                <TableHead className="w-20 text-right">İşlem</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((d) => {
                const sc = cases.find((s) => s.id === d.salesCaseId);
                const companyId = sc?.customerId || d.companyId || "";
                return (
                  <TableRow key={d.id} className="group">
                    <TableCell>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="size-8 rounded-md bg-primary/10 text-primary grid place-items-center shrink-0">
                          {DOC_ICONS[d.type]}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm leading-tight truncate">{d.fileName}</div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">{sc ? `#${sc.id.toUpperCase()}` : d.companyId ? "Firma dokümanı" : "—"}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell><StatusBadge status={d.type} /></TableCell>
                    <TableCell className="text-sm">{customerName(companyId)}</TableCell>
                    <TableCell className="text-sm tabular-nums text-muted-foreground">{d.size}</TableCell>
                    <TableCell className="text-sm">{userName(d.uploadedBy)}</TableCell>
                    <TableCell className="text-sm tabular-nums text-muted-foreground">{d.uploadedAt}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center gap-1 justify-end">
                        {d.type === "Proforma" && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="size-7" title="Proforma yazdır / PDF">
                                <Printer className="size-4 text-muted-foreground hover:text-primary" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {PROFORMA_NOTE_VARIANTS.map((v) => (
                                <DropdownMenuItem key={v.key} onClick={() => printProforma(d, v.key)}>
                                  {v.label} notları ile yazdır
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                        {d.type === "Contract" && (
                          <Button variant="ghost" size="icon" className="size-7" title="Satış sözleşmesi yazdır / PDF"
                            onClick={() => printContract(d)}>
                            <Printer className="size-4 text-muted-foreground hover:text-primary" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="size-7" title="Önizle"
                          onClick={() => setPreviewDoc(d)}>
                          <Eye className="size-4 text-muted-foreground hover:text-primary" />
                        </Button>
                        <Button variant="ghost" size="icon" className="size-7" title="İndir"
                          onClick={() => downloadDocument(d)}>
                          <Download className="size-4 text-muted-foreground hover:text-primary" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-10 text-sm text-muted-foreground">
                    Doküman bulunamadı.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <DocumentPreviewDialog doc={previewDoc} onClose={() => setPreviewDoc(null)} />
    </div>
  );
}
