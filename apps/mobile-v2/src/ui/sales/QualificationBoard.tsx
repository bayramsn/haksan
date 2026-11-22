import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import * as Haptics from 'expo-haptics';
import { useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCan } from '@/src/auth/AuthProvider';
import { useDeleteOpportunity, useSetQualificationStage } from '@/src/api/crm.hooks';
import { useKanbanColumns } from '@/src/api/sales.hooks';
import type { SalesListQuery, SalesOpportunityRow } from '@/src/api/sales.api';
import { formatAmount, formatDate } from '@/src/lib/format';
import { toneColor, useTheme, type Tone } from '@/src/theme/theme';
import { Button, EmptyState, ErrorState, Field, GroupedDivider, groupedRowClass } from '@/src/ui';
import { InfoRows } from '@/src/ui/data';
import { Skeleton } from '@/src/ui/motion';
import { useNavigationBottomInset } from '@/src/ui/LiquidGlassTabBarBackground';
import { toast } from '@/src/ui/toast';
import { EMPTY_LOST_INPUT, LostCaseFields } from '@/src/ui/sales/LostCaseFields';
import { CloseCaseSheet, type CloseCaseSheetHandle } from '@/src/ui/sales/CloseCaseSheet';
import { SalesSheet, SheetOption } from '@/src/ui/sales/Sheet';
import { setOpportunityOrder } from '@/src/ui/sales/opportunity-order';
import {
  asQualification,
  BOARD_STAGES,
  canMarkOpportunityClosed,
  kanbanMoveOptions,
  lostStageBody,
  machineLabelOf,
  moveKind,
  partyName,
  QUALIFICATION_DESCRIPTIONS,
  QUALIFICATION_LABELS,
  totalsByCurrency,
  validateLostInput,
  type LostInput,
  type Qualification,
} from '@/src/ui/sales/sales-logic';

export const STAGE_TONE: Record<Qualification, Tone> = {
  lead: 'neutral',
  c: 'info',
  b: 'stage',
  a: 'warning',
  a_plus: 'warning',
  win: 'success',
  lost: 'destructive',
};

/** Kartsız satır: firma, makina, sonraki adım solda; tutar sağda. Adres detayda, aşama/işlemler uzun basışta. */
function BoardCard({
  item,
  onOpen,
  onMenu,
  onLostDetails,
  first,
  last,
}: {
  item: SalesOpportunityRow;
  onOpen: () => void;
  onMenu: () => void;
  onLostDetails: () => void;
  first: boolean;
  last: boolean;
}) {
  const stage = asQualification(item.qualificationStage);
  const party = partyName(item);
  const machine = machineLabelOf(item);
  const hasMachine = machine !== 'Makine belirtilmedi';
  const amount = Number(item.estimatedValue ?? 0) ? formatAmount(item.estimatedValue, item.currency?.code ?? 'TRY') : '—';
  const overdue = stage !== 'win' && stage !== 'lost' && !!item.nextActionAt && Date.parse(item.nextActionAt) < Date.now();
  // Boş alan yazıları ("Aktivite planlanmamış", "Makine belirtilmedi") her satırda tekrar edip gürültü yapıyordu; yalnızca gerçek veri.
  const next = [overdue ? 'Gecikti' : null, item.nextAction || null, item.nextActionAt ? formatDate(item.nextActionAt) : null].filter(Boolean).join(' · ');
  return (
    <View className={groupedRowClass(first, last)} style={{ borderCurve: 'continuous' }}>
      <Pressable onPress={onOpen} onLongPress={onMenu} delayLongPress={350}
        accessibilityRole="button" accessibilityLabel={`${party}, ${machine}, ${amount}. ${next || 'Aktivite planlanmamış'}. Fırsat detayını aç`}
        accessibilityHint="Uzun basınca aşama ve kart işlemleri açılır"
        accessibilityActions={[{ name: 'longpress', label: 'Aşama ve işlemler' }]}
        onAccessibilityAction={(event) => { if (event.nativeEvent.actionName === 'longpress') onMenu(); }}
        className="min-h-[60px] flex-row items-center gap-3 py-3 active:opacity-60">
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="font-inter-medium text-[15px] leading-[20px] text-foreground" numberOfLines={1}>{party}</Text>
          {hasMachine ? <Text className="font-inter text-[13px] leading-[18px] text-muted-foreground" numberOfLines={1}>{machine}</Text> : null}
          {next ? <Text className={`font-inter text-[12px] leading-[17px] ${overdue ? 'text-warning' : 'text-muted-foreground'}`} numberOfLines={1}>{next}</Text> : null}
        </View>
        <Text className={`font-inter-semibold text-[14px] ${amount === '—' ? 'text-muted-foreground' : 'text-foreground'}`} style={{ fontVariant: ['tabular-nums'] }}>{amount}</Text>
      </Pressable>
      {stage === 'lost' ? <Pressable accessibilityRole="button" accessibilityLabel="Kayıp ayrıntısını oku" onPress={onLostDetails}
        className="-mt-1 min-h-11 justify-center self-start active:opacity-70">
        <Text className="font-inter-medium text-[13px] text-destructive">Kayıp ayrıntısını oku</Text>
      </Pressable> : null}
      {last ? null : <GroupedDivider />}
    </View>
  );
}

