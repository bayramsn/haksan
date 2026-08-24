import { Alert, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useInstallation, useSetInstallationStatus } from '@/src/api/operations.hooks';
import { useCan } from '@/src/auth/AuthProvider';
import { formatDateTime } from '@/src/lib/format';
import type { Tone } from '@/src/theme/theme';
import { Button, Card, Chip, DetailHeader, ErrorState, Eyebrow, Loading } from '@/src/ui';
import { InfoRows, type InfoItem } from '@/src/ui/data';

const STATUS_TONE: Record<string, Tone> = {
  scheduled: 'info',
  in_progress: 'warning',
  completed: 'success',
  cancelled: 'destructive',
};

export default function InstallationDetailScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const query = useInstallation(id);
  const canUpdate = useCan('installations.update');
  const action = useSetInstallationStatus(id);

  if (query.isPending || query.error || !query.data) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
        <DetailHeader title="Kurulum" />
        {query.isPending ? <Loading /> : <ErrorState message={query.error?.message ?? 'Kurulum yüklenemedi.'} onRetry={() => void query.refetch()} />}
      </SafeAreaView>
    );
  }

  const data = query.data;
  const statusCode = data.status?.code ?? (data.completedAt ? 'completed' : data.startedAt ? 'in_progress' : 'scheduled');
  const tone = STATUS_TONE[statusCode] ?? 'neutral';
  const companyName = data.company?.shortName ?? data.company?.legalTitle ?? 'Firma bağlanmadı';
  const machineName = [data.customerDevice?.brandName, data.customerDevice?.productModelName ?? data.customerDevice?.model]
    .filter(Boolean).join(' ') || 'Makine bağlanmadı';

  const setStatus = (statusCode: 'in_progress' | 'cancelled') => {
    const execute = () => action.mutate({ statusCode }, {
      onError: (error) => Alert.alert('Kurulum güncellenemedi', error.message),
    });
    if (statusCode === 'in_progress') return execute();
    Alert.alert('Kurulumu iptal et?', 'Kurulum kaydı iptal durumuna alınacak.', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'İptal et', style: 'destructive', onPress: execute },
    ]);
  };

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <DetailHeader title="Kurulum Detayı" subtitle={data.customerDevice?.serialNumber ?? undefined} />
      <ScrollView contentContainerClassName="gap-4 px-4 pb-10 pt-4">
        <Card className="gap-2">
          <Chip tone={tone} label={data.status?.name ?? (statusCode === 'in_progress' ? 'Devam ediyor' : statusCode === 'completed' ? 'Tamamlandı' : statusCode === 'cancelled' ? 'İptal' : 'Planlandı')} />
          <Text className="text-[19px] font-inter-semibold text-foreground">{companyName}</Text>
          <Text className="font-inter text-[13px] text-muted-foreground">{machineName}</Text>
          {data.customerDevice?.serialNumber ? <Text className="font-inter-medium text-[12px] text-foreground">SN: {data.customerDevice.serialNumber}</Text> : null}
        </Card>

        <Card>
          <InfoRows items={[
            { label: 'Planlanan', value: data.scheduledDate ? formatDateTime(data.scheduledDate) : null },
            { label: 'Başlangıç', value: data.startedAt ? formatDateTime(data.startedAt) : null },
            { label: 'Tamamlanma', value: data.completedAt ? formatDateTime(data.completedAt) : null },
            { label: 'Sorumlu', value: data.assignedTo?.fullName },
            { label: 'Kontak', value: data.contact?.fullName },
            { label: 'Konum', value: data.location },
            { label: 'Konum tipi', value: data.locationType === 'istanbul_ici' ? 'İstanbul içi' : data.locationType === 'istanbul_disi' ? 'İstanbul dışı' : data.locationType },
            { label: 'Süre', value: data.durationMinutes === null ? null : `${data.durationMinutes} dakika` },
          ] satisfies InfoItem[]} />
        </Card>

        {data.customerDevice ? (
          <Card>
            <InfoRows items={[
              { label: 'Makine', value: machineName },
              { label: 'Seri no', value: data.customerDevice.serialNumber },
              { label: 'Kontrol ünitesi', value: data.customerDevice.controlUnit },
              { label: 'Kontrol ünitesi seri no', value: data.customerDevice.controlUnitSerialNumber },
              { label: 'Ürün tipi', value: data.customerDevice.productTypeName },
            ] satisfies InfoItem[]} />
          </Card>
        ) : null}

        {data.customerDevice?.technicalSpecs?.length ? (
          <Card className="gap-1">
            <Eyebrow>Teknik özellikler</Eyebrow>
            <InfoRows items={data.customerDevice.technicalSpecs.map((spec) => ({
              label: spec.key,
              value: [spec.value, spec.unit].filter(Boolean).join(' '),
            }))} />
          </Card>
        ) : null}

        {data.notes ? <Card className="gap-1.5"><Eyebrow>Not</Eyebrow><Text className="font-inter text-sm text-foreground">{data.notes}</Text></Card> : null}

        {canUpdate && statusCode === 'scheduled' ? (
          <Button label="Kurulumu Başlat" loading={action.isPending} onPress={() => setStatus('in_progress')} />
        ) : null}
        {canUpdate && statusCode === 'in_progress' ? (
          <Button label="Kurulum Tutanağını Doldur" onPress={() => router.push(`/modal/installation-completion?id=${encodeURIComponent(id)}` as Href)} />
        ) : null}
        {canUpdate && !['completed', 'cancelled'].includes(statusCode) ? (
          <Button label="Kurulumu İptal Et" variant="destructive" loading={action.isPending} onPress={() => setStatus('cancelled')} />
        ) : null}

        {data.customerDeviceId ? <Button label="Makine Kartı" variant="ghost" onPress={() => router.push(`/(tabs)/modules/customer-devices/${data.customerDeviceId}` as Href)} /> : null}
        {data.quoteId ? <Button label="Teklif" variant="ghost" onPress={() => router.push(`/(tabs)/modules/quotes/${data.quoteId}` as Href)} /> : null}
        {data.opportunityId ? <Button label="Fırsat" variant="ghost" onPress={() => router.push(`/(tabs)/modules/opportunities/${data.opportunityId}` as Href)} /> : null}
        {data.companyId ? <Button label="Firma Kartı" variant="ghost" onPress={() => router.push(`/(tabs)/modules/companies/${data.companyId}` as Href)} /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}
