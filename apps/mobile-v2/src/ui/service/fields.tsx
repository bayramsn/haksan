import { SelectionListFooter } from '@/src/ui/pickers/SelectionListFooter';
import { useReservedMachineStock } from '@/src/api/service.hooks';
import { SearchSelect, useSearchRemoteBag, type RemoteOptions, type SelectItem } from '@/src/ui/select/SearchSelect';
import type { StockRow } from '@/src/api/products.api';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useCustomerDevice, useCustomerDevicesByCompany, useDirectory } from '@/src/api/operations.hooks';
import { useProductList, useWarehouses } from '@/src/api/inventory.hooks';
import type { ProductModel } from '@/src/api/endpoints';
import { useAuth } from '@/src/auth/AuthProvider';
import { useDebouncedValue } from '@/src/lib/useDebouncedValue';
import { useTheme } from '@/src/theme/theme';
import { Button, EmptyState, ErrorState, Loading, SearchBar } from '@/src/ui';
import { DateTimeField } from '@/src/ui/pickers/DateTimeField';
import { HostedSheet } from '@/src/ui/pickers/HostedSheet';
import { OptionPicker } from '@/src/ui/pickers/OptionPicker';
import { PickerField } from '@/src/ui/pickers/PickerField';
import { useReportUsers } from '@/src/api/reports.hooks';
import { dayInput, isServiceStaff } from './logistics';

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
  serviceOnly = false,
}: {
  label: string;
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder?: string;
  /** Web gibi yalnız servis personeli; `users.read` yoksa veya kimse eşleşmezse tüm dizin. */
  serviceOnly?: boolean;
}) {
  const directory = useDirectory();
  const staff = useReportUsers(serviceOnly);
  // Süzgeç gelmeden tüm dizini gösterme; yoksa servis dışı biri seçilebilir.
  const loading = directory.isPending || (serviceOnly && staff.isLoading);
  const { user: me } = useAuth();
  const options = useMemo(() => {
    const serviceIds = serviceOnly ? new Set((staff.data ?? []).filter(isServiceStaff).map((user) => user.id)) : null;
    const all = (directory.data ?? []).map((user) => ({ value: user.id, label: user.fullName, hint: user.email }));
    const people = me && !all.some((person) => person.value === me.id) ? [{ value: me.id, label: `${me.fullName} (ben)`, hint: me.email }, ...all] : all;
    return serviceIds?.size ? people.filter((person) => serviceIds.has(person.value) || person.value === value) : people;
  }, [directory.data, staff.data, serviceOnly, value, me]);
  return (
    <OptionPicker
      label={label}
      value={value}
      options={options}
      loading={loading}
      loadError={directory.error}
      onRetry={() => void directory.refetch()}
      placeholder={loading ? 'Yükleniyor…' : placeholder}
      icon="person-circle-outline"
      searchable
      clearable
      onChange={onChange}
    />
  );
}

export type DeviceChoice = {
  id: string;
  companyId?: string | null;
  companyName?: string | null;
  label: string;
  serialNumber: string | null;
  brand: string | null;
  model: string | null;
  controlUnit: string | null;
  controlUnitSerialNumber: string | null;
  productTypeName: string | null;
};

/** Şirkete bağlı tüm makinelere sayfalı, sunucu aramalı erişim. */
export function DevicePicker({ label = 'Makine', companyId, value, onChange, allowOtherCompanies = false }: {
  label?: string;
  companyId: string | null;
  value: string | null;
  allowOtherCompanies?: boolean;
  onChange: (device: DeviceChoice | null) => void;
}) {
  const selected = useCustomerDevice(value ?? '');
  const device = selected.data;
  const selectedRecords: DeviceChoice[] = device ? [{ id: device.id, companyId: device.companyId, companyName: device.company?.shortName ?? device.company?.legalTitle, label: `${[device.brandName, device.productModelName ?? device.model].filter(Boolean).join(' ') || 'Makine'} · ${device.serialNumber || 'Seri no yok'}`, serialNumber: device.serialNumber, brand: device.brandName, model: device.productModelName ?? device.model, controlUnit: device.controlUnit, controlUnitSerialNumber: device.controlUnitSerialNumber ?? null, productTypeName: device.productTypeName }] : [];
  return <DeviceRecordPicker label={label} companyId={companyId} values={value ? [value] : []} selectedRecords={selectedRecords} allowOtherCompanies={allowOtherCompanies} onChange={(choices) => onChange(choices[0] ?? null)} />;
}

