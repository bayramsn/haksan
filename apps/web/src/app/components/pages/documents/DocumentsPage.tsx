import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle } from "../../ui/card";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import { StatusBadge } from "../../Layout";
import { DocumentUploadDialog } from "../../dialogs/DocumentUploadDialog";
import { DocumentPreviewDialog } from "../../dialogs/DocumentPreviewDialog";
import { DocumentDetailDialog } from "../../dialogs/DocumentDetailDialog";
import { CreateProformaDialog } from "../../dialogs/CreateProformaDialog";
import { QuickProformaDialog } from "../../dialogs/QuickProformaDialog";
import { QuickContractDialog } from "../../dialogs/QuickContractDialog";
import { EditProformaPricesDialog } from "../../dialogs/EditProformaPricesDialog";
import { EditContractPricesDialog } from "../../dialogs/EditContractPricesDialog";
import { CreateContractDialog } from "../../dialogs/CreateContractDialog";
import { LinkCommercialDocumentDialog } from "../../dialogs/LinkCommercialDocumentDialog";
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
  Search, Upload, Download, Printer, Eye, Plus, Trash2,
  Files, Layers3, FileCheck2, BadgeDollarSign, Link2, Route, Unlink, ArrowRight,
  Folder, FolderOpen, Zap,
} from "lucide-react";
import {
  printAssetBase, proformaDoc, commercialInvoiceDoc, contractDoc, installationFormDoc, loadContractPrintData, loadProformaPrintData, PROFORMA_NOTE_OPTIONS, trShortDate,
  contractFilename, proformaFilename,
} from "../../../lib/print";
import { printOrWarn, downloadPrintOrWarn } from "../../../lib/pageHelpers";

const DOC_TYPE_LABELS: Record<DocumentItem["type"], string> = {
  Proforma: "Proforma",
  Contract: "Sözleşme",
  CommercialInvoice: "Ticari fatura",
  AccountingInvoice: "Muhasebe faturası",
  ExternalQuote: "Dış teklif",
  DeliveryForm: "Teslim formu",
  InstallationForm: "Kurulum formu",
  Other: "Diğer",
};

const DOC_GROUPS: Array<{ title: string; description: string; types: DocumentItem["type"][] }> = [
  { title: "Ticari Belgeler", description: "Satış ve finans kayıtları", types: ["Proforma", "Contract", "CommercialInvoice", "AccountingInvoice", "ExternalQuote"] },
  { title: "Saha Formları", description: "Teslim ve kurulum kanıtları", types: ["DeliveryForm", "InstallationForm"] },
  { title: "Diğer Dosyalar", description: "Genel ekler ve arşiv", types: ["Other"] },
];

