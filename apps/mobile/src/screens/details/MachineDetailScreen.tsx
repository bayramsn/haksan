import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { LoadingCenter } from '@/src/ui/DetailLayout';
import {
  CompanyDetailHeaderBar,
  CompanyQuickActionFlat,
  CompanyQuickActionFlatRow,
  ContactInfoCard,
  NotesCard,
} from '@/src/ui/company/CompanyDetailWidgets';
import { Screen } from '@/src/ui/Screen';
import { TabStrip } from '@/src/ui/TabStrip';
import { colors, layout, spacing, typography, fonts } from '@/src/theme/tokens';
import { useDetailRecord } from './useDetailRecord';

const TABS = ['Genel', 'Bakım', 'Servis Geçmişi', 'Notlar'] as const;
type Tab = (typeof TABS)[number];

type Props = { id: string };

/** Stitch Makine (Customer Device) Detay */
export function MachineDetailScreen({ id }: Props) {
  const { data, loading, error } = useDetailRecord('machines', id);
  const [tab, setTab] = useState<Tab>('Genel');

  const serialNumber = String(data?.serialNumber ?? data?.serialNo ?? 'Seri No Yok');
  const modelName = String(data?.modelName ?? data?.product?.name ?? data?.productName ?? 'Makine Model');
  const modelCode = String(data?.modelCode ?? '');
  
  const companyName = String(data?.company?.name ?? data?.companyName ?? data?.customerName ?? 'Firma Bağlantısı Yok');
  const companyId = String(data?.companyId ?? data?.customerId ?? '');
  
  const installationDate = String(data?.installationDate ?? data?.installedAt ?? '');
  const warrantyEndDate = String(data?.warrantyEndDate ?? data?.warrantyEnd ?? '');
  const lastServiceAt = String(data?.lastServiceAt ?? '');

  const openMore = () => {
    Alert.alert('Makine', undefined, [
      { text: 'Düzenle', onPress: () => router.push(`/forms/machine?id=${id}`) },
      { text: 'İptal', style: 'cancel' },
    ]);
  };

  if (loading) return <LoadingCenter />;
  if (error || !data) {
    return (
      <Screen>
        <Text style={styles.err}>{error ?? 'Makine bulunamadı'}</Text>
      </Screen>
    );
  }

  const generalRows = [
    companyName && companyName !== 'Firma Bağlantısı Yok' ? { icon: 'business-outline' as const, label: 'Müşteri', value: companyName, onPress: companyId ? () => router.push(`/modules/customers/${companyId}`) : undefined } : null,
    modelCode ? { icon: 'barcode-outline' as const, label: 'Model Kodu', value: modelCode } : null,
    serialNumber ? { icon: 'barcode-outline' as const, label: 'Seri Numarası', value: serialNumber } : null,
  ].filter(Boolean) as any;
  
  const maintenanceRows = [
    installationDate ? { icon: 'calendar-outline' as const, label: 'Kurulum Tarihi', value: installationDate } : null,
    warrantyEndDate ? { icon: 'shield-checkmark-outline' as const, label: 'Garanti Bitiş Tarihi', value: warrantyEndDate } : null,
    lastServiceAt ? { icon: 'construct-outline' as const, label: 'Son Servis', value: lastServiceAt } : null,
  ].filter(Boolean) as any;

  // Garanti durumu hesaplama (basit mock)
  const isWarrantyActive = warrantyEndDate ? new Date(warrantyEndDate) > new Date() : false;

  return (
    <Screen padded={false} edges={['left', 'right', 'bottom']}>
      <CompanyDetailHeaderBar title={modelName} onMore={openMore} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.heroSection}>
          <View style={styles.iconContainer}>
            <Text style={styles.iconText}>⚙️</Text>
          </View>
          <Text style={styles.heroTitle}>{modelName}</Text>
          <Text style={styles.heroSubtitle}>SN: {serialNumber}</Text>
          
          <View style={[styles.warrantyBadge, { backgroundColor: isWarrantyActive ? colors.accentGreen + '20' : colors.accentRed + '20' }]}>
            <Text style={[styles.warrantyText, { color: isWarrantyActive ? colors.accentGreen : colors.accentRed }]}>
              {isWarrantyActive ? 'Garanti Devam Ediyor' : 'Garanti Süresi Doldu'}
            </Text>
          </View>
        </View>

        <CompanyQuickActionFlatRow>
          <CompanyQuickActionFlat 
            label="Servis Kaydı Aç" 
            icon="construct-outline" 
            onPress={() => router.push(`/forms/service-ticket?companyId=${companyId}&deviceId=${id}`)} 
          />
          <CompanyQuickActionFlat 
            label="Bakım Planı" 
            icon="calendar-outline" 
            onPress={() => router.push(`/forms/maintenance?deviceId=${id}`)} 
          />
        </CompanyQuickActionFlatRow>

        <TabStrip
          tabs={TABS.map((t) => ({ key: t, label: t }))}
          value={tab}
          onChange={setTab}
          variant="underline"
          scrollable
        />

        {tab === 'Genel' ? (
          <View style={styles.tabBody}>
            <ContactInfoCard rows={generalRows} />
          </View>
        ) : null}

        {tab === 'Bakım' ? (
          <View style={styles.tabBody}>
            <ContactInfoCard rows={maintenanceRows} />
          </View>
        ) : null}
        
        {tab === 'Servis Geçmişi' ? (
          <View style={styles.tabBody}>
            <Text style={styles.muted}>Servis geçmişi listesi yakında eklenecek.</Text>
          </View>
        ) : null}

        {tab === 'Notlar' ? (
          <View style={styles.tabBody}>
            <NotesCard notes={String(data.note ?? data.notes ?? '')} />
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#f7f7f8' },
  scrollContent: {
    paddingHorizontal: layout.containerMargin,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxxl,
    gap: spacing.xxl,
  },
  heroSection: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconText: {
    fontSize: 28,
  },
  heroTitle: {
    ...typography.titleLg,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 4,
  },
  heroSubtitle: {
    ...typography.bodyMd,
    color: colors.secondary,
    textAlign: 'center',
  },
  warrantyBadge: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: 16,
  },
  warrantyText: {
    fontFamily: fonts.medium,
    fontSize: 12,
  },
  tabBody: { gap: spacing.lg },
  muted: { ...typography.bodySm, color: colors.secondary },
  err: { color: colors.accentRed, padding: spacing.lg },
});
