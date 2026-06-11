import { useState } from "react";
import { Card } from "../ui/card";
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import {
  Search, Download, MoreHorizontal, Eye, Pencil, Phone, Mail, MapPin, Building2, User as UserIcon, ArrowUpDown,
} from "lucide-react";
import { Customer, FirmType } from "../../lib/mock";
import { useStore } from "../../lib/store";
import { useDetailDialogs } from "../dialogs/DetailDialogs";
import { FilterPopover, usePaged, Pager } from "../ui/list-controls";
import { exportToCsv } from "../../../lib/exportCsv";
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
  customer: "bg-blue-50 text-blue-700 border-blue-200",
  supplier_customer: "bg-brand-blue-soft text-brand-blue border-blue-200",
  supplier: "bg-amber-50 text-amber-700 border-amber-200",
};

export function CustomersPage(_props: { onSelect?: (c: Customer) => void } = {}) {
  const { customers } = useStore();
  const { openCompany, dialogs } = useDetailDialogs();
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"all" | FirmType>("all");
  const [salesTab, setSalesTab] = useState<"all" | "potential" | "active_customer">("all");
  const [city, setCity] = useState("all");
  const [sector, setSector] = useState("all");

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

  const { page, setPage, totalPages, pageItems } = usePaged(filtered, 12);

  const exportExcel = () =>
    exportToCsv(
      "firmalar",
      ["Firma", "Tip", "Müşteri Statüsü", "İletişim Kişisi", "Telefon", "E-posta", "Şehir", "VKN", "Sektör", "Oluşturma"],
      filtered.map((c) => [
        c.name,
        FIRM_TYPE_LABEL[c.firmType],
        c.firmType === "supplier" ? "—" : c.salesStatus === "active_customer" ? "Cari Satış" : "Potansiyel",
        c.contactPerson,
        c.phone,
        c.email,
        c.city,
        c.taxNumber,
        c.sector ?? "",
        c.createdAt,
      ])
    );

  const countBy = (ft: FirmType) => customers.filter((c) => c.firmType === ft).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList className="h-9 bg-muted/60">
            <TabsTrigger value="all" className="gap-1.5">
              Tümü
              <span className="ml-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] rounded-full bg-zinc-200 text-zinc-700">
                {customers.length}
              </span>
            </TabsTrigger>
            <TabsTrigger value="customer" className="gap-1.5">
              Müşteri
              <span className="ml-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] rounded-full bg-blue-100 text-blue-700">
                {countBy("customer")}
              </span>
            </TabsTrigger>
            <TabsTrigger value="supplier_customer" className="gap-1.5">
              Tedarikçi + Müşteri
              <span className="ml-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] rounded-full bg-brand-blue-soft text-brand-blue">
                {countBy("supplier_customer")}
              </span>
            </TabsTrigger>
            <TabsTrigger value="supplier" className="gap-1.5">
              Tedarikçi
              <span className="ml-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] rounded-full bg-amber-100 text-amber-700">
                {countBy("supplier")}
              </span>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2 ml-auto">
          <div className="relative w-72">
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
          <Button variant="outline" size="sm" className="h-9" onClick={exportExcel}><Download className="size-4" /> Excel</Button>
        </div>
      </div>

      {tab !== "supplier" && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Müşteri Statüsü:</span>
          {([
            { k: "all", l: "Hepsi" },
            { k: "potential", l: "Potansiyel" },
            { k: "active_customer", l: "Cari Satış Yapılan" },
          ] as const).map((s) => (
            <button
              key={s.k}
              onClick={() => setSalesTab(s.k)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                salesTab === s.k
                  ? "bg-primary/10 text-primary border-primary/30"
                  : "bg-white border-border text-foreground/70 hover:bg-muted"
              }`}
            >
              {s.l}
            </button>
          ))}
        </div>
      )}

      <Card className="border-border/60 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="w-[300px]">
                  <button className="inline-flex items-center gap-1 hover:text-foreground">
                    Firma <ArrowUpDown className="size-3" />
                  </button>
                </TableHead>
                <TableHead>Firma Tipi</TableHead>
                <TableHead>Müşteri Statüsü</TableHead>
                <TableHead>İletişim</TableHead>
                <TableHead>Konum</TableHead>
                <TableHead>Grup / Kaynak</TableHead>
                <TableHead>Oluşturma</TableHead>
                <TableHead className="text-right w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageItems.map((c) => (
                <TableRow key={c.id} className="cursor-pointer group" onClick={() => openCompany(c)}>
                  <TableCell>
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`size-9 rounded-lg grid place-items-center text-xs shrink-0 ${
                          c.type === "company"
                            ? "bg-gradient-to-br from-primary/15 to-primary/5 text-primary"
                            : "bg-gradient-to-br from-blue-100 to-blue-50 text-blue-700"
                        }`}
                      >
                        {c.type === "company" ? <Building2 className="size-4" /> : <UserIcon className="size-4" />}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm leading-tight truncate group-hover:text-primary transition-colors">{c.name}</div>
                        <div className="text-xs text-muted-foreground mt-0.5 truncate">
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
                      <span className="inline-flex px-2 py-0.5 rounded-full border text-[11px] bg-emerald-50 text-emerald-700 border-emerald-200">
                        Cari Satış
                      </span>
                    ) : (
                      <span className="inline-flex px-2 py-0.5 rounded-full border text-[11px] bg-zinc-100 text-zinc-700 border-zinc-200">
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
                        <DropdownMenuItem onClick={() => openCompany(c)}><Pencil className="size-4 mr-2" /> Düzenle</DropdownMenuItem>
                        <DropdownMenuItem disabled={!c.email} onClick={() => c.email && (window.location.href = `mailto:${c.email}`)}>
                          <Mail className="size-4 mr-2" /> E-posta gönder
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-16">
                    <div className="text-sm text-muted-foreground">Bu filtreye uyan firma bulunamadı.</div>
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

      {dialogs}
    </div>
  );
}
