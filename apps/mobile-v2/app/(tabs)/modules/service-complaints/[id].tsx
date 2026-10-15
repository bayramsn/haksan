import { useRef, useState } from 'react';
import { Alert, Linking, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { BottomSheetBackdrop, BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import type { ServiceComplaintUpdateInput } from '@haksan/shared';
import {
  useConvertServiceComplaint,
  useRejectServiceComplaint,
  useServiceComplaint,
  useUpdateServiceComplaint,
} from '@/src/api/operations.hooks';
import type { ServiceComplaint } from '@/src/api/endpoints';
import { useCan } from '@/src/auth/AuthProvider';
import { formatDate, formatDateTime } from '@/src/lib/format';
import { useTheme, type Tone } from '@/src/theme/theme';
import { Button, Card, Chip, DetailHeader, ErrorState, Eyebrow, Field, Loading } from '@/src/ui';
import { InfoRows, type InfoItem } from '@/src/ui/data';
import { CompanyPicker, type PickedRecord } from '@/src/ui/pickers/CompanyPicker';
import { toast } from '@/src/ui/toast';
import { AttachmentsPanel } from '@/src/ui/service/AttachmentsPanel';
import { ChoiceChips, DevicePicker, FormSection } from '@/src/ui/service/fields';
import {
  COMPLAINT_SOURCE_LABELS,
  COMPLAINT_STATUS_LABELS,
  SEVERITY_LABELS,
  TICKET_TYPE_LABELS,
} from '@/src/ui/service/serviceStage';

type Severity = 'low' | 'normal' | 'high' | 'critical';
type TicketType = 'complaint' | 'request' | 'warranty_claim' | 'question';

const STATUS_TONE: Record<string, Tone> = { new: 'destructive', reviewing: 'warning', converted: 'success', rejected: 'neutral' };
const WARRANTY: Record<string, { label: string; tone: Tone }> = {
  in_warranty: { label: 'Garantide görünüyor', tone: 'success' },
  out_of_warranty: { label: 'Garanti dışında görünüyor', tone: 'warning' },
  unknown: { label: 'Garanti bilgisi belirsiz', tone: 'neutral' },
};
const SEVERITIES = (['low', 'normal', 'high', 'critical'] as Severity[]).map((value) => ({ value, label: SEVERITY_LABELS[value]! }));
const TYPES = (['complaint', 'request', 'warranty_claim', 'question'] as TicketType[]).map((value) => ({ value, label: TICKET_TYPE_LABELS[value]! }));

function safePhone(value: string | null): string | null {
  if (!value) return null;
  const cleaned = value.replace(/[^+0-9,;#*]/g, '');
  return cleaned ? `tel:${cleaned}` : null;
}

type Draft = {
  company: PickedRecord | null;
  deviceId: string | null;
  severity: Severity;
  ticketType: TicketType;
  subject: string;
  description: string;
};

function draftOf(data: ServiceComplaint): Draft {
  return {
    company: data.company ? { id: data.company.id, name: data.company.shortName ?? data.company.legalTitle } : null,
    deviceId: data.customerDeviceId,
    severity: (SEVERITY_LABELS[data.severity] ? data.severity : 'normal') as Severity,
    ticketType: (TICKET_TYPE_LABELS[data.ticketType] ? data.ticketType : 'complaint') as TicketType,
    subject: data.subject,
    description: data.description ?? '',
  };
}

function patchOf(draft: Draft): ServiceComplaintUpdateInput {
  return {
    companyId: draft.company?.id ?? null,
    customerDeviceId: draft.deviceId,
    severity: draft.severity,
    ticketType: draft.ticketType,
    subject: draft.subject.trim(),
    description: draft.description.trim() || null,
  };
}

export default function ServiceComplaintDetailScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const query = useServiceComplaint(id);

  if (query.isPending || query.error || !query.data) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
        <DetailHeader title="Şikayet" />
        {query.isPending ? <Loading /> : <ErrorState message={query.error?.message ?? 'Şikayet yüklenemedi.'} onRetry={() => void query.refetch()} />}
      </SafeAreaView>
    );
  }
  return <ComplaintDetail key={query.data.id} data={query.data} refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />;
}

function ComplaintDetail({ data, refreshing, onRefresh }: { data: ServiceComplaint; refreshing: boolean; onRefresh: () => void }) {
  const router = useRouter();
  const { colors } = useTheme();
  const update = useUpdateServiceComplaint();
  const convert = useConvertServiceComplaint();
  const reject = useRejectServiceComplaint();
  const canUpdate = useCan('service_tickets.update');
  const canCreateTicket = useCan('service_tickets.create');
  const [draft, setDraft] = useState<Draft>(() => draftOf(data));
  const [subjectError, setSubjectError] = useState<string>();
  const [rejectionNote, setRejectionNote] = useState(data.rejectionNote ?? '');
  const rejectionSheet = useRef<BottomSheetModal>(null);

  const closed = data.status === 'converted' || data.status === 'rejected';
  const editable = canUpdate && !closed;
  const tone = STATUS_TONE[data.status] ?? 'neutral';
  const warranty = WARRANTY[data.warrantyStatusSuggestion] ?? WARRANTY.unknown!;
  const phoneUrl = safePhone(data.contactPhone);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));

  const save = async (): Promise<boolean> => {
    if (draft.subject.trim().length < 3) {
      setSubjectError('Konu en az 3 karakter olmalı.');
      return false;
    }
    setSubjectError(undefined);
    try {
      await update.mutateAsync({ id: data.id, patch: patchOf(draft) });
      toast.success('Şikayet kaydı güncellendi');
      return true;
    } catch (error) {
      toast.error(`Şikayet güncellenemedi: ${error instanceof Error ? error.message : 'İşlem başarısız.'}`);
      return false;
    }
  };

  const markReviewing = () => {
    update.mutate(
      { id: data.id, patch: { status: 'reviewing' } },
      {
        onSuccess: () => toast.success('Şikayet incelemeye alındı'),
        onError: (error) => toast.error(error.message),
      },
    );
  };

  const confirmConvert = () => {
    Alert.alert('Servis talebine çevir?', 'Şikayet bilgileri ve ekleri yeni servis talebine kopyalanacak.', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Servis Talebi Oluştur',
        onPress: async () => {
          if (editable && !(await save())) return;
          convert.mutate(data.id, {
            onSuccess: (updated) => {
              toast.success('Servis talebi oluşturuldu');
              if (updated.serviceTicket) router.replace(`/(tabs)/modules/service-tickets/${updated.serviceTicket.id}` as Href);
            },
            onError: (error) => toast.error(`Servis talebi açılamadı: ${error.message}`),
          });
        },
      },
    ]);
  };

  const submitRejection = () => {
    reject.mutate(
      { id: data.id, body: { rejectionNote: rejectionNote.trim() || null } },
      {
        onSuccess: () => {
          rejectionSheet.current?.dismiss();
          toast.success('Şikayet reddedildi');
        },
        onError: (error) => toast.error(`Şikayet reddedilemedi: ${error.message}`),
      },
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <DetailHeader title="Şikayet Detayı" subtitle={data.complaintNo} />
      <ScrollView
        contentContainerClassName="gap-4 px-4 pb-10 pt-4"
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        <Card className="gap-2">
          <View className="flex-row flex-wrap gap-2">
            <Chip label={COMPLAINT_STATUS_LABELS[data.status] ?? data.status} tone={tone} />
            <Chip label={SEVERITY_LABELS[data.severity] ?? data.severity} tone={data.severity === 'critical' ? 'destructive' : data.severity === 'high' ? 'warning' : 'neutral'} />
          </View>
          <Text className="font-display-semibold text-[20px] text-foreground">{data.subject}</Text>
          <Text className="font-inter text-[13px] text-muted-foreground">
            {[COMPLAINT_SOURCE_LABELS[data.source] ?? data.source, COMPLAINT_STATUS_LABELS[data.status] ?? data.status, formatDateTime(data.createdAt)].join(' · ')}
          </Text>
        </Card>

        <FormSection title="Şikayet Bilgileri" hint={closed ? 'Kapanmış kayıtlar düzenlenemez.' : undefined}>
          <CompanyPicker
            label="Firma"
            placeholder="Eşleşmemiş"
            value={draft.company}
            disabled={!editable}
            onChange={(next) => setDraft((current) => ({ ...current, company: next, deviceId: null }))}
          />
          {editable ? (
            <>
              <DevicePicker label="Makine" companyId={draft.company?.id ?? null} value={draft.deviceId} onChange={(next) => set('deviceId', next?.id ?? null)} />
              <ChoiceChips label="Öncelik" value={draft.severity} options={SEVERITIES} onChange={(value) => set('severity', value)} />
              <ChoiceChips label="Kayıt Tipi" value={draft.ticketType} options={TYPES} onChange={(value) => set('ticketType', value)} />
              <Field label="Konu" value={draft.subject} onChangeText={(value) => set('subject', value)} maxLength={255} error={subjectError} />
              <Field
                label="Açıklama"
                value={draft.description}
                onChangeText={(value) => set('description', value)}
                multiline
                maxLength={4000}
                style={{ minHeight: 110, textAlignVertical: 'top', paddingTop: 12 }}
              />
              <Button label="Kaydet" variant="ghost" loading={update.isPending} disabled={update.isPending} onPress={() => void save()} />
            </>
          ) : (
            <InfoRows
              items={[
                { label: 'Makine', value: [data.machine?.brand, data.machine?.model, data.machine?.serialNumber].filter(Boolean).join(' · ') || 'Eşleşmemiş' },
                { label: 'Kayıt Tipi', value: TICKET_TYPE_LABELS[data.ticketType] ?? data.ticketType },
                { label: 'Açıklama', value: data.description },
              ] satisfies InfoItem[]}
            />
          )}
        </FormSection>

        <Card>
          <InfoRows
            items={[
              { label: 'İlgili', value: data.contactName },
              { label: 'Telefon', value: data.contactPhone },
              { label: 'E-posta', value: data.contactEmail },
              { label: 'Son güncelleme', value: formatDateTime(data.updatedAt) },
            ] satisfies InfoItem[]}
          />
        </Card>

        {data.rejectionNote ? (
          <Card className="gap-1.5">
            <Eyebrow>Red Gerekçesi</Eyebrow>
            <Text selectable className="font-inter text-sm text-destructive">{data.rejectionNote}</Text>
          </Card>
        ) : null}

        <Card className="gap-2">
          <View className="flex-row flex-wrap gap-2">
            <Chip label={`Garanti durumu: ${warranty.label}`} tone={warranty.tone} />
            {draft.ticketType === 'warranty_claim' && !draft.deviceId ? <Chip label="Onaya gönderilemez, önce makine eşleştir" tone="warning" /> : null}
          </View>
          <Text className="font-inter text-[13px] text-muted-foreground">
            {data.machine?.warrantyEndDate ? `Bitiş: ${formatDate(data.machine.warrantyEndDate)}` : 'Garanti tarihi bulunmuyor'}
          </Text>
          {data.machine ? (
            <Button label="Makine Kartına Git" variant="ghost" onPress={() => router.push(`/(tabs)/modules/customer-devices/${data.machine!.id}` as Href)} />
          ) : null}
        </Card>

        <FormSection title="Kanıt dosyaları" hint={`${data.attachments.length} dosya`}>
          <AttachmentsPanel entityType="service_complaint_intake" entityId={data.id} canUpload={editable} />
        </FormSection>

        {phoneUrl ? <Button label="Müşteriyi Ara" variant="ghost" onPress={() => void Linking.openURL(phoneUrl)} /> : null}
        {data.contactEmail ? <Button label="E-posta Gönder" variant="ghost" onPress={() => void Linking.openURL(`mailto:${encodeURIComponent(data.contactEmail!)}`)} /> : null}
        {data.companyId ? <Button label="Firmaya Git" variant="ghost" onPress={() => router.push(`/(tabs)/modules/companies/${data.companyId}` as Href)} /> : null}
        {data.serviceTicket ? (
          <Button label={`${data.serviceTicket.ticketNo} Servis Talebine Git`} onPress={() => router.push(`/(tabs)/modules/service-tickets/${data.serviceTicket!.id}` as Href)} />
        ) : null}

        {canUpdate && data.status === 'new' ? <Button label="İncele" variant="ghost" loading={update.isPending} onPress={markReviewing} /> : null}
        {canCreateTicket && !data.serviceTicket && !closed ? <Button label="Servis aç" loading={convert.isPending} onPress={confirmConvert} /> : null}
        {canUpdate && !closed ? <Button label="Reddet" variant="destructive" onPress={() => rejectionSheet.current?.present()} /> : null}
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
          <View className="gap-1">
            <Text className="font-display-semibold text-base text-foreground">Şikayeti reddet</Text>
            <Text className="font-inter text-xs text-muted-foreground">Gerekçe isteğe bağlıdır ve şikayet kaydında görünür.</Text>
          </View>
          <Field label="Red gerekçesi" value={rejectionNote} onChangeText={setRejectionNote} multiline maxLength={4000} />
          <Button label="Reddet" variant="destructive" loading={reject.isPending} onPress={submitRejection} />
        </BottomSheetView>
      </BottomSheetModal>
    </SafeAreaView>
  );
}
