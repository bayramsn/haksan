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
import { Button, EmptyState, ErrorState, Field } from '@/src/ui';
import { InfoRows } from '@/src/ui/data';
import { Skeleton } from '@/src/ui/motion';
import { useNavigationBottomInset } from '@/src/ui/LiquidGlassTabBarBackground';
import { toast } from '@/src/ui/toast';
import { EMPTY_LOST_INPUT, LostCaseFields } from '@/src/ui/sales/LostCaseFields';
import { CloseCaseSheet, type CloseCaseSheetHandle } from '@/src/ui/sales/CloseCaseSheet';
import { SalesSheet, SheetOption } from '@/src/ui/sales/Sheet';
import { setOpportunityOrder } from '@/src/ui/sales/opportunity-order';
import {
  addressOf,
  asQualification,
  BOARD_STAGES,
  canMarkOpportunityClosed,
  contactNameOf,
  kanbanMoveOptions,
  lostStageBody,
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

function CardLine({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <View className="flex-row gap-2 border-t border-border py-1.5">
      <Text className="w-[56px] font-inter-medium text-[11px] uppercase text-muted-foreground">{label}</Text>
      <Text className={`flex-1 font-inter-medium text-[12px] leading-4 ${muted ? 'text-muted-foreground' : 'text-foreground'}`} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

function BoardCard({
  item,
  onOpen,
  onMenu,
  onLostDetails,
}: {
  item: SalesOpportunityRow;
  onOpen: () => void;
  onMenu: () => void;
  onLostDetails: () => void;
}) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const stage = asQualification(item.qualificationStage);
  const party = partyName(item);
  const machine = (stage === 'win' ? item.wonProductName : null) ?? item.requestedMachine ?? 'Makine belirtilmedi';
  const amount = Number(item.estimatedValue ?? 0) ? formatAmount(item.estimatedValue, item.currency?.code ?? 'TRY') : 'Tutar belirtilmedi';
  const overdue = stage !== 'win' && stage !== 'lost' && !!item.nextActionAt && Date.parse(item.nextActionAt) < Date.now();
  return (
    <View className="overflow-hidden rounded-surface border border-border bg-card">
      <View className="gap-3 p-4">
        <Pressable accessibilityRole="button" accessibilityLabel={`${party} fırsat detayını aç`} onPress={onOpen} className="min-h-11 gap-1 active:opacity-70">
          <View className="flex-row items-start gap-3">
            <Text className="min-w-0 flex-1 font-inter-semibold text-[16px] leading-[22px] text-foreground" numberOfLines={2}>{party}</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
          </View>
          <Text className="font-inter text-[13px] leading-[18px] text-muted-foreground" numberOfLines={2}>Konu: {item.title || 'Belirtilmedi'}</Text>
          <Text className="pt-1 font-inter-semibold text-[16px] text-primary" style={{ fontVariant: ['tabular-nums'] }}>{amount}</Text>
        </Pressable>
        <View className="flex-row items-start gap-2">
          <Ionicons name="person-outline" size={16} color={colors.mutedForeground} />
          <Text className="flex-1 font-inter text-[13px] leading-[18px] text-foreground" numberOfLines={2}>İlgili: {contactNameOf(item)}</Text>
        </View>
        <View className="flex-row items-start gap-2">
          <Ionicons name="hardware-chip-outline" size={16} color={colors.mutedForeground} />
          <Text className="flex-1 font-inter text-[13px] leading-[18px] text-foreground" numberOfLines={2}>Makina: {machine}</Text>
        </View>
        <View className={`gap-1 rounded-control p-3 ${overdue ? 'bg-destructive-soft' : 'bg-muted'}`}>
          <View className="flex-row items-center gap-2">
            <Ionicons name="time-outline" size={16} color={overdue ? colors.destructive : colors.mutedForeground} />
            <Text className={`flex-1 font-inter-medium text-[12px] ${overdue ? 'text-destructive' : 'text-muted-foreground'}`}>
              {overdue ? 'Aktivite tarihi geçti' : 'Sonraki aktivite'}{item.nextActionAt ? ` · ${formatDate(item.nextActionAt)}` : ''}
            </Text>
          </View>
          <Text className="font-inter text-[13px] leading-[18px] text-foreground" numberOfLines={2}>{item.nextAction || 'Aktivite planlanmamış'}</Text>
        </View>
        {expanded ? <View>
          <CardLine label="Adres" value={addressOf(item)} />
        </View> : null}
      </View>
      <View className="flex-row border-t border-border px-2">
        <Pressable accessibilityRole="button" accessibilityLabel={`${party} adres bilgileri`}
          accessibilityState={{ expanded }} onPress={() => setExpanded((value) => !value)}
          className="min-h-11 flex-1 flex-row items-center justify-center gap-1 px-2 active:opacity-70">
          <Text className="font-inter-medium text-[12px] text-muted-foreground">{expanded ? 'Adresi gizle' : 'Adres bilgisi'}</Text>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={colors.mutedForeground} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`${party} aşama ve kart işlemleri`} onPress={onMenu}
          className="min-h-11 flex-1 flex-row items-center justify-center gap-2 border-l border-border px-2 active:opacity-70">
          <Ionicons name="options-outline" size={16} color={colors.primary} />
          <Text className="font-inter-medium text-[12px] text-primary">Kart işlemleri</Text>
        </Pressable>
      </View>
      {stage === 'lost' ? <Pressable accessibilityRole="button" accessibilityLabel="Kayıp ayrıntısını oku" onPress={onLostDetails}
        className="min-h-11 items-center justify-center border-t border-border px-4 active:opacity-70">
        <Text className="font-inter-medium text-[13px] text-destructive">Kayıp ayrıntısını oku</Text>
      </Pressable> : null}
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

  const columnWidth = 336;
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

  const renderCard = (item: SalesOpportunityRow) => (
    <BoardCard
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
  const columnSummary = (column: typeof selectedColumn) => {
    const totals = totalsByCurrency(column.items);
    return (
      <View className="gap-1 rounded-control border border-border bg-card px-4 py-3">
        <Text className="font-inter text-[12px] text-muted-foreground">
          {column.total > column.items.length ? `Görünen ${column.items.length} kartın tutarı · ${column.total} karttan` : 'Kartların toplam tutarı'}
        </Text>
        <Text className="font-inter-semibold text-[14px] text-foreground" style={{ fontVariant: ['tabular-nums'] }}>
          {totals.length ? totals.map((row) => formatAmount(row.total, row.currency)).join(' · ') : 'Tutar yok'}
        </Text>
        {column.total > column.items.length && onStageList ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`${QUALIFICATION_LABELS[column.stage as Qualification]} aşamasındaki ${column.total} kartı listede aç`}
            onPress={() => onStageList(column.stage as Qualification)} className="min-h-11 flex-row items-center justify-between gap-2 active:opacity-70">
            <Text className="flex-1 font-inter-medium text-[13px] text-primary">Tüm {column.total} kartı listede aç</Text>
            <Ionicons name="arrow-forward" size={16} color={colors.primary} />
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
      <Text className="text-center font-inter text-[12px] text-muted-foreground">{column.total} karttan {column.items.length} kart gösteriliyor.</Text>
      {onStageList ? <Button label="Bu aşamadaki tüm kartları aç" variant="ghost" onPress={() => onStageList(column.stage as Qualification)} /> : null}
    </View>
  ) : null;

  return (
    <View className="flex-1">
      {header}
      <View className="gap-2 pb-3">
        <View className="flex-row items-center justify-between px-4">
          <Text className="font-inter-medium text-[12px] text-muted-foreground">{searching ? 'Arama sonuçları' : 'Satış aşamaları'} · {totalCards} kart</Text>
          <Text className="font-inter text-[12px] text-muted-foreground">Aşama seçin</Text>
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
                <Text className={`font-inter-medium text-[12px] ${active ? 'text-primary-foreground' : 'text-muted-foreground'}`} style={{ fontVariant: ['tabular-nums'] }}>{column.total}</Text>
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
              <View key={stage} className="gap-3 rounded-surface border border-border bg-muted p-3" style={{ width: columnWidth }}>
                <View className="flex-row items-center gap-2">
                  <View className="h-2 w-2 rounded-full" style={{ backgroundColor: toneColor(colors, STAGE_TONE[stage]) }} />
                  <Text accessibilityRole="header" className="flex-1 font-display-semibold text-[24px] text-foreground">{QUALIFICATION_LABELS[stage]}</Text>
                  <Text className="font-inter-semibold text-[14px] text-foreground">{column.total}</Text>
                </View>
                <Text className="font-inter text-[12px] text-muted-foreground">{QUALIFICATION_DESCRIPTIONS[stage]}</Text>
                <FlatList data={column.items} keyExtractor={(item) => item.id} renderItem={({ item }) => renderCard(item)}
                  ItemSeparatorComponent={() => <View className="h-3" />}
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
          renderItem={({ item }) => renderCard(item)}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: GLASS_TAB_BAR_HEIGHT + 88, gap: 12 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={board.isRefetching} onRefresh={() => void board.refetch()} tintColor={colors.primary} />}
          ListHeaderComponent={<View className="gap-3 pb-1">
            <View className="flex-row items-center gap-3">
              <View className="min-w-0 flex-1 gap-1">
                <Text accessibilityRole="header" className="font-display-semibold text-[24px] text-foreground">{QUALIFICATION_LABELS[selectedStage]} · {selectedColumn.total} kart</Text>
                <Text className="font-inter text-[13px] text-muted-foreground">{QUALIFICATION_DESCRIPTIONS[selectedStage]}</Text>
              </View>
              <View className="flex-row gap-1">
                {([-1, 1] as const).map((direction) => {
                  const next = BOARD_STAGES[BOARD_STAGES.indexOf(selectedStage) + direction];
                  return <Pressable key={direction} accessibilityRole="button" accessibilityLabel={direction === -1 ? 'Önceki aşamayı göster' : 'Sonraki aşamayı göster'}
                    accessibilityState={{ disabled: !next }} disabled={!next} onPress={() => next && selectStage(next)}
                    className={`h-11 w-11 items-center justify-center rounded-control border border-border bg-card ${next ? 'active:opacity-70' : 'opacity-30'}`}>
                    <Ionicons name={direction === -1 ? 'chevron-back' : 'chevron-forward'} size={18} color={colors.foreground} />
                  </Pressable>;
                })}
              </View>
            </View>
            {columnSummary(selectedColumn)}
          </View>}
          ListEmptyComponent={emptyColumn(selectedStage)} ListFooterComponent={moreCards(selectedColumn)} />
      )}

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
