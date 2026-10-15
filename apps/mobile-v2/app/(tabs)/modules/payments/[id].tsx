import { useLocalSearchParams } from 'expo-router';
import { usePayment } from '@/src/api/finance.hooks';
import { FinanceRecordDetailScreen } from '@/src/features/finance-record-detail-screen';

export default function PaymentDetailRoute() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const query = usePayment(id);
  return <FinanceRecordDetailScreen kind="payment" id={id} data={query.data} isPending={query.isPending} error={query.error} refetch={query.refetch} />;
}
