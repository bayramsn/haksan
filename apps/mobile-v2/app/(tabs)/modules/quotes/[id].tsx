import { useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, Share, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BottomSheetBackdrop, BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCompany } from '@/src/api/companies.hooks';
import {
  useApproveQuote,
  useLookup,
  useQuote,
  useQuotePriceApproval,
  useQuoteWorkflowStatus,
  useRejectQuote,
  useSendQuote,
} from '@/src/api/crm.hooks';
import { useCreateSalesOrderFromQuote } from '@/src/api/inventory.hooks';
import { useCommercialDocuments } from '@/src/api/documents.hooks';
import { QUOTE_WORKFLOW_STATUSES, type QuoteWorkflowStatus } from '@/src/api/endpoints';
import { formatAmount, formatDate, formatLocalDateTime, parseLocalDateTime } from '@/src/lib/format';
import { useCan } from '@/src/auth/AuthProvider';
import { Button, Card, Chip, DetailHeader, EmptyState, ErrorState, Eyebrow, Field, ListRow, DetailSkeleton } from '@/src/ui';
import { toast } from '@/src/ui/toast';
import { InfoRows, Tabs } from '@/src/ui/data';
import { useTheme } from '@/src/theme/theme';
import { postPdfAndShare } from '@/src/native/files';

function TotalRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View className="flex-row justify-between gap-4 py-1.5">
      <Text className={`text-sm ${strong ? 'font-inter-semibold text-foreground' : 'font-inter text-muted-foreground'}`}>
        {label}
      </Text>
      <Text className={`text-sm ${strong ? 'text-[17px] font-inter-bold text-foreground' : 'font-inter text-foreground'}`}>
        {value}
      </Text>
    </View>
  );
}

type QuoteTab = 'general' | 'items' | 'terms' | 'documents';

/** Web OffersPage QUOTE_WORKFLOW_STATUS_LABELS ile birebir. */
const WORKFLOW_LABELS: Record<QuoteWorkflowStatus, string> = {
  price_waiting: 'Fiyat Bekleniyor',
  budget_waiting: 'Bütçe Bekleniyor',
  on_hold: 'Askıya Alındı',
  postponed: 'Ertelendi',
  cancelled: 'İptal Edildi',
};

/** Onay/ret kararının verilebildiği durumlar (web FOLLOW_UP_OFFER_STATUSES + sent). */
const DECIDABLE_STATUSES = new Set(['sent', 'price_waiting', 'budget_waiting', 'on_hold', 'postponed']);

