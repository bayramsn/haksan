import { useEffect, useMemo, useState } from "react";
import { Card } from "../ui/card";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Search, Phone, Mail, Building2, Star, Pencil, Trash2, Users, ShieldAlert } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs";
import { toast } from "sonner";
import { type Contact } from "../../lib/mock";
import { useStore } from "../../lib/store";
import { useDetailDialogs } from "../dialogs/DetailDialogs";
import { EditContactDialog } from "../dialogs/CreateDialogs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "../ui/alert-dialog";
import { FilterPopover, usePaged, Pager, ViewToggle, type ListView } from "../ui/list-controls";
import { ExportExcelButton } from "../ui/ExportExcelButton";
import { usePersistentState } from "../../lib/persist";
import { MiniKpi } from "../shared/MiniKpi";
import { EmptyState } from "../shared/EmptyState";
import { useAuth } from "../../../lib/auth";
import { ComposeMailDialog, type MailRecipient } from "../mail/ComposeMailDialog";

const initials = (n: string) => n.split(" ").slice(0, 2).map((p) => p[0]).join("").toUpperCase();
const uniqueSorted = (values: (string | undefined)[]) =>
  Array.from(new Set(values.map((v) => (v ?? "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "tr"));
const createdByLabel = (item: Pick<Contact, "createdByName" | "createdByEmail">) =>
  item.createdByName || item.createdByEmail || "—";

export function ContactsPage() {
  const { contacts, customers, deleteContact } = useStore();
  const { user, activeDivision, setActiveDivision } = useAuth();
  const { openContact, dialogs } = useDetailDialogs();
  const [editing, setEditing] = useState<Contact | null>(null);
  const [deleting, setDeleting] = useState<Contact | null>(null);
  const [mailRecipient, setMailRecipient] = useState<MailRecipient | null>(null);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"all" | "primary">("all");
  const [dept, setDept] = useState("all");
  const [firmId, setFirmId] = useState("all");
  const divisionOptions = user?.divisions ?? [];
  const [divisionTab, setDivisionTab] = useState(activeDivision !== "all" ? activeDivision : "all");
  useEffect(() => setDivisionTab(activeDivision !== "all" ? activeDivision : "all"), [activeDivision]);
  const [view, setView] = usePersistentState<ListView>("contactsView", "table");

  const enriched = contacts.map((k) => ({
    ...k,
    firm: customers.find((c) => c.id === k.customerId)!,
  }));

  const filtered = enriched.filter((k) => {
    if (tab === "primary" && !k.isPrimary) return false;
    if (dept !== "all" && (k.department ?? "") !== dept) return false;
    if (firmId !== "all" && k.customerId !== firmId) return false;
    if (divisionTab !== "all" && !k.firm?.divisions?.some((division) => division.id === divisionTab)) return false;
    const t = q.toLowerCase();
    return (
      k.name.toLowerCase().includes(t) ||
      (k.contactNo ?? "").toLowerCase().includes(t) ||
      (k.companyNo ?? k.firm?.companyNo ?? "").toLowerCase().includes(t) ||
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

  const exportParams = {
    ...(q ? { search: q } : {}),
    ...(firmId !== "all" ? { companyId: firmId } : {}),
  };

  const firmCount = useMemo(() => new Set(contacts.map((k) => k.customerId)).size, [contacts]);
  const primaryCount = contacts.filter((k) => k.isPrimary).length;
  const blacklistedCount = contacts.filter((k) => k.isBlacklisted).length;

  const emptyState = (
    <EmptyState
      scene="search"
      title="Bu filtreye uyan kontak bulunamadı"
      description="Arama terimini veya filtreleri değiştirerek tekrar deneyin."
    />
  );

  const blacklistBadge = (k: Contact) => (
    <span
      title={k.blacklistReason || "Kara listede"}
      className="shrink-0 rounded-full bg-brand-red-soft px-1.5 py-0.5 text-[10px] font-medium text-brand-red"
    >
      Kara liste
    </span>
  );

  const quickActions = (k: (typeof enriched)[number], visible = false) => (
    <div
      className={`flex items-center gap-1 ${visible ? "" : "justify-end opacity-100 sm:opacity-0 sm:group-hover:opacity-100"}`}
      onClick={(e) => e.stopPropagation()}
    >
      <Button asChild variant="ghost" size="icon" className="size-7" disabled={!(k.mobilePhone || k.phone)} title="Ara">
        <a href={`tel:${(k.mobilePhone || k.phone || "").replace(/\s/g, "")}`}><Phone className="size-3.5" /></a>
      </Button>
      {k.email && (
        <Button variant="ghost" size="icon" className="size-7" title="E-posta" onClick={() => setMailRecipient({ email: k.email, name: k.name, companyId: k.customerId, contactId: k.id })}>
          <Mail className="size-3.5" />
        </Button>
      )}
      <Button variant="ghost" size="icon" className="size-7" title="Düzenle" onClick={() => setEditing(k)}>
        <Pencil className="size-3.5" />
      </Button>
      <Button variant="ghost" size="icon" className="size-7 text-destructive hover:text-destructive" title="Sil" onClick={() => setDeleting(k)}>
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MiniKpi
          icon={<Users className="size-4" />}
          label="Toplam Kontak"
          value={contacts.length}
          tone="violet"
          onClick={() => setTab("all")}
          active={tab === "all"}
        />
        <MiniKpi
          icon={<Star className="size-4" />}
          label="Birincil"
          value={primaryCount}
          sub="birincil kontak"
          tone="amber"
          onClick={() => setTab("primary")}
          active={tab === "primary"}
        />
        <MiniKpi
          icon={<Building2 className="size-4" />}
          label="Firma Sayısı"
          value={firmCount}
          sub="kontaklı firma"
          tone="blue"
        />
        <MiniKpi
          icon={<ShieldAlert className="size-4" />}
          label="Kara Liste"
          value={blacklistedCount}
          sub={blacklistedCount > 0 ? "kara listede" : "temiz"}
          tone="red"
        />
      </div>

      {divisionOptions.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">İş alanı:</span>
          {[{ id: "all", name: "Tümü" }, ...divisionOptions].map((division) => (
            <button
              key={division.id}
              type="button"
              onClick={() => {
                setDivisionTab(division.id);
                setActiveDivision(division.id);
              }}
              className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${divisionTab === division.id ? "border-primary bg-primary text-primary-foreground shadow-xs" : "border-border bg-white text-foreground/70 hover:bg-muted"}`}
            >
              {division.name}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList className="h-9 bg-muted/60">
            <TabsTrigger value="all" className="gap-1.5">
              Tümü
              <span className="ml-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] rounded-full bg-muted text-muted-foreground">
                {contacts.length}
              </span>
            </TabsTrigger>
            <TabsTrigger value="primary" className="gap-1.5">
              Birincil
              <span className="ml-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] rounded-full bg-warning-soft text-warning">
                {primaryCount}
              </span>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:ml-auto">
          <div className="relative w-full sm:w-72">
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
          <ExportExcelButton path="/exports/contacts" filename="kontaklar.xlsx" params={exportParams} className="h-9" />
          <ViewToggle view={view} onChange={setView} />
        </div>
      </div>

      {view === "cards" ? (
        <>
          {filtered.length === 0 ? (
            <Card className="border-border/60 shadow-sm">{emptyState}</Card>
          ) : (
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {pageItems.map((k) => (
                <Card
                  key={k.id}
                  className="group relative overflow-hidden border-border/60 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer p-0"
                  onClick={() => openContact(k)}
                >
                  <div className={`absolute inset-x-0 top-0 h-0.5 ${k.isPrimary ? "bg-warning" : "bg-primary/30"}`} />
                  <div className="p-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <Avatar className="size-10 shadow-xs ring-1 ring-border/50">
                        <AvatarFallback className="bg-primary/15 text-primary text-xs">{initials(k.name)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium leading-tight truncate flex items-center gap-1.5 group-hover:text-primary transition-colors">
                          {k.name}
                          {k.isPrimary && <Star className="size-3 fill-warning text-warning shrink-0" />}
                        </div>
                        <div className="text-xs text-muted-foreground truncate mt-0.5">
                          {[k.title, k.department].filter(Boolean).join(" · ") || "—"}
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate mt-0.5">Kontak No: {k.contactNo || "—"}</div>
                        {k.isBlacklisted && <div className="mt-1">{blacklistBadge(k)}</div>}
                      </div>
                    </div>

                    <div className="space-y-1.5 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <Building2 className="size-3.5 shrink-0" />
                        <span className="truncate">{k.firm?.name ?? "—"}</span>
                        {k.firm?.city && <span className="shrink-0">· {k.firm.city}</span>}
                      </div>
                      <div className="pl-5 text-[11px]">Firma No: {k.firm?.companyNo || k.companyNo || "—"}</div>
                      <div className="flex items-center gap-1.5">
                        <Phone className="size-3.5 shrink-0" />
                        <span className="truncate">{k.mobilePhone || k.phone || "—"}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Mail className="size-3.5 shrink-0" />
                        {k.email ? (
                          <span className="truncate">{k.email}</span>
                        ) : (
                          <span className="italic text-muted-foreground/50">E-posta yok</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/50">
                      <div className="min-w-0">
                        <div className="text-[11px] text-muted-foreground truncate">{k.note ?? ""}</div>
                        <div className="text-[11px] text-muted-foreground/80 truncate">
                          Oluşturan: {createdByLabel(k)} · {k.createdAt || "—"}
                        </div>
                      </div>
                      {quickActions(k, true)}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between gap-3 px-1">
            <div className="text-xs text-muted-foreground">
              Toplam <b className="text-foreground">{filtered.length}</b> kontak
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
                <TableHead className="w-[280px] text-[11px] uppercase tracking-wider text-muted-foreground">Kişi</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Firma</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Ünvan / Departman</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">İletişim</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Oluşturma</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageItems.map((k) => (
                <TableRow key={k.id} className="group cursor-pointer hover:bg-primary/[0.025]" onClick={() => openContact(k)}>
                  <TableCell>
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar className="size-9 shadow-xs ring-1 ring-border/50">
                        <AvatarFallback className="bg-primary/15 text-primary text-xs">{initials(k.name)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="text-sm leading-tight truncate flex items-center gap-1.5 group-hover:text-primary transition-colors">
                          {k.name}
                          {k.isPrimary && <Star className="size-3 fill-warning text-warning" />}
                          {k.isBlacklisted && blacklistBadge(k)}
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate mt-0.5">Kontak No: {k.contactNo || "—"}</div>
                        <div className="text-[11px] text-muted-foreground truncate mt-0.5">{k.note ?? "—"}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="inline-flex items-center gap-1.5 text-sm">
                      <Building2 className="size-3.5 text-muted-foreground" />
                      {k.firm?.name ?? "—"}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">Firma No: {k.firm?.companyNo || k.companyNo || "—"}</div>
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
                  <TableCell>
                    <div className="text-xs text-muted-foreground tabular-nums">{k.createdAt || "—"}</div>
                    <div className="mt-0.5 max-w-[150px] truncate text-[11px] text-muted-foreground/80">
                      {createdByLabel(k)}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    {quickActions(k)}
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
            Toplam <b className="text-foreground">{filtered.length}</b> kontak
          </div>
          <Pager page={page} totalPages={totalPages} setPage={setPage} />
        </div>
      </Card>
      )}

      {dialogs}

      <ComposeMailDialog recipient={mailRecipient} onOpenChange={(open) => !open && setMailRecipient(null)} />

      <EditContactDialog contact={editing} onClose={() => setEditing(null)} />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Kontağı sil?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="block font-medium text-foreground">{deleting?.name}</span>
              {deleting ? customers.find((customer) => customer.id === deleting.customerId)?.name || "Firma bağlantısı yok" : ""} kişisi kalıcı olarak silinir. Aktivite, teklif veya servis ilişkisi varsa sistem işlemi güvenli biçimde engelleyebilir.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={async () => {
                if (!deleting) return;
                try {
                  await deleteContact(deleting.id);
                  toast.success("Kontak silindi");
                } catch (err: any) {
                  toast.error("Kontak silinemedi", { description: err?.message ?? "API isteği başarısız oldu." });
                } finally {
                  setDeleting(null);
                }
              }}
            >
              Kişiyi Sil
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
