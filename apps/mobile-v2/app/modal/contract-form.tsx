import { useLocalSearchParams } from 'expo-router';
import { LinkedDocumentForm } from '@/src/ui/documents/LinkedDocumentForm';

/** `?quoteId=` → tekliften yeni sözleşme; `?id=` → teklife bağlı sözleşmeyi düzenle. */
export default function ContractFormScreen() {
  const params = useLocalSearchParams<{ quoteId?: string; id?: string }>();
  return (
    <LinkedDocumentForm
      kind="contract"
      quoteId={typeof params.quoteId === 'string' ? params.quoteId : undefined}
      documentId={typeof params.id === 'string' ? params.id : undefined}
    />
  );
}
