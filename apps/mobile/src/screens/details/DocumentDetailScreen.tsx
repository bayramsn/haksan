import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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
import { foldTermsToNotes } from '@/src/ui/offer/proformaNotes';
import { fileService } from '@/src/api/services';
import { openStoredFile } from '@/src/api/download';
import { normalizeList } from '@/src/modules/registry';
import { shareCommercialDocument } from '@/src/print/commercialDocument';

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
  const [working, setWorking] = useState(false);
  const [attachments, setAttachments] = useState<Record<string, any>[]>([]);
  const [attachmentsError, setAttachmentsError] = useState<string | null>(null);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const kind = navKey === 'contracts' || data?.documentKind === 'contract' ? 'contract' : 'proforma';

  useEffect(() => {
    let cancelled = false;
    setAttachments([]);
    setAttachmentsError(null);
    const quoteId = data?.quoteId;
    if (!quoteId) return;
    setAttachmentsLoading(true);
    void (async () => {
      try {
        const rows: Record<string, any>[] = [];
        for (let page = 1; ; page++) {
          const result = await fileService.links({ entityType: 'quote', entityId: quoteId, page, pageSize: 100 });
          const batch = normalizeList(result);
          rows.push(...batch);
          if (batch.length < 100) break;
        }
        if (!cancelled) setAttachments(rows);
      } catch (e) {
        if (!cancelled) setAttachmentsError(e instanceof Error ? e.message : 'Ekler yüklenemedi.');
      } finally {
        if (!cancelled) setAttachmentsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [data?.quoteId]);

  const openFile = async (fileId: string) => {
    if (working) return;
    setWorking(true);
    try { await openStoredFile(fileId); }
    catch (e) { Alert.alert('Dosya açılamadı', e instanceof Error ? e.message : 'Tekrar deneyin.'); }
    finally { setWorking(false); }
  };
  const openPdf = async () => {
    if (!data || working) return;
    setWorking(true);
    try { await shareCommercialDocument(kind, data); }
    catch (e) { Alert.alert('PDF oluşturulamadı', e instanceof Error ? e.message : 'Tekrar deneyin.'); }
    finally { setWorking(false); }
  };

  // navKey: proformas, contracts, documents
  const title = String(data?.title ?? data?.documentNo ?? data?.contractNo ?? data?.subject ?? 'Doküman Detayı');
  const typeLabel = kind === 'contract' ? 'Sözleşme' : 'Proforma';
  
  const statusCode = String(data?.statusCode ?? data?.status ?? 'Taslak');
  
  const companyName = String(data?.documentSnapshot?.company?.legalTitle ?? data?.company?.legalTitle ?? data?.company?.name ?? data?.companyName ?? data?.customerName ?? 'Firma Bağlantısı Yok');
  const companyId = String(data?.companyId ?? data?.documentSnapshot?.company?.id ?? data?.customerId ?? '');
  
  const totalAmount = data?.totalAmount ? `${data.totalAmount} ${data.currency ?? '₺'}` : '';
  const validUntil = String(data?.validUntil ?? data?.expirationDate ?? '');
  const documentDate = String(data?.issueDate ?? data?.signedDate ?? data?.documentDate ?? data?.createdAt ?? '');
  
  // Proformanın notları belge anlık görüntüsündeki şart metinlerinde durur.
  const notes = kind === 'proforma'
    ? foldTermsToNotes(data?.documentSnapshot?.terms) || String(data?.notes ?? '')
    : String(data?.note ?? data?.notes ?? data?.description ?? '');

  const openMore = () => {
    Alert.alert(typeLabel, undefined, [
      { text: 'PDF Aç / Paylaş', onPress: () => void openPdf() },
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
            label={working ? 'Hazırlanıyor…' : 'PDF Aç / Paylaş'}
            icon="document-attach-outline" 
            onPress={() => void openPdf()}
          />
          <CompanyQuickActionFlat 
            label="Ek Dosyalar"
            icon="attach-outline"
            onPress={() => setTab('Ekler')}
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
            {attachmentsLoading ? <Text style={styles.muted}>CRM ekleri yükleniyor…</Text> : null}
            {attachmentsError ? <Text style={styles.err}>{attachmentsError}</Text> : null}
            {!attachmentsLoading && !attachmentsError && !attachments.length && !data.fileId ? <Text style={styles.muted}>Bu belgeye ait ek dosya bulunamadı.</Text> : null}
            {data.fileId ? <Pressable disabled={working} onPress={() => void openFile(String(data.fileId))}><Text style={styles.fileLink}>Kaydedilmiş belgeyi aç</Text></Pressable> : null}
            {attachments.map((link) => <Pressable key={String(link.id)} disabled={working} onPress={() => void openFile(String(link.file?.id ?? link.fileId))}><Text style={styles.fileLink}>{String(link.file?.originalFilename ?? 'Ek dosya')}</Text></Pressable>)}
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
  fileLink: { ...typography.bodyMd, color: colors.primary, paddingVertical: spacing.md },
  err: { color: colors.accentRed, padding: spacing.lg },
});
