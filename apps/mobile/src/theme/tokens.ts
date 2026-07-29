/** Industrial Authority — `.stitch/DESIGN.md` · Stitch `91f83c94` tokens */
export const colors = {
  primary: '#000c69',
  stitchPrimary: '#00011f',
  accentRed: '#cf060c',
  accentRedSoft: '#fef2f2',
  primarySoft: '#eef2ff',
  canvas: '#f9f9fa',
  card: '#ffffff',
  inputBg: '#f3f3f5',
  textPrimary: '#1a1c1d',
  textMuted: '#717182',
  border: 'rgba(0,0,0,0.1)',
  success: '#16a34a',
  warning: '#d97706',
  /** Anlamsal vurgu renkleri — ikon/rozet/durum tonları */
  accentGreen: '#16a34a',
  accentOrange: '#d97706',
  accentBlue: '#2563eb',
  /** Genel yüzey (kart) — `card` ile eş; tema arası değişir */
  surface: '#ffffff',
  /** Stitch Material tokens — Gösterge Paneli */
  secondary: '#505f76',
  onSurfaceVariant: '#454651',
  outline: '#767683',
  outlineVariant: '#c6c5d3',
  secondaryContainer: '#d0e1fb',
  onSecondaryContainer: '#54647a',
  onSecondaryFixedVariant: '#38485d',
  tertiaryFixed: '#dae2fd',
  onTertiaryFixed: '#131b2e',
  surfaceContainerLow: '#f3f3f4',
  surfaceContainer: '#eeeeef',
  surfaceContainerHigh: '#e8e8e9',
  surfaceContainerHighest: '#e2e2e3',
  surfaceVariant: '#e2e2e3',
  surfaceTint: '#4c57ab',
  onSurface: '#1a1c1d',
  onPrimaryContainer: '#747fd6',
  error: '#ba1a1a',
  errorContainer: '#ffdad6',
  onErrorContainer: '#93000a',
  tertiary: '#000313',
  /** Stitch status badges — Firmalar listesi */
  statusActiveBg: '#e6f4ea',
  statusActiveText: '#137333',
  statusPassiveBg: '#f1f3f4',
  statusPassiveText: '#5f6368',
  statusPotentialBg: '#fef7e0',
  statusPotentialText: '#b06000',
} as const;

/** Stitch `c2a9cfdf` — Gösterge Paneli karanlık mod */
export const darkColors = {
  ...colors,
  primary: '#8b93ff',
  stitchPrimary: '#e3e2e6',
  primarySoft: '#3d4578',
  canvas: '#121318',
  card: '#1e1f25',
  surface: '#1e1f25',
  inputBg: '#1e1f25',
  textPrimary: '#e3e2e6',
  textMuted: '#9a9aa5',
  border: 'rgba(255,255,255,0.1)',
  secondary: '#9a9aa5',
  onSurfaceVariant: '#9a9aa5',
  outline: '#9a9aa5',
  outlineVariant: '#464652',
  secondaryContainer: '#3d4578',
  onSecondaryContainer: '#e3e2e6',
  surfaceContainerLow: '#1b1b22',
  surfaceContainer: '#202027',
  surfaceContainerHigh: '#292930',
  surfaceContainerHighest: '#34343b',
  surfaceVariant: '#34343b',
  onSurface: '#e3e2e6',
  onPrimaryContainer: '#8b93ff',
  errorContainer: '#93000a',
  onErrorContainer: '#ffdad6',
} as const;

/** Renk anahtarları sabit; değerler tema (aydınlık/karanlık) arası değiştiği için
 *  `string`'e genişletilir — aksi halde literal tipler aydınlık/karanlık paletleri uyumsuz kılıyordu. */
export type ThemePalette = { readonly [K in keyof typeof colors]: string };

export function themePalette(isDark: boolean): ThemePalette {
  return isDark ? darkColors : colors;
}

/** Plus Jakarta Sans — loaded in FontProvider */
export const fonts = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
} as const;

export const radius = {
  /** Stitch: buttons, inputs */
  sm: 10,
  /** Stitch: cards */
  md: 12,
  lg: 16,
  pill: 9999,
} as const;

/** 8pt grid — container margin 20 on premium screens, default 16 */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const layout = {
  screenPadding: 16,
  containerMargin: 20,
  touchMin: 44,
  tabBarHeight: 56,
  headerLogoHeight: 32,
  accentBarHeight: 3,
} as const;

export const typography = {
  display: {
    fontSize: 28,
    fontFamily: fonts.bold,
    letterSpacing: -0.56,
    lineHeight: 34,
  },
  headlineMd: {
    fontSize: 18,
    fontFamily: fonts.semibold,
    lineHeight: 24,
  },
  headline: {
    fontSize: 22,
    fontFamily: fonts.semibold,
    letterSpacing: -0.44,
    lineHeight: 28,
  },
  title: {
    fontSize: 17,
    fontFamily: fonts.semibold,
    lineHeight: 22,
  },
  titleLg: {
    fontSize: 20,
    fontFamily: fonts.semibold,
    lineHeight: 26,
  },
  titleSm: {
    fontSize: 15,
    fontFamily: fonts.semibold,
    lineHeight: 20,
  },
  bodyMd: {
    fontSize: 15,
    fontFamily: fonts.regular,
    lineHeight: 22,
  },
  body: {
    fontSize: 16,
    fontFamily: fonts.regular,
    lineHeight: 24,
  },
  bodySm: {
    fontSize: 14,
    fontFamily: fonts.regular,
    lineHeight: 20,
  },
  label: {
    fontSize: 12,
    fontFamily: fonts.medium,
    lineHeight: 16,
  },
  caption: {
    fontSize: 11,
    fontFamily: fonts.semibold,
    lineHeight: 14,
    letterSpacing: 0.2,
  },
  kpi: {
    fontSize: 30,
    fontFamily: fonts.semibold,
    lineHeight: 36,
    letterSpacing: -0.3,
  },
  tabLabel: {
    fontSize: 11,
    fontFamily: fonts.medium,
    lineHeight: 14,
  },
} as const;
