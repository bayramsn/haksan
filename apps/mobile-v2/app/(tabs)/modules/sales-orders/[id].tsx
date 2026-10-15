import { Alert, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useLookup } from '@/src/api/crm.hooks';
import { useSalesOrder } from '@/src/api/inventory.hooks';
import { useDeleteSalesOrder } from '@/src/api/sales-orders.hooks';
import { useCan } from '@/src/auth/AuthProvider';
import { OrderDetailScreen } from '@/src/features/order-detail-screen';
import { Button } from '@/src/ui';
import { toast } from '@/src/ui/toast';

const TERMINAL = new Set(['fulfilled', 'cancelled']);

export default function SalesOrderDetailRoute() {
  const router = useRouter();
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const query = useSalesOrder(id);
  const statuses = useLookup('sales-order-statuses');
  const canUpdate = useCan('sales_orders.update');
  const canDelete = useCan('sales_orders.delete');
  const canInvoice = useCan('accounting_invoices.create');
  const remove = useDeleteSalesOrder();

  const order = query.data;
  const statusCode = statuses.data?.find((item) => item.id === order?.statusId)?.code;
  const editable = canUpdate && !TERMINAL.has(statusCode ?? '');

  function confirmDelete() {
    if (!order) return;
    Alert.alert('Satış siparişi silinsin mi?', `${order.orderNo} siparişi ve kalemleri silinir. Bu işlem geri alınamaz.`, [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: () =>
          remove.mutate(id, {
            onSuccess: () => {
              toast.success('Satış siparişi silindi');
              router.back();
            },
            onError: (error) => toast.error(`Satış siparişi silinemedi: ${error.message}`),
          }),
      },
    ]);
  }

  const showBar = Boolean(order) && (editable || canInvoice || canDelete);

  return (
    <View className="flex-1 bg-canvas">
      <View className="flex-1">
        <OrderDetailScreen
          kind="sales"
          id={id}
          data={order}
          isPending={query.isPending}
          error={query.error}
          refetch={query.refetch}
        />
      </View>
      {showBar ? (
        <SafeAreaView edges={['bottom', 'left', 'right']} className="border-t border-border bg-card">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 px-4 py-2">
            {editable ? (
              <Button label="Düzenle" variant="ghost" trailingIcon="create-outline" onPress={() => router.push(`/modal/sales-order-form?id=${id}`)} />
            ) : null}
            {editable ? (
              <Button label="Kalem Ekle" variant="ghost" trailingIcon="add-circle-outline" onPress={() => router.push(`/modal/sales-order-item?id=${id}`)} />
            ) : null}
            {canInvoice ? (
              <Button
                label="Muhasebe Faturası"
                variant="ghost"
                trailingIcon="receipt-outline"
                onPress={() => router.push(`/modal/sales-order-accounting-invoice?orderId=${id}`)}
              />
            ) : null}
            {canDelete ? (
              <Button label="Sil" variant="destructive" trailingIcon="trash-outline" loading={remove.isPending} onPress={confirmDelete} />
            ) : null}
          </ScrollView>
        </SafeAreaView>
      ) : null}
    </View>
  );
}
