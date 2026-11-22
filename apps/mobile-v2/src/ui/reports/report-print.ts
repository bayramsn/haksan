import type { CurrencyNormalization, OperationalParams, OperationalReport, YearEndReport } from '@/src/api/reports.api';
import type { PrintSection } from '@/src/native/print-document';
import { bucketLabel, money, sumOperational, pct, usd, monthTitle, TARGET_STATUS_LABELS, metricLineText, analyzeTargetSubject, departmentProgress, inDepartment, type PersonTarget, type MetricLine, type TargetSubjectRow } from './reportMath';

export function reportCurrencyNote(fx?: CurrencyNormalization | null): string {
  if (!fx) return 'Kur bilgisi sunucu yanıtında yok.';
  const source = { live: 'Güncel kur', period_average: 'Dönem ortalaması', last_known: 'Son bilinen kur', fallback: 'Yedek kur' }[fx.source];
  return `${source} · kur tarihi ${fx.rateDate}${fx.unsupportedCurrencies.length ? ` · çevrilemeyen para birimleri: ${fx.unsupportedCurrencies.join(', ')}` : ''}`;
}

export function operationalReportPrint(data: OperationalReport, params: OperationalParams, scope: { ownerName?: string; departmentName?: string } = {}) {
  const totals = sumOperational(data.rows);
  const sections: PrintSection[] = [
    { title: 'Özet', rows: [
      { label: 'Toplam teklif', value: totals.quotes }, { label: 'Onaylanan / reddedilen', value: `${totals.approved} / ${totals.rejected}` },
      { label: 'Dönüşüm', value: `%${pct(totals.approved, totals.quotes)}` }, { label: 'Kazanılan / kaybedilen', value: `${totals.won} / ${totals.lost}` },
      { label: 'Servis', value: totals.service }, { label: 'Ciro (USD)', value: usd(totals.revenueUsd) },
    ] },
    { title: 'Dönem detayı', table: {
      headers: [params.period === 'monthly' ? 'Ay' : 'Yıl', 'Teklif', 'Onay', 'Red', 'Kazanılan', 'Kaybedilen', 'Servis', 'Ciro (USD)'],
      rows: [...data.rows.map(row => [bucketLabel(row.bucket), row.quotes, row.approved, row.rejected, row.won, row.lost, row.service, usd(row.revenueUsd)]),
        ['Toplam', totals.quotes, totals.approved, totals.rejected, totals.won, totals.lost, totals.service, usd(totals.revenueUsd)]],
    } },
    { title: 'Hesaplama bilgisi', lines: ['Kırılım kaydın açıldığı tarihe göredir. Kazanma ve kaybetme WIN / LOST derecesinden okunur; iptal edilen fırsatlar kayıp sayılmaz.', reportCurrencyNote(data.currencyNormalization)] },
  ];
  return { title: 'Operasyonel Rapor', subtitle: `${params.period === 'monthly' ? `${params.year} · aylık` : 'Yıllık'} · ${[scope.ownerName && `Temsilci: ${scope.ownerName}`, scope.departmentName && `Departman: ${scope.departmentName}`].filter(Boolean).join(' · ') || 'Tüm ekip'}`, sections };
}

export function yearEndReportPrint(data: YearEndReport) {
  const s = data.summary;
  const sections: PrintSection[] = [
    { title: 'Özet', rows: [
      { label: 'Toplam fırsat', value: s.total }, { label: 'Kazanılan / kaybedilen', value: `${s.won} / ${s.lost}` },
      { label: 'İptal / açık', value: `${s.cancelled} / ${s.open}` }, { label: 'Kazanma / kaybetme oranı', value: `%${s.winRate} / %${s.lossRate}` },
      { label: 'Ort. kazanılan değer', value: money(s.avgWonValue) }, { label: 'Ort. kaybedilen değer', value: money(s.avgLostValue) },
      { label: 'Ort. teklif değeri', value: money(s.avgQuoteValue) }, { label: 'Açık fırsat değeri', value: money(s.openValue) },
    ] },
    { title: 'Kaybetme Nedenleri', table: { headers: ['Neden', 'Adet', 'Değer'], rows: data.lostReasons.map(row => [row.name || row.code || 'Belirtilmemiş', row.count, money(row.value)]) } },
    { title: 'Kazanma Nedenleri', table: { headers: ['Neden', 'Adet', 'Değer'], rows: data.wonReasons.map(row => [row.reason || 'Belirtilmemiş', row.count, money(row.value)]) } },
    { title: 'Rakip Kaybı', table: { headers: ['Rakip', 'Adet', 'Değer'], rows: data.competitors.map(row => [row.name, row.count, money(row.value)]) } },
    { title: 'Teklif Fiyat Ortalamaları', table: { headers: ['Durum', 'Adet', 'Toplam', 'Ortalama'], rows: data.quotesByStatus.map(row => [row.name || row.code, row.count, money(row.totalValue), money(row.avgValue)]) } },
    { title: 'Aylık Trend', table: { headers: ['Ay', 'Kazanılan', 'Kaybedilen', 'Kazanılan değer', 'Kaybedilen değer'], rows: data.monthly.map(row => [bucketLabel(row.month), row.won, row.lost, money(row.wonValue), money(row.lostValue)]) } },
    { title: 'Temsilci Bazlı Performans', table: { headers: ['Temsilci', 'Toplam', 'Kazanılan', 'Kaybedilen', 'Kazanılan değer'], rows: data.byUser.map(row => [row.name, row.total, row.won, row.lost, money(row.wonValue)]) } },
  ];
  return { title: 'Karlılık / Yıl Sonu Raporu', subtitle: String(data.year), sections };
}

