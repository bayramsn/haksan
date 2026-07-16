import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { PageHeader } from '@/src/ui/PageHeader';
import { Screen } from '@/src/ui/Screen';
import { colors, fonts, layout, spacing, typography } from '@/src/theme/tokens';

type Props = {
  title: string;
  subtitle?: string;
  /** Header sağ aksiyon (bildirim, filtre vb.) */
  right?: React.ReactNode;
  toolbar?: React.ReactNode;
  children: React.ReactNode;
  /** Liste altı FAB için ekstra padding */
  fabPadding?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
};

/** Stitch liste ekranı — navy header + araç çubuğu + flex:1 içerik (boşluk yok) */
export function ListPageLayout({ title, subtitle, right, toolbar, children, fabPadding, contentStyle }: Props) {
  return (
    <Screen padded={false} edges={['left', 'right']}>
      <PageHeader right={right}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </PageHeader>
      {toolbar ? <View style={styles.toolbar}>{toolbar}</View> : null}
      <View style={[styles.body, fabPadding && styles.fabPad, contentStyle]}>{children}</View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.headline, color: '#fff' },
  subtitle: { ...typography.bodySm, color: 'rgba(255,255,255,0.8)' },
  toolbar: {
    backgroundColor: colors.card,
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  body: { flex: 1 },
  fabPad: { paddingBottom: 0 },
});
