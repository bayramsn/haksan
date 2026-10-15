import { useLocalSearchParams } from 'expo-router';
import { QuickDocumentForm } from '@/src/ui/documents/QuickDocumentForm';

/** Teklifsiz hızlı sözleşme; `?id=` ile mevcut hızlı sözleşmeyi düzenler. */
export default function ContractQuickScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <QuickDocumentForm kind="contract" documentId={typeof id === 'string' ? id : undefined} />;
}
