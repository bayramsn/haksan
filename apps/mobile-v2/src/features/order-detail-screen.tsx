import { Alert, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useCompany } from '@/src/api/companies.hooks';
import { useLookup } from '@/src/api/crm.hooks';
import { useOrderAction } from '@/src/api/inventory.hooks';
import type { PurchaseOrderDetail, SalesOrderDetail } from '@/src/api/endpoints';
import { useAuth, useCan } from '@/src/auth/AuthProvider';
import { formatAmount, formatDate, formatDateTime } from '@/src/lib/format';
import type { Tone } from '@/src/theme/theme';
import { Button, Card, Chip, DetailHeader, EmptyState, ErrorState, Eyebrow, Loading } from '@/src/ui';
import { InfoRows, type InfoItem } from '@/src/ui/data';

type CommonProps = {
  id: string;
  isPending: boolean;
  error: Error | null;
  refetch: () => unknown;
};

type Props =
  | (CommonProps & { kind: 'sales'; data: SalesOrderDetail | undefined })
  | (CommonProps & { kind: 'purchase'; data: PurchaseOrderDetail | undefined });

type OrderAction = 'approve' | 'reserve' | 'fulfilled' | 'cancelled' | 'send' | 'in_transit' | 'received';

const STATUS_TONE: Record<string, Tone> = {
  draft: 'neutral',
  pending_super_admin_approval: 'warning',
  pending_manager_approval: 'warning',
  confirmed: 'success',
  sent: 'info',
  approved: 'success',
  reserved: 'info',
  in_transit: 'info',
  fulfilled: 'success',
  received: 'success',
  cancelled: 'destructive',
};

const PURCHASE_TYPE: Record<string, string> = {
  commercial: 'Ticari',
  administrative: 'İdari',
};

const PAYMENT_TYPE: Record<string, string> = {
  cash: 'Peşin',
  term: 'Vadeli',
  letter_of_credit: 'Akreditif',
  credit_card: 'Kredi kartı',
};

function money(value: string, currencyCode: string | undefined): string {
  if (currencyCode) return formatAmount(value, currencyCode);
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(parsed)
    : '—';
}

