import { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BottomSheetBackdrop, BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  useActivityList,
  useCloseOpportunity,
  useDecideOpportunityApproval,
  useDeferOpportunity,
  useDeleteOpportunity,
  useOpportunity,
  useOpportunityAssignees,
  useReopenOpportunity,
  useSetProcessCheck,
  useQuoteList,
  useSetQualificationStage,
  useUpdateOpportunity,
} from '@/src/api/crm.hooks';
import {
  LEAD_FOLLOW_UP_STATUSES,
  OPPORTUNITY_APPROVAL_TYPES,
  QUALIFICATION_STAGES,
  leadFollowUpStatusLabels,
  opportunityApprovalTypeLabels,
  qualificationStageLabels,
  type LeadFollowUpStatus,
  type OpportunityApprovalType,
  type QualificationStage,
  type QuoteListItem,
} from '@/src/api/endpoints';
import { formatAmount, formatDate, formatDateTime, parseLocalDateTime } from '@/src/lib/format';
import { toast } from '@/src/ui/toast';
import { useTheme } from '@/src/theme/theme';
import { Logo } from '@/src/ui/Logo';
import { Button, Card, Chip, DetailHeader, ErrorState, Eyebrow, Field, ListRow, Loading, SCREEN_PAD } from '@/src/ui';
import { InfoRows, ProgressBar } from '@/src/ui/data';
import { useCan } from '@/src/auth/AuthProvider';
import { LOST_REASONS, neighborIds, qualificationRank } from '@/src/ui/sales/sales-logic';
import { getOpportunityOrder } from '@/src/ui/sales/opportunity-order';
import {
  CompanyLinkCard,
  LeadConversionCard,
  OperationStageCard,
  OpportunityActivityFeed,
  OpportunityDocuments,
  QuickContactRow,
  useCheckNoteSheet,
} from '@/src/ui/sales/OpportunityWorkspace';
import { DateTextField } from '@/src/ui/select/DateTextField';

/**
 * Teklif durumu → rozet rengi. `approved` = SATILDI: fırsatın WIN'e geçmesinin
 * tek kanıtı budur (sunucu `quotes.approved_at` arar).
 */
const QUOTE_STATUS_TONE: Record<string, 'neutral' | 'info' | 'success' | 'warning' | 'destructive'> = {
  draft: 'neutral',
  sent: 'info',
  approved: 'success',
  rejected: 'destructive',
  expired: 'destructive',
  cancelled: 'destructive',
  pending_super_admin_approval: 'warning',
  price_waiting: 'warning',
  budget_waiting: 'warning',
  on_hold: 'warning',
  postponed: 'warning',
};

/** Satılan teklif = onaylanmış teklif. Web'deki `evidence.hasApprovedQuote` ile aynı kural. */
const isSoldQuote = (quote: QuoteListItem) => quote.status?.code === 'approved';

/**
 * Modül ızgarası: sunucuda modül başına gerçek SAYI (kaç teklif/sevkiyat...)
 * döndüren bir uç yok — yalnızca `processReadiness.checks` üzerinden var/yok
 * kanıtı var (opportunities.service.ts `processEvidence`). Bu yüzden rozet sayı
 * değil nokta; Aktiviteler tek gerçek sayaçtır (activities.list total).
 * Kutular ilgili modül ekranını açar ve liste fırsata daraltılmaz — teklif
 * dışındaki uçlar `opportunityId` ile süzülemiyor. Teklifler ayrıca yukarıdaki
 * "Teklifler" kartında fırsata daraltılmış olarak listelenir.
 */
const MODULE_TILES: { key: string; label: string; icon: keyof typeof Ionicons.glyphMap; route: string }[] = [
  { key: 'quote', label: 'Teklifler', icon: 'document-text-outline', route: '/(tabs)/modules/quotes' },
  { key: 'proforma', label: 'Proforma', icon: 'receipt-outline', route: '/(tabs)/modules/documents' },
  { key: 'stock', label: 'Stok', icon: 'cube-outline', route: '/(tabs)/modules/inventory' },
  { key: 'commercial_invoice', label: 'Finans', icon: 'stats-chart', route: '/(tabs)/modules/invoices' },
  { key: 'shipment', label: 'Sevkiyat', icon: 'car-outline', route: '/(tabs)/modules/shipments' },
  { key: 'installation', label: 'Kurulum', icon: 'build-outline', route: '/(tabs)/modules/installations' },
];

function OpportunityHeader({ onMore }: { onMore?: () => void }) {
  const router = useRouter();
  const { colors } = useTheme();
  return (
    <View className="h-[62px] flex-row items-center border-b border-border bg-card px-3">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Geri"
        onPress={() => router.back()}
        className="h-11 w-11 items-center justify-center active:opacity-60"
      >
        <Ionicons name="arrow-back" size={27} color={colors.foreground} />
      </Pressable>
      <View className="flex-1 items-center">
        <Logo width={154} />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Fırsat işlemleri"
        accessibilityState={{ disabled: !onMore }}
        disabled={!onMore}
        onPress={onMore}
        className="h-11 w-11 items-center justify-center active:opacity-60"
      >
        <Ionicons name="ellipsis-vertical" size={24} color={onMore ? colors.primary : colors.mutedForeground} />
      </Pressable>
    </View>
  );
}

