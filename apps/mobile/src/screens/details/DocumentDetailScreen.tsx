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

const TABS = ['Genel', 'Ekler', 'Notlar'] as const;
type Tab = (typeof TABS)[number];

type Props = { 
  navKey: string;
  id: string; 
};

/** Stitch Doküman / Proforma / Sözleşme Detay */
export function DocumentDetailScreen({ navKey, id }: Props) {
  const { data, loading, error } = useDetailRecord(navKey, id);
  const [tab, setTab] = useState<Tab>('Genel');

  // navKey: proformas, contracts, documents
  const title = String(data?.title ?? data?.documentNo ?? data?.subject ?? 'Doküman Detayı');
  const typeLabel = navKey === 'proformas' ? 'Proforma' : navKey === 'contracts' ? 'Sözleşme' : 'Doküman';
  
  const statusCode = String(data?.statusCode ?? data?.status ?? 'Taslak');
  
  const companyName = String(data?.company?.name ?? data?.companyName ?? data?.customerName ?? 'Firma Bağlantısı Yok');
  const companyId = String(data?.companyId ?? data?.customerId ?? '');
  
  const totalAmount = data?.totalAmount ? `${data.totalAmount} ${data.currency ?? '₺'}` : '';
  const validUntil = String(data?.validUntil ?? data?.expirationDate ?? '');
  const documentDate = String(data?.documentDate ?? data?.createdAt ?? '');
  
  const notes = String(data?.note ?? data?.notes ?? data?.description ?? '');

  const openMore = () => {
    Alert.alert(typeLabel, undefined, [
      { text: 'Düzenle', onPress: () => Alert.alert('Bilgi', 'Düzenleme ekranı yakında eklenecek') },
      { text: 'İptal', style: 'cancel' },
    ]);
  };

  if (loading) return <LoadingCenter />;
  if (error || !data) {
    return (
      <Screen>
        <Text style={styles.err}>{error ?? 'Doküman bulunamadı'}</Text>
      </Screen>
    );
  }

  const getStatusColor = (s: string) => {
    if (s.toLowerCase().includes('onay') || s.toLowerCase().includes('imza') || s.toLowerCase() === 'approved') return colors.accentGreen;
    if (s.toLowerCase().includes('red') || s.toLowerCase().includes('iptal') || s.toLowerCase() === 'rejected') return colors.accentRed;
    return colors.accentOrange;
  };

  const getIconForType = () => {
    if (navKey === 'proformas') return 'document-text-outline';
    if (navKey === 'contracts') return 'shield-checkmark-outline';
    return 'document-outline';
  };

  const generalRows = [
    companyName && companyName !== 'Firma Bağlantısı Yok' ? { icon: 'business-outline' as const, label: 'Müşteri', value: companyName, onPress: companyId ? () => router.push(`/modules/customers/${companyId}`) : undefined } : null,
    totalAmount ? { icon: 'cash-outline' as const, label: 'Tutar', value: totalAmount } : null,
    documentDate ? { icon: 'calendar-outline' as const, label: 'Oluşturulma Tarihi', value: documentDate } : null,
    validUntil ? { icon: 'hourglass-outline' as const, label: 'Geçerlilik Tarihi', value: validUntil } : null,
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
          <View style={styles.iconContainer}>
            <Text style={styles.iconText}>
              {navKey === 'proformas' ? '📄' : navKey === 'contracts' ? '🤝' : '📁'}
            </Text>
          </View>
          <Text style={styles.heroTitle}>{title}</Text>
          <Text style={styles.heroSubtitle}>{typeLabel}</Text>
          
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(statusCode) + '20' }]}>
            <Text style={[styles.statusText, { color: getStatusColor(statusCode) }]}>
              {statusCode}
            </Text>
          </View>
        </View>

        <CompanyQuickActionFlatRow>
          <CompanyQuickActionFlat 
            label="PDF Görüntüle" 
            icon="document-attach-outline" 
            onPress={() => Alert.alert('Bilgi', 'PDF görüntüleme özelliği yakında eklenecek')} 
          />
          <CompanyQuickActionFlat 
            label="E-posta Gönder" 
            icon="mail-outline" 
            onPress={() => Alert.alert('Bilgi', 'E-posta gönderme özelliği yakında eklenecek')} 
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

        {tab === 'Ekler' ? (
          <View style={styles.tabBody}>
            <Text style={styles.muted}>Bu belgeye ait ek dosya bulunamadı.</Text>
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
