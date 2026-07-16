import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { companyService, serviceService } from '@/src/api/services';
import { normalizeList } from '@/src/modules/registry';
import { deliveryTutanakFromInstallation } from '@/src/ui/kurulum-tutanagi/kurulumTutanakModel';
import {
  InstallationDetailFooter,
  InstallationDetailHeader,
  InstallationDetailTabs,
  InstallationGeneralTab,
  InstallationHeroCard,
  InstallationNotesTab,
  type InstallationDetailTab,
} from '@/src/ui/installations/InstallationDetailWidgets';
import { DeliveryTutanakPreview } from '@/src/ui/deliveries/DeliveryDetailWidgets';
import { Button } from '@/src/ui/Button';
import { Screen } from '@/src/ui/Screen';
import { colors, layout, spacing, typography } from '@/src/theme/tokens';

type Props = { id: string };

/** Stitch Kurulum Detay — `fd8ecb8c8c45489185d948789e426b8a` */
export function InstallationDetailScreen({ id }: Props) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<InstallationDetailTab>('genel');

  const load = useCallback(async () => {
    try {
      const [installationsRes, companiesRes] = await Promise.all([
        serviceService.installations({ pageSize: 300 }),
        companyService.list({ pageSize: 500 }),
      ]);
      const companies = normalizeList(companiesRes);
      const byId = new Map(companies.map((c) => [String(c.id), c]));
      const found = normalizeList(installationsRes).find((r) => String(r.id) === id);
      if (!found) throw new Error('Kurulum bulunamadı');
      const companyId = String(found.companyId ?? '');
      const company = byId.get(companyId);
      setData(company ? { ...found, company } : found);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Detay yüklenemedi');
    }
  }, [id]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  if (loading) {
    return (
      <Screen padded={false}>
        <InstallationDetailHeader onBack={() => router.back()} />
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </Screen>
    );
  }

  if (error || !data) {
    return (
      <Screen padded={false}>
        <InstallationDetailHeader onBack={() => router.back()} />
        <View style={styles.center}>
          <Text style={styles.errorText}>{error ?? 'Kayıt bulunamadı'}</Text>
        </View>
      </Screen>
    );
  }

  const tutanakRow = deliveryTutanakFromInstallation(data);
  const statusCode = String((data.status as Record<string, unknown> | undefined)?.code ?? data.statusCode ?? '').toLowerCase();
  const isCompleted = statusCode === 'completed';

  return (
    <Screen padded={false} edges={['left', 'right']}>
      <InstallationDetailHeader
        onBack={() => router.back()}
        onShare={() => Alert.alert('Paylaş', 'Kurulum tutanağı paylaşımı yakında eklenecek.')}
      />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <InstallationHeroCard data={data} />
        <InstallationDetailTabs value={tab} onChange={setTab} />
        <View style={styles.tabBody}>
          {tab === 'genel' ? <InstallationGeneralTab data={data} /> : null}
          {tab === 'checklist' ? (
            <View style={styles.checklistCta}>
              <Text style={styles.checklistHint}>Saha kurulum checklist maddelerini tamamlayın.</Text>
              <Button
                title="Checklist'e Git"
                onPress={() => router.push(`/forms/installation-checklist?installationId=${id}`)}
              />
            </View>
          ) : null}
          {tab === 'belgeler' ? (
            <View>
              <Text style={styles.docHint}>DR.MAK kurulum tutanağı önizlemesi</Text>
              <DeliveryTutanakPreview data={tutanakRow} />
            </View>
          ) : null}
          {tab === 'notlar' ? <InstallationNotesTab data={data} /> : null}
        </View>
      </ScrollView>
      <InstallationDetailFooter
        primaryLabel={isCompleted ? 'Tutanağı Aç' : 'Checklist Başlat'}
        onPrimary={() =>
          isCompleted
            ? router.push(`/forms/kurulum-tutanagi?installationId=${id}`)
            : router.push(`/forms/installation-checklist?installationId=${id}`)
        }
        secondaryLabel={!isCompleted ? 'Tutanağı Önizle' : undefined}
        onSecondary={!isCompleted ? () => router.push(`/forms/kurulum-tutanagi?installationId=${id}`) : undefined}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: layout.containerMargin },
  errorText: { ...typography.body, color: colors.error, textAlign: 'center' },
  scroll: { flex: 1, backgroundColor: colors.canvas },
  body: { paddingBottom: 120 },
  tabBody: { paddingHorizontal: layout.containerMargin, paddingTop: spacing.md },
  checklistCta: { gap: spacing.md },
  checklistHint: { ...typography.bodySm, color: colors.onSurfaceVariant },
  docHint: { ...typography.label, color: colors.onSurfaceVariant, marginBottom: spacing.sm },
});
