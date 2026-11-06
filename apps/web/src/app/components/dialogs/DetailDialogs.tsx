import { CompanyNotesCard } from "../shared/CompanyNotesCard";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "../ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Button } from "../ui/button";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { SortableTableHead, useSortableRows, type SortState, type SortValue } from "../ui/sortable-table";
import {
  Phone, Smartphone, Mail, MapPin, Building2, Star, Globe, Hash, Briefcase,
  FileText, FileSignature, Receipt, Wallet, Cpu, Wrench, ChevronRight, User as UserIcon,
  Plus, Pencil, Trash2, CalendarPlus,
} from "lucide-react";
import {
  Customer, Contact, FirmType, SalesCase, Offer, Machine, DocumentItem, ServiceRequest, Payment,
  salesStageLabel,
} from "../../lib/mock";
import { useStore } from "../../lib/store";
import { openInMaps } from "../../lib/geo";
import { StatusBadge } from "../shared/StatusBadge";
import { CompanyFinancePanel } from "../shared/CompanyFinancePanel";
import { ActivityDetailDialog, canViewStandaloneActivities, ConvertActivityToOpportunity, NonOpportunityBadge, isStandaloneActivity } from "../shared/StandaloneActivity";
import { CreateCaseDialog, CreateContactDialog, EditContactDialog, EditCustomerDialog, LogActivityDialog } from "./CreateDialogs";
import { CreateContractDialog } from "./CreateContractDialog";
import { CreateProformaDialog } from "./CreateProformaDialog";
import { QuoteDialog } from "./QuoteDialog";
import { useAuth } from "../../../lib/auth";
import { toast } from "sonner";
import {
  contactQueryKeys,
  invalidateContactQueries,
  loadAllCompanyContacts,
  type ContactQueryScope,
} from "../../lib/contactServerData";
import { useCompanyDetail } from "../../lib/companyServerData";

// ───────────────────────── helpers ─────────────────────────

const initials = (n: string) =>
  n.split(" ").slice(0, 2).map((p) => p[0]).join("").toUpperCase();

const FIRM_TYPE_LABEL: Record<FirmType, string> = {
  customer: "Müşteri",
  supplier_customer: "Tedarikçi + Müşteri",
  supplier: "Tedarikçi",
  competitor: "Rakip",
};

const FIRM_TYPE_COLOR: Record<FirmType, string> = {
  customer: "bg-blue-50 text-blue-700 border-blue-200",
  supplier_customer: "bg-brand-blue-soft text-brand-blue border-blue-200",
  supplier: "bg-amber-50 text-amber-700 border-amber-200",
  competitor: "bg-rose-50 text-rose-700 border-rose-200",
};

const ADDRESS_TYPE_LABELS: Record<string, string> = {
  office: "Ofis",
  factory: "Fabrika",
  work_area: "Çalışma Alanı",
  shipping: "Sevkiyat",
  billing: "Fatura",
  other: "Diğer",
};

const fmtMoney = (n: number, cur: string) => `${n.toLocaleString("tr-TR")} ${cur}`;

const createdByLabel = (item: { createdByName?: string | null; createdByEmail?: string | null }) =>
  item.createdByName || item.createdByEmail || "";

const createdMeta = (item: { createdAt?: string; createdByName?: string | null; createdByEmail?: string | null }) =>
  [createdByLabel(item), item.createdAt].filter(Boolean).join(" · ");

/** Sum amounts grouped by currency, rendered as "170.000 USD · 50.000 EUR". */
function sumByCurrency(items: Array<{ amount: number; currency: string }>): string {
  const totals = new Map<string, number>();
  for (const it of items) totals.set(it.currency, (totals.get(it.currency) ?? 0) + it.amount);
  if (totals.size === 0) return "—";
  return Array.from(totals.entries()).map(([cur, n]) => fmtMoney(n, cur)).join(" · ");
}

function Stat({ icon, label, value, accent, onClick }: { icon: React.ReactNode; label: string; value: React.ReactNode; accent?: string; onClick?: () => void }) {
  const body = (
    <>
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground whitespace-nowrap">
        <span className={`shrink-0 ${accent ?? "text-muted-foreground"}`}>{icon}</span>
        {label}
      </div>
      <div className="mt-1 text-xl leading-none tabular-nums">{value}</div>
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="group text-left rounded-lg border border-border/60 bg-white px-3 py-2.5 transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        {body}
      </button>
    );
  }
  return (
    <div className="rounded-lg border border-border/60 bg-white px-3 py-2.5">
      {body}
    </div>
  );
}

function Field({ icon, label, value }: { icon?: React.ReactNode; label: string; value?: React.ReactNode }) {
  if (value === undefined || value === null || value === "" || value === "—") return null;
  return (
    <div className="flex items-start gap-2.5">
      {icon && <div className="text-muted-foreground mt-0.5">{icon}</div>}
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-sm break-words">{value}</div>
      </div>
    </div>
  );
}

function EmptyRow({ cols, text }: { cols: number; text: string }) {
  return (
    <TableRow>
      <TableCell colSpan={cols} className="text-center py-8 text-sm text-muted-foreground">{text}</TableCell>
    </TableRow>
  );
}

/**
 * Tablo başına kolon sıralaması. Firma penceresi erken `return null` yaptığı ve
 * özet pop-up'ı tabloları koşullu bastığı için hook burada, tablo başına çağrılır.
 */
function SortRows<T, K extends string>({ rows, by, children }: {
  rows: readonly T[];
  by: Record<K, (row: T) => SortValue>;
  children: (s: { sorted: T[]; sort: SortState<K>; toggle: (key: K) => void }) => React.ReactNode;
}) {
  return <>{children(useSortableRows(rows, by))}</>;
}

const paymentTypeLabel = (p: Payment) =>
  p.paymentType === "received" ? "Tahsilat" : p.direction === "out" ? "Ödeme" : "Beklenen";

const CONTACT_SORT = {
  name: (k: Contact) => k.name,
  title: (k: Contact) => k.title,
  contact: (k: Contact) => k.phone || k.email,
};
const CASE_SORT = {
  product: (s: SalesCase) => s.requestedProduct,
  amount: (s: SalesCase) => s.estimatedAmount,
  stage: (s: SalesCase) => salesStageLabel(s.stage),
  date: (s: SalesCase) => s.createdAt,
};
const OFFER_SORT = {
  no: (o: Offer) => o.quoteNo,
  amount: (o: Offer) => o.amount,
  status: (o: Offer) => o.status,
  date: (o: Offer) => o.date,
};
const MACHINE_SORT = {
  serial: (m: Machine) => m.serialNumber,
  model: (m: Machine) => m.model,
  installed: (m: Machine) => m.installationDate,
  warranty: (m: Machine) => m.warrantyEnd,
  status: (m: Machine) => m.status,
};

// ───────────────────────── Company popup ─────────────────────────

/**
 * Firma pop-up'ından doğrudan aksiyon almayı sağlar. Satış kartı ve teklif
 * firmayı ön seçili alır; proforma ve sözleşme bir TEKLİFE bağlandığı için
 * firmanın en yeni teklifi ön seçili gelir, teklifi yoksa diyalogdaki seçici
 * kullanılır.
 */