type PendingMove = { item: SalesOpportunityRow; to: Qualification };

/**
 * Web QualificationKanban'ın mobil karşılığı: sürükle-bırak yerine kart
 * menüsündeki "Aşamaya taşı" seçenekleri; geri/LOST'tan geçiş gerekçe, LOST'a
 * geçiş kayıp formu ister.
 */
export function QualificationBoard({
  query,
  onOpen: openDetail,
  header,
  onStageList,
}: {
  query: SalesListQuery;
  onOpen: (id: string) => void;
  header?: React.ReactNode;
  onStageList?: (stage: Qualification) => void;
}) {
  const GLASS_TAB_BAR_HEIGHT = useNavigationBottomInset();
  const router = useRouter();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 768;
  const [selectedStage, setSelectedStage] = useState<Qualification>('lead');
  const stageTabsRef = useRef<ScrollView>(null);
  const stagePickerRef = useRef<BottomSheetModal>(null);
  const columnScrollRef = useRef<ScrollView>(null);
  const stagePositions = useRef<Partial<Record<Qualification, number>>>({});
  const canUpdate = useCan('opportunities.update');
  const canDelete = useCan('opportunities.delete');
  const board = useKanbanColumns(query, BOARD_STAGES);
  const onOpen = (id: string) => {
    setOpportunityOrder(board.columns.flatMap((column) => column.items.map((item) => item.id)));
    openDetail(id);
  };
  const setStage = useSetQualificationStage();
  const deleteOpp = useDeleteOpportunity();

  const menuRef = useRef<BottomSheetModal>(null);
  const reasonRef = useRef<BottomSheetModal>(null);
  const lostRef = useRef<BottomSheetModal>(null);
  const lostDetailsRef = useRef<BottomSheetModal>(null);
  const markClosedRef = useRef<CloseCaseSheetHandle>(null);
  const [menuItem, setMenuItem] = useState<SalesOpportunityRow | null>(null);
  const [pending, setPending] = useState<PendingMove | null>(null);
  const [reason, setReason] = useState('');
  const [lostInput, setLostInput] = useState<LostInput>(EMPTY_LOST_INPUT);
  const [lostError, setLostError] = useState<string | null>(null);
  const [detailsItem, setDetailsItem] = useState<SalesOpportunityRow | null>(null);
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

  const columnWidth = width >= 1200 ? 360 : 336;
  const selectStage = (stage: Qualification) => {
    setSelectedStage(stage);
    void Haptics.selectionAsync();
    stageTabsRef.current?.scrollTo({ x: Math.max(0, (stagePositions.current[stage] ?? 0) - 16), animated: true });
    if (wide) columnScrollRef.current?.scrollTo({ x: BOARD_STAGES.indexOf(stage) * (columnWidth + 12), animated: true });
  };
  const menuStage = menuItem ? asQualification(menuItem.qualificationStage) : null;
  const moveOptions = useMemo(() => (menuStage ? kanbanMoveOptions(menuStage) : []), [menuStage]);

  function startMove(item: SalesOpportunityRow, to: Qualification) {
    if (setStage.isPending) return;
    if (!canUpdate) {
      toast.error('Bu fırsatı ilerletme yetkiniz bulunmuyor');
      return;
    }
    menuRef.current?.dismiss();
    const from = asQualification(item.qualificationStage);
    const kind = moveKind(from, to);
    setPending({ item, to });
    if (kind === 'lost') {
      setLostInput(EMPTY_LOST_INPUT);
      setLostError(null);
      lostRef.current?.present();
      return;
    }
    if (kind === 'back' || kind === 'fromLost') {
      setReason('');
      reasonRef.current?.present();
      return;
    }
    setPending(null);
    setOpportunityOrder(board.columns.flatMap((column) => column.items.map((row) => row.id)));
    router.push({ pathname: '/modules/opportunities/[id]', params: { id: item.id, processTarget: to } } as Href);
  }

  function confirmBack() {
    if (!pending || !reason.trim()) return;
    const fromLost = asQualification(pending.item.qualificationStage) === 'lost';
    setStage.mutate(
      { id: pending.item.id, toStage: pending.to, note: reason.trim() },
      {
        onSuccess: () => {
          reasonRef.current?.dismiss();
          toast.success(
            fromLost
              ? `LOST kaydı hedef satış alanına taşındı · ${QUALIFICATION_LABELS[pending.to]}`
              : `Fırsat önceki satış alanına alındı · ${QUALIFICATION_LABELS[pending.to]}`
          );
          setPending(null);
        },
        onError: (err) => toast.error(`Geri alınamadı: ${err.message || 'İşlem başarısız oldu.'}`),
      }
    );
  }

  function confirmLost() {
    if (!pending) return;
    const error = validateLostInput(lostInput);
    if (error) {
      setLostError(error);
      return;
    }
    setStage.mutate(
      { id: pending.item.id, ...lostStageBody(lostInput) },
      {
        onSuccess: () => {
          lostRef.current?.dismiss();
          toast.success('Fırsat LOST alanına taşındı');
          setPending(null);
        },
        onError: (err) => toast.error(`Fırsat taşınamadı: ${err.message}`),
      }
    );
  }

  function confirmDelete(item: SalesOpportunityRow) {
    menuRef.current?.dismiss();
    Alert.alert('Fırsat kartını sil', `${partyName(item)} kartı kalıcı olarak silinecek.`, [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: () =>
          deleteOpp.mutate(item.id, {
            onSuccess: () => toast.success('Fırsat silindi'),
            onError: (err) => toast.error(`Silinemedi: ${err.message}`),
          }),
      },
    ]);
  }

  if (board.isPending) return (
    <View className="gap-4 px-4 pt-2">
      <Skeleton height={48} rounded={12} />
      <Skeleton height={72} rounded={12} />
      <Skeleton height={220} rounded={16} />
      <Skeleton height={220} rounded={16} />
    </View>
  );
  if (board.error) return <ErrorState message={board.error.message} onRetry={() => void board.refetch()} />;

  const pendingFromLost = pending ? asQualification(pending.item.qualificationStage) === 'lost' : false;
  const selectedColumn = board.columns.find((column) => column.stage === selectedStage)!;
  const totalCards = board.columns.reduce((total, column) => total + column.total, 0);
  const searching = Boolean(query.search);

  const renderCard = (item: SalesOpportunityRow, first: boolean, last: boolean) => (
    <BoardCard
      first={first}
      last={last}
      item={item}
      onOpen={() => onOpen(item.id)}
      onMenu={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setMenuItem(item);
        menuRef.current?.present();
      }}
      onLostDetails={() => {
        setDetailsItem(item);
        lostDetailsRef.current?.present();
      }}
    />
  );
  // Ekranın tek büyük rakamı: aşamanın toplam tutarı (en büyük para birimi öne, diğerleri altta).
  const columnSummary = (column: typeof selectedColumn) => {
    const [main, ...rest] = totalsByCurrency(column.items).sort((a, b) => b.total - a.total);
    const partial = column.total > column.items.length;
    return (
      <View className="gap-0.5 pb-4 pt-1">
        <Text className="font-inter-medium text-[13px] text-muted-foreground">
          {`${QUALIFICATION_LABELS[column.stage as Qualification]} · ${partial ? `${column.items.length}/${column.total}` : column.total} kart`}
        </Text>
        <Text className="font-inter-semibold text-[30px] leading-[36px] text-foreground" style={{ fontVariant: ['tabular-nums'] }} numberOfLines={1} adjustsFontSizeToFit>
          {main ? formatAmount(main.total, main.currency) : 'Tutar yok'}
        </Text>
        {rest.length ? <Text className="font-inter text-[13px] text-muted-foreground" style={{ fontVariant: ['tabular-nums'] }}>{`+ ${rest.map((row) => formatAmount(row.total, row.currency)).join(' + ')}`}</Text> : null}
        {partial && onStageList ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`${QUALIFICATION_LABELS[column.stage as Qualification]} aşamasındaki ${column.total} kartı listede aç`}
            onPress={() => onStageList(column.stage as Qualification)} className="min-h-11 justify-center self-start active:opacity-70">
            <Text className="font-inter-medium text-[13px] text-primary">Tümünü listede aç</Text>
          </Pressable>
        ) : null}
      </View>
    );
  };
  const emptyColumn = (stage: Qualification) => (
    <EmptyState icon={searching ? 'search-outline' : 'albums-outline'}
      title={searching ? 'Eşleşen kart yok' : `${QUALIFICATION_LABELS[stage]} aşamasında kart yok`}
      hint={searching ? 'Aramayı değiştirin veya başka bir aşama seçin.' : 'Başka bir aşamaya geçebilir veya yeni bir fırsat kartı oluşturabilirsiniz.'} />
  );
  const moreCards = (column: typeof selectedColumn) => column.total > column.items.length ? (
    <View className="gap-2 py-4">
      {onStageList ? <Button label="Daha fazla" variant="ghost" onPress={() => onStageList(column.stage as Qualification)} /> : null}
    </View>
  ) : null;

  return (
    <View className="flex-1">
      {header}
      <View className="gap-2 pb-3">
        <View className="flex-row items-center justify-between px-4">
          <Text className="font-inter-medium text-[12px] text-muted-foreground">{searching ? 'Arama sonuçları' : 'Satış aşamaları'} · {totalCards} kart</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Tüm satış aşamalarını göster" onPress={() => stagePickerRef.current?.present()}
            className="min-h-11 flex-row items-center gap-1 pl-3 active:opacity-70">
            <Text className="font-inter-medium text-[12px] text-primary">Aşama seç</Text>
            <Ionicons name="chevron-down" size={14} color={colors.primary} />
          </Pressable>
        </View>
        <ScrollView ref={stageTabsRef} horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}
          contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
          {board.columns.map((column) => {
            const stage = column.stage as Qualification;
            const active = stage === selectedStage;
            return (
              <Pressable key={stage} accessibilityRole="tab" accessibilityState={{ selected: active }}
                accessibilityLabel={`${QUALIFICATION_LABELS[stage]}, ${column.total} kart. ${QUALIFICATION_DESCRIPTIONS[stage]}`}
                onLayout={(event) => { stagePositions.current[stage] = event.nativeEvent.layout.x; }}
                onPress={() => selectStage(stage)}
                className={`min-h-12 flex-row items-center gap-2 rounded-control border px-4 ${active ? 'border-primary bg-primary' : 'border-border bg-card'} active:opacity-70`}>
                <Text className={`font-inter-semibold text-[14px] ${active ? 'text-primary-foreground' : 'text-foreground'}`}>{QUALIFICATION_LABELS[stage]}</Text>
                <View className={`min-w-6 items-center rounded-full px-1.5 py-1 ${active ? 'bg-primary-foreground/15' : 'bg-muted'}`}>
                  <Text className={`font-inter-medium text-[12px] ${active ? 'text-primary-foreground' : 'text-muted-foreground'}`} style={{ fontVariant: ['tabular-nums'] }}>{column.total}</Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
      {wide ? (
        <ScrollView ref={columnScrollRef} horizontal showsHorizontalScrollIndicator
          contentContainerStyle={{ gap: 12, paddingHorizontal: 16, paddingBottom: GLASS_TAB_BAR_HEIGHT + 24 }}>
          {board.columns.map((column) => {
            const stage = column.stage as Qualification;
            return (
              <View key={stage} className="gap-3 rounded-surface border bg-muted p-3" style={{ width: columnWidth, borderColor: stage === selectedStage ? colors.primary : colors.border }}>
                <View className="flex-row items-center gap-2">
                  <View className="h-2 w-2 rounded-full" style={{ backgroundColor: toneColor(colors, STAGE_TONE[stage]) }} />
                  <Text accessibilityRole="header" className="flex-1 font-display-semibold text-[24px] text-foreground">{QUALIFICATION_LABELS[stage]}</Text>
                  <Text className="font-inter-semibold text-[14px] text-foreground">{column.total}</Text>
                </View>
                <Text className="font-inter text-[12px] text-muted-foreground">{QUALIFICATION_DESCRIPTIONS[stage]}</Text>
                <FlatList data={column.items} keyExtractor={(item) => item.id} renderItem={({ item, index }) => renderCard(item, index === 0, index === column.items.length - 1)}
                  contentContainerStyle={{ paddingBottom: 16 }}
                  refreshing={board.isRefetching} onRefresh={() => void board.refetch()}
                  ListEmptyComponent={emptyColumn(stage)} ListFooterComponent={moreCards(column)} />
                {columnSummary(column)}
              </View>
            );
          })}
        </ScrollView>
      ) : (
        <FlatList key={selectedStage} data={selectedColumn.items} keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => renderCard(item, index === 0, index === selectedColumn.items.length - 1)}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: GLASS_TAB_BAR_HEIGHT + 88 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={board.isRefetching} onRefresh={() => void board.refetch()} tintColor={colors.primary} />}
          ListHeaderComponent={columnSummary(selectedColumn)}
          ListEmptyComponent={emptyColumn(selectedStage)} ListFooterComponent={moreCards(selectedColumn)} />
      )}

      <SalesSheet ref={stagePickerRef} title="Satış aşaması seç" subtitle="Bir aşama seçerek kartlarını ve toplam tutarını görün.">
        {board.columns.map((column) => {
          const stage = column.stage as Qualification;
          return <SheetOption key={stage} label={`${QUALIFICATION_LABELS[stage]} · ${column.total} kart`} hint={QUALIFICATION_DESCRIPTIONS[stage]}
            selected={stage === selectedStage} onPress={() => { stagePickerRef.current?.dismiss(); selectStage(stage); }} />;
        })}
      </SalesSheet>

      <SalesSheet ref={menuRef} title={menuItem ? partyName(menuItem) : 'Kart işlemleri'} subtitle={menuStage ? `Mevcut aşama: ${QUALIFICATION_LABELS[menuStage]} · ${QUALIFICATION_DESCRIPTIONS[menuStage]}` : 'Kart işlemleri'}>
        {menuItem && menuStage ? (
          <>
            <SheetOption icon="open-outline" label="Fırsat detayını aç" onPress={() => { menuRef.current?.dismiss(); onOpen(menuItem.id); }} />
            {menuStage !== 'win' && canUpdate ? (
              <View className="gap-2">
                <Text className="pt-1 font-inter-medium text-[13px] text-muted-foreground">Aşama değiştir</Text>
                {moveOptions.map((option) => (
                  <SheetOption
                    key={option.target}
                    label={option.label}
                    hint={option.current ? 'Mevcut aşama' : option.allowed ? QUALIFICATION_DESCRIPTIONS[option.target] : 'Yalnız komşu aşamaya veya LOST’a taşınabilir'}
                    tone={option.target === 'lost' ? 'destructive' : 'neutral'}
                    selected={option.current}
                    disabled={!option.allowed || setStage.isPending}
                    onPress={() => startMove(menuItem, option.target)}
                  />
                ))}
              </View>
            ) : null}
            {canMarkOpportunityClosed({
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
              <SheetOption icon="checkmark-done-outline" label="Geçmişe al / nedeni gir" onPress={() => { menuRef.current?.dismiss(); onOpen(menuItem.id); }} />
            ) : null}
            {canDelete ? (
              <SheetOption icon="trash-outline" tone="destructive" label="Fırsat kartını sil" disabled={deleteOpp.isPending} onPress={() => confirmDelete(menuItem)} />
            ) : null}
          </>
        ) : null}
      </SalesSheet>

      <SalesSheet
        ref={reasonRef}
        title={pendingFromLost ? 'LOST kaydını hedef satış alanına taşı' : 'Fırsatı geri al'}
        subtitle={
          pending
            ? `${QUALIFICATION_LABELS[asQualification(pending.item.qualificationStage)]} → ${QUALIFICATION_LABELS[pending.to]} geçişi${
                pendingFromLost
                  ? '. Kart doğrudan seçtiğiniz satış alanına taşınır; firma, makine, aktiviteler ve kayıp bilgileri korunur.'
                  : '. Sonraki aşamaya ait onaylar sıfırlanır.'
              }`
            : undefined
        }
      >
        <Field
          label="Gerekçe *"
          value={reason}
          onChangeText={setReason}
          placeholder="Kart neden önceki aşamaya alınıyor?"
          multiline
          numberOfLines={3}
          maxLength={1000}
        />
        <Button
          label={pendingFromLost && pending ? `${QUALIFICATION_LABELS[pending.to]} satış alanına taşı` : 'Geri al'}
          disabled={!reason.trim() || setStage.isPending}
          loading={setStage.isPending}
          onPress={confirmBack}
        />
        <Button label="Vazgeç" variant="ghost" onPress={() => reasonRef.current?.dismiss()} />
      </SalesSheet>

      <SalesSheet ref={lostRef} title="Fırsatı LOST alanına taşı" subtitle={pending ? partyName(pending.item) : undefined}>
        <LostCaseFields value={lostInput} onChange={setLostInput} productPlaceholder={pending?.item.requestedMachine} />
        {lostError ? <Text className="font-inter text-xs text-destructive">{lostError}</Text> : null}
        <Button label="LOST Yap" variant="destructive" loading={setStage.isPending} disabled={setStage.isPending} onPress={confirmLost} />
      </SalesSheet>

      <SalesSheet ref={lostDetailsRef} title="Kayıp Ayrıntısı" subtitle={detailsItem ? partyName(detailsItem) : undefined}>
        {detailsItem ? (
          <>
            <InfoRows
              showEmpty
              items={[
                { label: 'Kayıp nedeni', value: detailsItem.lostReason?.name ?? 'Belirtilmemiş' },
                { label: 'Kaybedilen ürün', value: detailsItem.lostProductName },
                { label: 'Rakip', value: detailsItem.lostCompetitor?.name ?? detailsItem.lostCompetitorName },
                { label: 'Rakip ürünü', value: detailsItem.lostCompetitorProductModel },
                { label: 'Karşılanamayan koşullar', value: detailsItem.lostUnmetConditions },
              ]}
            />
            <Button label="Fırsat detayını aç" variant="ghost" onPress={() => { lostDetailsRef.current?.dismiss(); onOpen(detailsItem.id); }} />
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
            void board.refetch();
          }}
        />
      ) : null}
    </View>
  );
}
