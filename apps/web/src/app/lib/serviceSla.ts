import type { ServiceRequest } from "./mock";

type ServiceSlaRecord = Pick<ServiceRequest, "createdAt" | "priority" | "stage">;

const SLA_DAYS = { critical: 1, high: 2, normal: 7, low: 14 } as const;
const DAY_MS = 24 * 60 * 60 * 1000;

export function serviceAgeDays(service: ServiceSlaRecord, nowMs = Date.now()): number {
  const openedAt = new Date(service.createdAt).getTime();
  if (!Number.isFinite(openedAt) || !Number.isFinite(nowMs)) return 0;
  return Math.max(0, Math.floor((nowMs - openedAt) / DAY_MS));
}

export function serviceSlaRemainingDays(service: ServiceSlaRecord, nowMs = Date.now()): number {
  return SLA_DAYS[service.priority ?? "normal"] - serviceAgeDays(service, nowMs);
}

export function isServiceOverdue(service: ServiceSlaRecord, nowMs = Date.now()): boolean {
  return service.stage !== "Closed" && serviceSlaRemainingDays(service, nowMs) < 0;
}
