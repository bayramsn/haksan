import type { ServiceCompletionPart, ServiceOperation, ServiceRequest } from './mock';

export const SERVICE_COMPLETION_PART_LIMIT = 60;

export const isPartOperation = (operation: ServiceOperation) =>
  operation.kind === 'part'
  || operation.id.startsWith('srv-part-')
  || operation.description.trim().toLocaleLowerCase('tr-TR').startsWith('parça kullanımı:');

export function serviceElapsedSeconds(s: ServiceRequest, nowMs = Date.now()) {
  const base = s.timerElapsedSeconds ?? 0;
  if (s.timerStatus !== 'running' || !s.timerStartedAt) return base;
  const started = new Date(s.timerStartedAt).getTime();
  return Number.isFinite(started) ? base + Math.max(0, Math.floor((nowMs - started) / 1000)) : base;
}

export function serviceLaborTotal(s: ServiceRequest, nowMs = Date.now()) {
  const currency = s.serviceCurrency ?? 'USD';
  const manual = (s.operations ?? []).filter(op => !isPartOperation(op) && op.currency === currency)
    .reduce((sum, op) => sum + op.quantity * op.unitPrice, 0);
  return Number((serviceElapsedSeconds(s, nowMs) / 3600 * (s.serviceHourlyRate ?? 0) + manual).toFixed(2));
}

export function serviceCompletionPartsFromRequest(s: ServiceRequest): ServiceCompletionPart[] {
  const operationParts = (s.operations ?? []).filter(isPartOperation).map(op => ({
    id: op.id,
    description: op.description.replace(/^Parça kullanımı:\s*/i, '').trim(),
    quantity: Math.max(1, Number(op.quantity) || 1),
    unitPrice: Math.max(0, Number(op.unitPrice) || 0),
  }));
  const warrantyParts = (s.warrantyClaim?.parts ?? []).map((part, index) => ({
    id: part.id ?? `warranty-part-${index}`,
    description: part.description,
    quantity: Math.max(1, Number(part.quantity) || 1),
    unitPrice: Math.max(0, Number(part.unitCost) || 0),
  }));
  return [...operationParts, ...warrantyParts];
}