export function targetReportPrint(input: {
  period: string; departmentName?: string; problemsOnly: boolean; expectedPct: number; averagePct: number | null;
  daysLeft: number; teamMetrics: MetricLine[]; noTargetNames: string[]; people: PersonTarget[]; departments: TargetSubjectRow[]; scopedPeople: PersonTarget[]; fx?: CurrencyNormalization | null;
  focusPersonId?: string; ranks?: Map<string, number>; previousAveragePct?: number | null;
  history?: Record<string, { periods: string[]; percentages: (number | null)[]; ytdMetrics: MetricLine[] }>;
}) {
  const people = input.focusPersonId ? input.people.filter(person => person.row.subject.id === input.focusPersonId) : input.people;
  const focus = input.focusPersonId ? people[0] : undefined;
  const sections: PrintSection[] = [
    { title: input.focusPersonId ? 'Kişi özeti' : 'Ekip özeti', rows: [
      { label: 'Ortalama gerçekleşme', value: (input.focusPersonId ? focus?.analysis.completionPct : input.averagePct) == null ? '—' : `%${input.focusPersonId ? focus?.analysis.completionPct : input.averagePct}` },
      { label: 'Beklenen ilerleme', value: `%${input.expectedPct}` }, { label: 'Dönemin bitmesine kalan gün', value: input.daysLeft },
      { label: 'Görünüm', value: input.focusPersonId ? 'Kişisel' : input.problemsOnly ? 'Eksik / riskli' : 'Tüm ekip' },
      ...(!input.focusPersonId ? [
        { label: 'Hedef atanan kişi', value: input.scopedPeople.filter(person => person.row.hasTarget).length },
        { label: 'Tamamlanan / riskli / tamamlanmadı', value: ['completed', 'at_risk', 'missed'].map(status => input.scopedPeople.filter(person => person.analysis.status === status).length).join(' / ') },
        { label: 'Önceki dönem ortalaması', value: input.previousAveragePct == null ? '—' : `%${input.previousAveragePct}` },
      ] : []),
    ], lines: input.focusPersonId ? [] : [...input.teamMetrics.map(line => `${line.label}: ${metricLineText(line, input.daysLeft)}`), ...(input.noTargetNames.length ? [`Hedef girilmemiş: ${input.noTargetNames.join(', ')}`] : [])] },
    ...(input.focusPersonId ? [] : input.departments).map((row): PrintSection => {
      const members = input.scopedPeople.filter(person => inDepartment(person, row.subject.id));
      const own = analyzeTargetSubject(row, input.expectedPct, input.period);
      const progress = departmentProgress(own, members, input.expectedPct, input.period);
      return { title: `Departman · ${row.subject.name}`, rows: [
        { label: 'Kişi sayısı', value: members.length },
        { label: 'Riskli / eksik', value: members.filter(person => ['at_risk', 'missed'].includes(person.analysis.status)).length },
        { label: 'Gerçekleşme', value: progress.completionPct == null ? 'Otomatik veri yok' : `%${progress.completionPct}` },
        { label: 'Durum', value: TARGET_STATUS_LABELS[progress.status] },
      ], lines: [...own.metrics.map(line => `${line.label}: ${metricLineText(line, input.daysLeft)}`), ...own.manual.map(line => `Manuel takip · ${line.label}: ${line.target}`)] };
    }),
    ...people.map(({ row, analysis, previousPct }): PrintSection => {
      const detailHistory = input.history?.[row.subject.id];
      return {
      title: row.subject.name,
      rows: [
        { label: 'Departman', value: row.subject.departmentNames?.join(', ') || row.subject.departmentName || 'Departman yok' },
        { label: 'Durum', value: TARGET_STATUS_LABELS[analysis.status] },
        { label: 'Gerçekleşme', value: analysis.completionPct == null ? 'Otomatik veri yok' : `%${analysis.completionPct}` },
        { label: 'Önceki ay', value: previousPct == null ? '—' : `%${previousPct}` },
        { label: 'Ekip sırası', value: input.ranks?.get(row.subject.id) ?? '—' },
      ],
      ...(detailHistory ? { table: {
        headers: ['Ay', 'Gerçekleşme'],
        rows: detailHistory.periods.map((period, index) => [monthTitle(period), detailHistory.percentages[index] == null ? '—' : `%${detailHistory.percentages[index]}`]),
      } } : {}),
      lines: [
        ...analysis.metrics.map(line => `${line.label}: ${metricLineText(line, input.daysLeft)}`),
        ...analysis.manual.map(line => `Manuel takip · ${line.label}: ${line.target}`),
        ...(row.note ? [`Not: ${row.note}`] : []),
        ...(row.topSales ?? []).map(sale => `Ciroyu oluşturan: ${sale.label} — ${money(sale.amount)} ${sale.currency}`),
        ...(detailHistory?.ytdMetrics ?? []).map(line => `Yıl başından seçili döneme · ${line.label}: ${metricLineText(line)}`),
      ],
    }; }),
    { title: 'Kur bilgisi', lines: [reportCurrencyNote(input.fx)] },
  ];
  if (!people.length) sections.push({ title: 'Kişiler', lines: [input.problemsOnly ? 'Riskli veya eksik kişi yok.' : 'Bu dönem için hedef kaydı yok.'] });
  return { title: 'Hedef Gerçekleşme Raporu', subtitle: `${monthTitle(input.period)} · ${input.focusPersonId ? focus?.row.subject.name ?? 'Kişi bulunamadı' : input.departmentName || 'Tüm departmanlar'}`, sections };
}