function CompanyQuickActions({
  customer,
  latestQuoteId,
}: {
  customer: Customer;
  latestQuoteId?: string;
}) {
  const { hasPermission } = useAuth();
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [proformaOpen, setProformaOpen] = useState(false);
  const [contractOpen, setContractOpen] = useState(false);

  const canOpportunity = hasPermission("opportunities.create");
  const canActivity = hasPermission("activities.create");
  const canQuote = hasPermission("quotes.create");
  const canProforma = hasPermission("proformas.create");
  const canContract = hasPermission("contracts.create");
  if (!canOpportunity && !canActivity && !canQuote && !canProforma && !canContract) return null;

  return (
    <div className="mt-4 grid grid-cols-1 gap-2 rounded-lg border border-primary/15 bg-primary/[0.03] px-3 py-2.5 min-[420px]:grid-cols-2 sm:flex sm:flex-wrap sm:items-center">
      <span className="font-data text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground min-[420px]:col-span-2 sm:col-auto sm:mr-1">
        Hızlı aksiyon
      </span>

      {canOpportunity && (
        <CreateCaseDialog
          defaultCustomerId={customer.id}
          trigger={
            <Button size="sm" variant="outline" className="min-h-11 w-full justify-start gap-1.5 whitespace-normal bg-white text-xs sm:h-8 sm:min-h-0 sm:w-auto sm:justify-center sm:whitespace-nowrap">
              <Briefcase className="size-3.5" /> Satış Kartı
            </Button>
          }
        />
      )}

      {canActivity && (
        <LogActivityDialog
          customerId={customer.id}
          defaultKind="customer_visit"
          trigger={
            <Button size="sm" variant="outline" className="min-h-11 w-full justify-start gap-1.5 whitespace-normal bg-white text-xs sm:h-8 sm:min-h-0 sm:w-auto sm:justify-center sm:whitespace-nowrap">
              <CalendarPlus className="size-3.5" /> Fırsat Dışı Aktivite
            </Button>
          }
        />
      )}

      {canQuote && (
        <>
          <Button
            size="sm"
            variant="outline"
            className="min-h-11 w-full justify-start gap-1.5 whitespace-normal bg-white text-xs sm:h-8 sm:min-h-0 sm:w-auto sm:justify-center sm:whitespace-nowrap"
            onClick={() => setQuoteOpen(true)}
          >
            <FileText className="size-3.5" /> Teklif
          </Button>
          <QuoteDialog defaultCustomerId={customer.id} open={quoteOpen} onOpenChange={setQuoteOpen} />
        </>
      )}

      {canProforma && (
        <>
          <Button
            size="sm"
            variant="outline"
            className="min-h-11 w-full justify-start gap-1.5 whitespace-normal bg-white text-xs sm:h-8 sm:min-h-0 sm:w-auto sm:justify-center sm:whitespace-nowrap"
            onClick={() => setProformaOpen(true)}
          >
            <FileText className="size-3.5" /> Proforma
          </Button>
          <CreateProformaDialog
            defaultQuoteId={latestQuoteId}
            open={proformaOpen}
            onOpenChange={setProformaOpen}
          />
        </>
      )}

      {canContract && (
        <>
          <Button
            size="sm"
            variant="outline"
            className="min-h-11 w-full justify-start gap-1.5 whitespace-normal bg-white text-xs sm:h-8 sm:min-h-0 sm:w-auto sm:justify-center sm:whitespace-nowrap"
            onClick={() => setContractOpen(true)}
          >
            <FileText className="size-3.5" /> Sözleşme
          </Button>
          <CreateContractDialog
            defaultQuoteId={latestQuoteId}
            open={contractOpen}
            onOpenChange={setContractOpen}
          />
        </>
      )}

      {(canProforma || canContract) && !latestQuoteId && (
        <span className="text-[10px] text-muted-foreground min-[420px]:col-span-2 sm:col-auto">
          Proforma/sözleşme bir teklife bağlanır — bu firmanın teklifi yok, diyalogda seçmeniz gerekir.
        </span>
      )}
    </div>
  );
}