function OpportunityFact({
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
  const content = (
    <View className="min-h-[50px] flex-row items-center gap-3 border-b border-border py-2.5">
      <Ionicons name={icon} size={21} color={colors.mutedForeground} />
      <Text className="w-[82px] font-inter text-[14px] text-muted-foreground">{label}</Text>
      <Text className="flex-1 text-right font-inter-medium text-[14px] text-foreground" numberOfLines={2}>{value}</Text>
      {onPress ? <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} /> : null}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${value}`} onPress={onPress} className="active:opacity-60">
      {content}
    </Pressable>
  );
}

function OpportunityModuleTile({
  icon,
  label,
  count,
  available,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  count?: number;
  available?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={count ? `${label} (${count})` : label}
      onPress={onPress}
      className="h-[106px] flex-1 items-center justify-center gap-2 rounded-[14px] border border-border bg-card px-1 active:opacity-70"
      style={{ borderCurve: 'continuous', boxShadow: '0 2px 8px rgba(15, 23, 42, 0.06)' }}
    >
      <View className="relative">
        <Ionicons name={icon} size={31} color={colors.primary} />
        {count !== undefined && count > 0 ? (
          <View className="absolute -right-3 -top-2 min-w-[21px] items-center rounded-full bg-primary px-1 py-0.5">
            <Text className="font-inter-bold text-[11px] text-primary-foreground">{count}</Text>
          </View>
        ) : available ? (
          <View className="absolute -right-2 -top-1 h-2.5 w-2.5 rounded-full border-2 border-card bg-primary" />
        ) : null}
      </View>
      <Text className="text-center font-inter-medium text-[13px] text-foreground" numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

export default function OpportunityDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const sheetRef = useRef<BottomSheetModal>(null);
  const canUpdate = useCan('opportunities.update');
  const canApprove = useCan('opportunities.approve');
  const canReadAssignees = useCan('opportunities.create');
  const canDelete = useCan('opportunities.delete');
  const canReadCompanies = useCan('companies.read');
  const canCreateQuote = useCan('quotes.create');
  const checkNote = useCheckNoteSheet(id);
  const neighbors = useMemo(() => neighborIds(getOpportunityOrder(), id), [id]);

  // Aşama sayfası: hedef aşama + LOST için zorunlu kayıp alanları
  const [targetStage, setTargetStage] = useState<QualificationStage | null>(null);
  const [lostReasonCode, setLostReasonCode] = useState<string | null>(null);
  const [lostProductName, setLostProductName] = useState('');
  const [lostUnmetConditions, setLostUnmetConditions] = useState('');
  const [competitorName, setCompetitorName] = useState('');
  const [competitorModel, setCompetitorModel] = useState('');
  const [stageNote, setStageNote] = useState('');
  const [stageError, setStageError] = useState<string | null>(null);

  const { data, isPending, error, refetch } = useOpportunity(id);
  const activityList = useActivityList({ opportunityId: id });
  // Fırsata bağlı teklifler: WIN kararının dayanağı. Sunucu `opportunityId`
  // filtresini destekliyor, liste istemcide süzülmüyor.
  const quoteList = useQuoteList({ opportunityId: id });
  const assignees = useOpportunityAssignees(canReadAssignees);
  const setStage = useSetQualificationStage();
  const setCheck = useSetProcessCheck();
  const decideApproval = useDecideOpportunityApproval();
  const closeCase = useCloseOpportunity();
  const deferCase = useDeferOpportunity();
  const reopenCase = useReopenOpportunity();
  const updateOpp = useUpdateOpportunity();
  const deleteOpp = useDeleteOpportunity();

  // Sonraki aksiyon hızlı düzenleme (web NextActionDialog karşılığı)
  const actionSheetRef = useRef<BottomSheetModal>(null);
  const deferSheetRef = useRef<BottomSheetModal>(null);
  const closeSheetRef = useRef<BottomSheetModal>(null);
  const [actionText, setActionText] = useState('');
  const [actionAt, setActionAt] = useState('');
  const [deferReason, setDeferReason] = useState('');
  const [deferAction, setDeferAction] = useState('Müşteriyi tekrar ara');
  const [deferAt, setDeferAt] = useState(() => defaultFollowUpDateTime());
  const [closeReason, setCloseReason] = useState('');

  // Kart işlemleri (⋮): sonraki aksiyon, sorumlu, ilk temas durumu, ödeme vadesi, silme
  const moreSheetRef = useRef<BottomSheetModal>(null);
  const ownerSheetRef = useRef<BottomSheetModal>(null);
  const followUpSheetRef = useRef<BottomSheetModal>(null);
  const termSheetRef = useRef<BottomSheetModal>(null);
  const [termDays, setTermDays] = useState('');

  const patch = useCallback(
    (body: Parameters<typeof updateOpp.mutate>[0], done?: () => void) =>
      updateOpp.mutate(body, {
        onSuccess: () => {
          done?.();
          toast.success('Fırsat güncellendi');
        },
        onError: (err) => Alert.alert('Güncellenemedi', err.message),
      }),
    [updateOpp]
  );

  function openActionSheet() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActionText(data?.nextAction ?? '');
    setActionAt(data?.nextActionAt ? formatInputDateTime(data.nextActionAt) : '');
    actionSheetRef.current?.present();
  }

  function submitAction() {
    const at = actionAt.trim() ? parseLocalDateTime(actionAt) : null;
    if (actionAt.trim() && !at) {
      Alert.alert('Biçim hatası', 'Takvim zamanı YYYY-AA-GG SS:DD biçiminde olmalı.');
      return;
    }
    if (!actionText.trim()) {
      Alert.alert('Aksiyon gerekli', 'Takvim zamanı girmek için önce aksiyon yazın.');
      return;
    }
    updateOpp.mutate(
      {
        id,
        nextAction: actionText.trim(),
        ...(at ? { nextActionAt: at.toISOString() } : {}),
      },
      {
        onSuccess: () => {
          actionSheetRef.current?.dismiss();
          toast.success('Sonraki aksiyon kaydedildi');
        },
        onError: (error) => toast.error(error.message),
      }
    );
  }

  /** Aşama seçimi: LOST seçilirse web LostCaseDialog'unun zorunlu alanları açılır. */
  const chooseStage = useCallback((option: QualificationStage | null) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTargetStage(option);
    setLostReasonCode(null);
    setLostProductName('');
    setLostUnmetConditions('');
    setCompetitorName('');
    setCompetitorModel('');
    setStageNote('');
    setStageError(null);
  }, []);

  const applyStage = useCallback(
    (stage: QualificationStage) => {
      // Web ile aynı zorunluluklar (LostCaseDialog submit doğrulaması).
      if (stage === 'lost' && (!lostReasonCode || !lostProductName.trim() || !lostUnmetConditions.trim())) {
        setStageError('Kayıp nedeni, kaybedilen ürün ve karşılanamayan şartlar zorunludur.');
        return;
      }
      sheetRef.current?.dismiss();
      setStage.mutate(
        {
          id,
          toStage: stage,
          ...(stage === 'lost'
            ? {
                cancellationReasonCode: lostReasonCode!,
                lostProductName: lostProductName.trim(),
                lostUnmetConditions: lostUnmetConditions.trim(),
                ...(competitorName.trim() ? { lostCompetitorName: competitorName.trim() } : {}),
                ...(competitorModel.trim() ? { lostCompetitorProductModel: competitorModel.trim() } : {}),
              }
            : stageNote.trim()
              ? { note: stageNote.trim() }
              : {}),
        },
        {
          // Sunucu geçiş kurallarını doğruluyor; reddi kullanıcıya aynen göster.
          onError: (err) => Alert.alert('Aşama değiştirilemedi', err.message),
        }
      );
    },
    [id, setStage, lostReasonCode, lostProductName, lostUnmetConditions, competitorName, competitorModel, stageNote]
  );

  if (isPending || error || !data) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
        <DetailHeader title="Fırsat" />
        {isPending ? <Loading /> : <ErrorState message={error?.message ?? 'Kayıt yüklenemedi.'} onRetry={() => void refetch()} />}
      </SafeAreaView>
    );
  }

  const stage = (QUALIFICATION_STAGES.includes(data.qualificationStage as QualificationStage) ? data.qualificationStage : 'lead') as QualificationStage;

  const company = data.company?.legalTitle ?? data.leadCompanyTitle ?? null;
  const contactName = data.primaryContact?.fullName ?? data.leadContactName ?? null;
  const phone = data.leadPhone;
  const ownerName = data.ownerUserId ? assignees.data?.find((a) => a.id === data.ownerUserId)?.name ?? null : null;
  const opportunityQuotes = quoteList.data?.items ?? [];
  const soldQuotes = opportunityQuotes.filter(isSoldQuote);
  const followUpStatus = (LEAD_FOLLOW_UP_STATUSES as readonly string[]).includes(data.leadFollowUpStatus ?? '')
    ? (data.leadFollowUpStatus as LeadFollowUpStatus)
    : null;
  const followUpLabel = followUpStatus ? leadFollowUpStatusLabels[followUpStatus] : null;
  const trelloMeta = (data.externalMetadata ?? {}) as Record<string, unknown>;
  const trelloText = (key: string) => (typeof trelloMeta[key] === 'string' ? (trelloMeta[key] as string) : null);

  const checks = data.qualificationReadiness?.checks ?? [];
  const checklistDone = checks.filter((c) => c.complete).length;
  const evidenceByKey = new Map(data.processReadiness?.checks.map((c) => [c.key, c.complete]) ?? []);
  const activityCount = activityList.data?.total ?? 0;

  // Arşiv durumu + onay haritası (web SalesCaseDetail ile aynı kaynaklar)
  const isClosed = Boolean(data.closedAt);
  const approvals = data.approvals ?? {};
  const pendingApprovals = OPPORTUNITY_APPROVAL_TYPES.filter((type) => approvals[type] === 'pending');
  const settledApprovals = OPPORTUNITY_APPROVAL_TYPES.filter((type) => approvals[type] && approvals[type] !== 'pending');

  /** Geriye geçiş web'de zorunlu gerekçe ister; aynı kural istemcide uygulanır. */
  const isBackwardMove =
    targetStage !== null &&
    !['win', 'lost'].includes(targetStage) &&
    qualificationRank(targetStage) < qualificationRank(stage);

  function toggleCheck(key: string, complete: boolean) {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCheck.mutate(
      { id, key, body: { status: complete ? 'not_done' : 'done' } },
      { onError: (err) => Alert.alert('Adım güncellenemedi', err.message) }
    );
  }

  function handleApprovalDecision(type: OpportunityApprovalType, decision: 'approved' | 'rejected') {
    if (decision === 'approved') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert(
      decision === 'approved' ? `${opportunityApprovalTypeLabels[type]} — Onayla` : `${opportunityApprovalTypeLabels[type]} — Reddet`,
      'Karar kaydedilecek.',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Onayla',
          style: 'destructive',
          onPress: () =>
            decideApproval.mutate(
              { id, type, decision },
              {
                onSuccess: () => toast.success('Onay kararı kaydedildi'),
                onError: (err) => Alert.alert('Karar kaydedilemedi', err.message),
              }
            ),
        },
      ]
    );
  }

  function openDeferSheet() {
    setDeferReason('');
    setDeferAction(data?.nextAction ?? 'Müşteriyi tekrar ara');
    setDeferAt(data?.nextActionAt ? formatInputDateTime(data.nextActionAt) : defaultFollowUpDateTime());
    deferSheetRef.current?.present();
  }

  function submitDefer() {
    const at = parseLocalDateTime(deferAt);
    if (deferReason.trim().length < 3 || deferAction.trim().length < 3 || !at) {
      Alert.alert('Eksik bilgi', 'Takip nedeni, sonraki aksiyon ve geçerli bir gelecek tarih girin.');
      return;
    }
    if (at.getTime() <= Date.now()) {
      Alert.alert('Geçersiz tarih', 'Takip tarihi gelecekte olmalı.');
      return;
    }
    deferCase.mutate(
      { id, reason: deferReason.trim(), nextAction: deferAction.trim(), followUpAt: at.toISOString() },
      {
        onSuccess: () => {
          deferSheetRef.current?.dismiss();
          toast.success('Fırsat açık bırakıldı ve takip görevi oluşturuldu');
        },
        onError: (err) => Alert.alert('Takibe alınamadı', err.message),
      }
    );
  }

  function handleCloseCase(reason?: string) {
    const cleanReason = reason?.trim();
    if (stage === 'win' && !cleanReason) {
      Alert.alert('Neden gerekli', 'Fırsatı kapatmak için kazanma nedenini yazın.');
      return;
    }
    closeCase.mutate(
      { id, reason: cleanReason },
      {
        onSuccess: () => {
          closeSheetRef.current?.dismiss();
          toast.success('Fırsat kapatıldı ve geçmişe alındı');
        },
        onError: (err) => Alert.alert('Kapatılamadı', err.message),
      }
    );
  }

  function handleReopenCase() {
    reopenCase.mutate(id, {
      onSuccess: () => toast.success('Fırsat yeniden açıldı'),
      onError: (err) => Alert.alert('Yeniden açılamadı', err.message),
    });
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <OpportunityHeader
        onMore={
          canUpdate || canDelete
            ? () => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                moreSheetRef.current?.present();
              }
            : undefined
        }
      />

      <ScrollView
        contentContainerStyle={{ gap: 16, paddingHorizontal: SCREEN_PAD, paddingBottom: 40, paddingTop: 16 }}
      >
        {neighbors.previous || neighbors.next ? (
          <View className="flex-row justify-between gap-3">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Önceki fırsat"
              accessibilityState={{ disabled: !neighbors.previous }}
              disabled={!neighbors.previous}
              onPress={() => neighbors.previous && router.replace(`/(tabs)/modules/opportunities/${neighbors.previous}` as Href)}
              className={`min-h-11 flex-row items-center gap-1 rounded-control border border-border bg-card px-3 active:opacity-70 ${neighbors.previous ? '' : 'opacity-40'}`}
            >
              <Ionicons name="chevron-back" size={16} color={colors.primary} />
              <Text className="font-inter-medium text-xs text-foreground">Önceki</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Sonraki fırsat"
              accessibilityState={{ disabled: !neighbors.next }}
              disabled={!neighbors.next}
              onPress={() => neighbors.next && router.replace(`/(tabs)/modules/opportunities/${neighbors.next}` as Href)}
              className={`min-h-11 flex-row items-center gap-1 rounded-control border border-border bg-card px-3 active:opacity-70 ${neighbors.next ? '' : 'opacity-40'}`}
            >
              <Text className="font-inter-medium text-xs text-foreground">Sonraki</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.primary} />
            </Pressable>
          </View>
        ) : null}
        <View className="gap-3">
          <View className="flex-row items-start justify-between gap-3">
            <View className="min-w-0 flex-1 gap-2">
              <Pressable
                accessibilityRole={canUpdate ? 'button' : undefined}
                accessibilityLabel={canUpdate ? 'Satış aşamasını değiştir' : undefined}
                disabled={!canUpdate}
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  chooseStage(null);
                  sheetRef.current?.present();
                }}
                className="self-start active:opacity-70"
              >
                <View className="flex-row items-center gap-1.5 rounded-[10px] border border-stage-border bg-stage-soft px-3 py-1.5">
                  <View className="h-2 w-2 rounded-full" style={{ backgroundColor: colors.stage }} />
                  <Text className="font-inter-medium text-[13px] text-stage">{qualificationStageLabels[stage]}</Text>
                  {canUpdate ? <Ionicons name="chevron-down" size={15} color={colors.stage} /> : null}
                </View>
              </Pressable>
              <Text className="text-[28px] font-inter-bold leading-[34px] text-foreground">{data.title}</Text>
              <Text className="font-inter text-[13px] text-muted-foreground">Fırsat Kodu: {`FRS-${data.id.substring(0, 8).toUpperCase()}`}</Text>
            </View>
            <View className="max-w-[43%] items-end pt-10">
              <Text className="font-inter text-[12px] text-muted-foreground">Tahmini Tutar</Text>
              <Text className="text-right text-[22px] font-inter-bold text-primary" numberOfLines={1} adjustsFontSizeToFit>
                {formatAmount(data.estimatedValue, data.currency?.code ?? 'TRY')}
              </Text>
              <Text className="font-inter-medium text-[12px] text-primary">%{data.probability} olasılık</Text>
            </View>
          </View>
        </View>

        <Card className="py-1.5">
          <OpportunityFact
            icon="business-outline"
            label="Firma"
            value={company}
            onPress={data.company?.id ? () => router.push(`/(tabs)/modules/companies/${data.company!.id}`) : undefined}
          />
          <OpportunityFact icon="person-outline" label="İletişim" value={contactName} onPress={phone ? () => void Linking.openURL(`tel:${phone}`) : undefined} />
          <OpportunityFact
            icon="person-circle-outline"
            label="Sorumlu"
            value={ownerName ?? (canUpdate ? 'Atanmadı' : null)}
            onPress={canUpdate ? () => ownerSheetRef.current?.present() : undefined}
          />
          <OpportunityFact
            icon="pulse-outline"
            label="İlk temas"
            value={followUpLabel}
            onPress={canUpdate ? () => followUpSheetRef.current?.present() : undefined}
          />
          <OpportunityFact icon="calendar-outline" label="Oluşturulma" value={formatDate(data.createdAt)} />
          <OpportunityFact icon="flag-outline" label="Kapanış" value={data.expectedCloseDate ? formatDate(data.expectedCloseDate) : null} />
          <OpportunityFact icon="location-outline" label="Şehir" value={data.leadCity} />
          <OpportunityFact icon="git-branch-outline" label="Operasyon" value={data.stage?.name} />
          <OpportunityFact icon="megaphone-outline" label="Kaynak" value={data.source?.name} />
          <OpportunityFact icon="cube-outline" label="İstenen makine" value={data.requestedMachine} />
          <OpportunityFact
            icon="card-outline"
            label="Ödeme vadesi"
            value={data.paymentTermDays != null ? `${data.paymentTermDays} gün` : canUpdate ? 'Girilmedi' : null}
            onPress={
              canUpdate
                ? () => {
                    setTermDays(data.paymentTermDays != null ? String(data.paymentTermDays) : '');
                    termSheetRef.current?.present();
                  }
                : undefined
            }
          />
          <OpportunityFact icon="mail-outline" label="E-posta" value={data.leadEmail} />
          <OpportunityFact icon="map-outline" label="İlçe" value={data.leadDistrict} />
          <OpportunityFact icon="call-outline" label="Telefon" value={phone} onPress={phone ? () => void Linking.openURL(`tel:${phone}`) : undefined} />
        </Card>

        <Card className="gap-2">
          <Eyebrow>Hızlı temas</Eyebrow>
          <QuickContactRow
            phone={phone ?? (data.leadContactValue as string | null | undefined)}
            email={data.leadEmail}
            companyId={data.company?.id ?? data.companyId}
            name={data.leadContactName ?? data.title}
          />
        </Card>

        {!data.company && canUpdate && canReadCompanies && !isClosed ? (
          <CompanyLinkCard opportunityId={id} leadCompanyTitle={data.leadCompanyTitle ?? null} />
        ) : null}

        {stage === 'lead' && canUpdate && !isClosed ? (
          <LeadConversionCard opportunityId={id} title={data.title} disqualified={data.leadFollowUpStatus === 'disqualified'} />
        ) : null}

        {canUpdate && !isClosed && stage !== 'lead' ? (
          <OperationStageCard opportunityId={id} stageCode={data.stage?.code ?? null} stageName={data.stage?.name ?? null} />
        ) : null}

        {!isClosed && stage !== 'win' && stage !== 'lost' && canUpdate ? (
          <Button
            label="Takibe Al / İleri Tarihe Ertele"
            variant="ghost"
            onPress={openDeferSheet}
          />
        ) : null}

        {/* Fırsatı kapat / yeniden aç — web Geçmiş görünümüyle aynı akış. */}
        {(stage === 'win' || stage === 'lost') && canUpdate ? (
          isClosed ? (
            <Button label="Yeniden Aç" variant="ghost" loading={reopenCase.isPending} disabled={reopenCase.isPending} onPress={handleReopenCase} />
          ) : (
            <Button
              label="Fırsatı Kapat"
              variant="ghost"
              loading={closeCase.isPending}
              disabled={closeCase.isPending}
              onPress={() => {
                if (stage === 'win') {
                  setCloseReason(data.wonReason ?? '');
                  closeSheetRef.current?.present();
                  return;
                }
                Alert.alert('Fırsatı Kapat', 'Kayıp nedeni korunarak kart geçmişe alınacak.', [
                  { text: 'Vazgeç', style: 'cancel' },
                  { text: 'Fırsatı Kapat', style: 'destructive', onPress: () => handleCloseCase(data.lostReason?.name) },
                ]);
              }}
            />
          )
        ) : null}

        {data.description ? (
          <Card className="gap-1.5">
            <Eyebrow>Açıklama</Eyebrow>
            <Text className="font-inter text-sm text-foreground">{data.description}</Text>
          </Card>
        ) : null}

        {data.paymentTerms || data.contractTerms ? (
          <Card className="gap-1.5">
            <Eyebrow>Ticari şartlar</Eyebrow>
            <InfoRows
              items={[
                { label: 'Ödeme şartları', value: data.paymentTerms },
                { label: 'Sözleşme şartları', value: data.contractTerms },
              ]}
            />
          </Card>
        ) : null}

        <View className="gap-3">
          <View className="flex-row gap-3">
            <OpportunityModuleTile
              icon="calendar-outline"
              label="Aktiviteler"
              count={activityCount}
              onPress={() => router.push('/(tabs)/modules/activities')}
            />
            {MODULE_TILES.slice(0, 3).map((tile) => (
              <OpportunityModuleTile
                key={tile.key}
                icon={tile.icon}
                label={tile.label}
                available={evidenceByKey.get(tile.key) ?? false}
                onPress={() => router.push(tile.route as Parameters<typeof router.push>[0])}
              />
            ))}
          </View>
          <View className="flex-row gap-3">
            {MODULE_TILES.slice(3).map((tile) => (
              <OpportunityModuleTile
                key={tile.key}
                icon={tile.icon}
                label={tile.label}
                available={evidenceByKey.get(tile.key) ?? false}
                onPress={() => router.push(tile.route as Parameters<typeof router.push>[0])}
              />
            ))}
            {/* 6 modül + Aktiviteler = 7 kutu; ikinci sıranın son yuvası boş kalır. */}
            <View className="flex-1" />
          </View>
        </View>

        {checks.length > 0 ? (
          <Card className="gap-3">
            <ProgressBar done={checklistDone} total={checks.length} label="Fırsat Kontrol Listesi" />
            <View className="flex-row flex-wrap gap-x-3 gap-y-2">
              {checks.map((check) => {
                const row = (
                  <View className="w-full flex-row items-center gap-2">
                    <Ionicons
                      name={check.complete ? 'checkmark-circle' : 'ellipse-outline'}
                      size={18}
                      color={check.complete ? colors.success : colors.mutedForeground}
                    />
                    <Text className={`flex-1 font-inter text-[12px] ${check.complete ? 'text-foreground' : 'text-muted-foreground'}`} numberOfLines={2}>
                      {check.label}
                    </Text>
                  </View>
                );
                // Yalnızca A+ alanı adımları elle işaretlenebilir (sunucu kuralı).
                if (!check.manualEditable || !canUpdate) {
                  return (
                    <View key={check.key} className="w-[47%]">
                      {row}
                      {check.note ? <Text className="pl-6 font-inter text-[11px] text-muted-foreground">{check.note}</Text> : null}
                    </View>
                  );
                }
                return (
                  <Pressable
                    key={check.key}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: check.complete }}
                    accessibilityHint="Uzun basarak adım notu ekleyebilirsiniz"
                    onPress={() => toggleCheck(check.key, check.complete)}
                    onLongPress={() => checkNote.open(check)}
                    className="w-[47%] opacity-100 active:opacity-60"
                  >
                    {row}
                    {check.note ? (
                      <Text className="pl-6 font-inter text-[11px] text-muted-foreground">{check.note}</Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
            <Text className="font-inter text-[11px] text-muted-foreground">
              Dokunarak "yapıldı / yapılmadı" işaretleyebilir, uzun basarak not ekleyebilirsin — yalnız A+ alanındaki adımlarda.
            </Text>
          </Card>
        ) : null}

        {(pendingApprovals.length > 0 || settledApprovals.length > 0) && canApprove ? (
          <Card className="gap-2">
            <Eyebrow>Onaylar</Eyebrow>
            {OPPORTUNITY_APPROVAL_TYPES.map((type) => {
              const status = approvals[type];
              if (!status) return null;
              return (
                <View key={type} className="gap-1.5">
                  <View className="flex-row items-center justify-between gap-2">
                    <Text className="flex-1 font-inter-medium text-[13px] text-foreground">{opportunityApprovalTypeLabels[type]}</Text>
                    <Chip
                      tone={status === 'approved' ? 'success' : status === 'rejected' ? 'destructive' : 'warning'}
                      label={status === 'approved' ? 'Onaylandı' : status === 'rejected' ? 'Reddedildi' : 'Bekliyor'}
                    />
                  </View>
                  {status === 'pending' ? (
                    <View className="flex-row gap-2">
                      <View className="flex-1">
                        <Button
                          label="Onayla"
                          onPress={() => handleApprovalDecision(type, 'approved')}
                          loading={decideApproval.isPending && decideApproval.variables?.type === type && decideApproval.variables?.decision === 'approved'}
                          disabled={decideApproval.isPending}
                        />
                      </View>
                      <View className="flex-1">
                        <Button
                          label="Reddet"
                          variant="ghost"
                          onPress={() => handleApprovalDecision(type, 'rejected')}
                          loading={decideApproval.isPending && decideApproval.variables?.type === type && decideApproval.variables?.decision === 'rejected'}
                          disabled={decideApproval.isPending}
                        />
                      </View>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </Card>
        ) : null}

        {data.nextAction || canUpdate ? (
          <Card className="gap-3">
            <Eyebrow>Sonraki Aksiyon</Eyebrow>
            <View className="flex-row items-center gap-3">
              <View className="h-12 w-12 items-center justify-center rounded-[12px] bg-secondary">
                <Ionicons name="calendar-outline" size={24} color={colors.primary} />
              </View>
              <View className="min-w-0 flex-1 gap-0.5">
                <Text className="font-inter-semibold text-[14px] text-foreground" numberOfLines={2}>
                  {data.nextAction ?? 'Henüz planlanmadı'}
                </Text>
                {data.nextActionAt ? (
                  <Text className="font-inter text-[12px] text-muted-foreground">{formatDateTime(data.nextActionAt)}</Text>
                ) : null}
              </View>
              {canUpdate ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={data.nextAction ? 'Sonraki aksiyonu düzenle' : 'Sonraki aksiyon planla'}
                  onPress={openActionSheet}
                  className="h-10 items-center justify-center rounded-[10px] border border-border px-3 active:opacity-70"
                >
                  <Text className="font-inter-medium text-[13px] text-primary">{data.nextAction ? 'Düzenle' : 'Planla'}</Text>
                </Pressable>
              ) : null}
            </View>
          </Card>
        ) : null}

        {data.externalSource ? (
          <Card className="gap-1.5">
            <Eyebrow>Dış Kaynak</Eyebrow>
            <InfoRows
              items={[
                { label: 'Kaynak', value: data.externalSource },
                { label: 'Pano', value: trelloText('board') ?? trelloText('boardName') },
                { label: 'Liste', value: trelloText('list') ?? trelloText('listName') },
                { label: 'Üyeler', value: trelloText('members') },
              ]}
            />
            {data.externalUrl ? (
              <Button
                label="Kaynak kartı aç"
                variant="ghost"
                trailingIcon="open-outline"
                onPress={() => void Linking.openURL(data.externalUrl!)}
              />
            ) : null}
          </Card>
        ) : null}

        {data.qualificationHistory?.length || data.history?.length ? (
          <Card className="gap-2">
            <Eyebrow>Zaman Çizelgesi</Eyebrow>
            {(data.qualificationHistory ?? []).slice(0, 8).map((row) => (
              <View key={row.id} className="flex-row items-start gap-2">
                <Ionicons name="git-commit-outline" size={16} color={colors.mutedForeground} style={{ marginTop: 2 }} />
                <View className="min-w-0 flex-1">
                  <Text className="font-inter-medium text-[13px] text-foreground">
                    {row.fromStage
                      ? `${qualificationStageLabels[row.fromStage as QualificationStage] ?? row.fromStage} → ${qualificationStageLabels[row.toStage as QualificationStage] ?? row.toStage}`
                      : `${qualificationStageLabels[row.toStage as QualificationStage] ?? row.toStage} açıldı`}
                  </Text>
                  <Text className="font-inter text-[11px] text-muted-foreground">{formatDateTime(row.createdAt)}</Text>
                  {row.changeReason ? (
                    <Text className="font-inter text-[12px] text-muted-foreground">{row.changeReason}</Text>
                  ) : null}
                </View>
              </View>
            ))}
            {(data.history ?? []).slice(0, 8).map((row) => (
              <View key={row.id} className="flex-row items-start gap-2">
                <Ionicons name="git-branch-outline" size={16} color={colors.mutedForeground} style={{ marginTop: 2 }} />
                <View className="min-w-0 flex-1">
                  <Text className="font-inter-medium text-[13px] text-foreground">
                    {[row.fromStage?.name, row.toStage?.name].filter(Boolean).join(' → ') || 'Operasyon aşaması'}
                  </Text>
                  <Text className="font-inter text-[11px] text-muted-foreground">{formatDateTime(row.createdAt)}</Text>
                </View>
              </View>
            ))}
          </Card>
        ) : null}

        {/* Fırsata bağlı teklifler. Bir fırsatta birden çok teklif yaşar ve WIN'in
            tek kanıtı bunlardan birinin SATILMIŞ (onaylanmış) olmasıdır; hangisinin
            satıldığı buradan işaretlenir (teklif detayında Onayla/Reddet). */}
        <Card className="gap-1.5">
          <Eyebrow>Teklifler ({opportunityQuotes.length})</Eyebrow>
          {quoteList.isPending ? (
            <Loading />
          ) : opportunityQuotes.length === 0 ? (
            <Text className="font-inter text-sm text-muted-foreground">Bu fırsata bağlı teklif yok.</Text>
          ) : (
            <>
              {opportunityQuotes.map((quote) => (
                <ListRow
                  key={quote.id}
                  title={quote.revisionNo > 1 ? `${quote.documentNo} · R${quote.revisionNo}` : quote.documentNo}
                  lines={[quote.productName, formatDate(quote.quoteDate)]}
                  icon="document-text-outline"
                  iconTone={isSoldQuote(quote) ? 'success' : 'neutral'}
                  chip={
                    quote.status
                      ? {
                          label: isSoldQuote(quote) ? 'Satıldı' : quote.status.name,
                          tone: QUOTE_STATUS_TONE[quote.status.code] ?? 'neutral',
                        }
                      : undefined
                  }
                  trailing={formatAmount(quote.grandTotal, quote.currency?.code ?? 'TRY')}
                  trailingTone="neutral"
                  onPress={() => router.push(`/(tabs)/modules/quotes/${quote.id}`)}
                />
              ))}
              {stage !== 'lost' && soldQuotes.length === 0 ? (
                <Text className="font-inter text-[12px] text-muted-foreground">
                  Hiçbir teklif satılmadı. WIN'e geçmek için satılan teklifi açıp onaylayın.
                </Text>
              ) : null}
            </>
          )}
          {canCreateQuote && !isClosed ? (
            data.company ? (
              <Button
                label="Teklif oluştur"
                variant="ghost"
                trailingIcon="add"
                onPress={() =>
                  router.push({
                    pathname: '/modal/quote-form',
                    params: { opportunityId: id, companyId: data.company!.id },
                  } as unknown as Href)
                }
              />
            ) : (
              <Text className="font-inter text-[12px] text-muted-foreground">Teklif oluşturmak için önce firma bağlayın.</Text>
            )
          ) : null}
        </Card>

        <OpportunityDocuments opportunityId={id} />

        {stage === 'lost' && (data.lostReason || data.lostCompetitor || data.lostProductName) ? (
          <Card className="gap-1.5">
            <Eyebrow>Kayıp Bilgileri</Eyebrow>
            <InfoRows
              items={[
                { label: 'Kayıp nedeni', value: data.lostReason?.name },
                { label: 'Kaybedilen ürün', value: data.lostProductName },
                { label: 'Rakip', value: data.lostCompetitor?.name },
                { label: 'Rakip ürünü', value: data.lostCompetitorProductModel },
                { label: 'Karşılanamayan koşullar', value: data.lostUnmetConditions },
              ]}
            />
          </Card>
        ) : null}

        {stage === 'win' && (data.wonProductName || data.wonReason) ? (
          <Card className="gap-1.5">
            <Eyebrow>Kazanım</Eyebrow>
            <InfoRows
              items={[
                { label: 'Satılan makineler', value: data.wonProductName },
                { label: 'Kazanılma nedeni', value: data.wonReason },
              ]}
            />
          </Card>
        ) : null}

        <OpportunityActivityFeed opportunityId={id} companyId={data.company?.id ?? null} title={data.title} />
      </ScrollView>

      {canUpdate ? <BottomSheetModal
        ref={sheetRef}
        enableDynamicSizing
        backgroundStyle={{ backgroundColor: colors.card }}
        handleIndicatorStyle={{ backgroundColor: colors.mutedForeground }}
        backdropComponent={(props) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />}
      >
        <BottomSheetView className="gap-2 px-5 pb-10 pt-2">
          <Text className="font-inter-semibold text-base text-foreground">Satış derecesi</Text>
          <Text className="mb-2 font-inter text-xs text-muted-foreground">Geçiş kuralları sunucuda doğrulanır; uygun olmayan seçim reddedilir.</Text>
          {QUALIFICATION_STAGES.map((option) => (
            <Button
              key={option}
              label={qualificationStageLabels[option]}
              variant={option === stage ? 'primary' : targetStage === option ? 'destructive' : 'ghost'}
              onPress={() => chooseStage(option)}
            />
          ))}

          {/* LOST: web LostCaseDialog'unun zorunlu alanları */}
          {targetStage === 'lost' ? (
            <View className="mt-2 gap-3">
              <Text className="font-inter text-xs text-muted-foreground">
                Müşteri yalnızca ileri bir tarih verdiyse kayıp seçmeyin; karttaki “Takibe Al” işlemi fırsatı açık tutar ve görev oluşturur.
              </Text>
              <Eyebrow>Kayıp Nedeni *</Eyebrow>
              <View className="flex-row flex-wrap gap-2">
                {LOST_REASONS.map((reason) => {
                  const active = lostReasonCode === reason.code;
                  return (
                    <Pressable
                      key={reason.code}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: active }}
                      onPress={() => setLostReasonCode(active ? null : reason.code)}
                      className={`self-start rounded-full border px-3 py-1.5 ${active ? 'border-destructive bg-destructive-soft' : 'border-border bg-card'}`}
                    >
                      <Text className={`font-inter-medium text-xs ${active ? 'text-destructive' : 'text-foreground'}`}>
                        {reason.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Field
                label="Kaybedilen ürün *"
                value={lostProductName}
                onChangeText={(v) => setLostProductName(v)}
                placeholder={data.requestedMachine ?? 'Örn. VM-2 Dikey İşleme Merkezi'}
              />
              <Field
                label="Karşılanamayan şartlar *"
                value={lostUnmetConditions}
                onChangeText={(v) => setLostUnmetConditions(v)}
                placeholder="Örn. teslim süresi 6 ay istendi, 4 ay karşılanamadı"
                multiline
                numberOfLines={2}
              />
              <Field label="Rakip firma (opsiyonel)" value={competitorName} onChangeText={(v) => setCompetitorName(v)} placeholder="Örn. Şahintek Makina" />
              <Field label="Rakip ürün/model (opsiyonel)" value={competitorModel} onChangeText={(v) => setCompetitorModel(v)} />
            </View>
          ) : null}

          {/* Geriye geçiş: web'deki zorunlu gerekçe notu */}
          {targetStage !== null && isBackwardMove ? (
            <View className="mt-2">
              <Field
                label="Geriye geçiş gerekçesi *"
                value={stageNote}
                onChangeText={(v) => setStageNote(v)}
                placeholder="Neden geri alındığını kısaca yazın"
                multiline
                numberOfLines={2}
              />
            </View>
          ) : null}

          {/* WIN'in kapısı satılan tekliftir. Sunucu zaten reddediyor; engeli
              önden söyleyip tek dokunuşta teklife götürmek çıkmaz sokağı kapatır. */}
          {targetStage === 'win' && soldQuotes.length === 0 ? (
            <View className="mt-2 gap-2">
              <Text className="font-inter text-xs text-destructive">
                WIN için fırsattaki tekliflerden en az birinin satılmış (onaylanmış) olması gerekir.
              </Text>
              <Button
                label={opportunityQuotes.length ? 'Satılan teklifi seç' : 'Tekliflere git'}
                variant="ghost"
                onPress={() => {
                  sheetRef.current?.dismiss();
                  const onlyQuote = opportunityQuotes.length === 1 ? opportunityQuotes[0] : undefined;
                  if (onlyQuote) router.push(`/(tabs)/modules/quotes/${onlyQuote.id}`);
                }}
              />
            </View>
          ) : null}

          {stageError ? <Text className="font-inter text-xs text-destructive">{stageError}</Text> : null}

          {targetStage && targetStage !== stage && !(targetStage === 'win' && soldQuotes.length === 0) ? (
            <Button
              label={`${qualificationStageLabels[targetStage]} Yap`}
              onPress={() => applyStage(targetStage)}
              loading={setStage.isPending}
              disabled={setStage.isPending}
            />
          ) : null}
        </BottomSheetView>
      </BottomSheetModal> : null}
    
      {/* ⋮ menüsü: web SalesCaseDetail'deki kart işlemlerinin mobil karşılığı. */}
      <BottomSheetModal
        ref={moreSheetRef}
        enableDynamicSizing
        backgroundStyle={{ backgroundColor: colors.card }}
        handleIndicatorStyle={{ backgroundColor: colors.mutedForeground }}
        backdropComponent={(props) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />}
      >
        <BottomSheetView className="gap-2 px-5 pb-10 pt-2">
          <Text className="font-inter-semibold text-base text-foreground" numberOfLines={1}>{data.title}</Text>
          {canUpdate ? (
            <>
              <Button
                label="Kartı düzenle"
                variant="ghost"
                onPress={() => {
                  moreSheetRef.current?.dismiss();
                  router.push({ pathname: '/modal/opportunity-edit', params: { id } } as unknown as Href);
                }}
              />
              <Button
                label="Sonraki aksiyonu düzenle"
                variant="ghost"
                onPress={() => {
                  moreSheetRef.current?.dismiss();
                  openActionSheet();
                }}
              />
              <Button
                label="Sorumlu ata"
                variant="ghost"
                onPress={() => {
                  moreSheetRef.current?.dismiss();
                  ownerSheetRef.current?.present();
                }}
              />
              <Button
                label="İlk temas durumu"
                variant="ghost"
                onPress={() => {
                  moreSheetRef.current?.dismiss();
                  followUpSheetRef.current?.present();
                }}
              />
              <Button
                label="Ödeme vadesi"
                variant="ghost"
                onPress={() => {
                  moreSheetRef.current?.dismiss();
                  setTermDays(data.paymentTermDays != null ? String(data.paymentTermDays) : '');
                  termSheetRef.current?.present();
                }}
              />
            </>
          ) : null}
          {canDelete ? (
            <Button
              label="Fırsatı sil"
              variant="destructive"
              loading={deleteOpp.isPending}
              disabled={deleteOpp.isPending}
              onPress={() => {
                moreSheetRef.current?.dismiss();
                Alert.alert('Fırsatı sil', 'Kayıt kalıcı olarak silinecek. Arşivlemek için "Bitir ve Arşivle" kullan.', [
                  { text: 'Vazgeç', style: 'cancel' },
                  {
                    text: 'Sil',
                    style: 'destructive',
                    onPress: () =>
                      deleteOpp.mutate(id, {
                        onSuccess: () => {
                          toast.success('Fırsat silindi');
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
      </BottomSheetModal>

      <BottomSheetModal
        ref={ownerSheetRef}
        enableDynamicSizing
        backgroundStyle={{ backgroundColor: colors.card }}
        handleIndicatorStyle={{ backgroundColor: colors.mutedForeground }}
        backdropComponent={(props) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />}
      >
        <BottomSheetView className="gap-2 px-5 pb-10 pt-2">
          <Text className="font-inter-semibold text-base text-foreground">Sorumlu</Text>
          {assignees.isPending ? <Loading /> : null}
          {(assignees.data ?? []).map((user) => (
            <Button
              key={user.id}
              label={user.name}
              variant={data.ownerUserId === user.id ? 'primary' : 'ghost'}
              onPress={() => patch({ id, ownerUserId: user.id }, () => ownerSheetRef.current?.dismiss())}
            />
          ))}
          {data.ownerUserId ? (
            <Button
              label="Sorumluyu kaldır"
              variant="ghost"
              onPress={() => patch({ id, ownerUserId: null }, () => ownerSheetRef.current?.dismiss())}
            />
          ) : null}
        </BottomSheetView>
      </BottomSheetModal>

      <BottomSheetModal
        ref={followUpSheetRef}
        enableDynamicSizing
        backgroundStyle={{ backgroundColor: colors.card }}
        handleIndicatorStyle={{ backgroundColor: colors.mutedForeground }}
        backdropComponent={(props) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />}
      >
        <BottomSheetView className="gap-2 px-5 pb-10 pt-2">
          <Text className="font-inter-semibold text-base text-foreground">İlk temas durumu</Text>
          {LEAD_FOLLOW_UP_STATUSES.map((code) => (
            <Button
              key={code}
              label={leadFollowUpStatusLabels[code]}
              variant={followUpStatus === code ? 'primary' : 'ghost'}
              onPress={() => {
                // Sunucu `disqualified` için gerekçe kodu zorunlu tutuyor
                // (opportunityUpdateSchema requireDisqualifyReason).
                if (code === 'disqualified') {
                  Alert.alert(
                    'Elendi olarak işaretle',
                    'Gerekçe zorunlu. Kartı "Kayıp" aşamasına taşıyarak nedenini gir.',
                    [{ text: 'Tamam' }]
                  );
                  return;
                }
                patch({ id, leadFollowUpStatus: code }, () => followUpSheetRef.current?.dismiss());
              }}
            />
          ))}
        </BottomSheetView>
      </BottomSheetModal>

      <BottomSheetModal
        ref={termSheetRef}
        enableDynamicSizing
        backgroundStyle={{ backgroundColor: colors.card }}
        handleIndicatorStyle={{ backgroundColor: colors.mutedForeground }}
        backdropComponent={(props) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />}
      >
        <BottomSheetView className="gap-3 px-5 pb-10 pt-2">
          <Text className="font-inter-semibold text-base text-foreground">Ödeme vadesi</Text>
          <Field
            label="Gün"
            value={termDays}
            onChangeText={setTermDays}
            placeholder="Örn. 60"
            keyboardType="number-pad"
            maxLength={4}
          />
          <Button
            label="Kaydet"
            loading={updateOpp.isPending}
            disabled={updateOpp.isPending}
            onPress={() => {
              const trimmed = termDays.trim();
              if (!trimmed) {
                patch({ id, paymentTermDays: null }, () => termSheetRef.current?.dismiss());
                return;
              }
              const days = Number(trimmed);
              if (!Number.isInteger(days) || days < 0 || days > 3650) {
                Alert.alert('Geçersiz vade', 'Vade 0 ile 3650 gün arasında tam sayı olmalı.');
                return;
              }
              patch({ id, paymentTermDays: days }, () => termSheetRef.current?.dismiss());
            }}
          />
        </BottomSheetView>
      </BottomSheetModal>

      <BottomSheetModal
        ref={actionSheetRef}
        enableDynamicSizing
        backgroundStyle={{ backgroundColor: colors.card }}
        handleIndicatorStyle={{ backgroundColor: colors.mutedForeground }}
        backdropComponent={(props) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />}
      >
        <BottomSheetView className="gap-3 px-5 pb-10 pt-2">
          <Text className="font-inter-semibold text-base text-foreground">Sonraki Aksiyon</Text>
          <Field
            label="Aksiyon"
            value={actionText}
            onChangeText={setActionText}
            placeholder="Örn. müşteriyi ara, teklifi takip et"
            multiline
            numberOfLines={2}
          />
          <DateTextField
            label="Zaman"
            value={actionAt}
            onChangeText={setActionAt}
            mode="datetime"
          />
          <Button
            label="Kaydet"
            onPress={submitAction}
            loading={updateOpp.isPending}
            disabled={updateOpp.isPending}
          />
          <View style={{ height: 4 }} />
        </BottomSheetView>
      </BottomSheetModal>

      <BottomSheetModal
        ref={deferSheetRef}
        enableDynamicSizing
        backgroundStyle={{ backgroundColor: colors.card }}
        handleIndicatorStyle={{ backgroundColor: colors.mutedForeground }}
        backdropComponent={(props) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />}
      >
        <BottomSheetView className="gap-3 px-5 pb-10 pt-2">
          <Text className="font-inter-semibold text-base text-foreground">Fırsatı Takibe Al</Text>
          <Text className="font-inter text-xs text-muted-foreground">
            Fırsat kayıp sayılmaz; açık kalır, ekip aktivitesi kaydedilir ve tarihli bir görev oluşturulur.
          </Text>
          <Field
            label="Takip nedeni *"
            value={deferReason}
            onChangeText={setDeferReason}
            placeholder="Örn. müşteri yatırımı iki ay sonra yapacak"
            multiline
            numberOfLines={2}
            maxLength={1000}
          />
          <Field
            label="Sonraki aksiyon *"
            value={deferAction}
            onChangeText={setDeferAction}
            placeholder="Örn. bütçe onayından sonra müşteriyi ara"
            multiline
            numberOfLines={2}
            maxLength={1000}
          />
          <DateTextField
            label="Takip tarihi *"
            value={deferAt}
            onChangeText={setDeferAt}
            mode="datetime"
          />
          <Button
            label="Takibe Al ve Görev Oluştur"
            onPress={submitDefer}
            loading={deferCase.isPending}
            disabled={deferCase.isPending}
          />
        </BottomSheetView>
      </BottomSheetModal>

      <BottomSheetModal
        ref={closeSheetRef}
        enableDynamicSizing
        backgroundStyle={{ backgroundColor: colors.card }}
        handleIndicatorStyle={{ backgroundColor: colors.mutedForeground }}
        backdropComponent={(props) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />}
      >
        <BottomSheetView className="gap-3 px-5 pb-10 pt-2">
          <Text className="font-inter-semibold text-base text-foreground">Fırsatı Kapat</Text>
          <Field
            label="Kazanma / kapatma nedeni *"
            value={closeReason}
            onChangeText={setCloseReason}
            placeholder="Örn. teknik çözüm ve teslim süresi tercih edildi"
            multiline
            numberOfLines={3}
            maxLength={255}
          />
          <Button
            label="Fırsatı Kapat ve Geçmişe Al"
            onPress={() => handleCloseCase(closeReason)}
            loading={closeCase.isPending}
            disabled={closeCase.isPending || !closeReason.trim()}
          />
        </BottomSheetView>
      </BottomSheetModal>
      {checkNote.sheet}
    </SafeAreaView>
  );
}

function formatInputDateTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultFollowUpDateTime(): string {
  const date = new Date();
  date.setMonth(date.getMonth() + 2);
  date.setHours(9, 0, 0, 0);
  return formatInputDateTime(date.toISOString());
}
