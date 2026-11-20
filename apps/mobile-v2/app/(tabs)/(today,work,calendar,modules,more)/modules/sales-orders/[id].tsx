import { useLocalSearchParams } from 'expo-router';
import { useSalesOrder } from '@/src/api/inventory.hooks';
import { OrderDetailScreen } from '@/src/features/order-detail-screen';

export default function SalesOrderDetailRoute() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const query = useSalesOrder(id);
  return (
    <OrderDetailScreen
      kind="sales"
      id={id}
      data={query.data}
      isPending={query.isPending}
      error={query.error}
      refetch={query.refetch}
    />
  );
}
