import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { calendar, reportsExtra, type CalendarEventInput, type CalendarEventPatch } from './endpoints';

export const calendarKeys = {
  events: (range: { from: string; to: string }): QueryKey => ['calendar', 'events', range],
  allEvents: ['calendar', 'events'] as const,
  stockSummary: ['reports', 'stock-summary'] as const,
};

/** Ay görünümü: bir ayın tüm etkinlikleri tek istekte. */
export function useCalendarEvents(range: { from: string; to: string }) {
  return useQuery({
    queryKey: calendarKeys.events(range),
    queryFn: () => calendar.events(range),
    staleTime: 2 * 60 * 1000,
  });
}

/** Tüm aralıklardaki etkinlik sorgularını tazeler (oluşturma/düzenleme sonrası). */
function settleCalendar(qc: ReturnType<typeof useQueryClient>) {
  return () => void qc.invalidateQueries({ queryKey: calendarKeys.allEvents });
}

export function useCreateCalendarEvent() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body: CalendarEventInput) => calendar.create(body), onSuccess: settleCalendar(qc) });
}

export function useUpdateCalendarEvent(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CalendarEventPatch) => calendar.update(id, body),
    onSuccess: settleCalendar(qc),
  });
}

export function useDeleteCalendarEvent() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => calendar.remove(id), onSuccess: settleCalendar(qc) });
}

export function useStockSummary() {
  return useQuery({ queryKey: calendarKeys.stockSummary, queryFn: () => reportsExtra.stockSummary() });
}