export function DeviceRecordPicker({ label = 'Makineler', companyId, values, onChange, multiple = false, selectedRecords = [], allowOtherCompanies = false }: {
  label?: string;
  companyId: string | null;
  values: string[];
  selectedRecords?: DeviceChoice[];
  allowOtherCompanies?: boolean;
  multiple?: boolean;
  onChange: (devices: DeviceChoice[]) => void;
}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<Record<string, DeviceChoice>>({});
  useEffect(() => { setPicked({}); setSearch(''); setOpen(false); }, [companyId]);
  const term = useDebouncedValue(search.trim());
  const list = useCustomerDevicesByCompany(companyId ?? undefined, term || undefined, allowOtherCompanies);
  const choices = useMemo<DeviceChoice[]>(() => (list.data?.items ?? []).map((device) => ({
    id: device.id, companyId: device.companyId, companyName: device.company?.shortName ?? device.company?.legalTitle,
    label: `${[device.brandName, device.productModelName ?? device.model].filter(Boolean).join(' ') || 'Makine'} · ${device.serialNumber || 'Seri no yok'}`,
    serialNumber: device.serialNumber, brand: device.brandName, model: device.productModelName ?? device.model,
    controlUnit: device.controlUnit, controlUnitSerialNumber: device.controlUnitSerialNumber ?? null, productTypeName: device.productTypeName,
  })), [list.data?.items]);
  const records = { ...picked, ...Object.fromEntries(selectedRecords.map((choice) => [choice.id, choice])), ...Object.fromEntries(choices.map((choice) => [choice.id, choice])) };
  const close = () => { setOpen(false); setSearch(''); };
  const selected = values.map((id) => records[id]?.label).filter(Boolean);
  return <>
    <PickerField label={label} value={values.length ? (selected.length === values.length ? selected.join(', ') : `${values.length} makine seçili`) : ''}
      placeholder={!companyId && !allowOtherCompanies ? 'Önce firma seçin' : 'Makine seçin'} icon="hardware-chip-outline" disabled={!companyId && !allowOtherCompanies}
      onPress={() => setOpen(true)} onClear={values.length ? () => onChange([]) : undefined} />
    <HostedSheet open={open} onClose={close} heightRatio={0.8}>
      <View className="min-h-0 flex-1">
        <View className="gap-3 border-b border-border px-4 pb-3">
          <Text className="font-inter-semibold text-base text-foreground">{label}</Text>
          <SearchBar value={search} onChange={setSearch} placeholder="Model veya seri numarası ara" />
        </View>
        <FlatList className="flex-1" data={choices} keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32, flexGrow: 1 }}
          renderItem={({ item }) => <Pressable accessibilityRole={multiple ? 'checkbox' : 'button'} accessibilityState={{ checked: values.includes(item.id), selected: values.includes(item.id) }}
            className="min-h-[56px] flex-row items-center gap-3 border-b border-border py-3"
            onPress={() => {
              setPicked((current) => ({ ...current, [item.id]: item }));
              const ids = multiple ? values.includes(item.id) ? values.filter((id) => id !== item.id) : [...values, item.id] : [item.id];
              onChange(ids.map((id) => records[id] ?? { id, label: 'Seçili makine', serialNumber: null, brand: null, model: null, controlUnit: null, controlUnitSerialNumber: null, productTypeName: null }));
              if (!multiple) close();
            }}>
            <View className="flex-1 gap-1"><Text className="font-inter-medium text-sm text-foreground">{item.label}</Text>
              {allowOtherCompanies && item.companyName ? <Text className="font-inter text-xs text-muted-foreground">{item.companyName}</Text> : null}
              {item.controlUnit ? <Text className="font-inter text-xs text-muted-foreground">CNC: {item.controlUnit}</Text> : null}</View>
            {values.includes(item.id) ? <Ionicons name="checkmark-circle" size={22} color={colors.primary} /> : null}
          </Pressable>}
          onEndReachedThreshold={0.5} onEndReached={() => { if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage(); }}
          ListEmptyComponent={list.isPending ? <Loading /> : list.error ? <ErrorState message={list.error.message} onRetry={() => void list.refetch()} /> : <EmptyState title="Makine bulunamadı" hint="Aramayı değiştirin veya firmanın makine kartlarını kontrol edin." />}
          ListFooterComponent={list.error && choices.length ? <ErrorState message={list.error.message} onRetry={() => void list.fetchNextPage()} /> : list.isFetchingNextPage ? <Loading /> : list.hasNextPage ? <Button label="Daha fazla makine" variant="ghost" onPress={() => void list.fetchNextPage()} /> : null}
        />
        {multiple ? <View className="border-t border-border p-4"><Button label={`Seçimi tamamla (${values.length})`} onPress={close} /></View> : null}
      </View>
    </HostedSheet>
  </>;
}

