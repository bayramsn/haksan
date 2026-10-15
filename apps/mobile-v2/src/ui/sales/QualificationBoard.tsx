import { useMemo, useRef, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useCan } from '@/src/auth/AuthProvider';
import { useDeleteOpportunity, useSetQualificationStage } from '@/src/api/crm.hooks';
import { KANBAN_COLUMN_SIZE, useKanbanColumns } from '@/src/api/sales.hooks';
import type { SalesListQuery, SalesOpportunityRow } from '@/src/api/sales.api';
import { formatAmount, formatDate } from '@/src/lib/format';
import { toneColor, useTheme, type Tone } from '@/src/theme/theme';
import { Button, ErrorState, Field, Loading } from '@/src/ui';
import { InfoRows } from '@/src/ui/data';
import { toast } from '@/src/ui/toast';
import { EMPTY_LOST_INPUT, LostCaseFields } from '@/src/ui/sales/LostCaseFields';
import { SalesSheet, SheetOption } from '@/src/ui/sales/Sheet';
import { setOpportunityOrder } from '@/src/ui/sales/opportunity-order';
import {
  addressOf,
  asQualification,
  BOARD_STAGES,
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
  const stage = asQualification(item.qualificationStage);
  const party = partyName(item);
  const machine = (stage === 'win' ? item.wonProductName : null) ?? item.requestedMachine ?? 'Belirtilmedi';
  const amount = Number(item.estimatedValue ?? 0) ? formatAmount(item.estimatedValue, item.currency?.code ?? 'TRY') : null;
  return (
    <View className="mb-2.5 overflow-hidden rounded-[12px] border border-border bg-card" style={{ boxShadow: '0 1px 5px rgba(15, 23, 42, 0.06)' }}>
      <View className="h-1.5" style={{ backgroundColor: toneColor(colors, STAGE_TONE[stage]) }} />
      <View className="p-3">
        <View className="flex-row items-start gap-1">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${party} fırsat detayını aç`}
            onPress={onOpen}
            className="min-h-[44px] flex-1 active:opacity-70"
          >
            <Text className="font-inter-medium text-[11px] uppercase text-muted-foreground">Firma</Text>
            <Text className="font-display-semibold text-[15px] leading-5 text-foreground" numberOfLines={2}>
              {party}
            </Text>
            {amount ? <Text className="mt-0.5 font-inter-semibold text-[13px] text-primary">{amount}</Text> : null}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${party} kart işlemleri`}
            onPress={onMenu}
            className="h-11 w-11 items-center justify-center rounded-full active:opacity-60"
          >
            <Ionicons name="ellipsis-horizontal" size={20} color={colors.foreground} />
          </Pressable>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={`${party} kart detayları`} onPress={onOpen} className="mt-2 active:opacity-70">
          <Text className="pb-1 font-inter-semibold text-[11px] uppercase text-muted-foreground">Kart detayları</Text>
          <CardLine label="Konu" value={item.title || 'Belirtilmedi'} />
          <CardLine label="İlgili" value={contactNameOf(item)} />
          <CardLine label="Adres" value={addressOf(item)} />
          <CardLine label="Makina" value={machine} />
          <CardLine
            label="Aktivite"
            value={item.nextAction ? `${item.nextAction}${item.nextActionAt ? ` · ${formatDate(item.nextActionAt)}` : ''}` : 'Planlanmadı · Tarih yok'}
            muted={!item.nextAction}
          />
        </Pressable>
        {stage === 'lost' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Kayıp Ayrıntısını Oku"
            onPress={onLostDetails}
            className="mt-2 min-h-[44px] items-center justify-center rounded-[10px] border border-destructive-border active:opacity-70"
          >
            <Text className="font-inter-medium text-[13px] text-destructive">Kayıp Ayrıntısını Oku</Text>
          </Pressable>
        ) : null}
      </View>
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
}: {
  query: SalesListQuery;
  onOpen: (id: string) => void;
  header?: React.ReactNode;
}) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
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
  const [menuItem, setMenuItem] = useState<SalesOpportunityRow | null>(null);
  const [pending, setPending] = useState<PendingMove | null>(null);
  const [reason, setReason] = useState('');
  const [lostInput, setLostInput] = useState<LostInput>(EMPTY_LOST_INPUT);
  const [lostError, setLostError] = useState<string | null>(null);
  const [detailsItem, setDetailsItem] = useState<SalesOpportunityRow | null>(null);

  const columnWidth = Math.min(300, Math.round(width * 0.8));
  const menuStage = menuItem ? asQualification(menuItem.qualificationStage) : null;
  const moveOptions = useMemo(() => (menuStage ? kanbanMoveOptions(menuStage) : []), [menuStage]);

  function startMove(item: SalesOpportunityRow, to: Qualification) {
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
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setStage.mutate(
      { id: item.id, toStage: to },
      {
        onSuccess: () => toast.success(`Fırsat taşındı · Yeni satış alanı: ${QUALIFICATION_LABELS[to]}`),
        onError: (err) => toast.error(`Fırsat taşınamadı: ${err.message || 'Aşama koşullarını tamamlayın.'}`),
      }
    );
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

  if (board.isPending) return <Loading />;
  if (board.error) return <ErrorState message={board.error.message} onRetry={() => void board.refetch()} />;

  const pendingFromLost = pending ? asQualification(pending.item.qualificationStage) === 'lost' : false;

  return (
    <View className="flex-1">
      {header}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: 16, paddingBottom: 24 }}>
        {board.columns.map((column) => {
          const stage = column.stage as Qualification;
          const totals = totalsByCurrency(column.items);
          return (
            <View key={stage} className="rounded-[14px] border border-border bg-canvas p-2" style={{ width: columnWidth }}>
              <View className="flex-row items-center gap-2 px-1 pb-2 pt-1">
                <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: toneColor(colors, STAGE_TONE[stage]) }} />
                <Text accessibilityRole="header" className="flex-1 font-display-semibold text-[16px] text-foreground">
                  {QUALIFICATION_LABELS[stage]}
                </Text>
                <View className="min-w-[28px] items-center rounded-full bg-muted px-2 py-0.5">
                  <Text className="font-inter-semibold text-[12px] text-foreground">{column.total}</Text>
                </View>
              </View>
              <ScrollView
                showsVerticalScrollIndicator={false}
                nestedScrollEnabled
                refreshControl={<RefreshControl refreshing={board.isRefetching} onRefresh={() => void board.refetch()} />}
              >
                {column.items.length === 0 ? (
                  <Text className="px-2 py-6 text-center font-inter text-[13px] text-muted-foreground">Kart yok</Text>
                ) : (
                  column.items.map((item) => (
                    <BoardCard
                      key={item.id}
                      item={item as SalesOpportunityRow}
                      onOpen={() => onOpen(item.id)}
                      onMenu={() => {
                        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setMenuItem(item as SalesOpportunityRow);
                        menuRef.current?.present();
                      }}
                      onLostDetails={() => {
                        setDetailsItem(item as SalesOpportunityRow);
                        lostDetailsRef.current?.present();
                      }}
                    />
                  ))
                )}
                {column.total > column.items.length ? (
                  <Text className="px-2 pb-3 text-center font-inter text-[12px] text-muted-foreground">
                    +{column.total - column.items.length} kart daha · toplam ilk {KANBAN_COLUMN_SIZE} karttan hesaplandı
                  </Text>
                ) : null}
              </ScrollView>
              <View className="mt-1 gap-0.5 border-t border-border px-1 pt-2">
                <Text className="font-inter text-[12px] text-muted-foreground">{QUALIFICATION_DESCRIPTIONS[stage]}</Text>
                <Text className="font-inter-semibold text-[13px] text-foreground" numberOfLines={2}>
                  {totals.length ? totals.map((row) => formatAmount(row.total, row.currency)).join(' · ') : formatAmount(0, 'EUR')}
                </Text>
              </View>
            </View>
          );
        })}
      </ScrollView>

      <SalesSheet ref={menuRef} title={menuItem ? partyName(menuItem) : 'Kart işlemleri'} subtitle="Kart işlemleri">
        {menuItem && menuStage ? (
          <>
            <SheetOption icon="open-outline" label="Fırsat detayını aç" onPress={() => { menuRef.current?.dismiss(); onOpen(menuItem.id); }} />
            {menuStage !== 'win' && canUpdate ? (
              <View className="gap-2">
                <Text className="pt-1 font-inter-medium text-[13px] text-muted-foreground">Aşamaya taşı</Text>
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
            {(menuStage === 'win' || menuStage === 'lost') && canUpdate ? (
              <SheetOption icon="checkmark-done-outline" label="Fırsatı kapat / nedeni gir" onPress={() => { menuRef.current?.dismiss(); onOpen(menuItem.id); }} />
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
    </View>
  );
}
