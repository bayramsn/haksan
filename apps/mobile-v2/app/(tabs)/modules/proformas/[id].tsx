import { Redirect, useLocalSearchParams } from 'expo-router';
import { CommercialDocumentDetail } from '@/src/ui/documents/CommercialDocumentDetail';

export default function ProformaDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  if (!id) return <Redirect href="/(tabs)/modules/proformas" />;
  return <CommercialDocumentDetail kind="proforma" id={id} />;
}
