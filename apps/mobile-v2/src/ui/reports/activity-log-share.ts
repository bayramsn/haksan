import { activityLogDate as date, activityLogMoney as money, activityLogTotals, companyContextLine, opportunityContextLine, PLAN_KIND_LABEL, weekStatsLine, type ActivityLogReport } from '@haksan/shared';

/** Web raporundaki ayrıntılar mobil paylaşımda da kaybolmasın. */
export function activityLogShareText(report: ActivityLogReport): string {
  const end = new Date(new Date(report.range.to).getTime() - 1).toISOString();
  const lines = [`Haftalık Aktivite ve Teklif Raporu — ${date(report.range.from)} / ${date(end)}`];
  for (const user of report.users) {
    if (!user.activityCount && !user.quoteCount && !weekStatsLine(user.week)) continue;
    lines.push('', `${user.userName} — ${user.activityCount} aktivite · ${user.quoteCount} teklif (${activityLogTotals(user.quoteTotals)})`);
    const week = weekStatsLine(user.week);
    if (week) lines.push(week);
    for (const missed of user.week.missedFollowUps) lines.push(`Kaçırılan takip: ${missed.companyName ?? '—'} · ${date(missed.dueAt)}${missed.subject ? ` · ${missed.subject}` : ''}`);
    if (user.targets) lines.push(`Hedef (${user.targets.period}): ${user.targets.metrics.map((metric) => `${metric.label} ${metric.actual}/${metric.target}${metric.pct != null ? ` %${metric.pct}` : ''}`).join(' · ')}`);
    for (const group of user.groups) {
      lines.push(`${group.typeName} (${group.entries.length})`);
      for (const entry of group.entries) {
        lines.push(`- ${date(entry.occurredAt)} · ${entry.companyName ?? '—'} · ${[entry.province, entry.district].filter(Boolean).join(' / ')} · ${entry.inOpportunity ? 'Fırsat içi' : 'Fırsat dışı'}${entry.origin === 'system' ? ' · Sistem' : ''}`);
        const company = companyContextLine(entry.company);
        if (company) lines.push(company);
        if (entry.contactName) lines.push(`İlgili: ${[entry.contactName, entry.contactTitle, entry.contactPhone].filter(Boolean).join(' · ')}`);
        if (entry.subject) lines.push(entry.subject);
        if (entry.note) lines.push(entry.note);
        if (entry.result) lines.push(`Sonuç: ${entry.result}`);
        if (entry.inOpportunity) lines.push(`Fırsat: ${[entry.opportunityTitle, opportunityContextLine(entry.opportunity)].filter(Boolean).join(' · ')}`);
        if (entry.nextFollowUpAt) lines.push(`Sonraki takip: ${date(entry.nextFollowUpAt)}`);
      }
    }
  }
  if (report.quotes.length) {
    lines.push('', 'Verilen Teklifler');
    for (const quote of report.quotes) lines.push(`${date(quote.quoteDate)} · ${quote.documentNo} R${quote.revisionNo} · ${quote.companyName ?? '—'} · ${quote.productName} × ${quote.quantity} · Birim ${money(quote.unitPrice, quote.currency)} · İskonto ${money(quote.discountAmount, quote.currency)} · Toplam ${money(quote.lineTotal, quote.currency)} · ${quote.status ?? '—'} · ${quote.userName}${quote.opportunityTitle ? ` · ${quote.opportunityTitle}` : ''}`);
  }
  const plans = report.users.filter((user) => user.plan.length);
  if (plans.length) {
    lines.push('', 'Önümüzdeki Haftanın Planı');
    for (const user of plans) {
      lines.push(user.userName);
      for (const item of user.plan) lines.push(`${date(item.dueAt)} · ${PLAN_KIND_LABEL[item.kind]} · ${item.companyName ?? '—'} · ${item.title}`);
    }
  }
  return lines.join('\n');
}
