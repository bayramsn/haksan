import { analyzeTargetSubject, sumMetrics, type PersonTarget, type TargetSubjectRow } from './reportMath';

export type TargetHistoryMonth = { period: string; subjects: TargetSubjectRow[] };

export function targetHistoryPeriods(period: string): string[] {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new Error('Geçerli bir hedef dönemi seçin.');
  return Array.from({ length: Number(period.slice(5)) }, (_, i) => `${period.slice(0, 4)}-${String(i + 1).padStart(2, '0')}`);
}

/** Heavy monthly reports are fetched on request, one at a time; partial history is never returned. */
export async function collectTargetHistory(
  period: string,
  fetchMonth: (month: string) => Promise<{ subjects: TargetSubjectRow[] }>,
  active: () => boolean = () => true,
): Promise<TargetHistoryMonth[]> {
  const collected: TargetHistoryMonth[] = [];
  const check = () => { if (!active()) throw new Error('Rapor dönemi veya çalışma alanı değişti; işlemi yeniden başlatın.'); };
  for (const month of targetHistoryPeriods(period)) {
    check();
    const response = await fetchMonth(month);
    check();
    collected.push({ period: month, subjects: response.subjects });
  }
  return collected;
}

export function personTargetHistory(history: TargetHistoryMonth[], userId: string) {
  const analyzed = history.map(month => {
    const row = month.subjects.find(subject => subject.subject.id === userId);
    return row ? analyzeTargetSubject(row, 100, month.period) : null;
  });
  return {
    periods: history.slice(-6).map(month => month.period),
    percentages: analyzed.slice(-6).map(analysis => analysis?.completionPct ?? null),
    ytdMetrics: sumMetrics(analyzed.map(analysis => analysis?.metrics ?? [])),
  };
}

/** Rank is computed before department/risk filters, matching the web team-wide rank. */
export function targetRanks(people: PersonTarget[]): Map<string, number> {
  const ranked = people.filter(person => person.analysis.completionPct != null)
    .sort((a, b) => (b.analysis.completionPct ?? 0) - (a.analysis.completionPct ?? 0));
  return new Map(ranked.map((person, index) => [person.row.subject.id, index + 1]));
}
