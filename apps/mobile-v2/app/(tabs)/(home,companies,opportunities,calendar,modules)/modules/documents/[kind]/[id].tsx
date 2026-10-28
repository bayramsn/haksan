import { Redirect, useLocalSearchParams } from 'expo-router';
import type { DocumentKind } from '@/src/api/documents.hooks';
import { CommercialDocumentDetail } from '@/src/ui/documents/CommercialDocumentDetail';

const KINDS: readonly DocumentKind[] = ['proforma', 'contract', 'invoice'];

export default function CommercialDocumentDetailScreen() {
  const params = useLocalSearchParams<{ kind: string; id: string }>();
  const kind = KINDS.find((item) => item === params.kind);
  if (!kind || !params.id) return <Redirect href="/modules/documents" />;
  return <CommercialDocumentDetail kind={kind} id={params.id} />;
}
