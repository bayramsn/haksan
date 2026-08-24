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
  useSetTicketStatus,
  useSubmitWarranty,
  useUpdateServiceTicket,
  useUpdateWarrantyAssessment,
} from '@/src/api/operations.hooks';
import { useAuth, useCan } from '@/src/auth/AuthProvider';
import { formatAmount, formatDateTime } from '@/src/lib/format';
import { toneColor, useTheme, type Tone } from '@/src/theme/theme';
import { Button, Card, Chip, DetailHeader, EmptyState, ErrorState, Eyebrow, Field, Loading } from '@/src/ui';
import { toast } from '@/src/ui/toast';
import { InfoRows, ProgressBar, StepTrack, Tabs, type InfoItem, type Step } from '@/src/ui/data';

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
  const done = checks.filter((c) => c.status === 'done').length;
  return (
    <Card className="flex-1 gap-1.5">
      <Eyebrow>Kontrol listesi</Eyebrow>
      <ProgressBar done={done} total={checks.length} />
      <View className="gap-1 pt-0.5">
        {checks.map((c) => (
          <View key={c.id ?? c.label} className="flex-row items-center gap-1.5">
            <Ionicons
              name={c.status === 'done' ? 'checkmark-circle' : c.status === 'na' ? 'remove-circle-outline' : 'ellipse-outline'}
              size={13}
              color={c.status === 'done' ? toneColor(colors, 'success') : colors.mutedForeground}
            />
            <Text className="flex-1 font-inter text-[11px] text-foreground" numberOfLines={1}>
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

  // Tasarımdaki "Talep Alındı → Planlandı → Yolda → Yerinde → Tamamlandı" adımları
  // saha-servisi (kurulum) kavramı; servis talebinde plan/yolda/yerinde alanı yok.
  // Gerçek yaşam döngüsü statü lookup'ından geliyor, StepTrack onu kullanıyor.
  const steps: Step[] = TICKET_PHASES.map((p, index) => ({
    label: TICKET_PHASE_META[p].label,
    at: index === 0 ? ticket.reportedAt : p === 'done' ? ticket.resolvedAt : null,
    done: index < phaseIndex || (p === 'done' && isDone),
    current: index === phaseIndex && p !== 'done',
  }));

  const completeTicket = () => {
    Alert.alert('Talebi tamamla', 'Bu talebi tamamlandı olarak işaretlemek istiyor musunuz?', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Tamamla', onPress: () => applyStatus('resolved') },
    ]);
  };

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <DetailHeader title="Servis Talebi" subtitle={ticket.ticketNo} />

      <View className="px-4 pt-4">
        <Card className="gap-2">
          <View className="flex-row flex-wrap gap-1.5">
            <Chip tone={TICKET_PHASE_META[phase].tone} label={ticket.status?.name ?? TICKET_PHASE_META[phase].label} />
            <Chip tone={severity.tone} label={severity.label} />
            {ticket.warrantyClaim ? <Chip tone="stage" label="Garanti" /> : null}
          </View>
          <Text className="text-[19px] font-inter-semibold leading-[1.2] text-foreground">{ticket.subject}</Text>
          <Text className="font-inter text-[13px] text-muted-foreground">
            {ticket.company?.legalTitle ?? 'Firma bağlanmadı'}
          </Text>
        </Card>
      </View>

      <View className="pt-3">
        <Tabs
          tabs={[
            { value: 'general', label: 'Genel' },
            { value: 'operations', label: 'İşlemler', badge: laborOps.length || undefined },
            { value: 'parts', label: 'Parçalar', badge: partOps.length || undefined },
            { value: 'notes', label: 'Notlar', badge: notes.length || undefined },
            ...(isWarrantyTicket ? [{ value: 'warranty' as const, label: 'Garanti' }] : []),
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>

      <ScrollView contentContainerClassName="gap-4 px-4 pb-10 pt-4">
        {tab === 'general' ? (
          <>
            <Card>
              <InfoRows items={infoItems} />
            </Card>

            <StepTrack steps={steps} />

            {ticket.description || checks.length > 0 ? (
              <View className="flex-row gap-3">
                {ticket.description ? (
                  <Card className="flex-1 gap-1.5">
                    <Eyebrow>Arıza açıklaması</Eyebrow>
                    <Text className="font-inter text-sm leading-[1.4] text-foreground">{ticket.description}</Text>
                  </Card>
                ) : null}
                {checks.length > 0 ? <ChecklistCard checks={checks} /> : null}
              </View>
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

        {/* Alt eylemler her sekmede aynı: sekme yalnız içerik görünümünü değiştirir. */}
        <View className="gap-3">
          {phone || (!isDone && canUpdate) ? (
            <View className="flex-row gap-3">
              {phone ? (
                <View className="flex-1">
                  <Button label="Müşteriyi Ara" variant="ghost" onPress={() => void Linking.openURL(`tel:${phone}`)} />
                </View>
              ) : null}
              {!isDone && canUpdate ? (
                <View className="flex-1">
                  <Button
                    label="Talebi Tamamla"
                    loading={setStatus.isPending}
                    disabled={setStatus.isPending}
                    onPress={completeTicket}
                  />
                </View>
              ) : null}
            </View>
          ) : null}
          <View className="flex-row gap-3">
            {canUpdate ? <View className="flex-1">
              <Button
                label="Durum Değiştir"
                variant="ghost"
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  sheetRef.current?.present();
                }}
              />
            </View> : null}
            {ticket.company?.id ? (
              <View className="flex-1">
                <Button
                  label="Firma Kartı"
                  variant="ghost"
                  onPress={() => router.push(`/(tabs)/modules/companies/${ticket.company!.id}`)}
                />
              </View>
            ) : null}
          </View>
        </View>
      </ScrollView>

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
        </BottomSheetView>
      </BottomSheetModal> : null}
    </SafeAreaView>
  );
}
