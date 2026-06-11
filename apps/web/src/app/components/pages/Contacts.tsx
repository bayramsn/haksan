import { useState } from "react";
import { Card } from "../ui/card";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Search, Download, Phone, Mail, Building2, Star } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs";
import { useStore } from "../../lib/store";
import { useDetailDialogs } from "../dialogs/DetailDialogs";
import { FilterPopover, usePaged, Pager } from "../ui/list-controls";
import { exportToCsv } from "../../../lib/exportCsv";

const initials = (n: string) => n.split(" ").slice(0, 2).map((p) => p[0]).join("").toUpperCase();
const uniqueSorted = (values: (string | undefined)[]) =>
  Array.from(new Set(values.map((v) => (v ?? "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "tr"));

export function ContactsPage() {
  const { contacts, customers } = useStore();
  const { openContact, dialogs } = useDetailDialogs();
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"all" | "primary">("all");
  const [dept, setDept] = useState("all");
  const [firmId, setFirmId] = useState("all");

  const enriched = contacts.map((k) => ({
    ...k,
    firm: customers.find((c) => c.id === k.customerId)!,
  }));

  const filtered = enriched.filter((k) => {
    if (tab === "primary" && !k.isPrimary) return false;
    if (dept !== "all" && (k.department ?? "") !== dept) return false;
    if (firmId !== "all" && k.customerId !== firmId) return false;
    const t = q.toLowerCase();
    return (
      k.name.toLowerCase().includes(t) ||
      k.email.toLowerCase().includes(t) ||
      (k.personalEmail ?? "").toLowerCase().includes(t) ||
      (k.otherEmail ?? "").toLowerCase().includes(t) ||
      k.phone.toLowerCase().includes(t) ||
      (k.mobilePhone ?? "").toLowerCase().includes(t) ||
      (k.otherPhone ?? "").toLowerCase().includes(t) ||
      k.firm?.name.toLowerCase().includes(t) ||
      k.title.toLowerCase().includes(t)
    );
  });

  const { page, setPage, totalPages, pageItems } = usePaged(filtered, 12);

  const exportExcel = () =>
    exportToCsv(
      "kontaklar",
      ["Ad Soyad", "Ünvan", "Departman", "Firma", "Telefon", "Cep", "E-posta", "Birincil"],
      filtered.map((k) => [k.name, k.title, k.department, k.firm?.name ?? "", k.phone, k.mobilePhone ?? "", k.email, k.isPrimary ? "Evet" : "Hayır"])
    );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList className="h-9 bg-muted/60">
            <TabsTrigger value="all" className="gap-1.5">
              Tümü
              <span className="ml-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] rounded-full bg-zinc-200 text-zinc-700">
                {contacts.length}
              </span>
            </TabsTrigger>
            <TabsTrigger value="primary" className="gap-1.5">
              Birincil
              <span className="ml-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] rounded-full bg-amber-100 text-amber-700">
                {contacts.filter((k) => k.isPrimary).length}
              </span>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2 ml-auto">
          <div className="relative w-72">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Kişi, firma, e-posta ara..."
              className="pl-9 h-9 bg-white"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <FilterPopover
            filters={[
              { label: "Departman", value: dept, onChange: setDept, options: uniqueSorted(contacts.map((k) => k.department)).map((v) => ({ value: v, label: v })) },
              { label: "Firma", value: firmId, onChange: setFirmId, options: customers.map((c) => ({ value: c.id, label: c.name })) },
            ]}
          />
          <Button variant="outline" size="sm" className="h-9" onClick={exportExcel}><Download className="size-4" /> Excel</Button>
        </div>
      </div>

      <Card className="border-border/60 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="w-[280px]">Kişi</TableHead>
                <TableHead>Firma</TableHead>
                <TableHead>Ünvan / Departman</TableHead>
                <TableHead>İletişim</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageItems.map((k) => (
                <TableRow key={k.id} className="group cursor-pointer" onClick={() => openContact(k)}>
                  <TableCell>
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar className="size-9">
                        <AvatarFallback className="bg-primary/15 text-primary text-xs">{initials(k.name)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="text-sm leading-tight truncate flex items-center gap-1.5">
                          {k.name}
                          {k.isPrimary && <Star className="size-3 fill-amber-400 text-amber-400" />}
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate mt-0.5">{k.note ?? "—"}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="inline-flex items-center gap-1.5 text-sm">
                      <Building2 className="size-3.5 text-muted-foreground" />
                      {k.firm?.name ?? "—"}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">{k.firm?.city}</div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm leading-tight">{k.title}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">{k.department}</div>
                  </TableCell>
                  <TableCell>
                    <div className="text-xs flex items-center gap-1.5"><Phone className="size-3 text-muted-foreground" />{k.phone}</div>
                    {k.mobilePhone && k.mobilePhone !== k.phone && (
                      <div className="text-xs flex items-center gap-1.5 mt-0.5"><Phone className="size-3 text-muted-foreground" />{k.mobilePhone}</div>
                    )}
                    {k.email ? (
                      <div className="text-xs flex items-center gap-1.5 mt-0.5"><Mail className="size-3 text-muted-foreground" />{k.email}</div>
                    ) : (
                      <div className="text-xs flex items-center gap-1.5 mt-0.5 text-muted-foreground/50 italic">E-posta yok</div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
                      <Button asChild variant="ghost" size="icon" className="size-7" disabled={!(k.mobilePhone || k.phone)} title="Ara">
                        <a href={`tel:${(k.mobilePhone || k.phone || "").replace(/\s/g, "")}`}><Phone className="size-3.5" /></a>
                      </Button>
                    {k.email && (
                      <Button asChild variant="ghost" size="icon" className="size-7" title="E-posta">
                        <a href={`mailto:${k.email}`}><Mail className="size-3.5" /></a>
                      </Button>
                    )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-16 text-sm text-muted-foreground">
                    Bu filtreye uyan kontak bulunamadı.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-border/60 bg-muted/20">
          <div className="text-xs text-muted-foreground">
            Toplam <b className="text-foreground">{filtered.length}</b> kontak
          </div>
          <Pager page={page} totalPages={totalPages} setPage={setPage} />
        </div>
      </Card>

      {dialogs}
    </div>
  );
}
