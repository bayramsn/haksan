import { ProformaPrintVariant } from './ProformaPrintVariant';
import { useNavigationBottomInset } from '@/src/ui/LiquidGlassTabBarBackground';
import { Alert, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useCompany } from '@/src/api/companies.hooks';
import { useLookup } from '@/src/api/crm.hooks';
import {
  useDeleteCommercialInvoice,
  useDeleteContract,
  useDeleteProforma,
  useLinkedFile,
} from '@/src/api/commercial-docs.hooks';
import { useCommercialDocument, type DocumentKind } from '@/src/api/documents.hooks';
import { useQuoteDetail } from '@/src/api/quotes.hooks';
import { useCan } from '@/src/auth/AuthProvider';
import { formatAmount, formatDate, formatDateTime } from '@/src/lib/format';
import { useState } from 'react';
import { documentPdfRequest } from './document-pdf';
import { downloadAndShareFile, postPdfAndShare } from '@/src/native/files';
import { Button, Card, Chip, DetailHeader, DetailSkeleton, EmptyState, ErrorState, Eyebrow } from '@/src/ui';
import { InfoRows, type InfoItem } from '@/src/ui/data';
import { toast } from '@/src/ui/toast';
import { contractSignatureLabel, formatFileSize, isStandaloneSnapshot, recordRelationLabel } from './document-logic';
import { validUntil } from './quote-logic';

