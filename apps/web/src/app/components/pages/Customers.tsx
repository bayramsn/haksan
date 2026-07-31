import { useState, useEffect, useMemo } from "react";
import { Card } from "../ui/card";
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import {
  Search, MoreHorizontal, Eye, Pencil, Phone, Mail, MapPin, Building2, User as UserIcon, ArrowUpDown, Trash2,
  Handshake, Factory, TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { CreateCaseDialog, EditCustomerDialog } from "../dialogs/CreateDialogs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "../ui/alert-dialog";
import { Customer, FirmType } from "../../lib/mock";
import { useStore } from "../../lib/store";
import { useDetailDialogs } from "../dialogs/DetailDialogs";
import { FilterPopover, usePaged, Pager, ViewToggle, type ListView } from "../ui/list-controls";
import { ExportExcelButton } from "../ui/ExportExcelButton";
import { useAuth } from "../../../lib/auth";
import { usePersistentState } from "../../lib/persist";
import { MiniKpi } from "../shared/MiniKpi";
import { EmptyState } from "../shared/EmptyState";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { ComposeMailDialog, type MailRecipient } from "../mail/ComposeMailDialog";
import { CompanyContactImportDialog } from "../dialogs/CompanyContactImportDialog";

const uniqueSorted = (values: (string | undefined)[]) =>
  Array.from(new Set(values.map((v) => (v ?? "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "tr"));

const FIRM_TYPE_LABEL: Record<FirmType, string> = {
  customer: "Müşteri",
  supplier_customer: "Tedarikçi + Müşteri",
  supplier: "Tedarikçi",
  competitor: "Rakip",
};

const FIRM_TYPE_COLOR: Record<FirmType, string> = {
  customer: "bg-info-soft text-info border-info/20",
  supplier_customer: "bg-brand-blue-soft text-brand-blue border-brand-blue/20",
  supplier: "bg-warning-soft text-warning border-warning/20",
  competitor: "bg-rose-50 text-rose-700 border-rose-200",
};

const FIRM_TYPE_ACCENT: Record<FirmType, string> = {
  customer: "bg-info",
  supplier_customer: "bg-brand-blue",
  supplier: "bg-warning",
  competitor: "bg-rose-500",
};

const createdByLabel = (item: Pick<Customer, "createdByName" | "createdByEmail">) =>
  item.createdByName || item.createdByEmail || "—";

const companyInitials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toLocaleUpperCase("tr-TR");
const supplierCategoryLabel = (code?: Customer["supplierCategoryCode"]) => code === "transportation" ? "Nakliye" : code === "logistics" ? "Lojistik" : "";

export function CustomersPage(_props: { onSelect?: (c: Customer) => void } = {}) {
  const { customers, deleteCustomer, refresh } = useStore();
  const { openCompany, dialogs } = useDetailDialogs();
  // Rol bazlı görünürlük (backend ile aynı kural): yalnızca sales/service rolleri
  // kısıtlıdır. Kısıtlı kullanıcılar tedarikçi sekmesini hiç görmez; servis-only
  // kullanıcılar ayrıca potansiyel müşteri sekmesini görmez (sales görür).
  const { user, activeDivision, setActiveDivision, hasRole } = useAuth();
  const roles = user?.roles ?? [];
  const restricted = roles.length > 0 && roles.every((r) => r === "sales" || r === "service");
  const canSeeSuppliers = !restricted;
  const canSeeCompetitors = !restricted || roles.includes("sales");
  const canSeePotential = !restricted || roles.includes("sales");
  const [editing, setEditing] = useState<Customer | null>(null);
  const [deleting, setDeleting] = useState<Customer | null>(null);
  const [mailRecipient, setMailRecipient] = useState<MailRecipient | null>(null);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"all" | FirmType>("all");
  const [salesTab, setSalesTab] = useState<"all" | "potential" | "active_customer">("all");
  // Bölüm filtresi: hangi bölümden girildiyse o seçili başlar; "Tümü" hepsini gösterir.
  const divisionOptions = user?.divisions ?? [];
  const [divisionTab, setDivisionTab] = useState<string>(() =>
    activeDivision && activeDivision !== "all" ? activeDivision : "all"
  );
  useEffect(() => {
    setDivisionTab(activeDivision && activeDivision !== "all" ? activeDivision : "all");
  }, [activeDivision]);
  const [city, setCity] = useState("all");
  const [sector, setSector] = useState("all");
  const [supplierCategory, setSupplierCategory] = useState<"all" | "transportation" | "logistics">("all");
  const [sortMode, setSortMode] = useState<"default" | "name_asc" | "name_desc" | "created_desc" | "created_asc">("default");
  const [view, setView] = usePersistentState<ListView>("customersView", "table");

  const filtered = customers.filter((c) => {
    if (tab !== "all" && c.firmType !== tab) return false;
    // Statü filtresi tedarikçiler dahil tüm firma türlerine uygulanır.
    if (salesTab !== "all" && c.salesStatus !== salesTab) return false;
    if (divisionTab !== "all" && !(c.divisions ?? []).some((d) => d.id === divisionTab)) return false;
    if (city !== "all" && c.city !== city) return false;
    if (sector !== "all" && (c.sector ?? "") !== sector) return false;
    if (supplierCategory !== "all" && c.supplierCategoryCode !== supplierCategory) return false;
    const t = q.toLowerCase();
    return (
      c.name.toLowerCase().includes(t) ||
      (c.companyNo ?? "").toLowerCase().includes(t) ||
      c.city.toLowerCase().includes(t) ||
      (c.district ?? "").toLowerCase().includes(t) ||
      c.email.toLowerCase().includes(t) ||
      (c.email2 ?? "").toLowerCase().includes(t) ||
      c.phone.toLowerCase().includes(t) ||
      (c.phone2 ?? "").toLowerCase().includes(t) ||
      (c.taxNumber ?? "").toLowerCase().includes(t) ||
      (c.sector ?? "").toLowerCase().includes(t) ||
      supplierCategoryLabel(c.supplierCategoryCode).toLocaleLowerCase("tr-TR").includes(t)
    );
  });

  const sorted = useMemo(() => {
    if (sortMode === "default") return filtered;
    return [...filtered].sort((a, b) => {
      if (sortMode === "name_asc" || sortMode === "name_desc") {
        const cmp = a.name.localeCompare(b.name, "tr", { sensitivity: "base" });
        return sortMode === "name_asc" ? cmp : -cmp;
      }
      const cmp = String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? ""));
      return sortMode === "created_asc" ? cmp : -cmp;
    });
  }, [filtered, sortMode]);

  const { page, setPage, totalPages, pageItems } = usePaged(sorted, 12);

  const exportParams = {
    ...(q ? { search: q } : {}),
    ...(tab !== "all" ? { relationTypeCode: tab } : {}),
    ...(salesTab === "active_customer" ? { customerStatusCode: "active" } : {}),
    ...(salesTab === "potential" ? { customerStatusCode: "potential" } : {}),
    ...(divisionTab !== "all" ? { divisionId: divisionTab } : {}),
  };

  const countBy = (ft: FirmType) => customers.filter((c) => c.firmType === ft).length;

  const emptyState = (
    <EmptyState
      scene="search"
      title="Bu filtreye uyan firma bulunamadı"
      description="Arama terimini veya filtreleri değiştirerek tekrar deneyin."
    />
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <MiniKpi
          icon={<Building2 className="size-4" />}
          label="Toplam Firma"
          value={customers.length}
          tone="violet"
          onClick={() => setTab("all")}
          active={tab === "all"}
        />
        <MiniKpi
          icon={<Handshake className="size-4" />}
          label="Müşteri"
          value={countBy("customer")}
          sub={`+ ${countBy("supplier_customer")} ted.+müşteri`}
          tone="blue"
          onClick={() => setTab("customer")}
          active={tab === "customer"}
        />
        {canSeeSuppliers && (
          <MiniKpi
            icon={<Factory className="size-4" />}
            label="Tedarikçi"
            value={countBy("supplier")}
            sub={`+ ${countBy("supplier_customer")} ted.+müşteri`}
            tone="amber"
            onClick={() => setTab("supplier")}
            active={tab === "supplier"}
          />
        )}
      </div>

      <div className="premium-blueprint precision-corners space-y-3 rounded-xl border border-primary/10 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="font-data text-[9px] font-semibold uppercase tracking-[0.14em] text-operation-blue">Kayıtlı görünüm</span>
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList className="h-9 bg-muted/60">
            <TabsTrigger value="all" className="gap-1.5">
              Tümü
              <span className="ml-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] rounded-full bg-muted text-muted-foreground">
                {customers.length}
              </span>
            </TabsTrigger>
            <TabsTrigger value="customer" className="gap-1.5">
              Müşteri
              <span className="ml-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] rounded-full bg-info-soft text-info">
                {countBy("customer")}
              </span>
            </TabsTrigger>
            <TabsTrigger value="supplier_customer" className="gap-1.5">
              Tedarikçi + Müşteri
              <span className="ml-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] rounded-full bg-brand-blue-soft text-brand-blue">
                {countBy("supplier_customer")}
              </span>
            </TabsTrigger>
            {canSeeSuppliers && (
              <TabsTrigger value="supplier" className="gap-1.5">
                Tedarikçi
                <span className="ml-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] rounded-full bg-warning-soft text-warning">
                  {countBy("supplier")}
                </span>
              </TabsTrigger>
            )}
            {canSeeCompetitors && (
              <TabsTrigger value="competitor" className="gap-1.5">
                Rakip
                <span className="ml-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-50 px-1 text-[10px] text-rose-700">
                  {countBy("competitor")}
                </span>
              </TabsTrigger>
            )}
          </TabsList>
        </Tabs>

        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:ml-auto">
          <div className="relative w-full sm:w-72">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Firma, şehir, e-posta ara..."
              className="pl-9 h-9 bg-white"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <FilterPopover
            filters={[
              { label: "Şehir", value: city, onChange: setCity, options: uniqueSorted(customers.map((c) => c.city)).map((v) => ({ value: v, label: v })) },
              { label: "Sektör", value: sector, onChange: setSector, options: uniqueSorted(customers.map((c) => c.sector)).map((v) => ({ value: v, label: v })) },
              { label: "Tedarikçi Türü", value: supplierCategory, onChange: (value) => setSupplierCategory(value as typeof supplierCategory), options: [{ value: "transportation", label: "Nakliye" }, { value: "logistics", label: "Lojistik" }] },
            ]}
          />
          <Select value={sortMode} onValueChange={(value) => setSortMode(value as typeof sortMode)}>
            <SelectTrigger className="h-9 w-full bg-white sm:w-52" aria-label="Firmaları sırala">
              <SelectValue placeholder="Sıralama" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Varsayılan sıralama</SelectItem>
              <SelectItem value="name_asc">Firma adı A–Z</SelectItem>
              <SelectItem value="name_desc">Firma adı Z–A</SelectItem>
              <SelectItem value="created_desc">Oluşturma: yeni → eski</SelectItem>
              <SelectItem value="created_asc">Oluşturma: eski → yeni</SelectItem>
            </SelectContent>
          </Select>
          {hasRole("super_admin") && (
            <CompanyContactImportDialog
              divisionId={divisionTab !== "all" ? divisionTab : activeDivision}
              onImported={refresh}
            />
          )}
          <ExportExcelButton path="/exports/companies" filename="firmalar.xlsx" params={exportParams} className="h-9" />
          <ViewToggle view={view} onChange={setView} />
        </div>
      </div>

      {divisionOptions.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Bölüm:</span>
          {[{ id: "all", name: "Tümü" }, ...divisionOptions].map((d) => (
            <button
              key={d.id}
              onClick={() => {
                setDivisionTab(d.id);
                setActiveDivision(d.id);
              }}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                divisionTab === d.id
                  ? "bg-primary text-primary-foreground border-primary shadow-xs"
                  : "bg-white border-border text-foreground/70 hover:bg-muted"
              }`}
            >
              {d.name}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Müşteri Statüsü:</span>
        {(([
          { k: "all", l: "Hepsi" },
          ...(canSeePotential ? [{ k: "potential", l: "Potansiyel" }] : []),
          { k: "active_customer", l: "Cari Satış Yapılan" },
        ]) as { k: "all" | "potential" | "active_customer"; l: string }[]).map((s) => (
          <button
            key={s.k}
            onClick={() => setSalesTab(s.k)}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
              salesTab === s.k
                ? "bg-primary text-primary-foreground border-primary shadow-xs"
                : "bg-white border-border text-foreground/70 hover:bg-muted"
            }`}
          >
            {s.l}
          </button>
        ))}
      </div>
      </div>

      {view === "cards" ? (
        <>
          {filtered.length === 0 ? (
            <Card className="border-border/60 shadow-sm">{emptyState}</Card>
          ) : (
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {pageItems.map((c) => (
                <Card
                  key={c.id}
                  className="group relative overflow-hidden border-border/60 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer p-0"
                  onClick={() => openCompany(c)}
                >
                  <div className={`absolute inset-x-0 top-0 h-0.5 ${FIRM_TYPE_ACCENT[c.firmType]}`} />
                  <div className="p-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <div className={`grid size-11 shrink-0 place-items-center rounded-xl border font-display text-sm font-semibold shadow-xs ${c.type === "company" ? "border-primary/10 bg-brand-blue-soft text-primary" : "border-info/10 bg-info-soft text-info"}`}>
                        {c.logoUrl ? (
                          <img src={c.logoUrl} alt={`${c.name} logosu`} className="h-full w-full rounded-xl bg-white object-contain p-1.5" />
                        ) : (
                          companyInitials(c.name) || (c.type === "company" ? <Building2 className="size-4.5" /> : <UserIcon className="size-4.5" />)
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium leading-tight truncate group-hover:text-primary transition-colors">
                          {c.name}
                        </div>
                        <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] whitespace-nowrap ${FIRM_TYPE_COLOR[c.firmType]}`}>
                            {FIRM_TYPE_LABEL[c.firmType]}
                          </span>
                          {supplierCategoryLabel(c.supplierCategoryCode) && (
                            <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] text-sky-700">{supplierCategoryLabel(c.supplierCategoryCode)}</span>
                          )}
                          {c.salesStatus === "active_customer" ? (
                            <span className="inline-flex px-2 py-0.5 rounded-full border text-[10px] bg-success-soft text-success border-success/20">
                              Cari Satış
                            </span>
                          ) : (
                            <span className="inline-flex px-2 py-0.5 rounded-full border text-[10px] bg-muted text-muted-foreground border-border">
                              Potansiyel
                            </span>
                          )}
                          {(c.divisions ?? []).map((d) => (
                            <span key={d.id} className="inline-flex px-2 py-0.5 rounded-full border text-[10px] bg-primary/5 text-primary border-primary/20">
                              {d.name}
                            </span>
                          ))}
                        </div>
                      </div>
                      <CreateCaseDialog
                        defaultCustomerId={c.id}
                        createAsOpportunity
                        trigger={
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 shrink-0 text-primary"
                            aria-label={`${c.name} için fırsat oluştur`}
                            title="Fırsat oluştur"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <TrendingUp className="size-4" />
                          </Button>
                        }
                      />
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 -mr-1 -mt-1 shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                            aria-label={`${c.name} işlem menüsü`}
                          >
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openCompany(c)}><Eye className="size-4 mr-2" /> Görüntüle</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setEditing(c)}><Pencil className="size-4 mr-2" /> Düzenle</DropdownMenuItem>
                          <DropdownMenuItem disabled={!c.email} onClick={() => c.email && setMailRecipient({ email: c.email, name: c.contactPerson || c.name, companyId: c.id })}>
                            <Mail className="size-4 mr-2" /> E-posta gönder
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleting(c)}>
                            <Trash2 className="size-4 mr-2" /> Sil
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    <div className="space-y-1.5 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <MapPin className="size-3.5 shrink-0" />
                        <span className="truncate">{[c.city, c.district].filter(Boolean).join(" / ") || "Konum yok"}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Building2 className="size-3.5 shrink-0" />
                        <span className="truncate">Firma No: {c.companyNo || "—"}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <UserIcon className="size-3.5 shrink-0" />
                        <span className="truncate">{c.contactPerson || "—"}</span>
                        {c.phone && (
                          <span className="inline-flex items-center gap-1 shrink-0">
                            · <Phone className="size-3" />{c.phone.replace("+90 ", "")}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="border-t border-border/50 pt-2">
                      <div className="text-[11px] text-muted-foreground/80 truncate">
                        Oluşturan: {createdByLabel(c)} · {c.createdAt || "—"}
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between gap-3 px-1">
            <div className="text-xs text-muted-foreground">
              Toplam <b className="text-foreground">{filtered.length}</b> firma gösteriliyor
            </div>
            <Pager page={page} totalPages={totalPages} setPage={setPage} />
          </div>
        </>
      ) : (
      <Card className="border-border/60 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="sticky left-0 z-20 w-[300px] bg-muted text-[11px] uppercase tracking-wider text-muted-foreground">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 uppercase tracking-wider hover:text-foreground"
                    onClick={() => setSortMode((current) => current === "name_asc" ? "name_desc" : "name_asc")}
                    aria-label="Firmaya göre sırala"
                  >
                    Firma <ArrowUpDown className="size-3" />
                  </button>
                </TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Firma Tipi</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">İletişim</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Konum</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 uppercase tracking-wider hover:text-foreground"
                    onClick={() => setSortMode((current) => current === "created_desc" ? "created_asc" : "created_desc")}
                    aria-label="Oluşturulma tarihine göre sırala"
                  >
                    Oluşturma <ArrowUpDown className="size-3" />
                  </button>
                </TableHead>
                <TableHead className="text-right w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageItems.map((c) => (
                <TableRow key={c.id} className="cursor-pointer group hover:bg-primary/[0.025]" onClick={() => openCompany(c)}>
                  <TableCell className="sticky left-0 z-10 border-r border-border/60 bg-white group-hover:bg-[#f8f9fc]">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`grid size-10 shrink-0 place-items-center rounded-xl border font-display text-xs font-semibold shadow-xs ${c.type === "company" ? "border-primary/10 bg-brand-blue-soft text-primary" : "border-info/10 bg-info-soft text-info"}`}>{companyInitials(c.name)}</div>
                      <div className="min-w-0">
                        <div className="text-sm leading-tight truncate group-hover:text-primary transition-colors">{c.name}</div>
                        <div className="text-xs text-muted-foreground mt-0.5 truncate">
                          {[c.city, c.district].filter(Boolean).join(" / ") || "Konum yok"}
                        </div>
                        <div className="text-[11px] text-muted-foreground/80 mt-0.5 truncate">
                          Firma No: {c.companyNo || "—"} · {c.type === "company" ? "Kurumsal" : "Bireysel"} · {c.taxNumber || "Kimlik yok"}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] whitespace-nowrap ${FIRM_TYPE_COLOR[c.firmType]}`}>
                      {FIRM_TYPE_LABEL[c.firmType]}
                    </span>
                    {supplierCategoryLabel(c.supplierCategoryCode) && (
                      <span className="ml-1 inline-flex rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] text-sky-700">{supplierCategoryLabel(c.supplierCategoryCode)}</span>
                    )}
                    <div className="mt-1">
                      {c.salesStatus === "active_customer" ? (
                        <span className="inline-flex px-2 py-0.5 rounded-full border text-[10px] bg-success-soft text-success border-success/20">Cari Satış</span>
                      ) : (
                        <span className="inline-flex px-2 py-0.5 rounded-full border text-[10px] bg-muted text-muted-foreground border-border">Potansiyel</span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {(c.divisions ?? []).map((division) => (
                        <span key={division.id} className="rounded-full border border-primary/20 bg-primary/5 px-1.5 py-0.5 text-[10px] text-primary">{division.name}</span>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm leading-tight">{c.contactPerson}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                      <span className="inline-flex items-center gap-1"><Phone className="size-3" />{c.phone ? c.phone.replace("+90 ", "") : "—"}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="inline-flex items-center gap-1.5 text-sm">
                      <MapPin className="size-3.5 text-muted-foreground" />
                      {c.city}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-xs text-muted-foreground tabular-nums">{c.createdAt || "—"}</div>
                    <div className="mt-0.5 max-w-[150px] truncate text-[11px] text-muted-foreground/80">
                      {createdByLabel(c)}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                    <CreateCaseDialog
                      defaultCustomerId={c.id}
                      createAsOpportunity
                      trigger={
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-primary"
                          aria-label={`${c.name} için fırsat oluştur`}
                          title="Fırsat oluştur"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <TrendingUp className="size-4" />
                        </Button>
                      }
                    />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                          aria-label={`${c.name} işlem menüsü`}
                        >
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openCompany(c)}><Eye className="size-4 mr-2" /> Görüntüle</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setEditing(c)}><Pencil className="size-4 mr-2" /> Düzenle</DropdownMenuItem>
                        <DropdownMenuItem disabled={!c.email} onClick={() => c.email && setMailRecipient({ email: c.email, name: c.contactPerson || c.name, companyId: c.id })}>
                          <Mail className="size-4 mr-2" /> E-posta gönder
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleting(c)}>
                          <Trash2 className="size-4 mr-2" /> Sil
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-4">
                    {emptyState}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-border/60 bg-muted/20">
          <div className="text-xs text-muted-foreground">
            Toplam <b className="text-foreground">{filtered.length}</b> firma gösteriliyor
          </div>
          <Pager page={page} totalPages={totalPages} setPage={setPage} />
        </div>
      </Card>
      )}

      {dialogs}

      <ComposeMailDialog recipient={mailRecipient} onOpenChange={(open) => !open && setMailRecipient(null)} />

      <EditCustomerDialog customer={editing} onClose={() => setEditing(null)} />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Firmayı sil?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="block font-medium text-foreground">{deleting?.name}</span>
              Firma kimliği silinir. Bağlı kişi, satış kartı, makine, servis veya finans kaydı varsa sistem işlemi güvenli biçimde reddeder.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={async () => {
                if (!deleting) return;
                try {
                  await deleteCustomer(deleting.id);
                  toast.success("Firma silindi");
                } catch (err: any) {
                  toast.error("Firma silinemedi", { description: err?.message ?? "Bağlı kayıtlar olabilir." });
                } finally {
                  setDeleting(null);
                }
              }}
            >
              Firmayı Sil
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
