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

const TABS = ['Genel', 'Notlar'] as const;
type Tab = (typeof TABS)[number];

type Props = { id: string };

/** Stitch Ödeme / Tahsilat Detay */
export function PaymentDetailScreen({ id }: Props) {
  const { data, loading, error } = useDetailRecord('payments', id);
  const [tab, setTab] = useState<Tab>('Genel');

  const title = String(data?.title ?? data?.receiptNo ?? data?.id ?? 'Ödeme Detayı');
  
  const paymentType = String(data?.type ?? data?.paymentType ?? 'Tahsilat');
  const amount = data?.amount ? `${data.amount} ${data.currency ?? '₺'}` : '';
  const date = String(data?.date ?? data?.paymentDate ?? data?.createdAt ?? '');
  
  const companyName = String(data?.company?.name ?? data?.companyName ?? data?.customerName ?? 'Firma Bağlantısı Yok');
  const companyId = String(data?.companyId ?? data?.customerId ?? '');
  
  const accountName = String(data?.account?.name ?? data?.accountName ?? data?.bankName ?? 'Kasa / Banka Seçilmedi');
  
  const notes = String(data?.note ?? data?.notes ?? data?.description ?? '');

  const openMore = () => {
    Alert.alert('Tahsilat / Ödeme', undefined, [
      { text: 'Düzenle', onPress: () => Alert.alert('Bilgi', 'Düzenleme ekranı yakında eklenecek') },
      { text: 'İptal', style: 'cancel' },
    ]);
  };

  if (loading) return <LoadingCenter />;
  if (error || !data) {
    return (
      <Screen>
        <Text style={styles.err}>{error ?? 'Kayıt bulunamadı'}</Text>
      </Screen>
    );
  }

  const getTypeColor = (t: string) => {
    if (t.toLowerCase().includes('ödeme') || t.toLowerCase() === 'payment') return colors.accentRed;
    return colors.accentGreen; // Tahsilat
  };

  const generalRows = [
    companyName && companyName !== 'Firma Bağlantısı Yok' ? { icon: 'business-outline' as const, label: 'Müşteri / Tedarikçi', value: companyName, onPress: companyId ? () => router.push(`/modules/customers/${companyId}`) : undefined } : null,
    accountName ? { icon: 'wallet-outline' as const, label: 'Kasa / Banka', value: accountName } : null,
    date ? { icon: 'calendar-outline' as const, label: 'İşlem Tarihi', value: date } : null,
  ].filter(Boolean) as any;

  return (
    <Screen padded={false} edges={['left', 'right', 'bottom']}>
      <CompanyDetailHeaderBar title={title} onMore={openMore} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.heroSection}>
          <View style={[styles.iconContainer, { backgroundColor: getTypeColor(paymentType) + '15', borderColor: getTypeColor(paymentType) + '30' }]}>
            <Text style={styles.iconText}>
              {paymentType.toLowerCase().includes('ödeme') ? '💸' : '💰'}
            </Text>
          </View>
          <Text style={styles.heroTitle}>{amount}</Text>
          <Text style={styles.heroSubtitle}>{paymentType}</Text>
        </View>

        <CompanyQuickActionFlatRow>
          <CompanyQuickActionFlat 
            label="Makbuz Gönder" 
            icon="share-outline" 
            onPress={() => Alert.alert('Bilgi', 'Makbuz paylaşma özelliği yakında eklenecek')} 
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
    fontSize: 28, // Özel büyük font
  },
  heroSubtitle: {
    ...typography.bodyMd,
    color: colors.secondary,
    textAlign: 'center',
  },
  tabBody: { gap: spacing.lg },
  muted: { ...typography.bodySm, color: colors.secondary },
  err: { color: colors.accentRed, padding: spacing.lg },
});
