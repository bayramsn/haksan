import { useAllQuoteList } from '@/src/api/quotes.hooks';
import { startCrmCall } from '@/src/call-assistant/call';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { Alert, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BottomSheetBackdrop, BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { ProcessCheck } from '@haksan/shared';
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
import { GlassNavigationControl } from '@/src/ui/NavigationGlass';
import { Logo } from '@/src/ui/Logo';
import { Button, Card, Chip, DetailHeader, ErrorState, Eyebrow, Field, ListRow, Loading, SCREEN_PAD } from '@/src/ui';
import { InfoRows, ProgressBar } from '@/src/ui/data';
import { useNavigationBottomInset } from '@/src/ui/LiquidGlassTabBarBackground';
import { OpportunityPaymentTermsPanel, OpportunityTasksPanel } from '@/src/ui/sales/OpportunityInfoPanels';
import { useConvertLead } from '@/src/api/sales.hooks';
import { can, useAuth, useCan } from '@/src/auth/AuthProvider';
import { useCanAccessModule } from '@/src/modules/useModuleAccess';
import { useHierarchyBack } from '@/src/modules/useHierarchyBack';
import { canPerformOpportunityAction } from '@/src/ui/sales/process-access';
import {
  EMPTY_LOST_INPUT,
  canMarkOpportunityClosed,
  lostStageBody,
  neighborIds,
  qualificationRank,
  validateLostInput,
  type LostInput,
} from '@/src/ui/sales/sales-logic';
import { LostCaseFields } from '@/src/ui/sales/LostCaseFields';
import { getOpportunityOrder } from '@/src/ui/sales/opportunity-order';
import {
  CompanyLinkCard,
  LeadConversionCard,
  OperationStageCard,
  ProcessAdvanceCard,
  OpportunityActivityFeed,
  OpportunityDocuments,
  QuickContactRow,
  useCheckNoteSheet,
} from '@/src/ui/sales/OpportunityWorkspace';
import { CloseCaseSheet, type CloseCaseSheetHandle } from '@/src/ui/sales/CloseCaseSheet';
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

type WorkspaceTab = 'surec' | 'ozet' | 'teklifler' | 'belgeler' | 'odemeler' | 'aktivite';

const WORKSPACE_TABS: { value: WorkspaceTab; label: string }[] = [
  { value: 'surec', label: 'Süreç' },
  { value: 'ozet', label: 'Fırsat bilgileri' },
  { value: 'teklifler', label: 'Teklifler' },
  { value: 'belgeler', label: 'Belgeler' },
  { value: 'odemeler', label: 'Ödeme bilgileri' },
  { value: 'aktivite', label: 'Notlar ve görüşmeler' },
];

/**
 * Süreç kutuları: web ProcessChecklistPanel create aksiyonlarına köprü.
 * Kanıt noktası processReadiness’den; oluşturma ilgili modal/modüle gider.
 */
const MODULE_TILES: {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  listRoute: string;
}[] = [
  { key: 'quote', label: 'Teklifler', icon: 'document-text-outline', listRoute: '/modules/quotes' },
  { key: 'proforma', label: 'Proforma', icon: 'receipt-outline', listRoute: '/modules/proformas' },
  { key: 'stock', label: 'Stok', icon: 'cube-outline', listRoute: '/modules/inventory' },
  { key: 'commercial_invoice', label: 'Ticari fatura', icon: 'document-text-outline', listRoute: '/modules/documents' },
  { key: 'shipment', label: 'Sevkiyat', icon: 'car-outline', listRoute: '/modules/shipments' },
  { key: 'installation', label: 'Kurulum', icon: 'build-outline', listRoute: '/modules/installations' },
];

function OpportunityHeader({ onMore }: { onMore?: () => void }) {
  const { goBack } = useHierarchyBack();
  const { colors } = useTheme();
  return (
    <View className="h-[62px] flex-row items-center border-b border-border bg-card px-3">
      <GlassNavigationControl>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Geri"
        onPress={goBack}
        className="h-11 w-11 items-center justify-center active:opacity-60"
      >
        <Ionicons name="arrow-back" size={22} color={colors.foreground} />
      </Pressable>
      </GlassNavigationControl>
      <View className="flex-1 items-center">
        <Logo width={112} />
      </View>
      <GlassNavigationControl>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Fırsat işlemleri"
        accessibilityState={{ disabled: !onMore }}
        disabled={!onMore}
        onPress={onMore}
        className="h-11 w-11 items-center justify-center active:opacity-60"
      >
        <Ionicons name="ellipsis-vertical" size={20} color={onMore ? colors.primary : colors.mutedForeground} />
      </Pressable>
      </GlassNavigationControl>
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
      <Text className="w-[100px] font-inter text-[13px] text-muted-foreground">{label}</Text>
      <Text className="flex-1 text-right font-inter-medium text-[14px] text-foreground" numberOfLines={4}>{value}</Text>
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
      className="min-h-[88px] flex-1 items-center justify-center gap-2 rounded-control border border-border bg-card px-3 py-3 active:opacity-70"
      style={{ borderCurve: 'continuous' }}
    >
      <View className="relative">
        <Ionicons name={icon} size={20} color={colors.primary} />
        {count !== undefined && count > 0 ? (
          <View className="absolute -right-2.5 -top-1.5 min-w-[18px] items-center rounded-full bg-primary px-1 py-0.5">
            <Text className="font-inter-bold text-[10px] text-primary-foreground">{count}</Text>
          </View>
        ) : available ? (
          <View className="absolute -right-1.5 -top-1 h-2 w-2 rounded-full border-2 border-card bg-primary" />
        ) : null}
      </View>
      <Text className="text-center font-inter-medium text-[13px] text-foreground" numberOfLines={2}>{label}</Text>
    </Pressable>
  );
}

export default function OpportunityDetailScreen() {
  const { goBack } = useHierarchyBack();
  const GLASS_TAB_BAR_HEIGHT = useNavigationBottomInset();
  const { id, processTarget } = useLocalSearchParams<{ id: string; processTarget?: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const sheetRef = useRef<BottomSheetModal>(null);
  const docsSheetRef = useRef<BottomSheetModal>(null);
  const canUpdate = useCan('opportunities.update');
  const canApprove = useCan('opportunities.approve');
  const canReadAssignees = useCan('opportunities.read');
  const canDelete = useCan('opportunities.delete');
  const canCreatePayment = useCan('payments.create');
  const canReadCompanies = useCan('companies.read');
  const checkNote = useCheckNoteSheet(id);
  const neighbors = useMemo(() => neighborIds(getOpportunityOrder(), id), [id]);

  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>('surec');
  const contentRef = useRef<ScrollView>(null);
  const approvalsY = useRef(0);
  const sectionTabsRef = useRef<ScrollView>(null);
  const tabPositions = useRef<Partial<Record<WorkspaceTab, number>>>({});
  useEffect(() => {
    contentRef.current?.scrollTo({ y: 0, animated: false });
    sectionTabsRef.current?.scrollTo({ x: Math.max(0, (tabPositions.current[workspaceTab] ?? 0) - 16), animated: true });
  }, [workspaceTab]);
  const { user, tenant } = useAuth();
  const canAssignOwner = canUpdate && Boolean(user?.roles.some((role) => role === 'sales' || role === 'super_admin'));
  const canPerformAction = useCallback(
    (actionKey: string) =>
      (actionKey !== 'assign_owner' || canAssignOwner) && canPerformOpportunityAction(actionKey, {
        hasPermission: (permission) => can(user, permission),
        isSuperAdmin: Boolean(user?.roles.includes('super_admin')),
        hiddenNavigationKeys: tenant?.hiddenNavigationKeys,
      }),
    [user, tenant, canAssignOwner],
  );
  const showQuotes = useCanAccessModule('quotes');
  const showProformas = useCanAccessModule('proformas');
  const showStock = useCanAccessModule('inventory');
  const showShipments = useCanAccessModule('shipments');
  const showInstallations = useCanAccessModule('installations');
  const showDocuments = useCanAccessModule('documents');
  const showPayments = useCanAccessModule('payments');
  const showReceivables = useCanAccessModule('receivables');
  const showActivities = useCanAccessModule('activities');
  const tileAllowed: Record<string, boolean> = {
    quote: showQuotes,
    proforma: showProformas,
    stock: showStock,
    commercial_invoice: showDocuments,
    shipment: showShipments,
    installation: showInstallations,
  };
  const workspaceTabs = useMemo(
    () =>
      WORKSPACE_TABS.filter((tab) => {
        if (tab.value === 'teklifler') return showQuotes;
        if (tab.value === 'belgeler') return showDocuments;
        if (tab.value === 'odemeler') return showPayments;
        if (tab.value === 'aktivite') return showActivities;
        return true;
      }),
    [showActivities, showDocuments, showPayments, showQuotes],
  );
  useEffect(() => {
    if (!workspaceTabs.some((tab) => tab.value === workspaceTab)) setWorkspaceTab('surec');
  }, [workspaceTab, workspaceTabs]);
  // Aşama sayfası: hedef aşama + LOST için zorunlu kayıp alanları
  const [targetStage, setTargetStage] = useState<QualificationStage | null>(null);
  const [lost, setLost] = useState<LostInput>(EMPTY_LOST_INPUT);
  const [stageNote, setStageNote] = useState('');
  const [stageError, setStageError] = useState<string | null>(null);

  const { data, isPending, error, refetch } = useOpportunity(id);
  useFocusEffect(useCallback(() => { void refetch(); }, [refetch]));
  const activityList = useActivityList({ opportunityId: id });
  // Fırsata bağlı teklifler: WIN kararının dayanağı. Sunucu `opportunityId`
  // filtresini destekliyor, liste istemcide süzülmüyor.
  const quoteList = useAllQuoteList({ opportunityId: id });
  const assignees = useOpportunityAssignees(canReadAssignees);
  const setStage = useSetQualificationStage();
  const convertLead = useConvertLead();
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
  const markClosedSheetRef = useRef<CloseCaseSheetHandle>(null);
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
        // Web NextActionDialog: tarih temizlenince null gönderilir.
        nextActionAt: at ? at.toISOString() : null,
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
    setLost(EMPTY_LOST_INPUT);
    setStageNote('');
    setStageError(null);
  }, []);

  const applyStage = useCallback(
    (stage: QualificationStage, backward: boolean) => {
      // Web ile aynı zorunluluklar (LostCaseDialog + geriye geçiş gerekçesi).
      const lostError = stage === 'lost' ? validateLostInput(lost) : null;
      if (lostError) {
        setStageError(lostError);
        return;
      }
      if (backward && !stageNote.trim()) {
        setStageError('Geriye geçiş için gerekçe zorunludur.');
        return;
      }
      sheetRef.current?.dismiss();
      setStage.mutate(
        {
          id,
          ...(stage === 'lost'
            ? lostStageBody(lost)
            : { toStage: stage, ...(stageNote.trim() ? { note: stageNote.trim() } : {}) }),
        },
        {
          // Sunucu geçiş kurallarını doğruluyor; reddi kullanıcıya aynen göster.
          onError: (err) => Alert.alert('Aşama değiştirilemedi', err.message),
        }
      );
    },
    [id, setStage, lost, stageNote]
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
  const isClosed = Boolean(data.closedAt);
  const preferredQuote =
    soldQuotes[0] ??
    opportunityQuotes.find((quote) => quote.status?.code === 'sent') ??
    opportunityQuotes[0] ??
    null;
  const preferredQuoteId = preferredQuote?.id ?? '';
  const companyIdForDocs = data.company?.id ?? '';
  const companyNameForDocs = company ?? '';

  function openQuoteCreate() {
    if (!companyIdForDocs) {
      toast.error('Önce firma bağlayın');
      return;
    }
    router.push({
      pathname: '/modal/quote-form',
      params: { opportunityId: id, companyId: companyIdForDocs },
    } as unknown as Href);
  }

  function openLinkedDoc(kind: 'proforma' | 'contract' | 'invoice') {
    if (!preferredQuoteId) {
      toast.error('Önce bu fırsat için teklif oluşturun');
      setWorkspaceTab('teklifler');
      return;
    }
    const pathname =
      kind === 'proforma'
        ? '/modal/proforma-form'
        : kind === 'contract'
          ? '/modal/contract-form'
          : '/modal/commercial-invoice-form';
    router.push({ pathname, params: { quoteId: preferredQuoteId } } as unknown as Href);
  }

  function openPaymentPlan() {
    if (!companyIdForDocs) {
      toast.error('Önce firma bağlayın');
      return;
    }
    router.push({
      pathname: '/modal/payment-plan',
      params: {
        opportunityId: id,
        companyId: companyIdForDocs,
        companyName: companyNameForDocs,
        ...(preferredQuoteId ? { quoteId: preferredQuoteId } : {}),
      },
    } as unknown as Href);
  }

  function openProcessTask(check: ProcessCheck) {
    if (!canPerformAction(check.actionKey)) return;
    const action = check.actionKey;
    if (action === 'create_quote' || action === 'approve_quote') {
      if (action === 'approve_quote' || opportunityQuotes.length) setWorkspaceTab('teklifler');
      else openQuoteCreate();
      return;
    }
    if (action === 'create_proforma') return openLinkedDoc('proforma');
    if (action === 'create_contract') return openLinkedDoc('contract');
    if (action === 'create_commercial_invoice') return openLinkedDoc('invoice');
    if (action === 'create_payment_plan') return openPaymentPlan();
    if (action === 'create_shipment') return openShipmentCreate();
    if (action === 'complete_shipment') {
      router.push({ pathname: '/modal/opportunity-operations', params: { id, kind: 'shipment' } } as Href);
      return;
    }
    if (action === 'assign_owner') {
      if (!canAssignOwner) return;
      ownerSheetRef.current?.present();
      return;
    }
    if (action === 'edit_company' && data?.company) {
      router.push({ pathname: '/modal/edit-company', params: { id: data.company.id } } as Href);
      return;
    }
    if (['link_company', 'edit_company', 'link_contact', 'create_contact'].includes(action)) {
      router.push({ pathname: '/modal/opportunity-relations', params: { id } } as unknown as Href);
      return;
    }
    if (action === 'record_first_contact') {
      router.push({ pathname: '/modal/opportunity-contact', params: { id, title: data?.title ?? '' } } as Href);
      return;
    }
    if (action === 'record_visit') {
      router.push({ pathname: '/modal/visit-new', params: { opportunityId: id, companyId: companyIdForDocs ?? '', companyName: companyNameForDocs, contactId: data?.primaryContact?.id ?? '' } } as Href);
      return;
    }
    if (action === 'record_call') {
      router.push({ pathname: '/modal/call-new', params: { opportunityId: id, companyId: companyIdForDocs ?? '', companyName: companyNameForDocs, contactId: data?.primaryContact?.id ?? '' } } as Href);
      return;
    }
    if (action === 'reserve_stock') {
      if (showStock) router.push({ pathname: '/modal/opportunity-stock', params: { id } } as Href);
      return;
    }
    if (action === 'open_installation' || action === 'complete_installation') {
      if (showInstallations) router.push({ pathname: '/modal/opportunity-operations', params: { id, kind: 'installation' } } as Href);
      return;
    }
    if (action.startsWith('approve_')) {
      contentRef.current?.scrollTo({ y: Math.max(0, approvalsY.current - 16), animated: true });
      return;
    }
    router.push({ pathname: '/modal/opportunity-edit', params: { id } } as unknown as Href);
  }

  function advanceProcess() {
    const readiness = data?.processReadiness;
    const next = readiness?.targets.find((target) => target.axis === 'qualification' && target.direction === 'forward');
    if (!readiness || !next || !canUpdate) return;
    if (readiness.currentQualificationStage === 'lead') {
      convertLead.mutate(
        { id, note: 'Eski ilk temas kaydı C alanına taşındı' },
        {
          onSuccess: () => toast.success('Fırsat C alanına taşındı'),
          onError: (error) => toast.error(error.message),
        },
      );
      return;
    }
    setStage.mutate(
      { id, toStage: next.code as QualificationStage },
      {
        onSuccess: () => toast.success(`${qualificationStageLabels[next.code as QualificationStage] ?? next.code} alanına geçildi`),
        onError: (error) => toast.error(error.message),
      },
    );
  }

  function openShipmentCreate() {
    if (!companyIdForDocs) {
      toast.error('Önce firma bağlayın');
      return;
    }
    router.push({
      pathname: '/modal/shipment-new',
      params: { companyId: companyIdForDocs, companyName: companyNameForDocs, opportunityId: id, opportunityName: data?.title ?? 'Fırsat' },
    } as unknown as Href);
  }

  function handleModuleTile(key: string, listRoute: string) {
    if (!tileAllowed[key]) return;
    if (key === 'quote') {
      if (opportunityQuotes.length) setWorkspaceTab('teklifler');
      else if (canPerformAction('create_quote') && !isClosed) openQuoteCreate();
      else router.push(listRoute as Href);
      return;
    }
    if (key === 'proforma') {
      if (canPerformAction('create_proforma') && !isClosed) openLinkedDoc('proforma');
      else if (showProformas) router.push(listRoute as Href);
      return;
    }
    if (key === 'commercial_invoice') {
      if (canPerformAction('create_commercial_invoice') && !isClosed) openLinkedDoc('invoice');
      else setWorkspaceTab('belgeler');
      return;
    }
    if (key === 'shipment') {
      if (canPerformAction('create_shipment') && !isClosed) openShipmentCreate();
      else router.push(listRoute as Href);
      return;
    }
    if (key === 'stock' && !showStock) return;
    if (key === 'installation' && !showInstallations) return;
    router.push(listRoute as Href);
  }

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

  // Onay haritası (web SalesCaseDetail ile aynı kaynaklar)
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
          style: decision === 'rejected' ? 'destructive' : 'default',
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

      <ScrollView ref={sectionTabsRef} horizontal showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0, flexShrink: 0 }} contentContainerStyle={{ gap: 8, padding: 16, paddingBottom: 12 }}>
        {workspaceTabs.map((tab) => <Pressable key={tab.value} accessibilityRole="tab"
          accessibilityState={{ selected: workspaceTab === tab.value }}
          onLayout={(event) => { tabPositions.current[tab.value] = event.nativeEvent.layout.x; }}
          onPress={() => {
            setWorkspaceTab(tab.value);
            sectionTabsRef.current?.scrollTo({ x: Math.max(0, (tabPositions.current[tab.value] ?? 0) - 16), animated: true });
          }}
          className={`min-h-11 items-center justify-center rounded-control border px-4 ${workspaceTab === tab.value ? 'border-primary bg-primary' : 'border-border bg-card'}`}>
          <Text className={`font-inter-medium text-[13px] ${workspaceTab === tab.value ? 'text-primary-foreground' : 'text-foreground'}`}>{tab.label}</Text>
        </Pressable>)}
      </ScrollView>
      <ScrollView ref={contentRef} keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ gap: 16, paddingHorizontal: SCREEN_PAD, paddingBottom: GLASS_TAB_BAR_HEIGHT + 32, paddingTop: 4 }}
      >
        {neighbors.previous || neighbors.next ? (
          <View className="flex-row justify-between gap-3">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Önceki fırsat"
              accessibilityState={{ disabled: !neighbors.previous }}
              disabled={!neighbors.previous}
              onPress={() => neighbors.previous && router.replace(`/modules/opportunities/${neighbors.previous}` as Href)}
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
              onPress={() => neighbors.next && router.replace(`/modules/opportunities/${neighbors.next}` as Href)}
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
                className="min-h-11 justify-center self-start active:opacity-70"
              >
                <View className="flex-row items-center gap-1.5 rounded-[10px] border border-stage-border bg-stage-soft px-3 py-1.5">
                  <View className="h-2 w-2 rounded-full" style={{ backgroundColor: colors.stage }} />
                  <Text className="font-inter-medium text-[13px] text-stage">{qualificationStageLabels[stage]}</Text>
                  {canUpdate ? <Ionicons name="chevron-down" size={15} color={colors.stage} /> : null}
                </View>
              </Pressable>
              <Text className="text-[24px] font-display-semibold leading-[30px] text-foreground" numberOfLines={3}>{data.title}</Text>
              <Text className="font-inter text-[13px] text-muted-foreground" numberOfLines={2}>{company ?? 'Firma bağlanmadı'}</Text>
            </View>
            <View className="max-w-[43%] items-end pt-2">
              <Text className="font-inter text-[12px] text-muted-foreground">Tahmini Tutar</Text>
              <Text className="text-right text-[22px] font-inter-bold text-primary" numberOfLines={1} adjustsFontSizeToFit>
                {formatAmount(data.estimatedValue, data.currency?.code ?? 'TRY')}
              </Text>
              <Text className="font-inter-medium text-[12px] text-primary">%{data.probability} olasılık</Text>
            </View>
          </View>
        </View>

        {workspaceTab === 'ozet' ? <>
          <Card className="gap-1">
            <Eyebrow>Firma ve iletişim</Eyebrow>
            <OpportunityFact icon="business-outline" label="Firma" value={company ?? 'Firma bağlanmadı'}
              onPress={data.company?.id && canReadCompanies ? () => router.push(`/modules/companies/${data.company!.id}`) : undefined} />
            <OpportunityFact icon="person-outline" label="İlgili kişi" value={contactName ?? 'Belirtilmedi'} />
            <OpportunityFact icon="call-outline" label="Telefon" value={phone ?? 'Belirtilmedi'} onPress={phone ? () => void startCrmCall(phone, { companyId: data.company?.id ?? data.companyId ?? undefined, contactId: data.primaryContact?.id }) : undefined} />
            <OpportunityFact icon="mail-outline" label="E-posta" value={data.leadEmail ?? 'Belirtilmedi'} />
            <OpportunityFact icon="location-outline" label="İl / İlçe" value={[data.leadCity, data.leadDistrict].filter(Boolean).join(' / ') || 'Belirtilmedi'} />
            <QuickContactRow opportunityId={data.id} phone={phone ?? (data.leadContactValue as string | null | undefined)} email={data.leadEmail}
              companyId={data.company?.id ?? data.companyId} name={contactName ?? data.title} />
          </Card>
          <Card className="gap-1">
            <Eyebrow>Makine ve satış bilgileri</Eyebrow>
            <OpportunityFact icon="cube-outline" label="Makine" value={Array.isArray(data.products) && data.products.length
              ? data.products.map((row) => `${row.machineName}${Number(row.quantity) > 1 ? ` ×${row.quantity}` : ''}`).join(', ')
              : data.requestedMachine ?? 'Belirtilmedi'} />
            <OpportunityFact icon="person-circle-outline" label="Sorumlu" value={ownerName ?? 'Atanmadı'}
              onPress={canAssignOwner ? () => ownerSheetRef.current?.present() : undefined} />
            <OpportunityFact icon="pulse-outline" label="İlk temas" value={followUpLabel}
              onPress={canUpdate ? () => followUpSheetRef.current?.present() : undefined} />
            <OpportunityFact icon="git-branch-outline" label="Operasyon" value={data.stage?.name ?? 'Belirtilmedi'} />
            <OpportunityFact icon="megaphone-outline" label="Kaynak" value={data.source?.name ?? 'Belirtilmedi'} />
            <OpportunityFact icon="calendar-outline" label="Oluşturma" value={formatDate(data.createdAt)} />
            <OpportunityFact icon="flag-outline" label="Beklenen kapanış" value={data.expectedCloseDate ? formatDate(data.expectedCloseDate) : 'Planlanmadı'} />
          </Card>
          <OpportunityTasksPanel opportunityId={id} />
        </> : null}

        {workspaceTab === 'surec' && (data.nextAction || canUpdate) ? (
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
                  className="min-h-11 items-center justify-center rounded-[10px] border border-border px-3 active:opacity-70"
                >
                  <Text className="font-inter-medium text-[13px] text-primary">{data.nextAction ? 'Düzenle' : 'Planla'}</Text>
                </Pressable>
              ) : null}
            </View>
          </Card>
        ) : null}

        {workspaceTab === 'ozet' && data.description ? (
          <Card className="gap-1.5">
            <Eyebrow>Açıklama</Eyebrow>
            <Text className="font-inter text-sm text-foreground">{data.description}</Text>
          </Card>
        ) : null}

        {workspaceTab === 'ozet' && data.contractTerms ? (
          <Card className="gap-2"><Eyebrow>Sözleşme şartları</Eyebrow>
            <Text className="font-inter text-sm text-foreground">{data.contractTerms}</Text>
          </Card>
        ) : null}

        {workspaceTab === 'surec' ? (
        <View className="gap-3">
          {data.processReadiness?.targets?.length ? (
            <>
            {processTarget && qualificationStageLabels[processTarget as QualificationStage] ? (
              <Card className="gap-1">
                <Text className="font-inter-semibold text-sm text-foreground">Hedef: {qualificationStageLabels[processTarget as QualificationStage]}</Text>
                <Text className="font-inter text-xs text-muted-foreground">Aşağıdaki görevleri tamamlayıp alanları sırayla ilerletin. Tamamlanan işlemler dönüşte güncellenir.</Text>
              </Card>
            ) : null}
            <ProcessAdvanceCard
              readiness={data.processReadiness}
              canUpdate={canUpdate}
              disqualified={data.leadFollowUpStatus === 'disqualified'}
              advancing={setStage.isPending || convertLead.isPending}
              onAdvance={advanceProcess}
              onOpenTask={openProcessTask}
              onToggleManual={(check) => toggleCheck(check.key, check.complete)}
              onEditNote={checkNote.open}
              canPerformAction={canPerformAction}
            />
            </>
          ) : null}
          {[
            [
              ...(showActivities
                ? [
                    <OpportunityModuleTile
                      key="activities"
                      icon="calendar-outline"
                      label="Aktiviteler"
                      count={activityCount}
                      onPress={() => setWorkspaceTab('aktivite')}
                    />,
                  ]
                : []),
              ...MODULE_TILES.filter((tile) => tileAllowed[tile.key]).map((tile) => (
                <OpportunityModuleTile
                  key={tile.key}
                  icon={tile.icon}
                  label={tile.label}
                  available={evidenceByKey.get(tile.key) ?? false}
                  onPress={() => handleModuleTile(tile.key, tile.listRoute)}
                />
              )),
              ...(showDocuments
                ? [
                    <OpportunityModuleTile
                      key="documents"
                      icon="add-circle-outline"
                      label="Belge oluştur"
                      onPress={() => docsSheetRef.current?.present()}
                    />,
                  ]
                : []),
            ],
          ]
            .flat()
            .reduce<ReactElement[][]>((rows, tile, index) => {
              if (index % 2 === 0) rows.push([]);
              rows[rows.length - 1]?.push(tile);
              return rows;
            }, [])
            .map((row) => (
              <View key={row[0]?.key} className="flex-row gap-3">
                {row}
              </View>
            ))}
        </View>
        ) : null}

        {workspaceTab === 'surec' && checks.length > 0 && !data.processReadiness?.checks?.some((check) => check.qualificationStage) ? (
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
                    <View key={check.key} className="w-full min-h-11">
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
                    className="w-full min-h-11 justify-center opacity-100 active:opacity-60"
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

        {workspaceTab === 'surec' && (pendingApprovals.length > 0 || settledApprovals.length > 0) && canApprove ? (
          <View onLayout={(event) => { approvalsY.current = event.nativeEvent.layout.y; }}><Card className="gap-2">
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
          </Card></View>
        ) : null}

        {workspaceTab === 'surec' ? <>
          {showShipments || showInstallations ? <Card className="gap-3">
            <Eyebrow>Sevkiyat, teslim ve kurulum</Eyebrow>
            <Text className="font-inter text-[13px] text-muted-foreground">Mevcut operasyon: {data.stage?.name ?? 'Belirtilmedi'}</Text>
            {canPerformAction('create_shipment') && !isClosed ? <Button label="Sevkiyat oluştur" variant="ghost" onPress={openShipmentCreate} /> : null}
            {showShipments ? <Button label="Sevkiyat modülünü aç" variant="ghost" onPress={() => router.push('/modules/shipments' as Href)} /> : null}
            {showInstallations ? <Button label="Kurulum modülünü aç" variant="ghost" onPress={() => handleModuleTile('installation', '/modules/installations')} /> : null}
          </Card> : null}
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

        {/* Web CloseCaseDialog: iptal vs kayıp — açık kartlarda. */}
        {canMarkOpportunityClosed({
          canUpdate,
          closedAt: data.closedAt,
          qualificationStage: stage,
          pipelineStageCode: data.stage?.code,
        }) ? (
          <Button
            label="Fırsatı Kapat (İptal / Kayıp)"
            variant="ghost"
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              markClosedSheetRef.current?.present({
                productName: data.requestedMachine ?? data.wonProductName ?? null,
              });
            }}
          />
        ) : null}

        {/* Fırsatı arşive al / yeniden aç — web Geçmiş görünümüyle aynı akış. */}
        {(stage === 'win' || stage === 'lost') && canUpdate ? (
          isClosed ? (
            <Button label="Yeniden Aç" variant="ghost" loading={reopenCase.isPending} disabled={reopenCase.isPending} onPress={handleReopenCase} />
          ) : (
            <Button
              label="Geçmişe Al"
              variant="ghost"
              loading={closeCase.isPending}
              disabled={closeCase.isPending}
              onPress={() => {
                if (stage === 'win') {
                  setCloseReason(data.wonReason ?? '');
                  closeSheetRef.current?.present();
                  return;
                }
                Alert.alert('Geçmişe Al', 'Kayıp nedeni korunarak kart geçmişe alınacak.', [
                  { text: 'Vazgeç', style: 'cancel' },
                  { text: 'Geçmişe Al', style: 'destructive', onPress: () => handleCloseCase(data.lostReason?.name) },
                ]);
              }}
            />
          )
        ) : null}

        </> : null}

        {workspaceTab === 'ozet' && data.externalSource ? (
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

        {workspaceTab === 'ozet' && (data.qualificationHistory?.length || data.history?.length) ? (
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
        {workspaceTab === 'teklifler' ? (
        <Card className="gap-1.5">
          <Eyebrow>Teklifler ({opportunityQuotes.length})</Eyebrow>
          {quoteList.isPending ? (
            <Loading />
          ) : quoteList.error ? (
            <ErrorState message={quoteList.error.message} onRetry={() => void quoteList.refetch()} />
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
                          label: quote.status.name,
                          tone: QUOTE_STATUS_TONE[quote.status.code] ?? 'neutral',
                        }
                      : undefined
                  }
                  trailing={formatAmount(quote.grandTotal, quote.currency?.code ?? 'TRY')}
                  trailingTone="neutral"
                  onPress={() => router.push(`/modules/quotes/${quote.id}`)}
                />
              ))}
              {stage !== 'lost' && soldQuotes.length === 0 ? (
                <Text className="font-inter text-[12px] text-muted-foreground">
                  Hiçbir teklif satılmadı. WIN'e geçmek için satılan teklifi açıp onaylayın.
                </Text>
              ) : null}
            </>
          )}
          {canPerformAction('create_quote') && !isClosed ? (
            data.company ? (
              <Button
                label="Teklif oluştur"
                variant="ghost"
                trailingIcon="add"
                onPress={openQuoteCreate}
              />
            ) : (
              <Text className="font-inter text-[12px] text-muted-foreground">Teklif oluşturmak için önce firma bağlayın.</Text>
            )
          ) : null}
        </Card>
        ) : null}

        {workspaceTab === 'belgeler' ? (
          <View className="gap-3">
            <Card className="gap-2">
              <Eyebrow>Belge oluştur</Eyebrow>
              <Text className="font-inter text-[12px] text-muted-foreground">
                Bu süreç merkeziyle aynı: tekliften proforma, sözleşme ve ticari fatura.
              </Text>
              {canPerformAction('create_proforma') && !isClosed ? (
                <Button label="Proforma oluştur" variant="ghost" trailingIcon="add" onPress={() => openLinkedDoc('proforma')} />
              ) : null}
              {canPerformAction('create_contract') && !isClosed ? (
                <Button label="Sözleşme oluştur" variant="ghost" trailingIcon="add" onPress={() => openLinkedDoc('contract')} />
              ) : null}
              {canPerformAction('create_commercial_invoice') && !isClosed ? (
                <Button label="Ticari fatura oluştur" variant="ghost" trailingIcon="add" onPress={() => openLinkedDoc('invoice')} />
              ) : null}
              <Button
                label="Dosya yükle / dış teklif"
                variant="ghost"
                trailingIcon="cloud-upload-outline"
                onPress={() => docsSheetRef.current?.present()}
              />
            </Card>
            <OpportunityDocuments opportunityId={id} />
          </View>
        ) : null}

        {workspaceTab === 'odemeler' ? (
          <View className="gap-4">
          <OpportunityPaymentTermsPanel key={id} opportunity={data} canEdit={canUpdate && !isClosed} />
          <Card className="gap-2">
            <Eyebrow>Ödeme planı</Eyebrow>
            <Text className="font-inter text-[12px] text-muted-foreground">
              Vadeli satışlarda taksit alacaklarını oluşturun; peşin ve leasingde yalnız yöntem kaydedilir.
            </Text>
            {canPerformAction('create_payment_plan') && !isClosed ? (
              <Button label="Ödeme planı oluştur" trailingIcon="add" onPress={openPaymentPlan} />
            ) : null}
            {showReceivables ? <Button label="Alacak listesini aç" variant="ghost"
              onPress={() => router.push('/modules/receivables' as Href)} /> : null}
            {canCreatePayment && !isClosed ? <Button
              label="Ödeme kaydet"
              variant="ghost"
              onPress={() =>
                router.push(
                  (companyIdForDocs
                    ? `/modal/payment?companyId=${encodeURIComponent(companyIdForDocs)}`
                    : '/modal/payment') as Href,
                )
              }
            /> : null}
          </Card>
          </View>
        ) : null}

        {workspaceTab === 'ozet' && stage === 'lost' && (data.lostReason || data.lostCompetitor || data.lostCompetitorName || data.lostProductName) ? (
          <Card className="gap-1.5">
            <Eyebrow>Kayıp Bilgileri</Eyebrow>
            <InfoRows
              items={[
                { label: 'Kayıp nedeni', value: data.lostReason?.name },
                { label: 'Kaybedilen ürün', value: data.lostProductName },
                { label: 'Rakip', value: data.lostCompetitor?.name ?? data.lostCompetitorName },
                { label: 'Rakip ürünü', value: data.lostCompetitorProductModel },
                { label: 'Karşılanamayan koşullar', value: data.lostUnmetConditions },
              ]}
            />
          </Card>
        ) : null}

        {workspaceTab === 'ozet' && stage === 'win' && (data.wonProductName || data.wonReason) ? (
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

        {workspaceTab === 'aktivite' ? (
          <OpportunityActivityFeed opportunityId={id} companyId={data.company?.id ?? null} title={data.title} />
        ) : null}
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
            <View className="mt-2">
              <LostCaseFields value={lost} onChange={setLost} productPlaceholder={data.requestedMachine} />
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
                  if (onlyQuote && showQuotes) router.push(`/modules/quotes/${onlyQuote.id}`);
                  else if (showQuotes) setWorkspaceTab('teklifler');
                }}
              />
            </View>
          ) : null}

          {stageError ? <Text className="font-inter text-xs text-destructive">{stageError}</Text> : null}

          {targetStage && targetStage !== stage && !(targetStage === 'win' && soldQuotes.length === 0) ? (
            <Button
              label={`${qualificationStageLabels[targetStage]} Yap`}
              onPress={() => applyStage(targetStage, isBackwardMove)}
              loading={setStage.isPending}
              disabled={setStage.isPending}
            />
          ) : null}
        </BottomSheetView>
      </BottomSheetModal> : null}
    
      <BottomSheetModal
        ref={docsSheetRef}
        enableDynamicSizing
        backgroundStyle={{ backgroundColor: colors.card }}
        handleIndicatorStyle={{ backgroundColor: colors.mutedForeground }}
        backdropComponent={(props) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />}
      >
        <BottomSheetView className="gap-2 px-5 pb-10 pt-2">
          <Text className="font-inter-semibold text-base text-foreground">Belge ve süreç</Text>
          <Text className="mb-1 font-inter text-xs text-muted-foreground">
            Teklif ve belgeler bu fırsata bağlanır.
          </Text>
          {canPerformAction('create_quote') && !isClosed ? (
            <Button
              label="Teklif oluştur"
              variant="ghost"
              onPress={() => {
                docsSheetRef.current?.dismiss();
                openQuoteCreate();
              }}
            />
          ) : null}
          {canPerformAction('create_proforma') && !isClosed ? (
            <Button
              label="Proforma oluştur"
              variant="ghost"
              onPress={() => {
                docsSheetRef.current?.dismiss();
                openLinkedDoc('proforma');
              }}
            />
          ) : null}
          {canPerformAction('create_contract') && !isClosed ? (
            <Button
              label="Sözleşme oluştur"
              variant="ghost"
              onPress={() => {
                docsSheetRef.current?.dismiss();
                openLinkedDoc('contract');
              }}
            />
          ) : null}
          {canPerformAction('create_commercial_invoice') && !isClosed ? (
            <Button
              label="Ticari fatura oluştur"
              variant="ghost"
              onPress={() => {
                docsSheetRef.current?.dismiss();
                openLinkedDoc('invoice');
              }}
            />
          ) : null}
          {canPerformAction('create_payment_plan') && !isClosed ? (
            <Button
              label="Ödeme planı oluştur"
              variant="ghost"
              onPress={() => {
                docsSheetRef.current?.dismiss();
                openPaymentPlan();
              }}
            />
          ) : null}
          {canPerformAction('create_shipment') && !isClosed ? (
            <Button
              label="Sevkiyat oluştur"
              variant="ghost"
              onPress={() => {
                docsSheetRef.current?.dismiss();
                openShipmentCreate();
              }}
            />
          ) : null}
          {showDocuments ? (
            <Button
              label="Belgeler sekmesine git"
              variant="ghost"
              onPress={() => {
                docsSheetRef.current?.dismiss();
                setWorkspaceTab('belgeler');
              }}
            />
          ) : null}
        </BottomSheetView>
      </BottomSheetModal>

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
                label="Belge / süreç oluştur"
                variant="ghost"
                onPress={() => {
                  moreSheetRef.current?.dismiss();
                  docsSheetRef.current?.present();
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
              {canAssignOwner ? <Button
                label="Sorumlu ata"
                variant="ghost"
                onPress={() => {
                  moreSheetRef.current?.dismiss();
                  ownerSheetRef.current?.present();
                }}
              /> : null}
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
                          goBack();
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
          <Text className="font-inter-semibold text-base text-foreground">Geçmişe Al</Text>
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

      <CloseCaseSheet
        ref={markClosedSheetRef}
        opportunityId={id}
        caseName={company ?? data.title}
        onClosed={() => void refetch()}
      />
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
