import { useNavigationBottomInset } from '@/src/ui/LiquidGlassTabBarBackground';
import { useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { useCan } from '@/src/auth/AuthProvider';
import type { ReferenceRecord } from '@/src/api/references.api';
import { useDeleteReference, useReferenceDevices, useReferences, useWonOpportunityIds } from '@/src/api/references.hooks';
import { useTheme } from '@/src/theme/theme';
import { Card, Chip, EmptyState, ErrorState, Fab, ListSkeleton, SCREEN_PAD, ScreenHeader, SearchBar, StatStrip } from '@/src/ui';
import { SyncStatus } from '@/src/ui/SyncStatus';
import { toast } from '@/src/ui/toast';
import { ChoiceChips, SimpleTable } from '@/src/ui/reports/parts';
import {
  autoRows,
  filterReferenceRows,
  formatReferenceDate,
  manualRows,
  referenceLocation,
  referenceStats,
  type ReferenceRow,
} from '@/src/ui/references/referenceLogic';

type View_ = 'cards' | 'table';

function RowActions({
  row,
  canUpdate,
  canDelete,
  onEdit,
  onDelete,
}: {
  row: ReferenceRow;
  canUpdate: boolean;
  canDelete: boolean;
  onEdit: (record: ReferenceRecord) => void;
  onDelete: (record: ReferenceRecord) => void;
}) {
  const { colors } = useTheme();
  if (!row.record) return <Chip tone="neutral" label="Otomatik" />;
  const record = row.record;
  return (
    <View className="flex-row">
      {canUpdate ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`${row.firm} referansını düzenle`} onPress={() => onEdit(record)} className="h-11 w-11 items-center justify-center active:opacity-60">
          <Ionicons name="create-outline" size={19} color={colors.mutedForeground} />
        </Pressable>
      ) : null}
      {canDelete ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`${row.firm} referansını sil`} onPress={() => onDelete(record)} className="h-11 w-11 items-center justify-center active:opacity-60">
          <Ionicons name="trash-outline" size={19} color={colors.destructive} />
        </Pressable>
      ) : null}
    </View>
  );
}