export function WarehousePicker({ label, value, onChange }: { label: string; value: string | null; onChange: (id: string | null) => void }) {
  const warehouses = useWarehouses();
  return (
    <OptionPicker
      label={label}
      value={value}
      options={(warehouses.data ?? []).map((warehouse) => ({ value: warehouse.id, label: warehouse.name, hint: warehouse.type }))}
      loading={warehouses.isPending} loadError={warehouses.error} onRetry={() => void warehouses.refetch()}
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
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState(categoryCodes?.[0]);
  useEffect(() => { setCategory(categoryCodes?.[0]); setSearch(''); }, [categoryCodes?.join(',')]);
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
        onPress={() => setOpen(true)}
        onClear={() => onChange(null)}
      />
      <HostedSheet
        open={open}
        onClose={() => {
          setSearch('');
          setOpen(false);
        }}
        heightRatio={0.8}
      >
        <View className="min-h-0 flex-1">
          <View className="gap-3 border-b border-border px-4 pb-3">
            <Text accessibilityRole="header" className="font-inter-semibold text-base text-foreground">{label}</Text>
            {categoryCodes && categoryCodes.length > 1 ? (
              <ChoiceChips
                value={category ?? ''}
                options={categoryCodes.map((code) => ({
                  value: code,
                  label: code === 'YEDEK_PARCA' ? 'Yedek Parça' : code === 'AKSESUAR' ? 'Aksesuar' : code,
                }))}
                onChange={setCategory}
              />
            ) : null}
            <SearchBar value={search} onChange={setSearch} placeholder="Model, stok kodu ara" />
          </View>
          <FlatList
            className="flex-1"
            data={rows}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32, flexGrow: 1 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            renderItem={({ item }) => {
              const selected = item.id === value?.id;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => {
                    onChange(item);
                    setOpen(false);
                  }}
                  className="min-h-[56px] flex-row items-center gap-3 border-b border-border py-2 active:opacity-70"
                >
                  <Ionicons name="pricetag-outline" size={19} color={selected ? colors.primary : colors.mutedForeground} />
                  <View className="flex-1">
                    <Text className="font-inter-semibold text-sm text-foreground" numberOfLines={1}>
                      {item.fullName || item.modelCode}
                    </Text>
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
              list.isPending ? (
                <Loading />
              ) : list.error ? (
                <ErrorState message={list.error.message} onRetry={() => void list.refetch()} />
              ) : (
                <EmptyState title="Ürün bulunamadı" />
              )
            }
            ListFooterComponent={<SelectionListFooter hasNextPage={list.hasNextPage} isFetchingNextPage={list.isFetchingNextPage} error={list.error} fetchNextPage={() => list.error && !list.hasNextPage ? list.refetch() : list.fetchNextPage()} />}
          />
        </View>
      </HostedSheet>
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

function useReservedStockOptions(search: string): RemoteOptions<StockRow> {
  const { companyId, excludedIds } = useSearchRemoteBag<{ companyId: string | null; excludedIds: string[] }>();
  const list = useReservedMachineStock(companyId, search || undefined);
  return {
    items: (list.data?.items ?? []).filter((item) => !excludedIds.includes(item.id)).map((item) => ({ id: item.id, label: [item.product?.modelCode || item.product?.fullName, item.serialNumber].filter(Boolean).join(' · '), hint: item.brand?.name, data: item })),
    isPending: list.isPending, error: list.error, refetch: () => void list.refetch(),
    hasNextPage: list.hasNextPage, isFetchingNextPage: list.isFetchingNextPage, fetchNextPage: () => void list.fetchNextPage(),
  };
}

export function ReservedStockPicker({ companyId, value, selectedId, excludedIds, onSelect }: {
  companyId: string | null;
  value: string;
  selectedId: string | null;
  excludedIds: string[];
  onSelect: (item: SelectItem<StockRow> | null) => void;
}) {
  return <SearchSelect label="Stok / Seri No" placeholder={companyId ? 'Kayıtlı stoktan seçin veya manuel doldurun' : 'Önce firma seçin'} icon="cube-outline"
    value={value} selectedId={selectedId} disabled={!companyId} clearable onSelect={onSelect}
    useRemote={useReservedStockOptions} remoteBag={{ companyId, excludedIds }} searchPlaceholder="Model veya seri numarası ara" emptyTitle="Bu sayfada uygun stok bulunamadı" />;
}