function DocumentFolderButton({
  type,
  count,
  active,
  onClick,
}: {
  type: DocumentItem["type"];
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = active ? FolderOpen : Folder;
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-controls="document-folder-contents"
      onClick={onClick}
      className="group relative min-w-0 pt-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2"
    >
      <span
        aria-hidden="true"
        className={`absolute left-px top-0 h-4 w-[42%] rounded-t-[7px] border border-b-0 transition-colors ${active ? "border-primary/35 bg-primary/15" : "border-border/70 bg-slate-100 group-hover:border-primary/25 group-hover:bg-primary/10"}`}
      />
      <span
        className={`relative flex min-h-[102px] flex-col justify-between rounded-b-xl rounded-tr-xl border px-3 py-3 transition duration-200 group-active:translate-y-px ${active ? "border-primary/35 bg-primary/[0.07] shadow-[0_10px_24px_-18px_rgba(11,36,83,.8)]" : "border-border/70 bg-white group-hover:-translate-y-0.5 group-hover:border-primary/25 group-hover:shadow-[0_10px_24px_-20px_rgba(11,36,83,.7)]"}`}
      >
        <span className="flex items-start justify-between gap-2">
          <span className={`grid size-8 place-items-center rounded-lg ${active ? "bg-primary text-white" : "bg-primary/8 text-primary"}`}>
            <Icon className="size-4" />
          </span>
          <span className="font-data text-[10px] tabular-nums text-muted-foreground">{count} kayıt</span>
        </span>
        <span className="mt-3 block truncate text-xs font-semibold tracking-tight">{DOC_TYPE_LABELS[type]}</span>
      </span>
    </button>
  );
}

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
  title = "Bağlı belge envanteri",
  description = "Her belgeyi kaynak teklif, fırsat, firma veya saha kaydıyla birlikte yönetin",
  onOpenOpportunity,
  onOpenOffer,
  onOpenCustomer,
  onOpenPayment,
  onOpenServiceRequest,
  onOpenAccountingInvoices,
}: {
  initialType?: DocumentItem["type"];
  initialQuery?: string;
  title?: string;
  description?: string;
  onOpenOpportunity?: (salesCaseId: string) => void;
  onOpenOffer?: (query: string) => void;
  onOpenCustomer?: (customerId: string) => void;
  onOpenPayment?: (query: string) => void;
  onOpenServiceRequest?: (query: string) => void;
  onOpenAccountingInvoices?: (query?: string) => void;
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
    users,
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
      // Dosya adı: Proforma_<bölüm-belge no>_<firma>_<makine>. Kayıtlı firması
      // olmayan hızlı proformada unvan serbest metinden (companyNameText) gelir.
      else downloadPrintOrWarn(rendered, proformaFilename(data, {
        division: resolveDocContext(d).offer?.businessLine,
        company: d.companyNameText,
      }), "Proforma");
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
        users,
      });
      const rendered = contractDoc(data, printAssetBase());
      if (mode === "print") printOrWarn(rendered);
      // Dosya adı: Sozlesme_<bölüm-belge no>_<firma>_<makine>
      else downloadPrintOrWarn(rendered, contractFilename(data, {
        division: ctx.offer?.businessLine,
        company: d.companyNameText,
      }), "Sözleşme");
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
  const types: DocumentItem["type"][] = ["Proforma", "Contract", "CommercialInvoice", "AccountingInvoice", "ExternalQuote", "DeliveryForm", "InstallationForm", "Other"];
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
  const linkedDocumentCount = scopeDocuments.filter((document) =>
    Boolean(document.quoteId || document.salesCaseId || document.companyId || document.deliveryId || document.installationId || document.serviceRequestId || document.paymentId)
  ).length;
  const directQuoteLinkCount = scopeDocuments.filter((document) => Boolean(document.quoteId)).length;
  const commercialTypes = new Set<DocumentItem["type"]>(["Proforma", "Contract", "CommercialInvoice"]);
  const reviewNeededCount = scopeDocuments.filter((document) =>
    commercialTypes.has(document.type)
    && !document.quoteId
    && !document.paymentId
    // Hızlı proforma bilerek teklifsizdir; eksik bağlantı olarak sayılmaz.
    && !document.documentSnapshot?.standalone
  ).length;
  const routeSteps: Array<{ label: string; count: number; type?: DocumentItem["type"] }> = [
    { label: "Teklif", count: offers.length },
    { label: "Proforma", count: documents.filter((document) => document.type === "Proforma").length, type: "Proforma" },
    { label: "Sözleşme", count: documents.filter((document) => document.type === "Contract").length, type: "Contract" },
    { label: "Ticari fatura", count: documents.filter((document) => document.type === "CommercialInvoice").length, type: "CommercialInvoice" },
  ];
  const heroTitle = initialType === "Proforma" ? "Proforma kontrol merkezi" : initialType === "Contract" ? "Sözleşme kontrol merkezi" : "Ticari belge merkezi";
  const heroDescription = initialType === "Proforma"
    ? "Revizyon, teklif durumu ve geçerlilik bağlamını ilk sayfa önizlemesiyle birlikte izleyin."
    : initialType === "Contract"
      ? "İmza, revizyon ve bağlı satış kaydını tek belge akışında takip edin."
      : "Tekliften faturaya uzanan belge rotasını; satış kartı, firma ve saha kayıtlarından koparmadan yönetin.";
  const activeFolderType = docType === "all" ? null : docType as DocumentItem["type"];
  const activeFolderCount = activeFolderType
    ? counts.find((item) => item.type === activeFolderType)?.count ?? 0
    : scopeDocuments.length;
  const inventoryTitle = initialType
    ? title
    : activeFolderType
      ? `${DOC_TYPE_LABELS[activeFolderType]} klasörü`
      : title;
  const inventoryDescription = initialType
    ? description
    : activeFolderType
      ? `${DOC_TYPE_LABELS[activeFolderType]} türündeki ${activeFolderCount} kayıt gösteriliyor. Tüm belgelere dönmek için klasör seçimini temizleyin.`
      : description;

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
      const exactOffer = d.quoteId ? offers.find((offer) => offer.id === d.quoteId) : undefined;
      const inferredOffer = exactOffer ?? offers
        .filter((offer) => (d.salesCaseId && offer.salesCaseId === d.salesCaseId) || (companyId && offer.companyId === companyId))
        .sort((a, b) => b.revision - a.revision)[0];
      if (docType !== "all" && d.type !== docType) return false;
      const needle = q.toLocaleLowerCase("tr-TR").trim();
      if (!needle) return true;
      return [
        d.fileName,
        DOC_TYPE_LABELS[d.type],
        customerName(companyId),
        d.companyNameText,
        inferredOffer?.quoteNo,
        inferredOffer ? `R${inferredOffer.revision}` : "",
        sc?.requestedProduct,
        sc?.requestedModel,
        sc?.id,
        userName(d.uploadedBy),
        d.paymentId,
        d.serviceRequestId,
      ].some((value) => (value ?? "").toLocaleLowerCase("tr-TR").includes(needle));
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
            <InsightStat label="Kaynağa Bağlı" value={linkedDocumentCount} icon={<Link2 />} tone="success" />
            <InsightStat label="Teklife Bağlı" value={directQuoteLinkCount} icon={<FileCheck2 />} />
            <InsightStat label="Bağlantı İncele" value={reviewNeededCount} icon={reviewNeededCount ? <Unlink /> : <Layers3 />} tone={reviewNeededCount ? undefined : "success"} />
          </div>
        </div>
      </section>

      {!initialType && (
        <section className="overflow-hidden rounded-xl border border-[#0b2453]/15 bg-white shadow-sm" aria-label="Ticari belge rotası">
          <div className="flex flex-col gap-2 border-b border-border/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2 font-data text-[10px] font-semibold uppercase tracking-[0.16em] text-primary"><Route className="size-3.5" /> Ticari belge rotası</div>
              <p className="mt-1 text-xs text-muted-foreground">Aynı fırsata bağlı çıktılar soldan sağa ilerler; satırdaki kaynak düğmeleri gerçek kaydı açar.</p>
            </div>
            <div className="text-[11px] text-muted-foreground">Son 30 gün <b className="text-foreground">{recentDocumentCount}</b> · {documentCustomerCount} firma · {liveDocumentCount || documentsWithFiles} canlı/dosyalı kayıt</div>
          </div>
          <div className="relative grid grid-cols-2 gap-2 p-3 sm:grid-cols-4 sm:gap-3 sm:p-4">
            <span className="pointer-events-none absolute left-[12%] right-[12%] top-[38px] hidden h-px bg-slate-200 sm:block" aria-hidden="true" />
            {routeSteps.map((step, index) => (
              <button
                key={step.label}
                type="button"
                onClick={() => step.type ? setDocType(step.type) : onOpenOffer?.("")}
                className={`relative z-10 rounded-lg border px-3 py-3 text-left transition hover:-translate-y-px hover:border-primary/35 hover:shadow-sm ${step.type && docType === step.type ? "border-primary/35 bg-primary/5" : "border-border/70 bg-white"}`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="grid size-8 place-items-center rounded-full border-2 border-primary/20 bg-white text-primary">{index + 1}</span>
                  {index < routeSteps.length - 1 && <ArrowRight className="size-4 text-slate-300 sm:hidden" />}
                </span>
                <span className="mt-2 block text-xs font-semibold">{step.label}</span>
                <span className="mt-0.5 block font-data text-[10px] text-muted-foreground">{step.count} kayıt</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {!initialType && (
        <section className="overflow-hidden rounded-xl border border-[#0b2453]/15 bg-slate-50/65 shadow-sm" aria-labelledby="document-folders-title">
          <div className="flex flex-col gap-3 border-b border-border/60 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 id="document-folders-title" className="text-sm font-semibold tracking-tight">Belge klasörleri</h3>
              <p className="mt-0.5 text-[11px] text-muted-foreground">Bir klasör seçin; içindeki belgeler aşağıdaki envanterde açılsın.</p>
            </div>
            <Button
              type="button"
              size="sm"
              variant={docType === "all" ? "default" : "outline"}
              className="h-8 justify-center gap-1.5"
              aria-pressed={docType === "all"}
              aria-controls="document-folder-contents"
              onClick={() => setDocType("all")}
            >
              {docType === "all" ? <FolderOpen className="size-3.5" /> : <Folder className="size-3.5" />}
              Tüm belgeler
              <span className="font-data text-[10px] opacity-75">{documents.length}</span>
            </Button>
          </div>
          <div className="grid gap-3 p-3 sm:p-4 lg:grid-cols-[1.65fr_1fr_.75fr]">
            {DOC_GROUPS.map((group) => (
              <section key={group.title} className="min-w-0 rounded-xl border border-border/60 bg-white/90 p-3" aria-label={group.title}>
                <div className="mb-2.5">
                  <p className="text-xs font-semibold">{group.title}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{group.description}</p>
                </div>
                <div className={`grid gap-2 ${group.types.length >= 4 ? "grid-cols-2 xl:grid-cols-3" : "grid-cols-2 lg:grid-cols-1 xl:grid-cols-2"}`}>
                  {group.types.map((type) => (
                    <DocumentFolderButton
                      key={type}
                      type={type}
                      count={counts.find((item) => item.type === type)?.count ?? 0}
                      active={docType === type}
                      onClick={() => type === "AccountingInvoice" && onOpenAccountingInvoices
                        ? onOpenAccountingInvoices()
                        : setDocType(type)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </section>
      )}

      <Card id="document-folder-contents" className="border-border/60 shadow-sm overflow-hidden" tabIndex={-1}>
        <CardHeader className="flex flex-col gap-3 pb-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <CardTitle className="tracking-tight">{inventoryTitle}</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">{inventoryDescription}</p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap lg:w-auto lg:justify-end">
            <div className="relative w-full sm:w-64">
              <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Belge, teklif, firma, ürün..." className="pl-9 h-9 bg-white" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            {!initialType && (
              <FilterPopover
                filters={[{ label: "Tip", value: docType, onChange: setDocType, options: [{ value: "all", label: "Tüm belgeler" }, ...types.map((t) => ({ value: t, label: DOC_TYPE_LABELS[t] }))] }]}
              />
            )}
            <ExportExcelButton path="/exports/documents" filename="dokumanlar.xlsx" className="h-9 justify-center" />
            {!initialType && (
              <CreateProformaDialog
                trigger={<Button size="sm" variant="outline" className="h-9 justify-center gap-1"><Plus className="size-4" /> Proforma</Button>}
              />
            )}
            <QuickProformaDialog
              trigger={
                <Button size="sm" variant="outline" className="h-9 justify-center gap-1" title="Teklif açmadan proforma kes">
                  <Zap className="size-4" /> Hızlı Proforma
                </Button>
              }
            />

            {!initialType && (
              <CreateContractDialog
                trigger={<Button size="sm" variant="outline" className="h-9 justify-center gap-1"><Plus className="size-4" /> Sözleşme</Button>}
              />
            )}
            <QuickContractDialog
              trigger={
                <Button size="sm" variant="outline" className="h-9 justify-center gap-1" title="Teklif açmadan sözleşme kes">
                  <Zap className="size-4" /> Hızlı Sözleşme
                </Button>
              }
            />
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
                defaultType={initialType ?? activeFolderType ?? undefined}
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
                <TableHead className="w-[19%]">Kaynak ve akış</TableHead>
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
                const openable = CONTENT_TYPES.includes(d.type) && !d.paymentId;
                const exactOffer = d.quoteId ? offers.find((offer) => offer.id === d.quoteId) : undefined;
                // salesCaseId boşken eşleştirme yapılmamalı: aksi halde satış kartı olmayan
                // belgeler (ör. hızlı proforma) yine satış kartsız rastgele bir teklife bağlıymış gibi görünür.
                const flowOffer = exactOffer ?? (!d.salesCaseId || d.paymentId || d.serviceRequestId || d.type === "AccountingInvoice" ? undefined : offers.filter((offer) => offer.salesCaseId === d.salesCaseId).sort((a, b) => b.revision - a.revision)[0]);
                const signedAt = String(d.documentSnapshot?.signedAt ?? d.documentSnapshot?.signatureDate ?? "");
                const relationLabel = exactOffer
                  ? "Teklife doğrudan bağlı"
                  : d.paymentId
                    ? "Kasa hareketine bağlı"
                    : d.serviceRequestId
                      ? "Servis talebine bağlı"
                      : d.type === "AccountingInvoice"
                        ? "Muhasebe kaydına bağlı"
                        : flowOffer
                          ? "Fırsattan eşleştirildi"
                          : d.deliveryId || d.installationId
                            ? "Canlı saha kaydı"
                            : companyId
                              ? "Firma kaydına bağlı"
                              // Hızlı proforma bilerek teklifsizdir; eksik bağlantı gibi gösterilmemeli.
                              : d.documentSnapshot?.standalone
                                ? "Teklifsiz hızlı proforma"
                                : "Bağlantı gerekli";
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
                          {companyId && customerName(companyId) !== "—" && onOpenCustomer ? (
                            <button type="button" className="mt-0.5 block max-w-full truncate text-left text-[11px] text-primary hover:underline" onClick={(event) => { event.stopPropagation(); onOpenCustomer(companyId); }}>
                              {customerName(companyId)}
                            </button>
                          ) : (
                            <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                              {customerName(companyId) !== "—" ? customerName(companyId) : d.companyNameText ? d.companyNameText : sc ? `#${sc.id.toUpperCase()}` : d.companyId ? "Firma dokümanı" : "—"}
                            </div>
                          )}
                          <div className="mt-1.5 flex flex-wrap gap-1.5"><span className="chip chip-neutral">{d.fileId ? "Dosya mevcut" : d.deliveryId || d.installationId ? "Canlı saha formu" : "Canlı kayıt"}</span>{d.documentSnapshot && <span className="chip chip-info">Snapshot korumalı</span>}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell><StatusBadge status={d.type} /></TableCell>
                    <TableCell>
                      {flowOffer ? (
                        <div className="min-w-[145px] space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {onOpenOffer ? (
                              <button type="button" className="chip chip-info hover:underline" onClick={(event) => { event.stopPropagation(); onOpenOffer(flowOffer.quoteNo); }}>{flowOffer.quoteNo} · R{flowOffer.revision}</button>
                            ) : <span className="chip chip-neutral">R{flowOffer.revision}</span>}
                            <StatusBadge status={flowOffer.status} />
                          </div>
                          <div className="text-[10px] text-muted-foreground">{d.type === "Contract" ? signedAt ? `İmzalandı · ${signedAt.slice(0, 10)}` : "İmza durumu bekleniyor" : `${flowOffer.validityDays ?? 30} gün geçerli`}</div>
                          <div className="flex flex-wrap items-center gap-1">
                            <span className={`chip ${exactOffer ? "chip-success" : "chip-neutral"}`}>{relationLabel}</span>
                            {sc && onOpenOpportunity && <button type="button" className="chip chip-neutral hover:underline" onClick={(event) => { event.stopPropagation(); onOpenOpportunity(sc.id); }}>Fırsatı aç</button>}
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          <span className={`chip ${relationLabel === "Bağlantı gerekli" ? "chip-destructive" : "chip-neutral"}`}>{relationLabel}</span>
                          {sc && onOpenOpportunity && <button type="button" className="block text-[10px] text-primary hover:underline" onClick={(event) => { event.stopPropagation(); onOpenOpportunity(sc.id); }}>Fırsatı aç</button>}
                          {d.paymentId && onOpenPayment && <button type="button" className="block text-[10px] text-primary hover:underline" onClick={(event) => { event.stopPropagation(); onOpenPayment(d.paymentId!); }}>Kasa kaydını aç</button>}
                          {d.serviceRequestId && onOpenServiceRequest && <button type="button" className="block text-[10px] text-primary hover:underline" onClick={(event) => { event.stopPropagation(); onOpenServiceRequest(d.serviceRequestId!); }}>Servis talebini aç</button>}
                          {d.type === "AccountingInvoice" && onOpenAccountingInvoices && <button type="button" className="block text-[10px] text-primary hover:underline" onClick={(event) => { event.stopPropagation(); onOpenAccountingInvoices(d.fileName); }}>Muhasebe kaydını aç</button>}
                          {commercialTypes.has(d.type) && !d.quoteId && !d.paymentId && d.fileId && (
                            <div onClick={(event) => event.stopPropagation()}>
                              <LinkCommercialDocumentDialog
                                document={d}
                                trigger={<Button variant="link" size="sm" className="h-auto p-0 text-[10px]">Bağlantıyı tamamla</Button>}
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums text-muted-foreground">{d.size}</TableCell>
                    <TableCell className="text-sm">{userName(d.uploadedBy)}</TableCell>
                    <TableCell className="text-sm tabular-nums text-muted-foreground">{d.uploadedAt}</TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1 justify-end">
                        {d.type === "Proforma" && (
                          <>
                            {/* Teklife bağlı proformada yalnızca fiyat düzenlenir; hızlı
                                proformanın kalemleri belgeye ait olduğu için tam düzenleyici açılır. */}
                            {d.quoteId ? (
                              <EditProformaPricesDialog
                                document={d}
                                trigger={
                                  <Button variant="ghost" size="icon" className="size-7" title="Proforma fiyatlarını düzenle">
                                    <BadgeDollarSign className="size-4 text-muted-foreground hover:text-primary" />
                                  </Button>
                                }
                              />
                            ) : (
                              <QuickProformaDialog
                                document={d}
                                trigger={
                                  <Button variant="ghost" size="icon" className="size-7" title="Hızlı proformayı düzenle">
                                    <Zap className="size-4 text-muted-foreground hover:text-primary" />
                                  </Button>
                                }
                              />
                            )}
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
                            {/* Teklife bağlı sözleşmede yalnızca fiyat düzenlenir — onaylı
                                teklif kilitli olduğu hâlde imza masasında fiyat pazarlığa
                                açıktır; hızlı sözleşmenin kalemleri ve şartları belgeye ait
                                olduğu için tam düzenleyici açılır. */}
                            {d.quoteId ? (
                              <EditContractPricesDialog
                                document={d}
                                trigger={
                                  <Button variant="ghost" size="icon" className="size-7" title="Sözleşme fiyatlarını düzenle">
                                    <BadgeDollarSign className="size-4 text-muted-foreground hover:text-primary" />
                                  </Button>
                                }
                              />
                            ) : (
                              <QuickContractDialog
                                document={d}
                                trigger={
                                  <Button variant="ghost" size="icon" className="size-7" title="Hızlı sözleşmeyi düzenle">
                                    <Zap className="size-4 text-muted-foreground hover:text-primary" />
                                  </Button>
                                }
                              />
                            )}
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
                        {d.type === "CommercialInvoice" && !d.paymentId && (
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
                        {(d.type !== "Proforma" && d.type !== "Contract" && d.type !== "CommercialInvoice" || Boolean(d.paymentId)) && (
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
                        {(d.type !== "Proforma" && d.type !== "Contract" && d.type !== "CommercialInvoice" || Boolean(d.paymentId)) && !(d.deliveryId || d.installationId) && (
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
                  <TableCell colSpan={7} className="py-10 text-center">
                    <div className="mx-auto flex max-w-lg flex-col items-center gap-3">
                      <div className="grid size-11 place-items-center rounded-full bg-muted text-muted-foreground"><Files className="size-5" /></div>
                      <div>
                        <p className="text-sm font-medium text-foreground">Bu görünümde belge bulunamadı</p>
                        <p className="mt-1 text-xs text-muted-foreground">Filtreyi temizleyin veya belgeyi doğrudan kaynak teklif/fırsata bağlı oluşturarak akışı başlatın.</p>
                      </div>
                      <div className="flex flex-wrap justify-center gap-2">
                        {(q || docType !== "all") && <Button variant="outline" size="sm" onClick={() => { setQ(""); setDocType(initialType ?? "all"); }}>Filtreyi temizle</Button>}
                        {docType === "AccountingInvoice" && onOpenAccountingInvoices && <Button size="sm" onClick={() => onOpenAccountingInvoices()}>Muhasebe faturalarına git</Button>}
                        {(docType === "Proforma" || initialType === "Proforma") && <CreateProformaDialog trigger={<Button size="sm"><Plus className="mr-1 size-4" /> Proforma oluştur</Button>} />}
                        {(docType === "Contract" || initialType === "Contract") && <CreateContractDialog trigger={<Button size="sm"><Plus className="mr-1 size-4" /> Sözleşme oluştur</Button>} />}
                        {docType !== "Proforma" && docType !== "Contract" && initialType !== "Proforma" && initialType !== "Contract" && (
                          <DocumentUploadDialog defaultType={docType === "all" ? undefined : docType as DocumentItem["type"]} trigger={<Button size="sm"><Upload className="mr-1 size-4" /> Kaynağa bağlı dosya yükle</Button>} />
                        )}
                      </div>
                    </div>
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
        onOpenOpportunity={onOpenOpportunity}
        onOpenOffer={onOpenOffer}
        onOpenCustomer={onOpenCustomer}
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
