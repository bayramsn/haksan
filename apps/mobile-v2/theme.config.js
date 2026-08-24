/**
 * Web'deki apps/web/src/styles/theme.css ile BİREBİR aynı token adları ve
 * değerleri. İki uygulama arasında geçen geliştirici aynı sözlüğü kullansın
 * diye isimler de kopyalandı (foreground/mutedForeground/card/primary/...).
 *
 * RN'de color-mix() yok; çip kenarlıkları burada önceden hesaplanıyor.
 */

/** #rrggbb + alfa -> rgba(). Web'deki color-mix(... N%, transparent) karşılığı. */
function alpha(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

const light = {
  canvas: '#f4f6f8',
  card: '#ffffff',
  cardSubtle: '#f8f9fb',
  border: 'rgba(13, 20, 68, 0.11)',
  lineStrong: 'rgba(13, 20, 68, 0.18)',
  foreground: '#18202a',
  mutedForeground: '#5f697a',
  muted: '#f0f2f5',
  inputBackground: '#f7f8fa',

  brandBlue: '#000c69',
  brandRed: '#cf060c',
  operationBlue: '#2457d6',

  primary: '#000c69',
  primaryForeground: '#ffffff',
  secondary: '#eef1ff',
  secondaryForeground: '#000c69',

  destructive: '#cf060c',
  destructiveSoft: '#fef2f2',
  success: '#087f5b',
  successSoft: '#ecfdf5',
  warning: '#d97706',
  warningSoft: '#fffbeb',
  info: '#2563eb',
  infoSoft: '#eff6ff',
  stage: '#4f46e5',
  stageSoft: '#eef2ff',
  neutralSoft: '#f4f4f5',

  chart1: '#2a3aa0',
  chart2: '#4e8df5',
  chart3: '#14b8a6',
  chart4: '#f59e0b',
  chart5: '#8b5cf6',
  chartGrid: '#e8ebf0',
  chartAxis: '#667085',
};

const dark = {
  canvas: '#070b18',
  card: '#10182e',
  cardSubtle: '#0e1527',
  border: 'rgba(148, 163, 214, 0.16)',
  lineStrong: 'rgba(148, 163, 214, 0.3)',
  foreground: '#e7ebf7',
  mutedForeground: '#94a0c2',
  muted: '#1a2340',
  inputBackground: '#141d38',

  brandBlue: '#7d8ffb',
  brandRed: '#f0565b',
  operationBlue: '#6ea0ff',

  primary: '#8fa2ff',
  primaryForeground: '#0a1030',
  secondary: 'rgba(125, 143, 251, 0.16)',
  secondaryForeground: '#c7d2ff',

  destructive: '#f0565b',
  destructiveSoft: 'rgba(240, 86, 91, 0.14)',
  success: '#34d399',
  successSoft: 'rgba(52, 211, 153, 0.13)',
  warning: '#fbbf24',
  warningSoft: 'rgba(251, 191, 36, 0.13)',
  info: '#60a5fa',
  infoSoft: 'rgba(96, 165, 250, 0.13)',
  stage: '#a5b4fc',
  stageSoft: 'rgba(165, 180, 252, 0.14)',
  neutralSoft: 'rgba(148, 163, 214, 0.12)',

  chart1: '#8fa2ff',
  chart2: '#6ea0ff',
  chart3: '#2dd4bf',
  chart4: '#fbbf24',
  chart5: '#a78bfa',
  chartGrid: '#26304d',
  chartAxis: '#a4aec9',
};

/** .chip-* kenarlıkları: web'de color-mix(base 28%, transparent). */
function withChipBorders(theme) {
  return {
    ...theme,
    destructiveBorder: alpha(theme.destructive, 0.28),
    successBorder: alpha(theme.success, 0.28),
    warningBorder: alpha(theme.warning, 0.32),
    infoBorder: alpha(theme.info, 0.28),
    stageBorder: alpha(theme.stage, 0.28),
    neutralBorder: alpha(theme.mutedForeground, 0.25),
  };
}

const themes = { light: withChipBorders(light), dark: withChipBorders(dark) };

/** Web: --control-radius / --surface-radius / --overlay-radius (rem -> px). */
const radius = { control: 6, surface: 8, overlay: 12, pill: 999 };

/** Web h1/h2 'Barlow Condensed', gövde 'Inter Variable'. */
const fonts = {
  sans: 'Inter_400Regular',
  sansMedium: 'Inter_500Medium',
  sansSemibold: 'Inter_600SemiBold',
  sansBold: 'Inter_700Bold',
  display: 'BarlowCondensed_700Bold',
  displaySemibold: 'BarlowCondensed_600SemiBold',
};

module.exports = { themes, radius, fonts, alpha };
