export type InstallationStatusFilter = 'Tümü' | 'Aktif' | 'Plan' | 'Tamamlanan';

export const INSTALLATION_STATUS_FILTERS: InstallationStatusFilter[] = [
  'Tümü',
  'Aktif',
  'Plan',
  'Tamamlanan',
];

function statusCode(row: Record<string, unknown>): string {
  const status = row.status as Record<string, unknown> | undefined;
  return String(row.statusCode ?? status?.code ?? '').toLowerCase();
}

export function installationCode(row: Record<string, unknown>): string {
  const id = String(row.id ?? '');
  if (!id) return 'INS-—';
  return `INS-${id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

export function installationCompany(row: Record<string, unknown>): string {
  const company = row.company as Record<string, unknown> | undefined;
  return String(company?.shortName ?? company?.legalTitle ?? '—');
}

export function installationTechnician(row: Record<string, unknown>): string {
  const assigned = row.assignedTo as Record<string, unknown> | undefined;
  return String(assigned?.fullName ?? 'Atanmadı');
}

export function installationSubtitle(row: Record<string, unknown>): string {
  if (row.customerDeviceId) {
    const loc = String(row.location ?? '').trim();
    if (loc) return loc;
    return 'Makine kayıtlı';
  }
  return 'Makine atanmadı';
}

export function installationStatusLabel(row: Record<string, unknown>): string {
  const status = row.status as Record<string, unknown> | undefined;
  return String(status?.name ?? row.statusCode ?? 'Planlandı');
}

export function installationProgress(row: Record<string, unknown>): number | null {
  const code = statusCode(row);
  if (code === 'completed') return 100;
  if (code === 'in_progress') return 62;
  if (code === 'scheduled') return 0;
  return null;
}

export function matchesInstallationFilter(
  row: Record<string, unknown>,
  filter: InstallationStatusFilter,
): boolean {
  const code = statusCode(row);
  switch (filter) {
    case 'Aktif':
      return code === 'in_progress';
    case 'Plan':
      return code === 'scheduled';
    case 'Tamamlanan':
      return code === 'completed';
    default:
      return true;
  }
}

export function countInstallationsByFilter(
  rows: Record<string, unknown>[],
  filter: 'active' | 'planned' | 'completed',
): number {
  return rows.filter((row) => {
    const code = statusCode(row);
    if (filter === 'active') return code === 'in_progress';
    if (filter === 'planned') return code === 'scheduled';
    return code === 'completed';
  }).length;
}

export function formatInstallationSchedule(row: Record<string, unknown>): string | null {
  const raw = row.scheduledDate ?? row.startedAt;
  if (!raw) return null;
  const d = new Date(String(raw));
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function statusBadgeStyle(row: Record<string, unknown>): {
  bg: string;
  fg: string;
  dot: string;
} {
  const code = statusCode(row);
  if (code === 'completed') {
    return { bg: colorsSuccess.bg, fg: colorsSuccess.fg, dot: colorsSuccess.dot };
  }
  if (code === 'scheduled') {
    return { bg: '#f1f3f4', fg: '#5f6368', dot: '#767683' };
  }
  if (code === 'cancelled') {
    return { bg: '#fce8e6', fg: '#c5221f', dot: '#c5221f' };
  }
  return { bg: '#fff8e1', fg: '#f57f17', dot: '#f57f17' };
}

const colorsSuccess = { bg: '#e6f4ea', fg: '#137333', dot: '#137333' };

export function installationMachineLine(row: Record<string, unknown>): string {
  const device = row.customerDevice as Record<string, unknown> | undefined;
  if (device) {
    const parts = [device.brand, device.model, device.serialNumber].filter(Boolean);
    if (parts.length) return parts.join(' · ');
  }
  if (row.customerDeviceId) return 'Makine kayıtlı';
  return 'Makine atanmadı';
}

export function installationLocationLabel(row: Record<string, unknown>): string | null {
  const lt = String(row.locationType ?? '');
  if (lt === 'istanbul_ici') return 'İstanbul İçi';
  if (lt === 'istanbul_disi') return 'İstanbul Dışı';
  const loc = String(row.location ?? '').trim();
  return loc || null;
}

export function installationDurationDisplay(row: Record<string, unknown>): string | null {
  const mins = row.durationMinutes;
  if (mins == null || mins === '') return null;
  const m = Number(mins);
  if (!Number.isFinite(m) || m <= 0) return null;
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h && r) return `${h} sa ${r} dk`;
  if (h) return `${h} saat`;
  return `${r} dk`;
}

export function formatInstallationDate(raw: unknown): string {
  if (!raw) return '—';
  const d = new Date(String(raw));
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
}
