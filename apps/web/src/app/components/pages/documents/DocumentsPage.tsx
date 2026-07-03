import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import { StatusBadge } from "../../Layout";
import { DocumentUploadDialog } from "../../dialogs/DocumentUploadDialog";
import { DocumentPreviewDialog } from "../../dialogs/DocumentPreviewDialog";
import { CreateProformaDialog } from "../../dialogs/CreateProformaDialog";
import { CreateContractDialog } from "../../dialogs/CreateContractDialog";
import { useStore } from "../../../lib/store";
import { DocumentItem } from "../../../lib/mock";
import { toast } from "sonner";
import { documentService, fileService, serviceService } from "../../../../lib/services";
import { exportToCsv } from "../../../../lib/exportCsv";
import { formatDuration } from "@haksan/shared";
import { ExportExcelButton } from "../../ui/ExportExcelButton";
import { FilterPopover } from "../../ui/list-controls";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "../../ui/dropdown-menu";
import {
  Search, Upload, Download, Printer, Eye, FileText, FileSignature, Receipt, Wrench, ClipboardCheck, Plus, Trash2,
} from "lucide-react";
import {
  printAssetBase, proformaDoc, contractDoc, installationFormDoc, loadContractPrintData, loadProformaPrintData, PROFORMA_NOTE_OPTIONS, trShortDate,
} from "../../../lib/print";
import { printOrWarn, downloadPrintOrWarn } from "../../../lib/pageHelpers";

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
  const { documents, cases, customers, contacts, users, offers, payments, products, deliveries, machines, refresh } = useStore();
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

  const proformaInput = (d: (typeof documents)[number], variantKey: string) => ({
    doc: d,
    customers,
    cases,
    offers,
    products,
    contacts,
    variantKey,
  });

  const runProforma = async (
    d: (typeof documents)[number],
    variantKey: string,
    mode: "print" | "download",
  ) => {
    const loading = toast.loading("Proforma hazırlanıyor…");
    try {
      const data = await loadProformaPrintData(proformaInput(d, variantKey));
      const rendered = proformaDoc(data, printAssetBase());
      if (mode === "print") printOrWarn(rendered);
      else downloadPrintOrWarn(rendered, `Proforma-${d.fileName}`);
    } catch (err: any) {
      toast.error("Proforma oluşturulamadı", { description: err?.message ?? "Teklif verisi okunamadı." });
    } finally {
      toast.dismiss(loading);
    }
  };

  const printProforma = (d: (typeof documents)[number], variantKey: string) => {
    void runProforma(d, variantKey, "print");
  };

  const downloadProforma = (d: (typeof documents)[number], variantKey: string) => {
    void runProforma(d, variantKey, "download");
  };

  const printContract = async (d: (typeof documents)[number]) => {
    const ctx = resolveDocContext(d);
    if (!ctx.sc) {
      toast.error("Sözleşme yazdırılamadı", { description: "Bağlı satış kartı bulunamadı." });
      return;
    }
    const loading = toast.loading("Sözleşme hazırlanıyor…");
    try {
      const data = await loadContractPrintData({
        customer: ctx.cust,
        salesCase: ctx.sc,
        offer: ctx.offer,
        products,
        payments,
        contractDate: d.uploadedAt || new Date().toISOString().slice(0, 10),
      });
      printOrWarn(contractDoc(data, printAssetBase()));
    } catch (error: unknown) {
      toast.error("Sözleşme yazdırılamadı", {
        description: error instanceof Error ? error.message : "Teklif ayrıntıları alınamadı.",
      });
    } finally {
      toast.dismiss(loading);
    }
  };

  const printUploadedDocument = async (d: (typeof documents)[number]) => {
    if (!d.fileId) {
      toast.error("Yazdırılacak dosya yok", { description: "Bu kayıt canlı form değil ve yüklenmiş dosya içermiyor." });
      return;
    }
    try {
      const signed = await fileService.signedDownload(d.fileId);
      const opened = window.open(signed.downloadUrl, "_blank", "noopener");
      if (!opened) {
        toast.error("Yazdırma sekmesi açılamadı", { description: "Lütfen pop-up engelleyiciyi kapatın." });
        return;
      }
      toast.message("Dosya yeni sekmede açıldı", { description: "Tarayıcı yazdır menüsünden çıktı alabilirsiniz." });
    } catch (err: any) {
      toast.error("Doküman açılamadı", { description: err?.message ?? "İmzalı indirme bağlantısı alınamadı." });
    }
  };

  const printDeliveryForm = (d: (typeof documents)[number]) => {
    const delivery = deliveries.find((item) => item.id === d.deliveryId);
    if (!delivery) {
      toast.error("Teslim formu yazdırılamadı", { description: "Canlı teslimat kaydı bulunamadı." });
      return;
    }
    const cust = customers.find((c) => c.id === delivery.customerId);
    const fd = delivery.formData;
    printOrWarn(
      installationFormDoc(
        {
          teslimTarihi: delivery.date ? trShortDate(delivery.date) : "",
          kurulumTarihi: fd?.kurulumTarihi ? trShortDate(fd.kurulumTarihi) : "",
          formNo: fd?.formNo || delivery.id.slice(0, 6).toUpperCase(),
          tezgah: fd?.tezgah,
          cnc: fd?.cnc,
          firma: cust?.name ?? customerName(delivery.customerId),
          ilgili: fd?.ilgili || cust?.contactPerson,
          adres: cust ? [cust.address, cust.district, cust.city].filter(Boolean).join(" ") : undefined,
          telefon: cust?.phone,
          faks: cust?.fax,
          gsm: cust?.phone2,
          eposta: cust?.email,
          kurulumuYapan: fd?.kurulumuYapan || undefined,
          teslimAlan: delivery.signedBy && delivery.signedBy !== "—" ? delivery.signedBy : undefined,
        },
        printAssetBase(),
      ),
    );
  };

  const printInstallationForm = async (d: (typeof documents)[number]) => {
    let installation = d.installationData;
    if (!installation && d.installationId) {
      try {
        const res = await serviceService.installations({ pageSize: 500 });
        installation = (res.data ?? []).find((row: any) => row.id === d.installationId);
      } catch (err: any) {
        toast.error("Kurulum formu alınamadı", { description: err?.message ?? "Kurulum listesi yüklenemedi." });
        return;
      }
    }
    if (!installation) {
      toast.error("Kurulum formu yazdırılamadı", { description: "Canlı kurulum kaydı bulunamadı." });
      return;
    }
    const cust = customers.find((c) => c.id === installation.companyId);
    const specs = Array.isArray(installation.customerDevice?.technicalSpecs)
      ? installation.customerDevice.technicalSpecs.map((spec: any) => ({
          key: String(spec.key ?? ""),
          value: [spec.value, spec.unit].filter(Boolean).join(" "),
        }))
      : [];
    const device = installation.customerDevice
      ? {
          id: installation.customerDevice.id,
          customerId: installation.companyId ?? "",
          salesCaseId: "",
          stockItemId: "",
          serialNumber: installation.customerDevice.serialNumber ?? "—",
          model: installation.customerDevice.model ?? installation.customerDevice.productModelName ?? "—",
          brand: installation.customerDevice.brandName ?? "",
          type: installation.customerDevice.productTypeName ?? "",
          controlUnit: installation.customerDevice.controlUnit ?? "",
          controlUnitSerial: installation.customerDevice.controlUnitSerialNumber ?? "",
          technicalSpecs: specs,
          deliveryDate: "",
          installationDate: (installation.completedAt as string | undefined)?.slice(0, 10) ?? "",
          warrantyStart: "",
          warrantyEnd: "",
          status: "Active" as const,
        }
      : null;
    const machine =
      machines.find((item) => item.id === installation.customerDeviceId) ??
      device ??
      machines.find((item) => item.customerId === installation.companyId);
    const fd = installation.formData ?? {};
    const cncParts = machine?.controlUnit?.split(" ") ?? [];
    printOrWarn(
      installationFormDoc(
        {
          teslimTarihi: fd.teslimTarihi ? trShortDate(fd.teslimTarihi) : machine?.deliveryDate ? trShortDate(machine.deliveryDate) : "",
          kurulumTarihi: fd.kurulumTarihi
            ? trShortDate(fd.kurulumTarihi)
            : installation.completedAt
              ? trShortDate(installation.completedAt)
              : installation.scheduledDate
                ? trShortDate(installation.scheduledDate)
                : "",
          formNo: fd.formNo || installation.id.slice(0, 6).toUpperCase(),
          tezgah: fd.tezgah ?? (machine ? { marka: machine.brand, tip: machine.type, model: machine.model, seriNo: machine.serialNumber } : undefined),
          cnc: fd.cnc ?? (machine?.controlUnit
            ? {
                marka: cncParts[0],
                model: cncParts.slice(1).join(" "),
                seriNo: machine.controlUnitSerial,
              }
            : undefined),
          firma: fd.kullanici?.firma || cust?.name || customerName(installation.companyId ?? ""),
          ilgili: fd.kullanici?.ilgili || installation.contact?.fullName || cust?.contactPerson,
          adres: fd.kullanici?.adres || (cust ? [cust.address, cust.district, cust.city].filter(Boolean).join(" ") : installation.location),
          telefon: fd.kullanici?.telefon || cust?.phone,
          faks: fd.kullanici?.faks || cust?.fax,
          gsm: fd.kullanici?.gsm || cust?.phone2,
          eposta: fd.kullanici?.eposta || cust?.email,
          kurulumuYapan: fd.kurulumuYapan || installation.assignedTo?.fullName,
          teslimAlan: fd.teslimAlan || installation.contact?.fullName || cust?.contactPerson,
          kurulumYeri: installation.location ?? "",
          sure: installation.durationMinutes != null ? formatDuration(Number(installation.durationMinutes)) : undefined,
          checks: fd.checks?.map((check: any) => ({ label: check.label, status: check.status, note: check.note })),
          problem: fd.problem,
          notlar: installation.notes ?? "",
        },
        printAssetBase(),
      ),
    );
  };

  const printDocument = async (d: (typeof documents)[number]) => {
    if (d.type === "DeliveryForm" && d.deliveryId) {
      printDeliveryForm(d);
      return;
    }
    if (d.type === "InstallationForm" && d.installationId) {
      await printInstallationForm(d);
      return;
    }
    await printUploadedDocument(d);
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

  const filtered = documents
    .filter((d) => {
      const sc = cases.find((s) => s.id === d.salesCaseId);
      const companyId = d.companyId || sc?.customerId || "";
      if (docType !== "all" && d.type !== docType) return false;
      return (
        d.fileName.toLowerCase().includes(q.toLowerCase()) ||
        customerName(companyId).toLowerCase().includes(q.toLowerCase())
      );
    })
    // Proforma / Sözleşme no'larına (fileName olarak tutulan documentNo / contractNo) göre azalan sırala.
    .sort((a, b) => b.fileName.localeCompare(a.fileName, "tr", { numeric: true, sensitivity: "base" }));

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

  const deleteDocumentRecord = async (d: (typeof documents)[number]) => {
    const label = d.type === "Contract" ? "sözleşme" : d.type === "Proforma" ? "proforma" : d.type === "CommercialInvoice" ? "ticari fatura" : "doküman";
    if (!window.confirm(`${d.fileName} ${label} kaydı silinsin mi?`)) return;
    try {
      if (d.type === "Proforma") {
        await documentService.deleteProforma(d.id);
      } else if (d.type === "Contract") {
        await documentService.deleteContract(d.id);
      } else if (d.type === "CommercialInvoice") {
        await documentService.deleteCommercialInvoice(d.id);
      } else {
        return;
      }
      toast.success(`${DOC_TYPE_LABELS[d.type]} silindi`, { description: d.fileName });
      await refresh();
    } catch (err: any) {
      toast.error(`${DOC_TYPE_LABELS[d.type]} silinemedi`, { description: err?.message ?? "API isteği başarısız oldu." });
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
            {initialType === "Proforma" && (
              <CreateProformaDialog
                trigger={<Button size="sm" className="h-9 justify-center gap-1"><Plus className="size-4" /> Proforma Oluştur</Button>}
              />
            )}
            {initialType === "Contract" && (
              <CreateContractDialog
                trigger={<Button size="sm" className="h-9 justify-center gap-1"><Plus className="size-4" /> Sözleşme Oluştur</Button>}
              />
            )}
            {initialType !== "Proforma" && initialType !== "Contract" && (
              <DocumentUploadDialog
                defaultType={initialType}
                trigger={<Button size="sm" className="h-9 justify-center gap-1"><Upload className="size-4" /> {initialType ? `${DOC_TYPE_LABELS[initialType]} Yükle` : "Yükle"}</Button>}
              />
            )}
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
                          <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                            {customerName(companyId) !== "—" ? customerName(companyId) : sc ? `#${sc.id.toUpperCase()}` : d.companyId ? "Firma dokümanı" : "—"}
                          </div>
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
                          <>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="size-7" title="Proforma yazdır">
                                  <Printer className="size-4 text-muted-foreground hover:text-primary" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => printProforma(d, "")}>
                                  Otomatik (teklife göre)
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuLabel>Proforma şablonu</DropdownMenuLabel>
                                {PROFORMA_NOTE_OPTIONS.filter((v) => v.group === "proforma").map((v) => (
                                  <DropdownMenuItem key={v.key} onClick={() => printProforma(d, v.key)}>
                                    {v.label}
                                  </DropdownMenuItem>
                                ))}
                                <DropdownMenuSeparator />
                                <DropdownMenuLabel>Teklif teslim şekli</DropdownMenuLabel>
                                {PROFORMA_NOTE_OPTIONS.filter((v) => v.group === "teslim").map((v) => (
                                  <DropdownMenuItem key={v.key} onClick={() => printProforma(d, v.key)}>
                                    {v.label}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="size-7" title="Proforma indir">
                                  <Download className="size-4 text-muted-foreground hover:text-primary" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => downloadProforma(d, "")}>
                                  Otomatik (teklife göre)
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuLabel>Proforma şablonu</DropdownMenuLabel>
                                {PROFORMA_NOTE_OPTIONS.filter((v) => v.group === "proforma").map((v) => (
                                  <DropdownMenuItem key={v.key} onClick={() => downloadProforma(d, v.key)}>
                                    {v.label}
                                  </DropdownMenuItem>
                                ))}
                                <DropdownMenuSeparator />
                                <DropdownMenuLabel>Teklif teslim şekli</DropdownMenuLabel>
                                {PROFORMA_NOTE_OPTIONS.filter((v) => v.group === "teslim").map((v) => (
                                  <DropdownMenuItem key={v.key} onClick={() => downloadProforma(d, v.key)}>
                                    {v.label}
                                  </DropdownMenuItem>
                                ))}
                                <DropdownMenuSeparator />
                                {d.fileId && (
                                  <DropdownMenuItem onClick={() => downloadDocument(d)}>
                                    Yüklenen dosyayı indir
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </>
                        )}
                        {d.type === "Contract" && (
                          <Button variant="ghost" size="icon" className="size-7" title="Satış sözleşmesi yazdır / PDF"
                            onClick={() => void printContract(d)}>
                            <Printer className="size-4 text-muted-foreground hover:text-primary" />
                          </Button>
                        )}
                        {d.type !== "Proforma" && d.type !== "Contract" && (
                          <Button variant="ghost" size="icon" className="size-7" title="Yazdır / PDF"
                            onClick={() => void printDocument(d)}>
                            <Printer className="size-4 text-muted-foreground hover:text-primary" />
                          </Button>
                        )}
                        {!(d.deliveryId || d.installationId) && (
                          <Button variant="ghost" size="icon" className="size-7" title="Önizle"
                            onClick={() => setPreviewDoc(d)}>
                            <Eye className="size-4 text-muted-foreground hover:text-primary" />
                          </Button>
                        )}
                        {d.type !== "Proforma" && !(d.deliveryId || d.installationId) && (
                          <Button variant="ghost" size="icon" className="size-7" title="İndir"
                            onClick={() => downloadDocument(d)}>
                            <Download className="size-4 text-muted-foreground hover:text-primary" />
                          </Button>
                        )}
                        {(d.type === "Proforma" || d.type === "Contract" || d.type === "CommercialInvoice") && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            title="Sil"
                            onClick={() => void deleteDocumentRecord(d)}
                          >
                            <Trash2 className="size-4 text-muted-foreground hover:text-destructive" />
                          </Button>
                        )}
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
