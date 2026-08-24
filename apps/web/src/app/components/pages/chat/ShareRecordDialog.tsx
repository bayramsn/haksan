import { useEffect, useMemo, useState } from "react";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "../../ui/dialog";
import { ScrollArea } from "../../ui/scroll-area";
import { quoteService, opportunityService, serviceService } from "../../../../lib/services";
import { RemoteCompanyCombobox } from "../../shared/RemoteCompanyCombobox";
import type { ChatRefType } from "@haksan/shared";
import { Link2, Search, FileText, Building2, Briefcase, LifeBuoy } from "lucide-react";

type RecordRow = { id: string; label: string; sublabel?: string };

const TABS: { type: ChatRefType; label: string; icon: any }[] = [
  { type: "company", label: "Firma", icon: Building2 },
  { type: "quote", label: "Teklif", icon: FileText },
  { type: "opportunity", label: "Satış Kartı", icon: Briefcase },
  { type: "service_ticket", label: "Servis", icon: LifeBuoy },
];

async function loadRecords(type: ChatRefType): Promise<RecordRow[]> {
  const params = { pageSize: 50 } as Record<string, number>;
  if (type === "quote") {
    const res = await quoteService.list(params);
    return (res.data ?? []).map((q: any) => ({ id: q.id, label: `Teklif ${q.documentNo}`, sublabel: q.companyName ?? q.status }));
  }
  if (type === "opportunity") {
    const res = await opportunityService.list(params);
    return (res.data ?? []).map((o: any) => ({ id: o.id, label: o.title, sublabel: o.companyName ?? undefined }));
  }
  const res = await serviceService.tickets(params);
  return (res.data ?? []).map((t: any) => ({ id: t.id, label: `Servis ${t.ticketNo}`, sublabel: t.subject }));
}

/** Bir CRM kaydını (firma/teklif/satış kartı/servis) seçip sohbette kart olarak paylaşma. */
export function ShareRecordDialog({ onShare }: { onShare: (refType: ChatRefType, refId: string) => void }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<ChatRefType>("company");
  const [rows, setRows] = useState<RecordRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (type === "company") {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    loadRecords(type).then(setRows).catch(() => setRows([])).finally(() => setLoading(false));
  }, [open, type]);

  const filtered = useMemo(
    () => rows.filter((r) => `${r.label} ${r.sublabel ?? ""}`.toLowerCase().includes(search.toLowerCase())),
    [rows, search]
  );

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSearch(""); }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" title="Kayıt paylaş (teklif, firma, servis…)">
          <Link2 className="size-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Kayıt Paylaş</DialogTitle>
          <DialogDescription>Sohbete bir CRM kaydını kart olarak iliştirin.</DialogDescription>
        </DialogHeader>
        <div className="flex gap-1.5">
          {TABS.map((t) => {
            const Icon = t.icon;
            const on = t.type === type;
            return (
              <Button key={t.type} variant={on ? "default" : "outline"} size="sm" className="flex-1 gap-1.5" onClick={() => setType(t.type)}>
                <Icon className="size-4" /> {t.label}
              </Button>
            );
          })}
        </div>
        {type === "company" ? (
          <RemoteCompanyCombobox
            value={null}
            onValueChange={(companyId) => { onShare("company", companyId); setOpen(false); setSearch(""); }}
            placeholder="Paylaşılacak firmayı ara…"
          />
        ) : <>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ara…" className="pl-8" />
          </div>
          <ScrollArea className="h-64 rounded-md border border-border/60">
          <div className="p-1.5 space-y-0.5">
            {loading && <div className="px-2 py-6 text-center text-sm text-muted-foreground">Yükleniyor…</div>}
            {!loading && filtered.map((r) => (
              <button
                key={r.id} type="button"
                onClick={() => { onShare(type, r.id); setOpen(false); setSearch(""); }}
                className="flex min-h-11 w-full flex-col justify-center rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
              >
                <span className="truncate font-medium">{r.label}</span>
                {r.sublabel && <span className="truncate text-xs text-muted-foreground">{r.sublabel}</span>}
              </button>
            ))}
            {!loading && filtered.length === 0 && (
              <div className="px-2 py-6 text-center text-sm text-muted-foreground">Kayıt bulunamadı</div>
            )}
          </div>
          </ScrollArea>
        </>}
      </DialogContent>
    </Dialog>
  );
}
