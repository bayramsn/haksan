import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Clock, XCircle } from "lucide-react";
import { SALES_STAGE_LABELS } from "../../lib/mock";

const STATUS_META: Record<string, { cls: string; icon?: ReactNode }> = {
  lead: { cls: "bg-zinc-100 text-zinc-700 border-zinc-200" },
  sales: { cls: "bg-zinc-100 text-zinc-700 border-zinc-200" },
  call: { cls: "bg-blue-50 text-blue-700 border-blue-200" },
  visit: { cls: "bg-blue-50 text-blue-700 border-blue-200" },
  cancelled: { cls: "bg-red-50 text-red-700 border-red-200", icon: <XCircle className="size-3" /> },
  quote: { cls: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  proforma: { cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  contract: { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: <CheckCircle2 className="size-3" /> },
  payment_plan: { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: <CheckCircle2 className="size-3" /> },
  commercial_invoice: { cls: "bg-amber-50 text-amber-700 border-amber-200" },
  customs_approved: { cls: "bg-amber-50 text-amber-700 border-amber-200", icon: <CheckCircle2 className="size-3" /> },
  stock_picking: { cls: "bg-sky-50 text-sky-700 border-sky-200" },
  shipping: { cls: "bg-blue-50 text-blue-700 border-blue-200" },
  installation: { cls: "bg-brand-blue-soft text-brand-blue border-blue-200" },
  delivered: { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: <CheckCircle2 className="size-3" /> },
  Lead: { cls: "bg-zinc-100 text-zinc-700 border-zinc-200" },
  "Initial Contact": { cls: "bg-zinc-100 text-zinc-700 border-zinc-200" },
  "Requirement Analysis": { cls: "bg-blue-50 text-blue-700 border-blue-200" },
  "Offer Preparing": { cls: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  "Offer Sent": { cls: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  "Follow-up": { cls: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  "Offer Approved": { cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  "Proforma / Contract": { cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  Customs: { cls: "bg-amber-50 text-amber-700 border-amber-200" },
  Shipment: { cls: "bg-blue-50 text-blue-700 border-blue-200" },
  Installation: { cls: "bg-brand-blue-soft text-brand-blue border-blue-200" },
  Completed: { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: <CheckCircle2 className="size-3" /> },
  Lost: { cls: "bg-red-50 text-red-700 border-red-200", icon: <XCircle className="size-3" /> },
  active: { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: <CheckCircle2 className="size-3" /> },
  passive: { cls: "bg-zinc-100 text-zinc-600 border-zinc-200" },
  Available: { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: <CheckCircle2 className="size-3" /> },
  Reserved: { cls: "bg-amber-50 text-amber-700 border-amber-200", icon: <Clock className="size-3" /> },
  InTransit: { cls: "bg-sky-50 text-sky-700 border-sky-200", icon: <Clock className="size-3" /> },
  Sold: { cls: "bg-blue-50 text-blue-700 border-blue-200" },
  Inactive: { cls: "bg-zinc-100 text-zinc-600 border-zinc-200" },
  Pending: { cls: "bg-amber-50 text-amber-700 border-amber-200", icon: <Clock className="size-3" /> },
  "Request Opened": { cls: "bg-zinc-100 text-zinc-700 border-zinc-200" },
  Diagnosis: { cls: "bg-blue-50 text-blue-700 border-blue-200" },
  "Quote Needed": { cls: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  "Quote Sent": { cls: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  Approval: { cls: "bg-amber-50 text-amber-700 border-amber-200", icon: <Clock className="size-3" /> },
  Scheduled: { cls: "bg-amber-50 text-amber-700 border-amber-200" },
  "Service In Progress": { cls: "bg-sky-50 text-sky-700 border-sky-200", icon: <Clock className="size-3" /> },
  "Service Completed": { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: <CheckCircle2 className="size-3" /> },
  "Signed Form": { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: <CheckCircle2 className="size-3" /> },
  Closed: { cls: "bg-zinc-100 text-zinc-600 border-zinc-200", icon: <CheckCircle2 className="size-3" /> },
  Paid: { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: <CheckCircle2 className="size-3" /> },
  Overdue: { cls: "bg-red-50 text-red-700 border-red-200", icon: <AlertTriangle className="size-3" /> },
  Cancelled: { cls: "bg-zinc-100 text-zinc-600 border-zinc-200", icon: <XCircle className="size-3" /> },
  Approved: { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: <CheckCircle2 className="size-3" /> },
  Sent: { cls: "bg-blue-50 text-blue-700 border-blue-200" },
  Draft: { cls: "bg-zinc-100 text-zinc-600 border-zinc-200" },
  Rejected: { cls: "bg-red-50 text-red-700 border-red-200", icon: <XCircle className="size-3" /> },
  "Price Waiting": { cls: "bg-amber-50 text-amber-800 border-amber-200", icon: <Clock className="size-3" /> },
  "Budget Waiting": { cls: "bg-amber-50 text-amber-800 border-amber-200", icon: <Clock className="size-3" /> },
  "On Hold": { cls: "bg-zinc-100 text-zinc-700 border-zinc-200", icon: <Clock className="size-3" /> },
  Postponed: { cls: "bg-blue-50 text-blue-700 border-blue-200", icon: <Clock className="size-3" /> },
  Active: { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: <CheckCircle2 className="size-3" /> },
  "Out of Warranty": { cls: "bg-amber-50 text-amber-700 border-amber-200" },
  Decommissioned: { cls: "bg-zinc-100 text-zinc-600 border-zinc-200" },
};

const STATUS_LABELS: Record<string, string> = {
  ...SALES_STAGE_LABELS,
  active: "Aktif", passive: "Pasif", Available: "Hazır", Reserved: "Rezerve", InTransit: "Yolda", Sold: "Satıldı", Inactive: "Pasif", Pending: "Bekliyor",
  "Request Opened": "Servis Talep", Diagnosis: "Müşteri İletişim", "Quote Needed": "Teklif Gerekli", "Quote Sent": "Servis Teklifi", Approval: "Onay Bekliyor", Scheduled: "Planlandı",
  "Service In Progress": "Servis Devam Ediyor", "Service Completed": "Servis Tamamlandı", "Signed Form": "Tamamlandı Formu", Closed: "Kapandı", Paid: "Ödendi", Overdue: "Gecikmiş",
  Cancelled: "İptal", Approved: "Onaylı", Sent: "Gönderildi", Draft: "Taslak", Rejected: "Reddedildi", "Price Waiting": "Fiyat Bekleniyor", "Budget Waiting": "Bütçe Bekleniyor",
  "On Hold": "Askıya Alındı", Postponed: "Ertelendi", Active: "Aktif", "Out of Warranty": "Garanti Dışı", Decommissioned: "Devre Dışı", Proforma: "Proforma", Contract: "Sözleşme",
  CommercialInvoice: "Ticari Fatura", AccountingInvoice: "Muhasebe Faturası", DeliveryForm: "Teslim Formu", InstallationForm: "Kurulum Formu", Other: "Diğer",
};

export function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? { cls: "bg-brand-blue-soft text-brand-blue border-blue-200" };
  return (
    <span data-slot="status-badge" className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] ${meta.cls}`}>
      {meta.icon}
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}
