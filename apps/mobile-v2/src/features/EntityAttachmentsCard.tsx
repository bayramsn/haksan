import { useState } from 'react';
import { Alert, Text } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { FileLinkEntityType } from '@haksan/shared';
import { files } from '@/src/api/endpoints';
import { useCan } from '@/src/auth/AuthProvider';
import { formatDate } from '@/src/lib/format';
import { downloadAndShareFile, pickDocument, uploadEntityAttachment } from '@/src/native/files';
import { Button, Card, Eyebrow, ListRow, Loading } from '@/src/ui';
import { toast } from '@/src/ui/toast';

const EXTERNAL_QUOTE_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

/** Kayda bağlı belgeler (web'deki "Dosyalar" bölümü): listele, aç/paylaş, dış teklif yükle. */
export function EntityAttachmentsCard({ entityType, entityId }: { entityType: Extract<FileLinkEntityType, 'company' | 'opportunity'>; entityId: string }) {
  const canRead = useCan('files.read');
  const canUpload = useCan('files.create');
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const queryKey = ['files', 'links', entityType, entityId];
  const list = useQuery({ queryKey, queryFn: () => files.links(entityType, entityId), enabled: canRead && !!entityId });

  if (!canRead) return null;

  async function upload() {
    try {
      const local = await pickDocument(EXTERNAL_QUOTE_TYPES);
      if (!local) return;
      setBusy(true);
      // Sunucu bu iki kayıt türünde yalnızca "dış teklif" (PDF/DOCX/XLSX, 25 MB) kabul ediyor.
      await uploadEntityAttachment({ bucket: 'erp-quote-documents', entityType, entityId, documentTypeCode: 'external_quote', local });
      await qc.invalidateQueries({ queryKey });
      toast.success('Belge yüklendi');
    } catch (cause) {
      Alert.alert('Yüklenemedi', cause instanceof Error ? cause.message : 'Belge yüklenemedi.');
    } finally {
      setBusy(false);
    }
  }

  async function open(fileId: string) {
    try {
      await downloadAndShareFile(fileId);
    } catch (cause) {
      Alert.alert('Dosya açılamadı', cause instanceof Error ? cause.message : 'Bilinmeyen hata.');
    }
  }

  const rows = list.data?.data ?? [];
  return (
    <Card className="gap-1.5">
      <Eyebrow>Ekler ({list.data?.meta.total ?? rows.length})</Eyebrow>
      {list.isPending ? (
        <Loading />
      ) : list.isError ? (
        <Text className="font-inter text-sm text-destructive">Ekler yüklenemedi.</Text>
      ) : rows.length === 0 ? (
        <Text className="font-inter text-sm text-muted-foreground">Bağlı belge yok.</Text>
      ) : (
        rows.map((row) => (
          <ListRow
            key={row.id}
            title={row.file.originalFilename}
            lines={[row.documentType?.name, [row.file.uploaderName, formatDate(row.file.createdAt)].filter(Boolean).join(' · ')]}
            icon="attach-outline"
            onPress={() => void open(row.file.id)}
          />
        ))
      )}
      {canUpload ? <Button label="Belge yükle" variant="ghost" loading={busy} disabled={busy} onPress={() => void upload()} /> : null}
    </Card>
  );
}