export default function QuoteDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const [tab, setTab] = useState<QuoteTab>('general');
  const [pdfBusy, setPdfBusy] = useState(false);

  // İş akışı sayfası durumu
  const workflowSheetRef = useRef<BottomSheetModal>(null);
  const [workflowStatus, setWorkflowStatus] = useState<QuoteWorkflowStatus | null>(null);
  const [followUpText, setFollowUpText] = useState('');
  const [workflowNote, setWorkflowNote] = useState('');
  const [workflowError, setWorkflowError] = useState<string | null>(null);

  // Yetkiler: butonları kullanıcıya göre gizle; sunucu yine de yeniden doğrular.
  const canUpdate = useCan('quotes.update');
  const canApprove = useCan('quotes.approve');
  const canReject = useCan('quotes.reject');

  const { data, isPending, error, refetch } = useQuote(id);
  // Detay ucu join yapmıyor; firma adı ve durum adı ayrıca çözülüyor.
  const company = useCompany(data?.companyId ?? '');
  const statuses = useLookup('quote-statuses', Boolean(data?.statusId));
  const currencies = useLookup('currencies', Boolean(data?.currencyId));

  const send = useSendQuote();
  const approve = useApproveQuote();
  const reject = useRejectQuote();
  const changeWorkflow = useQuoteWorkflowStatus();
  const priceApproval = useQuotePriceApproval();
  const createOrder = useCreateSalesOrderFromQuote();

  const proformas = useCommercialDocuments('proforma', { quoteId: id });
  const contracts = useCommercialDocuments('contract', { quoteId: id });
  const invoices = useCommercialDocuments('invoice', { quoteId: id });
  const linkedDocs = useMemo(
    () =>
      [...(proformas.data?.items ?? []), ...(contracts.data?.items ?? []), ...(invoices.data?.items ?? [])].filter(
        (doc) => doc.quoteId === data?.id
      ),
    [proformas.data, contracts.data, invoices.data, data?.id]
  );
  const linkedDocumentTotal =
    (proformas.data?.total ?? 0) + (contracts.data?.total ?? 0) + (invoices.data?.total ?? 0);
  const linkedDocumentsHaveMore = proformas.hasNextPage || contracts.hasNextPage || invoices.hasNextPage;
  const linkedDocumentsFetchingMore =
    proformas.isFetchingNextPage || contracts.isFetchingNextPage || invoices.isFetchingNextPage;

  if (isPending || error || !data) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
        <DetailHeader title="Teklif" />
        {isPending ? (
          <DetailSkeleton />
        ) : (
          <ErrorState message={error?.message ?? 'Kayıt yüklenemedi.'} onRetry={() => void refetch()} />
        )}
      </SafeAreaView>
    );
  }

  const status = statuses.data?.find((s) => s.id === data.statusId) ?? null;
  const currencyCode = currencies.data?.find((c) => c.id === data.currencyId)?.code ?? 'TRY';
  const money = (value: string | null | undefined) => formatAmount(value, currencyCode);

  const validUntil = data.quoteDate
    ? new Date(new Date(data.quoteDate).getTime() + data.validityDays * 86_400_000)
    : null;

  const hasTerms = Boolean(data.paymentTerms || data.deliveryTerms || data.warrantyTerms);

  // Durum koduna göre eylem görünürlüğü (web OffersPage koşullarıyla aynı):
  const statusCode = status?.code ?? '';
  const isDraft = statusCode === 'draft';
  const canDecide = DECIDABLE_STATUSES.has(statusCode);
  const isPricePending = data.priceApprovalStatus === 'pending' || statusCode === 'pending_super_admin_approval';

  function fail(err: Error) {
    Alert.alert('İşlem tamamlanamadı', err.message);
  }

  function handleSend() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    send.mutate(id, { onSuccess: () => toast.success('Teklif gönderildi olarak işaretlendi'), onError: fail });
  }

  function handleApprove() {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    approve.mutate(id, { onSuccess: () => toast.success('Teklif onaylandı'), onError: fail });
  }

  function handleReject() {
    confirmAction('Teklifi Reddet', 'Teklif reddedilecek ve bu işlem geri alınamaz.', () =>
      reject.mutate(id, { onSuccess: () => toast.success('Teklif reddedildi'), onError: fail })
    );
  }

  function handlePriceApproval(decision: 'approved' | 'rejected') {
    if (decision === 'approved') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    confirmAction(
      decision === 'approved' ? 'Fiyatı Onayla' : 'Fiyatı Reddet',
      'İndirimli fiyat kararı kaydedilecek.',
      () =>
        priceApproval.mutate(
          { id, decision },
          {
            onSuccess: () => toast.success(decision === 'approved' ? 'Fiyat onaylandı' : 'Fiyat reddedildi'),
            onError: fail,
          }
        )
    );
  }

  /** Geri alınamaz kararlar için tek tip onay penceresi. */
  function confirmAction(title: string, message: string, onConfirm: () => void) {
    Alert.alert(title, message, [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Onayla', style: 'destructive', onPress: onConfirm },
    ]);
  }

  function handleCreateOrder() {
    createOrder.mutate(
      { quoteId: id, copyItems: true, reserveStock: false },
      {
        onSuccess: () => toast.success('Satış siparişi oluşturuldu'),
        onError: (err: Error) => Alert.alert('Sipariş oluşturulamadı', err.message),
      }
    );
  }

  function openWorkflowSheet() {
    setWorkflowError(null);
    setFollowUpText(data!.followUpAt ? formatLocalDateTime(data!.followUpAt) : '');
    setWorkflowNote('');
    setWorkflowStatus(null);
    workflowSheetRef.current?.present();
  }

  function submitWorkflow() {
    if (!workflowStatus) {
      setWorkflowError('Durum seçin.');
      return;
    }
    const followUpDate = parseLocalDateTime(followUpText);
    if (workflowStatus !== 'cancelled' && !followUpDate) {
      setWorkflowError('Bu durum için hatırlatma tarihi zorunludur (YYYY-AA-GG SS:DD).');
      return;
    }
    changeWorkflow.mutate(
      {
        id,
        body: {
          statusCode: workflowStatus,
          followUpAt: workflowStatus === 'cancelled' ? null : followUpDate!.toISOString(),
          note: workflowNote.trim() ? workflowNote.trim() : null,
        },
      },
      {
        onSuccess: () => {
          workflowSheetRef.current?.dismiss();
          toast.success(workflowStatus === 'cancelled' ? 'Teklif iptal edildi' : 'Durum ve hatırlatma kaydedildi');
        },
        onError: (err) => setWorkflowError(err.message),
      }
    );
  }

  async function handleShare() {
    try {
      const parts = [
        data!.revisionNo > 1 ? `${data!.documentNo} · R${data!.revisionNo}` : data!.documentNo,
        company.data?.legalTitle,
        money(data!.grandTotal),
      ].filter(Boolean);
      await Share.share({ message: parts.join(' — ') });
    } catch {
      // kullanıcı paylaşım sayfasını kapattı; sessizce geç
    }
  }

  async function handleDownloadPdf() {
    setPdfBusy(true);
    try {
      await postPdfAndShare(`/api/v1/quotes/${data!.id}/generate-pdf`, `${data!.documentNo}.pdf`);
    } catch (e) {
      Alert.alert('Hata', e instanceof Error ? e.message : 'PDF indirilemedi.');
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <DetailHeader title="Teklif Detayı" subtitle={data.documentNo} />

      <View className="px-4 pt-4">
        <Card className="gap-2">
          <View className="flex-row items-start justify-between gap-3">
            <View className="flex-1 gap-1">
              {status ? <Chip tone="info" label={status.name} /> : null}
              <Text className="text-[20px] font-inter-semibold text-foreground">
                {data.revisionNo > 1 ? `${data.documentNo} · R${data.revisionNo}` : data.documentNo}
              </Text>
              <Text className="font-inter text-[13px] text-muted-foreground" numberOfLines={2}>
                {company.data?.legalTitle ?? '—'}
              </Text>
            </View>
            <View className="items-end">
              <Text className="font-inter text-[11px] text-muted-foreground">Genel toplam</Text>
              <Text className="text-[19px] font-inter-bold text-foreground" numberOfLines={1}>
                {money(data.grandTotal)}
              </Text>
            </View>
          </View>

          {/* Eylem satırı: web OffersPage teklif iletişim kutusuyla aynı görünürlük kuralları. */}
          {(isDraft || canDecide || isPricePending || (canUpdate && !isDraft)) ? (
            <View className="gap-2 border-t border-border pt-3">
              {canUpdate && isDraft ? (
                <Button label="Gönderildi İşaretle" onPress={handleSend} loading={send.isPending} disabled={send.isPending} />
              ) : null}
              {statusCode === 'approved' && canUpdate ? (
                <Button
                  label="Satış Siparişi Oluştur"
                  onPress={handleCreateOrder}
                  loading={createOrder.isPending}
                  disabled={createOrder.isPending || send.isPending || approve.isPending || reject.isPending || priceApproval.isPending}
                />
              ) : null}
              {canApprove && canDecide ? (
                <Button label="Onayla" onPress={handleApprove} loading={approve.isPending} disabled={approve.isPending} />
              ) : null}
              {canReject && canDecide ? (
                <Button label="Reddet" variant="ghost" onPress={handleReject} loading={reject.isPending} disabled={reject.isPending} />
              ) : null}
              {isPricePending && canApprove ? (
                <Button label="Fiyatı Onayla" onPress={() => handlePriceApproval('approved')} loading={priceApproval.isPending} disabled={priceApproval.isPending} />
              ) : null}
              {isPricePending && canReject ? (
                <Button label="Fiyatı Reddet" variant="ghost" onPress={() => handlePriceApproval('rejected')} loading={priceApproval.isPending} disabled={priceApproval.isPending} />
              ) : null}
              {canUpdate && !isDraft ? (
                <Button
                  label="Durum Güncelle"
                  variant="ghost"
                  onPress={openWorkflowSheet}
                  disabled={send.isPending || approve.isPending || reject.isPending || priceApproval.isPending}
                />
              ) : null}
            </View>
          ) : null}
        </Card>
      </View>

      <View className="pt-3">
        <Tabs
          tabs={[
            { value: 'general', label: 'Genel' },
            { value: 'items', label: 'Ürünler', badge: data.items?.length ?? 0 },
            { value: 'terms', label: 'Koşullar' },
            { value: 'documents', label: 'Belgeler', badge: linkedDocumentTotal },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>

      <ScrollView className="flex-1" contentContainerClassName="gap-4 px-4 pb-10 pt-4">
        {tab === 'general' ? (
          <Card>
            <InfoRows
              items={[
                { label: 'Teklif tarihi', value: formatDate(data.quoteDate) },
                { label: 'Geçerlilik', value: validUntil ? `${formatDate(validUntil)} (${data.validityDays} gün)` : null },
                { label: 'İş kolu', value: data.businessLine },
                { label: 'Sorumlu', value: data.projectOwner?.fullName },
                { label: 'Gönderim', value: data.sentAt ? formatDate(data.sentAt) : null },
                { label: 'Takip', value: data.followUpAt ? formatDate(data.followUpAt) : null },
              ]}
            />
          </Card>
        ) : null}

        {tab === 'items' ? (
          <>
            <View className="gap-1.5">
              <View className="px-1">
                <Eyebrow>Kalemler ({data.items?.length ?? 0})</Eyebrow>
              </View>
              <Card className="gap-0">
                {(data.items ?? []).length === 0 ? (
                  <Text className="py-2 text-center font-inter text-sm text-muted-foreground">Kalem yok.</Text>
                ) : (
                  data.items.map((item, index) => (
                    <View key={item.id} className={`gap-1 py-2.5 ${index > 0 ? 'border-t border-border' : ''}`}>
                      <Text className="text-[14px] font-inter-medium text-foreground" numberOfLines={3}>
                        {item.description}
                      </Text>
                      <View className="flex-row justify-between gap-3">
                        <Text className="font-inter text-[12px] text-muted-foreground">
                          {Number(item.quantity)} × {money(item.unitPrice)}
                          {Number(item.discountAmount) > 0 ? ` − ${money(item.discountAmount)}` : ''}
                        </Text>
                        <Text className="font-inter-semibold text-[13px] text-foreground">{money(item.lineTotal)}</Text>
                      </View>
                    </View>
                  ))
                )}
              </Card>
            </View>

            <Card>
              <TotalRow label="Ara toplam" value={money(data.subtotal)} />
              {Number(data.discountTotal) > 0 ? <TotalRow label="İndirim" value={`− ${money(data.discountTotal)}`} /> : null}
              <TotalRow label={`KDV (%${Number(data.vatRate)})`} value={money(data.vatAmount)} />
              <View className="mt-1 border-t border-border pt-1">
                <TotalRow label="Genel toplam" value={money(data.grandTotal)} strong />
              </View>
            </Card>
          </>
        ) : null}

        {tab === 'terms' ? (
          hasTerms || data.notes ? (
            <>
              {hasTerms ? (
                <Card>
                  <InfoRows
                    items={[
                      { label: 'Ödeme', value: data.paymentTerms },
                      { label: 'Teslim', value: data.deliveryTerms },
                      { label: 'Garanti', value: data.warrantyTerms },
                    ]}
                  />
                </Card>
              ) : null}
              {data.notes ? (
                <Card className="gap-1.5">
                  <Eyebrow>Not</Eyebrow>
                  <Text className="font-inter text-sm text-foreground">{data.notes}</Text>
                </Card>
              ) : null}
            </>
          ) : (
            <EmptyState title="Koşul veya not girilmemiş" />
          )
        ) : null}

        {tab === 'documents' ? (
          linkedDocs.length > 0 ? (
            <View className="gap-0">
              {linkedDocs.map((doc) => (
                <ListRow
                  key={doc.id}
                  title={doc.no}
                  lines={[doc.date ? formatDate(doc.date) : null]}
                  icon="document-text-outline"
                  iconTone={doc.finalized ? 'success' : 'neutral'}
                  chip={doc.statusName ? { label: doc.statusName, tone: doc.finalized ? 'success' : 'neutral' } : undefined}
                  onPress={doc.companyId ? () => router.push(`/(tabs)/modules/companies/${doc.companyId}`) : undefined}
                />
              ))}
              {linkedDocumentsHaveMore ? (
                <Button
                  label="Daha Fazla Belge"
                  variant="ghost"
                  loading={linkedDocumentsFetchingMore}
                  disabled={linkedDocumentsFetchingMore}
                  onPress={() => {
                    if (proformas.hasNextPage) void proformas.fetchNextPage();
                    if (contracts.hasNextPage) void contracts.fetchNextPage();
                    if (invoices.hasNextPage) void invoices.fetchNextPage();
                  }}
                />
              ) : null}
            </View>
          ) : (
            <EmptyState
              title="Belge bulunamadı"
              hint="Bu teklife bağlı proforma, sözleşme veya fatura yok."
            />
          )
        ) : null}

        {company.data ? (
          <Button
            label="Firma Kartı"
            variant="ghost"
            onPress={() => router.push(`/(tabs)/modules/companies/${data.companyId}`)}
          />
        ) : null}

        <View className="flex-row gap-3">
          <Button label="Paylaş" variant="ghost" className="flex-1" onPress={() => void handleShare()} />
          <Button
            label="PDF İndir"
            variant="primary"
            className="flex-1"
            loading={pdfBusy}
            onPress={() => void handleDownloadPdf()}
          />
        </View>
      </ScrollView>

      <BottomSheetModal
        ref={workflowSheetRef}
        enableDynamicSizing
        backgroundStyle={{ backgroundColor: colors.card }}
        handleIndicatorStyle={{ backgroundColor: colors.mutedForeground }}
        backdropComponent={(props) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />}
      >
        <BottomSheetView className="gap-3 px-5 pb-10 pt-2">
          <Text className="font-inter-semibold text-base text-foreground">Durum Güncelle</Text>
          <Text className="font-inter text-xs text-muted-foreground">
            Seçtiğin hatırlatma tarihi takvimde ve bildirimlerde tekrar karşına çıkar (web ile aynı).
          </Text>
          {QUOTE_WORKFLOW_STATUSES.map((option) => (
            <Button
              key={option}
              label={WORKFLOW_LABELS[option]}
              variant={option === 'cancelled' ? 'destructive' : workflowStatus === option ? 'primary' : 'ghost'}
              onPress={() => setWorkflowStatus(option)}
            />
          ))}
          {workflowStatus && workflowStatus !== 'cancelled' ? (
            <Field
              label="Hatırlatma tarihi *"
              value={followUpText}
              onChangeText={(v) => {
                setFollowUpText(v);
                setWorkflowError(null);
              }}
              placeholder="YYYY-AA-GG SS:DD"
              error={workflowError ?? undefined}
            />
          ) : null}
          {workflowStatus ? (
            <Field
              label="Not"
              value={workflowNote}
              onChangeText={(v) => {
                setWorkflowNote(v);
                setWorkflowError(null);
              }}
              placeholder="Örn. müşteri bütçe onayı bekliyor"
              multiline
              numberOfLines={2}
            />
          ) : null}
          {workflowStatus === 'cancelled' && workflowError ? (
            <Text className="font-inter text-xs text-destructive">{workflowError}</Text>
          ) : null}
          <Button
            label="Kaydet"
            onPress={submitWorkflow}
            loading={changeWorkflow.isPending}
            disabled={!workflowStatus || changeWorkflow.isPending}
          />
          <View style={{ height: 4 }} />
        </BottomSheetView>
      </BottomSheetModal>
    </SafeAreaView>
  );
}
