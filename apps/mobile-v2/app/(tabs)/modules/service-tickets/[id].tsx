import { useCallback, useRef, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { BottomSheetBackdrop, BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useLookup } from '@/src/api/crm.hooks';
import {
  TICKET_PHASES,
  TICKET_PHASE_META,
  ticketPhase,
  ticketSla,
  useCustomerDevicesByCompany,
  useDecideWarranty,
  useDirectory,
  useServiceTicket,
  useServiceWarranty,
  useDeleteServiceTicket,
  useSetTicketStatus,
  useSubmitWarranty,
  useUpdateServiceTicket,
  useUpdateWarrantyAssessment,
} from '@/src/api/operations.hooks';
import { useAuth, useCan } from '@/src/auth/AuthProvider';
import { formatAmount, formatDateTime } from '@/src/lib/format';
import { chipClass, chipTextClass, toneColor, useTheme, type Tone } from '@/src/theme/theme';
import { Button, Card, Chip, DetailHeader, EmptyState, ErrorState, Eyebrow, Field, Loading } from '@/src/ui';
import { toast } from '@/src/ui/toast';
import { InfoRows, ProgressBar, StepTrack, Tabs, type InfoItem, type Step } from '@/src/ui/data';
import { Logo } from '@/src/ui/Logo';
import { getPdfAndShare } from '@/src/native/files';

const SEVERITY: Record<string, { label: string; tone: Tone }> = {
  critical: { label: 'Kritik', tone: 'destructive' },
  high: { label: 'Acil', tone: 'destructive' },
  normal: { label: 'Orta', tone: 'warning' },
  low: { label: 'Düşük', tone: 'info' },
};

const TICKET_TYPE: Record<string, string> = {
  complaint: 'Şikayet',
  request: 'Talep',
  warranty_claim: 'Garanti talebi',
  question: 'Soru',
};

type DetailTab = 'general' | 'operations' | 'parts' | 'notes' | 'warranty';

function ServiceDetailHeader({ onBack, onMore }: { onBack: () => void; onMore?: () => void }) {
  const { colors } = useTheme();
  return (
    <View className="h-14 flex-row items-center border-b border-border bg-card px-2">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Geri"
        onPress={onBack}
        className="h-11 w-11 items-center justify-center active:opacity-60"
      >
        <Ionicons name="arrow-back" size={24} color={colors.foreground} />
      </Pressable>
      <View className="flex-1 items-center"><Logo width={130} /></View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Talep işlemleri"
        disabled={!onMore}
        onPress={onMore}
        className={`h-11 w-11 items-center justify-center ${onMore ? 'active:opacity-60' : 'opacity-40'}`}
      >
        <Ionicons name="ellipsis-vertical" size={22} color={colors.primary} />
      </Pressable>
    </View>
  );
}

function UnderlineTabs({
  tabs,
  value,
  onChange,
}: {
  tabs: { value: string; label: string; icon: keyof typeof Ionicons.glyphMap }[];
  value: string;
  onChange: (next: string) => void;
}) {
  const { colors } = useTheme();
  return (
    <View className="flex-row border-b border-border bg-card px-2">
      {tabs.map((tab) => {
        const selected = tab.value === value;
        return (
          <Pressable
            key={tab.value}
            onPress={() => onChange(tab.value)}
            className={`flex-1 flex-row items-center justify-center gap-1.5 py-3 border-b-[2px] ${selected ? 'border-primary' : 'border-transparent'}`}
          >
            <Ionicons name={tab.icon} size={16} color={selected ? colors.primary : colors.mutedForeground} />
            <Text className={`font-inter-medium text-[13px] ${selected ? 'text-primary' : 'text-muted-foreground'}`}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* --------------------------------------------------------- metadata okuma ---- */
/**
 * `metadata` sunucuda serbest jsonb — şema garantisi yok. Alanlar web'in aynı
 * ekranı yazarken kullandığı gerçek isimler (bkz. ServicePages.tsx `addOperation`,
 * `completionForm.checks`, `noteHistory`); burada yalnız salt okunur gösteriliyor.
 */
type TicketOperation = {
  id?: string;
  description?: string;
  quantity?: number;
  unitPrice?: number;
  currency?: string;
  kind?: string;
  createdAt?: string;
};
type TicketCheck = { id?: string; label: string; status?: 'done' | 'not_done' | 'na' };
type TicketNote = { id: string; text: string; createdAt?: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

function readOperations(metadata: Record<string, unknown> | null): TicketOperation[] {
  const ops = metadata?.operations;
  return Array.isArray(ops) ? (ops.filter(isRecord) as unknown as TicketOperation[]) : [];
}

/** Parça satırları `kind:'part'`, `srv-part-` önekli id ya da "Parça kullanımı:" açıklamasıyla işaretlenir. */
function isPartOperation(op: TicketOperation): boolean {
  return (
    op.kind === 'part' ||
    Boolean(op.id?.startsWith('srv-part-')) ||
    Boolean(op.description?.toLocaleLowerCase('tr').startsWith('parça kullanımı'))
  );
}

function readChecks(metadata: Record<string, unknown> | null): TicketCheck[] {
  const form = metadata?.completionForm;
  const checks = isRecord(form) ? form.checks : undefined;
  return Array.isArray(checks)
    ? checks.filter((c): c is TicketCheck => isRecord(c) && typeof c.label === 'string')
    : [];
}

function readNotes(metadata: Record<string, unknown> | null): TicketNote[] {
  const notes = metadata?.noteHistory;
  return Array.isArray(notes)
    ? notes.filter((n): n is TicketNote => isRecord(n) && typeof n.id === 'string' && typeof n.text === 'string')
    : [];
}

/* -------------------------------------------------------------- alt bloklar ---- */

/** Tek bilgi satırı: değeri yoksa hiç basılmaz, chevron yalnız gidilecek yer varsa. */
function TicketFactRow({
  icon,
  label,
  value,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string | null;
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  if (!value) return null;
  const body = (
    <View className="flex-row items-center gap-3">
      <Ionicons name={icon} size={18} color={colors.mutedForeground} />
      <Text className="w-24 font-inter text-[13px] text-muted-foreground">{label}</Text>
      <Text className="flex-1 text-right font-inter text-[13px] text-foreground" numberOfLines={1}>{value}</Text>
      {onPress ? <Ionicons name="chevron-forward" size={14} color={colors.mutedForeground} /> : null}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${value}`} onPress={onPress} className="active:opacity-60">
      {body}
    </Pressable>
  );
}

function OperationList({ ops, emptyTitle }: { ops: TicketOperation[]; emptyTitle: string }) {
  if (ops.length === 0) return <EmptyState title={emptyTitle} />;
  return (
    <Card className="gap-0">
      {ops.map((op, index) => {
        const amount = op.quantity && op.unitPrice ? formatAmount(op.quantity * op.unitPrice, op.currency ?? 'TRY') : null;
        return (
          <View key={op.id ?? index} className={`gap-1 py-2.5 ${index > 0 ? 'border-t border-border' : ''}`}>
            <View className="flex-row justify-between gap-3">
              <Text className="flex-1 font-inter text-[14px] text-foreground" numberOfLines={2}>
                {op.description ?? '—'}
              </Text>
              {amount ? <Text className="font-inter-semibold text-[13px] text-foreground">{amount}</Text> : null}
            </View>
            <View className="flex-row gap-2">
              {op.quantity ? <Text className="font-inter text-[11px] text-muted-foreground">{op.quantity} adet</Text> : null}
              {op.createdAt ? (
                <Text className="font-inter text-[11px] text-muted-foreground">{formatDateTime(op.createdAt)}</Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </Card>
  );
}

function ChecklistCard({ checks }: { checks: TicketCheck[] }) {
  const { colors } = useTheme();
  return (
    <Card className="flex-1 gap-2 border-border p-3">
      <Text className="font-inter-semibold text-[13px] text-foreground">Kontrol Listesi</Text>
      {checks.length === 0 ? (
        <Text className="pt-1 font-inter text-[12px] text-muted-foreground">
          Tamamlama formu doldurulmadı.
        </Text>
      ) : null}
      <View className="gap-2 pt-1">
        {checks.map((c, idx) => (
          <View key={c.id ?? idx} className="flex-row items-center gap-2">
            <Ionicons
              name={c.status === 'done' ? 'checkmark-circle' : 'ellipse-outline'}
              size={18}
              color={c.status === 'done' ? toneColor(colors, 'success') : colors.border}
            />
            <Text className="flex-1 font-inter text-[12px] text-foreground" numberOfLines={1}>
              {c.label}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );
}


/* ------------------------------------------------------- garanti paneli ---- */

const WARRANTY_STATUS_META: Record<string, { label: string; tone: Tone }> = {
  draft: { label: 'Taslak', tone: 'neutral' },
  submitted: { label: 'Onayda', tone: 'warning' },
  approved: { label: 'Onaylandı', tone: 'success' },
  rejected: { label: 'Reddedildi', tone: 'destructive' },
  rma_in_progress: { label: 'RMA sürüyor', tone: 'info' },
  closed: { label: 'Kapandı', tone: 'neutral' },
};

function WarrantyPanel({
  ticketId,
  canUpdate,
}: {
  ticketId: string;
  canUpdate: boolean;
}) {
  const { colors } = useTheme();
  const warranty = useServiceWarranty(ticketId);
  const saveAssessment = useUpdateWarrantyAssessment(ticketId);
  const submitClaim = useSubmitWarranty(ticketId);
  const decideClaim = useDecideWarranty(ticketId);
  const canApprove = useCan('service_tickets.approve');
  const canReject = useCan('service_tickets.reject');

  const [failureCategory, setFailureCategory] = useState('');
  const [assessment, setAssessment] = useState('');
  const [rmaNo, setRmaNo] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const hydratedRef = useRef(false);

  const claim = warranty.data ?? null;
  const statusMeta = claim ? WARRANTY_STATUS_META[claim.status] ?? { label: claim.status, tone: 'neutral' as Tone } : null;

  // Sunucu verisi geldiğinde formu bir kez doldur.
  if (claim && !hydratedRef.current) {
    setFailureCategory(claim.failureCategory ?? '');
    setAssessment(claim.technicianAssessment ?? '');
    setRmaNo(claim.rmaNo ?? '');
    setSupplierName(claim.supplierName ?? '');
    hydratedRef.current = true;
  }

  function persist(extra: Record<string, unknown> = {}) {
    saveAssessment.mutate(
      {
        failureCategory: failureCategory.trim() || null,
        technicianAssessment: assessment.trim() || null,
        rmaNo: rmaNo.trim() || null,
        supplierName: supplierName.trim() || null,
        ...extra,
      },
      {
        onSuccess: () => toast.success('Garanti değerlendirmesi kaydedildi'),
        onError: (error) => toast.error(error.message),
      }
    );
  }

  if (warranty.isPending) return <Loading />;
  if (warranty.error) return <ErrorState message={warranty.error.message} onRetry={() => void warranty.refetch()} />;
  if (!claim) return <EmptyState title="Garanti kaydı yok" icon="shield-checkmark-outline" />;

  const editable = canUpdate && (claim.status === 'draft' || claim.status === 'rma_in_progress');

  return (
    <>
      <Card className="gap-2">
        <View className="flex-row items-center justify-between gap-2">
          <Eyebrow>Garanti Talebi</Eyebrow>
          {statusMeta ? <Chip tone={statusMeta.tone} label={statusMeta.label} /> : null}
        </View>
        {claim.rmaNo ? (
          <InfoRows items={[{ label: 'RMA no', value: claim.rmaNo }, { label: 'Tedarikçi', value: claim.supplierName }]} />
        ) : null}
        {claim.costAmount != null || claim.customerChargeAmount != null ? (
          <InfoRows
            items={[
              { label: 'Maliyet', value: claim.costAmount != null ? formatAmount(String(claim.costAmount), claim.costCurrency ?? 'TRY') : null },
              { label: 'Müşteriye yansıyan', value: claim.customerChargeAmount != null ? formatAmount(String(claim.customerChargeAmount), claim.customerChargeCurrency ?? 'TRY') : null },
            ]}
          />
        ) : null}
      </Card>

      {editable ? (
        <Card className="gap-3">
          <Eyebrow>Değerlendirme</Eyebrow>
          <Field label="Arıza kategorisi" value={failureCategory} onChangeText={setFailureCategory} placeholder="Örn. elektronik kart" />
          <Field
            label="Teknisyen değerlendirmesi"
            value={assessment}
            onChangeText={setAssessment}
            multiline
            numberOfLines={3}
            className="min-h-[80px] rounded-control border border-border bg-card px-3.5 py-3 text-base text-foreground"
          />
          <Field label="RMA no" value={rmaNo} onChangeText={setRmaNo} />
          <Field label="Tedarikçi" value={supplierName} onChangeText={setSupplierName} />
          <Button
            label="Değerlendirmeyi Kaydet"
            variant="ghost"
            onPress={() => persist()}
            loading={saveAssessment.isPending}
            disabled={saveAssessment.isPending}
          />
          {claim.status === 'draft' ? (
            <Button
              label="Onaya Gönder"
              onPress={() => submitClaim.mutate(undefined, {
                onSuccess: () => toast.success('Garanti talebi onaya gönderildi'),
                onError: (error) => toast.error(error.message),
              })}
              loading={submitClaim.isPending}
              disabled={submitClaim.isPending}
            />
          ) : null}
        </Card>
      ) : claim.technicianAssessment ? (
        <Card className="gap-1.5">
          <Eyebrow>Teknisyen değerlendirmesi</Eyebrow>
          <Text className="font-inter text-sm leading-[1.4] text-foreground">{claim.technicianAssessment}</Text>
        </Card>
      ) : null}

      {claim.status === 'submitted' && (canApprove || canReject) ? (
        <Card className="gap-2">
          <Eyebrow>Karar</Eyebrow>
          {canApprove ? (
            <Button
              label="Garantiyi Onayla"
              onPress={() => decideClaim.mutate({ decision: 'approved' }, {
                onSuccess: () => toast.success('Garanti talebi onaylandı'),
                onError: (error) => toast.error(error.message),
              })}
              loading={decideClaim.isPending}
              disabled={decideClaim.isPending}
            />
          ) : null}
          {canReject ? (
            <Button
              label="Reddet"
              variant="ghost"
              onPress={() =>
                Alert.alert('Garantiyi Reddet', 'Karar kaydedilecek.', [
                  { text: 'Vazgeç', style: 'cancel' },
                  { text: 'Reddet', style: 'destructive', onPress: () => decideClaim.mutate({ decision: 'rejected' }, {
                    onSuccess: () => toast.success('Garanti talebi reddedildi'),
                    onError: (error) => toast.error(error.message),
                  }) },
                ])
              }
              loading={decideClaim.isPending}
              disabled={decideClaim.isPending}
            />
          ) : null}
          <View style={{ height: colors.lineStrong === '' ? 0 : 4 }} />
        </Card>
      ) : null}

      {claim.parts.length > 0 ? (
        <View className="gap-1.5">
          <View className="px-1"><Eyebrow>Garanti parçaları ({claim.parts.length})</Eyebrow></View>
          <Card className="gap-0">
            {claim.parts.map((part, index) => (
              <View key={part.id} className={`gap-0.5 py-2.5 ${index > 0 ? 'border-t border-border' : ''}`}>
                <View className="flex-row justify-between gap-3">
                  <Text className="flex-1 font-inter-medium text-[13px] text-foreground" numberOfLines={2}>{part.description}</Text>
                  <Text className="font-inter-semibold text-[13px] text-foreground">{Number(part.quantity)}</Text>
                </View>
                {part.actionType ? <Text className="font-inter text-[11px] text-muted-foreground">{part.actionType}</Text> : null}
              </View>
            ))}
          </Card>
        </View>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ ekran ---- */

export default function ServiceTicketDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const sheetRef = useRef<BottomSheetModal>(null);
  const canUpdate = useCan('service_tickets.update');
  const [tab, setTab] = useState<DetailTab>('general');

  const detail = useServiceTicket(id);
  const ticket = detail.data ?? null;
  const isWarrantyTicket = ticket?.ticketType === 'warranty_claim';
  const canCreateEvent = useCan('calendar.create');
  const canDeleteTicket = useCan('service_tickets.delete');
  const removeTicket = useDeleteServiceTicket();
  const [formBusy, setFormBusy] = useState(false);

  /** Sunucu servis formunu PDF olarak GET ile sunuyor (service.controller.ts). */
  async function handleServiceFormPdf() {
    setFormBusy(true);
    try {
      await getPdfAndShare(`/api/v1/service-tickets/${id}/service-form.pdf`, `servis-formu-${id}.pdf`);
    } catch (err) {
      Alert.alert('PDF alınamadı', err instanceof Error ? err.message : 'Servis formu indirilemedi.');
    } finally {
      setFormBusy(false);
    }
  }

  // Garanti akışı: değerlendirme alanları + kararlar
  const warranty = useServiceWarranty(isWarrantyTicket ? id : '');
  const saveAssessment = useUpdateWarrantyAssessment(id);
  const submitClaim = useSubmitWarranty(id);
  const decideClaim = useDecideWarranty(id);
  const updateTicket = useUpdateServiceTicket(id);
  const [resolutionDraft, setResolutionDraft] = useState('');
  const [editingResolution, setEditingResolution] = useState(false);

  const statuses = useLookup('service-ticket-statuses');
  const setStatus = useSetTicketStatus();
  const { user: me } = useAuth();
  // Makine adı: sunucu customerDeviceId'yi joinlemiyor, web'in yaptığı gibi ayrı
  // bir referans listesinden .find() ile çözülüyor — yalnız bu firmanın cihazları.
  const deviceList = useCustomerDevicesByCompany(ticket?.companyId);
  // Atanan teknisyen: /chat/directory kurum içi herkese açık (izin gerekmez), ama
  // oturum sahibini listeden hariç tutuyor — kendi biletine bakan kullanıcı için
  // useAuth()'tan gelen isim öncelikli, aşağıda ayrıca çözülüyor.
  const directory = useDirectory();

  const applyStatus = useCallback(
    (statusCode: string) => {
      sheetRef.current?.dismiss();
      setStatus.mutate(
        { id, statusCode },
        { onError: (err) => Alert.alert('Durum değiştirilemedi', (err as Error).message) }
      );
    },
    [id, setStatus]
  );

  if (detail.isPending) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
        <DetailHeader title="Servis Talebi" />
        <Loading />
      </SafeAreaView>
    );
  }

  if (detail.error || !ticket) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
        <DetailHeader title="Servis Talebi" />
        <ErrorState message={detail.error?.message ?? 'Kayıt bulunamadı.'} onRetry={() => void detail.refetch()} />
      </SafeAreaView>
    );
  }

  const severity = SEVERITY[ticket.severity] ?? { label: ticket.severity, tone: 'neutral' as Tone };
  const phone = ticket.sourceComplaint?.contactPhone ?? null;
  const phase = ticketPhase(ticket);
  const phaseIndex = TICKET_PHASES.indexOf(phase);
  const isDone = phase === 'done';

  const operations = readOperations(ticket.metadata);
  const laborOps = operations.filter((op) => !isPartOperation(op));
  const partOps = operations.filter(isPartOperation);
  const checks = readChecks(ticket.metadata);
  const notes = readNotes(ticket.metadata);

  const device = deviceList.data?.items.find((d) => d.id === ticket.customerDeviceId);
  const machineName = device
    ? [device.productModelName ?? device.model, device.serialNumber].filter(Boolean).join(' · ') || null
    : null;

  const assignedName = !ticket.assignedToUserId
    ? null
    : ticket.assignedToUserId === me?.id
      ? me.fullName
      : (directory.data?.find((u) => u.id === ticket.assignedToUserId)?.fullName ?? null);

  const sla = ticketSla(ticket);
  const statusLabel = ticket.status?.name ?? TICKET_PHASE_META[phase].label;

  const infoItems: InfoItem[] = [
    { label: 'Müşteri', value: ticket.company?.legalTitle },
    { label: 'Makine', value: machineName },
    { label: 'Konu', value: ticket.subject },
    { label: 'Talep Tarihi', value: formatDateTime(ticket.reportedAt) },
    { label: 'SLA Bitişi', value: sla?.text, tone: sla?.overdue ? 'destructive' : undefined },
    { label: 'Durum', value: ticket.status?.name ?? TICKET_PHASE_META[phase].label },
    { label: 'Atanan Teknisyen', value: assignedName },
    { label: 'Tür', value: TICKET_TYPE[ticket.ticketType] ?? ticket.ticketType },
    { label: 'Kaynak', value: ticket.source },
    { label: 'İletişim', value: ticket.contact?.fullName ?? ticket.sourceComplaint?.contactName },
    { label: 'Çözüm Tarihi', value: ticket.resolvedAt ? formatDateTime(ticket.resolvedAt) : null },
    { label: 'Şikayet No', value: ticket.sourceComplaint?.complaintNo },
    { label: 'RMA', value: ticket.warrantyClaim?.rmaNo },
  ];
  // İlk 7 alan yukarıdaki tasarım kartında elle basılıyor; kalanı ikincil kartta.
  const secondaryInfoItems = infoItems.slice(7);

  // Sunucudaki gerçek 4 durum (TICKET_PHASES) — mockup'taki 5 adımlık
  // "Talep Alındı → Planlandı → Yolda → Yerinde" akışının sunucuda karşılığı yok.
  const steps: Step[] = TICKET_PHASES.map((code, index) => ({
    label: TICKET_PHASE_META[code].label,
    done: index < phaseIndex || isDone,
    current: index === phaseIndex && !isDone,
  }));

  const completeTicket = () => {
    Alert.alert('Talebi tamamla', 'Bu talebi tamamlandı olarak işaretlemek istiyor musunuz?', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Tamamla', onPress: () => applyStatus('resolved') },
    ]);
  };

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <ServiceDetailHeader
        onBack={() => router.back()}
        onMore={canUpdate ? () => sheetRef.current?.present() : undefined}
      />

      <View className="bg-card pb-4">
        <View className="gap-4 px-4 pt-4">
          <View className="gap-1">
            <Text className="font-inter text-[12px] text-muted-foreground">Servis Talep Kodu</Text>
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-2">
                <Text className="font-inter-bold text-[22px] text-foreground">{ticket.ticketNo}</Text>
                <View className={`rounded-[4px] border px-1.5 py-0.5 ${chipClass[severity.tone]}`}>
                  <Text className={`font-inter-medium text-[11px] ${chipTextClass[severity.tone]}`}>{severity.label}</Text>
                </View>
              </View>
              <View className="flex-row items-center gap-1.5 rounded-full border border-border px-2 py-1 bg-card">
                <View className="h-2 w-2 rounded-full" style={{ backgroundColor: toneColor(colors, TICKET_PHASE_META[phase].tone) }} />
                <Text className="font-inter-medium text-[12px] text-foreground">{statusLabel}</Text>
              </View>
            </View>
          </View>

          <View className="rounded-[16px] border border-border bg-card">
            <View className="gap-3 p-4">
              <TicketFactRow
                icon="person-outline"
                label="Müşteri"
                value={ticket.company?.legalTitle}
                onPress={ticket.company?.id ? () => router.push(`/(tabs)/modules/companies/${ticket.company!.id}`) : undefined}
              />
              <TicketFactRow
                icon="hardware-chip-outline"
                label="Makine"
                value={machineName}
                onPress={ticket.customerDeviceId ? () => router.push(`/(tabs)/modules/customer-devices/${ticket.customerDeviceId}`) : undefined}
              />
              <View className="flex-row items-center gap-3">
                <Ionicons name="pricetag-outline" size={18} color={colors.mutedForeground} />
                <Text className="w-24 font-inter text-[13px] text-muted-foreground">Konu</Text>
                <Text className="flex-1 text-right font-inter text-[13px] text-foreground" numberOfLines={1}>{ticket.subject}</Text>
              </View>
            </View>
            
            <View className="h-[1px] bg-border" />
            
            <View className="gap-3 p-4">
              <View className="flex-row items-center gap-3">
                <Ionicons name="calendar-outline" size={18} color={colors.mutedForeground} />
                <Text className="w-24 font-inter text-[13px] text-muted-foreground">Talep Tarihi</Text>
                <Text className="flex-1 text-right font-inter text-[13px] text-foreground" numberOfLines={1}>{formatDateTime(ticket.reportedAt)}</Text>
              </View>
              {sla ? (
                <View className="flex-row items-center gap-3">
                  <Ionicons name="alarm-outline" size={18} color={colors.mutedForeground} />
                  <Text className="w-24 font-inter text-[13px] text-muted-foreground">SLA</Text>
                  <Text
                    className="flex-1 text-right font-inter-semibold text-[13px]"
                    numberOfLines={1}
                    style={{ color: sla.overdue ? colors.destructive : colors.foreground }}
                  >
                    {sla.text}
                  </Text>
                </View>
              ) : null}
              <View className="flex-row items-center gap-3">
                <Ionicons name="time-outline" size={18} color={colors.mutedForeground} />
                <Text className="w-24 font-inter text-[13px] text-muted-foreground">Durum</Text>
                <View className="flex-1 flex-row items-center justify-end gap-1.5">
                  <View className="h-2 w-2 rounded-full" style={{ backgroundColor: toneColor(colors, TICKET_PHASE_META[phase].tone) }} />
                  <Text className="text-right font-inter text-[13px] text-foreground" numberOfLines={1}>{statusLabel}</Text>
                </View>
              </View>
              <TicketFactRow icon="person-outline" label="Atanan Tekniker" value={assignedName} />
            </View>
          </View>
        </View>
        <View className="mt-4">
          <UnderlineTabs
            tabs={[
              { value: 'general', label: 'Genel', icon: 'list-outline' },
              { value: 'operations', label: 'İşlemler', icon: 'pulse-outline' },
              { value: 'parts', label: 'Parçalar', icon: 'cube-outline' },
              { value: 'notes', label: 'Notlar', icon: 'document-text-outline' },
              // Garanti paneli yalnız garanti talebinde anlamlı; listeye eklenmezse
              // yazılmış panel hiç açılamıyordu.
              ...(isWarrantyTicket
                ? [{ value: 'warranty', label: 'Garanti', icon: 'shield-checkmark-outline' as const }]
                : []),
            ]}
            value={tab}
            onChange={(val) => setTab(val as DetailTab)}
          />
        </View>
      </View>

      <ScrollView contentContainerClassName="gap-4 px-4 pb-10 pt-4">
        {tab === 'general' ? (
          <>
            <Card className="gap-3">
              <Text className="font-inter-semibold text-[14px] text-foreground">Talep İlerleme Durumu</Text>
              <StepTrack steps={steps} />
            </Card>

            {/* Mockup'taki Arıza ve Kontrol kartları */}
            <View className="flex-row gap-3">
              <Card className="flex-1 gap-1 border-border p-3">
                <Text className="font-inter-semibold text-[13px] text-foreground">Arıza Açıklaması</Text>
                <Text className="mt-1 font-inter text-[12px] leading-[18px] text-foreground" numberOfLines={4}>
                  {ticket.description ?? 'Arıza açıklaması girilmemiş.'}
                </Text>
              </Card>
              <ChecklistCard checks={checks} />
            </View>
            
            {/* Kullanılan parçalar — `metadata.operations` içindeki parça satırları. */}
            <Card className="gap-0 border-border p-0">
              <View className="flex-row items-center justify-between p-3">
                <Text className="font-inter-semibold text-[13px] text-foreground">Ekli Parçalar / Görevler</Text>
                {partOps.length > 3 ? (
                  <Pressable accessibilityRole="button" onPress={() => setTab('parts')} className="flex-row items-center gap-1 active:opacity-60">
                    <Text className="font-inter-medium text-[12px] text-primary">Tümünü Gör</Text>
                    <Ionicons name="chevron-forward" size={14} color={colors.primary} />
                  </Pressable>
                ) : null}
              </View>
              {partOps.length === 0 ? (
                <View className="px-3 pb-3">
                  <Text className="font-inter text-[12px] text-muted-foreground">Bu talebe parça kaydı eklenmemiş.</Text>
                </View>
              ) : (
                partOps.slice(0, 3).map((op, index) => (
                  <View key={op.id ?? index} className={`flex-row items-center gap-3 px-3 py-2.5 ${index > 0 ? 'border-t border-border' : ''}`}>
                    <View className="h-10 w-10 items-center justify-center rounded-[8px] bg-muted">
                      <Ionicons name="cube-outline" size={20} color={colors.foreground} />
                    </View>
                    <View className="flex-1 gap-0.5">
                      <Text className="font-inter-medium text-[13px] text-foreground" numberOfLines={2}>
                        {op.description ?? 'Parça'}
                      </Text>
                      {op.createdAt ? (
                        <Text className="font-inter text-[11px] text-muted-foreground">{formatDateTime(op.createdAt)}</Text>
                      ) : null}
                    </View>
                    {op.quantity ? (
                      <View className="rounded-[4px] bg-muted px-1.5 py-0.5">
                        <Text className="font-inter text-[11px] text-foreground">{op.quantity} Adet</Text>
                      </View>
                    ) : null}
                  </View>
                ))
              )}
            </Card>

            {/* Kaynak, tür, şikayet/RMA no gibi ikincil alanlar — web servis kartında da var. */}
            {secondaryInfoItems.some((item) => item.value) ? (
              <Card>
                <InfoRows items={secondaryInfoItems} />
              </Card>
            ) : null}

            {ticket.company?.id ? (
              <Button
                label="Firma Kartı"
                variant="ghost"
                trailingIcon="arrow-forward"
                onPress={() => router.push(`/(tabs)/modules/companies/${ticket.company!.id}`)}
              />
            ) : null}
          </>
        ) : null}

        {tab === 'operations' ? <OperationList ops={laborOps} emptyTitle="İşlem kaydı yok" /> : null}
        {tab === 'parts' ? <OperationList ops={partOps} emptyTitle="Parça kaydı yok" /> : null}


        {tab === 'warranty' && isWarrantyTicket ? (
          <WarrantyPanel
            ticketId={id}
            canUpdate={canUpdate}
          />
        ) : null}
        {tab === 'notes' ? (
          <>
            {ticket.resolutionNote && !editingResolution ? (
              <Card className="gap-1.5">
                <View className="flex-row items-center justify-between gap-2">
                  <Eyebrow>Çözüm notu</Eyebrow>
                  {canUpdate && !isDone ? (
                    <Pressable accessibilityRole="button" onPress={() => setEditingResolution(true)} hitSlop={8} className="active:opacity-60">
                      <Text className="font-inter-medium text-xs text-primary">Düzenle</Text>
                    </Pressable>
                  ) : null}
                </View>
                <Text className="font-inter text-sm leading-[1.4] text-foreground">{ticket.resolutionNote}</Text>
              </Card>
            ) : null}
            {canUpdate && (!ticket.resolutionNote || editingResolution) && !isDone ? (
              <Card className="gap-2">
                <Eyebrow>{ticket.resolutionNote ? 'Çözüm notunu düzenle' : 'Çözüm notu ekle'}</Eyebrow>
                <Field
                  label="Çözüm notu"
                  value={resolutionDraft}
                  onChangeText={setResolutionDraft}
                  multiline
                  numberOfLines={3}
                  className="min-h-[80px] rounded-control border border-border bg-card px-3.5 py-3 text-base text-foreground"
                  autoFocus={Boolean(ticket.resolutionNote)}
                />
                <Button
                  label="Kaydet"
                  loading={updateTicket.isPending}
                  disabled={updateTicket.isPending || !resolutionDraft.trim()}
                  onPress={() =>
                    updateTicket.mutate(
                      { resolutionNote: resolutionDraft.trim() },
                      {
                        onSuccess: () => {
                          setEditingResolution(false);
                          toast.success('Çözüm notu kaydedildi');
                        },
                        onError: (error) => toast.error(error.message),
                      }
                    )
                  }
                />
              </Card>
            ) : null}
            {notes.length > 0 ? (
              <Card className="gap-0">
                {notes.map((note, index) => (
                  <View key={note.id} className={`gap-1 py-2.5 ${index > 0 ? 'border-t border-border' : ''}`}>
                    <Text className="font-inter text-sm text-foreground">{note.text}</Text>
                    {note.createdAt ? (
                      <Text className="font-inter text-[11px] text-muted-foreground">{formatDateTime(note.createdAt)}</Text>
                    ) : null}
                  </View>
                ))}
              </Card>
            ) : null}
            {!ticket.resolutionNote && notes.length === 0 ? <EmptyState title="Not yok" /> : null}
          </>
        ) : null}

      </ScrollView>

      {phone || canUpdate ? (
      <View className="flex-row gap-2 border-t border-border bg-card px-4 py-3">
        {phone ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Müşteriyi ara"
            onPress={() => void Linking.openURL(`tel:${phone}`)}
            className="flex-1 flex-row items-center justify-center gap-2 rounded-[8px] border border-border bg-card active:opacity-60"
          >
            <Ionicons name="call-outline" size={18} color={colors.primary} />
            <Text className="font-inter-semibold text-[13px] text-foreground">Müşteriyi Ara</Text>
          </Pressable>
        ) : null}

        {canCreateEvent ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Servis randevusu planla"
            onPress={() =>
              router.push({
                pathname: '/modal/calendar-event',
                params: {
                  eventType: 'service',
                  title: `${ticket.ticketNo} · ${ticket.subject}`,
                  ...(ticket.companyId ? { companyId: ticket.companyId } : {}),
                  ...(ticket.contactId ? { contactId: ticket.contactId } : {}),
                },
              })
            }
            className="flex-1 flex-row items-center justify-center gap-2 rounded-[8px] border border-border bg-card active:opacity-60"
          >
            <Ionicons name="calendar-outline" size={18} color={colors.primary} />
            <Text className="font-inter-semibold text-[13px] text-foreground">Planla</Text>
          </Pressable>
        ) : null}

        <Pressable
          accessibilityRole="button"
          disabled={setStatus.isPending}
          onPress={completeTicket}
          className="flex-1 flex-row items-center justify-center gap-2 rounded-[8px] bg-primary active:opacity-80"
        >
          <Ionicons name="checkmark-circle-outline" size={18} color={colors.primaryForeground} />
          <Text className="font-inter-semibold text-[13px] text-primary-foreground">Talebi Tamamla</Text>
        </Pressable>
      </View>
      ) : null}

      {canUpdate ? <BottomSheetModal
        ref={sheetRef}
        enableDynamicSizing
        backgroundStyle={{ backgroundColor: colors.card }}
        handleIndicatorStyle={{ backgroundColor: colors.mutedForeground }}
        backdropComponent={(props) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />}
      >
        <BottomSheetView className="gap-2 px-5 pb-10 pt-2">
          <Text className="mb-2 font-inter-semibold text-base text-foreground">Talep durumu</Text>
          {(statuses.data ?? []).map((status) => (
            <Button
              key={status.id}
              label={status.name}
              variant={status.id === ticket.status?.id ? 'primary' : 'ghost'}
              disabled={setStatus.isPending || updateTicket.isPending}
              onPress={() => applyStatus(status.code)}
            />
          ))}

          {/* Teknisyen atama: web talep düzenlemesiyle aynı uç (assignedToUserId). */}
          {directory.data && directory.data.length > 0 ? (
            <>
              <Text className="mt-3 font-inter-semibold text-base text-foreground">Teknisyen ata</Text>
              {directory.data.map((person) => (
                <Button
                  key={person.id}
                  label={ticket.assignedToUserId === person.id ? `• ${person.fullName}` : person.fullName}
                  variant={ticket.assignedToUserId === person.id ? 'primary' : 'ghost'}
                  disabled={updateTicket.isPending}
                  onPress={() =>
                    updateTicket.mutate(
                      { assignedToUserId: person.id },
                      {
                        onSuccess: () => toast.success(`${person.fullName} atandı`),
                        onError: (error) => toast.error(error.message),
                      }
                    )
                  }
                />
              ))}
              {ticket.assignedToUserId ? (
                <Button
                  label="Atamayı Kaldır"
                  variant="ghost"
                  disabled={updateTicket.isPending}
                  onPress={() =>
                    updateTicket.mutate(
                      { assignedToUserId: null },
                      {
                        onSuccess: () => toast.success('Atama kaldırıldı'),
                        onError: (error) => toast.error(error.message),
                      }
                    )
                  }
                />
              ) : null}
            </>
          ) : null}

          <Text className="mt-3 font-inter-semibold text-base text-foreground">Belge</Text>
          <Button
            label="Servis Formu (PDF)"
            variant="ghost"
            loading={formBusy}
            disabled={formBusy}
            onPress={() => void handleServiceFormPdf()}
          />

          {canDeleteTicket ? (
            <Button
              label="Talebi Sil"
              variant="destructive"
              loading={removeTicket.isPending}
              disabled={removeTicket.isPending}
              onPress={() => {
                sheetRef.current?.dismiss();
                Alert.alert('Talebi sil', `${ticket.ticketNo} kalıcı olarak silinecek.`, [
                  { text: 'Vazgeç', style: 'cancel' },
                  {
                    text: 'Sil',
                    style: 'destructive',
                    onPress: () =>
                      removeTicket.mutate(id, {
                        onSuccess: () => {
                          toast.success('Talep silindi');
                          router.back();
                        },
                        onError: (err) => Alert.alert('Silinemedi', err.message),
                      }),
                  },
                ]);
              }}
            />
          ) : null}
        </BottomSheetView>
      </BottomSheetModal> : null}
    </SafeAreaView>
  );
}
