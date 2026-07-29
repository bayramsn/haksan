import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { quoteService } from '@/src/api/services';
import { fieldText, getModuleConfig } from '@/src/modules/registry';
import { Button } from '@/src/ui/Button';
import { Screen } from '@/src/ui/Screen';
import { colors, radius, typography } from '@/src/theme/tokens';

type Props = { navKey: string; id: string };

export function GenericDetailScreen({ navKey, id }: Props) {
  const config = getModuleConfig(navKey);
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      if (!config?.fetchOne) {
        setLoading(false);
        return;
      }
      try {
        const res = await config.fetchOne(id);
        setData(res as Record<string, unknown>);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Detay yüklenemedi');
      } finally {
        setLoading(false);
      }
    })();
  }, [config, id]);

  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />;
  if (error) return <Text style={styles.error}>{error}</Text>;

  const fields = config?.detailFields ?? Object.keys(data ?? {}).slice(0, 12);

  return (
    <Screen scroll>
      <Text style={styles.title}>{fieldText(data ?? {}, config?.titleField) || id}</Text>
      {fields.map((f) => (
        <View key={f} style={styles.row}>
          <Text style={styles.label}>{f}</Text>
          <Text style={styles.value}>{fieldText(data ?? {}, f) || '—'}</Text>
        </View>
      ))}
      {navKey === 'offers' ? (
        <Button title="PDF Önizle" onPress={() => void quoteService.openPdf(id)} style={{ marginTop: 16 }} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.headline, color: colors.textPrimary, marginBottom: 16 },
  row: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 8,
  },
  label: { fontSize: 11, fontWeight: '600', color: colors.textMuted, textTransform: 'uppercase' },
  value: { fontSize: 15, color: colors.textPrimary, marginTop: 4 },
  error: { color: colors.accentRed, padding: 16 },
});
