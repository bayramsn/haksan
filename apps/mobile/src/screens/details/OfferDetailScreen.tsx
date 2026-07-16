import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { activityService, quoteService, salesOrderService } from '@/src/api/services';
import { normalizeList } from '@/src/modules/registry';
import { PdfPreview } from '@/src/ui/PdfPreview';
import {
  OfferActivityCard,
  OfferDetailFooter,
  OfferDetailHeader,
  OfferDetailTabBar,
  OfferDetailTotalsPanel,
  OfferHeroCard,
  OfferLineReadCard,
  OfferRevisionCard,
  OfferTermsBlock,
  type OfferDetailTab,
} from '@/src/ui/offer/OfferDetailWidgets';
import { currencyCodeFromRow, documentNoFromRow, statusFromRow } from '@/src/ui/offer/offerHelpers';
import { Screen } from '@/src/ui/Screen';
import { colors, fonts, layout, spacing, typography } from '@/src/theme/tokens';

type Props = { id: string };

/** Stitch Teklif Detay — `1194f1f021df4baa8d4e53a6e4b9aa64` · web OffersPage akışı */
export function OfferDetailScreen({ id }: Props) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [activities, setActivities] = useState<Record<string, unknown>[]>([]);
  const [revisions, setRevisions] = useState<Record<string, unknown>[]>([]);
  const [linkedOrder, setLinkedOrder] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<OfferDetailTab>('kalemler');

  const load = useCallback(async () => {
    try {
      const quote = (await quoteService.get(id)) as Record<string, unknown>;
      setData(quote);
      setError(null);

      const oppId = String(quote.opportunityId ?? '');
      if (oppId) {
        const acts = await activityService.list({ opportunityId: oppId, pageSize: 30 });
        setActivities(normalizeList(acts));
      } else {
        setActivities([]);
      }

      const docNo = String(quote.documentNo ?? '');
      if (docNo) {
        const all = await quoteService.list({ search: docNo.split('-')[0] ?? docNo, pageSize: 50 });
        const rows = normalizeList(all).filter(
          (row) => String(row.documentNo ?? '') === docNo || String(row.opportunityId ?? '') === oppId,
        );
        setRevisions(rows.length ? rows : [quote]);
      } else {
        setRevisions([quote]);
      }

      const orders = await salesOrderService.list({ pageSize: 50 });
      const orderRows = normalizeList(orders);
      const match =
        orderRows.find((o) => String(o.quoteId ?? '') === id) ??
        orderRows.find((o) => {
          const q = o.quote as Record<string, unknown> | undefined;
          return String(q?.id ?? '') === id;
        });
      setLinkedOrder(match ?? null);
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

  const statusCode = statusFromRow(data ?? {}).code;

  const onSend = async () => {
    setSending(true);
    try {
      await quoteService.send(id);
      Alert.alert('Gönderildi', 'Teklif müşteriye gönderildi.');
      await load();
    } catch (e) {
      Alert.alert('Hata', e instanceof Error ? e.message : 'Gönderilemedi');
    } finally {
      setSending(false);
    }
  };

  const onApprove = async () => {
    try {
      await quoteService.approve(id);
      Alert.alert('Onaylandı', 'Teklif onaylandı.');
      await load();
    } catch (e) {
      Alert.alert('Hata', e instanceof Error ? e.message : 'Onaylanamadı');
    }
  };

  const onReject = async () => {
    Alert.alert('Teklifi Reddet', 'Bu teklif reddedilecek. Emin misiniz?', [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Reddet',
        style: 'destructive',
        onPress: () => {
          void quoteService
            .reject(id)
            .then(() => load())
            .catch((e) => Alert.alert('Hata', e instanceof Error ? e.message : 'Reddedilemedi'));
        },
      },
    ]);
  };

  const onCreateOrder = async () => {
    setCreatingOrder(true);
    try {
      const order = await salesOrderService.createFromQuote(id, { copyItems: true, reserveStock: false });
      Alert.alert('Sipariş oluşturuldu', String((order as { orderNo?: string }).orderNo ?? ''));
      await load();
    } catch (e) {
      Alert.alert('Hata', e instanceof Error ? e.message : 'Sipariş oluşturulamadı');
    } finally {
      setCreatingOrder(false);
    }
  };

  const onMore = () => {
    const actions: { text: string; onPress?: () => void; style?: 'destructive' | 'cancel' }[] = [
      { text: 'PDF İndir', onPress: () => void quoteService.downloadPdf(id) },
      { text: 'Proforma Oluştur', onPress: () => router.push(`/forms/proforma?quoteId=${id}`) },
      { text: 'Sözleşme Oluştur', onPress: () => router.push(`/forms/contract?quoteId=${id}`) },
    ];

    if (statusCode === 'draft') {
      actions.unshift({
        text: 'Düzenle',
        onPress: () => router.push(`/forms/offer?offerId=${id}`),
      });
    }

    if (statusCode === 'sent') {
      actions.unshift({ text: 'Onayla', onPress: () => void onApprove() });
      actions.splice(1, 0, { text: 'Reddet', style: 'destructive', onPress: () => void onReject() });
    }

    if (statusCode === 'approved' && !linkedOrder) {
      actions.unshift({ text: 'Sipariş Oluştur', onPress: () => void onCreateOrder() });
    }

    if (opportunityId) {
      actions.push({
        text: 'Yeni Revizyon',
        onPress: () => router.push(`/forms/offer?revisionFrom=${id}`),
      });
    }

    actions.push({ text: 'İptal', style: 'cancel' });

    Alert.alert('Teklif İşlemleri', undefined, actions);
  };

  const onShare = async () => {
    try {
      await Share.share({ message: `Teklif ${documentNoFromRow(data ?? {})}` });
    } catch {
      // kullanıcı iptal etmiş olabilir
    }
  };

  if (loading) {
    return (
      <Screen>
        <ActivityIndicator color={colors.primary} style={styles.loader} />
      </Screen>
    );
  }

  if (error || !data) {
    return (
      <Screen>
        <Text style={styles.error}>{error ?? 'Kayıt bulunamadı'}</Text>
      </Screen>
    );
  }

  const items = (Array.isArray(data.items) ? data.items : []) as Record<string, unknown>[];
  const currency = currencyCodeFromRow(data);
  const companyId = String(data.companyId ?? '');
  const opportunityId = String(data.opportunityId ?? '');
  const orderNo = String(linkedOrder?.orderNo ?? '');

  return (
    <Screen padded={false} edges={['left', 'right']}>
      <OfferDetailHeader
        title={documentNoFromRow(data)}
        onBack={() => router.back()}
        onShare={onShare}
        onMore={onMore}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <OfferHeroCard
          data={data}
          onCompanyPress={companyId ? () => router.push(`/modules/customers/${companyId}`) : undefined}
        />
        {opportunityId ? (
          <PressableInfo
            label="Satış kartı"
            value="Satış kartını görüntüle"
            onPress={() => router.push(`/modules/sales-cases/${opportunityId}`)}
          />
        ) : null}
        <OfferDetailTotalsPanel data={data} />
        <OfferDetailTabBar value={tab} onChange={setTab} />

        {tab === 'kalemler' ? (
          <View style={styles.tabBody}>
            {items.length ? (
              items.map((item, idx) => (
                <OfferLineReadCard key={String(item.id ?? idx)} item={item} currencyCode={currency} />
              ))
            ) : (
              <Text style={styles.empty}>Kalem bulunamadı</Text>
            )}
          </View>
        ) : null}

        {tab === 'kosullar' ? (
          <View style={styles.tabBody}>
            <OfferTermsBlock data={data} />
          </View>
        ) : null}

        {tab === 'aktivite' ? (
          <View style={styles.tabBody}>
            {activities.length ? (
              activities.map((item, idx) => <OfferActivityCard key={String(item.id ?? idx)} item={item} />)
            ) : (
              <Text style={styles.empty}>Aktivite kaydı yok</Text>
            )}
          </View>
        ) : null}

        {tab === 'revizyonlar' ? (
          <View style={styles.tabBody}>
            {opportunityId ? (
              <Pressable
                onPress={() => router.push(`/forms/offer?revisionFrom=${id}`)}
                style={styles.revisionCta}
              >
                <Text style={styles.revisionCtaText}>+ Yeni Revizyon</Text>
              </Pressable>
            ) : null}
            {revisions.map((row, idx) => (
              <OfferRevisionCard
                key={String(row.id ?? idx)}
                row={row}
                currentId={id}
                onPress={
                  String(row.id) !== id ? () => router.replace(`/modules/offers/${String(row.id)}`) : undefined
                }
              />
            ))}
          </View>
        ) : null}

        {tab === 'pdf' ? (
          <View style={styles.pdfWrap}>
            <PdfPreview path={`/quotes/${id}/generate-pdf`} />
          </View>
        ) : null}
      </ScrollView>

      <OfferDetailFooter
        statusCode={statusCode}
        hasOrder={Boolean(linkedOrder)}
        orderNo={orderNo || undefined}
        sending={sending}
        creatingOrder={creatingOrder}
        onPdf={() => void quoteService.downloadPdf(id)}
        onSend={statusCode === 'draft' ? () => void onSend() : undefined}
        onApprove={statusCode === 'sent' ? () => void onApprove() : undefined}
        onReject={statusCode === 'sent' ? () => void onReject() : undefined}
        onCreateOrder={statusCode === 'approved' && !linkedOrder ? () => void onCreateOrder() : undefined}
        onEdit={statusCode === 'draft' ? () => router.push(`/forms/offer?offerId=${id}`) : undefined}
      />
    </Screen>
  );
}

function PressableInfo({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.infoLinkWrap}>
      <Text style={styles.infoLinkLabel}>{label}</Text>
      <Text style={styles.infoLinkValue}>{value}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  loader: { marginTop: spacing.xxxl },
  error: { color: colors.accentRed, padding: layout.containerMargin, ...typography.bodySm },
  scroll: { flex: 1, backgroundColor: colors.canvas },
  scrollContent: {
    paddingHorizontal: layout.containerMargin,
    paddingTop: spacing.lg,
    paddingBottom: 140,
    gap: spacing.lg,
  },
  tabBody: { gap: spacing.sm },
  empty: { ...typography.bodySm, color: colors.onSurfaceVariant, paddingVertical: spacing.lg },
  pdfWrap: { minHeight: 480, borderRadius: 12, overflow: 'hidden' },
  infoLinkWrap: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: spacing.md,
    gap: 4,
  },
  infoLinkLabel: { ...typography.caption, color: colors.outline, textTransform: 'uppercase' },
  infoLinkValue: { ...typography.bodySm, color: colors.primary, fontFamily: fonts.semibold },
  revisionCta: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  revisionCtaText: { ...typography.label, color: '#fff' },
});