export function OrderDetailScreen(props: Props) {
  const router = useRouter();
  const { user } = useAuth();
  const companyId = props.kind === 'sales' ? props.data?.companyId : props.data?.supplierCompanyId;
  const company = useCompany(companyId ?? '');
  const statusLookup = useLookup(props.kind === 'sales' ? 'sales-order-statuses' : 'purchase-order-statuses');
  const currencyLookup = useLookup('currencies');
  const canUpdate = useCan(props.kind === 'sales' ? 'sales_orders.update' : 'purchase_orders.update');
  const canApprove = useCan(props.kind === 'sales' ? 'sales_orders.approve' : 'purchase_orders.approve');
  const action = useOrderAction(props.kind, props.id);

  if (props.isPending || props.error || !props.data) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
        <DetailHeader title={props.kind === 'sales' ? 'Satış Siparişi' : 'Satın Alma Siparişi'} />
        {props.isPending ? (
          <Loading />
        ) : (
          <ErrorState message={props.error?.message ?? 'Sipariş yüklenemedi.'} onRetry={() => void props.refetch()} />
        )}
      </SafeAreaView>
    );
  }

  const order = props.data;
  const status = statusLookup.data?.find((item) => item.id === order.statusId);
  const currency = currencyLookup.data?.find((item) => item.id === order.currencyId);
  const statusCode = status?.code;
  const hasResolvedStatus = Boolean(statusCode);
  const tone = STATUS_TONE[statusCode ?? ''] ?? 'neutral';
  const isTerminal = statusCode === 'fulfilled' || statusCode === 'received' || statusCode === 'cancelled';
  const isSuperAdmin = user?.roles?.includes('super_admin') ?? false;

  const run = (next: OrderAction, label: string, destructive = false) => {
    const execute = () =>
      action.mutate(next, {
        onError: (error) => Alert.alert('İşlem tamamlanamadı', error.message),
      });
    if (!destructive) return execute();
    Alert.alert(
      `${label}?`,
      'Bu işlem sipariş akışını sonlandırır. Devam etmek istiyor musunuz?',
      [
        { text: 'Vazgeç', style: 'cancel' },
        { text: label, style: 'destructive', onPress: execute },
      ],
    );
  };

  // `order` ortak alanlar için union'a genişler; varyanta özgü alanlar props'un
  // discriminator'ı üzerinden alınarak TypeScript ve runtime aynı kalır.
  const sales = props.kind === 'sales' ? props.data : null;
  const purchase = props.kind === 'purchase' ? props.data : null;
  const hasAction = hasResolvedStatus && (props.kind === 'sales'
    ? (canApprove && ['draft', 'pending_super_admin_approval'].includes(statusCode ?? ''))
      || (canUpdate && ['confirmed', 'reserved'].includes(statusCode ?? ''))
      || (canUpdate && !isTerminal)
    : (canUpdate && ['draft', 'approved', 'in_transit'].includes(statusCode ?? ''))
      || (canApprove && isSuperAdmin && statusCode === 'pending_manager_approval')
      || (canUpdate && !isTerminal));

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <DetailHeader
        title={props.kind === 'sales' ? 'Satış Siparişi Detayı' : 'Satın Alma Siparişi Detayı'}
        subtitle={order.orderNo}
      />

      <ScrollView contentContainerClassName="gap-4 px-4 pb-10 pt-4">
        <Card className="gap-2">
          <Chip tone={tone} label={status?.name ?? (statusLookup.isPending ? 'Durum yükleniyor' : 'Durum bilinmiyor')} />
          <Text className="text-[20px] font-inter-semibold text-foreground">{order.orderNo}</Text>
          <Text className="font-inter text-[13px] text-muted-foreground">
            {company.data?.shortName ?? company.data?.legalTitle ?? (company.isPending ? 'Firma yükleniyor…' : 'Firma bağlanmadı')}
          </Text>
          <View className="flex-row items-end justify-between gap-3 pt-1">
            <Text className="font-inter text-[12px] text-muted-foreground">{formatDate(order.orderDate)}</Text>
            <Text className="font-inter-bold text-[18px] text-foreground">
              {money(order.grandTotal, currency?.code)}
            </Text>
          </View>
        </Card>

        <Card>
          <InfoRows
            items={[
              { label: 'Ara toplam', value: money(order.subtotal, currency?.code) },
              { label: 'İndirim', value: money(order.discountTotal, currency?.code) },
              { label: 'KDV', value: money(order.vatAmount, currency?.code) },
              { label: 'Genel toplam', value: money(order.grandTotal, currency?.code) },
            ] satisfies InfoItem[]}
          />
        </Card>

        {sales ? (
          <Card>
            <InfoRows
              items={[
                { label: 'Onay', value: sales.confirmedAt ? formatDateTime(sales.confirmedAt) : null },
                { label: 'Rezervasyon', value: sales.reservedAt ? formatDateTime(sales.reservedAt) : null },
                { label: 'Tamamlanma', value: sales.fulfilledAt ? formatDateTime(sales.fulfilledAt) : null },
                { label: 'İptal', value: sales.cancelledAt ? formatDateTime(sales.cancelledAt) : null, tone: 'destructive' },
              ] satisfies InfoItem[]}
            />
          </Card>
        ) : null}

        {purchase ? (
          <Card>
            <InfoRows
              items={[
                { label: 'Satın alma türü', value: PURCHASE_TYPE[purchase.purchaseType] ?? purchase.purchaseType },
                { label: 'Ödeme', value: PAYMENT_TYPE[purchase.paymentType] ?? purchase.paymentType },
                { label: 'Vade', value: purchase.paymentTermDays === null ? null : `${purchase.paymentTermDays} gün` },
                { label: 'Fatura no', value: purchase.invoiceNo },
                { label: 'Beklenen tarih', value: purchase.expectedDate ? formatDate(purchase.expectedDate) : null },
                { label: 'Incoterm', value: purchase.incoterm },
                { label: 'Sevkiyat referansı', value: purchase.shipmentReference },
                { label: 'Gönderim', value: purchase.sentAt ? formatDateTime(purchase.sentAt) : null },
                { label: 'Onay', value: purchase.approvedAt ? formatDateTime(purchase.approvedAt) : null },
                { label: 'Teslim', value: purchase.closedAt ? formatDateTime(purchase.closedAt) : null },
              ] satisfies InfoItem[]}
            />
          </Card>
        ) : null}

        <View className="gap-1.5">
          <View className="px-1"><Eyebrow>Kalemler ({order.items.length})</Eyebrow></View>
          {order.items.length ? (
            <Card className="gap-0">
              {order.items.map((item, index) => (
                <View key={item.id} className={`gap-1 py-3 ${index > 0 ? 'border-t border-border' : ''}`}>
                  <Text className="font-inter-medium text-[14px] text-foreground">{item.description}</Text>
                  <View className="flex-row justify-between gap-3">
                    <Text className="font-inter text-[12px] text-muted-foreground">
                      {Number(item.quantity).toLocaleString('tr-TR')} × {money(item.unitPrice, currency?.code)} · KDV %{Number(item.vatRate).toLocaleString('tr-TR')}
                    </Text>
                    <Text className="font-inter-semibold text-[13px] text-foreground">
                      {money(item.lineTotal, currency?.code)}
                    </Text>
                  </View>
                  {item.expectedDate ? (
                    <Text className="font-inter text-[11px] text-muted-foreground">Beklenen: {formatDate(item.expectedDate)}</Text>
                  ) : null}
                </View>
              ))}
            </Card>
          ) : (
            <Card><EmptyState title="Sipariş kalemi yok" /></Card>
          )}
        </View>

        {purchase?.approvalReason ? (
          <Card className="gap-1.5">
            <Eyebrow>Onay gerekçesi</Eyebrow>
            <Text className="font-inter text-sm text-warning">{purchase.approvalReason}</Text>
          </Card>
        ) : null}

        {order.notes ? (
          <Card className="gap-1.5">
            <Eyebrow>Not</Eyebrow>
            <Text className="font-inter text-sm text-foreground">{order.notes}</Text>
          </Card>
        ) : null}

        {hasAction ? (
          <View className="gap-2">
            <Eyebrow>İşlemler</Eyebrow>
            {sales && canApprove && ['draft', 'pending_super_admin_approval'].includes(statusCode ?? '') ? (
              <Button label="Siparişi Onayla" loading={action.isPending} onPress={() => run('approve', 'Onayla')} />
            ) : null}
            {sales && canUpdate && statusCode === 'confirmed' ? (
              <Button label="Stoku Rezerve Et" loading={action.isPending} onPress={() => run('reserve', 'Rezerve et')} />
            ) : null}
            {sales && canUpdate && statusCode === 'reserved' ? (
              <Button label="Tamamlandı İşaretle" loading={action.isPending} onPress={() => run('fulfilled', 'Tamamla')} />
            ) : null}
            {purchase && canUpdate && statusCode === 'draft' ? (
              <Button label="Tedarikçiye Gönder" loading={action.isPending} onPress={() => run('send', 'Gönder')} />
            ) : null}
            {purchase && canApprove && isSuperAdmin && statusCode === 'pending_manager_approval' ? (
              <Button label="Siparişi Onayla" loading={action.isPending} onPress={() => run('approve', 'Onayla')} />
            ) : null}
            {purchase && canUpdate && statusCode === 'approved' ? (
              <Button label="Yola Çıktı İşaretle" loading={action.isPending} onPress={() => run('in_transit', 'Yola çıkar')} />
            ) : null}
            {purchase && canUpdate && ['approved', 'in_transit'].includes(statusCode ?? '') ? (
              <Button label="Teslim Alındı İşaretle" variant="ghost" loading={action.isPending} onPress={() => run('received', 'Teslim al')} />
            ) : null}
            {canUpdate && hasResolvedStatus && !isTerminal ? (
              <Button label="Siparişi İptal Et" variant="destructive" loading={action.isPending} onPress={() => run('cancelled', 'Siparişi iptal et', true)} />
            ) : null}
          </View>
        ) : null}

        {companyId ? (
          <Button label="Firma Kartı" variant="ghost" onPress={() => router.push(`/(tabs)/modules/companies/${companyId}`)} />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
