import { useState, useEffect, useMemo } from "react";
import { Card } from "../ui/card";
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import {
  Search, MoreHorizontal, Eye, Pencil, Phone, Mail, MapPin, Building2, User as UserIcon, ArrowUpDown, Trash2,
  Handshake, Factory, Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { EditCustomerDialog } from "../dialogs/CreateDialogs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "../ui/alert-dialog";
import { Customer, FirmType } from "../../lib/mock";
import { useStore } from "../../lib/store";
import { useDetailDialogs } from "../dialogs/DetailDialogs";
import { FilterPopover, usePaged, Pager, ViewToggle, type ListView } from "../ui/list-controls";
import { ExportExcelButton } from "../ui/ExportExcelButton";
import { financeService } from "../../../lib/services";
import { useAuth } from "../../../lib/auth";
import { usePersistentState } from "../../lib/persist";
import { MiniKpi } from "../shared/MiniKpi";
import { EmptyState } from "../shared/EmptyState";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "../ui/dropdown-menu";

const uniqueSorted = (values: (string | undefined)[]) =>
  Array.from(new Set(values.map((v) => (v ?? "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "tr"));

const FIRM_TYPE_LABEL: Record<FirmType, string> = {
  customer: "Müşteri",
  supplier_customer: "Tedarikçi + Müşteri",
  supplier: "Tedarikçi",
};

const FIRM_TYPE_COLOR: Record<FirmType, string> = {
  customer: "bg-info-soft text-info border-info/20",
  supplier_customer: "bg-brand-blue-soft text-brand-blue border-brand-blue/20",
  supplier: "bg-warning-soft text-warning border-warning/20",
};

const FIRM_TYPE_ACCENT: Record<FirmType, string> = {
  customer: "bg-info",
  supplier_customer: "bg-brand-blue",
  supplier: "bg-warning",
};

export function CustomersPage(_props: { onSelect?: (c: Customer) => void } = {}) {
  const { customers, deleteCustomer } = useStore();
  const { openCompany, dialogs } = useDetailDialogs();
  // Rol bazlı görünürlük (backend ile aynı kural): yalnızca sales/service rolleri
  // kısıtlıdır. Kısıtlı kullanıcılar tedarikçi sekmesini hiç görmez; servis-only
  // kullanıcılar ayrıca potansiyel müşteri sekmesini görmez (sales görür).
  const { user } = useAuth();
  const roles = user?.roles ?? [];
  const restricted = roles.length > 0 && roles.every((r) => r === "sales" || r === "service");
  const canSeeSuppliers = !restricted;
  const canSeePotential = !restricted || roles.includes("sales");
  const [editing, setEditing] = useState<Customer | null>(null);
  const [deleting, setDeleting] = useState<Customer | null>(null);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"all" | FirmType>("all");
  const [salesTab, setSalesTab] = useState<"all" | "potential" | "active_customer">("all");
  const [city, setCity] = useState("all");
  const [sector, setSector] = useState("all");
  const [nameSort, setNameSort] = useState<"asc" | "desc" | null>(null);
  const [balanceMap, setBalanceMap] = useState<Record<string, number>>({});
  const [view, setView] = usePersistentState<ListView>("customersView", "table");

  useEffect(() => {
    financeService
      .customerBalances()
      .then((rows) => {
        const map: Record<string, number> = {};
        for (const r of rows ?? []) map[r.companyId] = r.borc ?? 0;
        setBalanceMap(map);
      })
      .catch(() => setBalanceMap({}));
  }, [customers.length]);

  const filtered = customers.filter((c) => {
    if (tab !== "all" && c.firmType !== tab) return false;
    if (salesTab !== "all" && c.firmType !== "supplier" && c.salesStatus !== salesTab) return false;
    if (salesTab !== "all" && c.firmType === "supplier") return false;
    if (city !== "all" && c.city !== city) return false;
    if (sector !== "all" && (c.sector ?? "") !== sector) return false;
    const t = q.toLowerCase();
    return (
      c.name.toLowerCase().includes(t) ||
      c.city.toLowerCase().includes(t) ||
      (c.district ?? "").toLowerCase().includes(t) ||
      c.email.toLowerCase().includes(t) ||
      (c.email2 ?? "").toLowerCase().includes(t) ||
      c.phone.toLowerCase().includes(t) ||
      (c.phone2 ?? "").toLowerCase().includes(t) ||
      (c.taxNumber ?? "").toLowerCase().includes(t) ||
      (c.sector ?? "").toLowerCase().includes(t)
    );
  });

  const sorted = useMemo(() => {
    if (!nameSort) return filtered;
    return [...filtered].sort((a, b) => {
      const cmp = a.name.localeCompare(b.name, "tr");
      return nameSort === "asc" ? cmp : -cmp;
    });
  }, [filtered, nameSort]);

  const { page, setPage, totalPages, pageItems } = usePaged(sorted, 12);

  const exportParams = {
    ...(q ? { search: q } : {}),
    ...(tab !== "all" ? { relationTypeCode: tab } : {}),
    ...(salesTab === "active_customer" ? { customerStatusCode: "active" } : {}),
    ...(salesTab === "potential" ? { customerStatusCode: "potential" } : {}),
  };

  const countBy = (ft: FirmType) => customers.filter((c) => c.firmType === ft).length;

  const totalDebt = useMemo(
    () => Object.values(balanceMap).reduce((sum, v) => sum + (v > 0 ? v : 0), 0),
    [balanceMap],
  );
  const debtorCount = useMemo(
    () => Object.values(balanceMap).filter((v) => v > 0).length,
    [balanceMap],
  );

  const emptyState = (
    <EmptyState
      icon={<Building2 className="size-6" />}
      title="Bu filtreye uyan firma bulunamadı"
      description="Arama terimini veya filtreleri değiştirerek tekrar deneyin."
    />
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
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
        <MiniKpi
          icon={<Wallet className="size-4" />}
          label="Toplam Borç"
          value={totalDebt.toLocaleString("tr-TR")}
          sub={debtorCount > 0 ? `${debtorCount} borçlu firma` : "borçlu firma yok"}
          tone="red"
        />
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
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
            ]}
          />
          <ExportExcelButton path="/exports/companies" filename="firmalar.xlsx" params={exportParams} className="h-9" />
          <ViewToggle view={view} onChange={setView} />
        </div>
      </div>

      {tab !== "supplier" && (
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
      )}

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
                      <div
                        className={`size-10 rounded-lg grid place-items-center shrink-0 shadow-xs ring-1 ring-border/50 ${
                          c.type === "company"
                            ? "bg-gradient-to-br from-primary/15 to-primary/5 text-primary"
                            : "bg-gradient-to-br from-info-soft to-info-soft/40 text-info"
                        }`}
                      >
                        {c.type === "company" ? <Building2 className="size-4.5" /> : <UserIcon className="size-4.5" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium leading-tight truncate group-hover:text-primary transition-colors">
                          {c.name}
                        </div>
                        <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] whitespace-nowrap ${FIRM_TYPE_COLOR[c.firmType]}`}>
                            {FIRM_TYPE_LABEL[c.firmType]}
                          </span>
                          {c.firmType !== "supplier" && (
                            c.salesStatus === "active_customer" ? (
                              <span className="inline-flex px-2 py-0.5 rounded-full border text-[10px] bg-success-soft text-success border-success/20">
                                Cari Satış
                              </span>
                            ) : (
                              <span className="inline-flex px-2 py-0.5 rounded-full border text-[10px] bg-muted text-muted-foreground border-border">
                                Potansiyel
                              </span>
                            )
                          )}
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="size-7 -mr-1 -mt-1 opacity-0 group-hover:opacity-100 shrink-0">
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openCompany(c)}><Eye className="size-4 mr-2" /> Görüntüle</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setEditing(c)}><Pencil className="size-4 mr-2" /> Düzenle</DropdownMenuItem>
                          <DropdownMenuItem disabled={!c.email} onClick={() => c.email && (window.location.href = `mailto:${c.email}`)}>
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
                        <UserIcon className="size-3.5 shrink-0" />
                        <span className="truncate">{c.contactPerson || "—"}</span>
                        {c.phone && (
                          <span className="inline-flex items-center gap-1 shrink-0">
                            · <Phone className="size-3" />{c.phone.replace("+90 ", "")}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/50">
                      <div className="min-w-0">
                        <div className="text-[11px] text-muted-foreground truncate">
                          {c.companyGroupName || c.source || "Grup / kaynak yok"}
                        </div>
                      </div>
                      {(balanceMap[c.id] ?? 0) > 0 ? (
                        <div className="text-right shrink-0">
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Borç</div>
                          <div className="text-sm tabular-nums text-warning font-medium">
                            {balanceMap[c.id].toLocaleString("tr-TR")}
                          </div>
                        </div>
                      ) : (
                        <span className="text-[11px] text-muted-foreground shrink-0">Borç yok</span>
                      )}
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
                <TableHead className="w-[300px] text-[11px] uppercase tracking-wider text-muted-foreground">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 uppercase tracking-wider hover:text-foreground"
                    onClick={() => setNameSort((s) => (s === "asc" ? "desc" : "asc"))}
                    aria-label="Firmaya göre sırala"
                  >
                    Firma <ArrowUpDown className="size-3" />
                  </button>
                </TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Firma Tipi</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Müşteri Statüsü</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">İletişim</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Konum</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Grup / Kaynak</TableHead>
                <TableHead className="text-right text-[11px] uppercase tracking-wider text-muted-foreground">Borç</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Oluşturma</TableHead>
                <TableHead className="text-right w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageItems.map((c) => (
                <TableRow key={c.id} className="cursor-pointer group hover:bg-primary/[0.025]" onClick={() => openCompany(c)}>
                  <TableCell>
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`size-9 rounded-lg grid place-items-center text-xs shrink-0 shadow-xs ring-1 ring-border/50 ${
                          c.type === "company"
                            ? "bg-gradient-to-br from-primary/15 to-primary/5 text-primary"
                            : "bg-gradient-to-br from-info-soft to-info-soft/40 text-info"
                        }`}
                      >
                        {c.type === "company" ? <Building2 className="size-4" /> : <UserIcon className="size-4" />}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm leading-tight truncate group-hover:text-primary transition-colors">{c.name}</div>
                        <div className="text-xs text-muted-foreground mt-0.5 truncate">
                          {[c.city, c.district].filter(Boolean).join(" / ") || "Konum yok"}
                        </div>
                        <div className="text-[11px] text-muted-foreground/80 mt-0.5 truncate">
                          {c.type === "company" ? "Kurumsal" : "Bireysel"} · {c.taxNumber || "Kimlik yok"}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] whitespace-nowrap ${FIRM_TYPE_COLOR[c.firmType]}`}>
                      {FIRM_TYPE_LABEL[c.firmType]}
                    </span>
                  </TableCell>
                  <TableCell>
                    {c.firmType === "supplier" ? (
                      <span className="text-[11px] text-muted-foreground">—</span>
                    ) : c.salesStatus === "active_customer" ? (
                      <span className="inline-flex px-2 py-0.5 rounded-full border text-[11px] bg-success-soft text-success border-success/20">
                        Cari Satış
                      </span>
                    ) : (
                      <span className="inline-flex px-2 py-0.5 rounded-full border text-[11px] bg-muted text-muted-foreground border-border">
                        Potansiyel
                      </span>
                    )}
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
                    <div className="text-xs leading-tight">{c.companyGroupName || "—"}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">{c.source || "Kaynak yok"}</div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    {(balanceMap[c.id] ?? 0) > 0 ? (
                      <span className="text-warning font-medium">{balanceMap[c.id].toLocaleString("tr-TR")}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground tabular-nums">{c.createdAt}</TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="size-8 opacity-0 group-hover:opacity-100">
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openCompany(c)}><Eye className="size-4 mr-2" /> Görüntüle</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setEditing(c)}><Pencil className="size-4 mr-2" /> Düzenle</DropdownMenuItem>
                        <DropdownMenuItem disabled={!c.email} onClick={() => c.email && (window.location.href = `mailto:${c.email}`)}>
                          <Mail className="size-4 mr-2" /> E-posta gönder
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleting(c)}>
                          <Trash2 className="size-4 mr-2" /> Sil
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="py-4">
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

      <EditCustomerDialog customer={editing} onClose={() => setEditing(null)} />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Firmayı sil?</AlertDialogTitle>
            <AlertDialogDescription>
              <b>{deleting?.name}</b> silinecek. Bağlı kayıtlar varsa işlem reddedilebilir.
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
              Sil
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
