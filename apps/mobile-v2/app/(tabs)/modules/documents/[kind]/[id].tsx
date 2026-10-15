import { Alert, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCompany } from '@/src/api/companies.hooks';
import { useLookup, useQuote } from '@/src/api/crm.hooks';
import { useCommercialDocument, type DocumentKind } from '@/src/api/documents.hooks';
import { useCan } from '@/src/auth/AuthProvider';
import { formatAmount, formatDate, formatDateTime } from '@/src/lib/format';
import { downloadAndShareFile } from '@/src/native/files';
import { Button, Card, Chip, DetailHeader, EmptyState, ErrorState, Eyebrow, Loading } from '@/src/ui';
import { InfoRows, type InfoItem } from '@/src/ui/data';

const KIND_META: Record<DocumentKind, { title: string; statuses: string }> = {
  proforma: { title: 'Proforma', statuses: 'proforma-statuses' },
  contract: { title: 'Sözleşme', statuses: 'contract-statuses' },
  invoice: { title: 'Ticari Fatura', statuses: 'invoice-statuses' },
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function text(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function documentNumber(data: Record<string, unknown>): string {
  return text(data.documentNo) ?? text(data.contractNo) ?? text(data.invoiceNo) ?? '—';
}

function documentDate(data: Record<string, unknown>): string | null {
  return text(data.issueDate) ?? text(data.signedDate) ?? text(data.invoiceDate);
}

export default function CommercialDocumentDetailScreen() {
  const params = useLocalSearchParams<{ kind: string; id: string }>();
  const router = useRouter();
  const kind = (['proforma', 'contract', 'invoice'] as const).includes(params.kind as DocumentKind)
    ? params.kind as DocumentKind
    : null;
  const safeKind = kind ?? 'proforma';
  const query = useCommercialDocument(safeKind, kind ? params.id : '');
  const quoteId = query.data?.quoteId ?? '';
  const quote = useQuote(quoteId);
  const rawCompanyId = query.data && 'companyId' in query.data ? query.data.companyId ?? '' : '';
  const companyId = rawCompanyId || quote.data?.companyId || '';
  const company = useCompany(companyId);
  const statuses = useLookup(KIND_META[safeKind].statuses, Boolean(kind));
  const currencies = useLookup('currencies', Boolean(kind));
  const canReadFiles = useCan('files.read');

  if (!kind) return <Redirect href="/(tabs)/modules/documents" />;
  if (query.isPending || query.error || !query.data) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
        <DetailHeader title={KIND_META[kind].title} />
        {query.isPending ? <Loading /> : <ErrorState message={query.error?.message ?? 'Belge yüklenemedi.'} onRetry={() => void query.refetch()} />}
      </SafeAreaView>
    );
  }

  const data = query.data as unknown as Record<string, unknown>;
  const snapshot = record(data.documentSnapshot);
  const snapshotQuote = record(snapshot?.quote);
  const snapshotCompany = record(snapshot?.company);
  const snapshotContact = record(snapshot?.contact);
  const snapshotCurrency = record(snapshot?.currency);
  const ownTerms = record(data.terms) ?? record(snapshot?.terms);
  const items = Array.isArray(snapshot?.items) ? snapshot.items.map(record).filter((item): item is Record<string, unknown> => Boolean(item)) : [];
  const statusId = text(data.statusId);
  const status = statuses.data?.find((item) => item.id === statusId);
  const currencyId = text(data.currencyId) ?? text(snapshotQuote?.currencyId);
  const currencyCode = text(snapshotCurrency?.code)
    ?? currencies.data?.find((item) => item.id === quote.data?.currencyId)?.code
    ?? currencies.data?.find((item) => item.id === currencyId)?.code
    ?? 'TRY';
  const companyName = text(snapshotCompany?.shortName)
    ?? text(snapshotCompany?.legalTitle)
    ?? company.data?.shortName
    ?? company.data?.legalTitle
    ?? text(data.companyNameText);
  const no = documentNumber(data);
  const date = documentDate(data);
  const finalizedAt = text(data.finalizedAt);
  const fileId = text(data.fileId);

  const openFile = async () => {
    if (!fileId) return;
    try {
      await downloadAndShareFile(fileId);
    } catch (error) {
      Alert.alert('Dosya açılamadı', error instanceof Error ? error.message : 'Dosya indirilemedi.');
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <DetailHeader title={`${KIND_META[kind].title} Detayı`} subtitle={no} />
      <ScrollView contentContainerClassName="gap-4 px-4 pb-10 pt-4">
        <Card className="gap-2">
          <View className="flex-row flex-wrap gap-2">
            <Chip label={status?.name ?? (statuses.isPending ? 'Durum yükleniyor' : 'Durum bilinmiyor')} tone={finalizedAt ? 'success' : 'neutral'} />
            <Chip label={finalizedAt ? 'Kesinleşti' : 'Taslak / canlı'} tone={finalizedAt ? 'success' : 'warning'} />
          </View>
          <Text className="font-inter-semibold text-[20px] text-foreground">{no}</Text>
          <Text className="font-inter text-sm text-muted-foreground">{companyName ?? 'Firma bilgisi yok'}</Text>
        </Card>

        <Card>
          <InfoRows
            items={[
              { label: 'Belge tarihi', value: date ? formatDate(date) : null },
              { label: 'İş kolu', value: text(data.businessLine) },
              { label: 'Para birimi', value: currencyCode },
              { label: 'Ödeme vadesi', value: data.paymentTermDays == null ? null : `${text(data.paymentTermDays)} gün` },
              { label: 'Kesinleşme', value: finalizedAt ? formatDateTime(finalizedAt) : null },
              { label: 'Kayıt tarihi', value: text(data.createdAt) ? formatDateTime(text(data.createdAt)!) : null },
              { label: 'Kontak', value: text(snapshotContact?.fullName) },
            ] satisfies InfoItem[]}
          />
        </Card>

        {snapshotQuote ? (
          <Card>
            <InfoRows
              items={[
                { label: 'Ara toplam', value: formatAmount(text(snapshotQuote.subtotal), currencyCode) },
                { label: 'İndirim', value: formatAmount(text(snapshotQuote.discountTotal), currencyCode) },
                { label: 'KDV', value: formatAmount(text(snapshotQuote.vatAmount), currencyCode) },
                { label: 'Gümrük', value: formatAmount(text(snapshotQuote.customsTotal), currencyCode) },
                { label: 'Genel toplam', value: formatAmount(text(snapshotQuote.grandTotal), currencyCode) },
              ] satisfies InfoItem[]}
            />
          </Card>
        ) : null}

        <View className="gap-2">
          <View className="px-1"><Eyebrow>Belge Kalemleri ({items.length})</Eyebrow></View>
          {items.length ? items.map((item, index) => (
            <Card key={text(item.id) ?? String(index)} className="gap-1.5">
              <Text className="font-inter-medium text-sm text-foreground">{text(item.description) ?? 'Belge kalemi'}</Text>
              <Text className="font-inter text-xs text-muted-foreground">
                {[text(item.quantity), text(item.unitCode), text(item.unitPrice) ? `× ${formatAmount(text(item.unitPrice), currencyCode)}` : null].filter(Boolean).join(' ')}
              </Text>
              {text(item.lineTotal) ? <Text className="font-inter-semibold text-sm text-foreground">{formatAmount(text(item.lineTotal), currencyCode)}</Text> : null}
            </Card>
          )) : <Card><EmptyState title="Dondurulmuş kalem verisi yok" hint="Taslak belge bağlı tekliften canlı veri kullanıyor olabilir." /></Card>}
        </View>

        {ownTerms ? (
          <Card className="gap-3">
            <Eyebrow>Şartlar</Eyebrow>
            {text(ownTerms.paymentTermsText) ?? text(snapshotQuote?.paymentTerms) ? <View className="gap-1"><Text className="font-inter-medium text-xs text-muted-foreground">Ödeme</Text><Text className="font-inter text-sm text-foreground">{text(ownTerms.paymentTermsText) ?? text(snapshotQuote?.paymentTerms)}</Text></View> : null}
            {text(ownTerms.deliveryTermsText) ?? text(snapshotQuote?.deliveryTerms) ? <View className="gap-1"><Text className="font-inter-medium text-xs text-muted-foreground">Teslimat</Text><Text className="font-inter text-sm text-foreground">{text(ownTerms.deliveryTermsText) ?? text(snapshotQuote?.deliveryTerms)}</Text></View> : null}
            {text(ownTerms.warrantyTermsText) ?? text(snapshotQuote?.warrantyTerms) ? <View className="gap-1"><Text className="font-inter-medium text-xs text-muted-foreground">Garanti</Text><Text className="font-inter text-sm text-foreground">{text(ownTerms.warrantyTermsText) ?? text(snapshotQuote?.warrantyTerms)}</Text></View> : null}
          </Card>
        ) : null}

        {fileId && canReadFiles ? <Button label="Yüklü Dosyayı Aç / Paylaş" onPress={() => void openFile()} /> : null}
        {!fileId ? <Card><Text className="font-inter text-xs text-muted-foreground">Bu kayda yüklenmiş bir PDF bağlı değil. Belge içeriği yukarıdaki güvenli anlık görüntüden gösteriliyor.</Text></Card> : null}
        {companyId ? <Button label="Firmaya Git" variant="ghost" onPress={() => router.push(`/(tabs)/modules/companies/${companyId}` as Href)} /> : null}
        {quoteId ? <Button label="Teklife Git" variant="ghost" onPress={() => router.push(`/(tabs)/modules/quotes/${quoteId}` as Href)} /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}
