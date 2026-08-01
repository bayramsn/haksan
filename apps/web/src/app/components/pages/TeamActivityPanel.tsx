import { useEffect, useMemo, useState } from "react";
import {
  Activity as ActivityIcon, ArrowDownRight, ArrowRight, ArrowUpRight,
  CalendarDays, FileText, MapPin, Phone, Trophy, Users2,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";
import { reportService, type TeamActivityPeriod, type TeamActivityReport } from "../../../lib/services";
import { useAuth } from "../../../lib/auth";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
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
            <div className="flex items-center gap-2">
              <ActivityIcon className="size-4 text-primary" />
              <span className="text-sm font-semibold">
                {data?.scope === "self" ? "Benim aktivitem" : "Ekip aktivitesi"}
              </span>
              {data?.scope === "self" && !isSuperAdmin && (
                <Badge variant="outline" className="text-[10px]">Kendi verileriniz</Badge>
              )}
            </div>
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
                  <div key={metric.key} className="rounded-lg border border-border/60 bg-muted/15 px-3 py-2.5">
                    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                      <Icon className="size-3.5" /> {metric.label}
                    </div>
                    <div className="mt-1 font-display text-xl leading-none">{current}</div>
                    <div className="mt-1">
                      <DeltaBadge current={current} previous={previous} suffix={PREVIOUS_LABELS[period]} />
                    </div>
                  </div>
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
                    {data.users.map((user) => (
                      <TableRow key={user.userId}>
                        <TableCell className="whitespace-nowrap text-xs font-medium">{user.name}</TableCell>
                        {METRICS.map((metric) => (
                          <TableCell key={metric.key} className="text-right font-data text-xs">
                            {user[metric.key].current}
                            <span className="ml-1 text-[9px] text-muted-foreground">
                              ({user[metric.key].previous})
                            </span>
                          </TableCell>
                        ))}
                        <TableCell className="text-right font-data text-xs font-semibold">
                          {user.total.current}
                          <span className="ml-1 text-[9px] font-normal text-muted-foreground">
                            ({user.total.previous})
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                    {data.users.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={METRICS.length + 2} className="py-6 text-center text-xs text-muted-foreground">
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
    </Card>
  );
}
