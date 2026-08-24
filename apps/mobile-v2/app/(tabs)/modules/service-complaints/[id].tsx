import { useRef, useState } from 'react';
import { Alert, Linking, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { BottomSheetBackdrop, BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import {
  useConvertServiceComplaint,
  useRejectServiceComplaint,
  useServiceComplaint,
  useUpdateServiceComplaint,
} from '@/src/api/operations.hooks';
import { useCan } from '@/src/auth/AuthProvider';
import { formatDate, formatDateTime } from '@/src/lib/format';
import { downloadAndShareFile } from '@/src/native/files';
import { useTheme, type Tone } from '@/src/theme/theme';
import { Button, Card, Chip, DetailHeader, EmptyState, ErrorState, Eyebrow, Field, Loading } from '@/src/ui';
import { InfoRows, type InfoItem } from '@/src/ui/data';

const STATUS: Record<string, { label: string; tone: Tone }> = {
  new: { label: 'Yeni', tone: 'destructive' },
  reviewing: { label: 'İnceleme', tone: 'warning' },
  converted: { label: 'Servise çevrildi', tone: 'success' },
  rejected: { label: 'Reddedildi', tone: 'neutral' },
};

const WARRANTY: Record<string, { label: string; tone: Tone }> = {
  in_warranty: { label: 'Garantide görünüyor', tone: 'success' },
  out_of_warranty: { label: 'Garanti dışında görünüyor', tone: 'warning' },
  unknown: { label: 'Garanti bilgisi belirsiz', tone: 'neutral' },
};

function fileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} MB`;
}

function safePhone(value: string | null): string | null {
  if (!value) return null;
  const cleaned = value.replace(/[^+0-9,;#*]/g, '');
  return cleaned ? `tel:${cleaned}` : null;
}

export default function ServiceComplaintDetailScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const query = useServiceComplaint(id);
  const update = useUpdateServiceComplaint();
  const convert = useConvertServiceComplaint();
  const reject = useRejectServiceComplaint();
  const canUpdate = useCan('service_tickets.update');
  const canCreateTicket = useCan('service_tickets.create');
  const canReadFiles = useCan('files.read');
  const [rejectionNote, setRejectionNote] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const rejectionSheet = useRef<BottomSheetModal>(null);

  if (query.isPending || query.error || !query.data) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
        <DetailHeader title="Şikayet" />
        {query.isPending ? <Loading /> : <ErrorState message={query.error?.message ?? 'Şikayet yüklenemedi.'} onRetry={() => void query.refetch()} />}
      </SafeAreaView>
    );
  }

  const data = query.data;
  const status = STATUS[data.status] ?? { label: data.status, tone: 'neutral' as Tone };
  const warranty = WARRANTY[data.warrantyStatusSuggestion] ?? WARRANTY.unknown!;
  const phoneUrl = safePhone(data.contactPhone);

  const markReviewing = () => {
    setActionError(null);
    update.mutate({ id, patch: { status: 'reviewing' } }, {
      onError: (error) => setActionError(error.message),
    });
  };

  const confirmConvert = () => {
    Alert.alert('Servis talebine çevir?', 'Şikayet bilgileri ve ekleri yeni servis talebine kopyalanacak.', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Servis Talebi Oluştur',
        onPress: () => convert.mutate(id, {
          onSuccess: (updated) => {
            if (updated.serviceTicket) router.replace(`/(tabs)/modules/service-tickets/${updated.serviceTicket.id}` as Href);
          },
          onError: (error) => setActionError(error.message),
        }),
      },
    ]);
  };

  const submitRejection = () => {
    setActionError(null);
    reject.mutate({ id, body: { rejectionNote: rejectionNote.trim() || null } }, {
      onSuccess: () => rejectionSheet.current?.dismiss(),
      onError: (error) => setActionError(error.message),
    });
  };

  const openFile = async (fileId: string) => {
    try {
      await downloadAndShareFile(fileId);
    } catch (error) {
      Alert.alert('Dosya açılamadı', error instanceof Error ? error.message : 'Dosya indirilemedi.');
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <DetailHeader title="Şikayet Detayı" subtitle={data.complaintNo} />
      <ScrollView contentContainerClassName="gap-4 px-4 pb-10 pt-4">
        <Card className="gap-2">
          <View className="flex-row flex-wrap gap-2">
            <Chip label={status.label} tone={status.tone} />
            <Chip label={data.severity.toLocaleUpperCase('tr-TR')} tone={data.severity === 'critical' ? 'destructive' : data.severity === 'high' ? 'warning' : 'neutral'} />
          </View>
          <Text className="font-inter-semibold text-[20px] text-foreground">{data.subject}</Text>
          <Text className="font-inter text-[13px] text-muted-foreground">{data.source.toLocaleUpperCase('tr-TR')} · {formatDateTime(data.createdAt)}</Text>
        </Card>

        <Card>
          <InfoRows items={[
            { label: 'Firma', value: data.company?.shortName ?? data.company?.legalTitle },
            { label: 'Talep türü', value: data.ticketType },
            { label: 'Kontak', value: data.contactName },
            { label: 'Telefon', value: data.contactPhone },
            { label: 'E-posta', value: data.contactEmail },
            { label: 'Son güncelleme', value: formatDateTime(data.updatedAt) },
          ] satisfies InfoItem[]} />
        </Card>

        {data.description ? <Card className="gap-1.5"><Eyebrow>Açıklama</Eyebrow><Text selectable className="font-inter text-sm text-foreground">{data.description}</Text></Card> : null}
        {data.rejectionNote ? <Card className="gap-1.5"><Eyebrow>Red Gerekçesi</Eyebrow><Text selectable className="font-inter text-sm text-destructive">{data.rejectionNote}</Text></Card> : null}

        {data.machine ? (
          <Card className="gap-2">
            <View className="flex-row flex-wrap gap-2"><Chip label={warranty.label} tone={warranty.tone} /></View>
            <Text className="font-inter-semibold text-base text-foreground">{[data.machine.brand, data.machine.model].filter(Boolean).join(' ') || 'Makine'}</Text>
            <InfoRows items={[
              { label: 'Seri no', value: data.machine.serialNumber },
              { label: 'Garanti başlangıcı', value: data.machine.warrantyStartDate ? formatDate(data.machine.warrantyStartDate) : null },
              { label: 'Garanti bitişi', value: data.machine.warrantyEndDate ? formatDate(data.machine.warrantyEndDate) : null },
            ] satisfies InfoItem[]} />
            <Button label="Makine Kartına Git" variant="ghost" onPress={() => router.push(`/(tabs)/modules/customer-devices/${data.machine!.id}` as Href)} />
          </Card>
        ) : null}

        <View className="gap-2">
          <View className="px-1"><Eyebrow>Ekler ({data.attachments.length})</Eyebrow></View>
          {data.attachments.length ? data.attachments.map((attachment) => (
            <Card key={attachment.id} className="gap-2">
              <Text className="font-inter-medium text-sm text-foreground">{attachment.originalFilename}</Text>
              <Text className="font-inter text-xs text-muted-foreground">{[attachment.documentTypeName, fileSize(attachment.sizeBytes), attachment.mimeType].filter(Boolean).join(' · ')}</Text>
              {attachment.description ? <Text className="font-inter text-xs text-muted-foreground">{attachment.description}</Text> : null}
              {canReadFiles ? <Button label="Aç / Paylaş" variant="ghost" onPress={() => void openFile(attachment.fileId)} /> : null}
            </Card>
          )) : <Card><EmptyState title="Ek dosya yok" /></Card>}
        </View>

        {phoneUrl ? <Button label="Müşteriyi Ara" variant="ghost" onPress={() => void Linking.openURL(phoneUrl)} /> : null}
        {data.contactEmail ? <Button label="E-posta Gönder" variant="ghost" onPress={() => void Linking.openURL(`mailto:${encodeURIComponent(data.contactEmail!)}`)} /> : null}
        {data.companyId ? <Button label="Firmaya Git" variant="ghost" onPress={() => router.push(`/(tabs)/modules/companies/${data.companyId}` as Href)} /> : null}
        {data.serviceTicket ? <Button label={`${data.serviceTicket.ticketNo} Servis Talebine Git`} onPress={() => router.push(`/(tabs)/modules/service-tickets/${data.serviceTicket!.id}` as Href)} /> : null}

        {actionError ? <Text accessibilityLiveRegion="assertive" selectable className="font-inter text-sm text-destructive">{actionError}</Text> : null}
        {canUpdate && data.status === 'new' ? <Button label="İncelemeye Al" loading={update.isPending} onPress={markReviewing} /> : null}
        {canCreateTicket && !data.serviceTicket && !['converted', 'rejected'].includes(data.status) ? <Button label="Servis Talebine Çevir" loading={convert.isPending} onPress={confirmConvert} /> : null}
        {canUpdate && !['converted', 'rejected'].includes(data.status) ? <Button label="Şikayeti Reddet" variant="destructive" onPress={() => rejectionSheet.current?.present()} /> : null}
      </ScrollView>

      <BottomSheetModal
        ref={rejectionSheet}
        snapPoints={['45%']}
        enableDynamicSizing={false}
        backgroundStyle={{ backgroundColor: colors.card }}
        handleIndicatorStyle={{ backgroundColor: colors.mutedForeground }}
        backdropComponent={(props) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />}
      >
        <BottomSheetView className="gap-4 px-4 pb-8">
          <View className="gap-1"><Text className="font-inter-semibold text-base text-foreground">Şikayeti reddet</Text><Text className="font-inter text-xs text-muted-foreground">Gerekçe isteğe bağlıdır ve şikayet kaydında görünür.</Text></View>
          <Field label="Red gerekçesi" value={rejectionNote} onChangeText={setRejectionNote} multiline maxLength={4000} className="min-h-24 rounded-control border border-border bg-input-background px-3 py-2 font-inter text-base text-foreground" />
          <Button label="Reddet" variant="destructive" loading={reject.isPending} onPress={submitRejection} />
        </BottomSheetView>
      </BottomSheetModal>
    </SafeAreaView>
  );
}
