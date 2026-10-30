import { useCallback, useEffect, useRef, useState } from "react";
import { Building2, ChevronDown, ChevronUp, ExternalLink, Loader2, Mail, MapPin, Paperclip, Phone, Store } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { EmptyState } from "../shared/EmptyState";
import { useAuth } from "../../../lib/auth";
import { fileService, tradeFairService, type TradeFairContactDTO } from "../../../lib/services";
import { AddToCompaniesDialog, AttachmentTile } from "./TradeFairsPage";

const PAGE_SIZE = 30;

type Attachment = { id: string; fileId: string; filename: string; mimeType: string; uploadedBy: string | null };

/** Kaydın fuarda eklenen fotoğraf/dosyaları; kart açılınca yüklenir. */
function RecordAttachments({ recordId }: { recordId: string }) {
  const [items, setItems] = useState<Attachment[] | null>(null);
  useEffect(() => {
    let alive = true;
    fileService
      .links({ entityType: "trade_fair_contact", entityId: recordId, pageSize: 100 })
      .then((res) => {
        if (!alive) return;
        setItems(
          res.data.map((l: any) => ({
            id: l.id,
            fileId: l.file.id,
            filename: l.file.originalFilename,
            mimeType: l.file.mimeType,
            uploadedBy: l.file.uploadedBy,
          })),
        );
      })
      .catch(() => alive && setItems([]));
    return () => {
      alive = false;
    };
  }, [recordId]);

  if (items === null) return <Loader2 className="size-4 animate-spin text-muted-foreground" />;
  if (!items.length) return <p className="text-[12px] text-muted-foreground">Fotoğraf ya da dosya eklenmemiş.</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <AttachmentTile key={item.id} item={item} canDelete={false} onDelete={() => undefined} />
      ))}
    </div>
  );
}

/**
 * Firmalar sayfasındaki "Fuar" sekmesi: fuarda kaydedilen firmalar, ekleriyle.
 * Henüz cariye aktarılmamış kayıt tek düğmeyle potansiyel cari olarak açılır.
 */
export function TradeFairCompaniesPanel({
  search,
  divisionId,
  onOpenCompany,
  onConverted,
}: {
  search: string;
  divisionId: string;
  onOpenCompany: (companyId: string) => void;
  onConverted: () => void;
}) {
  const { hasPermission, hasRole } = useAuth();
  const canConvert = hasRole("admin") || hasRole("super_admin") || hasPermission("contacts.create");
  const canCreateCompany = hasRole("admin") || hasRole("super_admin") || hasPermission("companies.create");
  const [rows, setRows] = useState<TradeFairContactDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [converting, setConverting] = useState<TradeFairContactDTO | null>(null);
  const seq = useRef(0);

  const load = useCallback(
    async (nextPage: number) => {
      // Geç dönen eski arama yanıtı yenisinin üstüne yazmasın.
      const mine = ++seq.current;
      setLoading(true);
      try {
        const list = await tradeFairService.list({
          q: search.trim() || undefined,
          divisionId: divisionId !== "all" ? divisionId : undefined,
          page: nextPage,
          pageSize: PAGE_SIZE,
        });
        if (mine !== seq.current) return;
        setRows((current) => (nextPage === 1 ? list.data : [...current, ...list.data]));
        setTotal(list.meta.total);
        setPage(nextPage);
      } catch (err: any) {
        if (mine === seq.current) toast.error("Fuar kayıtları yüklenemedi", { description: err?.message });
      } finally {
        if (mine === seq.current) setLoading(false);
      }
    },
    [search, divisionId],
  );

  useEffect(() => {
    void load(1);
  }, [load]);

  const converted = (row: TradeFairContactDTO) => !!(row.companyId && row.contactId);

  if (!loading && rows.length === 0) {
    return (
      <Card className="overflow-hidden border-border/70">
        <EmptyState
          scene="search"
          eyebrow="Fuar"
          title={search ? "Eşleşen fuar kaydı yok" : "Henüz fuar kaydı yok"}
          description="Fuar sayfasında eklenen firmalar burada listelenir ve cariye aktarılabilir."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <Card key={row.id} className="border-border/70 p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="truncate font-semibold">{row.companyName}</span>
                <Badge variant="outline" className="h-5 gap-1 text-[10px]"><Store className="size-3" /> {row.fairName}</Badge>
                {row.divisionName ? <Badge variant="secondary" className="h-5 text-[10px]">{row.divisionName}</Badge> : null}
                {converted(row) ? (
                  <Badge variant="outline" className="h-5 gap-1 text-[10px] text-success"><Building2 className="size-3" /> Cariye aktarıldı</Badge>
                ) : null}
              </div>
              <div className="mt-0.5 truncate text-[12px] text-muted-foreground">
                {[row.contactName, row.contactTitle].filter(Boolean).join(" · ")}
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-muted-foreground">
                {row.mobilePhone ? <span className="inline-flex items-center gap-1"><Phone className="size-3" /> {row.mobilePhone}</span> : null}
                {row.email ? <span className="inline-flex items-center gap-1"><Mail className="size-3" /> {row.email}</span> : null}
                {row.province || row.district ? (
                  <span className="inline-flex items-center gap-1"><MapPin className="size-3" /> {[row.district, row.province].filter(Boolean).join(" / ")}</span>
                ) : null}
              </div>
              {row.products.length ? (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {row.products.map((p) => <Badge key={p.id} variant="secondary" className="h-5 text-[10px]">{p.name}</Badge>)}
                </div>
              ) : null}
              {row.notes ? <p className="mt-1.5 line-clamp-2 text-[12px]">{row.notes}</p> : null}
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setExpanded((cur) => (cur === row.id ? null : row.id))}>
                <Paperclip className="size-4" /> Ekler {expanded === row.id ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
              </Button>
              {converted(row) ? (
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onOpenCompany(row.companyId!)}>
                  <ExternalLink className="size-4" /> Firmayı aç
                </Button>
              ) : canConvert ? (
                <Button size="sm" className="gap-1.5" onClick={() => setConverting(row)}>
                  <Building2 className="size-4" /> Potansiyel cariye aktar
                </Button>
              ) : null}
            </div>
          </div>
          {expanded === row.id ? (
            <div className="mt-3 border-t border-border/60 pt-3">
              <RecordAttachments recordId={row.id} />
            </div>
          ) : null}
        </Card>
      ))}
      <div className="flex items-center justify-between gap-3 px-1 text-[12px] text-muted-foreground">
        <span><span className="font-semibold text-foreground tabular-nums">{rows.length}</span> / {total} fuar kaydı</span>
        {rows.length < total ? (
          <Button variant="outline" size="sm" disabled={loading} onClick={() => void load(page + 1)}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : "Daha fazla yükle"}
          </Button>
        ) : null}
      </div>

      {converting ? (
        <AddToCompaniesDialog
          open={!!converting}
          onOpenChange={(open) => !open && setConverting(null)}
          record={converting}
          canCreateCompany={canCreateCompany}
          onAdded={() => {
            setConverting(null);
            void load(1);
            onConverted();
          }}
          onFailed={() => void load(1)}
        />
      ) : null}
    </div>
  );
}
