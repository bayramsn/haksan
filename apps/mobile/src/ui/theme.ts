/** Mobil tasarım token'ları — web paletiyle uyumlu (slate tabanlı). */
export const colors = {
  bg: '#f8fafc',
  surface: '#ffffff',
  border: '#e2e8f0',
  borderStrong: '#cbd5e1',
  text: '#0f172a',
  textMuted: '#64748b',
  textSubtle: '#94a3b8',
  primary: '#0f172a',
  primaryText: '#ffffff',
  accent: '#059669',
  accentSoft: '#d1fae5',
  danger: '#b91c1c',
  dangerSoft: '#fee2e2',
  warn: '#b45309',
  warnSoft: '#fef3c7',
  okSoft: '#dcfce7',
  okText: '#166534',
  chip: '#f1f5f9',
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20 } as const;
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;

export const font = {
  eyebrow: { fontSize: 11, fontWeight: '900', letterSpacing: 1.5 } as const,
  heading: { fontSize: 26, fontWeight: '800' } as const,
  title: { fontSize: 16, fontWeight: '800' } as const,
  body: { fontSize: 14 } as const,
  muted: { fontSize: 13, lineHeight: 18 } as const,
  label: { fontSize: 12, fontWeight: '700' } as const,
};
