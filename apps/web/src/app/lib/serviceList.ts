import type { ServiceRequest } from './mock';

export type ServiceListFilters = {
  query: string;
  assignee: string;
  stage: string;
  from: string;
  to: string;
};

export function matchesServiceList(s: ServiceRequest, filters: ServiceListFilters, names: { company: string; machine: string }) {
  if (filters.assignee !== 'all' && (filters.assignee === '__unassigned__' ? Boolean(s.assignedUserId) : s.assignedUserId !== filters.assignee)) return false;
  if (filters.stage !== 'all' && s.stage !== filters.stage) return false;
  // Date inputs express Istanbul calendar dates, including the entire end day.
  const time = new Date(s.createdAt).getTime();
  if (filters.from && (!Number.isFinite(time) || time < Date.parse(`${filters.from}T00:00:00+03:00`))) return false;
  if (filters.to && (!Number.isFinite(time) || time >= Date.parse(`${filters.to}T00:00:00+03:00`) + 86_400_000)) return false;
  const query = filters.query.trim().toLocaleLowerCase('tr-TR');
  const haystack = [s.ticketNo, s.id, names.company, names.machine, s.description, s.diagnosisNote, s.serviceNote].filter(Boolean).join(' ').toLocaleLowerCase('tr-TR');
  return !query || query.split(/\s+/).every(word => haystack.includes(word));
}
