import { describe, expect, it } from 'vitest';
import type { ServiceRequest } from './mock';
import { matchesServiceList, type ServiceListFilters } from './serviceList';
const ticket = { id: 'srv1', ticketNo: 'CNC-SRV-001', assignedUserId: 'tech1', stage: 'Diagnosis', createdAt: '2026-11-19T21:30:00Z', description: 'Spindle arızası' } as ServiceRequest;
const names = { company: 'IŞIK Makina', machine: 'VM2 SN-42' };
const filters = (patch: Partial<ServiceListFilters> = {}): ServiceListFilters => ({ query: '', assignee: 'all', stage: 'all', from: '', to: '', ...patch });
describe('servis listesi arama ve filtreleri', () => {
  it('Türkçe firma adı, seri ve talep numarasıyla arar', () => {
    expect(matchesServiceList(ticket, filters({ query: 'ışık sn-42' }), names)).toBe(true);
    expect(matchesServiceList(ticket, filters({ query: 'CNC-SRV-001' }), names)).toBe(true);
    expect(matchesServiceList(ticket, filters({ query: 'başka' }), names)).toBe(false);
  });
  it('sorumlu ve aşama filtrelerini birlikte uygular', () => {
    expect(matchesServiceList(ticket, filters({ assignee: 'tech1', stage: 'Diagnosis' }), names)).toBe(true);
    expect(matchesServiceList(ticket, filters({ assignee: '__unassigned__' }), names)).toBe(false);
    expect(matchesServiceList({ ...ticket, assignedUserId: '' }, filters({ assignee: '__unassigned__' }), names)).toBe(true);
  });
  it('İstanbul takvim gününe göre başlangıç ve bitiş gününü dahil eder', () => {
    expect(matchesServiceList(ticket, filters({ from: '2026-11-20', to: '2026-11-20' }), names)).toBe(true);
    expect(matchesServiceList(ticket, filters({ to: '2026-11-19' }), names)).toBe(false);
    expect(matchesServiceList({ ...ticket, createdAt: '2026-11-20T21:00:00Z' }, filters({ to: '2026-11-20' }), names)).toBe(false);
  });
});
