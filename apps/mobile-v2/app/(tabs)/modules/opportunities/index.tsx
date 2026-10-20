import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import { useAuth, useCan } from '@/src/auth/AuthProvider';
import {
  useCloseOpportunity,
  useDeleteOpportunity,
  useOpportunityAssignees,
  useReopenOpportunity,
  useUpdateOpportunity,
} from '@/src/api/crm.hooks';
import { useLeadSummary, useSalesAnalytics, useSalesCounts, useSalesList } from '@/src/api/sales.hooks';
import type { SalesListQuery, SalesOpportunityRow } from '@/src/api/sales.api';
import { exportService } from '@/src/api/exports';
import { formatAmount, formatDate } from '@/src/lib/format';
import { useDebouncedValue } from '@/src/lib/useDebouncedValue';
import { useTheme, type Tone } from '@/src/theme/theme';
import { Button, Chip, EmptyState, ErrorState, Fab, Field, ListSkeleton, Loading, SCREEN_PAD, ScreenHeader, SearchBar } from '@/src/ui';
import { Tabs } from '@/src/ui/data';
import { toast } from '@/src/ui/toast';
import { QualificationBoard, STAGE_TONE } from '@/src/ui/sales/QualificationBoard';
import { PillGroup, SalesSheet, SheetOption } from '@/src/ui/sales/Sheet';
import { setOpportunityOrder } from '@/src/ui/sales/opportunity-order';
import {
  asQualification,
  canMarkOpportunityClosed,
  COMPANY_DECISION_LABELS,
  currencyOptions,
  filterAndSortRows,
  focusServerQuery,
  isSalesFocus,
  LIST_SORT_LABELS,
  matchesFocus,
  partyName,
  QUALIFICATION_LABELS,
  QUALIFICATION_ORDER,
  reasonStats,
  SALES_FOCUS_LABELS,
  type CompanyDecision,
  type ListSort,
  type Qualification,
  type ReasonStat,
} from '@/src/ui/sales/sales-logic';
import { CloseCaseSheet, type CloseCaseSheetHandle } from '@/src/ui/sales/CloseCaseSheet';

type View3 = 'list' | 'kanban' | 'archive';
type ResultFilter = 'follow_up' | 'won' | 'lost';

const RESULT_LABELS: Record<ResultFilter, string> = { follow_up: 'İleri takipte', won: 'Kazanılan', lost: 'Kaybedilen' };
const RESULT_TONE: Record<ResultFilter, Tone> = { follow_up: 'warning', won: 'success', lost: 'destructive' };

/**
 * Risk rozeti sunucunun `qualificationReadiness.health` bayraklarından;
 * sahipsiz kart web'deki gibi ayrıca işaretlenir.
 */
function riskOf(item: SalesOpportunityRow): { label: string; tone: Tone } {
  if (item.qualificationStage === 'lost') return { label: 'Kaybedildi', tone: 'destructive' };
  if (!item.ownerUserId) return { label: 'Sahipsiz', tone: 'destructive' };
  const health = item.qualificationReadiness?.health;
  if (health?.rotting || health?.leadSlaBreached || health?.actionOverdue) return { label: 'Gecikiyor', tone: 'destructive' };
  if (health?.actionMissing) return { label: 'Takipsiz', tone: 'warning' };
  return { label: 'Akışta', tone: 'success' };
}

function amountText(item: SalesOpportunityRow): string | null {
  return Number(item.estimatedValue ?? 0) ? formatAmount(item.estimatedValue, item.currency?.code ?? 'TRY') : null;
}

function contactLine(item: SalesOpportunityRow): string {
  return [item.leadContactName !== partyName(item) ? item.leadContactName : null, item.leadPhone, item.leadEmail].filter(Boolean).join(' · ');
}

function lostDetail(item: SalesOpportunityRow): string[] {
  return [
    item.lostReason?.name ?? 'Kayıp nedeni belirtilmedi',
    `Rakip: ${[item.lostCompetitor?.name, item.lostCompetitorProductModel].filter(Boolean).join(' · ') || 'yok / bilinmiyor'}`,
    `Uymayan şartlar: ${item.lostUnmetConditions || 'belirtilmedi'}`,
  ];
}

