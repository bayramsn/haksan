import { useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BottomSheetBackdrop, BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCompleteMaintenancePlan, useMaintenancePlan, useUpdateMaintenancePlan } from '@/src/api/operations.hooks';
import { dayText, parseDay, useRemoveMaintenancePlan } from '@/src/api/service.endpoints';
import type { MaintenancePlan } from '@/src/api/endpoints';
import { useCan } from '@/src/auth/AuthProvider';
import { dueLabel, formatDate, formatDateTime } from '@/src/lib/format';
import { useTheme, type Tone } from '@/src/theme/theme';
import { Button, Card, Chip, DetailHeader, ErrorState, Eyebrow, Field, Loading } from '@/src/ui';
import { toast } from '@/src/ui/toast';
import { InfoRows, type InfoItem } from '@/src/ui/data';

export default function MaintenancePlanDetailScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const query = useMaintenancePlan(id);
  const canUpdate = useCan('service_tickets.update');
  const canDelete = useCan('service_tickets.delete');
  const complete = useCompleteMaintenancePlan(id);
  const update = useUpdateMaintenancePlan(id);
  const remove = useRemoveMaintenancePlan(id);
  const editRef = useRef<BottomSheetModal>(null);

  if (query.isPending || query.error || !query.data) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['left', 'right']}>
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
    <SafeAreaView className="flex-1 bg-canvas" edges={['left', 'right']}>
      <DetailHeader
        title="Bakım Planı Detayı"
        subtitle={data.machine?.serialNumber ?? undefined}
        actions={canUpdate ? [{ icon: 'create-outline', label: 'Planı düzenle', onPress: () => editRef.current?.present() }] : []}
      />
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerClassName="gap-4 px-4 pb-10 pt-4">
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
        {canUpdate ? (
          <Button
            label={data.isActive ? 'Planı Duraklat' : 'Planı Aktifleştir'}
            variant="ghost"
            loading={update.isPending}
            disabled={update.isPending}
            onPress={() => update.mutate({ isActive: !data.isActive }, { onError: (error) => toast.error(error.message) })}
          />
        ) : null}
        <Button label="Makine Kartı" variant="ghost" onPress={() => router.push(`/modules/customer-devices/${data.customerDeviceId}` as Href)} />
        <Button label="Firma Kartı" variant="ghost" onPress={() => router.push(`/modules/companies/${data.companyId}` as Href)} />
        {canDelete ? (
          <Button
            label="Planı Sil"
            variant="destructive"
            loading={remove.isPending}
            disabled={remove.isPending}
            onPress={() => Alert.alert('Bakım planı silinsin mi?', `${data.title} kalıcı olarak silinecek.`, [
              { text: 'Vazgeç', style: 'cancel' },
              {
                text: 'Sil',
                style: 'destructive',
                onPress: () => remove.mutate(undefined, {
                  onSuccess: () => { toast.success('Bakım planı silindi'); router.back(); },
                  onError: (error) => toast.error(error.message),
                }),
              },
            ])}
          />
        ) : null}
      </ScrollView>
      {canUpdate ? <PlanEditSheet key={`${data.updatedAt ?? ''}:${data.nextDueDate}`} sheetRef={editRef} plan={data} update={update} /> : null}
    </SafeAreaView>
  );
}

function ViewChips({ active, dueText, tone }: { active: boolean; dueText?: string; tone: Tone }) {
  return <Chip label={active ? (dueText ?? 'Aktif') : 'Pasif'} tone={tone} />;
}

function PlanEditSheet({
  sheetRef,
  plan,
  update,
}: {
  sheetRef: React.RefObject<BottomSheetModal | null>;
  plan: MaintenancePlan;
  update: ReturnType<typeof useUpdateMaintenancePlan>;
}) {
  const { colors } = useTheme();
  const [title, setTitle] = useState(plan.title);
  const [intervalText, setIntervalText] = useState(String(plan.intervalDays));
  const [nextDue, setNextDue] = useState(dayText(plan.nextDueDate));
  const [reminder, setReminder] = useState(String(plan.reminderLeadDays));
  const [autoTicket, setAutoTicket] = useState(plan.autoCreateTicket);
  const [notes, setNotes] = useState(plan.notes ?? '');

  function save() {
    const intervalDays = Number(intervalText);
    const reminderLeadDays = Number(reminder);
    const due = parseDay(nextDue);
    if (!title.trim()) return toast.error('Başlık boş olamaz.');
    if (!Number.isInteger(intervalDays) || intervalDays < 1) return toast.error('Periyot 1 günden az olamaz.');
    if (!Number.isInteger(reminderLeadDays) || reminderLeadDays < 0) return toast.error('Hatırlatma günü 0 veya daha büyük olmalı.');
    if (!due) return toast.error('Sonraki bakım tarihi: YYYY-AA-GG');
    update.mutate(
      { title: title.trim(), intervalDays, nextDueDate: due, reminderLeadDays, autoCreateTicket: autoTicket, notes: notes.trim() || null },
      {
        onSuccess: () => { toast.success('Bakım planı güncellendi'); sheetRef.current?.dismiss(); },
        onError: (error) => toast.error(error.message),
      }
    );
  }

  return (
    <BottomSheetModal
      ref={sheetRef}
      enableDynamicSizing
      keyboardBlurBehavior="restore"
      backgroundStyle={{ backgroundColor: colors.card }}
      handleIndicatorStyle={{ backgroundColor: colors.mutedForeground }}
      backdropComponent={(props) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />}
    >
      <BottomSheetScrollView contentContainerStyle={{ gap: 12, paddingHorizontal: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Text className="font-inter-semibold text-base text-foreground">Bakım planını düzenle</Text>
        <Field label="Başlık" value={title} onChangeText={setTitle} maxLength={255} />
        <View className="flex-row gap-3">
          <View className="flex-1"><Field label="Periyot (gün)" value={intervalText} onChangeText={setIntervalText} keyboardType="number-pad" maxLength={5} /></View>
          <View className="flex-1"><Field label="Hatırlatma (gün önce)" value={reminder} onChangeText={setReminder} keyboardType="number-pad" maxLength={4} /></View>
        </View>
        <Field label="Sonraki bakım" value={nextDue} onChangeText={setNextDue} placeholder="YYYY-AA-GG" keyboardType="numbers-and-punctuation" maxLength={10} />
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: autoTicket }}
          onPress={() => setAutoTicket((prev) => !prev)}
          className="h-11 flex-row items-center gap-2"
        >
          <Ionicons name={autoTicket ? 'checkbox' : 'square-outline'} size={20} color={colors.mutedForeground} />
          <Text className="font-inter text-sm text-foreground">Vadeyi aşınca talep otomatik açılsın</Text>
        </Pressable>
        <Field label="Not" value={notes} onChangeText={setNotes} multiline maxLength={4000} />
        <Button label="Kaydet" loading={update.isPending} disabled={update.isPending} onPress={save} />
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}
