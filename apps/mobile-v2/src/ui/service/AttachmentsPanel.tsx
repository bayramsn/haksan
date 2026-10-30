import { useState } from 'react';
import { ActionSheetIOS, Alert, Platform, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useServiceAttachments, useUploadServiceAttachment } from '@/src/api/service.hooks';
import { downloadAndShareFile, pickDocument, pickImage, type LocalUpload } from '@/src/native/files';
import { formatDateTime } from '@/src/lib/format';
import { useTheme } from '@/src/theme/theme';
import { Button, ErrorState, Loading } from '@/src/ui';
import { toast } from '@/src/ui/toast';

type Entity = 'service_ticket' | 'service_complaint_intake';

function sizeLabel(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Web ServiceCardAttachments / ServiceUploadButton karşılığı: liste, paylaş, yükle. */
export function AttachmentsPanel({ entityType, entityId, canUpload }: { entityType: Entity; entityId: string; canUpload: boolean }) {
  const { colors } = useTheme();
  const list = useServiceAttachments(entityType, entityId);
  const upload = useUploadServiceAttachment(entityType, entityId);
  const [openingId, setOpeningId] = useState<string | null>(null);

  const send = async (pick: () => Promise<LocalUpload | null>) => {
    try {
      const local = await pick();
      if (!local) return;
      await upload.mutateAsync(local);
      toast.success('Dosya yüklendi');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Dosya yüklenemedi.');
    }
  };

  const choose = () => {
    const options = ['Kamera', 'Fotoğraf arşivi', 'Dosya seç'];
    const run = (index: number) => {
      if (index === 0) void send(() => pickImage('camera'));
      if (index === 1) void send(() => pickImage('library'));
      if (index === 2) void send(pickDocument);
    };
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions({ options: [...options, 'Vazgeç'], cancelButtonIndex: 3 }, run);
      return;
    }
    Alert.alert('Dosya ekle', undefined, [
      ...options.map((text, index) => ({ text, onPress: () => run(index) })),
      { text: 'Vazgeç', style: 'cancel' as const },
    ]);
  };

  const open = async (fileId: string) => {
    setOpeningId(fileId);
    try {
      await downloadAndShareFile(fileId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Dosya açılamadı.');
    } finally {
      setOpeningId(null);
    }
  };

  return (
    <View className="gap-2">
      {list.isPending ? <Loading /> : null}
      {list.error ? <ErrorState message={list.error.message} onRetry={() => void list.refetch()} /> : null}
      {list.data && list.data.length === 0 ? <Text className="font-inter text-sm text-muted-foreground">Henüz dosya eklenmedi.</Text> : null}
      {(list.data ?? []).map((link) => (
        <Pressable
          key={link.id}
          accessibilityRole="button"
          accessibilityLabel={`${link.file.originalFilename} dosyasını aç`}
          disabled={openingId === link.file.id}
          onPress={() => void open(link.file.id)}
          className="min-h-[52px] flex-row items-center gap-3 border-b border-border py-2 active:opacity-60"
        >
          <Ionicons name={link.file.mimeType.startsWith('image/') ? 'image-outline' : 'document-outline'} size={20} color={colors.primary} />
          <View className="flex-1 gap-0.5">
            <Text className="font-inter-medium text-[14px] text-foreground" numberOfLines={1}>{link.file.originalFilename}</Text>
            <Text className="font-inter text-[11px] text-muted-foreground" numberOfLines={1}>
              {[link.documentType?.name, sizeLabel(link.file.sizeBytes), link.file.uploaderName, formatDateTime(link.file.createdAt)].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <Ionicons name={openingId === link.file.id ? 'hourglass-outline' : 'share-outline'} size={18} color={colors.mutedForeground} />
        </Pressable>
      ))}
      {canUpload ? (
        <Button label="Dosya ekle" variant="ghost" trailingIcon="cloud-upload-outline" loading={upload.isPending} disabled={upload.isPending} onPress={choose} />
      ) : null}
    </View>
  );
}
