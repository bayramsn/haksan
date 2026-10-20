import { useMemo, useState, type ReactNode, type RefObject } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BottomSheetBackdrop, BottomSheetFlatList, BottomSheetModal } from '@gorhom/bottom-sheet';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCompanyList } from '@/src/api/companies.hooks';
import { useOpportunityList, useQuoteList } from '@/src/api/crm.hooks';
import { useProductList } from '@/src/api/inventory.hooks';
import type { CompanyListItem, OpportunityListItem, ProductModel, QuoteListItem } from '@/src/api/endpoints';
import { formatAmount, formatDate } from '@/src/lib/format';
import { useDebouncedValue } from '@/src/lib/useDebouncedValue';
import { useTheme, type ThemeColors } from '@/src/theme/theme';
import { Button, EmptyState, ErrorState, Loading, SearchBar } from '@/src/ui';

export function sheetProps(colors: ThemeColors) {
  return {
    snapPoints: ['80%'],
    enableDynamicSizing: false,
    backgroundStyle: { backgroundColor: colors.card },
    handleIndicatorStyle: { backgroundColor: colors.mutedForeground },
    backdropComponent: (props: Parameters<typeof BottomSheetBackdrop>[0]) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />
    ),
  };
}

/** Modal formların ortak iskeleti: başlık, kaydırılabilir gövde, alt eylem çubuğu. */
export function ModalForm({
  title,
  children,
  submitLabel,
  onSubmit,
  loading,
  disabled,
}: {
  title: string;
  children: ReactNode;
  submitLabel: string;
  onSubmit: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  const router = useRouter();
  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['bottom', 'left', 'right']}>
      <Stack.Screen options={{ title, headerShown: true }} />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerClassName="gap-5 p-4 pb-10" keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
        <View className="flex-row gap-3 border-t border-border bg-card px-4 py-3">
          <View className="flex-1">
            <Button label="Vazgeç" variant="ghost" onPress={() => router.back()} disabled={loading} />
          </View>
          <View className="flex-[2]">
            <Button label={submitLabel} loading={loading} disabled={disabled || loading} onPress={onSubmit} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** Seçim alanı: dokununca alt sayfa açılır; seçili değer temizlenebilir. */
export function PickerField({
  label,
  value,
  placeholder,
  icon,
  onPress,
  onClear,
  error,
  disabled,
}: {
  label: string;
  value: string | null;
  placeholder: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  onClear?: () => void;
  error?: string;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View className="gap-1">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value ?? placeholder}`}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}
        className={`min-h-12 flex-row items-center gap-3 rounded-control border bg-card px-3 py-2 active:opacity-70 ${
          error ? 'border-destructive' : value ? 'border-border' : 'border-dashed border-border'
        } ${disabled ? 'opacity-60' : ''}`}
      >
        <Ionicons name={icon} size={19} color={colors.primary} />
        <View className="flex-1 gap-0.5">
          <Text className="font-inter-medium text-xs text-muted-foreground">{label}</Text>
          <Text className="font-inter text-base text-foreground" numberOfLines={1}>
            {value ?? placeholder}
          </Text>
        </View>
        {value && onClear && !disabled ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`${label} seçimini kaldır`} onPress={onClear} hitSlop={12}>
            <Ionicons name="close-circle" size={20} color={colors.mutedForeground} />
          </Pressable>
        ) : (
          <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
        )}
      </Pressable>
      {error ? <Text className="font-inter text-xs text-destructive">{error}</Text> : null}
    </View>
  );
}

/** Zorunlu tekli seçim (radyo çipleri). */
export function ChoiceChips<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label?: string;
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (next: T) => void;
}) {
  return (
    <View className="gap-1.5">
      {label ? <Text className="font-inter-medium text-xs text-muted-foreground">{label}</Text> : null}
      <View className="flex-row flex-wrap gap-2">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={option.label}
              onPress={() => onChange(option.value)}
              className={`min-h-[44px] items-center justify-center rounded-control border px-3.5 ${
                selected ? 'border-primary bg-secondary' : 'border-border bg-card'
              }`}
            >
              <Text className={`font-inter-semibold text-[13px] ${selected ? 'text-primary' : 'text-foreground'}`}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Açık/kapalı seçimi; Switch yerine okunur iki seçenek (web toggle metinleriyle). */
export function ToggleRow({
  label,
  value,
  onChange,
  onLabel = 'Evet',
  offLabel = 'Hayır',
}: {
  label: string;
  value: boolean;
  onChange: (next: boolean) => void;
  onLabel?: string;
  offLabel?: string;
}) {
  return (
    <ChoiceChips
      label={label}
      options={[
        { value: 'on', label: onLabel },
        { value: 'off', label: offLabel },
      ]}
      value={value ? 'on' : 'off'}
      onChange={(next) => onChange(next === 'on')}
    />
  );
}

function SheetRow({
  title,
  subtitle,
  meta,
  icon,
  selected,
  onPress,
}: {
  title: string;
  subtitle?: string | null;
  meta?: string | null;
  icon: keyof typeof Ionicons.glyphMap;
  selected?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={title}
      onPress={onPress}
      className="min-h-[56px] flex-row items-center gap-3 border-b border-border py-2 active:opacity-70"
    >
      <Ionicons name={icon} size={19} color={selected ? colors.primary : colors.mutedForeground} />
      <View className="flex-1">
        <Text className="font-inter-semibold text-sm text-foreground" numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text className="font-inter text-xs text-muted-foreground" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {meta ? <Text className="font-inter-medium text-xs text-foreground">{meta}</Text> : null}
      {selected ? <Ionicons name="checkmark" size={19} color={colors.primary} /> : null}
    </Pressable>
  );
}

export function CompanyPickerSheet({
  sheetRef,
  selectedId,
  onSelect,
}: {
  sheetRef: RefObject<BottomSheetModal | null>;
  selectedId?: string;
  onSelect: (company: CompanyListItem) => void;
}) {
  const { colors } = useTheme();
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search.trim());
  const list = useCompanyList(
    useMemo(() => ({ search: debounced || undefined, sortBy: 'name' as const, sortDir: 'asc' as const }), [debounced])
  );
  return (
    <BottomSheetModal ref={sheetRef} {...sheetProps(colors)}>
      <BottomSheetFlatList
        data={list.data?.items ?? []}
        keyExtractor={(item: CompanyListItem) => item.id}
        ListHeaderComponent={
          <View className="gap-3 bg-card pb-2">
            <Text className="font-display text-base text-foreground">Firma seçin</Text>
            <SearchBar value={search} onChange={setSearch} placeholder="Firma ara" />
          </View>
        }
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
        renderItem={({ item }: { item: CompanyListItem }) => (
          <SheetRow
            title={item.shortName ?? item.legalTitle}
            subtitle={item.shortName ? item.legalTitle : null}
            icon="business-outline"
            selected={item.id === selectedId}
            onPress={() => {
              onSelect(item);
              sheetRef.current?.dismiss();
            }}
          />
        )}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
        }}
        ListEmptyComponent={
          list.isPending ? (
            <Loading />
          ) : list.error ? (
            <ErrorState message={list.error.message} onRetry={() => void list.refetch()} />
          ) : (
            <EmptyState title="Firma bulunamadı" />
          )
        }
        ListFooterComponent={list.isFetchingNextPage ? <Loading /> : null}
      />
    </BottomSheetModal>
  );
}

/** Ürün kataloğundan seçim — `productsApi.list` (useProductList) üzerinden. */
export function ProductPickerSheet({
  sheetRef,
  onSelect,
}: {
  sheetRef: RefObject<BottomSheetModal | null>;
  onSelect: (product: ProductModel) => void;
}) {
  const { colors } = useTheme();
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search.trim());
  const list = useProductList(useMemo(() => ({ search: debounced || undefined }), [debounced]));
  return (
    <BottomSheetModal ref={sheetRef} {...sheetProps(colors)}>
      <BottomSheetFlatList
        data={list.data?.items ?? []}
        keyExtractor={(item: ProductModel) => item.id}
        ListHeaderComponent={
          <View className="gap-3 bg-card pb-2">
            <Text className="font-display text-base text-foreground">Ürün seçin</Text>
            <SearchBar value={search} onChange={setSearch} placeholder="Model kodu veya ürün adı" />
          </View>
        }
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
        renderItem={({ item }: { item: ProductModel }) => (
          <SheetRow
            title={item.fullName}
            subtitle={[item.brand?.name, item.modelCode].filter(Boolean).join(' · ')}
            meta={item.listPrice ? formatAmount(item.listPrice, item.currency?.code ?? 'USD') : null}
            icon="cube-outline"
            onPress={() => {
              onSelect(item);
              sheetRef.current?.dismiss();
            }}
          />
        )}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
        }}
        ListEmptyComponent={
          list.isPending ? (
            <Loading />
          ) : list.error ? (
            <ErrorState message={list.error.message} onRetry={() => void list.refetch()} />
          ) : (
            <EmptyState title="Ürün bulunamadı" />
          )
        }
        ListFooterComponent={list.isFetchingNextPage ? <Loading /> : null}
      />
    </BottomSheetModal>
  );
}

/** Teklif revizyonu seçimi (bağlantı tamamlama, tekliften belge oluşturma). */
export function QuotePickerSheet({
  sheetRef,
  selectedId,
  companyId,
  onSelect,
}: {
  sheetRef: RefObject<BottomSheetModal | null>;
  selectedId?: string;
  companyId?: string;
  onSelect: (quote: QuoteListItem) => void;
}) {
  const { colors } = useTheme();
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search.trim());
  const list = useQuoteList(
    useMemo(() => ({ search: debounced || undefined, ...(companyId ? { companyId } : {}) }), [debounced, companyId])
  );
  return (
    <BottomSheetModal ref={sheetRef} {...sheetProps(colors)}>
      <BottomSheetFlatList
        data={list.data?.items ?? []}
        keyExtractor={(item: QuoteListItem) => item.id}
        ListHeaderComponent={
          <View className="gap-3 bg-card pb-2">
            <Text className="font-display text-base text-foreground">Teklif seçin</Text>
            <SearchBar value={search} onChange={setSearch} placeholder="Teklif no veya firma" />
          </View>
        }
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
        renderItem={({ item }: { item: QuoteListItem }) => (
          <SheetRow
            title={`${item.documentNo} · R${item.revisionNo}`}
            subtitle={[item.company?.shortName ?? item.company?.legalTitle, formatDate(item.quoteDate)].filter(Boolean).join(' · ')}
            meta={formatAmount(item.grandTotal, item.currency?.code ?? 'USD')}
            icon="document-text-outline"
            selected={item.id === selectedId}
            onPress={() => {
              onSelect(item);
              sheetRef.current?.dismiss();
            }}
          />
        )}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
        }}
        ListEmptyComponent={
          list.isPending ? (
            <Loading />
          ) : list.error ? (
            <ErrorState message={list.error.message} onRetry={() => void list.refetch()} />
          ) : (
            <EmptyState title="Teklif bulunamadı" />
          )
        }
        ListFooterComponent={list.isFetchingNextPage ? <Loading /> : null}
      />
    </BottomSheetModal>
  );
}

/** Satış kartı seçimi (doküman yükleme "Satış kartı (firma otomatik)" kapsamı). */
export function OpportunityPickerSheet({
  sheetRef,
  selectedId,
  onSelect,
}: {
  sheetRef: RefObject<BottomSheetModal | null>;
  selectedId?: string;
  onSelect: (opportunity: OpportunityListItem) => void;
}) {
  const { colors } = useTheme();
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search.trim());
  const list = useOpportunityList(useMemo(() => ({ search: debounced || undefined, view: 'all' as const }), [debounced]));
  return (
    <BottomSheetModal ref={sheetRef} {...sheetProps(colors)}>
      <BottomSheetFlatList
        data={list.data?.items ?? []}
        keyExtractor={(item: OpportunityListItem) => item.id}
        ListHeaderComponent={
          <View className="gap-3 bg-card pb-2">
            <Text className="font-display text-base text-foreground">Satış kartı seçin</Text>
            <SearchBar value={search} onChange={setSearch} placeholder="Firma veya kart ara" />
          </View>
        }
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
        renderItem={({ item }: { item: OpportunityListItem }) => (
          <SheetRow
            title={item.company?.shortName ?? item.company?.legalTitle ?? item.leadCompanyTitle ?? item.title}
            subtitle={item.title}
            meta={item.stage?.name ?? null}
            icon="briefcase-outline"
            selected={item.id === selectedId}
            onPress={() => {
              onSelect(item);
              sheetRef.current?.dismiss();
            }}
          />
        )}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
        }}
        ListEmptyComponent={
          list.isPending ? (
            <Loading />
          ) : list.error ? (
            <ErrorState message={list.error.message} onRetry={() => void list.refetch()} />
          ) : (
            <EmptyState title="Satış kartı bulunamadı" />
          )
        }
        ListFooterComponent={list.isFetchingNextPage ? <Loading /> : null}
      />
    </BottomSheetModal>
  );
}

/** Toplam satırı (ara toplam, iskonto, KDV, genel toplam). */
export function TotalLine({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View className="flex-row justify-between gap-4 py-1.5">
      <Text className={`text-sm ${strong ? 'font-inter-semibold text-foreground' : 'font-inter text-muted-foreground'}`}>{label}</Text>
      <Text
        className={strong ? 'font-inter-bold text-[16px] text-foreground' : 'font-inter text-sm text-foreground'}
        style={{ fontVariant: ['tabular-nums'] }}
      >
        {value}
      </Text>
    </View>
  );
}
