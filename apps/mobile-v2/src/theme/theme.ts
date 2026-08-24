import { useColorScheme } from 'nativewind';

/**
 * apps/web/src/styles/theme.css ile aynı token adları. Web'de bir rengi
 * değiştirirken buranın da güncellenmesi gerekir (theme.config.js).
 */
export type ThemeColors = {
  canvas: string;
  card: string;
  cardSubtle: string;
  border: string;
  lineStrong: string;
  foreground: string;
  mutedForeground: string;
  muted: string;
  inputBackground: string;
  brandBlue: string;
  brandRed: string;
  operationBlue: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  destructive: string;
  destructiveSoft: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  info: string;
  infoSoft: string;
  stage: string;
  stageSoft: string;
  neutralSoft: string;
  chart1: string;
  chart2: string;
  chart3: string;
  chart4: string;
  chart5: string;
  chartGrid: string;
  chartAxis: string;
  destructiveBorder: string;
  successBorder: string;
  warningBorder: string;
  infoBorder: string;
  stageBorder: string;
  neutralBorder: string;
};

const { themes, radius, fonts } = require('../../theme.config') as {
  themes: Record<'light' | 'dark', ThemeColors>;
  radius: { control: number; surface: number; overlay: number; pill: number };
  fonts: Record<'sans' | 'sansMedium' | 'sansSemibold' | 'sansBold' | 'display' | 'displaySemibold', string>;
};

export { radius, fonts };

/**
 * NativeWind sınıflarıyla boyanamayan yerler için (grafik, StatusBar, bottom
 * sheet, vektör ikon) aynı paleti JS'ten okur.
 */
export function useTheme(): { colors: ThemeColors; scheme: 'light' | 'dark' } {
  // NativeWind'in şeması tek kaynak: Ayarlar'dan gelen elle seçim hem CSS
  // değişkenlerini hem buradan okunan ham renkleri aynı anda değiştirir.
  const { colorScheme } = useColorScheme();
  const scheme = colorScheme === 'dark' ? 'dark' : 'light';
  return { colors: themes[scheme], scheme };
}

/** Web'deki .chip-* sınıflarının karşılığı. */
export type Tone = 'destructive' | 'warning' | 'success' | 'info' | 'stage' | 'neutral';

export const chipClass: Record<Tone, string> = {
  destructive: 'bg-destructive-soft border-destructive-border',
  warning: 'bg-warning-soft border-warning-border',
  success: 'bg-success-soft border-success-border',
  info: 'bg-info-soft border-info-border',
  stage: 'bg-stage-soft border-stage-border',
  neutral: 'bg-neutral-soft border-neutral-border',
};

export const chipTextClass: Record<Tone, string> = {
  destructive: 'text-destructive',
  warning: 'text-warning',
  success: 'text-success',
  info: 'text-info',
  stage: 'text-stage',
  neutral: 'text-muted-foreground',
};

/** Vektör ikon gibi className kabul etmeyen bileşenler için ham renk. */
export function toneColor(colors: ThemeColors, tone: Tone): string {
  return tone === 'neutral' ? colors.mutedForeground : colors[tone];
}

/** Müşteri durum kodu → ton. Sunucudaki `customerStatusCode` enum'u ile aynı. */
export function customerStatusTone(code: string | null | undefined): Tone {
  switch (code) {
    case 'active':
      return 'success';
    case 'potential':
      return 'info';
    case 'passive':
      return 'warning';
    case 'blacklist':
      return 'destructive';
    default:
      return 'neutral';
  }
}
