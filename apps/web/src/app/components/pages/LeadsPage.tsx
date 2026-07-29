import { useMemo, useState } from "react";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  CircleAlert,
  Mail,
  MapPin,
  Phone,
  Search,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../../lib/auth";
import { useStore } from "../../lib/store";
import type { SalesCase } from "../../lib/mock";
import { LeadCaptureDialog } from "../dialogs/LeadCaptureDialog";
import { TrelloCsvImportDialog } from "../dialogs/TrelloCsvImportDialog";
import { EmptyState } from "../shared/EmptyState";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { Input } from "../ui/input";

const initials = (value: string) =>
  (value || "—")
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

function leadName(lead: SalesCase) {
  return (
    lead.leadCompanyTitle ||
    lead.externalMetadata?.candidate?.companyTitle ||
    lead.leadContactName ||
    "Firma bilgisi bekleniyor"
  );
}

function missingLeadFields(lead: SalesCase) {
  return [
    !lead.leadContactName ? "Kontak" : null,
    !lead.leadPhone && !lead.leadEmail && !lead.leadContactValue ? "İletişim" : null,
    !lead.leadCity ? "Konum" : null,
    !lead.requestedProduct ? "Konu" : null,
  ].filter((value): value is string => Boolean(value));
}

export function LeadsPage({ onSelect }: { onSelect: (lead: SalesCase) => void }) {
  const { cases, users, convertCase } = useStore();
  const { hasPermission } = useAuth();
  const canConvert = hasPermission("opportunities.update");
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const leads = useMemo(
    () =>
      cases
        .filter((item) => (item.qualificationStage ?? "lead") === "lead")
        .filter((item) => {
          const needle = query.trim().toLocaleLowerCase("tr-TR");
          if (!needle) return true;
          return [
            leadName(item),
            item.leadContactName,
            item.leadPhone,
            item.leadEmail,
            item.leadCity,
            item.requestedProduct,
            item.externalMetadata?.boardName,
          ].some((value) => (value ?? "").toLocaleLowerCase("tr-TR").includes(needle));
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [cases, query]
  );

  const convert = async (lead: SalesCase) => {
    if (busyId) return;
    setBusyId(lead.id);
    try {
      await convertCase(lead.id, "Lead havuzundan fırsata çevrildi");
      toast.success("Lead fırsata çevrildi", {
        description: `${leadName(lead)} · C aşamasına taşındı`,
      });
    } catch (error: any) {
      toast.error("Lead fırsata çevrilemedi", {
        description: error?.message ?? "Kayıt bilgilerini kontrol edin.",
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden border-primary/15 bg-[linear-gradient(105deg,#000c69_0%,#10298f_62%,#d71920_160%)] text-white shadow-sm">
        <CardContent className="flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-end">
          <div>
            <div className="font-data text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-100">
              Gelen satış sinyalleri
            </div>
            <div className="mt-1 font-display text-3xl font-semibold leading-none">{leads.length} lead</div>
            <p className="mt-2 max-w-xl text-sm leading-5 text-blue-100/90">
              Telefon, e-posta, dijital pazar ve aktarımlardan gelen tüm kayıtlar burada toplanır.
              Değerlendirdiğiniz kayıt C aşamasında bir fırsata dönüşür.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <LeadCaptureDialog
              trigger={<Button className="bg-white text-primary hover:bg-blue-50">Hızlı Lead</Button>}
            />
            <TrelloCsvImportDialog />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-white p-3 shadow-xs">
        <div className="relative w-full max-w-md">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Firma, kontak, telefon veya ürün ara..."
            className="h-9 bg-white pl-9"
          />
        </div>
        <Badge variant="outline" className="hidden h-7 shrink-0 sm:inline-flex">
          {leads.length} açık kayıt
        </Badge>
      </div>

      {leads.length === 0 ? (
        <Card className="border-border/70">
          <EmptyState
            scene="search"
            eyebrow="Lead havuzu"
            title="Bekleyen lead yok"
            description="Yeni bir lead ekleyin veya gelen kayıtlardan birini bu havuza aktarın."
          />
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {leads.map((lead) => {
            const owner = users.find((user) => user.id === lead.assignedUserId);
            const missing = missingLeadFields(lead);
            return (
              <Card
                key={lead.id}
                className="group overflow-hidden border-border/75 transition-[transform,border-color,box-shadow] hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
              >
                <button type="button" className="w-full text-left" onClick={() => onSelect(lead)}>
                  <div className="h-1 bg-[linear-gradient(90deg,#64748b_0%,#64748b_64%,#000c69_64%,#000c69_82%,#d71920_82%)]" />
                  <CardContent className="space-y-4 p-4">
                    <div className="flex items-start gap-3">
                      <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/8 text-primary">
                        {lead.leadCompanyTitle ? <Building2 className="size-5" /> : <UserRound className="size-5" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="truncate text-sm font-semibold group-hover:text-primary">{leadName(lead)}</h3>
                          <Badge variant="secondary" className="h-5 text-[9px]">
                            {lead.leadContactMethodName || lead.externalSource || "Manuel"}
                          </Badge>
                        </div>
                        <div className="mt-1 truncate text-xs text-muted-foreground">
                          {lead.leadContactName || "Kontak belirtilmedi"} · {lead.requestedProduct || "Konu bekleniyor"}
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-2 text-[11px] text-muted-foreground sm:grid-cols-2">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <Phone className="size-3.5 shrink-0" />
                        <span className="truncate">{lead.leadPhone || lead.leadContactValue || "Telefon yok"}</span>
                      </span>
                      <span className="flex min-w-0 items-center gap-1.5">
                        <Mail className="size-3.5 shrink-0" />
                        <span className="truncate">{lead.leadEmail || "E-posta yok"}</span>
                      </span>
                      <span className="flex min-w-0 items-center gap-1.5">
                        <MapPin className="size-3.5 shrink-0" />
                        <span className="truncate">{lead.leadCity || "Konum yok"}</span>
                      </span>
                      <span className="flex min-w-0 items-center gap-1.5">
                        <Avatar className="size-4">
                          <AvatarFallback className="bg-primary/10 text-[7px] text-primary">
                            {initials(owner?.name ?? "—")}
                          </AvatarFallback>
                        </Avatar>
                        <span className="truncate">{owner?.name || "Atanmadı"}</span>
                      </span>
                    </div>

                    <div className="flex min-h-7 flex-wrap items-center gap-1.5 border-t border-border/60 pt-3">
                      {missing.length ? (
                        <>
                          <CircleAlert className="size-3.5 text-amber-600" />
                          {missing.map((field) => (
                            <span key={field} className="rounded bg-amber-50 px-1.5 py-0.5 text-[9px] text-amber-700">
                              {field} eksik
                            </span>
                          ))}
                        </>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700">
                          <CheckCircle2 className="size-3.5" /> Temel bilgiler hazır
                        </span>
                      )}
                    </div>
                  </CardContent>
                </button>
                <div className="flex items-center justify-between border-t border-border/60 bg-muted/20 px-4 py-2.5">
                  <span className="font-data text-[9px] uppercase tracking-wide text-muted-foreground">
                    {lead.createdAt} · #{lead.id.slice(0, 8).toUpperCase()}
                  </span>
                  {canConvert && (
                    <Button
                      size="sm"
                      className="h-8 gap-1.5"
                      disabled={busyId === lead.id}
                      onClick={() => void convert(lead)}
                    >
                      {busyId === lead.id ? "Çevriliyor…" : "Fırsata çevir"}
                      <ArrowRight className="size-3.5" />
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
