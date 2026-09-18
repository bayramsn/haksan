// Haftalık aktivite ve teklif raporu: API'nin döndürdüğü şekil + A4 yazdırma
// şablonu. İkisi de burada ki web'deki "Yazdır / PDF" ile pazartesi sabahı
// süper admine giden cron eki aynı belge olsun ve tip iki tarafta elle
// kopyalanıp kaymasın.
import { esc, type PrintDocument } from "./print";

export type ActivityLogCompanyContext = {
  sector: string | null;
  /** Müşteri durumu (company_statuses.name). */
  status: string | null;
  /** İlişki tipi (company_relation_types.name). */
  relation: string | null;
  /** Firmadaki makineler: "MMT-1170 (2023), SL-8 (2021)". */
  machines: string | null;
};

export type ActivityLogOpportunityContext = {
  stage: string | null;
  estimatedValue: number | null;
  currency: string | null;
  probability: number | null;
  expectedCloseDate: string | null;
  requestedMachine: string | null;
  temperature: string | null;
  nextAction: string | null;
  nextActionAt: string | null;
};

export type ActivityLogEntry = {
  id: string;
  occurredAt: string;
  origin: "manual" | "system";
  companyName: string | null;
  companyLegalTitle: string | null;
  province: string | null;
  district: string | null;
  company: ActivityLogCompanyContext | null;
  contactName: string | null;
  contactTitle: string | null;
  contactPhone: string | null;
  subject: string;
  note: string | null;
  result: string | null;
  nextFollowUpAt: string | null;
  inOpportunity: boolean;
  opportunityTitle: string | null;
  opportunity: ActivityLogOpportunityContext | null;
};

export type ActivityLogQuoteRow = {
  id: string;
  documentNo: string;
  revisionNo: number;
  quoteDate: string;
  userName: string;
  companyName: string | null;
  province: string | null;
  district: string | null;
  status: string | null;
  statusCode: string | null;
  opportunityTitle: string | null;
  productName: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  lineTotal: number;
  currency: string;
};

export type ActivityLogMissedFollowUp = { companyName: string | null; dueAt: string; subject: string | null };

/** Haftanın CRM hareketi; kayıt dökümünün yanında "ne oldu" özeti. */
export type ActivityLogWeekStats = {
  newOpportunities: number;
  stageMoves: number;
  won: number;
  lost: number;
  tasksCompleted: number;
  tasksOverdue: number;
  missedFollowUps: ActivityLogMissedFollowUp[];
};

export type ActivityLogTargetMetric = {
  key: "quote" | "visit" | "call";
  label: string;
  target: number;
  actual: number;
  pct: number | null;
};

export type ActivityLogTargets = {
  /** `YYYY-MM` — rapor bitiş gününün ayı. */
  period: string;
  expectedPct: number | null;
  metrics: ActivityLogTargetMetric[];
};

export type ActivityLogPlanKind = "followUp" | "opportunityAction" | "task" | "visit";
export type ActivityLogPlanItem = {
  kind: ActivityLogPlanKind;
  dueAt: string;
  companyName: string | null;
  title: string;
};

export type ActivityLogUser = {
  userId: string;
  userName: string;
  activityCount: number;
  quoteCount: number;
  quoteTotals: Array<{ currency: string; amount: number }>;
  groups: Array<{ typeCode: string; typeName: string; entries: ActivityLogEntry[] }>;
  week: ActivityLogWeekStats;
  targets: ActivityLogTargets | null;
  /** Rapor bitişini izleyen 7 günün planı. */
  plan: ActivityLogPlanItem[];
};

export type ActivityLogReport = {
  range: { from: string; to: string };
  nextRange: { from: string; to: string };
  users: ActivityLogUser[];
  quotes: ActivityLogQuoteRow[];
};

// ── Biçimleme ──────────────────────────────────────────────────────────────

const TZ = "Europe/Istanbul";

/** Rapor tarihleri her zaman İstanbul takviminde; yurt dışından bakan gün kaymış görmesin. */
export const activityLogDate = (iso: string) => new Date(iso).toLocaleDateString("tr-TR", { timeZone: TZ });

/** API aralığının `to` ucu açık (ertesi gün 00:00); başlıkta son günün kendisi yazılsın. */
const inclusiveEnd = (iso: string) => new Date(new Date(iso).getTime() - 1).toISOString();
const isoDay = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ });

const dayName = (iso: string) => new Date(iso).toLocaleDateString("tr-TR", { timeZone: TZ, weekday: "short" });