function SalesRow({
  item,
  ownerName,
  onOpen,
  onMenu,
}: {
  item: SalesOpportunityRow;
  ownerName: string | null;
  onOpen: () => void;
  onMenu: () => void;
}) {
  const { colors } = useTheme();
  const stage = asQualification(item.qualificationStage);
  const risk = riskOf(item);
  const party = partyName(item);
  const contact = contactLine(item);
  const amount = amountText(item);
  const machine = (stage === 'win' ? item.wonProductName : null) ?? item.requestedMachine ?? item.title;
  const nextLine = item.nextAction
    ? `${item.nextAction}${item.nextActionAt ? ` · ${formatDate(item.nextActionAt)}` : ''}`
    : 'Sonraki aktivite planlanmamış';
  const detailLine = [
    machine,
    contact || null,
    item.stage ? `Operasyon: ${item.stage.name}` : null,
    `Atanan: ${ownerName ?? 'Atanmadı'}`,
    formatDate(item.createdAt),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View className="my-1 flex-row rounded-overlay border border-border bg-card">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${party} fırsat detayını aç`}
        onPress={onOpen}
        className="min-h-[52px] flex-1 gap-1 px-3.5 py-2.5 active:opacity-70"
      >
        <View className="flex-row items-center gap-1.5">
          <Text className="min-w-0 flex-1 font-inter-semibold text-[15px] text-foreground" numberOfLines={1}>
            {party}
          </Text>
          {amount ? <Text className="font-inter-semibold text-[13px] text-primary">{amount}</Text> : null}
        </View>
        <Text className="font-inter text-[12px] text-muted-foreground" numberOfLines={1}>
          {detailLine}
        </Text>
        <View className="flex-row flex-wrap items-center gap-1">
          <Chip tone={STAGE_TONE[stage]} label={QUALIFICATION_LABELS[stage]} />
          <Chip tone={risk.tone} label={risk.label} />
          {!item.company ? <Chip tone="warning" label="Firma bekliyor" /> : null}
        </View>
        <Text className="font-inter text-[11px] text-muted-foreground" numberOfLines={1}>
          {nextLine}
        </Text>
        {stage === 'lost'
          ? lostDetail(item).map((line, index) => (
              <Text key={index} className={`font-inter text-[11px] ${index === 0 ? 'text-destructive' : 'text-muted-foreground'}`} numberOfLines={1}>
                {line}
              </Text>
            ))
          : null}
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${party} hızlı işlemleri`}
        onPress={onMenu}
        className="min-w-[44px] items-center justify-center active:opacity-60"
      >
        <Ionicons name="ellipsis-vertical" size={18} color={colors.foreground} />
      </Pressable>
    </View>
  );
}

