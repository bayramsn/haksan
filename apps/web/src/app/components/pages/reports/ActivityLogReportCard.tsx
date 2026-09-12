// Haftalık saha raporu: seçilen tarih aralığında kişi bazlı aktivite dökümü
// (aktivite türüne göre gruplu) ve verilen teklifler. Ekip aktivitesi kartından
// farkı: sayaç değil, tek tek kayıt — firma, ilgili kişi, not, tarih.
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Badge } from "../../ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import { CalendarRange, Printer, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { reportService, type ActivityLogReport } from "../../../../lib/services";
import { printOrWarn } from "../../../lib/pageHelpers";
import { esc } from "../../../lib/print";

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

/**
 * Rapor tarihleri her zaman İstanbul takviminde okunur — yurt dışından veya
 * saat dilimi farklı bir makineden bakan kullanıcı, kaydın girildiği günü
 * kaymış görmesin.
 */
const trDate = (iso: string) =>
  new Date(iso).toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" });

const money = (amount: number, currency: string) =>
  `${amount.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} ${currency}`;

const totalsLabel = (totals: Array<{ currency: string; amount: number }>) =>
  totals.length ? totals.map((t) => money(t.amount, t.currency)).join(" + ") : "—";

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
    printOrWarn(buildPrintDoc(report, range));
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

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarRange className="size-4" /> Haftalık Aktivite ve Teklif Raporu
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Seçilen aralıkta kişi bazlı aktivite dökümü — fırsat içi/dışı fark etmeksizin — ve verilen teklifler.
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
            {report.users.filter((u) => u.activityCount || u.quoteCount).length === 0 && (
              <div className="text-sm text-muted-foreground">Bu aralıkta kayıt bulunamadı.</div>
            )}
            {report.users
              .filter((user) => user.activityCount || user.quoteCount)
              .map((user) => (
                <div key={user.userId} className="space-y-3 border-t border-border/60 pt-4 first:border-t-0 first:pt-0">
                  <div className="space-y-1">
                    <div className="font-semibold">{user.userName}</div>
                    <div className="flex flex-wrap gap-1.5 text-[11px]">
                      <Badge variant={user.quoteCount ? "default" : "secondary"}>
                        Teklif: {user.quoteCount} adet{user.quoteCount ? ` · ${totalsLabel(user.quoteTotals)}` : ""}
                      </Badge>
                      <Badge variant="secondary">Aktivite: {user.activityCount}</Badge>
                    </div>
                  </div>

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
                          {group.entries.map((entry) => (
                            <div key={entry.id} className="flex flex-col gap-1 p-3 sm:flex-row sm:gap-4">
                              <div className="shrink-0 text-xs tabular-nums text-muted-foreground sm:w-24">
                                {trDate(entry.occurredAt)}
                              </div>
                              <div className="min-w-0 space-y-1.5">
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
                                </div>
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
                                {(entry.result || entry.opportunityTitle || entry.nextFollowUpAt) && (
                                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-muted-foreground">
                                    {entry.result && <span>Sonuç: {entry.result}</span>}
                                    {entry.opportunityTitle && <span>Fırsat: {entry.opportunityTitle}</span>}
                                    {entry.nextFollowUpAt && <span>Takip: {trDate(entry.nextFollowUpAt)}</span>}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
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
                    <TableHead>Teklif Veren</TableHead>
                    <TableHead>Firma</TableHead>
                    <TableHead>İl</TableHead>
                    <TableHead>İlçe</TableHead>
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
                      <TableCell className="tabular-nums">{row.documentNo}</TableCell>
                      <TableCell>{row.userName}</TableCell>
                      <TableCell>{row.companyName ?? "—"}</TableCell>
                      <TableCell>{row.province ?? "—"}</TableCell>
                      <TableCell>{row.district ?? "—"}</TableCell>
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
        </CardContent>
      )}
    </Card>
  );
}

/** Ekrandakiyle aynı üç bölüm, A4 dikey yazdırma için. */
function buildPrintDoc(report: ActivityLogReport, range: { from: string; to: string }) {
  const rows = (head: string[], body: string[][]) =>
    `<table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${
      body.length
        ? body.map((row) => `<tr>${row.map((cell) => `<td>${esc(cell)}</td>`).join("")}</tr>`).join("")
        : `<tr><td colspan="${head.length}" class="empty">Kayıt yok.</td></tr>`
    }</tbody></table>`;

  const people = report.users
    .filter((user) => user.activityCount || user.quoteCount)
    .map(
      (user) => `<section class="person">
        <h3>${esc(user.userName)}</h3>
        <div class="meta">Teklif: ${user.quoteCount} adet${
          user.quoteCount ? ` · ${esc(totalsLabel(user.quoteTotals))}` : ""
        } · Aktivite: ${user.activityCount}</div>
        ${user.groups
          .map(
            (group) => `<div class="group"><h4>${esc(group.typeName)} · ${group.entries.length} kayıt</h4>
            ${
              group.entries.length === 0
                ? '<div class="entry none">Bu türde kayıt yok.</div>'
                : group.entries
                    .map(
                      (entry) => `<div class="entry">
                  <div class="d">${esc(trDate(entry.occurredAt))}</div>
                  <div>
                    <div class="c">${esc(entry.companyName ?? "—")}${
                      entry.province || entry.district
                        ? ` <span class="k">(${esc([entry.province, entry.district].filter(Boolean).join(" / "))})</span>`
                        : ""
                    } <span class="s">${entry.inOpportunity ? "Fırsat içi" : "Fırsat dışı"}</span></div>
                    ${
                      entry.contactName
                        ? `<div class="k">İlgili: ${esc(entry.contactName)}${
                            entry.contactTitle ? ` · ${esc(entry.contactTitle)}` : ""
                          }${entry.contactPhone ? ` · ${esc(entry.contactPhone)}` : ""}</div>`
                        : ""
                    }
                    ${entry.subject ? `<div class="su">${esc(entry.subject)}</div>` : ""}
                    <div class="n">${entry.note ? esc(entry.note) : "<i>Not girilmemiş.</i>"}</div>
                    ${
                      entry.result || entry.opportunityTitle || entry.nextFollowUpAt
                        ? `<div class="k">${[
                            entry.result ? `Sonuç: ${esc(entry.result)}` : "",
                            entry.opportunityTitle ? `Fırsat: ${esc(entry.opportunityTitle)}` : "",
                            entry.nextFollowUpAt ? `Takip: ${esc(trDate(entry.nextFollowUpAt))}` : "",
                          ]
                            .filter(Boolean)
                            .join(" · ")}</div>`
                        : ""
                    }
                  </div>
                </div>`,
                    )
                    .join("")
            }</div>`,
          )
          .join("")}
      </section>`,
    )
    .join("");

  const quoteTable = rows(
    ["Tarih", "Teklif No", "Teklif Veren", "Firma", "İl", "İlçe", "Ürün", "Adet", "Birim Fiyat", "İskonto", "Toplam Tutar"],
    report.quotes.map((row) => [
      trDate(row.quoteDate),
      row.documentNo,
      row.userName,
      row.companyName ?? "—",
      row.province ?? "—",
      row.district ?? "—",
      row.productName,
      String(row.quantity),
      money(row.unitPrice, row.currency),
      money(row.discountAmount, row.currency),
      money(row.lineTotal, row.currency),
    ]),
  );

  const summaryTable = rows(
    ["Kişi", "Teklif Adedi", "Toplam Tutar", "Aktivite", "Teklif Numaraları"],
    report.users.map((user) => [
      user.userName,
      String(user.quoteCount),
      totalsLabel(user.quoteTotals),
      String(user.activityCount),
      [...new Set(report.quotes.filter((q) => q.userName === user.userName).map((q) => q.documentNo))].join(", ") || "—",
    ]),
  );

  return {
    title: `Aktivite Raporu ${range.from} – ${range.to}`,
    css: `
      *{box-sizing:border-box}
      body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1f2937;margin:28px;font-size:11px}
      h1{font-size:19px;margin:0 0 2px}
      .sub{color:#6b7280;margin:0 0 16px;font-size:11px}
      h2{font-size:13px;margin:20px 0 6px;border-bottom:1px solid #e5e7eb;padding-bottom:4px}
      .person{margin-bottom:14px}
      .person h3{font-size:13px;margin:0}
      .meta{color:#6b7280;font-size:10px;margin-bottom:4px}
      .group h4{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;margin:8px 0 3px}
      .entry{display:flex;gap:12px;padding:5px 0;border-top:1px solid #eef0f2}
      .entry .d{width:64px;flex:none;color:#6b7280}
      .entry .c{font-weight:600}
      .entry .k{font-weight:400;color:#4b5563}
      .entry .s{font-weight:400;color:#6b7280;font-size:9px}
      .entry .su{color:#3a5a72;font-size:10px}
      .entry .n{margin-top:1px;white-space:pre-line}
      .entry.none{color:#9ca3af;font-style:italic}
      table{width:100%;border-collapse:collapse;margin-top:2px}
      th,td{border:1px solid #e5e7eb;padding:4px 6px;text-align:left;vertical-align:top}
      th{background:#f3f4f6;font-size:10px}
      .empty{text-align:center;color:#9ca3af}
      @media print{
        @page{size:A4 portrait;margin:12mm}
        body{margin:0}
        thead{display:table-header-group}
        tr,.entry,.person h3{break-inside:avoid;page-break-inside:avoid}
        h2,h4{break-after:avoid;page-break-after:avoid}
      }
    `,
    body: `
      <h1>Haftalık Aktivite ve Teklif Raporu</h1>
      <p class="sub">${esc(trDate(range.from))} – ${esc(trDate(range.to))} · Haksan Makina · ${esc(
        new Date().toLocaleDateString("tr-TR"),
      )}</p>
      <h2>Kişi bazlı aktivite dökümü</h2>
      ${people || '<p class="empty">Bu aralıkta kayıt bulunamadı.</p>'}
      <h2>Verilen teklifler</h2>
      ${quoteTable}
      <h2>Teklif veren kişiler</h2>
      ${summaryTable}
    `,
  };
}
