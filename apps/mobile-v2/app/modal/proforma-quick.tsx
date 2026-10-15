import { useLocalSearchParams } from 'expo-router';
import { QuickDocumentForm } from '@/src/ui/documents/QuickDocumentForm';

/** Teklifsiz hızlı proforma; `?id=` ile mevcut hızlı proformayı düzenler. */
export default function ProformaQuickScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <QuickDocumentForm kind="proforma" documentId={typeof id === 'string' ? id : undefined} />;
}
