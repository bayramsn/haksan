import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@/src/auth/AuthProvider';
import { ModuleRow } from '@/src/ui/ModuleRow';
import { PageHeader } from '@/src/ui/PageHeader';
import { Screen } from '@/src/ui/Screen';
import { modulesForGroup, type TabGroup } from '@/src/navigation/modules';
import { colors, layout, spacing, typography } from '@/src/theme/tokens';

const TITLES: Record<TabGroup, string> = {
  home: 'Genel',
  sales: 'Satış',
  operations: 'Operasyon',
  service: 'Servis',
  more: 'Modüller',
};

/** Stitch hub ekranları — Satış #, Operasyon #24 */
export function ModuleHubScreen({ group }: { group: TabGroup }) {
  const { hasRole } = useAuth();
  const modules = modulesForGroup(group, hasRole).filter((m) => m.key !== 'dashboard');

  return (
    <Screen padded={false} edges={['left', 'right']}>
      <PageHeader roundedBottom={false}>
        <Text style={styles.title}>{TITLES[group]}</Text>
        <Text style={styles.sub}>{modules.length} modül</Text>
      </PageHeader>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {modules.map((m) => (
          <ModuleRow key={m.key} mod={m} />
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.headline, color: '#fff' },
  sub: { ...typography.bodySm, color: 'rgba(255,255,255,0.8)' },
  scroll: { flex: 1 },
  list: { padding: layout.screenPadding, paddingTop: spacing.md, paddingBottom: spacing.lg },
});
