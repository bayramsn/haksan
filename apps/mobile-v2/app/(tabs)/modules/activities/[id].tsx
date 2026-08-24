import { Alert, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCompany } from '@/src/api/companies.hooks';
import { useActivity, useContact, useDeleteActivity, useOpportunity } from '@/src/api/crm.hooks';
import { useCan } from '@/src/auth/AuthProvider';
import { formatDateTime } from '@/src/lib/format';
import { downloadAndShareFile } from '@/src/native/files';
import { Button, Card, Chip, DetailHeader, ErrorState, Eyebrow, Loading } from '@/src/ui';
import { InfoRows, type InfoItem } from '@/src/ui/data';

function fileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} MB`;
}

export default function ActivityDetailScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const query = useActivity(id);
  const company = useCompany(query.data?.companyId ?? '');
  const contact = useContact(query.data?.contactId ?? '');
  const opportunity = useOpportunity(query.data?.opportunityId ?? '');
  const remove = useDeleteActivity();
  const canUpdate = useCan('activities.update');
  const canDelete = useCan('activities.delete');
  const canReadFiles = useCan('files.read');

  if (query.isPending || query.error || !query.data) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
        <DetailHeader title="Aktivite" />
        {query.isPending ? <Loading /> : <ErrorState message={query.error?.message ?? 'Aktivite yüklenemedi.'} onRetry={() => void query.refetch()} />}
      </SafeAreaView>
    );
  }

  const data = query.data;
  const attachments = data.files ?? [];
  const companyName = company.data?.shortName ?? company.data?.legalTitle;

  const confirmDelete = () => {
    Alert.alert('Aktiviteyi sil?', 'Bu kayıt listelerden kaldırılacak. Bu işlem geri alınamaz.', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: () => remove.mutate(id, {
          onSuccess: () => router.replace('/(tabs)/modules/activities'),
          onError: (error) => Alert.alert('Aktivite silinemedi', error.message),
        }),
      },
    ]);
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
      <DetailHeader
        title="Aktivite Detayı"
        subtitle={data.type?.name ?? 'Aktivite'}
        actions={canUpdate ? [{ icon: 'create-outline', label: 'Aktiviteyi düzenle', onPress: () => router.push(`/modal/activity?id=${encodeURIComponent(id)}` as Href) }] : []}
      />
      <ScrollView contentContainerClassName="gap-4 px-4 pb-10 pt-4">
        <Card className="gap-2">
          <View className="flex-row flex-wrap items-center gap-2">
            <Chip label={data.type?.name ?? 'Tür bilinmiyor'} tone={data.origin === 'system' ? 'neutral' : 'info'} />
            <Chip label={data.origin === 'system' ? 'Sistem kaydı' : 'Manuel kayıt'} tone="neutral" />
          </View>
          <Text className="font-inter-semibold text-[20px] text-foreground">{data.subject}</Text>
          <Text className="font-inter text-[13px] text-muted-foreground">{formatDateTime(data.activityDate)}</Text>
        </Card>

        <Card>
          <InfoRows
            items={[
              { label: 'Firma', value: companyName ?? (company.isPending ? 'Yükleniyor…' : null) },
              { label: 'Satış kartı', value: opportunity.data?.title ?? (opportunity.isPending ? 'Yükleniyor…' : null) },
              { label: 'Kontak', value: contact.data?.fullName ?? (contact.isPending ? 'Yükleniyor…' : null) },
              { label: 'Oluşturan', value: data.createdByUser?.fullName },
              { label: 'Sonraki takip', value: data.nextFollowUpAt ? formatDateTime(data.nextFollowUpAt) : null },
            ] satisfies InfoItem[]}
          />
        </Card>

        {data.description ? <Card className="gap-1.5"><Eyebrow>Açıklama</Eyebrow><Text selectable className="font-inter text-sm text-foreground">{data.description}</Text></Card> : null}
        {data.result ? <Card className="gap-1.5"><Eyebrow>Sonuç</Eyebrow><Text selectable className="font-inter text-sm text-foreground">{data.result}</Text></Card> : null}

        {attachments.length ? (
          <View className="gap-2">
            <View className="px-1"><Eyebrow>Dosyalar ({attachments.length})</Eyebrow></View>
            {attachments.map((file) => (
              <Card key={file.id} className="gap-2">
                <Text className="font-inter-medium text-sm text-foreground">{file.originalFilename}</Text>
                <Text className="font-inter text-xs text-muted-foreground">
                  {[file.documentType?.name, fileSize(file.sizeBytes), file.mimeType].filter(Boolean).join(' · ')}
                </Text>
                {file.description ? <Text className="font-inter text-xs text-muted-foreground">{file.description}</Text> : null}
                {canReadFiles ? <Button label="Aç / Paylaş" variant="ghost" onPress={() => void openFile(file.id)} /> : null}
              </Card>
            ))}
          </View>
        ) : null}

        {data.companyId ? <Button label="Firmaya Git" variant="ghost" onPress={() => router.push(`/(tabs)/modules/companies/${data.companyId}` as Href)} /> : null}
        {data.opportunityId ? <Button label="Satış Kartına Git" variant="ghost" onPress={() => router.push(`/(tabs)/modules/opportunities/${data.opportunityId}` as Href)} /> : null}
        {data.contactId ? <Button label="Kontağa Git" variant="ghost" onPress={() => router.push(`/(tabs)/modules/contacts/${data.contactId}` as Href)} /> : null}
        {canDelete ? <Button label="Aktiviteyi Sil" variant="destructive" loading={remove.isPending} onPress={confirmDelete} /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}
