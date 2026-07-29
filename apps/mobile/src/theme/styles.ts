import { Platform, type ViewStyle } from 'react-native';
import { colors, radius } from './tokens';

/** Stitch shadow Level 1: 0 4 20 rgba(0,0,0,.04) */
export const shadowCard: ViewStyle = Platform.select({
  ios: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 20,
  },
  android: { elevation: 2 },
  default: {},
}) as ViewStyle;

/** Stitch shadow Level 2: 0 10 30 rgba(0,12,105,.08) */
export const shadowElevated: ViewStyle = Platform.select({
  ios: {
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 30,
  },
  android: { elevation: 6 },
  default: {},
}) as ViewStyle;

export const shadowFab: ViewStyle = Platform.select({
  ios: {
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
  },
  android: { elevation: 8 },
  default: {},
}) as ViewStyle;

export const cardSurface: ViewStyle = {
  backgroundColor: colors.card,
  borderRadius: radius.md,
  borderWidth: 1,
  borderColor: colors.border,
};

export const cardElevated: ViewStyle = {
  ...cardSurface,
  ...shadowCard,
};

export const pressFade = (pressed: boolean): ViewStyle => (pressed ? { opacity: 0.92 } : {});
