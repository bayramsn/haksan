import { useMemo, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { useAuth, useCan } from '@/src/auth/AuthProvider';
import type { TradeFairContact } from '@/src/api/trade-fairs.api';
import { useDeleteTradeFair, useTradeFairList, useTradeFairSummary } from '@/src/api/trade-fairs.hooks';
import { useDebouncedValue } from '@/src/lib/useDebouncedValue';
import { toneColor, useTheme } from '@/src/theme/theme';
import { Chip, EmptyState, ErrorState, Fab, FilterChips, ListSkeleton, Loading, SCREEN_PAD, ScreenHeader, SearchBar, StatStrip } from '@/src/ui';
import { SyncStatus } from '@/src/ui/SyncStatus';
import { toast } from '@/src/ui/toast';
import { canDeleteTradeFair, summaryTotals, tradeFairLocation, tradeFairRowTone } from '@/src/ui/trade-fairs/tradeFairLogic';

function IconAction({ icon, label, onPress, tone }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; tone?: 'destructive' }) {
  const { colors } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={4} className="h-11 w-11 items-center justify-center active:opacity-60">
      <Ionicons name={icon} size={19} color={tone ? colors.destructive : colors.mutedForeground} />
    </Pressable>
  );
}

function TradeFairRow({
  row,
  showFair,
  canUpdate,
  canDelete,
  onOpen,
  onFollowUp,
  onDelete,
}: {
  row: TradeFairContact;
  showFair: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  onOpen: () => void;
  onFollowUp: (markContacted: boolean) => void;
  onDelete: () => void;
}) {
  const { colors } = useTheme();
  const tone = tradeFairRowTone(row);
  const accent = tone ? toneColor(colors, tone) : colors.border;
  return (
    <View className="mb-2.5 overflow-hidden rounded-surface border border-border bg-card" style={{ borderLeftWidth: 4, borderLeftColor: accent }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${row.companyName} kaydını aç`} onPress={onOpen} className="gap-1 p-3 active:opacity-70">
        <Text className="font-inter-semibold text-[15px] text-foreground" numberOfLines={1}>{row.companyName}</Text>
        <Text className="font-inter text-[13px] text-muted-foreground" numberOfLines={1}>
          {row.contactName}{row.contactTitle ? ` · ${row.contactTitle}` : ''}
        </Text>
        {showFair ? <View className="flex-row"><Chip tone="neutral" label={row.fairName} /></View> : null}
        <Text className="font-inter text-xs text-muted-foreground" numberOfLines={1}>
          {tradeFairLocation(row)} · {row.productType || '—'}{row.productCategory ? ` (${row.productCategory})` : ''}
        </Text>
        <Text className="font-inter text-xs text-muted-foreground" numberOfLines={1}>
          Görüşen: {row.metByName ?? '—'} · {row.visitorCount} kişi
        </Text>
      </Pressable>
      <View className="flex-row items-center border-t border-border px-1">
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: row.contacted, disabled: !canUpdate }}
          accessibilityLabel={`${row.companyName} görüşüldü`}
          disabled={!canUpdate}
          onPress={() => onFollowUp(true)}
          className="min-h-[44px] flex-row items-center gap-1.5 px-2 active:opacity-60"
        >
          <Ionicons name={row.contacted ? 'checkbox' : 'square-outline'} size={20} color={row.contacted ? colors.primary : colors.mutedForeground} />
          <Text className="font-inter-medium text-xs text-foreground">Görüşüldü</Text>
        </Pressable>
        <View className="flex-1 flex-row flex-wrap gap-1">
          {row.offerSent ? <Chip tone="success" label="Teklif iletildi" /> : null}
          {row.customerConverted ? <Chip tone="success" label="Müşteriye dönüştü" /> : null}
        </View>
        {canUpdate && (row.offerSent || row.customerConverted) && !row.contacted ? (
          <IconAction icon="create-outline" label="Takibi düzenle" onPress={() => onFollowUp(false)} />
        ) : null}
        {row.mobilePhone ? <IconAction icon="call-outline" label={`${row.mobilePhone} ara`} onPress={() => void Linking.openURL(`tel:${row.mobilePhone!.replace(/[^\d+]/g, '')}`)} /> : null}
        {row.email ? <IconAction icon="mail-outline" label={`${row.email} adresine e-posta`} onPress={() => void Linking.openURL(`mailto:${row.email}`)} /> : null}
        {canDelete ? <IconAction icon="trash-outline" label={`${row.companyName} kaydını sil`} tone="destructive" onPress={onDelete} /> : null}
      </View>
    </View>
  );
}

export default function TradeFairsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { user } = useAuth();
  const isManager = Boolean(user?.roles?.includes('admin') || user?.roles?.includes('super_admin'));
  const canCreate = useCan('trade_fairs.create') || isManager;
  const canUpdate = useCan('trade_fairs.update') || isManager;
  const canDelete = useCan('trade_fairs.delete') || isManager;

  const [fair, setFair] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search.trim());
  const list = useTradeFairList(fair, q);
  const summary = useTradeFairSummary(fair);
  const remove = useDeleteTradeFair();
  const totals = summaryTotals(summary.data);
  const items = list.data?.items ?? [];
  const fairOptions = useMemo(
    () => (summary.data?.fairs ?? []).map((f) => ({ value: f.name, label: `${f.name} (${f.total})` })),
    [summary.data],
  );

  const openForm = (id?: string) =>
    router.push({ pathname: '/modal/trade-fair-form', params: id ? { id } : { fair: fair ?? summary.data?.fairs[0]?.name ?? '' } } as unknown as Href);
  const openFollowUp = (id: string, mark: boolean) =>
    router.push({ pathname: '/modal/trade-fair-follow-up', params: { id, mark: mark ? '1' : '0' } } as unknown as Href);
  const confirmDelete = (row: TradeFairContact) =>
    Alert.alert('Fuar kaydını sil', `${row.companyName} · ${row.contactName} kaydı listeden kaldırılacak.`, [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: () =>
          remove.mutate(row.id, {
            onSuccess: () => toast.success('Fuar kaydı silindi'),
            onError: (error) => toast.error(error.message || 'Silinemedi'),
          }),
      },
    ]);

  const header = (
    <View className="gap-3 pb-3">
      {(summary.data?.byUser ?? []).length > 0 ? (
        <View className="gap-2">
          <Text className="font-inter-semibold text-[11px] uppercase tracking-wider text-muted-foreground">Kim kaç kişiyle görüştü</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
            {(summary.data?.byUser ?? []).map((u) => (
              <View key={u.userId ?? 'none'} className="rounded-control border border-border bg-card px-3 py-2">
                <Text className="font-inter-semibold text-xs text-foreground">{u.fullName ?? 'Belirtilmemiş'}</Text>
                <Text className="font-inter text-[11px] text-muted-foreground">{u.meetings} firma · {u.people} kişi</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      ) : null}
      <View className="flex-row flex-wrap gap-4" accessibilityLabel="Takip renkleri">
        <View className="flex-row items-center gap-1.5">
          <View className="h-3 w-3 rounded" style={{ backgroundColor: colors.warning }} />
          <Text className="font-inter text-[11px] text-muted-foreground">Görüşüldü</Text>
        </View>
        <View className="flex-row items-center gap-1.5">
          <View className="h-3 w-3 rounded" style={{ backgroundColor: colors.success }} />
          <Text className="font-inter text-[11px] text-muted-foreground">Teklif iletildi / müşteriye dönüştü</Text>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <SyncStatus />
      <ScreenHeader title="Fuar Görüşmeleri" subtitle="Standa gelen firmalar, yetkilileri ve takip durumu." />
      <View className="gap-2 pb-2">
        <StatStrip
          items={[
            { label: 'Fuar', value: String(totals.fairs) },
            { label: 'Görüşme', value: String(totals.meetings) },
            { label: 'Kişi', value: String(totals.people), tone: 'success' },
            { label: 'Ekip', value: String(totals.staff) },
          ]}
        />
        <SearchBar value={search} onChange={setSearch} placeholder="Firma, yetkili, telefon, il, ürün ara..." />
        {fairOptions.length > 0 ? <FilterChips options={fairOptions} value={fair} onChange={setFair} allLabel="Tüm fuarlar" /> : null}
      </View>

      {list.isPending ? (
        <ListSkeleton />
      ) : list.error ? (
        <ErrorState message={list.error.message || 'Fuar kayıtları yüklenemedi'} onRetry={() => void list.refetch()} />
      ) : (
        <FlashList
          maintainVisibleContentPosition={{ disabled: true }}
          style={{ flex: 1 }}
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: SCREEN_PAD, paddingBottom: 96 }}
          ListHeaderComponent={header}
          renderItem={({ item }) => (
            <TradeFairRow
              row={item}
              showFair={!fair}
              canUpdate={canUpdate}
              canDelete={canDeleteTradeFair(item, { canDelete, isManager, userId: user?.id })}
              onOpen={() => openForm(item.id)}
              onFollowUp={(mark) => openFollowUp(item.id, mark)}
              onDelete={() => confirmDelete(item)}
            />
          )}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
          }}
          refreshing={list.isRefetching}
          onRefresh={() => {
            void list.refetch();
            void summary.refetch();
          }}
          ListEmptyComponent={
            <EmptyState
              icon="storefront-outline"
              title={q || fair ? 'Eşleşen görüşme bulunamadı' : 'Henüz fuar görüşmesi yok'}
              hint={canCreate ? 'Standa gelen firmaları “Yeni Görüşme” ile kaydedin.' : 'Kayıt eklendiğinde burada listelenir.'}
            />
          }
          ListFooterComponent={
            list.isFetchingNextPage ? (
              <Loading />
            ) : items.length > 0 ? (
              <Text className="py-3 text-center font-inter text-xs text-muted-foreground">
                {items.length} / {list.data?.total ?? items.length} kayıt gösteriliyor
              </Text>
            ) : null
          }
        />
      )}
      {canCreate ? <Fab icon="add" label="Yeni Görüşme" extended onPress={() => openForm()} /> : null}
    </SafeAreaView>
  );
}
