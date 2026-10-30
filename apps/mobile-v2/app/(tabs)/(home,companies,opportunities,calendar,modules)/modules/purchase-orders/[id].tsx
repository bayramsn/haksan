import { useLocalSearchParams } from 'expo-router';
import { usePurchaseOrder } from '@/src/api/inventory.hooks';
import { OrderDetailScreen } from '@/src/features/order-detail-screen';

export default function PurchaseOrderDetailRoute() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const query = usePurchaseOrder(id);
  return (
    <OrderDetailScreen
      kind="purchase"
      id={id}
      data={query.data}
      isPending={query.isPending}
      error={query.error}
      refetch={query.refetch}
    />
  );
}
