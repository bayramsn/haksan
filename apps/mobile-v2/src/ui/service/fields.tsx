import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheetFlatList, BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import { useCustomerDevicesByCompany, useDirectory } from '@/src/api/operations.hooks';
import { useProductList, useWarehouses } from '@/src/api/inventory.hooks';
import type { ProductModel } from '@/src/api/endpoints';
import { useAuth } from '@/src/auth/AuthProvider';
import { useDebouncedValue } from '@/src/lib/useDebouncedValue';
import { useTheme } from '@/src/theme/theme';
import { EmptyState, ErrorState, Loading, SearchBar } from '@/src/ui';
import { DateTimeField } from '@/src/ui/pickers/DateTimeField';
import { OptionPicker } from '@/src/ui/pickers/OptionPicker';
import { PickerField, useSheetProps } from '@/src/ui/pickers/PickerField';
import { dayInput } from './logistics';

/** Form bölüm başlığı + kart gövdesi. */
export function FormSection({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <View className="gap-3 rounded-surface border border-border bg-card p-4">
      <View className="gap-0.5">
        <Text accessibilityRole="header" className="font-display-semibold text-[17px] text-foreground">{title}</Text>
        {hint ? <Text className="font-inter text-xs text-muted-foreground">{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}

/** Radyo davranışlı seçenek satırı; tekrar dokunmak seçimi kaldırmaz. */
export function ChoiceChips<T extends string>({
  label,
  value,
  options,
  onChange,
  destructiveValue,
}: {
  label?: string;
  value: T | '' | null;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  destructiveValue?: T;
}) {
  return (
    <View className="gap-1.5">
      {label ? <Text className="font-inter-medium text-[13px] text-muted-foreground">{label}</Text> : null}
      <View accessibilityRole="radiogroup" className="flex-row flex-wrap gap-2">
        {options.map((option) => {
          const selected = option.value === value;
          const danger = selected && option.value === destructiveValue;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={label ? `${label}: ${option.label}` : option.label}
              onPress={() => onChange(option.value)}
              className={`min-h-[44px] flex-grow items-center justify-center rounded-control border px-3 ${
                danger ? 'border-destructive bg-destructive' : selected ? 'border-primary bg-primary' : 'border-border bg-card'
              }`}
            >
              <Text className={`font-inter-semibold text-[13px] ${selected ? 'text-primary-foreground' : 'text-foreground'}`}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** YYYY-AA-GG metniyle çalışan tarih alanı (DateTimeField üstüne). */
export function DayField({
  label,
  value,
  onChange,
  clearable = true,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  clearable?: boolean;
  error?: string;
}) {
  const date = useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const parsed = new Date(`${value}T12:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }, [value]);
  return (
    <DateTimeField
      label={label}
      mode="date"
      value={date}
      clearable={clearable}
      error={error}
      onChange={(next) => onChange(next ? dayInput(next) : '')}
    />
  );
}

/** Kurum içi kullanıcı (personel/teknisyen) seçici. */
export function UserPicker({
  label,
  value,
  onChange,
  placeholder = 'Belirtilmedi',
}: {
  label: string;
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder?: string;
}) {
  const directory = useDirectory();
  const { user: me } = useAuth();
  const options = useMemo(() => {
    const people = (directory.data ?? []).map((user) => ({ value: user.id, label: user.fullName, hint: user.email }));
    return me && !people.some((person) => person.value === me.id) ? [{ value: me.id, label: `${me.fullName} (ben)`, hint: me.email }, ...people] : people;
  }, [directory.data, me]);
  return (
    <OptionPicker
      label={label}
      value={value}
      options={options}
      placeholder={directory.isPending ? 'Yükleniyor…' : placeholder}
      icon="person-circle-outline"
      searchable
      clearable
      onChange={onChange}
    />
  );
}

export type DeviceChoice = {
  id: string;
  label: string;
  serialNumber: string | null;
  brand: string | null;
  model: string | null;
  controlUnit: string | null;
  controlUnitSerialNumber: string | null;
  productTypeName: string | null;
};

/** Seçili firmanın makineleri; firma yoksa kapalı. */
export function DevicePicker({
  label = 'Makine',
  companyId,
  value,
  onChange,
}: {
  label?: string;
  companyId: string | null;
  value: string | null;
  onChange: (device: DeviceChoice | null) => void;
}) {
  const list = useCustomerDevicesByCompany(companyId ?? undefined);
  const choices = useMemo<DeviceChoice[]>(
    () =>
      (list.data?.items ?? []).map((device) => ({
        id: device.id,
        label: `${[device.brandName, device.productModelName ?? device.model].filter(Boolean).join(' ') || 'Makine'} · ${device.serialNumber || 'Seri no yok'}`,
        serialNumber: device.serialNumber,
        brand: device.brandName,
        model: device.productModelName ?? device.model,
        controlUnit: device.controlUnit,
        controlUnitSerialNumber: device.controlUnitSerialNumber ?? null,
        productTypeName: device.productTypeName,
      })),
    [list.data?.items],
  );
  return (
    <OptionPicker
      label={label}
      value={value}
      options={choices.map((choice) => ({ value: choice.id, label: choice.label, hint: choice.controlUnit ? `CNC: ${choice.controlUnit}` : null }))}
      placeholder={!companyId ? 'Önce firma seçin' : list.isPending ? 'Yükleniyor…' : choices.length ? 'Makine seçin' : 'Bu firmaya bağlı makine yok'}
      icon="hardware-chip-outline"
      disabled={!companyId}
      searchable
      clearable
      onChange={(id) => onChange(choices.find((choice) => choice.id === id) ?? null)}
    />
  );
}

export function WarehousePicker({ label, value, onChange }: { label: string; value: string | null; onChange: (id: string | null) => void }) {
  const warehouses = useWarehouses();
  return (
    <OptionPicker
      label={label}
      value={value}
      options={(warehouses.data ?? []).map((warehouse) => ({ value: warehouse.id, label: warehouse.name, hint: warehouse.type }))}
      placeholder={warehouses.isPending ? 'Yükleniyor…' : 'Depo seçin'}
      icon="cube-outline"
      clearable
      onChange={onChange}
    />
  );
}

/** Uzaktan aramalı ürün seçici; kategori kodu verilirse yalnız o kategori. */
export function ProductPicker({
  label,
  value,
  categoryCodes,
  onChange,
  placeholder = 'Ürün seçin…',
  error,
}: {
  label: string;
  value: { id: string; name: string } | null;
  categoryCodes?: string[];
  onChange: (product: ProductModel | null) => void;
  placeholder?: string;
  error?: string;
}) {
  const { colors } = useTheme();
  const sheet = useRef<BottomSheetModal>(null);
  const sheetProps = useSheetProps();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState(categoryCodes?.[0]);
  const debounced = useDebouncedValue(search, 275);
  const list = useProductList({ search: debounced.trim() || undefined, categoryCode: category });
  const rows = list.data?.items ?? [];

  return (
    <>
      <PickerField
        label={label}
        value={value?.name ?? ''}
        placeholder={placeholder}
        icon="pricetag-outline"
        error={error}
        onPress={() => sheet.current?.present()}
        onClear={() => onChange(null)}
      />
      <BottomSheetModal ref={sheet} {...sheetProps} onDismiss={() => setSearch('')}>
        <BottomSheetView className="gap-3 pb-2">
          <Text accessibilityRole="header" className="px-4 font-inter-semibold text-base text-foreground">{label}</Text>
          {categoryCodes && categoryCodes.length > 1 ? (
            <View className="px-4">
              <ChoiceChips
                value={category ?? ''}
                options={categoryCodes.map((code) => ({ value: code, label: code === 'YEDEK_PARCA' ? 'Yedek Parça' : code === 'AKSESUAR' ? 'Aksesuar' : code }))}
                onChange={setCategory}
              />
            </View>
          ) : null}
          <SearchBar value={search} onChange={setSearch} placeholder="Model, stok kodu ara" />
        </BottomSheetView>
        <BottomSheetFlatList
          data={rows}
          keyExtractor={(item: ProductModel) => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          renderItem={({ item }: { item: ProductModel }) => {
            const selected = item.id === value?.id;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => {
                  onChange(item);
                  sheet.current?.dismiss();
                }}
                className="min-h-[56px] flex-row items-center gap-3 border-b border-border py-2 active:opacity-70"
              >
                <Ionicons name="pricetag-outline" size={19} color={selected ? colors.primary : colors.mutedForeground} />
                <View className="flex-1">
                  <Text className="font-inter-semibold text-sm text-foreground" numberOfLines={1}>{item.fullName || item.modelCode}</Text>
                  <Text className="font-inter text-xs text-muted-foreground" numberOfLines={1}>
                    {[item.stockCode, item.brand?.name, item.category?.name].filter(Boolean).join(' · ') || item.modelCode}
                  </Text>
                </View>
                {selected ? <Ionicons name="checkmark" size={19} color={colors.primary} /> : null}
              </Pressable>
            );
          }}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
          }}
          ListEmptyComponent={
            list.isPending ? <Loading /> : list.error ? <ErrorState message={list.error.message} onRetry={() => void list.refetch()} /> : <EmptyState title="Ürün bulunamadı" />
          }
          ListFooterComponent={list.isFetchingNextPage ? <Loading /> : null}
        />
      </BottomSheetModal>
    </>
  );
}

/** Kısa etiket/değer çifti (iki sütunlu özet ızgarası için). */
export function MetaCell({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <View className="min-w-[45%] flex-1 gap-0.5 rounded-control bg-muted px-3 py-2">
      <Text className="font-inter text-[11px] text-muted-foreground">{label}</Text>
      <Text className="font-inter-semibold text-[13px] text-foreground" numberOfLines={2}>{value || '—'}</Text>
    </View>
  );
}
