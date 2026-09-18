// Haftalık saha raporu: seçilen tarih aralığında kişi bazlı aktivite dökümü
// (aktivite türüne göre gruplu), haftanın CRM hareketi, verilen teklifler ve
// önümüzdeki haftanın planı. Ekip aktivitesi kartından farkı: sayaç değil,
// tek tek kayıt — firma, ilgili kişi, not, fırsat bağlamı, tarih.
// Yazdırma şablonu ve rapor tipi @haksan/shared'da: cron eki aynı belgeyi basar.
import { useState } from "react";
import {
  activityLogDate as trDate,
  activityLogMoney as money,
  activityLogPrintDoc,
  activityLogTotals as totalsLabel,
  companyContextLine,
  opportunityContextLine,
  PLAN_KIND_LABEL,
  weekStatsLine,
  type ActivityLogReport,
  type ActivityLogUser,
} from "@haksan/shared";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Badge } from "../../ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import { CalendarRange, Printer, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { reportService } from "../../../../lib/services";
import { printOrWarn } from "../../../lib/pageHelpers";
import { printAssetBase } from "../../../lib/print";

/** Bir anın İstanbul takvimindeki günü (`YYYY-MM-DD`). `en-CA` bu biçimi verir. */
const isoDay = (date: Date) =>
  date.toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" });

/**
 * Varsayılan aralık: içinde bulunulan haftanın pazartesi → cumartesi.
 * Hafta İstanbul takvimine göre kesilir; saat dilimi farklı bir makineden
 * bakıldığında hafta bir gün kaymasın.
 */
export const defaultRange = () => {
  // Gün aritmetiği UTC üzerinde yapılır: İstanbul gününü UTC gününe sabitleyip
  // ilerletmek, yerel saat dilimine göre gün atlama riskini ortadan kaldırır.
  const today = new Date(`${isoDay(new Date())}T00:00:00Z`);
  const monday = new Date(today);
  // getUTCDay(): 0 pazar … 6 cumartesi. Pazar günü biten haftaya sayılır.
  monday.setUTCDate(today.getUTCDate() - ((today.getUTCDay() + 6) % 7));
  const saturday = new Date(monday);
  saturday.setUTCDate(monday.getUTCDate() + 5);
  const day = (d: Date) => d.toISOString().slice(0, 10);
  return { from: day(monday), to: day(saturday) };
};

/** API aralığının `to` ucu açık (ertesi gün 00:00); ekranda son günün kendisi yazılsın. */
const inclusiveEnd = (iso: string) => new Date(new Date(iso).getTime() - 1).toISOString();

