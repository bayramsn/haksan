import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import { useAuth } from '@/src/auth/AuthProvider';
import type { PricedRows, SaleUpdateBody } from '@/src/api/products.api';
import { useTheme } from '@/src/theme/theme';
import { Button, EmptyState, ErrorState, Field, ListSkeleton, SCREEN_PAD, ScreenHeader, SearchBar } from '@/src/ui';
import { Panel, Segmented, SmallButton, SwitchRow } from '@/src/ui/finance/kit';
import { OptionPicker } from '@/src/ui/pickers/OptionPicker';
import { toast } from '@/src/ui/toast';
import { useGlassTabClearance } from '@/src/ui/LiquidGlassTabBarBackground';
import {
  SALE_CURRENCIES,
  applyMarkup,
  buildSaleUpdate,
  canEditPrices,
  dirtyDrafts,
  draftFor,
  filterPricedRows,
  formatAmount,
  marginPercent,
  parseMarkupPercent,
  parsePrice,
  uniqueSorted,
  type PriceDraft,
  type PricedRow,
} from '@/src/ui/products/price-editors';

const CURRENCY_OPTIONS = SALE_CURRENCIES.map((code) => ({ value: code, label: code }));

/**
 * Web `PriceRowsEditor`: filtre, arama, maliyete kâr oranı uygulama ve toplu
 * satış fiyatı kaydı. Maliyet sütunları yalnız sunucu `canViewCost` dönerse.
 */