const KIND_META: Record<DocumentKind, { title: string; statuses: string; perm: 'proformas' | 'contracts' | 'commercial_invoices' }> = {
  proforma: { title: 'Proforma', statuses: 'proforma-statuses', perm: 'proformas' },
  contract: { title: 'Sözleşme', statuses: 'contract-statuses', perm: 'contracts' },
  invoice: { title: 'Ticari Fatura', statuses: 'invoice-statuses', perm: 'commercial_invoices' },
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function text(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function TermBlock({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <View className="gap-1">
      <Text className="font-inter-medium text-xs text-muted-foreground">{label}</Text>
      <Text className="font-inter text-sm text-foreground">{value}</Text>
    </View>
  );
}

/**
 * Proforma / sözleşme / ticari fatura detayı: kaynak ve akış (teklif durumu,
 * geçerlilik, fırsat), dondurulmuş kalemler, şartlar, yüklü dosya ve
 * düzenle / imzalı nüsha / sil aksiyonları.
 */
export function CommercialDocumentDetail({ kind, id }: { kind: DocumentKind; id: string }) {
  const GLASS_TAB_BAR_HEIGHT = useNavigationBottomInset();
  const router = useRouter();
  const [pdfBusy, setPdfBusy] = useState(false);
  const [printVariant, setPrintVariant] = useState('');
  const meta = KIND_META[kind];
  const query = useCommercialDocument(kind, id);
  const quoteId = query.data?.quoteId ?? '';
  const quote = useQuoteDetail(quoteId);
  const rawCompanyId = query.data && 'companyId' in query.data ? (query.data.companyId ?? '') : '';
  const companyId = rawCompanyId || quote.data?.companyId || '';
  const company = useCompany(companyId);
  const statuses = useLookup(meta.statuses);
  const quoteStatuses = useLookup('quote-statuses', Boolean(quoteId));
  const currencies = useLookup('currencies');
  const canReadFiles = useCan('files.read');
  const canUpload = useCan('files.create');
  const canUpdate = useCan(`${meta.perm}.update`);
  const canDelete = useCan(`${meta.perm}.delete`);
  const linkedFile = useLinkedFile(query.data?.fileId ?? null, canReadFiles);
  const deleteProforma = useDeleteProforma();
  const deleteContract = useDeleteContract();
  const deleteInvoice = useDeleteCommercialInvoice();

  if (query.isPending || query.error || !query.data) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
        <DetailHeader title={meta.title} />
        {query.isPending ? (
          <DetailSkeleton />
        ) : (
          <ErrorState message={query.error?.message ?? 'Belge yüklenemedi.'} onRetry={() => void query.refetch()} />
        )}
      </SafeAreaView>
    );
  }

  const data = query.data as unknown as Record<string, unknown>;
  const snapshot = record(data.documentSnapshot);
  const standalone = isStandaloneSnapshot(snapshot);
  const snapshotQuote = record(snapshot?.quote);
  const snapshotCompany = record(snapshot?.company);
  const snapshotContact = record(snapshot?.contact);
  const snapshotCurrency = record(snapshot?.currency);
  const ownTerms = record(data.terms) ?? record(snapshot?.terms) ?? (!snapshot ? record(quote.data?.terms) : null);
  const frozenItems = Array.isArray(snapshot?.items)
    ? snapshot.items.map(record).filter((item): item is Record<string, unknown> => Boolean(item))
    : [];
  // Web DocumentDetailDialog: dondurulmuş kalem yoksa taslak belge bağlı teklifin canlı verisini gösterir.
  // Web: snapshot varsa (kalemsiz olsa bile) canlı veri hiç kullanılmaz; kesinleşmiş tutar karışmasın.
  const liveQuote = !snapshot && !standalone && quote.data ? (quote.data as unknown as Record<string, unknown>) : null;
  const items = liveQuote
    ? (quote.data?.items ?? []).map((item) => item as unknown as Record<string, unknown>)
    : frozenItems;
  const totals = snapshotQuote ?? liveQuote;
  const status = statuses.data?.find((item) => item.id === text(data.statusId));
  const currencyCode =
    text(snapshotCurrency?.code) ??
    currencies.data?.find((item) => item.id === quote.data?.currencyId)?.code ??
    currencies.data?.find((item) => item.id === text(data.currencyId))?.code ??
    'USD';
  const companyName =
    text(snapshotCompany?.shortName) ?? text(snapshotCompany?.legalTitle) ?? company.data?.shortName ?? company.data?.legalTitle ?? text(data.companyNameText);
  const no = text(data.documentNo) ?? text(data.contractNo) ?? text(data.invoiceNo) ?? '—';
  const date = text(data.issueDate) ?? text(data.signedDate) ?? text(data.invoiceDate);
  const finalizedAt = text(data.finalizedAt);
  const fileId = text(data.fileId);
  const fileLink = linkedFile.data;
  const relation = recordRelationLabel({ quoteId: quoteId || null, companyId: companyId || null, standalone, kind });
  const quoteStatus = quoteStatuses.data?.find((item) => item.id === quote.data?.statusId);
  const validity = quote.data ? validUntil(quote.data.quoteDate, quote.data.validityDays) : null;
  const expired = validity ? validity.getTime() < Date.now() : false;

  const editHref =
    kind === 'invoice'
      ? (`/modal/commercial-invoice-form?id=${id}` as const)
      : kind === 'proforma'
        ? standalone
          ? (`/modal/proforma-quick?id=${id}` as const)
          : (`/modal/proforma-form?id=${id}` as const)
        : standalone
          ? (`/modal/contract-quick?id=${id}` as const)
          : (`/modal/contract-form?id=${id}` as const);

  const openFile = async () => {
    if (!fileId) return;
    try {
      await downloadAndShareFile(fileId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Dosya indirilemedi.');
    }
  };

  async function generatePdf() {
    if (kind === 'invoice' || pdfBusy) return;
    setPdfBusy(true);
    try { const request = documentPdfRequest(kind, id, no); await postPdfAndShare(request.path, request.filename, kind === 'proforma' && printVariant ? { variantKey: printVariant } : undefined); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'PDF oluşturulamadı.'); }
    finally { setPdfBusy(false); }
  }

  function confirmDelete() {
    const mutation = kind === 'proforma' ? deleteProforma : kind === 'contract' ? deleteContract : deleteInvoice;
    Alert.alert(`${meta.title} silinsin mi?`, `${no} kaydı silinir. Bu işlem geri alınamaz.`, [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: () =>
          mutation.mutate(id, {
            onSuccess: () => {
              toast.success(`${meta.title} silindi`);
              router.back();
            },
            onError: (error) => toast.error(`${meta.title} silinemedi: ${error.message}`),
          }),
      },
    ]);
  }

  const deleting = deleteProforma.isPending || deleteContract.isPending || deleteInvoice.isPending;

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <DetailHeader
        title={`${meta.title} Detayı`}
        subtitle={no}
        actions={canUpdate ? [{ icon: 'create-outline', label: `${meta.title} düzenle`, onPress: () => router.push(editHref) }] : []}
      />
      <ScrollView
      contentContainerStyle={{ paddingBottom: GLASS_TAB_BAR_HEIGHT + 32 }}
        contentContainerClassName="gap-4 px-4 pb-10 pt-4"
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={() => {
              void query.refetch();
              void quote.refetch();
            }}
          />
        }
      >
        <Card className="gap-2">
          <View className="flex-row flex-wrap gap-2">
            <Chip label={status?.name ?? (statuses.isPending ? 'Durum yükleniyor' : 'Durum bilinmiyor')} tone={finalizedAt ? 'success' : 'neutral'} />
            <Chip label={finalizedAt ? 'Kesinleşti' : 'Taslak / canlı'} tone={finalizedAt ? 'success' : 'warning'} />
            {kind === 'contract' ? (
              <Chip label={contractSignatureLabel(snapshot, status?.code)} tone={status?.code === 'signed' ? 'success' : 'warning'} />
            ) : null}
          </View>
          <Text className="font-display text-[20px] text-foreground">{no}</Text>
          <Text className="font-inter text-sm text-muted-foreground">{companyName ?? 'Firma bilgisi yok'}</Text>
          {text(totals?.grandTotal) ? (
            <Text className="font-inter-semibold text-base text-foreground">{formatAmount(text(totals?.grandTotal), currencyCode)}</Text>
          ) : null}
        </Card>

        <Card className="gap-3">
          <Eyebrow>Kaynak ve akış</Eyebrow>
          <View className="flex-row flex-wrap gap-2">
            <Chip label={relation} tone={relation === 'Bağlantı gerekli' ? 'destructive' : 'neutral'} />
            {quote.data ? <Chip label={`${quote.data.documentNo} · R${quote.data.revisionNo}`} tone="info" /> : null}
            {quoteStatus ? <Chip label={`Teklif: ${quoteStatus.name}`} tone="neutral" /> : null}
          </View>
          {validity ? (
            <Text className={`font-inter text-xs ${expired ? 'text-warning' : 'text-muted-foreground'}`}>
              Teklif geçerliliği: {formatDate(validity.toISOString())}
              {expired ? ' · süresi doldu' : ''}
            </Text>
          ) : null}
          <View className="gap-2">
            {quoteId ? <Button label="Teklife Git" variant="ghost" trailingIcon="document-text-outline" onPress={() => router.push(`/modules/quotes/${quoteId}`)} /> : null}
            {quote.data?.opportunityId ? (
              <Button
                label="Fırsatı aç"
                variant="ghost"
                trailingIcon="briefcase-outline"
                onPress={() => router.push(`/modules/opportunities/${quote.data!.opportunityId}`)}
              />
            ) : null}
            {companyId ? <Button label="Firmaya Git" variant="ghost" trailingIcon="business-outline" onPress={() => router.push(`/modules/companies/${companyId}`)} /> : null}
          </View>
        </Card>

        <Card>
          <InfoRows
            items={
              [
                { label: 'Belge tarihi', value: date ? formatDate(date) : null },
                { label: 'İş kolu', value: text(data.businessLine) },
                { label: 'Para birimi', value: currencyCode },
                { label: 'Ödeme vadesi', value: data.paymentTermDays == null ? null : `${text(data.paymentTermDays)} gün` },
                { label: 'Kesinleşme', value: finalizedAt ? formatDateTime(finalizedAt) : null },
                { label: 'Kayıt tarihi', value: text(data.createdAt) ? formatDateTime(text(data.createdAt)!) : null },
                { label: 'Kontak', value: text(snapshotContact?.fullName) },
              ] satisfies InfoItem[]
            }
          />
        </Card>

        {totals ? (
          <Card>
            <InfoRows
              items={
                [
                  { label: 'Ara toplam', value: formatAmount(text(totals.subtotal), currencyCode) },
                  { label: 'İndirim', value: formatAmount(text(totals.discountTotal), currencyCode) },
                  { label: 'KDV', value: formatAmount(text(totals.vatAmount), currencyCode) },
                  { label: 'Gümrük', value: formatAmount(text(totals.customsTotal), currencyCode) },
                  { label: 'Genel toplam', value: formatAmount(text(totals.grandTotal), currencyCode) },
                ] satisfies InfoItem[]
              }
            />
          </Card>
        ) : null}

        <View className="gap-2">
          <View className="px-1">
            <Eyebrow>{liveQuote ? `Kalemler · bağlı tekliften canlı (${items.length})` : `Belge Kalemleri (${items.length})`}</Eyebrow>
          </View>
          {items.length ? (
            items.map((item, index) => (
              <Card key={text(item.id) ?? String(index)} className="gap-1.5">
                <Text className="font-inter-medium text-sm text-foreground">{text(item.description) ?? 'Belge kalemi'}</Text>
                <Text className="font-inter text-xs text-muted-foreground">
                  {[text(item.quantity), text(item.unitCode), text(item.unitPrice) ? `× ${formatAmount(text(item.unitPrice), currencyCode)}` : null]
                    .filter(Boolean)
                    .join(' ')}
                </Text>
                {text(item.lineTotal) ? <Text className="font-inter-semibold text-sm text-foreground">{formatAmount(text(item.lineTotal), currencyCode)}</Text> : null}
              </Card>
            ))
          ) : (
            <Card>
              <EmptyState title="Dondurulmuş kalem verisi yok" hint="Taslak belge bağlı tekliften canlı veri kullanıyor olabilir." />
            </Card>
          )}
        </View>

        {ownTerms || totals ? (
          <Card className="gap-3">
            <Eyebrow>Şartlar</Eyebrow>
            <TermBlock label="Ödeme" value={text(ownTerms?.paymentTermsText) ?? text(totals?.paymentTerms)} />
            <TermBlock label="Teslimat" value={text(ownTerms?.deliveryTermsText) ?? text(totals?.deliveryTerms)} />
            <TermBlock label="Garanti" value={text(ownTerms?.warrantyTermsText) ?? text(totals?.warrantyTerms)} />
            {kind === 'contract' ? <TermBlock label="Teslim yeri" value={text(ownTerms?.deliveryLocation)} /> : null}
          </Card>
        ) : null}

        <Card className="gap-2">
          <Eyebrow>CRM belgesi</Eyebrow>
          <Text className="font-inter text-xs leading-5 text-muted-foreground">
            {kind === 'invoice' ? 'Yüklenmiş CRM belgesini açıp paylaşabilirsiniz.' : 'PDF, bu belgenin kayıtlı fiyat ve şartlarıyla sunucuda oluşturulur.'}
          </Text>
          {kind === 'proforma' ? <ProformaPrintVariant value={printVariant} onChange={setPrintVariant} /> : null}
          {kind !== 'invoice' ? <Button label="PDF oluştur / paylaş" trailingIcon="download-outline" loading={pdfBusy} disabled={pdfBusy} onPress={() => void generatePdf()} /> : null}
          {fileId ? (
            <>
              {linkedFile.error ? <ErrorState message={linkedFile.error.message} onRetry={() => void linkedFile.refetch()} /> : null}
              <InfoRows
                items={
                  [
                    { label: 'Dosya', value: fileLink?.file.originalFilename ?? null },
                    { label: 'Boyut', value: fileLink ? formatFileSize(fileLink.file.sizeBytes) : null },
                    { label: 'Yükleyen', value: fileLink?.file.uploaderName ?? null },
                    { label: 'Yüklenme', value: fileLink ? formatDateTime(fileLink.file.createdAt) : null },
                  ] satisfies InfoItem[]
                }
              />
              {canReadFiles ? (
                <Button label="CRM PDF'ini Aç / Paylaş" trailingIcon="download-outline" onPress={() => void openFile()} />
              ) : null}
            </>
          ) : (
            <Text className="font-inter text-xs text-muted-foreground">
              Bu kayda yüklenmiş bir nüsha yok. İmzalı nüsha ayrıca eklenebilir.
            </Text>
          )}
        </Card>

        {kind === 'contract' && canUpdate && canUpload && status?.code !== 'signed' ? (
          <Button
            label="İmzalı Sözleşme Yükle"
            variant="ghost"
            trailingIcon="cloud-upload-outline"
            onPress={() => router.push(`/modal/contract-signed-upload?id=${id}`)}
          />
        ) : null}
        {canUpdate ? <Button label={`${meta.title} Düzenle`} variant="ghost" trailingIcon="create-outline" onPress={() => router.push(editHref)} /> : null}
        {canDelete ? (
          <Button label={`${meta.title} Sil`} variant="destructive" trailingIcon="trash-outline" loading={deleting} onPress={confirmDelete} />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