export function ActivityLogReportCard() {
  const [range, setRange] = useState(defaultRange);
  const [report, setReport] = useState<ActivityLogReport | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (range.to < range.from) {
      toast.error("Bitiş tarihi başlangıçtan önce olamaz");
      return;
    }
    setLoading(true);
    try {
      setReport(await reportService.activityLog(range));
    } catch (err: any) {
      toast.error("Rapor alınamadı", { description: err?.message ?? "API isteği başarısız oldu." });
    } finally {
      setLoading(false);
    }
  };

  const print = () => {
    if (!report) return;
    printOrWarn(activityLogPrintDoc(report, { letterheadSrc: `${printAssetBase()}/haksan-letterhead.png` }));
  };

  const quoteSummary = report
    ? report.users.map((user) => ({
        userName: user.userName,
        quoteCount: user.quoteCount,
        totals: totalsLabel(user.quoteTotals),
        activityCount: user.activityCount,
        documents: [...new Set(report.quotes.filter((q) => q.userName === user.userName).map((q) => q.documentNo))],
      }))
    : [];

  // Kaydı, teklifi ya da hafta hareketi (kaçırılan takip, geciken görev…) olan herkes görünür.
  const activeUsers = report ? report.users.filter((u) => u.activityCount || u.quoteCount || weekStatsLine(u.week)) : [];
  const planUsers = report ? report.users.filter((u) => u.plan.length) : [];

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarRange className="size-4" /> Haftalık Aktivite ve Teklif Raporu
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Seçilen aralıkta kişi bazlı aktivite dökümü — fırsat içi/dışı fark etmeksizin — haftanın CRM hareketi, verilen teklifler ve önümüzdeki haftanın planı.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="date"
            className="h-9 w-[150px]"
            aria-label="Başlangıç tarihi"
            value={range.from}
            onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
          />
          <span className="text-xs text-muted-foreground">–</span>
          <Input
            type="date"
            className="h-9 w-[150px]"
            aria-label="Bitiş tarihi"
            value={range.to}
            onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
          />
          <Button size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            Raporu Getir
          </Button>
          <Button size="sm" variant="outline" onClick={print} disabled={!report}>
            <Printer className="size-3.5" /> Yazdır / PDF
          </Button>
        </div>
      </CardHeader>

      {report && (
        <CardContent className="space-y-8">
          {/* ---- kişi bazlı aktivite dökümü ---- */}
          <div className="space-y-6">
            {activeUsers.length === 0 && (
              <div className="text-sm text-muted-foreground">Bu aralıkta kayıt bulunamadı.</div>
            )}
            {activeUsers.map((user) => (
              <div key={user.userId} className="space-y-3 border-t border-border/60 pt-4 first:border-t-0 first:pt-0">
                <UserHeader user={user} />

                {user.groups.map((group) => (
                  <div key={group.typeCode} className="space-y-1.5">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {group.typeName} · {group.entries.length} kayıt
                    </div>
                    {group.entries.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground">
                        Bu türde kayıt yok.
                      </div>
                    ) : (
                      <div className="rounded-lg border border-border/60 divide-y divide-border/60">
                        {group.entries.map((entry) => {
                          const companyCtx = companyContextLine(entry.company);
                          const oppCtx = opportunityContextLine(entry.opportunity);
                          return (
                            <div key={entry.id} className="flex flex-col gap-1 p-3 sm:flex-row sm:gap-4">
                              <div className="shrink-0 text-xs tabular-nums text-muted-foreground sm:w-24">
                                {trDate(entry.occurredAt)}
                              </div>
                              <div className="min-w-0 flex-1 space-y-1.5">
                                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                                  <span className="text-sm font-medium">{entry.companyName ?? "—"}</span>
                                  {(entry.province || entry.district) && (
                                    <span className="text-xs text-muted-foreground">
                                      {[entry.province, entry.district].filter(Boolean).join(" / ")}
                                    </span>
                                  )}
                                  <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
                                    {entry.inOpportunity ? "Fırsat içi" : "Fırsat dışı"}
                                  </Badge>
                                  {entry.origin === "system" && (
                                    <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">Sistem</Badge>
                                  )}
                                </div>
                                {companyCtx && <div className="text-[11px] text-muted-foreground">{companyCtx}</div>}
                                {entry.contactName && (
                                  <div className="text-xs text-muted-foreground">
                                    İlgili: <span className="text-foreground">{entry.contactName}</span>
                                    {entry.contactTitle ? ` · ${entry.contactTitle}` : ""}
                                    {entry.contactPhone ? ` · ${entry.contactPhone}` : ""}
                                  </div>
                                )}
                                {entry.subject && <div className="text-xs text-brand-blue">{entry.subject}</div>}
                                <p className="text-sm leading-snug whitespace-pre-line">
                                  {entry.note ?? <span className="italic text-muted-foreground">Not girilmemiş.</span>}
                                </p>
                                {(entry.result || entry.opportunityTitle || entry.nextFollowUpAt || entry.opportunity?.nextAction) && (
                                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-muted-foreground">
                                    {entry.result && <span>Sonuç: {entry.result}</span>}
                                    {entry.opportunityTitle && (
                                      <span>
                                        Fırsat: {entry.opportunityTitle}
                                        {oppCtx ? ` (${oppCtx})` : ""}
                                      </span>
                                    )}
                                    {entry.opportunity?.nextAction && (
                                      <span>
                                        Sonraki adım: {entry.opportunity.nextAction}
                                        {entry.opportunity.nextActionAt ? ` · ${trDate(entry.opportunity.nextActionAt)}` : ""}
                                      </span>
                                    )}
                                    {entry.nextFollowUpAt && <span className="font-medium text-warning">Takip: {trDate(entry.nextFollowUpAt)}</span>}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* ---- verilen teklifler ---- */}
          <div className="space-y-2">
            <div className="text-sm font-semibold">Verilen teklifler</div>
            <p className="text-xs text-muted-foreground">
              Tutar, satır iskontosu düşülmüş net tutardır (KDV hariç). İl/ilçe teklifin firma adresinden gelir.
            </p>
            <div className="overflow-x-auto rounded-lg border border-border/60">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tarih</TableHead>
                    <TableHead>Teklif No</TableHead>
                    <TableHead>Durum</TableHead>
                    <TableHead>Teklif Veren</TableHead>
                    <TableHead>Firma</TableHead>
                    <TableHead>İl / İlçe</TableHead>
                    <TableHead>Ürün</TableHead>
                    <TableHead className="text-right">Adet</TableHead>
                    <TableHead className="text-right">Birim Fiyat</TableHead>
                    <TableHead className="text-right">İskonto</TableHead>
                    <TableHead className="text-right">Toplam Tutar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.quotes.map((row) => (
                    <TableRow key={`${row.id}-${row.documentNo}-${row.productName}`}>
                      <TableCell className="tabular-nums">{trDate(row.quoteDate)}</TableCell>
                      <TableCell className="tabular-nums">
                        {row.documentNo}
                        {row.revisionNo > 1 ? ` · R${row.revisionNo}` : ""}
                      </TableCell>
                      <TableCell>{row.status ?? "—"}</TableCell>
                      <TableCell>{row.userName}</TableCell>
                      <TableCell>{row.companyName ?? "—"}</TableCell>
                      <TableCell>{[row.province, row.district].filter(Boolean).join(" / ") || "—"}</TableCell>
                      <TableCell>{row.productName}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.quantity}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(row.unitPrice, row.currency)}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(row.discountAmount, row.currency)}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{money(row.lineTotal, row.currency)}</TableCell>
                    </TableRow>
                  ))}
                  {report.quotes.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={11} className="py-4 text-center text-sm text-muted-foreground">
                        Bu aralıkta teklif verilmemiş.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* ---- teklif veren kişiler ---- */}
          <div className="space-y-2">
            <div className="text-sm font-semibold">Teklif veren kişiler</div>
            <p className="text-xs text-muted-foreground">
              Teklif kesen ve kesmeyen tüm kullanıcılar; kişi bazlı teklif üretimi tek bakışta.
            </p>
            <div className="overflow-x-auto rounded-lg border border-border/60">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kişi</TableHead>
                    <TableHead className="text-right">Teklif Adedi</TableHead>
                    <TableHead className="text-right">Toplam Tutar</TableHead>
                    <TableHead className="text-right">Aktivite</TableHead>
                    <TableHead>Teklif Numaraları</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {quoteSummary.map((row) => (
                    <TableRow key={row.userName} className={row.quoteCount ? "" : "text-muted-foreground"}>
                      <TableCell>{row.userName}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.quoteCount}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.totals}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.activityCount}</TableCell>
                      <TableCell className="tabular-nums">{row.documents.join(", ") || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* ---- önümüzdeki hafta ---- */}
          <div className="space-y-2">
            <div className="text-sm font-semibold">
              Önümüzdeki hafta planı · {trDate(report.nextRange.from)} – {trDate(inclusiveEnd(report.nextRange.to))}
            </div>
            <p className="text-xs text-muted-foreground">
              Aktivitelerdeki takip tarihi, fırsat kartındaki sonraki adım, atanmış açık görevler ve takvimdeki müşteri ziyaretleri.
            </p>
            {planUsers.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground">
                Planlanmış takip, görev veya ziyaret yok.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border/60">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Kişi</TableHead>
                      <TableHead>Tarih</TableHead>
                      <TableHead>Tür</TableHead>
                      <TableHead>Firma</TableHead>
                      <TableHead>Ne yapılacak</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {planUsers.flatMap((user) =>
                      user.plan.map((item, i) => (
                        <TableRow key={`${user.userId}-${i}`}>
                          <TableCell className="font-medium">{i === 0 ? user.userName : ""}</TableCell>
                          <TableCell className="tabular-nums">{trDate(item.dueAt)}</TableCell>
                          <TableCell>{PLAN_KIND_LABEL[item.kind]}</TableCell>
                          <TableCell>{item.companyName ?? "—"}</TableCell>
                          <TableCell>{item.title}</TableCell>
                        </TableRow>
                      )),
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

/** Kişi bandı: ad, teklif/aktivite rozetleri, haftanın CRM hareketi, kaçırılan takipler, ay hedefi. */
function UserHeader({ user }: { user: ActivityLogUser }) {
  const stats = weekStatsLine(user.week);
  return (
    <div className="space-y-1.5">
      <div className="font-semibold">{user.userName}</div>
      <div className="flex flex-wrap gap-1.5 text-[11px]">
        <Badge variant={user.quoteCount ? "default" : "secondary"}>
          Teklif: {user.quoteCount} adet{user.quoteCount ? ` · ${totalsLabel(user.quoteTotals)}` : ""}
        </Badge>
        <Badge variant="secondary">Aktivite: {user.activityCount}</Badge>
        {stats.split(" · ").filter(Boolean).map((s) => (
          <Badge key={s} variant="outline">{s}</Badge>
        ))}
      </div>
      {user.week.missedFollowUps.length > 0 && (
        <div className="rounded-md border border-warning/40 bg-warning/10 px-2 py-1 text-[11px]">
          <span className="font-medium">Kaçırılan takip:</span>{" "}
          {user.week.missedFollowUps.map((m) => `${m.companyName ?? "—"} (${trDate(m.dueAt)})`).join(", ")}
        </div>
      )}
      {user.targets && user.targets.metrics.length > 0 && (
        <div className="text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground">Ay hedefi:</span>{" "}
          {user.targets.metrics
            .map((m) => `${m.label} ${m.actual}/${m.target}${m.pct != null ? ` (%${m.pct})` : ""}`)
            .join(" · ")}
          {user.targets.expectedPct != null ? ` — ay temposu %${user.targets.expectedPct}` : ""}
        </div>
      )}
    </div>
  );
}
