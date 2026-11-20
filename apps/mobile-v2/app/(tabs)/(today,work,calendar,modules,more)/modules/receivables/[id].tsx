import { useLocalSearchParams } from 'expo-router';
import { useReceivable } from '@/src/api/finance.hooks';
import { FinanceRecordDetailScreen } from '@/src/features/finance-record-detail-screen';

export default function ReceivableDetailRoute() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const query = useReceivable(id);
  return <FinanceRecordDetailScreen kind="receivable" id={id} data={query.data} isPending={query.isPending} error={query.error} refetch={query.refetch} />;
}
