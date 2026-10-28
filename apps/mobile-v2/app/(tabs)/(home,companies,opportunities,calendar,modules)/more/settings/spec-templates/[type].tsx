import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, Switch, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useNavigation, useRouter, type Href } from 'expo-router';
import { useBatchSaveSpecTemplates, useSpecTemplates } from '@/src/api/admin.hooks';
import { useTheme } from '@/src/theme/theme';
import { Button, Card, Chip, EmptyState, SearchBar } from '@/src/ui';
import { toast } from '@/src/ui/toast';
import { useAdminAccess } from '@/src/ui/admin/access';
import { ActionPill, confirmDestructive } from '@/src/ui/admin/controls';
import { Help } from '@/src/ui/admin/ModalShell';
import { SettingsSubpage } from '@/src/ui/admin/SettingsSubpage';
import {
  DEFAULT_SPEC_GROUP,
  buildSpecDraft,
  groupSpecRows,
  moveSpecRow,
  parseSpecOptions,
  specDraftToBatch,
  validateSpecDraft,
  type SpecDraftRow,
} from '@/src/ui/admin/spec-template-model';

const inputClass = 'min-h-[44px] rounded-control border border-border bg-input-background px-3 font-inter text-[14px] text-foreground';

let newRowSeq = 0;

export default function SpecTemplateWorkbookScreen() {
  const params = useLocalSearchParams<{ type: string; name?: string; divisionId?: string }>();
  const typeCode = decodeURIComponent(String(params.type ?? ''));
  const typeLabel = params.name ? String(params.name) : typeCode;
  const divisionId = params.divisionId ? String(params.divisionId) : null;
  const router = useRouter();
  const navigation = useNavigation();
  const { colors } = useTheme();
  const access = useAdminAccess();
  const specs = useSpecTemplates({ productTypeCode: typeCode, ...(divisionId ? { divisionId } : {}) }, access.isSuperAdmin && Boolean(typeCode));
  const save = useBatchSaveSpecTemplates();
  const [rows, setRows] = useState<SpecDraftRow[]>([]);
  const [optionText, setOptionText] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [search, setSearch] = useState('');
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;

  useEffect(() => {
    if (!specs.data || dirtyRef.current) return;
    const draft = buildSpecDraft(typeCode, specs.data).filter((row) => !row.isDeleted);
    setRows(draft);
    setOptionText(Object.fromEntries(draft.map((row) => [row.clientId, row.specOptions.join(', ')])));
  }, [specs.data, typeCode]);

  useEffect(
    () =>
      navigation.addListener('beforeRemove', (event) => {
        if (!dirtyRef.current) return;
        event.preventDefault();
        Alert.alert('Kaydedilmemiş değişiklikler', 'Çalışma sayfasındaki değişiklikler kaybolacak.', [
          { text: 'Vazgeç', style: 'cancel' },
          { text: 'Çık', style: 'destructive', onPress: () => navigation.dispatch(event.data.action) },
        ]);
      }),
    [navigation]
  );

  const mutate = (next: SpecDraftRow[]) => {
    setRows(next);
    setDirty(true);
  };
  const patch = (clientId: string, changes: Partial<SpecDraftRow>) =>
    mutate(rows.map((row) => (row.clientId === clientId ? { ...row, ...changes } : row)));

  const query = search.trim().toLocaleLowerCase('tr-TR');
  const visible = useMemo(
    () =>
      query
        ? rows.filter((row) => [row.specKey, row.groupCode, row.defaultValue, row.unit].join(' ').toLocaleLowerCase('tr-TR').includes(query))
        : rows,
    [query, rows]
  );
  const groups = useMemo(() => groupSpecRows(visible), [visible]);
  const activeCount = rows.filter((row) => row.isActive).length;
  const groupCount = new Set(rows.map((row) => row.groupCode)).size;

  const addField = () => {
    const clientId = `new-${Date.now()}-${++newRowSeq}`;
    const groupCode = rows[rows.length - 1]?.groupCode ?? DEFAULT_SPEC_GROUP;
    mutate([...rows, { clientId, divisionId, specKey: '', groupCode, defaultValue: '', unit: '', specOptions: [], isActive: true, isDeleted: false }]);
    setSearch('');
  };

  const addSection = () => {
    const clientId = `new-${Date.now()}-${++newRowSeq}`;
    mutate([...rows, { clientId, divisionId, specKey: '', groupCode: 'YENİ BÖLÜM', defaultValue: '', unit: '', specOptions: [], isActive: true, isDeleted: false }]);
    setSearch('');
  };

  const askRemove = (row: SpecDraftRow) =>
    confirmDestructive(
      'Teknik alan silinsin mi?',
      `${row.specKey || 'Adsız alan'} alanı ${typeLabel} şablonundan kaldırılacak. Kaydet'e bastığınızda değişiklik kalıcı olur; mevcut makinelerde girilmiş teknik değerler korunur. Yalnızca yeni makinelerde göstermemek istiyorsanız pasifleştirmeyi kullanın.`,
      'Sil',
      () => mutate(rows.filter((item) => item.clientId !== row.clientId))
    );

  const submit = () => {
    const invalid = validateSpecDraft(rows);
    if (invalid) return toast.error(invalid);
    const before = new Set((specs.data ?? []).filter((row) => !row.isDeleted).map((row) => row.id));
    const removed = [...before].filter((id) => !rows.some((row) => row.id === id)).length;
    save.mutate(specDraftToBatch(typeCode, divisionId, rows), {
      onSuccess: () => {
        setDirty(false);
        dirtyRef.current = false;
        toast.success(`Teknik çalışma sayfası kaydedildi. ${rows.length} alan güncellendi. ${removed} alan silindi.`);
        void specs.refetch();
      },
      onError: (err) => toast.error(`Değişiklikler kaydedilemedi: ${err.message}`),
    });
  };

  const discard = () =>
    confirmDestructive('Değişiklikler geri alınsın mı?', 'Kaydedilmemiş tüm düzenlemeler silinir.', 'Geri al', () => {
      setDirty(false);
      dirtyRef.current = false;
      const draft = buildSpecDraft(typeCode, specs.data ?? []).filter((row) => !row.isDeleted);
      setRows(draft);
      setOptionText(Object.fromEntries(draft.map((row) => [row.clientId, row.specOptions.join(', ')])));
    });

  return (
    <SettingsSubpage
      title={typeLabel}
      subtitle={`${activeCount} teknik alan · ${groupCount} bölüm`}
      allowed={access.isSuperAdmin}
      loading={specs.isPending}
      error={specs.error ? `Teknik şablonlar yüklenemedi: ${specs.error.message}` : null}
      onRetry={() => void specs.refetch()}
      refreshing={specs.isRefetching}
      onRefresh={() => (dirty ? toast.info('Önce değişiklikleri kaydedin veya geri alın') : void specs.refetch())}
      actions={[{ icon: 'save-outline', label: 'Kaydet', onPress: submit, dot: dirty }]}
    >
      <View className="flex-row flex-wrap gap-2">
        <ActionPill icon="add" label="Alan ekle" onPress={addField} />
        <ActionPill icon="albums-outline" label="Bölüm ekle" onPress={addSection} />
        <ActionPill
          icon="cloud-upload-outline"
          label="Excel / CSV ile aktar"
          disabled={dirty}
          onPress={() =>
            router.push(
              `/modal/spec-template-import?type=${encodeURIComponent(typeCode)}&name=${encodeURIComponent(typeLabel)}&divisionId=${divisionId ?? ''}` as Href
            )
          }
        />
      </View>
      <SearchBar value={search} onChange={setSearch} placeholder="Teknik bilgide ara" />
      {query ? <Help>Sıralamak için aramayı temizleyin</Help> : null}
      <View className="flex-row items-center gap-1.5">
        <Ionicons name={dirty ? 'alert-circle-outline' : 'checkmark-circle-outline'} size={16} color={dirty ? colors.warning : colors.success} />
        <Text className={`font-inter-medium text-[12px] ${dirty ? 'text-warning' : 'text-success'}`}>
          {dirty ? 'Kaydedilmemiş değişiklikler' : 'Tüm değişiklikler kayıtlı'}
        </Text>
      </View>

      {rows.length === 0 ? (
        <EmptyState icon="list-outline" title="Bu ürün tipi için teknik alan yok." actionLabel="Alan ekle" onAction={addField} />
      ) : visible.length === 0 ? (
        <EmptyState icon="search-outline" title="Eşleşen teknik alan yok." actionLabel="Aramayı temizle" onAction={() => setSearch('')} />
      ) : (
        groups.map((group, groupIndex) => (
          <View key={`${group.groupCode}-${groupIndex}`} className="gap-2">
            <Text className="font-inter-semibold text-[11px] uppercase tracking-[1.4px] text-muted-foreground">{group.groupCode}</Text>
            {group.rows.map((row) => {
              const position = rows.findIndex((item) => item.clientId === row.clientId);
              return (
                <Card key={row.clientId} className="gap-2.5 p-3">
                  <View className="flex-row items-center gap-2">
                    <Text className="w-7 font-inter text-[12px] text-muted-foreground">{position + 1}</Text>
                    <TextInput
                      value={row.specKey}
                      onChangeText={(specKey) => patch(row.clientId, { specKey })}
                      placeholder="Teknik Bilgi"
                      placeholderTextColor={colors.mutedForeground}
                      accessibilityLabel="Teknik Bilgi"
                      className={`${inputClass} flex-1 font-inter-semibold`}
                    />
                    {!row.isActive ? <Chip tone="neutral" label="Pasif" /> : null}
                  </View>
                  <View className="flex-row gap-2">
                    <TextInput
                      value={row.defaultValue}
                      onChangeText={(defaultValue) => patch(row.clientId, { defaultValue })}
                      placeholder="Varsayılan değer"
                      placeholderTextColor={colors.mutedForeground}
                      accessibilityLabel="Varsayılan değer"
                      className={`${inputClass} flex-[2]`}
                    />
                    <TextInput
                      value={row.unit}
                      onChangeText={(unit) => patch(row.clientId, { unit })}
                      placeholder="Birim"
                      placeholderTextColor={colors.mutedForeground}
                      accessibilityLabel="Birim"
                      className={`${inputClass} flex-1`}
                    />
                  </View>
                  <TextInput
                    value={row.groupCode}
                    onChangeText={(groupCode) => patch(row.clientId, { groupCode: groupCode.toLocaleUpperCase('tr-TR') || DEFAULT_SPEC_GROUP })}
                    placeholder="Bölüm"
                    placeholderTextColor={colors.mutedForeground}
                    accessibilityLabel="Bölüm"
                    autoCapitalize="characters"
                    className={inputClass}
                  />
                  <TextInput
                    value={optionText[row.clientId] ?? ''}
                    onChangeText={(text) => {
                      setOptionText((current) => ({ ...current, [row.clientId]: text }));
                      patch(row.clientId, { specOptions: parseSpecOptions(text) });
                    }}
                    placeholder="Opsiyonel değerler (Örn. BT-50)"
                    placeholderTextColor={colors.mutedForeground}
                    accessibilityLabel="Opsiyonel değerler"
                    className={inputClass}
                  />
                  <View className="flex-row items-center gap-2">
                    <View className="min-h-[44px] flex-1 flex-row items-center gap-2">
                      <Switch
                        value={row.isActive}
                        onValueChange={(isActive) => patch(row.clientId, { isActive })}
                        accessibilityLabel="Aktif alan"
                        trackColor={{ true: colors.primary, false: colors.border }}
                      />
                      <Text className="font-inter text-[12px] text-muted-foreground">Yeni makinelerde gösterilir</Text>
                    </View>
                    {(
                      [
                        ['arrow-up', -1, 'Yukarı taşı'],
                        ['arrow-down', 1, 'Aşağı taşı'],
                      ] as const
                    ).map(([icon, direction, label]) => (
                      <Pressable
                        key={icon}
                        onPress={() => mutate(moveSpecRow(rows, row.clientId, direction))}
                        disabled={Boolean(query)}
                        accessibilityRole="button"
                        accessibilityLabel={`${row.specKey || 'Alan'}: ${label}`}
                        className="h-11 w-11 items-center justify-center rounded-control border border-border active:opacity-70"
                        style={{ opacity: query ? 0.4 : 1 }}
                      >
                        <Ionicons name={icon} size={18} color={colors.foreground} />
                      </Pressable>
                    ))}
                    <Pressable
                      onPress={() => askRemove(row)}
                      accessibilityRole="button"
                      accessibilityLabel={`${row.specKey || 'Alan'} alanını sil`}
                      className="h-11 w-11 items-center justify-center rounded-control border border-border active:opacity-70"
                    >
                      <Ionicons name="trash-outline" size={18} color={colors.destructive} />
                    </Pressable>
                  </View>
                </Card>
              );
            })}
          </View>
        ))
      )}

      <View className="flex-row gap-2 pt-2">
        <View className="flex-1">
          <Button label="Geri al" variant="ghost" disabled={!dirty || save.isPending} onPress={discard} />
        </View>
        <View className="flex-1">
          <Button label="Kaydet" loading={save.isPending} disabled={!dirty || save.isPending} onPress={submit} />
        </View>
      </View>
    </SettingsSubpage>
  );
}
