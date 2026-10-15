import { Alert, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, type Href } from 'expo-router';
import type { Payment, Receivable2 } from '@/src/api/endpoints';
import { useFinanceStatusAction } from '@/src/api/finance.hooks';
import { useCan } from '@/src/auth/AuthProvider';
import { dueLabel, formatAmount, formatDate, formatDateTime } from '@/src/lib/format';
import type { Tone } from '@/src/theme/theme';
import { Button, Card, Chip, DetailHeader, ErrorState, Eyebrow, Loading } from '@/src/ui';
import { InfoRows, type InfoItem } from '@/src/ui/data';

type CommonProps = { id: string; isPending: boolean; error: Error | null; refetch: () => unknown };
type Props =
  | (CommonProps & { kind: 'receivable'; data: Receivable2 | undefined })
  | (CommonProps & { kind: 'payment'; data: Payment | undefined });

const STATUS_TONE: Record<string, Tone> = {
  pending: 'warning',
  partial: 'info',
  paid: 'success',
  overdue: 'destructive',
  cancelled: 'destructive',
};

const METHOD_LABEL: Record<string, string> = {
  bank_transfer: 'Havale / EFT',
  cash: 'Nakit',
  credit_card: 'Kredi kartı',
  cheque: 'Çek',
  check: 'Çek',
  promissory_note: 'Senet',
  leasing: 'Leasing',
  other: 'Diğer',
};

export function FinanceRecordDetailScreen(props: Props) {
  const router = useRouter();
  const canUpdate = useCan(props.kind === 'receivable' ? 'receivables.update' : 'payments.update');
  const action = useFinanceStatusAction(props.kind, props.id);

  if (props.isPending || props.error || !props.data) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
        <DetailHeader title={props.kind === 'receivable' ? 'Tahsilat' : 'Ödeme'} />
        {props.isPending ? <Loading /> : <ErrorState message={props.error?.message ?? 'Kayıt yüklenemedi.'} onRetry={() => void props.refetch()} />}
      </SafeAreaView>
    );
  }

  const row = props.data;
  const code = row.status?.code ?? '';
  const tone = STATUS_TONE[code] ?? 'neutral';
  const companyName = row.company?.shortName ?? row.company?.legalTitle ?? 'Firma';
  const currency = row.currency?.code;
  const amount = currency
    ? formatAmount(row.amount, currency)
    : Number(row.amount).toLocaleString('tr-TR', { maximumFractionDigits: 2 });
  const receivable = props.kind === 'receivable' ? props.data : null;
  const payment = props.kind === 'payment' ? props.data : null;
  const invoiceId = row.accountingInvoiceId;

  const changeStatus = (status: 'pending' | 'partial' | 'paid' | 'overdue' | 'cancelled') => {
    const label = status === 'paid' ? 'Ödendi' : status === 'partial' ? 'Kısmi ödendi' : status === 'overdue' ? 'Vadesi geçti' : status === 'cancelled' ? 'İptal' : 'Beklemede';
    const execute = () => action.mutate(status, {
      onError: (error) => Alert.alert('Durum güncellenemedi', error.message),
    });
    if (status !== 'cancelled') return execute();
    Alert.alert('Kaydı iptal et?', 'Finans kaydının durumu iptal olarak değiştirilecek.', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: label, style: 'destructive', onPress: execute },
    ]);
  };

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <DetailHeader
        title={props.kind === 'receivable' ? 'Tahsilat Detayı' : 'Ödeme Detayı'}
        subtitle={row.invoiceNo ?? undefined}
      />
      <ScrollView contentContainerClassName="gap-4 px-4 pb-10 pt-4">
        <Card className="gap-2">
          <Chip tone={tone} label={row.status?.name ?? 'Durum belirtilmedi'} />
          <Text className="text-[19px] font-inter-semibold text-foreground">{companyName}</Text>
          <View className="flex-row items-end justify-between gap-3">
            <Text className="font-inter text-[12px] text-muted-foreground">
              {receivable ? `Vade: ${formatDate(receivable.dueDate)}` : formatDate(payment?.paymentDate)}
            </Text>
            <Text className={`font-inter-bold text-[20px] ${payment?.direction === 'out' ? 'text-destructive' : 'text-foreground'}`}>
              {payment ? `${payment.direction === 'in' ? '+' : '−'} ` : ''}{amount}
            </Text>
          </View>
        </Card>

        <Card>
          <InfoRows
            items={[
              { label: 'Firma', value: companyName },
              { label: 'Fatura no', value: row.invoiceNo },
              { label: 'Ödeme aracı', value: row.paymentMethod ? (METHOD_LABEL[row.paymentMethod] ?? row.paymentMethod) : null },
              { label: 'Yön', value: payment ? (payment.direction === 'in' ? 'Gelen tahsilat' : 'Giden ödeme') : null },
              { label: 'Hareket türü', value: receivable?.movementType },
              { label: 'Belge referansı', value: receivable?.documentRef },
              { label: 'Vade', value: receivable ? formatDateTime(receivable.dueDate) : null },
              { label: 'Ödeme tarihi', value: payment ? formatDateTime(payment.paymentDate) : null },
              { label: 'Oluşturulma', value: row.createdAt ? formatDateTime(row.createdAt) : null },
            ] satisfies InfoItem[]}
          />
        </Card>

        {receivable && code !== 'paid' && code !== 'cancelled' ? (() => {
          const due = dueLabel(receivable.dueDate);
          return due ? <Chip label={due.text} tone={due.overdue ? 'destructive' : 'warning'} /> : null;
        })() : null}

        {row.notes ? (
          <Card className="gap-1.5"><Eyebrow>Not</Eyebrow><Text className="font-inter text-sm text-foreground">{row.notes}</Text></Card>
        ) : null}

        {canUpdate ? (
          <View className="gap-2">
            <Eyebrow>Durum</Eyebrow>
            {code !== 'paid' ? <Button label="Ödendi İşaretle" loading={action.isPending} onPress={() => changeStatus('paid')} /> : null}
            {receivable && code !== 'partial' && !['paid', 'cancelled'].includes(code) ? (
              <Button label="Kısmi Ödendi" variant="ghost" loading={action.isPending} onPress={() => changeStatus('partial')} />
            ) : null}
            {receivable && code !== 'overdue' && !['paid', 'cancelled'].includes(code) ? (
              <Button label="Vadesi Geçti" variant="ghost" loading={action.isPending} onPress={() => changeStatus('overdue')} />
            ) : null}
            {code !== 'cancelled' ? (
              <Button label="Kaydı İptal Et" variant="destructive" loading={action.isPending} onPress={() => changeStatus('cancelled')} />
            ) : null}
          </View>
        ) : null}

        {invoiceId ? (
          <Button label="Bağlı Fatura" variant="ghost" onPress={() => router.push(`/(tabs)/modules/invoices/${invoiceId}` as Href)} />
        ) : null}
        <Button label="Firma Kartı" variant="ghost" onPress={() => router.push(`/(tabs)/modules/companies/${row.companyId}` as Href)} />
      </ScrollView>
    </SafeAreaView>
  );
}