export const activityLogMoney = (amount: number, currency: string) =>
  `${amount.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} ${currency}`;

export const activityLogTotals = (totals: Array<{ currency: string; amount: number }>) =>
  totals.length ? totals.map((t) => activityLogMoney(t.amount, t.currency)).join(" + ") : "—";

export const sumByCurrency = (rows: Array<{ currency: string; amount: number }>) => {
  const acc = new Map<string, number>();
  for (const r of rows) acc.set(r.currency, (acc.get(r.currency) ?? 0) + r.amount);
  return [...acc].map(([currency, amount]) => ({ currency, amount }));
};

const TEMPERATURE_LABEL: Record<string, string> = { hot: "Sıcak", warm: "Ilık", cold: "Soğuk" };
export const PLAN_KIND_LABEL: Record<ActivityLogPlanKind, string> = {
  followUp: "Takip",
  opportunityAction: "Fırsat adımı",
  task: "Görev",
  visit: "Ziyaret",
};

/** "Sektör: … · Durum: … · Makine parkı: …" — boş alanlar atlanır, hiçbiri yoksa "". */
export const companyContextLine = (ctx: ActivityLogCompanyContext | null) =>
  ctx
    ? [
        ctx.sector && `Sektör: ${ctx.sector}`,
        ctx.status && `Durum: ${ctx.status}`,
        ctx.relation && `İlişki: ${ctx.relation}`,
        ctx.machines && `Makine parkı: ${ctx.machines}`,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

/** "Teklif aşaması · 120.000 USD · %60 · Kapanış 15.10.2026 · İstenen: MMT-1170 · Sıcak" */
export const opportunityContextLine = (ctx: ActivityLogOpportunityContext | null) =>
  ctx
    ? [
        ctx.stage,
        ctx.estimatedValue != null && ctx.estimatedValue > 0 && activityLogMoney(ctx.estimatedValue, ctx.currency ?? "USD"),
        ctx.probability != null && `%${ctx.probability}`,
        ctx.expectedCloseDate && `Kapanış ${activityLogDate(ctx.expectedCloseDate)}`,
        ctx.requestedMachine && `İstenen: ${ctx.requestedMachine}`,
        ctx.temperature && (TEMPERATURE_LABEL[ctx.temperature] ?? ctx.temperature),
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

/** "Yeni fırsat 2 · Aşama hareketi 3 · Kazanılan 1 · …" — sıfırlar atlanır. */
export const weekStatsLine = (week: ActivityLogWeekStats) =>
  [
    week.newOpportunities && `Yeni fırsat ${week.newOpportunities}`,
    week.stageMoves && `Aşama hareketi ${week.stageMoves}`,
    week.won && `Kazanılan ${week.won}`,
    week.lost && `Kaybedilen ${week.lost}`,
    week.tasksCompleted && `Tamamlanan görev ${week.tasksCompleted}`,
    week.tasksOverdue && `Geciken görev ${week.tasksOverdue}`,
    week.missedFollowUps.length && `Kaçırılan takip ${week.missedFollowUps.length}`,
  ]
    .filter(Boolean)
    .join(" · ");

// ── A4 yazdırma belgesi ───────────────────────────────────────────────────

/**
 * Diğer yönetim raporlarıyla aynı iskelet: Haksan anteti, özet kutuları, lacivert
 * tablo başlıkları. Belge akan (sayfa sayısı önceden bilinmeyen) türde; .page
 * beyaz kâğıdı verir, üst/alt pay @page'den gelir. `letterheadSrc` web'de
 * `/print/haksan-letterhead.png`, sunucuda data: URL (Chromium ağa çıkmaz).
 */
export function activityLogPrintDoc(
  report: ActivityLogReport,
  opts: { letterheadSrc: string | null; generatedAt?: Date },
): PrintDocument {
  const generatedAt = new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short", timeZone: TZ }).format(
    opts.generatedAt ?? new Date(),
  );
  const trDate = activityLogDate;
  const money = activityLogMoney;
  const totalsLabel = activityLogTotals;
  // Kişi bloğu: kaydı, teklifi YA DA hafta hareketi (kazanç, geciken görev, kaçırılan takip)
  // olan herkes — hiç kayıt girmeyip takibi kaçıran kişi tam da yöneticinin görmek istediği.
  const users = report.users.filter((user) => user.activityCount || user.quoteCount || weekStatsLine(user.week));
  const all = report.users;
  const entries = all.flatMap((u) => u.groups.flatMap((g) => g.entries));
  const inOpp = entries.filter((e) => e.inOpportunity).length;
  const quoteTotal = totalsLabel(sumByCurrency(all.flatMap((u) => u.quoteTotals)));
  const quoteCount = all.reduce((n, u) => n + u.quoteCount, 0);
  const won = all.reduce((n, u) => n + u.week.won, 0);
  const lost = all.reduce((n, u) => n + u.week.lost, 0);
  const newOpps = all.reduce((n, u) => n + u.week.newOpportunities, 0);
  const planCount = all.reduce((n, u) => n + u.plan.length, 0);

  const summaryItem = (label: string, value: string) =>
    `<div class="summary-item"><div class="summary-label">${esc(label)}</div><div class="summary-value">${esc(value)}</div></div>`;

  const outcome = (entry: ActivityLogEntry) => {
    const oppLine = opportunityContextLine(entry.opportunity);
    const parts = [
      entry.result && `<div><span class="lbl">Sonuç</span>${esc(entry.result)}</div>`,
      entry.opportunityTitle &&
        `<div><span class="lbl">Fırsat</span>${esc(entry.opportunityTitle)}${oppLine ? `<div class="ctx">${esc(oppLine)}</div>` : ""}</div>`,
      entry.opportunity?.nextAction &&
        `<div><span class="lbl">Sonraki adım</span>${esc(entry.opportunity.nextAction)}${
          entry.opportunity.nextActionAt ? ` <span class="fu">${esc(trDate(entry.opportunity.nextActionAt))}</span>` : ""
        }</div>`,
      entry.nextFollowUpAt && `<div><span class="lbl">Takip</span><span class="fu">${esc(trDate(entry.nextFollowUpAt))}</span></div>`,
    ].filter(Boolean);
    return parts.length ? `<div class="outcome">${parts.join("")}</div>` : '<span class="none">—</span>';
  };

  const entryRow = (entry: ActivityLogEntry) => {
    const ctx = companyContextLine(entry.company);
    return `<tr>
    <td class="d">${esc(trDate(entry.occurredAt))}</td>
    <td>
      <div class="c">${esc(entry.companyName ?? "—")}${
        entry.province || entry.district
          ? ` <span class="loc">· ${esc([entry.province, entry.district].filter(Boolean).join(" / "))}</span>`
          : ""
      }<span class="tag${entry.inOpportunity ? "" : " out"}">${entry.inOpportunity ? "Fırsat içi" : "Fırsat dışı"}</span>${
        entry.origin === "system" ? '<span class="tag out">Sistem</span>' : ""
      }</div>
      ${ctx ? `<div class="ctx">${esc(ctx)}</div>` : ""}
      ${
        entry.contactName
          ? `<div class="contact">İlgili: <b>${esc(entry.contactName)}</b>${
              entry.contactTitle ? ` · ${esc(entry.contactTitle)}` : ""
            }${entry.contactPhone ? ` · ${esc(entry.contactPhone)}` : ""}</div>`
          : ""
      }
      ${entry.subject ? `<div class="su">${esc(entry.subject)}</div>` : ""}
      <div class="n${entry.note ? "" : " none"}">${entry.note ? esc(entry.note) : "Not girilmemiş."}</div>
    </td>
    <td>${outcome(entry)}</td>
  </tr>`;
  };

  const targetsLine = (targets: ActivityLogTargets | null) => {
    if (!targets?.metrics.length) return "";
    const [y, m] = targets.period.split("-").map(Number);
    const month = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("tr-TR", { month: "long", timeZone: "UTC" });
    const metrics = targets.metrics
      .map((x) => `<span><b>${esc(x.label)}</b> ${x.actual}/${x.target}${x.pct != null ? ` (%${x.pct})` : ""}</span>`)
      .join("");
    return `<div class="mix targets"><span class="lbl">${esc(month)} hedefi</span>${metrics}${
      targets.expectedPct != null ? `<span class="muted">ay temposu %${targets.expectedPct}</span>` : ""
    }</div>`;
  };

  const person = (user: ActivityLogUser) => {
    const own = user.groups.flatMap((g) => g.entries);
    const ownIn = own.filter((e) => e.inOpportunity).length;
    const mix = user.groups
      .filter((g) => g.entries.length)
      .map((g) => `<span><b>${g.entries.length}</b> ${esc(g.typeName)}</span>`)
      .join("");
    const stats = weekStatsLine(user.week);
    const missed = user.week.missedFollowUps
      .map((m) => `${m.companyName ?? "—"} (${trDate(m.dueAt)})`)
      .join(", ");
    return `<section class="person">
      <div class="person-head">
        <h3>${esc(user.userName)}</h3>
        <div class="chips">
          <span class="chip">Aktivite <b>${user.activityCount}</b></span>
          <span class="chip${user.quoteCount ? " quote" : ""}">${
            user.quoteCount ? `Teklif ${user.quoteCount} adet · ${esc(totalsLabel(user.quoteTotals))}` : "Teklif yok"
          }</span>
        </div>
      </div>
      ${
        own.length
          ? `<div class="mix">${mix}<span><b>${ownIn}</b> fırsat içi · <b>${own.length - ownIn}</b> fırsat dışı</span></div>`
          : ""
      }
      ${stats ? `<div class="mix stats">${esc(stats).split(" · ").map((s) => `<span>${s}</span>`).join("")}</div>` : ""}
      ${missed ? `<div class="missed"><b>Kaçırılan takip:</b> ${esc(missed)}</div>` : ""}
      ${targetsLine(user.targets)}
      ${user.groups
        .filter((group) => group.entries.length)
        .map(
          (group) => `<div class="group">
          <h4>${esc(group.typeName)} <span class="count">${group.entries.length} kayıt</span></h4>
          <table class="entries">
            <colgroup><col style="width:17mm"><col><col style="width:46mm"></colgroup>
            <thead><tr><th>Tarih</th><th>Görüşme</th><th>Sonuç &amp; Takip</th></tr></thead>
            <tbody>${group.entries.map(entryRow).join("")}</tbody>
          </table>
        </div>`,
        )
        .join("")}
    </section>`;
  };

  const table = (head: Array<{ label: string; num?: boolean; width?: string }>, body: string[][], foot?: string) =>
    `<table class="report-table"><thead><tr>${head
      .map((h) => `<th${h.num ? ' class="num"' : ""}${h.width ? ` style="width:${h.width}"` : ""}>${esc(h.label)}</th>`)
      .join("")}</tr></thead><tbody>${
      body.length
        ? body
            .map(
              (row) =>
                `<tr>${row.map((cell, i) => `<td${head[i].num ? ' class="num"' : ""}>${esc(cell)}</td>`).join("")}</tr>`,
            )
            .join("")
        : `<tr><td colspan="${head.length}" class="empty">Kayıt yok.</td></tr>`
    }</tbody>${foot ?? ""}</table>`;

  const quoteTable = table(
    [
      { label: "Tarih", width: "17mm" },
      { label: "Teklif No", width: "22mm" },
      { label: "Durum", width: "17mm" },
      { label: "Teklif Veren", width: "18mm" },
      { label: "Firma" },
      { label: "İl / İlçe", width: "18mm" },
      { label: "Ürün" },
      { label: "Adet", num: true, width: "9mm" },
      { label: "Birim Fiyat", num: true, width: "18mm" },
      { label: "İskonto", num: true, width: "15mm" },
      { label: "Toplam", num: true, width: "22mm" },
    ],
    report.quotes.map((row) => [
      trDate(row.quoteDate),
      row.revisionNo > 1 ? `${row.documentNo} · R${row.revisionNo}` : row.documentNo,
      row.status ?? "—",
      row.userName,
      row.companyName ?? "—",
      [row.province, row.district].filter(Boolean).join(" / ") || "—",
      row.productName,
      String(row.quantity),
      money(row.unitPrice, row.currency),
      money(row.discountAmount, row.currency),
      money(row.lineTotal, row.currency),
    ]),
    report.quotes.length
      ? `<tfoot><tr><td colspan="10">Toplam</td><td class="num">${esc(
          totalsLabel(sumByCurrency(report.quotes.map((q) => ({ currency: q.currency, amount: q.lineTotal })))),
        )}</td></tr></tfoot>`
      : undefined,
  );

  const summaryTable = table(
    [
      { label: "Kişi" },
      { label: "Teklif Adedi", num: true, width: "22mm" },
      { label: "Toplam Tutar", num: true, width: "38mm" },
      { label: "Aktivite", num: true, width: "18mm" },
      { label: "Teklif Numaraları" },
    ],
    report.users.map((user) => [
      user.userName,
      String(user.quoteCount),
      totalsLabel(user.quoteTotals),
      String(user.activityCount),
      [...new Set(report.quotes.filter((q) => q.userName === user.userName).map((q) => q.documentNo))].join(", ") || "—",
    ]),
  );

  const planSection = all
    .filter((u) => u.plan.length)
    .map(
      (u) => `<div class="group">
        <h4>${esc(u.userName)} <span class="count">${u.plan.length} plan</span></h4>
        <table class="entries plan">
          <colgroup><col style="width:24mm"><col style="width:22mm"><col style="width:50mm"><col></colgroup>
          <thead><tr><th>Tarih</th><th>Tür</th><th>Firma</th><th>Ne yapılacak</th></tr></thead>
          <tbody>${u.plan
            .map(
              (p) => `<tr><td class="d">${esc(trDate(p.dueAt))} <span class="muted">${esc(dayName(p.dueAt))}</span></td><td>${esc(
                PLAN_KIND_LABEL[p.kind],
              )}</td><td class="c">${esc(p.companyName ?? "—")}</td><td>${esc(p.title)}</td></tr>`,
            )
            .join("")}</tbody>
        </table>
      </div>`,
    )
    .join("");

  return {
    title: `Aktivite Raporu ${isoDay(report.range.from)} – ${isoDay(inclusiveEnd(report.range.to))}`,
    css: `
      /* Akan belge: üst/alt pay her sayfada @page'den, yan paylar .page dolgusundan. */
      @page { size: A4; margin: 10mm 0; }
      .page.activity-report { display:block; min-height:0; padding-top:0; padding-bottom:0; color:#1f2937; font-size:8.5pt; }
      .report-head { display:flex; align-items:flex-end; justify-content:space-between; gap:8mm; border-bottom:2px solid #000c69; padding-bottom:3mm; margin-top:5mm; }
      .eyebrow { color:#000c69; font-size:8pt; font-weight:700; letter-spacing:1.2px; text-transform:uppercase; }
      h1 { margin-top:1mm; font-size:18pt; line-height:1.1; color:#000; }
      .meta { text-align:right; font-size:8.5pt; line-height:1.5; color:#4b5563; }
      .summary { display:grid; grid-template-columns:repeat(6,1fr); gap:2mm; margin:5mm 0; }
      .summary-item { border:1px solid #d9deea; border-top:2px solid #000c69; padding:2.5mm; }
      .summary-label { color:#64748b; font-size:7.5pt; }
      .summary-value { margin-top:2mm; color:#111827; font-size:12pt; font-weight:700; line-height:1.2; }
      h2 { color:#000c69; font-size:11pt; margin:6mm 0 2.5mm; padding-bottom:1.2mm; border-bottom:1.5px solid #000c69; }
      .person { margin-bottom:5mm; }
      .person-head { display:flex; align-items:center; justify-content:space-between; gap:3mm; padding:2mm 3mm; background:#f4f6fb; border-left:3px solid #000c69; }
      .person-head h3 { font-size:10.5pt; color:#111827; }
      .chips { display:flex; flex-wrap:wrap; gap:1.5mm; }
      .chip { border:1px solid #c7cde0; border-radius:2mm; padding:0.6mm 2mm; font-size:7.5pt; background:#fff; white-space:nowrap; }
      .chip.quote { background:#000c69; border-color:#000c69; color:#fff; font-weight:700; }
      .mix { display:flex; flex-wrap:wrap; gap:1mm 4mm; margin:1.5mm 0 0 3mm; font-size:7.5pt; color:#475569; }
      .mix b { color:#111827; }
      .mix.stats span { padding:0.3mm 1.5mm; background:#eef2ff; border-radius:1mm; color:#1e1b4b; }
      .mix.targets .lbl { font-weight:700; color:#000c69; text-transform:uppercase; letter-spacing:.4px; font-size:6.5pt; align-self:center; }
      .missed { margin:1.5mm 0 0 3mm; padding:1.2mm 2mm; background:#fff7ed; border-left:2px solid #f59e0b; font-size:7.5pt; color:#7c2d12; }
      .muted { color:#94a3b8; font-weight:400; }
      .group { margin-top:3mm; }
      .group h4 { font-size:8pt; text-transform:uppercase; letter-spacing:.8px; color:#000c69; margin-bottom:1.2mm; }
      .group h4 .count { font-weight:400; letter-spacing:0; text-transform:none; color:#64748b; margin-left:1.5mm; }
      .entries { width:100%; table-layout:fixed; border-collapse:collapse; font-size:8pt; }
      .entries th { background:#eef2ff; color:#000c69; text-align:left; font-size:7pt; padding:1.2mm 1.8mm; text-transform:uppercase; letter-spacing:.5px; }
      .entries td { border-bottom:1px solid #e2e6ef; padding:1.8mm; vertical-align:top; }
      .entries tbody tr:nth-child(even) td { background:#fafbfd; }
      .entries.plan td { padding:1.4mm 1.8mm; }
      .d { white-space:nowrap; font-variant-numeric:tabular-nums; color:#475569; }
      .c { font-weight:700; color:#111827; }
      .loc { color:#64748b; font-weight:400; }
      .ctx { color:#64748b; font-size:7pt; margin-top:0.5mm; font-weight:400; }
      .tag { display:inline-block; margin-left:1.5mm; padding:0 1.5mm; border:1px solid #000c69; border-radius:1.5mm; color:#000c69; font-size:6.5pt; font-weight:700; vertical-align:middle; }
      .tag.out { border-color:#94a3b8; color:#64748b; }
      .contact { color:#475569; margin-top:0.6mm; }
      .contact b { color:#1f2937; font-weight:600; }
      .su { color:#3a5a72; margin-top:0.6mm; font-style:italic; }
      .n { margin-top:1mm; white-space:pre-line; line-height:1.4; }
      .none { color:#9ca3af; font-style:italic; }
      .outcome div { margin-bottom:0.8mm; }
      .outcome .lbl { display:block; color:#64748b; font-size:6.5pt; text-transform:uppercase; letter-spacing:.4px; }
      .outcome .fu { color:#b45309; font-weight:700; }
      .report-table { width:100%; table-layout:fixed; font-size:7.5pt; border-collapse:collapse; }
      .report-table th { background:#000c69; color:#fff; padding:2mm 1.5mm; text-align:left; font-weight:700; }
      .report-table th.num, .num { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }
      .report-table td { border:1px solid #d8dde8; padding:1.8mm 1.5mm; word-wrap:break-word; }
      .report-table tbody tr:nth-child(even) { background:#f8fafc; }
      .report-table tfoot td { font-weight:700; background:#eef2ff; }
      .empty { text-align:center; color:#9ca3af; }
      .footnote { margin-top:2mm; color:#64748b; font-size:7.5pt; line-height:1.4; }
      @media print {
        thead { display:table-header-group; }
        tr, .person-head, .summary-item { break-inside:avoid; page-break-inside:avoid; }
        h2, h4, .person-head { break-after:avoid; page-break-after:avoid; }
      }
    `,
    body: `
      <main class="page activity-report">
        ${opts.letterheadSrc ? `<img class="letterhead" src="${esc(opts.letterheadSrc)}" alt="HAKSAN MAKİNA">` : ""}
        <header class="report-head">
          <div><div class="eyebrow">Saha Raporu</div><h1>Haftalık Aktivite ve Teklif Raporu</h1></div>
          <div class="meta"><b>${esc(trDate(report.range.from))} – ${esc(trDate(inclusiveEnd(report.range.to)))}</b><br>${esc(
            generatedAt,
          )} tarihinde oluşturuldu<br>${users.length} kişi · Haksan Makina</div>
        </header>
        <section class="summary">
          ${summaryItem("Toplam aktivite", String(entries.length))}
          ${summaryItem("Fırsat içi / dışı", `${inOpp} / ${entries.length - inOpp}`)}
          ${summaryItem("Yeni fırsat", String(newOpps))}
          ${summaryItem("Kazanılan / Kaybedilen", `${won} / ${lost}`)}
          ${summaryItem("Verilen teklif", `${quoteCount} adet`)}
          ${summaryItem("Teklif tutarı", quoteTotal)}
        </section>
        <h2>Kişi bazlı aktivite dökümü</h2>
        ${users.map(person).join("") || '<p class="empty">Bu aralıkta kayıt bulunamadı.</p>'}
        <h2>Verilen teklifler</h2>
        ${quoteTable}
        <p class="footnote">Tutar, satır iskontosu düşülmüş net tutardır (KDV hariç). İl/ilçe teklifin firma adresinden gelir.</p>
        <h2>Teklif veren kişiler</h2>
        ${summaryTable}
        <h2>Önümüzdeki hafta planı · ${esc(trDate(report.nextRange.from))} – ${esc(trDate(inclusiveEnd(report.nextRange.to)))} · ${planCount} plan</h2>
        ${planSection || '<p class="empty">Planlanmış takip, görev veya ziyaret yok.</p>'}
        <p class="footnote">Plan; aktivitelerdeki takip tarihi, fırsat kartındaki sonraki adım, atanmış açık görevler ve takvimdeki müşteri ziyaretlerinden derlenir.</p>
      </main>`,
  };
}
