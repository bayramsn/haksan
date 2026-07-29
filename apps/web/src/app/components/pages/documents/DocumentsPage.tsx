import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import { StatusBadge } from "../../Layout";
import { DocumentUploadDialog } from "../../dialogs/DocumentUploadDialog";
import { DocumentPreviewDialog } from "../../dialogs/DocumentPreviewDialog";
import { DocumentDetailDialog } from "../../dialogs/DocumentDetailDialog";
import { CreateProformaDialog } from "../../dialogs/CreateProformaDialog";
import { EditProformaPricesDialog } from "../../dialogs/EditProformaPricesDialog";
import { CreateContractDialog } from "../../dialogs/CreateContractDialog";
import { useStore } from "../../../lib/store";
import { DocumentItem } from "../../../lib/mock";
import { toast } from "sonner";
import { documentService, fileService, serviceService } from "../../../../lib/services";
import { exportToCsv } from "../../../../lib/exportCsv";
import { formatDuration } from "@haksan/shared";
import { ExportExcelButton } from "../../ui/ExportExcelButton";
import { FilterPopover } from "../../ui/list-controls";
import { InsightStat } from "../../shared/PremiumPrimitives";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "../../ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "../../ui/dropdown-menu";
import {
  Search, Upload, Download, Printer, Eye, FileText, FileSignature, Receipt, Wrench, ClipboardCheck, Plus, Trash2,
  Files, Layers3, Clock3, FileCheck2, BadgeDollarSign,
} from "lucide-react";
import {
  printAssetBase, proformaDoc, commercialInvoiceDoc, contractDoc, installationFormDoc, loadContractPrintData, loadProformaPrintData, PROFORMA_NOTE_OPTIONS, trShortDate,
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

const DOC_GROUPS: Array<{ title: string; description: string; types: DocumentItem["type"][] }> = [
  { title: "Ticari Belgeler", description: "Satış ve finans kayıtları", types: ["Proforma", "Contract", "CommercialInvoice", "AccountingInvoice"] },
  { title: "Saha Formları", description: "Teslim ve kurulum kanıtları", types: ["DeliveryForm", "InstallationForm"] },
  { title: "Diğer Dosyalar", description: "Genel ekler ve arşiv", types: ["Other"] },
];

function DocumentSheetPreview({ document }: { document: DocumentItem }) {
  const label = DOC_TYPE_LABELS[document.type];
  return (
    <div className="relative h-[66px] w-[50px] shrink-0 overflow-hidden rounded-[4px] border border-border/70 bg-white shadow-sm" aria-hidden="true">
      <span className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,var(--brand-red)_0_30%,var(--brand-blue)_30%)]" />
      <div className="px-2 pt-3">
        <div className="h-1.5 w-7 rounded-full bg-primary/18" />
        <div className="mt-1.5 h-px w-full bg-border" />
        <div className="mt-1 h-px w-4/5 bg-border" />
        <div className="mt-1 h-px w-3/5 bg-border" />
        <div className="mt-2 grid grid-cols-2 gap-0.5"><span className="h-2 bg-muted" /><span className="h-2 bg-muted" /></div>
      </div>
      <span className="absolute inset-x-1 bottom-1 truncate text-center font-data text-[5px] font-semibold uppercase tracking-wide text-primary">{label}</span>
    </div>
  );
}

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
  // bağlı teklif ve ürün kataloğu kaydı.
  const resolveDocContext = (d: (typeof documents)[number]) => {
    const initialSc = cases.find((s) => s.id === d.salesCaseId) ?? null;
    const exactOffer = d.quoteId ? offers.find((o) => o.id === d.quoteId) ?? null : null;
    const offer = exactOffer ?? offers
      .filter((o) => (initialSc && o.salesCaseId === initialSc.id) || (d.companyId && o.companyId === d.companyId))
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    const sc = initialSc ?? cases.find((s) => s.id === offer?.salesCaseId) ?? null;
    const cust = customers.find((c) => c.id === (d.companyId || offer?.companyId || sc?.customerId)) ?? null;
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
      else downloadPrintOrWarn(rendered, `Proforma-${d.fileName}`, "Proforma");
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

  const runContract = async (d: (typeof documents)[number], mode: "print" | "download") => {
    const ctx = resolveDocContext(d);
    if (!ctx.sc) {
      toast.error("Sözleşme oluşturulamadı", { description: "Bağlı satış kartı bulunamadı." });
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
        contractNo: d.fileName,
        documentSnapshot: d.documentSnapshot,
      });
      const rendered = contractDoc(data, printAssetBase());
      if (mode === "print") printOrWarn(rendered);
      else downloadPrintOrWarn(rendered, `Sozlesme-${d.fileName}`, "Sözleşme");
    } catch (error: unknown) {
      toast.error("Sözleşme oluşturulamadı", {
        description: error instanceof Error ? error.message : "Teklif ayrıntıları alınamadı.",
      });
    } finally {
      toast.dismiss(loading);
    }
  };

  const printContract = (d: (typeof documents)[number]) => {
    void runContract(d, "print");
  };

  const downloadContract = (d: (typeof documents)[number]) => {
    void runContract(d, "download");
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
  const [detailDoc, setDetailDoc] = useState<(typeof documents)[number] | null>(null);
  const [pendingDeleteDoc, setPendingDeleteDoc] = useState<(typeof documents)[number] | null>(null);
  const [deletingDocumentId, setDeletingDocumentId] = useState<string | null>(null);
  // Proforma / sözleşme / ticari fatura kayıtları için içerik pop-up'ını açar.
  const CONTENT_TYPES: DocumentItem["type"][] = ["Proforma", "Contract", "CommercialInvoice"];
  const detailPrint = (d: (typeof documents)[number]) => {
    if (d.type === "Proforma") printProforma(d, "");
    else if (d.type === "Contract") printContract(d);
    else if (d.type === "CommercialInvoice") printCommercialInvoice(d);
  };
  const detailDownload = (d: (typeof documents)[number]) => {
    if (d.type === "Proforma") downloadProforma(d, "");
    else if (d.type === "Contract") downloadContract(d);
    else if (d.type === "CommercialInvoice") downloadCommercialInvoice(d);
  };
  const types = ["Proforma", "Contract", "CommercialInvoice", "AccountingInvoice", "DeliveryForm", "InstallationForm", "Other"];
  const visibleTypes = initialType ? [initialType] : types;
  const counts = visibleTypes.map((t) => ({ type: t, count: documents.filter((d) => d.type === t).length }));
  const scopeDocuments = initialType ? documents.filter((document) => document.type === initialType) : documents;
  const documentsWithFiles = scopeDocuments.filter((document) => !!document.fileId).length;
  const liveDocumentCount = scopeDocuments.filter((document) => !!document.deliveryId || !!document.installationId || CONTENT_TYPES.includes(document.type)).length;
  const recentDocumentCount = scopeDocuments.filter((document) => {
    const time = new Date(document.uploadedAt).getTime();
    return Number.isFinite(time) && Date.now() - time <= 30 * 24 * 60 * 60 * 1000;
  }).length;
  const documentCustomerCount = new Set(scopeDocuments.map((document) => {
    const salesCase = cases.find((item) => item.id === document.salesCaseId);
    return document.companyId || salesCase?.customerId || "";
  }).filter(Boolean)).size;
  const heroTitle = initialType === "Proforma" ? "Proforma kontrol merkezi" : initialType === "Contract" ? "Sözleşme kontrol merkezi" : "Doküman envanteri";
  const heroDescription = initialType === "Proforma"
    ? "Revizyon, teklif durumu ve geçerlilik bağlamını ilk sayfa önizlemesiyle birlikte izleyin."
    : initialType === "Contract"
      ? "İmza, revizyon ve bağlı satış kaydını tek belge akışında takip edin."
      : "Ticari belgeleri, saha formlarını ve yüklenen dosyaları önizleme bağlamıyla birlikte yönetin.";

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

  const runCommercialInvoice = async (d: (typeof documents)[number], mode: "print" | "download") => {
    const loading = toast.loading("Ticari fatura hazırlanıyor…");
    try {
      const data = await loadProformaPrintData(proformaInput(d, ""));
      const rendered = commercialInvoiceDoc(data, printAssetBase());
      if (mode === "print") printOrWarn(rendered);
      else downloadPrintOrWarn(rendered, `Ticari-Fatura-${d.fileName}`, "Ticari fatura");
    } catch (err: any) {
      if (d.fileId) {
        if (mode === "print") await printUploadedDocument(d);
        else await downloadDocument(d);
        return;
      }
      toast.error("Ticari fatura oluşturulamadı", { description: err?.message ?? "Teklif verisi okunamadı." });
    } finally {
      toast.dismiss(loading);
    }
  };

  const printCommercialInvoice = (d: (typeof documents)[number]) => {
    void runCommercialInvoice(d, "print");
  };

  const downloadCommercialInvoice = (d: (typeof documents)[number]) => {
    void runCommercialInvoice(d, "download");
  };

  const deleteDocumentRecord = async (d: (typeof documents)[number]) => {
    if (deletingDocumentId) return;
    setDeletingDocumentId(d.id);
    try {
      if (d.source === "uploaded_file" && d.fileId) {
        await fileService.remove(d.fileId);
      } else if (d.type === "Proforma") {
        await documentService.deleteProforma(d.id);
      } else if (d.type === "Contract") {
        await documentService.deleteContract(d.id);
      } else if (d.type === "CommercialInvoice") {
        await documentService.deleteCommercialInvoice(d.id);
      } else {
        throw new Error("Bu belge türü bu ekrandan silinemez.");
      }
      toast.success(`${DOC_TYPE_LABELS[d.type]} silindi`, { description: d.fileName });
      setPendingDeleteDoc(null);
      await refresh();
    } catch (err: any) {
      toast.error(`${DOC_TYPE_LABELS[d.type]} silinemedi`, { description: err?.message ?? "API isteği başarısız oldu." });
    } finally {
      setDeletingDocumentId(null);
    }
  };

  return (
    <div className="space-y-5">
      <section className="premium-blueprint precision-corners overflow-hidden rounded-2xl border border-primary/20 bg-card p-5 shadow-sm">
        <div className="relative flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="font-mono text-[10px] font-semibold tracking-[0.2em] text-primary">BELGE KONTROL MERKEZİ</p>
            <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight sm:text-3xl">{heroTitle}</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{heroDescription}</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:min-w-[610px]">
            <InsightStat label={initialType ? DOC_TYPE_LABELS[initialType] : "Toplam"} value={scopeDocuments.length} icon={<Files />} />
            <InsightStat label="Son 30 Gün" value={recentDocumentCount} icon={<Clock3 />} tone="success" />
            <InsightStat label="Müşteri" value={documentCustomerCount} icon={<FileCheck2 />} />
            <InsightStat label={initialType ? "Canlı Kayıt" : "Canlı Belge"} value={liveDocumentCount || documentsWithFiles} icon={<Layers3 />} tone="success" />
          </div>
        </div>
      </section>

      {!initialType && (
        <div className="grid gap-3 lg:grid-cols-[1.65fr_1fr_.75fr]">
          {DOC_GROUPS.map((group) => (
            <Card key={group.title} className="overflow-hidden border-border/60 shadow-sm">
              <div className="border-b border-border/50 bg-muted/15 px-3 py-2.5"><p className="text-xs font-semibold">{group.title}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{group.description}</p></div>
              <CardContent className="flex flex-wrap gap-2 p-3">
                {group.types.map((type) => {
                  const count = counts.find((item) => item.type === type)?.count ?? 0;
                  return <button key={type} type="button" onClick={() => setDocType(type)} className={`flex min-w-[120px] flex-1 items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors ${docType === type ? "border-primary/30 bg-primary/5 text-primary" : "border-border/60 bg-card hover:bg-muted/40"}`}><span className="grid size-7 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">{DOC_ICONS[type]}</span><span className="min-w-0"><span className="block truncate text-[11px] font-medium">{DOC_TYPE_LABELS[type]}</span><span className="font-data text-[10px] text-muted-foreground">{count} kayıt</span></span></button>;
                })}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

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
          <Table className="min-w-[980px] table-fixed">
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="w-[34%]">Dosya ve müşteri</TableHead>
                <TableHead className="w-[10%]">Tip</TableHead>
                <TableHead className="w-[19%]">Belge Akışı</TableHead>
                <TableHead className="w-[8%]">Boyut</TableHead>
                <TableHead className="w-[11%]">Yükleyen</TableHead>
                <TableHead className="w-[10%]">Tarih</TableHead>
                <TableHead className="w-[8%] text-right">İşlem</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((d) => {
                const sc = cases.find((s) => s.id === d.salesCaseId);
                const companyId = sc?.customerId || d.companyId || "";
                const openable = CONTENT_TYPES.includes(d.type);
                const flowOffer = d.quoteId ? offers.find((offer) => offer.id === d.quoteId) : offers.filter((offer) => offer.salesCaseId === d.salesCaseId).sort((a, b) => b.revision - a.revision)[0];
                const signedAt = String(d.documentSnapshot?.signedAt ?? d.documentSnapshot?.signatureDate ?? "");
                return (
                  <TableRow
                    key={d.id}
                    className={`group ${openable ? "cursor-pointer" : ""}`}
                    onClick={openable ? () => setDetailDoc(d) : undefined}
                    onKeyDown={openable ? (e) => { if (e.key === "Enter") setDetailDoc(d); } : undefined}
                    tabIndex={openable ? 0 : undefined}
                    role={openable ? "button" : undefined}
                    aria-label={openable ? `${d.fileName} içeriğini aç` : undefined}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <DocumentSheetPreview document={d} />
                        <div className="min-w-0">
                          <div className="font-data text-[9px] font-semibold uppercase tracking-[0.12em] text-operation-blue">{DOC_TYPE_LABELS[d.type]}</div>
                          <div className="mt-1 truncate text-sm font-medium leading-tight">{d.fileName}</div>
                          <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                            {customerName(companyId) !== "—" ? customerName(companyId) : sc ? `#${sc.id.toUpperCase()}` : d.companyId ? "Firma dokümanı" : "—"}
                          </div>
                          <div className="mt-1.5 flex flex-wrap gap-1.5"><span className="chip chip-neutral">{d.fileId ? "Dosya mevcut" : d.deliveryId || d.installationId ? "Canlı saha formu" : "Canlı kayıt"}</span>{d.documentSnapshot && <span className="chip chip-info">Snapshot korumalı</span>}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell><StatusBadge status={d.type} /></TableCell>
                    <TableCell>
                      {flowOffer ? (
                        <div className="min-w-[145px] space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5"><span className="chip chip-neutral">R{flowOffer.revision}</span><StatusBadge status={flowOffer.status} /></div>
                          <div className="text-[10px] text-muted-foreground">{d.type === "Contract" ? signedAt ? `İmzalandı · ${signedAt.slice(0, 10)}` : "İmza durumu bekleniyor" : `${flowOffer.validityDays ?? 30} gün geçerli`}</div>
                        </div>
                      ) : <span className="text-xs text-muted-foreground">{d.fileId ? "Yüklenmiş belge" : "Canlı kayıt"}</span>}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums text-muted-foreground">{d.size}</TableCell>
                    <TableCell className="text-sm">{userName(d.uploadedBy)}</TableCell>
                    <TableCell className="text-sm tabular-nums text-muted-foreground">{d.uploadedAt}</TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1 justify-end">
                        {d.type === "Proforma" && (
                          <>
                            <EditProformaPricesDialog
                              document={d}
                              trigger={
                                <Button variant="ghost" size="icon" className="size-7" title="Proforma fiyatlarını düzenle">
                                  <BadgeDollarSign className="size-4 text-muted-foreground hover:text-primary" />
                                </Button>
                              }
                            />
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
                          <>
                            <Button variant="ghost" size="icon" className="size-7" title="Satış sözleşmesi yazdır / PDF"
                              onClick={() => printContract(d)}>
                              <Printer className="size-4 text-muted-foreground hover:text-primary" />
                            </Button>
                            <Button variant="ghost" size="icon" className="size-7" title="Satış sözleşmesi indir"
                              onClick={() => downloadContract(d)}>
                              <Download className="size-4 text-muted-foreground hover:text-primary" />
                            </Button>
                          </>
                        )}
                        {d.type === "CommercialInvoice" && (
                          <>
                            <Button variant="ghost" size="icon" className="size-7" title="Ticari fatura yazdır / PDF"
                              onClick={() => printCommercialInvoice(d)}>
                              <Printer className="size-4 text-muted-foreground hover:text-primary" />
                            </Button>
                            <Button variant="ghost" size="icon" className="size-7" title="Ticari fatura indir"
                              onClick={() => downloadCommercialInvoice(d)}>
                              <Download className="size-4 text-muted-foreground hover:text-primary" />
                            </Button>
                          </>
                        )}
                        {d.type !== "Proforma" && d.type !== "Contract" && d.type !== "CommercialInvoice" && (
                          <Button variant="ghost" size="icon" className="size-7" title="Yazdır / PDF"
                            onClick={() => void printDocument(d)}>
                            <Printer className="size-4 text-muted-foreground hover:text-primary" />
                          </Button>
                        )}
                        {!(d.deliveryId || d.installationId) && (
                          <Button variant="ghost" size="icon" className="size-7" title={openable ? "İçeriği göster" : "Önizle"}
                            onClick={() => (openable ? setDetailDoc(d) : setPreviewDoc(d))}>
                            <Eye className="size-4 text-muted-foreground hover:text-primary" />
                          </Button>
                        )}
                        {d.type !== "Proforma" && d.type !== "Contract" && d.type !== "CommercialInvoice" && !(d.deliveryId || d.installationId) && (
                          <Button variant="ghost" size="icon" className="size-7" title="İndir"
                            onClick={() => downloadDocument(d)}>
                            <Download className="size-4 text-muted-foreground hover:text-primary" />
                          </Button>
                        )}
                        {(d.source === "uploaded_file" || d.type === "Proforma" || d.type === "Contract" || d.type === "CommercialInvoice") && !(d.deliveryId || d.installationId) && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            title="Sil"
                            onClick={() => setPendingDeleteDoc(d)}
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
      <DocumentDetailDialog
        doc={detailDoc}
        onClose={() => setDetailDoc(null)}
        onPrint={detailPrint}
        onDownload={detailDownload}
        onOpenFile={(d) => { setDetailDoc(null); setPreviewDoc(d); }}
      />
      <AlertDialog open={!!pendingDeleteDoc} onOpenChange={(open) => !open && !deletingDocumentId && setPendingDeleteDoc(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pendingDeleteDoc?.source === "uploaded_file" ? "Yüklenen dosyayı sil?" : pendingDeleteDoc ? `${DOC_TYPE_LABELS[pendingDeleteDoc.type]} kaydını sil?` : "Belge kaydını sil?"}</AlertDialogTitle>
            <AlertDialogDescription><b>{pendingDeleteDoc?.fileName}</b> doküman listesinden kaldırılacak ve artık indirilemeyecek. Bağlı firma ve satış kartı kayıtları etkilenmez.</AlertDialogDescription>
          </AlertDialogHeader>
          {pendingDeleteDoc && <div className="rounded-lg border border-border/60 bg-muted/25 p-3 text-sm"><p className="font-medium">{DOC_TYPE_LABELS[pendingDeleteDoc.type]}</p><p className="mt-0.5 text-xs text-muted-foreground">{pendingDeleteDoc.uploadedAt} · {pendingDeleteDoc.size || "Boyut bilgisi yok"}</p></div>}
          <AlertDialogFooter><AlertDialogCancel disabled={Boolean(deletingDocumentId)}>Vazgeç</AlertDialogCancel><AlertDialogAction disabled={Boolean(deletingDocumentId)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={(event) => { event.preventDefault(); if (pendingDeleteDoc) void deleteDocumentRecord(pendingDeleteDoc); }}>{deletingDocumentId ? "Siliniyor…" : "Belgeyi Sil"}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
