import { useMemo, useState } from 'react';
import { Image, Pressable, Switch, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import {
  adminKeys,
  useAuditLogs,
  useCreateLookup,
  useDeleteLookup,
  useLookupRows,
  useReorderLookup,
  useUpdateLookup,
} from '@/src/api/admin.hooks';
import type { LookupRow, LookupWriteBody } from '@/src/api/admin.api';
import { apiBaseUrl } from '@/src/api/config';
import { formatDateTime } from '@/src/lib/format';
import { resolveMediaUrl } from '@/src/lib/mediaUrl';
import { useTheme } from '@/src/theme/theme';
import { Button, Card, Chip, EmptyState, ErrorState, Field, ListSkeleton, SCREEN_PAD, SearchBar } from '@/src/ui';
import { OptionPicker } from '@/src/ui/pickers/OptionPicker';
import { shareTextFile } from '@/src/ui/sales/shareText';
import { toast } from '@/src/ui/toast';
import { useAdminAccess } from '@/src/ui/admin/access';
import { ActionPill, ChipSelect, Notice, SwitchRow, confirmAction, confirmDestructive } from '@/src/ui/admin/controls';
import {
  ALL_DIVISIONS,
  BRAND_LOOKUP,
  DIVISION_SCOPED_LOOKUPS,
  LOOKUP_PARENTS,
  PRODUCT_FLOW_STEPS,
  SPEC_GROUP_LOOKUP,
  TAX_OFFICE_LOOKUP,
  auditActionLabel,
  buildLookupCsv,
  canRevertLookupAudit,
  filterLookupRows,
  flowStepIndex,
  isCncDivision,
  lookupLabel,
  lookupRevertPlan,
  lookupUsage,
  moveLookupRow,
  specGroupTypeSummary,
  type LookupStatusFilter,
} from '@/src/ui/admin/lookup-meta';
import { Help } from '@/src/ui/admin/ModalShell';
import { SettingsSubpage } from '@/src/ui/admin/SettingsSubpage';
import { useSettingsDivision } from '@/src/ui/admin/useSettingsDivision';
import { ProvinceSelect } from '@/src/ui/select/fields';

export default function LookupRowsScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ name: string; divisionId?: string }>();
  const name = params.name ?? '';
  const access = useAdminAccess();
  const { divisionId, setDivisionId, divisions, options } = useSettingsDivision(params.divisionId);

  const label = lookupLabel(name);
  const isBrand = name === BRAND_LOOKUP;
  const isTaxOffice = name === TAX_OFFICE_LOOKUP;
  const isSpecGroup = name === SPEC_GROUP_LOOKUP;
  const scoped = DIVISION_SCOPED_LOOKUPS.has(name);
  const parent = LOOKUP_PARENTS[name];
  const step = flowStepIndex(name);
  const divisionLabel = (id?: string | null) => (id ? divisions.find((d) => d.id === id)?.name ?? 'Bölüm' : 'Tümü');
  const selectedDivisionLabel = divisionId === ALL_DIVISIONS ? 'Tümü' : divisionLabel(divisionId);
  const newRecordDivisionId = scoped ? (divisionId === ALL_DIVISIONS ? null : divisionId) : undefined;

  const rowsQuery = scoped ? { divisionId } : undefined;
  const relationQuery = divisionId && divisionId !== ALL_DIVISIONS ? { divisionId } : undefined;
  const canLoad = access.isSuperAdmin && (!scoped || Boolean(divisionId));
  const rows = useLookupRows(name, rowsQuery, canLoad);
  const parents = useLookupRows(parent?.lookup ?? '', relationQuery, access.isSuperAdmin && Boolean(parent));
  const productTypes = useLookupRows('product-types', relationQuery, access.isSuperAdmin && isSpecGroup);

  const create = useCreateLookup(name);
  const update = useUpdateLookup(name);
  const reorder = useReorderLookup(name);
  const remove = useDeleteLookup(name);
  const busy = create.isPending || update.isPending || reorder.isPending || remove.isPending;

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<LookupStatusFilter>('active');
  const [parentFilterId, setParentFilterId] = useState('all');
  const [showShared, setShowShared] = useState(false);
  const [quickName, setQuickName] = useState('');
  const [quickProvince, setQuickProvince] = useState('');
  const [quickParentId, setQuickParentId] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const history = useAuditLogs(`lookup:${name}`, access.isSuperAdmin && historyOpen);

  const includeShared = showShared || isCncDivision(divisions, divisionId);
  const activeParents = useMemo(() => (parents.data ?? []).filter((row) => row.isActive !== false), [parents.data]);
  const parentName = useMemo(() => new Map(activeParents.map((row) => [row.id, row.name])), [activeParents]);
  const typeName = useMemo(
    () => new Map((productTypes.data ?? []).filter((row) => row.isActive !== false).map((row) => [row.id, row.name])),
    [productTypes.data]
  );
  const all = rows.data ?? [];
  const visible = useMemo(
    () => filterLookupRows(all, { query: search, status, scoped, includeShared, parentField: parent?.field, parentFilterId }),
    [all, search, status, scoped, includeShared, parent?.field, parentFilterId]
  );
  const parentOptions = activeParents.map((row) => ({ value: row.id, label: row.name }));
  const effectiveQuickParent = quickParentId || (parentFilterId !== 'all' ? parentFilterId : '');

  const quickAdd = () => {
    const value = quickName.trim();
    if (!value) return toast.error('Ad alanı zorunludur');
    if (isTaxOffice && !quickProvince.trim()) return toast.error('Vergi dairesi için il zorunludur');
    create.mutate(
      {
        name: value,
        province: isTaxOffice ? quickProvince.trim() : undefined,
        divisionId: newRecordDivisionId,
        parentId: parent ? effectiveQuickParent || null : undefined,
        isActive: true,
      },
      {
        onSuccess: () => {
          toast.success('Kayıt eklendi');
          setQuickName('');
          setQuickProvince('');
        },
        onError: (err) => toast.error(`Kayıt kaydedilemedi: ${err.message || 'API isteği başarısız oldu.'}`),
      }
    );
  };

  const toggleActive = (row: LookupRow, next: boolean) =>
    update.mutate(
      { id: row.id, body: { isActive: next } },
      {
        onSuccess: () => toast.success(next ? 'Kayıt aktifleştirildi' : 'Kayıt pasifleştirildi'),
        onError: (err) => toast.error(`Durum güncellenemedi: ${err.message || 'API isteği başarısız oldu.'}`),
      }
    );

  const move = (row: LookupRow, direction: -1 | 1) => {
    if (busy) return;
    const next = moveLookupRow(all, visible, row.id, direction);
    if (!next) return;
    const key = adminKeys.lookupRows(name, rowsQuery);
    const previous = qc.getQueryData<LookupRow[]>(key);
    qc.setQueryData(key, next);
    reorder.mutate(
      next.map((item) => ({ id: item.id, sortOrder: item.sortOrder ?? 0 })),
      {
        onSuccess: () => toast.success('Sıralama kaydedildi'),
        onError: (err) => {
          qc.setQueryData(key, previous);
          toast.error(`Sıralama kaydedilemedi: ${err.message || 'API isteği başarısız oldu.'}`);
        },
      }
    );
  };

  const askDelete = (row: LookupRow) =>
    confirmDestructive(
      isBrand ? 'Ürün markası silinsin mi?' : 'Alan değeri kaldırılsın mı?',
      `${row.name} ${
        isBrand ? 'markası ve logo bağlantısı marka listesinden kaldırılacak.' : `değeri ${label.toLocaleLowerCase('tr-TR')} listesinden kaldırılacak.`
      }\n\n${
        isBrand
          ? 'Mevcut ürün ve teklif geçmişi korunur; marka yeni ürünlerde seçilemez ve bağlı logo artık yayınlanmaz.'
          : 'Bu değer mevcut firma, ürün veya işlem kayıtlarında kullanılıyorsa veri bütünlüğünü korumak için silinmek yerine pasifleştirilir. Yeni formlarda seçilemez, geçmiş kayıtlarda görünmeye devam eder.'
      }`,
      isBrand ? 'Markayı sil' : 'Kaldır / pasifleştir',
      () =>
        remove.mutate(row.id, {
          onSuccess: (result) =>
            toast.success(
              result?.deactivated
                ? name === 'product-types'
                  ? 'Kullanımdaki ürün tipi pasifleştirilip listeden kaldırıldı'
                  : 'Kullanımdaki kayıt pasifleştirilip listeden kaldırıldı'
                : 'Kayıt silindi'
            ),
          onError: (err) => toast.error(`Kayıt silinemedi: ${err.message || 'API isteği başarısız oldu.'}`),
        })
    );

  const exportCsv = async () => {
    try {
      await shareTextFile({
        fileName: `${name}.csv`,
        content: buildLookupCsv(visible, {
          isBrand,
          parent,
          isSpecGroup,
          divisionLabel,
          parentName: (id) => parentName.get(id),
          productTypeName: (id) => typeName.get(id),
        }),
        mimeType: 'text/csv',
        uti: 'public.comma-separated-values-text',
        title: `${label} dışa aktar`,
      });
    } catch (err) {
      toast.error(`Dışa aktarılamadı: ${err instanceof Error ? err.message : 'Dosya oluşturulamadı.'}`);
    }
  };

  const revert = (item: NonNullable<typeof history.data>['data'][number]) => {
    const plan = lookupRevertPlan(item, { isTaxOffice, scoped, parentField: parent?.field, isSpecGroup });
    if (!plan) return toast.error('Bu geçmiş kaydı otomatik geri alınamaz');
    confirmAction('Değişiklik geri alınsın mı?', plan.kind === 'delete' ? 'Eklenen kayıt kaldırılır.' : 'Kayıt önceki değerlerine döner.', 'Geri al', () => {
      const handlers = {
        onSuccess: () => {
          toast.success('Değişiklik geri alındı');
          void history.refetch();
        },
        onError: (err: Error) => toast.error(`Geri alma başarısız: ${err.message || 'Kayıt güncellenemedi.'}`),
      };
      if (plan.kind === 'delete') remove.mutate(plan.id, handlers);
      else update.mutate({ id: plan.id, body: plan.body as LookupWriteBody }, handlers);
    });
  };

  const editHref = (row?: LookupRow) =>
    (isBrand
      ? `/modal/lookup-brand?divisionId=${encodeURIComponent(divisionId)}${row ? `&id=${row.id}` : ''}`
      : `/modal/lookup-edit?name=${name}&divisionId=${encodeURIComponent(divisionId)}&id=${row?.id ?? ''}`) as Href;

  const header = (
    <View className="gap-3 pb-2">
      {scoped && options.length ? (
        <ChipSelect label="Bölüm" options={options.map((d) => ({ value: d.id, label: d.name }))} value={divisionId} onChange={setDivisionId} />
      ) : null}
      <Card className="gap-2">
        <View className="flex-row flex-wrap items-center gap-2">
          <Text className="font-inter-semibold text-[15px] text-foreground">
            {step >= 0 ? `${step + 1}. ` : ''}
            {label}
          </Text>
          {scoped ? <Chip tone="info" label={selectedDivisionLabel} /> : null}
        </View>
        <Help>
          {PRODUCT_FLOW_STEPS[step]?.helper ?? 'Bu listedeki değerler ilgili CRM formlarındaki seçim alanlarında kullanılır.'}
          {scoped && divisionId !== ALL_DIVISIONS ? ` Yeni kayıtlar ${selectedDivisionLabel} bölümüne eklenir.` : ''}
        </Help>
        <Help>Kullanıldığı yerler: {(lookupUsage[name] ?? ['İlgili CRM formları']).join(', ')}.</Help>
        {isBrand ? (
          <View className="gap-2 rounded-control border border-border p-3">
            <Text className="font-inter-medium text-[14px] text-foreground">Marka kimliği oluşturun</Text>
            <Help>Marka sahibi, varsayılan tedarikçi ve teknik bilgi kaynağını bir kez tanımlayın.</Help>
            <Button label="Yeni Ürün Markası" disabled={busy} onPress={() => router.push(editHref())} />
          </View>
        ) : (
          <View className="gap-2">
            <Field
              label="Yeni değer"
              value={quickName}
              onChangeText={setQuickName}
              placeholder="Yeni değer adı…"
              maxLength={255}
              returnKeyType="done"
              onSubmitEditing={quickAdd}
            />
            {isTaxOffice ? <ProvinceSelect label="İl" value={quickProvince} onChange={setQuickProvince} /> : null}
            {parent ? (
              <OptionPicker
                label={`Bağlı olduğu ${parent.label}`}
                value={effectiveQuickParent || null}
                options={parentOptions}
                placeholder={`Tümü (${parent.label.toLocaleLowerCase('tr-TR')} bağımsız)`}
                searchable
                clearable
                onChange={(value) => setQuickParentId(value ?? '')}
              />
            ) : null}
            <Button label="Ekle" loading={create.isPending} disabled={busy || (scoped && !divisionId)} onPress={quickAdd} />
          </View>
        )}
        {isSpecGroup ? (
          <Help>Teknik bilgi grupları ürün tiplerine atanabilir; atama yapmak için kaydı düzenleyin. Ataması olmayan grup tüm tiplerde geçerlidir.</Help>
        ) : null}
      </Card>
      {scoped && !isCncDivision(divisions, divisionId) ? (
        <SwitchRow title="Ortak kayıtları göster" value={showShared} onValueChange={setShowShared} />
      ) : null}
      <SearchBar value={search} onChange={setSearch} placeholder="Bu listede ara..." />
      <ChipSelect
        label="Durum"
        options={[
          { value: 'active' as const, label: 'Aktif' },
          { value: 'passive' as const, label: 'Pasif' },
          { value: 'all' as const, label: 'Tümü' },
        ]}
        value={status}
        onChange={setStatus}
      />
      {parent ? (
        <OptionPicker
          label={parent.label}
          value={parentFilterId === 'all' ? null : parentFilterId}
          options={parentOptions}
          placeholder="Tümü"
          searchable
          clearable
          onChange={(value) => setParentFilterId(value ?? 'all')}
        />
      ) : null}
      <View className="flex-row flex-wrap gap-2">
        {!isBrand ? (
          <ActionPill
            icon="cloud-upload-outline"
            label="CSV İçe Aktar"
            disabled={busy || (scoped && !divisionId)}
            onPress={() =>
              router.push(
                `/modal/lookup-import?name=${name}&divisionId=${encodeURIComponent(divisionId)}${
                  effectiveQuickParent ? `&parentId=${effectiveQuickParent}` : ''
                }` as Href
              )
            }
          />
        ) : null}
        <ActionPill icon="download-outline" label="Dışa Aktar" disabled={busy || visible.length === 0} onPress={() => void exportCsv()} />
        <ActionPill
          icon="time-outline"
          tone={historyOpen ? 'info' : 'neutral'}
          label="Geçmiş"
          onPress={() => setHistoryOpen((open) => !open)}
        />
      </View>
      <Help>Sıralamak için satırdaki yukarı/aşağı oklarını kullanın.</Help>
    </View>
  );

  const footer = historyOpen ? (
    <Card className="mt-3 gap-2">
      <View className="flex-row items-center justify-between">
        <Text className="font-inter-semibold text-[14px] text-foreground">Değişiklik geçmişi</Text>
        {history.isFetching ? <Text className="font-inter text-[12px] text-muted-foreground">Yükleniyor...</Text> : null}
      </View>
      {history.error ? <ErrorState message={history.error.message} onRetry={() => void history.refetch()} /> : null}
      {(history.data?.data ?? []).map((item) => {
        const before = String(item.oldValues?.name ?? '');
        const after = String(item.newValues?.name ?? '');
        const actor = item.actor?.fullName || item.actor?.email || 'Sistem';
        return (
          <View key={item.id} className="gap-1.5 border-t border-border pt-2">
            <View className="flex-row flex-wrap items-center gap-2">
              <Chip tone="neutral" label={auditActionLabel(item.action)} />
              <Text className="shrink font-inter-medium text-[14px] text-foreground">{after || before || item.resourceId}</Text>
            </View>
            <Text className="font-inter text-[12px] text-muted-foreground">
              {actor} · {formatDateTime(item.createdAt)}
              {before && after && before !== after ? ` · ${before} → ${after}` : ''}
            </Text>
            {canRevertLookupAudit(item) ? (
              <View className="flex-row">
                <ActionPill icon="arrow-undo-outline" label="Geri al" disabled={busy} onPress={() => revert(item)} />
              </View>
            ) : null}
          </View>
        );
      })}
      {!history.isFetching && !history.error && !(history.data?.data ?? []).length ? (
        <Help>Bu liste için kayıtlı değişiklik geçmişi yok.</Help>
      ) : null}
    </Card>
  ) : null;

  return (
    <SettingsSubpage title={label} subtitle="CRM Alan Ayarları" allowed={access.isSuperAdmin} scroll={false}>
      <FlashList
        maintainVisibleContentPosition={{ disabled: true }}
        style={{ flex: 1 }}
        data={rows.isPending || rows.error ? [] : visible}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: SCREEN_PAD, paddingTop: 12, paddingBottom: 32 }}
        ListHeaderComponent={header}
        ListFooterComponent={footer}
        renderItem={({ item, index }) => {
          const parentId = parent ? item[parent.field] ?? null : null;
          const logo = isBrand ? resolveMediaUrl(item.logoUrl, apiBaseUrl()) : null;
          return (
            <Card className="my-1.5 gap-2 p-3.5">
              <View className="flex-row items-start gap-3">
                {isBrand ? (
                  <View className="h-12 w-12 items-center justify-center overflow-hidden rounded-control border border-border bg-card">
                    {logo ? (
                      <Image source={{ uri: logo }} accessibilityLabel={`${item.name} logosu`} resizeMode="contain" className="h-10 w-10" />
                    ) : (
                      <Ionicons name="image-outline" size={18} color={colors.mutedForeground} />
                    )}
                  </View>
                ) : null}
                <View className="flex-1 gap-0.5">
                  <Text className="font-inter-semibold text-[15px] text-foreground">{item.name}</Text>
                  {isBrand ? (
                    <>
                      <Text className="font-inter text-[12px] text-foreground">
                        {item.isOwned ? 'Haksan Makina' : item.companyName || 'Firma belirtilmemiş'}
                      </Text>
                      <Text className="font-inter text-[12px] text-muted-foreground">
                        Tedarikçi: {item.supplierCompanyName || 'Belirtilmemiş'}
                        {item.technicalCatalogCode === 'AORE_LASER' ? ' · Teknik kaynak: AORE' : ''}
                      </Text>
                      <Text className="font-inter text-[11px] text-muted-foreground">{item.logoUrl ? 'Logo bağlı' : 'Logo yüklenmemiş'}</Text>
                    </>
                  ) : item.description ? (
                    <Text className="font-inter text-[12px] text-muted-foreground">{item.description}</Text>
                  ) : null}
                </View>
                {!isBrand ? (
                  <Switch
                    value={item.isActive !== false}
                    disabled={busy}
                    onValueChange={(next) => toggleActive(item, next)}
                    accessibilityLabel={item.isActive !== false ? 'Pasifleştir' : 'Aktifleştir'}
                    trackColor={{ true: colors.primary, false: colors.lineStrong }}
                  />
                ) : null}
              </View>
              <View className="flex-row flex-wrap gap-1.5">
                <Chip tone="neutral" label={`Sıra ${index + 1}`} />
                {isTaxOffice ? <Chip tone="neutral" label={item.province || '-'} /> : null}
                {scoped ? <Chip tone={item.divisionId ? 'info' : 'neutral'} label={divisionLabel(item.divisionId)} /> : null}
                {parent ? (
                  <Chip tone={parentId ? 'info' : 'neutral'} label={parentId ? parentName.get(parentId) ?? 'Üst kayıt' : 'Tümü'} />
                ) : null}
                {isSpecGroup ? <Chip tone="neutral" label={specGroupTypeSummary(item.productTypeIds, typeName)} /> : null}
                {item.isActive === false ? <Chip tone="warning" label="Pasif" /> : null}
              </View>
              <View className="flex-row flex-wrap gap-2">
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${item.name} yukarı taşı`}
                  disabled={busy || index === 0}
                  onPress={() => move(item, -1)}
                  className={`h-11 w-11 items-center justify-center rounded-control border border-border ${busy || index === 0 ? 'opacity-35' : ''}`}
                >
                  <Ionicons name="arrow-up" size={18} color={colors.foreground} />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${item.name} aşağı taşı`}
                  disabled={busy || index === visible.length - 1}
                  onPress={() => move(item, 1)}
                  className={`h-11 w-11 items-center justify-center rounded-control border border-border ${
                    busy || index === visible.length - 1 ? 'opacity-35' : ''
                  }`}
                >
                  <Ionicons name="arrow-down" size={18} color={colors.foreground} />
                </Pressable>
                <ActionPill icon="create-outline" label="Düzenle" onPress={() => router.push(editHref(item))} />
                <ActionPill icon="trash-outline" tone="destructive" label="Kaldır" disabled={busy} onPress={() => askDelete(item)} />
              </View>
            </Card>
          );
        }}
        refreshing={rows.isRefetching}
        onRefresh={() => {
          void rows.refetch();
          if (parent) void parents.refetch();
          if (isSpecGroup) void productTypes.refetch();
          if (historyOpen) void history.refetch();
        }}
        ListEmptyComponent={
          scoped && !divisionId ? (
            <Notice tone="warning">Önce ayar bölümünü seçin.</Notice>
          ) : rows.isPending ? (
            <ListSkeleton />
          ) : rows.error ? (
            <ErrorState message={`Alan değerleri yüklenemedi: ${rows.error.message}`} onRetry={() => void rows.refetch()} />
          ) : (
            <EmptyState icon="list-outline" title="Kayıt yok." />
          )
        }
      />
    </SettingsSubpage>
  );
}
