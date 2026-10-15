import { Redirect, useLocalSearchParams } from 'expo-router';
import { CommercialDocumentDetail } from '@/src/ui/documents/CommercialDocumentDetail';

export default function ContractDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  if (!id) return <Redirect href="/(tabs)/modules/contracts" />;
  return <CommercialDocumentDetail kind="contract" id={id} />;
}
