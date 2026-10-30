import { useLocalSearchParams } from 'expo-router';
import { LinkedDocumentForm } from '@/src/ui/documents/LinkedDocumentForm';

/** `?quoteId=` → tekliften yeni proforma; `?id=` → teklife bağlı proformayı düzenle. */
export default function ProformaFormScreen() {
  const params = useLocalSearchParams<{ quoteId?: string; id?: string }>();
  return (
    <LinkedDocumentForm
      kind="proforma"
      quoteId={typeof params.quoteId === 'string' ? params.quoteId : undefined}
      documentId={typeof params.id === 'string' ? params.id : undefined}
    />
  );
}
