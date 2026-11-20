import { useState } from 'react';
import { Text } from 'react-native';
import { Button, Card } from '@/src/ui';
import { getPdfAndShare } from '@/src/native/files';
import { canSharePreparedPdf } from './policy';
import { commercialApi, paths, usePdfStatus, type DraftKind } from './api';

/** Mobile only consumes the current web artifact. The GET endpoint rechecks its revision. */
export function PreparedPdf({ kind, id, filename }: { kind: DraftKind; id: string; filename: string }) {
  const query = usePdfStatus(kind, id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function open() {
    setBusy(true); setError('');
    try {
      const latest = await commercialApi.pdfStatus(kind, id);
      if (!canSharePreparedPdf(latest.status)) {
        await query.refetch();
        throw new Error(latest.status === 'outdated' ? 'Belge değişti. PDF’yi webde yeniden hazırlayın.' : 'PDF henüz hazır değil. Webde hazırlayın.');
      }
      await getPdfAndShare(`/api/v1/${paths[kind]}/${id}/pdf`, `${filename}.pdf`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'PDF alınamadı.'); }
    finally { setBusy(false); }
  }
  return <Card className="gap-3">
    <Text className="font-inter-semibold text-base text-foreground">Belge PDF’i</Text>
    <Text className="font-inter text-sm text-muted-foreground">
      {query.isPending ? 'PDF durumu kontrol ediliyor…' : query.error ? 'PDF durumu alınamadı.' : query.data?.status === 'ready' ? 'Webde hazırlanmış güncel belge açılmaya ve paylaşılmaya hazır.' : query.data?.status === 'outdated' ? 'Belge değişti; PDF güncel değil. Webde yeniden hazırlayın.' : 'PDF henüz hazırlanmadı. Webde hazırladıktan sonra burada açabilirsiniz.'}
    </Text>
    {query.data?.generatedAt ? <Text className="font-inter text-xs text-muted-foreground">Hazırlanma: {new Date(query.data.generatedAt).toLocaleString('tr-TR')}</Text> : null}
    {error ? <Text accessibilityRole="alert" className="font-inter text-sm text-destructive">{error}</Text> : null}
    <Button label="PDF Aç / Kaydet / Paylaş" onPress={() => void open()} loading={busy} disabled={!canSharePreparedPdf(query.data?.status) || busy} />
    <Button label="Durumu Yenile" variant="ghost" loading={query.isFetching} onPress={() => void query.refetch()} />
  </Card>;
}