function ArchiveRow({
  item,
  canReopenLost,
  canDelete,
  busy,
  onOpen,
  onReopen,
  onDelete,
}: {
  item: SalesOpportunityRow;
  canReopenLost: boolean;
  canDelete: boolean;
  busy: boolean;
  onOpen: () => void;
  onReopen: () => void;
  onDelete: () => void;
}) {
  const stage = asQualification(item.qualificationStage);
  const party = partyName(item);
  const lost = stage === 'lost';
  return (
    <View className="my-1 gap-2 rounded-overlay border border-border bg-card px-3.5 py-3">
      <Pressable accessibilityRole="button" accessibilityLabel={`${party} fırsat detayını aç`} onPress={onOpen} className="min-h-[44px] gap-1 active:opacity-70">
        <Text className="font-inter-semibold text-[15px] text-foreground" numberOfLines={1}>
          {party}
        </Text>
        <Text className="font-inter text-xs text-muted-foreground" numberOfLines={1}>
          {[item.lostProductName || item.requestedMachine, `#${item.id.slice(0, 8).toUpperCase()}`].filter(Boolean).join(' · ')}
        </Text>
        <View className="flex-row items-center gap-2">
          <Chip tone={STAGE_TONE[stage]} label={QUALIFICATION_LABELS[stage]} />
          <Text className="font-inter text-[11px] text-muted-foreground">Kapanış: {item.closedAt ? formatDate(item.closedAt) : '—'}</Text>
        </View>
        {lost
          ? lostDetail(item).map((line, index) => (
              <Text key={index} className={`font-inter text-[11px] ${index === 0 ? 'text-destructive' : 'text-muted-foreground'}`} numberOfLines={2}>
                {line}
              </Text>
            ))
          : null}
        {stage === 'win' ? (
          <>
            <Text className="font-inter-medium text-[12px] text-success">{item.wonProductName || 'Satılan makine kaydı yok'}</Text>
            <Text className="font-inter text-[11px] text-muted-foreground">{item.wonReason || 'Kapanış nedeni belirtilmedi'}</Text>
          </>
        ) : null}
      </Pressable>
      <View className="flex-row gap-2">
        {!lost || canReopenLost ? (
          <View className="flex-1">
            <Button
              label={lost ? 'Önceki Satış Alanına Aç' : 'Geri Aç'}
              variant="ghost"
              disabled={busy}
              onPress={onReopen}
            />
          </View>
        ) : null}
        {canDelete ? (
          <View className="flex-1">
            <Button label="Sil" variant="destructive" disabled={busy} onPress={onDelete} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

function ResultCounter({
  filter,
  count,
  selected,
  onPress,
}: {
  filter: ResultFilter;
  count: number | null;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const tone = RESULT_TONE[filter];
  const color = tone === 'warning' ? colors.warning : tone === 'success' ? colors.success : colors.destructive;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${RESULT_LABELS[filter]}: ${count ?? 'yükleniyor'}`}
      accessibilityState={{ selected }}
      onPress={onPress}
      className={`min-h-[64px] flex-1 justify-center rounded-[12px] border px-3 py-2 active:opacity-70 ${selected ? 'border-primary bg-secondary' : 'border-border bg-card'}`}
    >
      <Text className="font-inter-medium text-[12px]" style={{ color }}>
        {RESULT_LABELS[filter]}
      </Text>
      <Text className="font-display-semibold text-[20px] text-foreground">{count ?? '…'}</Text>
    </Pressable>
  );
}

function LeadSummaryBody() {
  const summary = useLeadSummary();
  if (summary.isPending) return <Loading />;
  if (summary.error) return <ErrorState message={summary.error.message} onRetry={() => void summary.refetch()} />;
  const data = summary.data;
  const pct = (value: number | null) => (value === null ? '—' : `%${Math.round(value * 100)}`);
  const rows: [string, string][] = [
    ['Oluşturulan lead', String(data.totalCreated)],
    ['Aktif lead', String(data.activeLeads)],
    ['İlk temas (medyan)', data.medianFirstContactHours === null ? '—' : `${data.medianFirstContactHours.toFixed(1)} sa`],
    ['4 saatte temas', pct(data.contactedWithinFourHoursRate)],
    ['SLA ihlali', String(data.slaBreaches)],
    ['Aksiyonsuz', String(data.actionlessLeads)],
    ['Sahipsiz', String(data.unassignedLeads)],
    ['Dönüşüm oranı', pct(data.conversionRate)],
    ['Gerekçeli dönüşüm', pct(data.justifiedConversionRate)],
  ];
  const buckets: [string, typeof data.bySource][] = [
    ['Kaynağa göre', data.bySource],
    ['Ürüne göre', data.byProduct],
    ['Sorumluya göre', data.byOwner],
  ];
  return (
    <View className="gap-3">
      <View className="gap-1">
        {rows.map(([label, value]) => (
          <View key={label} className="flex-row justify-between border-b border-border py-1.5">
            <Text className="font-inter text-[13px] text-muted-foreground">{label}</Text>
            <Text className="font-inter-semibold text-[13px] text-foreground">{value}</Text>
          </View>
        ))}
      </View>
      {buckets.map(([title, list]) =>
        list.length ? (
          <View key={title} className="gap-1">
            <Text className="font-inter-semibold text-[13px] text-foreground">{title}</Text>
            {list.slice(0, 6).map((bucket) => (
              <Text key={bucket.key} className="font-inter text-[12px] text-muted-foreground">
                {`${bucket.label}: ${bucket.converted}/${bucket.total} · ${pct(bucket.conversionRate)}`}
              </Text>
            ))}
          </View>
        ) : null
      )}
    </View>
  );
}

export default function OpportunitiesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ focus?: string; view?: string; stageCode?: string; stageName?: string; qualification?: string }>();
  const { user } = useAuth();
  const canCreate = useCan('opportunities.create');
  const canUpdate = useCan('opportunities.update');
  const canDelete = useCan('opportunities.delete');
  const canExport = useCan('reports.export');
  const canAssignOwner = Boolean(user?.roles?.includes('sales') || user?.roles?.includes('super_admin'));
  const canReopenLost = canAssignOwner && canUpdate;

  const [view, setView] = useState<View3>(params.view === 'list' || params.view === 'archive' ? params.view : 'kanban');
  const [focus, setFocus] = useState(isSalesFocus(params.focus) ? params.focus : null);
  const [search, setSearch] = useState('');
  const [stage, setStage] = useState<Qualification | null>(
    QUALIFICATION_ORDER.includes(params.qualification as Qualification) ? (params.qualification as Qualification) : null
  );
  const [pipelineStage, setPipelineStage] = useState<{ code: string; name: string } | null>(
    params.stageCode ? { code: params.stageCode, name: params.stageName ?? params.stageCode } : null
  );
  const [currency, setCurrency] = useState<string | null>(null);
  const [companyDecision, setCompanyDecision] = useState<CompanyDecision | null>(null);
  const [result, setResult] = useState<ResultFilter | null>(null);
  const [reason, setReason] = useState<ReasonStat | null>(null);
  const [sort, setSort] = useState<ListSort>('newest');
  const [filterOpened, setFilterOpened] = useState(false);
  const [menuItem, setMenuItem] = useState<SalesOpportunityRow | null>(null);
  const [closeItem, setCloseItem] = useState<SalesOpportunityRow | null>(null);
  const [closeReason, setCloseReason] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const serverSearch = useDebouncedValue(search.trim());
  const { colors } = useTheme();

  useEffect(() => {
    if (isSalesFocus(params.focus)) {
      setFocus(params.focus);
      setView(params.focus === 'won' || params.focus === 'lost' || params.focus === 'open' || params.focus === 'today' ? 'list' : 'kanban');
    }
  }, [params.focus]);

  useEffect(() => {
    if (params.stageCode) {
      setPipelineStage({ code: params.stageCode, name: params.stageName ?? params.stageCode });
      setView('list');
    }
  }, [params.stageCode, params.stageName]);

  useEffect(() => {
    if (QUALIFICATION_ORDER.includes(params.qualification as Qualification)) {
      setStage(params.qualification as Qualification);
      setView('list');
    }
  }, [params.qualification]);

  const filterRef = useRef<BottomSheetModal>(null);
  const moreRef = useRef<BottomSheetModal>(null);
  const leadRef = useRef<BottomSheetModal>(null);
  const menuRef = useRef<BottomSheetModal>(null);
  const ownerRef = useRef<BottomSheetModal>(null);
  const closeRef = useRef<BottomSheetModal>(null);
  const markClosedRef = useRef<CloseCaseSheetHandle>(null);
  const [markClosedTarget, setMarkClosedTarget] = useState<{
    id: string;
    name: string;
    product: string | null;
  } | null>(null);

  useEffect(() => {
    if (!markClosedTarget) return;
    const handle = requestAnimationFrame(() => {
      markClosedRef.current?.present({ productName: markClosedTarget.product });
    });
    return () => cancelAnimationFrame(handle);
  }, [markClosedTarget]);

  const focusQuery = focus ? focusServerQuery(focus) : null;
  const resultStage = result === 'won' ? 'win' : result === 'lost' ? 'lost' : undefined;
  const reasonQuery = {
    lostReasonCode: reason?.outcome === 'lost' ? reason.serverValue : undefined,
    wonReason: reason?.outcome === 'won' ? reason.serverValue : undefined,
  };

  const listQuery = useMemo<SalesListQuery>(
    () => ({
      search: serverSearch || undefined,
      view: focusQuery?.view ?? 'active',
      qualificationStage: resultStage ?? stage ?? focusQuery?.qualificationStage,
      stageCode: pipelineStage?.code,
      followUp: result === 'follow_up' ? 'true' : undefined,
      ...reasonQuery,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [serverSearch, focusQuery?.view, focusQuery?.qualificationStage, resultStage, stage, result, reason, pipelineStage]
  );
  const archiveQuery = useMemo<SalesListQuery>(
    () => ({ search: serverSearch || undefined, view: 'closed', qualificationStage: resultStage, ...reasonQuery }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [serverSearch, resultStage, reason]
  );
  const boardQuery = useMemo<SalesListQuery>(() => ({ search: serverSearch || undefined, view: 'active' }), [serverSearch]);

  const list = useSalesList(listQuery, view === 'list');
  const archive = useSalesList(archiveQuery, view === 'archive' && result !== 'follow_up');
  const [closedTotal] = useSalesCounts([{ view: 'closed' }]);
  const [followUpCount, wonCount, lostCount] = useSalesCounts(
    [
      { view: 'active', followUp: 'true' },
      { view: 'all', qualificationStage: 'win' },
      { view: 'all', qualificationStage: 'lost' },
    ],
    filterOpened
  );
  const analytics = useSalesAnalytics(filterOpened);
  const reasons = useMemo(() => reasonStats(analytics.data?.rows ?? []), [analytics.data]);
  const assignees = useOpportunityAssignees();
  const updateOpp = useUpdateOpportunity();
  const closeOpp = useCloseOpportunity();
  const reopenOpp = useReopenOpportunity();
  const deleteOpp = useDeleteOpportunity();

  const loadedRows = list.data?.items ?? [];
  const rows = useMemo(
    () => filterAndSortRows(loadedRows.filter((row) => matchesFocus(row, focus)), { currency, companyDecision }, sort),
    [loadedRows, focus, currency, companyDecision, sort]
  );
  const currencies = useMemo(() => currencyOptions(loadedRows), [loadedRows]);
  const archiveRows = archive.data?.items ?? [];

  const ownerName = (id: string | null) => (id ? assignees.data?.find((a) => a.id === id)?.name ?? null : null);
  const activeFilterCount = [stage, currency, companyDecision, result, reason, focus, pipelineStage].filter(Boolean).length + (sort !== 'newest' ? 1 : 0);

  function openDetail(id: string, ids: string[]) {
    setOpportunityOrder(ids);
    router.push(`/(tabs)/modules/opportunities/${id}`);
  }

  function openFilters() {
    setFilterOpened(true);
    filterRef.current?.present();
  }

  function clearResult() {
    setResult(null);
    setReason(null);
  }

  function exportExcel() {
    moreRef.current?.dismiss();
    exportService
      .opportunities({ search: serverSearch || undefined, qualificationStage: stage ?? undefined })
      .then(() => toast.success('Excel dosyası hazırlandı'))
      .catch((err: Error) => toast.error(`Excel indirilemedi · ${err.message}`));
  }

  function changeOwner(ownerUserId: string | null) {
    const item = menuItem;
    if (!item) return;
    ownerRef.current?.dismiss();
    setBusyId(item.id);
    updateOpp.mutate(
      { id: item.id, ownerUserId },
      {
        onSuccess: () => toast.success('Fırsat sorumlusu güncellendi'),
        onError: (err) => toast.error(`Fırsat sorumlusu güncellenemedi · ${err.message}`),
        onSettled: () => setBusyId(null),
      }
    );
  }

  function reopen(item: SalesOpportunityRow) {
    setBusyId(item.id);
    reopenOpp.mutate(item.id, {
      onSuccess: () => toast.success('Fırsat önceki satış alanına geri açıldı · Kart ve kayıp bilgileri korunarak fırsat panosuna alındı.'),
      onError: (err) => toast.error(`Fırsat geri açılamadı · ${err.message}`),
      onSettled: () => setBusyId(null),
    });
  }

  function confirmDelete(item: SalesOpportunityRow) {
    menuRef.current?.dismiss();
    Alert.alert(
      'Fırsat kartı silinsin mi?',
      `${partyName(item)}\nKart aktif ve geçmiş görünümlerinden kaldırılacak. Bağlı teklif, aktivite ve denetim kayıtları veri bütünlüğü için korunur.`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Fırsat Kartını Sil',
          style: 'destructive',
          onPress: () => {
            setBusyId(item.id);
            deleteOpp.mutate(item.id, {
              onSuccess: () => toast.success(`Fırsat kartı silindi · ${partyName(item)}`),
              onError: (err) => toast.error(`Fırsat kartı silinemedi · ${err.message}`),
              onSettled: () => setBusyId(null),
            });
          },
        },
      ]
    );
  }

  function startClose(item: SalesOpportunityRow) {
    menuRef.current?.dismiss();
    setCloseItem(item);
    setCloseReason(item.wonReason ?? '');
    closeRef.current?.present();
  }

  function confirmClose() {
    if (!closeItem) return;
    const clean = closeReason.trim();
    if (closeItem.qualificationStage === 'win' && !clean) {
      toast.error('Fırsatı kapatmak için kazanma nedenini yazın.');
      return;
    }
    closeOpp.mutate(
      { id: closeItem.id, reason: clean || closeItem.lostReason?.name || undefined },
      {
        onSuccess: () => {
          closeRef.current?.dismiss();
          toast.success('Fırsat kapatıldı ve geçmişe alındı');
          setCloseItem(null);
        },
        onError: (err) => toast.error(`Fırsat kapatılamadı · ${err.message}`),
      }
    );
  }

  const menuStage = menuItem ? asQualification(menuItem.qualificationStage) : null;

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <ScreenHeader
        title="Fırsatlar"
        subtitle="Satış kartları, kanban ve geçmiş"
        actions={[
          { icon: 'options-outline', label: 'Fırsatları filtrele', onPress: openFilters, dot: activeFilterCount > 0 },
          { icon: 'ellipsis-horizontal', label: 'Diğer işlemler', onPress: () => moreRef.current?.present() },
        ]}
      />
      <View className="gap-2 py-2">
        <SearchBar value={search} onChange={setSearch} placeholder="Firma / kontak / ürün ara..." onFilterPress={openFilters} filterActive={activeFilterCount > 0} />
        <View className="px-4">
          <Tabs<View3>
            tabs={[
              { value: 'list', label: 'Liste' },
              { value: 'kanban', label: 'Kanban' },
              { value: 'archive', label: 'Geçmiş', badge: closedTotal ?? undefined },
            ]}
            value={view}
            onChange={setView}
          />
        </View>
        {focus || result || reason || pipelineStage ? (
          <View className="flex-row flex-wrap gap-2 px-4">
            {focus ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${SALES_FOCUS_LABELS[focus]} odağını kaldır`}
                onPress={() => setFocus(null)}
                className="min-h-[36px] flex-row items-center gap-1 rounded-full border border-primary bg-secondary px-3"
              >
                <Text className="font-inter-medium text-[12px] text-primary">{SALES_FOCUS_LABELS[focus]}</Text>
                <Ionicons name="close" size={14} color={colors.primary} />
              </Pressable>
            ) : null}
            {pipelineStage ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Operasyon aşaması ${pipelineStage.name} filtresini kaldır`}
                onPress={() => setPipelineStage(null)}
                className="min-h-[36px] flex-row items-center gap-1 rounded-full border border-border bg-card px-3"
              >
                <Text className="font-inter-medium text-[12px] text-foreground">{`Operasyon: ${pipelineStage.name}`}</Text>
                <Ionicons name="close" size={14} color={colors.foreground} />
              </Pressable>
            ) : null}
            {result || reason ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Sonuç filtresini temizle"
                onPress={clearResult}
                className="min-h-[36px] flex-row items-center gap-1 rounded-full border border-border bg-card px-3"
              >
                <Text className="font-inter-medium text-[12px] text-foreground">
                  {[result ? RESULT_LABELS[result] : null, reason?.label].filter(Boolean).join(' · ')}
                </Text>
                <Ionicons name="close" size={14} color={colors.foreground} />
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>

      {view === 'kanban' ? (
        <QualificationBoard query={boardQuery} onOpen={(id) => router.push(`/(tabs)/modules/opportunities/${id}`)} />
      ) : view === 'list' ? (
        list.isPending ? (
          <ListSkeleton />
        ) : list.error ? (
          <ErrorState message={list.error.message} onRetry={() => void list.refetch()} />
        ) : (
          <FlashList
            maintainVisibleContentPosition={{ disabled: true }}
            data={rows}
            keyExtractor={(item) => item.id}
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: SCREEN_PAD, paddingBottom: 96 }}
            renderItem={({ item }) => (
              <SalesRow
                item={item}
                ownerName={ownerName(item.ownerUserId)}
                onOpen={() => openDetail(item.id, rows.map((row) => row.id))}
                onMenu={() => {
                  setMenuItem(item);
                  menuRef.current?.present();
                }}
              />
            )}
            onEndReachedThreshold={0.5}
            onEndReached={() => {
              if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
            }}
            refreshing={list.isRefetching}
            onRefresh={() => void list.refetch()}
            ListHeaderComponent={
              <Text className="pb-1 font-inter text-[12px] text-muted-foreground">
                {`Toplam ${list.data?.total ?? 0} fırsat${rows.length !== loadedRows.length ? ` · filtrede ${rows.length}` : ''}`}
              </Text>
            }
            ListEmptyComponent={<EmptyState title="Fırsat bulunamadı" hint="Arama veya filtreleri değiştirerek tekrar deneyin." icon="search-outline" />}
            ListFooterComponent={list.isFetchingNextPage ? <Loading /> : null}
          />
        )
      ) : archive.isPending && result !== 'follow_up' ? (
        <ListSkeleton />
      ) : archive.error ? (
        <ErrorState message={archive.error.message} onRetry={() => void archive.refetch()} />
      ) : (
        <FlashList
          maintainVisibleContentPosition={{ disabled: true }}
          data={result === 'follow_up' ? [] : archiveRows}
          keyExtractor={(item) => item.id}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: SCREEN_PAD, paddingBottom: 96 }}
          renderItem={({ item }) => (
            <ArchiveRow
              item={item}
              canReopenLost={canReopenLost}
              canDelete={canDelete}
              busy={busyId === item.id}
              onOpen={() => openDetail(item.id, archiveRows.map((row) => row.id))}
              onReopen={() => reopen(item)}
              onDelete={() => confirmDelete(item)}
            />
          )}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (archive.hasNextPage && !archive.isFetchingNextPage) void archive.fetchNextPage();
          }}
          refreshing={archive.isRefetching}
          onRefresh={() => void archive.refetch()}
          ListHeaderComponent={
            <Text className="pb-1 font-inter text-[12px] text-muted-foreground">
              {`Toplam ${archive.data?.total ?? 0} arşiv fırsatı (WIN + LOST) · silinmedi, kayıtta duruyor`}
            </Text>
          }
          ListEmptyComponent={
            <EmptyState
              title="Kapatılmış fırsat yok"
              hint="Kazanılan veya kaybedilen bir kartta “Fırsatı Kapat” dediğinizde burada görünür."
              icon="archive-outline"
            />
          }
          ListFooterComponent={archive.isFetchingNextPage ? <Loading /> : null}
        />
      )}

      {canCreate ? <Fab label="Yeni Kart" onPress={() => router.push('/modal/new-opportunity' as Href)} /> : null}

      <SalesSheet ref={filterRef} title="Filtreler" subtitle="Aşama, para birimi, firma kararı ve sonuç">
        <PillGroup<Qualification>
          label="Aşama"
          options={QUALIFICATION_ORDER.map((value) => ({ value, label: QUALIFICATION_LABELS[value] }))}
          value={stage}
          onChange={setStage}
        />
        {currencies.length ? (
          <PillGroup<string> label="Para Birimi" options={currencies.map((value) => ({ value, label: value }))} value={currency} onChange={setCurrency} />
        ) : null}
        <PillGroup<CompanyDecision>
          label="Firma Kararı"
          options={(Object.keys(COMPANY_DECISION_LABELS) as CompanyDecision[]).map((value) => ({ value, label: COMPANY_DECISION_LABELS[value] }))}
          value={companyDecision}
          onChange={setCompanyDecision}
        />
        <PillGroup<ListSort>
          label="Sıralama"
          options={(Object.keys(LIST_SORT_LABELS) as ListSort[]).map((value) => ({ value, label: LIST_SORT_LABELS[value] }))}
          value={sort}
          onChange={(next) => setSort(next ?? 'newest')}
          allowClear={false}
        />
        <View className="gap-2 border-t border-border pt-3">
          <Text className="font-inter-semibold text-[14px] text-foreground">Satış sonuçları ve ileri takip</Text>
          <Text className="font-inter text-[12px] text-muted-foreground">
            Kapanan fırsatları nedenine göre inceleyin; ertelenenleri kayıp saymadan takip edin.
          </Text>
          <View className="flex-row gap-2">
            {(['follow_up', 'won', 'lost'] as const).map((filter) => (
              <ResultCounter
                key={filter}
                filter={filter}
                count={filter === 'follow_up' ? followUpCount ?? null : filter === 'won' ? wonCount ?? null : lostCount ?? null}
                selected={result === filter}
                onPress={() => {
                  setResult(filter);
                  setReason(null);
                  if (filter === 'follow_up') setView('list');
                }}
              />
            ))}
          </View>
          {reasons.length ? (
            <PillGroup<string>
              label="Kapanış / kayıp nedeni"
              options={reasons.slice(0, 12).map((item) => ({ value: item.value, label: `${item.label} (${item.count})` }))}
              value={reason?.value ?? null}
              onChange={(value) => {
                const next = reasons.find((item) => item.value === value) ?? null;
                setReason(next);
                setResult(next ? next.outcome : null);
              }}
            />
          ) : analytics.isPending ? (
            <Text className="font-inter text-[12px] text-muted-foreground">Nedenler yükleniyor…</Text>
          ) : null}
          {result || reason ? <Button label="Sonuç filtresini temizle" variant="ghost" onPress={clearResult} /> : null}
        </View>
        <Button
          label="Tüm filtreleri temizle"
          variant="ghost"
          disabled={activeFilterCount === 0}
          onPress={() => {
            setStage(null);
            setCurrency(null);
            setCompanyDecision(null);
            setSort('newest');
            setFocus(null);
            setPipelineStage(null);
            clearResult();
          }}
        />
      </SalesSheet>

      <SalesSheet ref={moreRef} title="Fırsat işlemleri">
        <SheetOption
          icon="stats-chart-outline"
          label="Lead performansı"
          hint="Son 30 günün temas, SLA ve dönüşüm özeti"
          onPress={() => {
            moreRef.current?.dismiss();
            leadRef.current?.present();
          }}
        />
        {canCreate ? (
          <SheetOption
            icon="cloud-upload-outline"
            label="Trello CSV içe aktar"
            hint="Trello panosundaki kartları satış kartına dönüştür"
            onPress={() => {
              moreRef.current?.dismiss();
              router.push('/modal/opportunity-trello-import' as Href);
            }}
          />
        ) : null}
        {canExport ? <SheetOption icon="download-outline" label="Excel'e aktar" hint="Arama ve aşama filtresiyle" onPress={exportExcel} /> : null}
      </SalesSheet>

      <SalesSheet ref={leadRef} title="Lead performansı" subtitle="Son 30 gün">
        <LeadSummaryBody />
      </SalesSheet>

      <SalesSheet ref={menuRef} title={menuItem ? partyName(menuItem) : 'Fırsat'} subtitle="Hızlı işlemler">
        {menuItem ? (
          <>
            <SheetOption
              icon="open-outline"
              label="Detayı aç"
              onPress={() => {
                menuRef.current?.dismiss();
                openDetail(menuItem.id, rows.map((row) => row.id));
              }}
            />
            {canAssignOwner && canUpdate ? (
              <SheetOption
                icon="person-outline"
                label="Sorumlu değiştir"
                hint={`Şu an: ${ownerName(menuItem.ownerUserId) ?? 'Atanmadı'}`}
                disabled={busyId === menuItem.id}
                onPress={() => {
                  menuRef.current?.dismiss();
                  ownerRef.current?.present();
                }}
              />
            ) : null}
            {menuStage === 'lost' && canReopenLost ? (
              <SheetOption
                icon="refresh-outline"
                label="Önceki Dereceye Aç"
                hint="LOST fırsatı önceki satış alanına döndür"
                disabled={busyId === menuItem.id}
                onPress={() => {
                  menuRef.current?.dismiss();
                  reopen(menuItem);
                }}
              />
            ) : null}
            {menuItem &&
            canMarkOpportunityClosed({
              canUpdate,
              closedAt: menuItem.closedAt,
              qualificationStage: menuItem.qualificationStage,
              pipelineStageCode: menuItem.stage?.code,
            }) ? (
              <SheetOption
                icon="close-circle-outline"
                label="Fırsatı Kapat (İptal / Kayıp)"
                hint="İptal veya kayıp olarak işaretle"
                tone="destructive"
                onPress={() => {
                  menuRef.current?.dismiss();
                  setMarkClosedTarget({
                    id: menuItem.id,
                    name: partyName(menuItem),
                    product: menuItem.requestedMachine ?? null,
                  });
                }}
              />
            ) : null}
            {(menuStage === 'win' || menuStage === 'lost') && canUpdate ? (
              <SheetOption
                icon="checkmark-done-outline"
                label="Geçmişe Al"
                hint="Silmez, Geçmiş'te kalır"
                tone="success"
                onPress={() => startClose(menuItem)}
              />
            ) : null}
            {canDelete ? (
              <SheetOption icon="trash-outline" label="Fırsat kartını sil" tone="destructive" onPress={() => confirmDelete(menuItem)} />
            ) : null}
          </>
        ) : null}
      </SalesSheet>

      <SalesSheet ref={ownerRef} title="Sorumlu değiştir" subtitle={menuItem ? partyName(menuItem) : undefined}>
        <SheetOption label="Atanmadı" selected={!menuItem?.ownerUserId} onPress={() => changeOwner(null)} />
        {assignees.isPending ? <Loading /> : null}
        {(assignees.data ?? []).map((candidate) => (
          <SheetOption
            key={candidate.id}
            label={candidate.name}
            selected={menuItem?.ownerUserId === candidate.id}
            onPress={() => changeOwner(candidate.id)}
          />
        ))}
      </SalesSheet>

      <SalesSheet
        ref={closeRef}
        title="Geçmişe alınsın mı?"
        subtitle="Kart silinmez; “Geçmiş” görünümüne taşınır. Teklif, proforma, sözleşme ve aktiviteler korunur."
      >
        {closeItem ? (
          <>
            <Text className="font-inter-semibold text-[14px] text-foreground">
              {[partyName(closeItem), closeItem.requestedMachine].filter(Boolean).join(' · ')}
            </Text>
            <Text className="font-inter text-[13px] text-muted-foreground">
              {`${amountText(closeItem) ?? '—'} · Satış alanı: ${QUALIFICATION_LABELS[asQualification(closeItem.qualificationStage)]}`}
            </Text>
            {closeItem.qualificationStage === 'win' ? (
              <Field
                label="Kazanma / kapatma nedeni *"
                value={closeReason}
                onChangeText={(text) => setCloseReason(text.slice(0, 255))}
                placeholder="Müşteri neden bizi tercih etti?"
                multiline
              />
            ) : null}
            <Button
              label={closeOpp.isPending ? 'Kapatılıyor…' : 'Geçmişe al'}
              loading={closeOpp.isPending}
              disabled={closeItem.qualificationStage === 'win' && !closeReason.trim()}
              onPress={confirmClose}
            />
          </>
        ) : null}
      </SalesSheet>

      {markClosedTarget ? (
        <CloseCaseSheet
          key={markClosedTarget.id}
          ref={markClosedRef}
          opportunityId={markClosedTarget.id}
          caseName={markClosedTarget.name}
          onClosed={() => {
            setMarkClosedTarget(null);
            void list.refetch();
          }}
        />
      ) : null}
    </SafeAreaView>
  );
}
