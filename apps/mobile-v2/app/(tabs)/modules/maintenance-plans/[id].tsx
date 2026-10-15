import { Alert, ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCompleteMaintenancePlan, useMaintenancePlan } from '@/src/api/operations.hooks';
import { useCan } from '@/src/auth/AuthProvider';
import { dueLabel, formatDate, formatDateTime } from '@/src/lib/format';
import type { Tone } from '@/src/theme/theme';
import { Button, Card, Chip, DetailHeader, ErrorState, Eyebrow, Loading } from '@/src/ui';
import { InfoRows, type InfoItem } from '@/src/ui/data';

export default function MaintenancePlanDetailScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const query = useMaintenancePlan(id);
  const canUpdate = useCan('service_tickets.update');
  const complete = useCompleteMaintenancePlan(id);

  if (query.isPending || query.error || !query.data) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
        <DetailHeader title="Bakım Planı" />
        {query.isPending ? <Loading /> : <ErrorState message={query.error?.message ?? 'Bakım planı yüklenemedi.'} onRetry={() => void query.refetch()} />}
      </SafeAreaView>
    );
  }

  const data = query.data;
  const due = dueLabel(data.nextDueDate);
  const tone: Tone = !data.isActive ? 'neutral' : due?.overdue ? 'destructive' : due ? 'warning' : 'success';
  const machine = [data.machine?.brand, data.machine?.model].filter(Boolean).join(' ') || 'Makine';

  const markComplete = () => Alert.alert(
    'Bakım tamamlandı mı?',
    `Son bakım bugün olarak kaydedilecek ve sonraki tarih ${data.intervalDays} gün ileri alınacak.`,
    [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Tamamlandı', onPress: () => complete.mutate(undefined, { onError: (error) => Alert.alert('Bakım güncellenemedi', error.message) }) },
    ],
  );

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <DetailHeader title="Bakım Planı Detayı" subtitle={data.machine?.serialNumber ?? undefined} />
      <ScrollView contentContainerClassName="gap-4 px-4 pb-10 pt-4">
        <Card className="gap-2">
          <ViewChips active={data.isActive} dueText={due?.text} tone={tone} />
          <Text className="text-[20px] font-inter-semibold text-foreground">{data.title}</Text>
          <Text className="font-inter text-[13px] text-muted-foreground">{data.company?.shortName ?? data.company?.legalTitle ?? 'Firma'} · {machine}</Text>
          {data.machine?.serialNumber ? <Text className="font-inter-medium text-[12px] text-foreground">SN: {data.machine.serialNumber}</Text> : null}
        </Card>

        <Card><InfoRows items={[
          { label: 'Son bakım', value: data.lastServiceDate ? formatDateTime(data.lastServiceDate) : 'Henüz yapılmadı' },
          { label: 'Sonraki bakım', value: formatDateTime(data.nextDueDate), tone: due?.overdue ? 'destructive' : undefined },
          { label: 'Periyot', value: `${data.intervalDays} gün` },
          { label: 'Hatırlatma', value: `${data.reminderLeadDays} gün önce` },
          { label: 'Otomatik servis talebi', value: data.autoCreateTicket ? 'Açık' : 'Kapalı' },
          { label: 'Son güncelleme', value: data.updatedAt ? formatDateTime(data.updatedAt) : null },
        ] satisfies InfoItem[]} /></Card>

        {data.notes ? <Card className="gap-1.5"><Eyebrow>Not</Eyebrow><Text className="font-inter text-sm text-foreground">{data.notes}</Text></Card> : null}
        {canUpdate && data.isActive ? <Button label="Bakım Yapıldı" loading={complete.isPending} onPress={markComplete} /> : null}
        <Button label="Makine Kartı" variant="ghost" onPress={() => router.push(`/(tabs)/modules/customer-devices/${data.customerDeviceId}` as Href)} />
        <Button label="Firma Kartı" variant="ghost" onPress={() => router.push(`/(tabs)/modules/companies/${data.companyId}` as Href)} />
      </ScrollView>
    </SafeAreaView>
  );
}

function ViewChips({ active, dueText, tone }: { active: boolean; dueText?: string; tone: Tone }) {
  return <Chip label={active ? (dueText ?? 'Aktif') : 'Pasif'} tone={tone} />;
}