export default function ReferencesScreen() {
  const GLASS_TAB_BAR_HEIGHT = useNavigationBottomInset();
  const router = useRouter();
  const { colors } = useTheme();
  const canCreate = useCan('companies.create');
  const canUpdate = useCan('companies.update');
  const canDelete = useCan('companies.delete');
  const [search, setSearch] = useState('');
  const [view, setView] = useState<View_>('cards');

  const references = useReferences();
  const won = useWonOpportunityIds();
  const machineRows = useReferenceDevices();
  const remove = useDeleteReference();

  const rows = useMemo(
    () => [...manualRows(references.data ?? []), ...autoRows(machineRows.data ?? [], won.data ?? new Set())],
    [references.data, machineRows.data, won.data],
  );
  const filtered = useMemo(() => filterReferenceRows(rows, search), [rows, search]);
  const stats = referenceStats(rows);
  const refreshing = references.isRefetching || won.isRefetching || machineRows.isRefetching;
  const refresh = () => {
    void references.refetch();
    void won.refetch();
    void machineRows.refetch();
  };

  const openEdit = (record?: ReferenceRecord) =>
    router.push({ pathname: '/modal/reference-form', params: record ? { id: record.id } : {} } as unknown as Href);
  const confirmDelete = (record: ReferenceRecord) =>
    Alert.alert('Referansı sil', `${record.firm} referansı listeden kaldırılacak.`, [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: () =>
          remove.mutate(record.id, {
            onSuccess: () => toast.success('Referans silindi'),
            onError: (error) => toast.error(error.message || 'Referans silinemedi'),
          }),
      },
    ]);
  const tableRowPress = (row: ReferenceRow) => {
    const record = row.record;
    if (!record || (!canUpdate && !canDelete)) return undefined;
    return () =>
      Alert.alert(row.firm, `${row.brand} ${row.model}`, [
        ...(canUpdate ? [{ text: 'Düzenle', onPress: () => openEdit(record) }] : []),
        ...(canDelete ? [{ text: 'Sil', style: 'destructive' as const, onPress: () => confirmDelete(record) }] : []),
        { text: 'Vazgeç', style: 'cancel' as const },
      ]);
  };

  const header = (
    <View className="gap-2 pb-3">
      <View className="flex-row items-center justify-between">
        <View>
          <Text className="font-inter-semibold text-[11px] uppercase tracking-wider text-muted-foreground">Saha portföyü</Text>
          <Text className="font-inter text-sm text-muted-foreground">
            <Text className="font-inter-semibold text-foreground">{filtered.length}</Text> teslim edilmiş makine
          </Text>
        </View>
        {canCreate ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Excel ile Yükle"
            onPress={() => router.push('/modal/reference-import' as Href)}
            className="min-h-[44px] flex-row items-center gap-1.5 rounded-control border border-border bg-card px-3 active:opacity-70"
          >
            <Ionicons name="document-attach-outline" size={17} color={colors.primary} />
            <Text className="font-inter-medium text-sm text-foreground">Excel ile Yükle</Text>
          </Pressable>
        ) : null}
      </View>
      <ChoiceChips
        label="Görünüm"
        options={[
          { value: 'cards', label: 'Kart' },
          { value: 'table', label: 'Tablo' },
        ]}
        value={view}
        onChange={setView}
      />
    </View>
  );

  const empty = <EmptyState icon="search-outline" title={search.trim() ? "Eşleşen referans bulunamadı" : "Henüz referans yok"} hint="Firma, şehir, marka veya model bilgisiyle referansları bulabilirsiniz." actionLabel={search.trim() ? "Aramayı temizle" : canCreate ? "Yeni referans" : undefined} onAction={search.trim() ? () => setSearch('') : canCreate ? () => openEdit() : undefined} />;

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <SyncStatus />
      <ScreenHeader title="Referanslar" subtitle="Teslim edilmiş makineler ve satış referansları." />
      <View className="gap-2 pb-2">
        <StatStrip
          items={[
            { label: 'Teslim edilen', value: String(stats.delivered) },
            { label: 'Firma', value: String(stats.firms) },
            { label: 'Şehir', value: String(stats.cities), tone: 'success' },
            { label: 'Marka', value: String(stats.brands) },
          ]}
        />
        <SearchBar value={search} onChange={setSearch} placeholder="Firma, il, marka veya model ara..." />
      </View>

      {references.isPending ? (
        <ListSkeleton />
      ) : references.error ? (
        <ErrorState message={references.error.message || 'Referanslar yüklenemedi'} onRetry={refresh} />
      ) : view === 'table' ? (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: SCREEN_PAD, paddingBottom: GLASS_TAB_BAR_HEIGHT + 88 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.mutedForeground} />}
        >
          {header}
          {filtered.length === 0 ? (
            empty
          ) : (
            <Card>
              <SimpleTable
                headers={['No', 'Firma', 'İlgili', 'Konum', 'Marka', 'Model', 'Teslim']}
                firstColumnWidth={44}
                columnWidth={130}
                rows={filtered.map((row, index) => ({
                  key: row.id,
                  cells: [index + 1, row.firm, row.contact, referenceLocation(row, '—'), row.brand, row.model, formatReferenceDate(row.deliveryDate, 'short')],
                  onPress: tableRowPress(row),
                }))}
              />
            </Card>
          )}
        </ScrollView>
      ) : (
        <FlashList
          maintainVisibleContentPosition={{ disabled: true }}
          style={{ flex: 1 }}
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: SCREEN_PAD, paddingBottom: GLASS_TAB_BAR_HEIGHT + 88 }}
          ListHeaderComponent={header}
          renderItem={({ item }) => (
            <Card className="mb-2.5 gap-2.5">
              <View className="flex-row items-start gap-2">
                <View className="flex-1">
                  <Text className="font-inter-semibold text-[10px] uppercase tracking-wider text-primary">Teslim edilmiş makine</Text>
                  <Text className="font-display text-xl text-foreground" numberOfLines={2}>{item.model}</Text>
                  <Text className="font-inter text-xs text-muted-foreground">{item.brand}</Text>
                </View>
                <RowActions row={item} canUpdate={canUpdate} canDelete={canDelete} onEdit={openEdit} onDelete={confirmDelete} />
              </View>
              <View className="gap-1 border-y border-border py-2">
                <Text className="font-inter-semibold text-[14px] text-foreground" numberOfLines={2}>{item.firm}</Text>
                <View className="flex-row items-center gap-1">
                  <Ionicons name="location-outline" size={12} color={colors.mutedForeground} />
                  <Text className="font-inter text-xs text-muted-foreground">{referenceLocation(item)}</Text>
                </View>
              </View>
              <View className="flex-row items-center justify-between gap-2">
                <View className="flex-1">
                  <Text className="font-inter text-[10px] uppercase text-muted-foreground">İlgili</Text>
                  <Text className="font-inter-medium text-xs text-foreground" numberOfLines={1}>{item.contact}</Text>
                </View>
                <Chip tone="info" label={formatReferenceDate(item.deliveryDate)} />
              </View>
            </Card>
          )}
          refreshing={refreshing}
          onRefresh={refresh}
          ListEmptyComponent={empty}
        />
      )}
      {canCreate ? <Fab icon="add" label="Yeni Referans" extended onPress={() => openEdit()} /> : null}
    </SafeAreaView>
  );
}
