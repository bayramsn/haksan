import { useEffect, useMemo, useState } from "react";
import {
  Activity as ActivityIcon, ArrowDownRight, ArrowRight, ArrowUpRight,
  Building2, CalendarDays, ChevronRight, Clock3, FileText, MapPin, Phone, Trophy, Users2,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";
import {
  reportService,
  type TeamActivityDetails,
  type TeamActivityMetric,
  type TeamActivityPeriod,
  type TeamActivityReport,
} from "../../../lib/services";
import { useAuth } from "../../../lib/auth";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";

const PERIOD_LABELS: Record<TeamActivityPeriod, string> = {
  day: "Bugün",
  week: "Bu hafta",
  month: "Bu ay",
  year: "Bu yıl",
};

const PREVIOUS_LABELS: Record<TeamActivityPeriod, string> = {
  day: "düne göre",
  week: "geçen haftaya göre",
  month: "geçen aya göre",
  year: "geçen yıla göre",
};

/** Kova anahtarını (ISO tarih) döneme göre okunur etikete çevirir. */
function bucketLabel(bucket: string, kind: TeamActivityReport["bucket"]) {
  const date = new Date(bucket);
  if (Number.isNaN(date.getTime())) return bucket;
  if (kind === "hour") return `${String(date.getHours()).padStart(2, "0")}:00`;
  if (kind === "month") return date.toLocaleDateString("tr-TR", { month: "short" });
  return date.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit" });
}

/** Önceki döneme göre yüzde değişim; payda sıfırsa yüzde anlamsızdır. */
function delta(current: number, previous: number) {
  if (previous === 0) return current === 0 ? { pct: 0, dir: "flat" as const } : { pct: null, dir: "up" as const };
  const pct = Math.round(((current - previous) / previous) * 100);
  return { pct, dir: pct > 0 ? ("up" as const) : pct < 0 ? ("down" as const) : ("flat" as const) };
}

function DeltaBadge({ current, previous, suffix }: { current: number; previous: number; suffix: string }) {
  const { pct, dir } = delta(current, previous);
  const tone =
    dir === "up" ? "text-success" : dir === "down" ? "text-destructive" : "text-muted-foreground";
  const Icon = dir === "up" ? ArrowUpRight : dir === "down" ? ArrowDownRight : ArrowRight;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${tone}`}>
      <Icon className="size-3" />
      {pct === null ? "yeni" : `%${Math.abs(pct)}`}
      <span className="font-normal text-muted-foreground">{suffix}</span>
    </span>
  );
}

const METRICS = [
  { key: "quotes", label: "Teklif", icon: FileText },
  { key: "visits", label: "Ziyaret", icon: MapPin },
  { key: "calls", label: "Arama", icon: Phone },
  { key: "activities", label: "Aktivite", icon: ActivityIcon },
  { key: "opportunitiesCreated", label: "Yeni fırsat", icon: Users2 },
  { key: "won", label: "Kazanılan", icon: Trophy },
] as const;

const METRIC_LABELS: Record<TeamActivityMetric, string> = {
  all: "Tüm kayıtlar",
  quotes: "Teklifler",
  visits: "Ziyaretler",
  calls: "Aramalar",
  activities: "Aktiviteler",
  opportunitiesCreated: "Yeni fırsatlar",
  won: "Kazanılan fırsatlar",
};

type DetailSelection = {
  metric: TeamActivityMetric;
  userId?: string;
  userName?: string;
};

function detailDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function TeamActivityDetailsDialog({
  selection,
  data,
  loading,
  error,
  onClose,
  onRetry,
}: {
  selection: DetailSelection | null;
  data: TeamActivityDetails | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onRetry: () => void;
}) {
  // Kayıtlar aktivite türüne göre kümelenir: tek yığın halindeki 40+ satır
  // okunmuyordu, tür başlıkları ("Müşteri Ziyareti · 41") listeyi anlaşılır
  // kılıyor. Tür sırası çokluğa göre; en yoğun iş en üstte.
  const groups = useMemo(() => {
    const map = new Map<string, TeamActivityDetails["items"]>();
    for (const item of data?.items ?? []) {
      const bucket = map.get(item.typeName);
      if (bucket) bucket.push(item);
      else map.set(item.typeName, [item]);
    }
    return [...map.entries()].sort(
      (left, right) => right[1].length - left[1].length || left[0].localeCompare(right[0], "tr-TR")
    );
  }, [data]);

  const title = selection?.userName
    ? `${selection.userName} · ${METRIC_LABELS[selection.metric]}`
    : `Ekip · ${METRIC_LABELS[selection?.metric ?? "all"]}`;

  return (
    <Dialog open={!!selection} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[88dvh] w-[min(760px,calc(100vw-1rem))] max-w-none grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0 sm:max-w-none">
        <DialogHeader className="border-b border-border/70 bg-muted/20 px-5 py-5 pr-12 sm:px-6">
          <div className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
            <span className="flex size-7 items-center justify-center rounded-full bg-primary/10">
              <ActivityIcon className="size-3.5" />
            </span>
            Ekip aktivitesi detayları
          </div>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Seçilen dönemdeki kayıtlar kişi, aktivite türü ve firma bilgisiyle tek tek listelenir.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5">
          {loading ? (
            <div className="space-y-3" aria-live="polite" aria-label="Aktivite detayları yükleniyor">
              {[0, 1, 2].map((item) => (
                <div key={item} className="h-24 animate-pulse rounded-xl border border-border/50 bg-muted/35" />
              ))}
            </div>
          ) : error ? (
            <div className="rounded-xl border border-destructive/25 bg-destructive/5 p-5 text-center">
              <p className="text-sm text-destructive">{error}</p>
              <Button className="mt-3" size="sm" variant="outline" onClick={onRetry}>Yeniden dene</Button>
            </div>
          ) : !data?.items.length ? (
            <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center">
              <ActivityIcon className="mx-auto size-8 text-muted-foreground/50" />
              <p className="mt-3 text-sm font-medium">Bu seçimde kayıt yok</p>
              <p className="mt-1 text-xs text-muted-foreground">Başka bir dönem veya aktivite türü seçebilirsiniz.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-xl border border-border/60 bg-muted/15 px-3.5 py-2.5">
                <span className="text-xs font-medium text-muted-foreground">
                  {groups.length} aktivite türü
                  {!selection?.userId && ` \u00b7 ${new Set(data.items.map((item) => item.userId)).size} kişi`}
                </span>
                <span className="font-display text-2xl font-semibold leading-none text-foreground">
                  {data.items.length}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">kayıt</span>
                </span>
              </div>

              {groups.map(([typeName, items]) => (
                <details
                  key={typeName}
                  open
                  className="group/type overflow-hidden rounded-xl border border-border/65 bg-background"
                >
                  <summary className="flex cursor-pointer list-none items-center gap-2 border-b border-transparent bg-muted/20 px-3.5 py-2.5 marker:content-none hover:bg-muted/35 group-open/type:border-border/60">
                    <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open/type:rotate-90" />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{typeName}</span>
                    <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 font-data text-[11px] font-semibold tabular-nums text-primary">
                      {items.length}
                    </span>
                  </summary>
                  <ol className="divide-y divide-border/45">
                    {items.map((item) => (
                      <li
                        key={`${item.source}-${item.id}`}
                        className="px-3.5 py-2.5 transition-colors hover:bg-muted/20"
                      >
                        <p className="break-words text-sm font-medium leading-snug text-foreground">{item.title}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                          <span
                            className={`inline-flex min-w-0 items-center gap-1 ${
                              item.company.name ? "font-medium text-foreground" : ""
                            }`}
                          >
                            <Building2 className="size-3 shrink-0" />
                            <span className="truncate">{item.company.name ?? "Firma bilgisi görünmüyor"}</span>
                          </span>
                          {!selection?.userId && (
                            <span className="inline-flex items-center gap-1">
                              <Users2 className="size-3" /> {item.userName}
                            </span>
                          )}
                          <time className="inline-flex items-center gap-1" dateTime={item.occurredAt}>
                            <Clock3 className="size-3" /> {detailDate(item.occurredAt)}
                          </time>
                        </div>
                      </li>
                    ))}
                  </ol>
                </details>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Gösterge panelinde "kim ne yaptı" bölümü. Süper admin tüm ekibi görür ve
 * kapsamı değiştirebilir; diğer kullanıcılar yalnız kendi verisini alır
 * (kısıt sunucuda uygulanır, buradaki gizleme sadece görsel sadeleştirmedir).
 */
export function TeamActivityPanel() {
  const { hasRole } = useAuth();
  const isSuperAdmin = hasRole("super_admin");
  const [period, setPeriod] = useState<TeamActivityPeriod>("week");
  const [scope, setScope] = useState<"team" | "self">(isSuperAdmin ? "team" : "self");
  const [data, setData] = useState<TeamActivityReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailSelection, setDetailSelection] = useState<DetailSelection | null>(null);
  const [detailData, setDetailData] = useState<TeamActivityDetails | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailRetry, setDetailRetry] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    reportService
      .teamActivity({ period, scope })
      .then((res) => {
        if (alive) setData(res);
      })
      .catch((err: any) => {
        if (alive) setError(err?.message ?? "Aktivite raporu yüklenemedi.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [period, scope]);

  useEffect(() => {
    if (!detailSelection) return;
    let alive = true;
    setDetailLoading(true);
    setDetailError(null);
    setDetailData(null);
    reportService
      .teamActivityDetails({
        period,
        scope,
        metric: detailSelection.metric,
        userId: detailSelection.userId,
      })
      .then((res) => {
        if (alive) setDetailData(res);
      })
      .catch((err: any) => {
        if (alive) setDetailError(err?.message ?? "Aktivite detayları yüklenemedi.");
      })
      .finally(() => {
        if (alive) setDetailLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [detailRetry, detailSelection, period, scope]);

  const openDetails = (metric: TeamActivityMetric, user?: { userId: string; name: string }) => {
    setDetailSelection({ metric, userId: user?.userId, userName: user?.name });
  };

  const chartData = useMemo(
    () =>
      (data?.timeline ?? []).map((row) => ({
        label: bucketLabel(row.bucket, data?.bucket ?? "day"),
        Teklif: row.quotes,
        Ziyaret: row.visits,
        Arama: row.calls,
        Aktivite: row.activities,
      })),
    [data]
  );

  // Sıralama tablosu: en çok iş üreten üstte. Ekip içi şeffaflık ve tatlı rekabet
  // için; sayılar zaten herkesin gördüğü rapordan geliyor, yeni veri açılmıyor.
  const ranked = useMemo(
    () => [...(data?.users ?? [])].sort((a, b) => b.total.current - a.total.current),
    [data]
  );

  const rangeLabel = data
    ? `${new Date(data.range.from).toLocaleDateString("tr-TR")} – ${new Date(
        new Date(data.range.to).getTime() - 1
      ).toLocaleDateString("tr-TR")}`
    : "";

  return (
    <Card className="border-border/70">
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <button
              type="button"
              className="group flex items-center gap-2 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60"
              disabled={!data || data.users.length === 0}
              onClick={() => openDetails("all")}
              aria-label="Tüm ekip aktivitesi kayıtlarını aç"
            >
              <span className="flex size-7 items-center justify-center rounded-full bg-primary/10 transition-colors group-hover:bg-primary/15">
                <ActivityIcon className="size-4 text-primary" />
              </span>
              <span className="text-sm font-semibold underline-offset-4 group-hover:underline">
                {data?.scope === "self" ? "Benim aktivitem" : "Ekip aktivitesi"}
              </span>
              {data?.scope === "self" && !isSuperAdmin && (
                <Badge variant="outline" className="text-[10px]">Kendi verileriniz</Badge>
              )}
            </button>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {rangeLabel && (
                <span className="inline-flex items-center gap-1">
                  <CalendarDays className="size-3" /> {rangeLabel}
                </span>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {isSuperAdmin && (
              <div className="mr-1 flex rounded-md border border-border/70 p-0.5">
                {(["team", "self"] as const).map((value) => (
                  <Button
                    key={value}
                    size="sm"
                    variant={scope === value ? "default" : "ghost"}
                    className="h-7 px-2.5 text-[10px]"
                    onClick={() => setScope(value)}
                  >
                    {value === "team" ? "Tüm ekip" : "Sadece ben"}
                  </Button>
                ))}
              </div>
            )}
            {(Object.keys(PERIOD_LABELS) as TeamActivityPeriod[]).map((value) => (
              <Button
                key={value}
                size="sm"
                variant={period === value ? "default" : "outline"}
                className="h-7 px-2.5 text-[10px]"
                onClick={() => setPeriod(value)}
              >
                {PERIOD_LABELS[value]}
              </Button>
            ))}
          </div>
        </div>

        {error ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        ) : loading && !data ? (
          <p className="text-xs text-muted-foreground">Aktiviteler yükleniyor…</p>
        ) : !data ? null : (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {METRICS.map((metric) => {
                const current = data.totals[metric.key];
                const previous = data.previousTotals[metric.key];
                const Icon = metric.icon;
                return (
                  <button
                    type="button"
                    key={metric.key}
                    disabled={current === 0}
                    onClick={() => openDetails(metric.key)}
                    className="group rounded-lg border border-border/60 bg-muted/15 px-3 py-2.5 text-left transition-[border-color,background-color,transform] hover:-translate-y-0.5 hover:border-primary/30 hover:bg-primary/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60"
                    aria-label={`${metric.label} kayıtlarını aç: ${current}`}
                  >
                    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                      <Icon className="size-3.5 transition-colors group-hover:text-primary" /> {metric.label}
                    </div>
                    <div className="mt-1 font-display text-xl leading-none">{current}</div>
                    <div className="mt-1">
                      <DeltaBadge current={current} previous={previous} suffix={PREVIOUS_LABELS[period]} />
                    </div>
                  </button>
                );
              })}
            </div>

            {chartData.length > 0 && (
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="Teklif" stackId="a" fill="var(--brand-blue)" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="Ziyaret" stackId="a" fill="#3b82f6" />
                    <Bar dataKey="Arama" stackId="a" fill="#0ea5e9" />
                    <Bar dataKey="Aktivite" stackId="a" fill="var(--success)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {data.scope === "team" && (
              <div className="overflow-x-auto rounded-lg border border-border/60">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8 text-[10px]">#</TableHead>
                      <TableHead className="text-[10px]">Kullanıcı</TableHead>
                      {METRICS.map((metric) => (
                        <TableHead key={metric.key} className="text-right text-[10px]">
                          {metric.label}
                        </TableHead>
                      ))}
                      <TableHead className="text-right text-[10px]">Toplam</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ranked.map((user, index) => (
                      <TableRow key={user.userId}>
                        <TableCell className="text-xs font-semibold tabular-nums text-muted-foreground">
                          {index === 0 && user.total.current > 0 ? (
                            <Trophy className="size-3.5 text-warning" aria-label="Dönem birincisi" />
                          ) : (
                            index + 1
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs font-medium">
                          <button
                            type="button"
                            onClick={() => openDetails("all", user)}
                            className="rounded-sm text-left underline-offset-4 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            aria-label={`${user.name} için tüm aktivite kayıtlarını aç`}
                          >
                            {user.name}
                          </button>
                        </TableCell>
                        {METRICS.map((metric) => (
                          <TableCell key={metric.key} className="text-right font-data text-xs">
                            <button
                              type="button"
                              disabled={user[metric.key].current === 0}
                              onClick={() => openDetails(metric.key, user)}
                              className="rounded-md px-1.5 py-1 tabular-nums transition-colors hover:bg-primary/8 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-65"
                              aria-label={`${user.name}: ${metric.label} kayıtlarını aç, ${user[metric.key].current} kayıt`}
                            >
                              {user[metric.key].current}
                              <span className="ml-1 text-[9px] text-muted-foreground">
                                ({user[metric.key].previous})
                              </span>
                            </button>
                          </TableCell>
                        ))}
                        <TableCell className="text-right font-data text-xs font-semibold">
                          <button
                            type="button"
                            disabled={user.total.current === 0 && user.won.current === 0}
                            onClick={() => openDetails("all", user)}
                            className="rounded-md px-1.5 py-1 tabular-nums transition-colors hover:bg-primary/8 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-65"
                            aria-label={`${user.name}: tüm kayıtları aç`}
                          >
                            {user.total.current}
                            <span className="ml-1 text-[9px] font-normal text-muted-foreground">
                              ({user.total.previous})
                            </span>
                          </button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {ranked.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={METRICS.length + 3} className="py-6 text-center text-xs text-muted-foreground">
                          Bu dönemde kayıtlı aktivite yok.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
                <p className="border-t border-border/60 px-3 py-2 text-[10px] text-muted-foreground">
                  Parantez içindeki sayılar {PREVIOUS_LABELS[period].replace(" göre", "")} aynı dönemi gösterir.
                </p>
              </div>
            )}
          </>
        )}
      </CardContent>
      <TeamActivityDetailsDialog
        selection={detailSelection}
        data={detailData}
        loading={detailLoading}
        error={detailError}
        onClose={() => setDetailSelection(null)}
        onRetry={() => setDetailRetry((value) => value + 1)}
      />
    </Card>
  );
}
