import { Alert, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useLookup } from '@/src/api/crm.hooks';
import { useAccountingInvoice, useCancelAccountingInvoice } from '@/src/api/finance.hooks';
import { useCan } from '@/src/auth/AuthProvider';
import { formatAmount, formatDate, formatDateTime } from '@/src/lib/format';
import { downloadAndShareFile } from '@/src/native/files';
import type { Tone } from '@/src/theme/theme';
import { Button, Card, Chip, DetailHeader, EmptyState, ErrorState, Eyebrow, Loading } from '@/src/ui';
import { InfoRows, type InfoItem } from '@/src/ui/data';

const STATUS_TONE: Record<string, Tone> = {
  draft: 'neutral',
  issued: 'info',
  paid: 'success',
  cancelled: 'destructive',
};

const PAYMENT_TYPE: Record<string, string> = {
  cash: 'Peşin',
  leasing: 'Leasing',
  term: 'Vadeli',
};

export default function AccountingInvoiceDetailScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const query = useAccountingInvoice(id);
  const invoiceStatuses = useLookup('invoice-statuses');
  const paymentStatuses = useLookup('payment-statuses');
  const canUpdate = useCan('accounting_invoices.update');
  const canReadFiles = useCan('files.read');
  const cancel = useCancelAccountingInvoice(id);

  if (query.isPending || query.error || !query.data) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
        <DetailHeader title="Fatura" />
        {query.isPending ? <Loading /> : <ErrorState message={query.error?.message ?? 'Fatura yüklenemedi.'} onRetry={() => void query.refetch()} />}
      </SafeAreaView>
    );
  }

  const data = query.data;
  const status = invoiceStatuses.data?.find((item) => item.id === data.statusId);
  const tone = STATUS_TONE[status?.code ?? ''] ?? 'neutral';
  const currency = data.currency?.code;
  const money = (value: string | null | undefined) => currency
    ? formatAmount(value, currency)
    : value == null ? '—' : Number(value).toLocaleString('tr-TR', { maximumFractionDigits: 2 });

  const handleCancel = () => {
    Alert.alert(
      'Faturayı iptal et?',
      data.type === 'sales'
        ? 'Fatura iptal edilecek; teslim edilmemiş ilgili stok hareketleri güvenli biçimde geri alınacak.'
        : 'Fatura iptal durumuna alınacak.',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Faturayı iptal et',
          style: 'destructive',
          onPress: () => cancel.mutate(undefined, {
            onError: (error) => Alert.alert('Fatura iptal edilemedi', error.message),
          }),
        },
      ],
    );
  };

  const handleFile = async () => {
    if (!data.fileId) return;
    try {
      await downloadAndShareFile(data.fileId);
    } catch (error) {
      Alert.alert('Dosya açılamadı', error instanceof Error ? error.message : 'Dosya indirilemedi.');
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <DetailHeader title="Fatura Detayı" subtitle={data.invoiceNo} />
      <ScrollView contentContainerClassName="gap-4 px-4 pb-10 pt-4">
        <Card className="gap-2">
          <View className="flex-row items-start justify-between gap-3">
            <View className="flex-1 gap-1.5">
              <View className="flex-row flex-wrap gap-1.5">
                <Chip tone={data.type === 'sales' ? 'success' : 'info'} label={data.type === 'sales' ? 'Satış' : 'Alış'} />
                <Chip tone={tone} label={status?.name ?? (invoiceStatuses.isPending ? 'Durum yükleniyor' : 'Durum bilinmiyor')} />
              </View>
              <Text className="text-[20px] font-inter-semibold text-foreground">{data.invoiceNo}</Text>
              <Text className="font-inter text-[13px] text-muted-foreground">{data.company?.shortName ?? data.company?.legalTitle ?? 'Firma bağlanmadı'}</Text>
            </View>
            <Text className="font-inter-bold text-[19px] text-foreground">{money(data.grandTotal)}</Text>
          </View>
        </Card>

        <Card>
          <InfoRows
            items={[
              { label: 'Fatura tarihi', value: formatDate(data.invoiceDate) },
              { label: 'Kategori', value: data.invoiceCategory === 'administrative' ? 'İdari' : 'Ticari' },
              { label: 'Ödeme tipi', value: PAYMENT_TYPE[data.paymentType] ?? data.paymentType },
              { label: 'Vade', value: data.paymentTermDays === null ? null : `${data.paymentTermDays} gün` },
              { label: 'İlk vade', value: data.firstDueDate ? formatDate(data.firstDueDate) : null },
              { label: 'Son vade', value: data.lastDueDate ? formatDate(data.lastDueDate) : null },
              { label: 'Taksit sayısı', value: String(data.installmentCount) },
              { label: 'Sipariş no', value: data.orderNo },
              { label: 'Beklenen tarih', value: data.expectedDate ? formatDate(data.expectedDate) : null },
              { label: 'Incoterm', value: data.incoterm },
              { label: 'Sevkiyat referansı', value: data.shipmentReference },
            ] satisfies InfoItem[]}
          />
        </Card>

        <Card>
          <InfoRows
            items={[
              { label: 'Tutar', value: money(data.amount) },
              { label: 'KDV', value: money(data.vatAmount) },
              { label: 'Genel toplam', value: money(data.grandTotal) },
            ] satisfies InfoItem[]}
          />
        </Card>

        <View className="gap-1.5">
          <View className="px-1"><Eyebrow>Kalemler ({data.lineItems.length})</Eyebrow></View>
          {data.lineItems.length ? (
            <Card className="gap-0">
              {data.lineItems.map((line, index) => (
                <View key={line.id} className={`gap-1 py-3 ${index > 0 ? 'border-t border-border' : ''}`}>
                  <Text className="font-inter-medium text-[14px] text-foreground">{line.description ?? line.categoryCode ?? 'Fatura kalemi'}</Text>
                  <View className="flex-row justify-between gap-3">
                    <Text className="font-inter text-[12px] text-muted-foreground">
                      {Number(line.quantity).toLocaleString('tr-TR')} × {money(line.unitPrice)} · KDV %{Number(line.vatRate).toLocaleString('tr-TR')}
                    </Text>
                    <Text className="font-inter-semibold text-[13px] text-foreground">{money(line.lineTotal)}</Text>
                  </View>
                  {line.expectedDate ? <Text className="font-inter text-[11px] text-muted-foreground">Beklenen: {formatDate(line.expectedDate)}</Text> : null}
                </View>
              ))}
            </Card>
          ) : <Card><EmptyState title="Fatura kalemi yok" /></Card>}
        </View>

        <View className="gap-1.5">
          <View className="px-1"><Eyebrow>Taksitler ({data.installments.length})</Eyebrow></View>
          {data.installments.length ? (
            <Card className="gap-0">
              {data.installments.map((installment, index) => {
                const installmentStatus = paymentStatuses.data?.find((item) => item.id === installment.statusId);
                const installmentTone = STATUS_TONE[installmentStatus?.code ?? ''] ?? 'neutral';
                return (
                  <View key={installment.id} className={`flex-row items-center justify-between gap-3 py-3 ${index > 0 ? 'border-t border-border' : ''}`}>
                    <View className="flex-1 gap-1">
                      <Text className="font-inter-medium text-[14px] text-foreground">{installment.installmentNo}. taksit</Text>
                      <Text className="font-inter text-[12px] text-muted-foreground">{formatDate(installment.dueDate)}</Text>
                      {installmentStatus ? <Chip label={installmentStatus.name} tone={installmentTone} /> : null}
                    </View>
                    <Text className="font-inter-semibold text-[14px] text-foreground">{money(installment.amount)}</Text>
                  </View>
                );
              })}
            </Card>
          ) : <Card><EmptyState title="Taksit kaydı yok" /></Card>}
        </View>

        {data.termChangeReason ? (
          <Card className="gap-1.5"><Eyebrow>Vade değişikliği</Eyebrow><Text className="font-inter text-sm text-warning">{data.termChangeReason}</Text></Card>
        ) : null}
        {data.notes ? (
          <Card className="gap-1.5"><Eyebrow>Not</Eyebrow><Text className="font-inter text-sm text-foreground">{data.notes}</Text></Card>
        ) : null}

        {data.fileId && canReadFiles ? <Button label="Fatura Dosyasını Aç / Paylaş" onPress={() => void handleFile()} /> : null}
        {canUpdate && status && status.code !== 'cancelled' ? (
          <Button label="Faturayı İptal Et" variant="destructive" loading={cancel.isPending} onPress={handleCancel} />
        ) : null}
        {data.salesOrderId ? (
          <Button label="Satış Siparişi" variant="ghost" onPress={() => router.push(`/(tabs)/modules/sales-orders/${data.salesOrderId}` as Href)} />
        ) : null}
        {data.quoteId ? (
          <Button label="Teklif" variant="ghost" onPress={() => router.push(`/(tabs)/modules/quotes/${data.quoteId}` as Href)} />
        ) : null}
        <Button label="Firma Kartı" variant="ghost" onPress={() => router.push(`/(tabs)/modules/companies/${data.companyId}` as Href)} />

        <Text className="text-center font-inter text-[11px] text-muted-foreground">Son güncelleme: {formatDateTime(data.updatedAt)}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}
