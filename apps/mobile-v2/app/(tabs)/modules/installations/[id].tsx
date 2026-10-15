import { Alert, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useInstallation, useSetInstallationStatus } from '@/src/api/operations.hooks';
import { useDeleteInstallation } from '@/src/api/service.hooks';
import { useCan } from '@/src/auth/AuthProvider';
import { formatDateTime } from '@/src/lib/format';
import type { Tone } from '@/src/theme/theme';
import { Button, Card, Chip, DetailHeader, ErrorState, Eyebrow, Loading } from '@/src/ui';
import { InfoRows, type InfoItem } from '@/src/ui/data';
import { toast } from '@/src/ui/toast';
import { JourneySteps } from '@/src/ui/service/JourneySteps';
import { INSTALLATION_JOURNEY, installationStep, LOCATION_TYPE_LABELS } from '@/src/ui/service/logistics';

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
  const canDelete = useCan('installations.delete');
  const action = useSetInstallationStatus(id);
  const remove = useDeleteInstallation();

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
  const step = installationStep({ ...data, status: data.status ?? { code: statusCode } });

  const setStatus = (next: 'in_progress' | 'cancelled') => {
    const execute = () => action.mutate({ statusCode: next }, {
      onSuccess: () => toast.success(next === 'in_progress' ? 'Kurulum başlatıldı' : 'Kurulum iptal edildi'),
      onError: (error) => toast.error(`Kurulum güncellenemedi: ${error.message}`),
    });
    if (next === 'in_progress') return execute();
    Alert.alert('Kurulumu iptal et?', 'Kurulum kaydı iptal durumuna alınacak.', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'İptal et', style: 'destructive', onPress: execute },
    ]);
  };

  const archive = () => {
    Alert.alert(
      'Kurulum kaydı arşivlensin mi?',
      `${companyName}\nKurulum planı, teknisyen ataması ve form bağlantısı arşivlenir; firma ve makine kaydı korunur.`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Kurulumu Arşivle',
          style: 'destructive',
          onPress: () =>
            remove.mutate(id, {
              onSuccess: () => {
                toast.success('Kurulum silindi');
                router.back();
              },
              onError: (error) => toast.error(`Kurulum silinemedi: ${error.message}`),
            }),
        },
      ],
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <DetailHeader title="Kurulum Detayı" subtitle={data.customerDevice?.serialNumber ?? undefined} />
      <ScrollView
        contentContainerClassName="gap-4 px-4 pb-10 pt-4"
        refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}
      >
        <Card className="gap-2">
          <Chip tone={tone} label={data.status?.name ?? (statusCode === 'in_progress' ? 'Devam ediyor' : statusCode === 'completed' ? 'Tamamlandı' : statusCode === 'cancelled' ? 'İptal' : 'Planlandı')} />
          <Text className="font-display-semibold text-[19px] text-foreground">{companyName}</Text>
          <Text className="font-inter text-[13px] text-muted-foreground">{machineName}</Text>
          {data.customerDevice?.serialNumber ? <Text className="font-inter-medium text-[12px] text-foreground">SN: {data.customerDevice.serialNumber}</Text> : null}
        </Card>

        <Card className="gap-2">
          <Eyebrow>Kurulum Yolculuğu</Eyebrow>
          <JourneySteps steps={INSTALLATION_JOURNEY} current={step} />
        </Card>

        <Card>
          <InfoRows items={[
            { label: 'Planlanan', value: data.scheduledDate ? formatDateTime(data.scheduledDate) : null },
            { label: 'Başlangıç', value: data.startedAt ? formatDateTime(data.startedAt) : null },
            { label: 'Tamamlanma', value: data.completedAt ? formatDateTime(data.completedAt) : null },
            { label: 'Teknisyen', value: data.assignedTo?.fullName },
            { label: 'Kontak', value: data.contact?.fullName },
            { label: 'Lokasyon', value: data.location },
            { label: 'Konum Tipi', value: data.locationType ? LOCATION_TYPE_LABELS[data.locationType] ?? data.locationType : null },
            { label: 'Süre', value: data.durationMinutes === null ? null : `${Math.floor(data.durationMinutes / 60)} sa ${data.durationMinutes % 60} dk` },
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

        {data.notes ? <Card className="gap-1.5"><Eyebrow>Notlar</Eyebrow><Text className="font-inter text-sm text-foreground">{data.notes}</Text></Card> : null}

        {canUpdate ? (
          <View className="gap-3">
            {statusCode === 'scheduled' ? (
              <Button label="Kurulumu Başlat" loading={action.isPending} onPress={() => setStatus('in_progress')} />
            ) : null}
            <Button
              label={data.formData ? 'Kurulum Tutanağını Aç' : 'Kurulum Tutanağını Doldur'}
              variant={statusCode === 'in_progress' ? 'primary' : 'ghost'}
              trailingIcon="document-text-outline"
              onPress={() => router.push(`/modal/installation-completion?id=${encodeURIComponent(id)}` as Href)}
            />
            <Button
              label="Planı Düzenle"
              variant="ghost"
              trailingIcon="create-outline"
              onPress={() => router.push(`/modal/installation-form?id=${encodeURIComponent(id)}` as Href)}
            />
            {!['completed', 'cancelled'].includes(statusCode) ? (
              <Button label="Kurulumu İptal Et" variant="destructive" loading={action.isPending} onPress={() => setStatus('cancelled')} />
            ) : null}
          </View>
        ) : null}

        {data.customerDeviceId ? <Button label="Makine Kartı" variant="ghost" onPress={() => router.push(`/(tabs)/modules/customer-devices/${data.customerDeviceId}` as Href)} /> : null}
        {data.quoteId ? <Button label="Teklif" variant="ghost" onPress={() => router.push(`/(tabs)/modules/quotes/${data.quoteId}` as Href)} /> : null}
        {data.opportunityId ? <Button label="Fırsat" variant="ghost" onPress={() => router.push(`/(tabs)/modules/opportunities/${data.opportunityId}` as Href)} /> : null}
        {data.companyId ? <Button label="Firma Kartı" variant="ghost" onPress={() => router.push(`/(tabs)/modules/companies/${data.companyId}` as Href)} /> : null}
        {canDelete ? (
          <Button label="Kurulumu Arşivle" variant="destructive" trailingIcon="trash-outline" loading={remove.isPending} onPress={archive} />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
