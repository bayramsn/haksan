import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Keep operational records readable on tablets/landscape without changing list virtualization. */
export function useOperationsLayout() {
  const { width, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const available = Math.max(0, width - insets.left - insets.right);
  return {
    listPad: Math.max(16, Math.floor((available - 880) / 2)),
    columns: fontScale >= 1.35 || available < 360 ? 1 : available >= 900 ? 3 : 2,
    largeText: fontScale >= 1.35,
  };
}
