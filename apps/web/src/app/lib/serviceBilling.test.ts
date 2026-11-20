import { describe, expect, it } from 'vitest';
import type { ServiceRequest, ServiceOperation } from './mock';
import { serviceLaborTotal, serviceCompletionPartsFromRequest } from './serviceBilling';

const operation = (patch: Partial<ServiceOperation> = {}): ServiceOperation => ({ id: 'labor', description: 'İşçilik', quantity: 2, unitPrice: 50, currency: 'USD', kind: 'labor', ...patch });
const ticket = (patch: Partial<ServiceRequest> = {}) => ({ timerElapsedSeconds: 3600, serviceHourlyRate: 120, serviceCurrency: 'USD', ...patch } as ServiceRequest);

describe('servis kapanış bedelleri', () => {
  it('sayaç ve manuel işçiliği toplar, parçayı ikinci kez işçiliğe eklemez', () => {
    expect(serviceLaborTotal(ticket({ operations: [operation(), operation({ id: 'part', kind: 'part', unitPrice: 500 })] }))).toBe(220);
  });
  it('farklı para birimlerini birbirine eklemez', () => {
    expect(serviceLaborTotal(ticket({ operations: [operation({ currency: 'EUR' })] }))).toBe(120);
  });
  it('çalışan sayacın son aralığını da hesaba katar', () => {
    expect(serviceLaborTotal(ticket({ timerElapsedSeconds: 0, timerStatus: 'running', timerStartedAt: '2026-11-20T09:00:00Z' }), Date.parse('2026-11-20T09:30:00Z'))).toBe(60);
  });
  it('altıdan fazla parçayı kesmeden kapanışa aktarır', () => {
    const parts = Array.from({ length: 9 }, (_, i) => operation({ id: `srv-part-${i}`, kind: 'part', description: `Parça kullanımı: P${i}` }));
    const result = serviceCompletionPartsFromRequest(ticket({ operations: parts }));
    expect(result).toHaveLength(9);
    expect(result[8].description).toBe('P8');
    expect(result.reduce((sum, p) => sum + p.quantity * p.unitPrice, 0)).toBe(900);
  });
});
