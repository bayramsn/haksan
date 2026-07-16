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

const TABS = ['Genel', 'Kalemler', 'Notlar'] as const;
type Tab = (typeof TABS)[number];

type Props = { id: string };

/** Stitch Muhasebe Faturası Detay */
export function AccountingInvoiceDetailScreen({ id }: Props) {
  const { data, loading, error } = useDetailRecord('accounting-invoices', id);
  const [tab, setTab] = useState<Tab>('Genel');

  const invoiceNo = String(data?.invoiceNo ?? data?.documentNo ?? data?.id ?? 'Fatura Detayı');
  
  const type = String(data?.type ?? data?.invoiceType ?? 'Fatura');
  const totalAmount = data?.totalAmount ? `${data.totalAmount} ${data.currency ?? '₺'}` : '';
  const date = String(data?.date ?? data?.invoiceDate ?? data?.createdAt ?? '');
  const dueDate = String(data?.dueDate ?? '');
  
  const companyName = String(data?.company?.name ?? data?.companyName ?? data?.customerName ?? 'Firma Bağlantısı Yok');
  const companyId = String(data?.companyId ?? data?.customerId ?? '');
  
  const status = String(data?.status ?? data?.statusCode ?? 'Açık');
  
  const notes = String(data?.note ?? data?.notes ?? data?.description ?? '');

  const openMore = () => {
    Alert.alert('Fatura', undefined, [
      { text: 'Düzenle', onPress: () => Alert.alert('Bilgi', 'Düzenleme ekranı yakında eklenecek') },
      { text: 'İptal', style: 'cancel' },
    ]);
  };

  if (loading) return <LoadingCenter />;
  if (error || !data) {
    return (
      <Screen>
        <Text style={styles.err}>{error ?? 'Fatura bulunamadı'}</Text>
      </Screen>
    );
  }

  const getStatusColor = (s: string) => {
    if (s.toLowerCase().includes('ödendi') || s.toLowerCase() === 'paid') return colors.accentGreen;
    if (s.toLowerCase().includes('iptal') || s.toLowerCase() === 'cancelled') return colors.accentRed;
    return colors.accentOrange; // Bekliyor / Açık
  };

  const isSale = type.toLowerCase().includes('satış') || type.toLowerCase().includes('sale');
  const getTypeColor = () => isSale ? colors.accentBlue : colors.accentOrange;

  const generalRows = [
    companyName && companyName !== 'Firma Bağlantısı Yok' ? { icon: 'business-outline' as const, label: 'Cari', value: companyName, onPress: companyId ? () => router.push(`/modules/customers/${companyId}`) : undefined } : null,
    date ? { icon: 'calendar-outline' as const, label: 'Fatura Tarihi', value: date } : null,
    dueDate ? { icon: 'hourglass-outline' as const, label: 'Vade Tarihi', value: dueDate } : null,
  ].filter(Boolean) as any;

  return (
    <Screen padded={false} edges={['left', 'right', 'bottom']}>
      <CompanyDetailHeaderBar title={invoiceNo} onMore={openMore} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.heroSection}>
          <View style={[styles.iconContainer, { backgroundColor: getTypeColor() + '15', borderColor: getTypeColor() + '30' }]}>
            <Text style={styles.iconText}>
              {isSale ? '🧾' : '📦'}
            </Text>
          </View>
          <Text style={styles.heroTitle}>{totalAmount}</Text>
          <Text style={styles.heroSubtitle}>{type}</Text>
          
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(status) + '20' }]}>
            <Text style={[styles.statusText, { color: getStatusColor(status) }]}>
              {status}
            </Text>
          </View>
        </View>

        <CompanyQuickActionFlatRow>
          <CompanyQuickActionFlat 
            label="Ödeme Ekle" 
            icon="wallet-outline" 
            onPress={() => router.push(`/forms/payment?companyId=${companyId}`)} 
          />
          <CompanyQuickActionFlat 
            label="PDF Görüntüle" 
            icon="document-attach-outline" 
            onPress={() => Alert.alert('Bilgi', 'PDF indirme yakında eklenecek')} 
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

        {tab === 'Kalemler' ? (
          <View style={styles.tabBody}>
            <Text style={styles.muted}>Fatura kalemleri yakında eklenecek.</Text>
          </View>
        ) : null}

        {tab === 'Notlar' ? (
          <View style={styles.tabBody}>
            <NotesCard notes={notes} />
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
    paddingHorizontal: spacing.xl,
    fontSize: 28,
  },
  heroSubtitle: {
    ...typography.bodyMd,
    color: colors.secondary,
    textAlign: 'center',
  },
  statusBadge: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: 16,
  },
  statusText: {
    fontFamily: fonts.medium,
    fontSize: 12,
  },
  tabBody: { gap: spacing.lg },
  muted: { ...typography.bodySm, color: colors.secondary },
  err: { color: colors.accentRed, padding: spacing.lg },
});