export function CompanyDetailDialog({
  customer,
  onClose,
  onOpenContact,
  onEdit,
  onOpenFullDetail,
}: {
  customer: Customer | null;
  onClose: () => void;
  onOpenContact?: (c: Contact) => void;
  onEdit?: (customer: Customer) => void;
  onOpenFullDetail?: (customer: Customer) => void;
}) {
  const { cases, offers, documents, payments, machines, service, activities, deleteContact } = useStore();
  const { user, activeDivision, activeDepartment, hasPermission } = useAuth();
  const canReadActivities = hasPermission("activities.read");
  const queryClient = useQueryClient();
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [pendingContactDelete, setPendingContactDelete] = useState<Contact | null>(null);
  const [breakdown, setBreakdown] = useState<BreakdownKey | null>(null);
  const contactScope: ContactQueryScope = {
    tenantId: user?.tenantId ?? "anonymous",
    userId: user?.id ?? "anonymous",
    activeDivision,
    activeDepartment,
  };
  const companyId = customer?.id ?? "";
  const firmContactsQuery = useQuery({
    queryKey: contactQueryKeys.companyContacts(contactScope, companyId),
    queryFn: ({ signal }) => loadAllCompanyContacts(companyId, signal),
    enabled: Boolean(customer),
  });
  if (!customer) return null;

  const firmContacts = firmContactsQuery.data?.data ?? [];
  const firmContactCount = firmContactsQuery.data?.total ?? 0;
  const firmCases = cases.filter((c) => c.customerId === customer.id);
  const caseIds = new Set(firmCases.map((c) => c.id));
  // Quotes/documents tie to a firm directly via companyId; fall back to the
  // opportunity (case) chain for any legacy rows that only carry salesCaseId.
  const firmOffers = offers.filter((o) => o.companyId === customer.id || (o.salesCaseId && caseIds.has(o.salesCaseId)));
  const firmDocs = documents.filter((d) => d.companyId === customer.id || (d.salesCaseId && caseIds.has(d.salesCaseId)));
  const firmProformas = firmDocs.filter((d) => d.type === "Proforma");
  const firmPayments = payments.filter((p) => p.customerId === customer.id);
  // Aktivite sekmesi firmanın tüm temaslarını tek akışta gösterir; fırsata bağlı
  // olmayanlar "Fırsat Dışı Aktivite" etiketiyle ayrışır ve tek tıkla fırsata
  // dönüştürülebilir.
  const canViewStandalone = canViewStandaloneActivities(user?.roles);
  const firmActivities = activities.filter(
    (activity) => activity.customerId === customer.id && (!isStandaloneActivity(activity) || canViewStandalone),
  );
  const firmStandaloneActivities = firmActivities.filter(
    (activity) => activity.customerId === customer.id && !activity.salesCaseId,
  );
  const firmMachines = machines.filter((m) => m.customerId === customer.id);
  const firmService = service.filter((s) => s.customerId === customer.id);
  const companyAddresses = customer.addresses?.length
    ? customer.addresses
    : (customer.address || customer.city || customer.district || customer.country)
      ? [{
          addressType: "office" as const,
          address: customer.address,
          district: customer.district,
          city: customer.city,
          country: customer.country ?? "Türkiye",
          isDefault: true,
          isShipping: true,
          isBilling: true,
        }]
      : [];

  // Total quoted value across all offers for this firm, grouped by currency.
  const totalQuoted = sumByCurrency(firmOffers.map((o) => ({ amount: o.amount, currency: o.currency })));

  // Proforma ve sözleşme bir teklife bağlanır; firmanın en yeni teklifi ön seçili gelir.
  const latestQuoteId = [...firmOffers]
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))[0]?.id;

  const DOC_LABEL: Record<string, string> = {
    Proforma: "Proforma",
    Contract: "Sözleşme",
    CommercialInvoice: "Ticari Fatura",
    AccountingInvoice: "Muhasebe Faturası",
    DeliveryForm: "Teslim Formu",
    InstallationForm: "Kurulum Formu",
    Other: "Diğer",
  };

  const removeContact = async () => {
    if (!pendingContactDelete) return;
    try {
      await deleteContact(pendingContactDelete.id);
      await invalidateContactQueries(queryClient);
      toast.success("Kontak silindi");
      setPendingContactDelete(null);
    } catch (err: any) {
      toast.error("Kontak silinemedi", { description: err?.message ?? "API isteği başarısız oldu." });
    }
  };

  return (
    <Dialog open={!!customer} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[88vh] overflow-y-auto p-0 gap-0">
        {/* header */}
        <DialogHeader className="border-b border-border/60 px-4 pb-4 pt-6 sm:px-6">
          <div className="flex flex-wrap items-start gap-3">
            <div className={`size-11 rounded-xl grid place-items-center shrink-0 ${
              customer.type === "company"
                ? "bg-gradient-to-br from-primary/15 to-primary/5 text-primary"
                : "bg-gradient-to-br from-blue-100 to-blue-50 text-blue-700"
            }`}>
              {customer.type === "company" ? <Building2 className="size-5" /> : <UserIcon className="size-5" />}
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-lg truncate">{customer.name}</DialogTitle>
              <DialogDescription className="mt-1 flex items-center gap-2 flex-wrap">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] ${FIRM_TYPE_COLOR[customer.firmType]}`}>
                  {FIRM_TYPE_LABEL[customer.firmType]}
                </span>
                <span className={`inline-flex px-2 py-0.5 rounded-full border text-[11px] ${
                  customer.salesStatus === "active_customer"
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-zinc-100 text-zinc-700 border-zinc-200"
                }`}>
                  {customer.salesStatus === "active_customer" ? "Cari" : "Potansiyel"}
                </span>
                {(customer.divisions ?? []).map((division) => (
                  <span key={division.id} className="inline-flex rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-[11px] font-medium text-primary">
                    {division.name}
                  </span>
                ))}
                <span className="text-muted-foreground">{customer.type === "company" ? "Kurumsal" : "Bireysel"}</span>
              </DialogDescription>
            </div>
            <div className="order-3 flex w-full flex-col gap-2 min-[420px]:flex-row sm:order-none sm:w-auto">
              {hasPermission("companies.update") && onEdit && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-11 flex-1 shrink-0 gap-1.5 whitespace-normal bg-white text-xs sm:h-8 sm:min-h-0 sm:flex-none"
                  onClick={() => onEdit(customer)}
                >
                  <Pencil className="size-3.5" /> Firma Düzenle
                </Button>
              )}
              {onOpenFullDetail && (
                <Button
                  type="button"
                  size="sm"
                  className="min-h-11 flex-1 shrink-0 gap-1.5 whitespace-normal text-xs sm:h-8 sm:min-h-0 sm:flex-none"
                  onClick={() => {
                    onClose();
                    onOpenFullDetail(customer);
                  }}
                >
                  <ChevronRight className="size-3.5" /> Müşteri Detayına Git
                </Button>
              )}
            </div>
          </div>

          {/* Aksiyonlar — firmadan doğrudan satış kartı / teklif / proforma / sözleşme açılır. */}
          <CompanyQuickActions customer={customer} latestQuoteId={latestQuoteId} />

          {/* contact info row */}
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Field icon={<Hash className="size-4" />} label="VKN" value={customer.taxNumber} />
            <Field icon={<Phone className="size-4" />} label="Telefon" value={customer.phone} />
            <Field icon={<Mail className="size-4" />} label="E-posta" value={customer.email} />
            <Field icon={<MapPin className="size-4" />} label="Konum" value={[customer.city, customer.district].filter(Boolean).join(" / ")} />
            <Field icon={<Briefcase className="size-4" />} label="Sektör" value={customer.sector} />
            <Field icon={<Building2 className="size-4" />} label="Bağlı Bulunduğu Birim" value={(customer.divisions ?? []).map((division) => division.name).join(", ")} />
            <Field icon={<Building2 className="size-4" />} label="Firma Grubu" value={customer.companyGroupNames?.join(", ") || customer.companyGroupName} />
            <Field icon={<Globe className="size-4" />} label="Web" value={customer.website} />
            <Field icon={<UserIcon className="size-4" />} label="Oluşturan" value={createdMeta(customer)} />
          </div>
          {companyAddresses.length > 0 && (
            <section className="mt-4 overflow-hidden rounded-lg border border-border/60 bg-white" aria-label="Firma adresleri">
              <div className="flex items-center justify-between border-b border-border/60 bg-muted/30 px-3 py-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                  <MapPin className="size-3.5 text-primary" />
                  Adresler
                </div>
                <span className="text-[11px] tabular-nums text-muted-foreground">{companyAddresses.length} kayıt</span>
              </div>
              <ul className="divide-y divide-border/50">
                {companyAddresses.map((address, index) => (
                  <li key={address.id ?? index} className="grid grid-cols-[auto_1fr] gap-2.5 px-3 py-2.5 text-xs">
                    <span className="mt-0.5 grid size-6 place-items-center rounded-md bg-primary/8 font-semibold tabular-nums text-primary">
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-medium text-foreground">{ADDRESS_TYPE_LABELS[address.addressType] ?? "Adres"}</span>
                        {address.isDefault && (
                          <span className="rounded-full border border-primary/20 bg-primary/5 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                            Ana adres
                          </span>
                        )}
                        {address.isShipping && (
                          <span className="rounded-full border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700">
                            Sevkiyat
                          </span>
                        )}
                        {address.isBilling && (
                          <span className="rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                            Fatura
                          </span>
                        )}
                      </div>
                      {[address.address, address.district, address.city, address.country].some(Boolean) ? (
                        <button
                          type="button"
                          className="mt-0.5 break-words text-left leading-relaxed text-muted-foreground underline-offset-2 hover:text-primary hover:underline"
                          onClick={() => openInMaps([address.address, address.district, address.city, address.country])}
                          title="Haritada göster"
                        >
                          {[address.address, address.district, address.city, address.country].filter(Boolean).join(", ")}
                        </button>
                      ) : (
                        <div className="mt-0.5 leading-relaxed text-muted-foreground">Adres bilgisi yok</div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <CompanyNotesCard
            className="mt-4"
            companyId={customer.id}
            companyName={customer.name}
            note={customer.initialNote}
          />
        </DialogHeader>

        {/* KPI tiles — her biri tıklanınca ilgili kayıtlar pop-up olarak açılır */}
        <div className="grid grid-cols-1 gap-2.5 px-4 py-4 min-[420px]:grid-cols-3 sm:px-6">
          <Stat icon={<UserIcon className="size-3.5" />} label="Kontak" value={firmContactsQuery.isPending ? "…" : firmContactCount} accent="text-indigo-600" onClick={() => setBreakdown("contacts")} />
          <Stat icon={<Briefcase className="size-3.5" />} label="Satış Kartı" value={firmCases.length} accent="text-sky-600" onClick={() => setBreakdown("cases")} />
          <Stat icon={<FileText className="size-3.5" />} label="Teklif" value={firmOffers.length} accent="text-blue-600" onClick={() => setBreakdown("offers")} />
          <Stat icon={<FileSignature className="size-3.5" />} label="Proforma" value={firmProformas.length} accent="text-brand-blue" onClick={() => setBreakdown("proformas")} />
          <Stat icon={<Cpu className="size-3.5" />} label="Makine" value={firmMachines.length} accent="text-amber-600" onClick={() => setBreakdown("machines")} />
          <Stat icon={<Wrench className="size-3.5" />} label="Servis" value={firmService.length} accent="text-rose-600" onClick={() => setBreakdown("service")} />
        </div>

        <div className="px-4 pb-2 sm:px-6">
          <CompanyFinancePanel companyId={customer.id} companyName={customer.name} />
        </div>

        <div className="px-4 pb-2 sm:px-6">
          <div className="rounded-lg bg-muted/40 border border-border/60 px-3 py-2 text-sm flex items-center gap-2">
            <Wallet className="size-4 text-emerald-600" />
            <span className="text-muted-foreground">Toplam teklif tutarı:</span>
            <b className="tabular-nums">{totalQuoted}</b>
          </div>
        </div>

        {/* tabs */}
        <div className="px-4 pb-6 sm:px-6">
          <Tabs defaultValue="kontaklar">
            <TabsList className="flex-nowrap justify-start bg-muted/60">
              <TabsTrigger value="kontaklar">Kontaklar ({firmContactsQuery.isPending ? "…" : firmContactCount})</TabsTrigger>
              <TabsTrigger value="satis">Satış ({firmCases.length})</TabsTrigger>
              <TabsTrigger value="teklif">Teklifler ({firmOffers.length})</TabsTrigger>
              <TabsTrigger value="dokuman">Dökümanlar ({firmDocs.length})</TabsTrigger>
              {canReadActivities && (
                <TabsTrigger value="aktivite">Aktiviteler ({firmActivities.length})</TabsTrigger>
              )}
              <TabsTrigger value="cari">Cari ({firmPayments.length})</TabsTrigger>
              <TabsTrigger value="makine">Makineler ({firmMachines.length})</TabsTrigger>
            </TabsList>

            {/* contacts */}
            <TabsContent value="kontaklar" className="mt-3">
              <div className="mb-2 flex justify-end">
                <CreateContactDialog
                  defaultCustomerId={customer.id}
                  onCreated={() => void invalidateContactQueries(queryClient)}
                  trigger={
                    <Button type="button" size="sm" className="gap-1">
                      <Plus className="size-4" /> Kontak Ekle
                    </Button>
                  }
                />
              </div>
              <div className="rounded-lg border border-border/60 overflow-hidden">
                <SortRows rows={firmContacts} by={CONTACT_SORT}>{({ sorted, sort, toggle }) => (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <SortableTableHead sortKey="name" sort={sort} onSort={toggle}>Kişi</SortableTableHead>
                      <SortableTableHead sortKey="title" sort={sort} onSort={toggle}>Ünvan</SortableTableHead>
                      <SortableTableHead sortKey="contact" sort={sort} onSort={toggle}>İletişim</SortableTableHead>
                      <TableHead className="w-24 text-right">İşlem</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {firmContactsQuery.isPending && <EmptyRow cols={4} text="Kontaklar yükleniyor..." />}
                    {firmContactsQuery.isError && <EmptyRow cols={4} text="Kontaklar yüklenemedi." />}
                    {sorted.map((k) => (
                      <TableRow
                        key={k.id}
                        className={onOpenContact ? "cursor-pointer group" : ""}
                        onClick={() => onOpenContact?.(k)}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <Avatar className="size-8">
                              <AvatarFallback className="bg-primary/15 text-primary text-[11px]">{initials(k.name)}</AvatarFallback>
                            </Avatar>
                            <span className="flex items-center gap-1.5 group-hover:text-primary transition-colors">
                              {k.name}
                              {k.isPrimary && <Star className="size-3 fill-amber-400 text-amber-400" />}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{k.title || "—"}</div>
                          <div className="text-[11px] text-muted-foreground">{k.department}</div>
                        </TableCell>
                        <TableCell>
                          <div className="text-xs flex items-center gap-1.5"><Phone className="size-3 text-muted-foreground" />{k.phone || "—"}</div>
                          <div className="text-xs flex items-center gap-1.5 mt-0.5"><Mail className="size-3 text-muted-foreground" />{k.email || "—"}</div>
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label={`${k.name} kontağını düzenle`}
                              title="Kontağı düzenle"
                              className="size-8"
                              onClick={(event) => {
                                event.stopPropagation();
                                setEditingContact(k);
                              }}
                            >
                              <Pencil className="size-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label={`${k.name} kontağını sil`}
                              title="Kontağı sil"
                              className="size-8 text-destructive"
                              onClick={(event) => {
                                event.stopPropagation();
                                setPendingContactDelete(k);
                              }}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                            {onOpenContact && <ChevronRight className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100 self-center" />}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {!firmContactsQuery.isPending && !firmContactsQuery.isError && firmContacts.length === 0 && <EmptyRow cols={4} text="Bu firmaya bağlı kontak yok." />}
                  </TableBody>
                </Table>
                )}</SortRows>
              </div>
            </TabsContent>

            {/* firmanın tüm aktiviteleri; fırsat dışı olanlar etiketli */}
            {canReadActivities && (
              <TabsContent value="aktivite" className="mt-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">
                    {firmStandaloneActivities.length} fırsat dışı aktivite
                  </span>
                  {hasPermission("activities.create") && (
                    <LogActivityDialog
                      customerId={customer.id}
                      defaultKind="customer_visit"
                      trigger={
                        <Button type="button" size="sm" className="gap-1.5">
                          <CalendarPlus className="size-4" /> Aktivite Ekle
                        </Button>
                      }
                    />
                  )}
                </div>
                <div className="overflow-hidden rounded-lg border border-border/60">
                  <SortRows
                    rows={firmActivities}
                    by={{
                      date: (a) => a.date,
                      type: (a) => a.type || "Aktivite",
                      title: (a) => a.title,
                      createdBy: (a) => a.createdByName,
                    }}
                  >{({ sorted, sort, toggle }) => (
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30 hover:bg-muted/30">
                        <SortableTableHead sortKey="date" sort={sort} onSort={toggle}>Tarih</SortableTableHead>
                        <SortableTableHead sortKey="type" sort={sort} onSort={toggle}>Tür</SortableTableHead>
                        <SortableTableHead sortKey="title" sort={sort} onSort={toggle}>Aktivite</SortableTableHead>
                        <SortableTableHead sortKey="createdBy" sort={sort} onSort={toggle}>Kaydeden</SortableTableHead>
                        <TableHead className="w-10" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sorted.map((activity) => (
                        <TableRow key={activity.id}>
                          <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">{activity.date}</TableCell>
                          <TableCell className="whitespace-nowrap">{activity.type || "Aktivite"}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium">{activity.title}</span>
                              {isStandaloneActivity(activity) && <NonOpportunityBadge />}
                            </div>
                            {activity.note && (
                              <div className="mt-0.5 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                                {activity.note}
                              </div>
                            )}
                            {activity.result && activity.result !== activity.note && (
                              <div className="mt-1 text-xs text-muted-foreground">Sonuç: {activity.result}</div>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground">{activity.createdByName || "—"}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <ActivityDetailDialog activity={activity} showConvert={false} />
                              <ConvertActivityToOpportunity activity={activity} size="icon" />
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                      {firmActivities.length === 0 && (
                        <EmptyRow cols={5} text="Bu firmaya ait aktivite yok." />
                      )}
                    </TableBody>
                  </Table>
                  )}</SortRows>
                </div>
              </TabsContent>
            )}

            {/* sales cases */}
            <TabsContent value="satis" className="mt-3">
              <div className="rounded-lg border border-border/60 overflow-hidden">
                <SortRows rows={firmCases} by={CASE_SORT}>{({ sorted, sort, toggle }) => (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <SortableTableHead sortKey="product" sort={sort} onSort={toggle}>Ürün / Model</SortableTableHead>
                      <SortableTableHead sortKey="amount" sort={sort} onSort={toggle}>Tutar</SortableTableHead>
                      <SortableTableHead sortKey="stage" sort={sort} onSort={toggle}>Aşama</SortableTableHead>
                      <SortableTableHead sortKey="date" sort={sort} onSort={toggle}>Tarih</SortableTableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sorted.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell>{s.requestedProduct}{s.requestedModel && s.requestedModel !== s.requestedProduct && <span className="text-muted-foreground"> · {s.requestedModel}</span>}</TableCell>
                        <TableCell className="tabular-nums">{fmtMoney(s.estimatedAmount, s.currency)}</TableCell>
                        <TableCell><StatusBadge status={salesStageLabel(s.stage)} /></TableCell>
                        <TableCell className="text-muted-foreground tabular-nums">{s.createdAt}</TableCell>
                      </TableRow>
                    ))}
                    {firmCases.length === 0 && <EmptyRow cols={4} text="Satış kartı yok." />}
                  </TableBody>
                </Table>
                )}</SortRows>
              </div>
            </TabsContent>

            {/* offers */}
            <TabsContent value="teklif" className="mt-3">
              <div className="rounded-lg border border-border/60 overflow-hidden">
                <SortRows rows={firmOffers} by={OFFER_SORT}>{({ sorted, sort, toggle }) => (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <SortableTableHead sortKey="no" sort={sort} onSort={toggle}>Teklif No</SortableTableHead>
                      <SortableTableHead sortKey="amount" sort={sort} onSort={toggle}>Tutar</SortableTableHead>
                      <SortableTableHead sortKey="status" sort={sort} onSort={toggle}>Durum</SortableTableHead>
                      <SortableTableHead sortKey="date" sort={sort} onSort={toggle}>Tarih</SortableTableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sorted.map((o) => (
                      <TableRow key={o.id}>
                        <TableCell className="font-medium">{o.quoteNo}</TableCell>
                        <TableCell className="tabular-nums">{fmtMoney(o.amount, o.currency)}</TableCell>
                        <TableCell><StatusBadge status={o.status} /></TableCell>
                        <TableCell className="text-muted-foreground tabular-nums">{o.date}</TableCell>
                      </TableRow>
                    ))}
                    {firmOffers.length === 0 && <EmptyRow cols={4} text="Teklif yok." />}
                  </TableBody>
                </Table>
                )}</SortRows>
              </div>
            </TabsContent>

            {/* documents (proformas + contracts + invoices) */}
            <TabsContent value="dokuman" className="mt-3">
              <div className="rounded-lg border border-border/60 overflow-hidden">
                <SortRows
                  rows={firmDocs}
                  by={{
                    type: (d) => DOC_LABEL[d.type] ?? d.type,
                    file: (d) => d.fileName,
                    date: (d) => d.uploadedAt,
                    size: (d) => d.size,
                  }}
                >{({ sorted, sort, toggle }) => (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <SortableTableHead sortKey="type" sort={sort} onSort={toggle}>Tip</SortableTableHead>
                      <SortableTableHead sortKey="file" sort={sort} onSort={toggle}>Belge</SortableTableHead>
                      <SortableTableHead sortKey="date" sort={sort} onSort={toggle}>Tarih</SortableTableHead>
                      <SortableTableHead sortKey="size" sort={sort} onSort={toggle}>Durum</SortableTableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sorted.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell>
                          <span className="inline-flex items-center gap-1.5">
                            {d.type === "Proforma" ? <FileSignature className="size-3.5 text-brand-blue" /> : d.type === "Contract" ? <FileText className="size-3.5 text-sky-600" /> : <Receipt className="size-3.5 text-amber-600" />}
                            {DOC_LABEL[d.type] ?? d.type}
                          </span>
                        </TableCell>
                        <TableCell className="font-medium">{d.fileName}</TableCell>
                        <TableCell className="text-muted-foreground tabular-nums">{d.uploadedAt || "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{d.size}</TableCell>
                      </TableRow>
                    ))}
                    {firmDocs.length === 0 && <EmptyRow cols={4} text="Proforma / sözleşme / fatura yok." />}
                  </TableBody>
                </Table>
                )}</SortRows>
              </div>
            </TabsContent>

            {/* payments */}
            <TabsContent value="cari" className="mt-3">
              <div className="rounded-lg border border-border/60 overflow-hidden">
                <SortRows
                  rows={firmPayments}
                  by={{
                    type: paymentTypeLabel,
                    invoice: (p) => p.invoiceNo,
                    amount: (p) => p.amount,
                    due: (p) => p.dueDate,
                    status: (p) => p.status,
                  }}
                >{({ sorted, sort, toggle }) => (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <SortableTableHead sortKey="type" sort={sort} onSort={toggle}>Tip</SortableTableHead>
                      <SortableTableHead sortKey="invoice" sort={sort} onSort={toggle}>Fatura No</SortableTableHead>
                      <SortableTableHead sortKey="amount" sort={sort} onSort={toggle}>Tutar</SortableTableHead>
                      <SortableTableHead sortKey="due" sort={sort} onSort={toggle}>Vade</SortableTableHead>
                      <SortableTableHead sortKey="status" sort={sort} onSort={toggle}>Durum</SortableTableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sorted.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>{paymentTypeLabel(p)}</TableCell>
                        <TableCell className="text-muted-foreground">{p.invoiceNo || "—"}</TableCell>
                        <TableCell className="tabular-nums">{fmtMoney(p.amount, p.currency)}</TableCell>
                        <TableCell className="text-muted-foreground tabular-nums">{p.dueDate}</TableCell>
                        <TableCell><StatusBadge status={p.status} /></TableCell>
                      </TableRow>
                    ))}
                    {firmPayments.length === 0 && <EmptyRow cols={5} text="Cari hareket yok." />}
                  </TableBody>
                </Table>
                )}</SortRows>
              </div>
            </TabsContent>

            {/* machines */}
            <TabsContent value="makine" className="mt-3">
              <div className="rounded-lg border border-border/60 overflow-hidden">
                <SortRows rows={firmMachines} by={MACHINE_SORT}>{({ sorted, sort, toggle }) => (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <SortableTableHead sortKey="serial" sort={sort} onSort={toggle}>Seri No</SortableTableHead>
                      <SortableTableHead sortKey="model" sort={sort} onSort={toggle}>Model</SortableTableHead>
                      <SortableTableHead sortKey="installed" sort={sort} onSort={toggle}>Kurulum</SortableTableHead>
                      <SortableTableHead sortKey="warranty" sort={sort} onSort={toggle}>Garanti Bitiş</SortableTableHead>
                      <SortableTableHead sortKey="status" sort={sort} onSort={toggle}>Durum</SortableTableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sorted.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="font-medium">{m.serialNumber}</TableCell>
                        <TableCell>{m.model}</TableCell>
                        <TableCell className="text-muted-foreground tabular-nums">{m.installationDate || "—"}</TableCell>
                        <TableCell className="text-muted-foreground tabular-nums">{m.warrantyEnd || "—"}</TableCell>
                        <TableCell><StatusBadge status={m.status} /></TableCell>
                      </TableRow>
                    ))}
                    {firmMachines.length === 0 && <EmptyRow cols={5} text="Kurulu makine yok." />}
                  </TableBody>
                </Table>
                )}</SortRows>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
      <EditContactDialog
        contact={editingContact}
        onClose={() => {
          setEditingContact(null);
          void invalidateContactQueries(queryClient);
        }}
      />
      <CompanyBreakdownDialog
        breakdown={breakdown}
        onClose={() => setBreakdown(null)}
        customerName={customer.name}
        contacts={firmContacts}
        cases={firmCases}
        offers={firmOffers}
        proformas={firmProformas}
        machines={firmMachines}
        service={firmService}
        machineById={new Map(machines.map((m) => [m.id, m]))}
        onOpenContact={onOpenContact}
      />
      <AlertDialog open={Boolean(pendingContactDelete)} onOpenChange={(open) => !open && setPendingContactDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Kontak silinsin mi?</AlertDialogTitle>
            <AlertDialogDescription><b>{pendingContactDelete?.name}</b> kişisi <b>{customer.name}</b> firmasının kontak listesinden kalıcı olarak kaldırılacak.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="rounded-lg border border-destructive/15 bg-destructive/[0.04] p-3 text-xs text-muted-foreground">Firma ve satış kayıtları korunur; yalnız kişi kaydı ve hızlı iletişim bağlantısı kaldırılır.</div>
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={(event) => { event.preventDefault(); void removeContact(); }}>Kontağı sil</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

// ───────────────────── KPI breakdown popup ─────────────────────

type BreakdownKey = "contacts" | "cases" | "offers" | "proformas" | "machines" | "service";

const BREAKDOWN_META: Record<BreakdownKey, { title: string; icon: React.ReactNode; accent: string }> = {
  contacts: { title: "Kontaklar", icon: <UserIcon className="size-4" />, accent: "text-indigo-600" },
  cases: { title: "Satış Kartları", icon: <Briefcase className="size-4" />, accent: "text-sky-600" },
  offers: { title: "Teklifler", icon: <FileText className="size-4" />, accent: "text-blue-600" },
  proformas: { title: "Proformalar", icon: <FileSignature className="size-4" />, accent: "text-brand-blue" },
  machines: { title: "Makineler", icon: <Cpu className="size-4" />, accent: "text-amber-600" },
  service: { title: "Servis Talepleri", icon: <Wrench className="size-4" />, accent: "text-rose-600" },
};

/**
 * Firma özet kartlarından (Kontak, Satış Kartı, Teklif …) tıklanınca açılan,
 * yalnızca o kategorinin kayıtlarını gösteren odaklı pop-up.
 */
function CompanyBreakdownDialog({
  breakdown,
  onClose,
  customerName,
  contacts,
  cases,
  offers,
  proformas,
  machines,
  service,
  machineById,
  onOpenContact,
}: {
  breakdown: BreakdownKey | null;
  onClose: () => void;
  customerName: string;
  contacts: Contact[];
  cases: SalesCase[];
  offers: Offer[];
  proformas: DocumentItem[];
  machines: Machine[];
  service: ServiceRequest[];
  machineById: Map<string, Machine>;
  onOpenContact?: (c: Contact) => void;
}) {
  if (!breakdown) return null;
  const meta = BREAKDOWN_META[breakdown];

  const count =
    breakdown === "contacts" ? contacts.length
    : breakdown === "cases" ? cases.length
    : breakdown === "offers" ? offers.length
    : breakdown === "proformas" ? proformas.length
    : breakdown === "machines" ? machines.length
    : service.length;

  return (
    <Dialog open={!!breakdown} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/60">
          <DialogTitle className="flex items-center gap-2 text-base">
            <span className={meta.accent}>{meta.icon}</span>
            {meta.title}
            <span className="text-muted-foreground tabular-nums">({count})</span>
          </DialogTitle>
          <DialogDescription className="mt-0.5 truncate">{customerName}</DialogDescription>
        </DialogHeader>

        <div className="px-6 py-4">
          <div className="rounded-lg border border-border/60 overflow-hidden">
            {breakdown === "contacts" && (
              <SortRows rows={contacts} by={CONTACT_SORT}>{({ sorted, sort, toggle }) => (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <SortableTableHead sortKey="name" sort={sort} onSort={toggle}>Kişi</SortableTableHead>
                    <SortableTableHead sortKey="title" sort={sort} onSort={toggle}>Ünvan</SortableTableHead>
                    <SortableTableHead sortKey="contact" sort={sort} onSort={toggle}>İletişim</SortableTableHead>
                    {onOpenContact && <TableHead className="w-8" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map((k) => (
                    <TableRow
                      key={k.id}
                      className={onOpenContact ? "cursor-pointer group" : ""}
                      onClick={() => onOpenContact?.(k)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <Avatar className="size-8">
                            <AvatarFallback className="bg-primary/15 text-primary text-[11px]">{initials(k.name)}</AvatarFallback>
                          </Avatar>
                          <span className="flex items-center gap-1.5 group-hover:text-primary transition-colors">
                            {k.name}
                            {k.isPrimary && <Star className="size-3 fill-amber-400 text-amber-400" />}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{k.title || "—"}</div>
                        <div className="text-[11px] text-muted-foreground">{k.department}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs flex items-center gap-1.5"><Phone className="size-3 text-muted-foreground" />{k.phone || "—"}</div>
                        <div className="text-xs flex items-center gap-1.5 mt-0.5"><Mail className="size-3 text-muted-foreground" />{k.email || "—"}</div>
                      </TableCell>
                      {onOpenContact && (
                        <TableCell><ChevronRight className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100" /></TableCell>
                      )}
                    </TableRow>
                  ))}
                  {contacts.length === 0 && <EmptyRow cols={onOpenContact ? 4 : 3} text="Bu firmaya bağlı kontak yok." />}
                </TableBody>
              </Table>
              )}</SortRows>
            )}

            {breakdown === "cases" && (
              <SortRows rows={cases} by={CASE_SORT}>{({ sorted, sort, toggle }) => (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <SortableTableHead sortKey="product" sort={sort} onSort={toggle}>Ürün / Model</SortableTableHead>
                    <SortableTableHead sortKey="amount" sort={sort} onSort={toggle}>Tutar</SortableTableHead>
                    <SortableTableHead sortKey="stage" sort={sort} onSort={toggle}>Aşama</SortableTableHead>
                    <SortableTableHead sortKey="date" sort={sort} onSort={toggle}>Tarih</SortableTableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>{s.requestedProduct}{s.requestedModel && s.requestedModel !== s.requestedProduct && <span className="text-muted-foreground"> · {s.requestedModel}</span>}</TableCell>
                      <TableCell className="tabular-nums">{fmtMoney(s.estimatedAmount, s.currency)}</TableCell>
                      <TableCell><StatusBadge status={salesStageLabel(s.stage)} /></TableCell>
                      <TableCell className="text-muted-foreground tabular-nums">{s.createdAt}</TableCell>
                    </TableRow>
                  ))}
                  {cases.length === 0 && <EmptyRow cols={4} text="Satış kartı yok." />}
                </TableBody>
              </Table>
              )}</SortRows>
            )}

            {breakdown === "offers" && (
              <SortRows rows={offers} by={OFFER_SORT}>{({ sorted, sort, toggle }) => (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <SortableTableHead sortKey="no" sort={sort} onSort={toggle}>Teklif No</SortableTableHead>
                    <SortableTableHead sortKey="amount" sort={sort} onSort={toggle}>Tutar</SortableTableHead>
                    <SortableTableHead sortKey="status" sort={sort} onSort={toggle}>Durum</SortableTableHead>
                    <SortableTableHead sortKey="date" sort={sort} onSort={toggle}>Tarih</SortableTableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="font-medium">{o.quoteNo}</TableCell>
                      <TableCell className="tabular-nums">{fmtMoney(o.amount, o.currency)}</TableCell>
                      <TableCell><StatusBadge status={o.status} /></TableCell>
                      <TableCell className="text-muted-foreground tabular-nums">{o.date}</TableCell>
                    </TableRow>
                  ))}
                  {offers.length === 0 && <EmptyRow cols={4} text="Teklif yok." />}
                </TableBody>
              </Table>
              )}</SortRows>
            )}

            {breakdown === "proformas" && (
              <SortRows
                rows={proformas}
                by={{ file: (d) => d.fileName, date: (d) => d.uploadedAt, size: (d) => d.size }}
              >{({ sorted, sort, toggle }) => (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <SortableTableHead sortKey="file" sort={sort} onSort={toggle}>Belge</SortableTableHead>
                    <SortableTableHead sortKey="date" sort={sort} onSort={toggle}>Tarih</SortableTableHead>
                    <SortableTableHead sortKey="size" sort={sort} onSort={toggle}>Boyut</SortableTableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="font-medium">
                        <span className="inline-flex items-center gap-1.5">
                          <FileSignature className="size-3.5 text-brand-blue" />
                          {d.fileName}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground tabular-nums">{d.uploadedAt || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{d.size}</TableCell>
                    </TableRow>
                  ))}
                  {proformas.length === 0 && <EmptyRow cols={3} text="Proforma yok." />}
                </TableBody>
              </Table>
              )}</SortRows>
            )}

            {breakdown === "machines" && (
              <SortRows rows={machines} by={MACHINE_SORT}>{({ sorted, sort, toggle }) => (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <SortableTableHead sortKey="serial" sort={sort} onSort={toggle}>Seri No</SortableTableHead>
                    <SortableTableHead sortKey="model" sort={sort} onSort={toggle}>Model</SortableTableHead>
                    <SortableTableHead sortKey="installed" sort={sort} onSort={toggle}>Kurulum</SortableTableHead>
                    <SortableTableHead sortKey="warranty" sort={sort} onSort={toggle}>Garanti Bitiş</SortableTableHead>
                    <SortableTableHead sortKey="status" sort={sort} onSort={toggle}>Durum</SortableTableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">{m.serialNumber}</TableCell>
                      <TableCell>{m.model}</TableCell>
                      <TableCell className="text-muted-foreground tabular-nums">{m.installationDate || "—"}</TableCell>
                      <TableCell className="text-muted-foreground tabular-nums">{m.warrantyEnd || "—"}</TableCell>
                      <TableCell><StatusBadge status={m.status} /></TableCell>
                    </TableRow>
                  ))}
                  {machines.length === 0 && <EmptyRow cols={5} text="Kurulu makine yok." />}
                </TableBody>
              </Table>
              )}</SortRows>
            )}

            {breakdown === "service" && (
              <SortRows
                rows={service}
                by={{
                  no: (s) => s.ticketNo || s.id,
                  machine: (s) => machineById.get(s.machineId)?.serialNumber || machineById.get(s.machineId)?.model,
                  stage: (s) => s.stage,
                  date: (s) => s.createdAt,
                }}
              >{({ sorted, sort, toggle }) => (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <SortableTableHead sortKey="no" sort={sort} onSort={toggle}>Talep No</SortableTableHead>
                    <SortableTableHead sortKey="machine" sort={sort} onSort={toggle}>Makine</SortableTableHead>
                    <SortableTableHead sortKey="stage" sort={sort} onSort={toggle}>Aşama</SortableTableHead>
                    <SortableTableHead sortKey="date" sort={sort} onSort={toggle}>Tarih</SortableTableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.ticketNo || s.id}</TableCell>
                      <TableCell>{machineById.get(s.machineId)?.serialNumber || machineById.get(s.machineId)?.model || "—"}</TableCell>
                      <TableCell><StatusBadge status={s.stage} /></TableCell>
                      <TableCell className="text-muted-foreground tabular-nums">{s.createdAt}</TableCell>
                    </TableRow>
                  ))}
                  {service.length === 0 && <EmptyRow cols={4} text="Servis talebi yok." />}
                </TableBody>
              </Table>
              )}</SortRows>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ───────────────────────── Contact popup ─────────────────────────

export function ContactDetailDialog({
  contact,
  onClose,
  onOpenCompany,
  onSwitchContact,
}: {
  contact: Contact | null;
  onClose: () => void;
  onOpenCompany?: (c: Customer) => void;
  onSwitchContact?: (c: Contact) => void;
}) {
  const { user, activeDivision, activeDepartment } = useAuth();
  const contactScope: ContactQueryScope = {
    tenantId: user?.tenantId ?? "anonymous",
    userId: user?.id ?? "anonymous",
    activeDivision,
    activeDepartment,
  };
  const companyId = contact?.customerId ?? "";
  const firmQuery = useCompanyDetail(companyId);
  const siblingsQuery = useQuery({
    queryKey: contactQueryKeys.companyContacts(contactScope, companyId),
    queryFn: ({ signal }) => loadAllCompanyContacts(companyId, signal),
    enabled: Boolean(contact && companyId),
  });
  if (!contact) return null;

  const firm = firmQuery.data ?? null;
  const siblings = (siblingsQuery.data?.data ?? []).filter((item) => item.id !== contact.id);

  const personalFields: Array<[string, string | undefined]> = [
    ["Memleket", contact.hometown],
    ["Takım", contact.favoriteTeam],
    ["Renk", contact.favoriteColor],
    ["Mezun Okul", contact.graduatedSchool],
  ];
  const hasPersonal = personalFields.some(([, v]) => v && v !== "—");

  return (
    <Dialog open={!!contact} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[88vh] overflow-y-auto p-0 gap-0">
        {/* header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/60">
          <div className="flex items-start gap-3">
            <Avatar className="size-11">
              <AvatarFallback className="bg-primary/15 text-primary">{initials(contact.name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-lg truncate flex items-center gap-2">
                {contact.name}
                {contact.isPrimary && <Star className="size-4 fill-amber-400 text-amber-400" />}
              </DialogTitle>
              <DialogDescription className="mt-1">
                {[contact.title, contact.department].filter(Boolean).join(" · ") || "Kontak"}
                {contact.decisionRoleName && (
                  <span className="ml-2 inline-flex px-2 py-0.5 rounded-full border text-[11px] bg-indigo-50 text-indigo-700 border-indigo-200">
                    {contact.decisionRoleName}
                  </span>
                )}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* contact details */}
        <div className="px-6 py-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3.5">
          <Field icon={<Phone className="size-4" />} label="İş Telefonu" value={[contact.phone, contact.phoneExtension && `dh. ${contact.phoneExtension}`].filter(Boolean).join(" ")} />
          <Field icon={<Smartphone className="size-4" />} label="Cep Telefonu" value={contact.mobilePhone} />
          <Field icon={<Phone className="size-4" />} label="Diğer Telefon" value={contact.otherPhone} />
          <Field icon={<Mail className="size-4" />} label="İş E-postası" value={contact.email} />
          <Field icon={<Mail className="size-4" />} label="Kişisel E-posta" value={contact.personalEmail} />
          <Field icon={<Mail className="size-4" />} label="Diğer E-posta" value={contact.otherEmail} />
          <Field label="Cinsiyet" value={contact.gender} />
          <Field label="Doğum Tarihi" value={contact.birthDate} />
          <Field icon={<UserIcon className="size-4" />} label="Oluşturan" value={createdMeta(contact)} />
        </div>

        {contact.note && (
          <div className="px-6 pb-4">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Not</div>
            <div className="text-sm rounded-lg bg-muted/40 border border-border/60 px-3 py-2">{contact.note}</div>
          </div>
        )}

        {hasPersonal && (
          <div className="px-6 pb-4">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Kişisel Bilgiler</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2.5">
              {personalFields.map(([label, value]) => <Field key={label} label={label} value={value} />)}
            </div>
          </div>
        )}

        {/* linked company */}
        <div className="px-6 pb-4">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Bağlı Firma</div>
          {companyId && firmQuery.isPending ? (
            <div className="text-sm text-muted-foreground rounded-lg border border-dashed border-border/60 px-3 py-3">Bağlı firma yükleniyor...</div>
          ) : companyId && firmQuery.isError ? (
            <div className="text-sm text-destructive rounded-lg border border-dashed border-destructive/40 px-3 py-3">Bağlı firma yüklenemedi.</div>
          ) : firm ? (
            <button
              type="button"
              onClick={() => onOpenCompany?.(firm)}
              disabled={!onOpenCompany}
              className="w-full text-left rounded-lg border border-border/60 bg-white px-3.5 py-3 flex items-center gap-3 transition-colors enabled:hover:border-primary/40 enabled:hover:bg-primary/5 group disabled:cursor-default"
            >
              <div className="size-9 rounded-lg grid place-items-center bg-gradient-to-br from-primary/15 to-primary/5 text-primary shrink-0">
                <Building2 className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm truncate group-enabled:group-hover:text-primary transition-colors">{firm.name}</div>
                <div className="text-[11px] text-muted-foreground truncate flex items-center gap-2">
                  <span className={`inline-flex px-1.5 py-0 rounded-full border text-[10px] ${FIRM_TYPE_COLOR[firm.firmType]}`}>{FIRM_TYPE_LABEL[firm.firmType]}</span>
                  {firm.city && <span className="inline-flex items-center gap-1"><MapPin className="size-3" />{firm.city}</span>}
                  {firm.phone && <span className="inline-flex items-center gap-1"><Phone className="size-3" />{firm.phone}</span>}
                </div>
              </div>
              {onOpenCompany && <ChevronRight className="size-4 text-muted-foreground group-hover:text-primary shrink-0" />}
            </button>
          ) : (
            <div className="text-sm text-muted-foreground rounded-lg border border-dashed border-border/60 px-3 py-3">Bağlı firma bulunamadı.</div>
          )}
        </div>

        {/* sibling contacts at the same firm */}
        {siblingsQuery.isPending && (
          <div className="px-6 pb-6 text-xs text-muted-foreground">Aynı firmadaki kontaklar yükleniyor...</div>
        )}
        {siblingsQuery.isError && (
          <div className="px-6 pb-6 text-xs text-destructive">Aynı firmadaki kontaklar yüklenemedi.</div>
        )}
        {siblings.length > 0 && (
          <div className="px-6 pb-6">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">
              Aynı Firmadaki Diğer Kontaklar ({siblings.length})
            </div>
            <div className="space-y-1.5">
              {siblings.map((k) => (
                <button
                  key={k.id}
                  type="button"
                  onClick={() => onSwitchContact?.(k)}
                  disabled={!onSwitchContact}
                  className="w-full text-left rounded-lg border border-border/60 bg-white px-3 py-2 flex items-center gap-2.5 transition-colors enabled:hover:border-primary/40 enabled:hover:bg-primary/5 group disabled:cursor-default"
                >
                  <Avatar className="size-7">
                    <AvatarFallback className="bg-muted text-foreground/70 text-[10px]">{initials(k.name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm truncate flex items-center gap-1.5 group-enabled:group-hover:text-primary transition-colors">
                      {k.name}
                      {k.isPrimary && <Star className="size-3 fill-amber-400 text-amber-400" />}
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">{[k.title, k.department].filter(Boolean).join(" · ")}</div>
                  </div>
                  {onSwitchContact && <ChevronRight className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0" />}
                </button>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ───────────────── controller hook: cross-linked dialogs ─────────────────

/**
 * Manages the two cross-linked popups so a page can drop them in with one
 * line and get smooth contact ⇄ company navigation. Opening one closes the
 * other to avoid stacked overlays.
 */
export function useDetailDialogs(options: { onOpenCompanyDetail?: (customer: Customer) => void } = {}) {
  const [contact, setContact] = useState<Contact | null>(null);
  const [company, setCompany] = useState<Customer | null>(null);
  const [editingCompany, setEditingCompany] = useState<Customer | null>(null);

  const openContact = (c: Contact) => { setCompany(null); setEditingCompany(null); setContact(c); };
  const openCompany = (c: Customer) => { setContact(null); setEditingCompany(null); setCompany(c); };
  const editCompany = (c: Customer) => {
    setContact(null);
    setCompany(null);
    setEditingCompany(c);
  };

  const dialogs = (
    <>
      <ContactDetailDialog
        contact={contact}
        onClose={() => setContact(null)}
        onOpenCompany={openCompany}
        onSwitchContact={setContact}
      />
      <CompanyDetailDialog
        customer={company}
        onClose={() => setCompany(null)}
        onOpenContact={openContact}
        onEdit={editCompany}
        onOpenFullDetail={options.onOpenCompanyDetail}
      />
      <EditCustomerDialog customer={editingCompany} onClose={() => setEditingCompany(null)} />
    </>
  );

  return { openContact, openCompany, dialogs };
}