export function PriceRowsEditor<T extends PricedRow>(props: {
  title: string;
  description: string;
  query: UseQueryResult<PricedRows<T>>;
  save: UseMutationResult<{ updated: number }, Error, SaleUpdateBody>;
  filterLabel: string;
  filterOf: (row: T) => string;
  filterOptionLabel?: (value: string) => string;
  searchPlaceholder: string;
  searchText: (row: T) => string;
  rowLabel: (row: T) => string;
  rowTitle: (row: T) => string;
  rowLines: (row: T) => Array<string | null>;
}) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const canEdit = canEditPrices(user);
  const tabClearance = useGlassTabClearance();
  const [drafts, setDrafts] = useState<Record<string, PriceDraft>>({});
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');
  const [percent, setPercent] = useState('25');
  const [onlyEmpty, setOnlyEmpty] = useState(true);

  const data = props.query.data;
  const rows = useMemo(() => data?.rows ?? [], [data]);
  const canViewCost = Boolean(data?.canViewCost);
  const filterOptions = useMemo(() => uniqueSorted(rows.map(props.filterOf)), [rows, props.filterOf]);
  const visible = filterPricedRows(rows, props.filterOf, filter, props.searchText, search);
  const dirty = dirtyDrafts(rows, drafts);
  const invalid = dirty.some(([, draft]) => parsePrice(draft.salePrice) === undefined);
  const pricedCount = rows.filter((row) => row.salePrice != null).length;
  // Kayıt sürerken taslaklar kilitlenir; başarıda temizlenen taslaklar tam olarak gönderilenlerdir.
  const saving = props.save.isPending;

  const setDraft = (row: T, patch: Partial<PriceDraft>) =>
    setDrafts((current) => ({ ...current, [row.id]: { ...draftFor(row, current), ...patch } }));

  const markup = () => {
    const value = parseMarkupPercent(percent);
    if (value == null) return toast.error('Kâr oranı 0 ile 1000 arasında olmalı');
    const next = applyMarkup(visible, drafts, value, onlyEmpty);
    const changed = visible.filter((row) => next[row.id] !== drafts[row.id]).length;
    setDrafts(next);
    toast.info(
      changed
        ? `${changed} satıra %${value} kâr uygulandı; kaydetmeyi unutmayın.`
        : 'Uygulanacak satır yok (maliyeti olmayan veya fiyatı girilmiş satırlar atlandı).',
    );
  };

  const save = () => {
    const payload = buildSaleUpdate(rows, drafts);
    if (!payload.ok) return toast.error(payload.error);
    props.save.mutate(
      { rows: payload.rows },
      {
        onSuccess: () => {
          toast.success(`${payload.rows.length} satış fiyatı kaydedildi`);
          setDrafts({});
        },
        onError: (error) => toast.error(`Satış fiyatları kaydedilemedi: ${error.message}`),
      },
    );
  };

  if (props.query.isPending) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
        <ScreenHeader title={props.title} />
        <ListSkeleton />
      </SafeAreaView>
    );
  }
  if (props.query.error) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
        <ScreenHeader title={props.title} />
        <ErrorState message={props.query.error.message} onRetry={() => void props.query.refetch()} />
      </SafeAreaView>
    );
  }

  const header = (
    <View className="gap-3 pb-2">
      <ScreenHeader title={props.title} subtitle={props.description} />
      <View style={{ paddingHorizontal: SCREEN_PAD }}>
        <OptionPicker
          label={props.filterLabel}
          value={filter || null}
          placeholder="Tümü"
          clearable
          options={filterOptions.map((value) => ({ value, label: props.filterOptionLabel?.(value) ?? value }))}
          onChange={(value) => setFilter(value ?? '')}
        />
      </View>
      <SearchBar value={search} onChange={setSearch} placeholder={props.searchPlaceholder} />
      {canEdit && canViewCost ? (
        <Panel title="Kâr oranı uygula" subtitle="Satış = alış maliyeti × (1 + oran), tam birime yuvarlanır.">
          <Field label="Kâr oranı (%)" keyboardType="decimal-pad" value={percent} onChangeText={setPercent} editable={!saving} />
          <SwitchRow label="Yalnız satış fiyatı boş olanlar" value={onlyEmpty} onChange={setOnlyEmpty} disabled={saving} />
          <SmallButton icon="calculator-outline" label={`Görünen ${visible.length} satıra uygula`} onPress={markup} disabled={saving} />
        </Panel>
      ) : null}
      <Text
        accessibilityLiveRegion="polite"
        style={{ paddingHorizontal: SCREEN_PAD }}
        className="font-inter text-xs text-muted-foreground"
      >
        {visible.length} / {rows.length} satır · {pricedCount} satırın satış fiyatı girilmiş
      </Text>
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlashList
          maintainVisibleContentPosition={{ disabled: true }}
          style={{ flex: 1 }}
          data={visible}
          extraData={drafts}
          keyExtractor={(row) => row.id}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={header}
          contentContainerStyle={{ paddingBottom: (canEdit && dirty.length ? 0 : tabClearance) + 32 }}
          refreshing={props.query.isRefetching}
          onRefresh={() => void props.query.refetch()}
          renderItem={({ item: row }) => {
            const draft = draftFor(row, drafts);
            const sale = parsePrice(draft.salePrice);
            const margin = marginPercent(row, draft);
            const label = props.rowLabel(row);
            return (
              <View style={{ paddingHorizontal: SCREEN_PAD }}>
                <View accessible={!canEdit} accessibilityLabel={canEdit ? undefined : `${label}, satış fiyatı ${formatAmount(row.salePrice, row.saleCurrencyCode)}`}
                  className="my-[5px] gap-2.5 rounded-[16px] border border-border bg-card p-3.5">
                  <View className="gap-0.5">
                    <Text className="font-inter-semibold text-[15px] text-foreground" numberOfLines={2}>{props.rowTitle(row)}</Text>
                    {props.rowLines(row).filter(Boolean).map((line, index) => (
                      <Text key={`${index}-${line}`} className="font-inter text-xs text-muted-foreground" numberOfLines={1}>{line}</Text>
                    ))}
                  </View>
                  {canViewCost ? (
                    <View className="flex-row gap-3">
                      <Cell label="Alış maliyeti" value={formatAmount(row.costPrice, row.costCurrencyCode)} />
                      <Cell
                        label="Kâr"
                        value={margin == null ? '—' : `%${margin.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`}
                        color={margin != null && margin < 0 ? colors.destructive : undefined}
                      />
                    </View>
                  ) : null}
                  {canEdit ? (
                    <View className="gap-2 border-t border-border pt-2.5">
                      <Text className="font-inter-medium text-[13px] text-muted-foreground">Satış fiyatı</Text>
                      <TextInput
                        accessibilityLabel={`${label} satış fiyatı`}
                        accessibilityHint={sale === undefined ? 'Geçersiz fiyat' : undefined}
                        keyboardType="decimal-pad"
                        placeholder="—"
                        placeholderTextColor={colors.mutedForeground}
                        value={draft.salePrice}
                        editable={!saving}
                        onChangeText={(text) => setDraft(row, { salePrice: text })}
                        style={{ borderColor: sale === undefined ? colors.destructive : colors.border, fontVariant: ['tabular-nums'], opacity: saving ? 0.6 : 1 }}
                        className="min-h-12 rounded-control border bg-input-background px-3 text-right font-inter text-base text-foreground"
                      />
                      {sale === undefined ? <Text className="font-inter text-xs text-destructive">Geçerli bir fiyat girin.</Text> : null}
                      <Segmented
                        label={`${label} para birimi`}
                        value={draft.currency}
                        options={CURRENCY_OPTIONS}
                        disabled={saving}
                        onChange={(currency) => setDraft(row, { currency })}
                      />
                    </View>
                  ) : (
                    <Cell label="Satış fiyatı" value={formatAmount(row.salePrice, row.saleCurrencyCode)} />
                  )}
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <EmptyState
              title={rows.length ? 'Eşleşen satır yok' : 'Satır bulunamadı'}
              hint={rows.length ? 'Filtre veya aramayı değiştirin.' : 'Bu bölümde fiyatlanacak kayıt yok.'}
              actionLabel={rows.length ? 'Filtreleri temizle' : undefined}
              onAction={rows.length ? () => { setFilter(''); setSearch(''); } : undefined}
            />
          }
        />
        {canEdit && dirty.length ? (
          <View style={{ paddingBottom: tabClearance + 12 }} className="flex-row gap-3 border-t border-border bg-card px-4 pt-3">
            <View className="flex-1">
              <Button label="Vazgeç" variant="ghost" disabled={props.save.isPending} onPress={() => setDrafts({})} />
            </View>
            <View className="flex-[2]">
              <Button
                label={props.save.isPending ? 'Kaydediliyor…' : `Değişiklikleri kaydet (${dirty.length})`}
                loading={props.save.isPending}
                disabled={invalid || props.save.isPending}
                onPress={save}
              />
            </View>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Cell({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View className="min-w-[45%] flex-1 gap-1">
      <Text className="font-inter text-[12px] text-muted-foreground">{label}</Text>
      <Text className="font-inter-semibold text-[15px] text-foreground" style={[{ fontVariant: ['tabular-nums'] }, color ? { color } : null]}>
        {value}
      </Text>
    </View>
  );
}
