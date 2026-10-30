import { useEffect, useMemo, useRef, useState } from 'react';
import { Switch, Text, TextInput, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { TechnicalImportMode, TechnicalImportRowInput } from '@haksan/shared';
import type { TechnicalImportPreview } from '@/src/api/admin.api';
import { useCommitTechnicalImport, useLookupRows, usePreviewTechnicalImport, useSpecTemplates } from '@/src/api/admin.hooks';
import { useTheme } from '@/src/theme/theme';
import { Button, Card, Chip, SCREEN_PAD, SearchBar } from '@/src/ui';
import { toast } from '@/src/ui/toast';
import { OptionPicker } from '@/src/ui/pickers/OptionPicker';
import { useAdminAccess } from '@/src/ui/admin/access';
import { ActionPill, ChipSelect, Notice, SwitchRow } from '@/src/ui/admin/controls';
import { Help, ModalShell } from '@/src/ui/admin/ModalShell';
import {
  IMPORT_STATUS_META,
  TECHNICAL_IMPORT_MAX_BYTES,
  buildSpecDraft,
  filterImportRows,
  importCounts,
  importRowKey,
  isTechnicalImportFile,
  retargetImportRow,
  type ImportFilter,
} from '@/src/ui/admin/spec-template-model';

type PickedFile = { name: string; size: number; mimeType?: string; uri: string };

const MODE_OPTIONS: { value: Exclude<TechnicalImportMode, 'laser_profiles'>; label: string }[] = [
  { value: 'template_fields', label: 'Şablon alanları' },
  { value: 'machine_data', label: 'Makine verileri' },
];

export default function SpecTemplateImportModal() {
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ type?: string; name?: string; divisionId?: string }>();
  const divisionId = params.divisionId ? String(params.divisionId) : '';
  const access = useAdminAccess();
  const allowed = access.isSuperAdmin;
  const types = useLookupRows('product-types', divisionId ? { divisionId } : undefined, allowed && !params.type);
  const [typeCode, setTypeCode] = useState<string | null>(params.type ? String(params.type) : null);
  const typeLabel =
    (params.type ? (params.name ? String(params.name) : null) : types.data?.find((row) => row.code === typeCode)?.name) ?? typeCode ?? '';
  const specs = useSpecTemplates({ productTypeCode: typeCode ?? undefined, ...(divisionId ? { divisionId } : {}) }, allowed && Boolean(typeCode));
  const previewMutation = usePreviewTechnicalImport();
  const commitMutation = useCommitTechnicalImport();

  const [mode, setMode] = useState<Exclude<TechnicalImportMode, 'laser_profiles'>>('machine_data');
  const [file, setFile] = useState<PickedFile | null>(null);
  const [preview, setPreview] = useState<TechnicalImportPreview | null>(null);
  const [rows, setRows] = useState<TechnicalImportRowInput[]>([]);
  const [targetProductId, setTargetProductId] = useState<string | null>(null);
  const [confirmedTarget, setConfirmedTarget] = useState(false);
  const [filter, setFilter] = useState<ImportFilter>('all');
  const [search, setSearch] = useState('');
  const requestVersion = useRef(0);

  const availableFields = useMemo(
    () =>
      typeCode
        ? buildSpecDraft(typeCode, specs.data ?? [])
            .filter((row) => !row.isDeleted)
            .map((row) => ({ key: row.specKey, groupCode: row.groupCode || undefined, unit: row.unit || undefined }))
        : [],
    [specs.data, typeCode]
  );

  const resetPreview = () => {
    requestVersion.current++;
    setPreview(null);
    setRows([]);
    setTargetProductId(null);
    setConfirmedTarget(false);
    setFilter('all');
    setSearch('');
  };

  useEffect(() => () => void requestVersion.current++, []);

  const selectFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv', 'text/comma-separated-values', 'text/plain'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      if (!isTechnicalImportFile(asset.name)) return toast.error('Yalnızca XLSX veya CSV dosyası seçin');
      if ((asset.size ?? 0) > TECHNICAL_IMPORT_MAX_BYTES) return toast.error('Dosya boyutu 10 MB sınırını aşıyor');
      setFile({ name: asset.name, size: asset.size ?? 0, mimeType: asset.mimeType ?? undefined, uri: asset.uri });
      resetPreview();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : 'Dosya okunamadı.');
    }
  };

  const createPreview = async () => {
    if (!file) return toast.error('Önce bir Excel veya CSV dosyası seçin');
    if (!divisionId) return toast.error('Önce aktarım bölümünü seçin');
    if (!typeCode) return toast.error('Ürün tipi seçimi geçersiz');
    const version = ++requestVersion.current;
    try {
      const fileBase64 = await LegacyFileSystem.readAsStringAsync(file.uri, { encoding: LegacyFileSystem.EncodingType.Base64 });
      const result = await previewMutation.mutateAsync({
        fileName: file.name,
        mimeType: file.mimeType,
        fileBase64,
        mode,
        productTypeCode: typeCode,
        divisionId,
        availableFields,
      });
      if (version !== requestVersion.current) return;
      setPreview(result);
      setRows(result.rows);
      setConfirmedTarget(false);
      const best = result.suggestedProducts[0];
      setTargetProductId(mode === 'machine_data' && best && best.score >= 0.55 ? best.id : null);
      toast.success(
        `Dosya incelendi. ${result.summary.ready} satır hazır, ${result.summary.review + result.summary.unmatched} satır inceleme bekliyor.`
      );
    } catch (err) {
      if (version !== requestVersion.current) return;
      resetPreview();
      toast.error(`Dosya incelenemedi: ${err instanceof Error ? err.message : 'Teknik veri önizlemesi oluşturulamadı.'}`);
    }
  };

  const counts = importCounts(rows);
  const visible = useMemo(() => filterImportRows(rows, filter, search), [filter, rows, search]);
  const updateRow = (key: string, patch: (row: TechnicalImportRowInput) => TechnicalImportRowInput) =>
    setRows((current) => current.map((row) => (importRowKey(row) === key ? patch(row) : row)));

  const commit = () => {
    if (!preview || !typeCode) return;
    if (mode === 'machine_data' && (!targetProductId || !confirmedTarget)) return toast.error('Hedef makineyi seçip onaylayın');
    if (!counts.ready) return toast.error('İçe aktarılacak eşleşmiş satır bulunamadı');
    commitMutation.mutate(
      {
        mode,
        productTypeCode: typeCode,
        divisionId: divisionId || null,
        targetProductId: mode === 'machine_data' ? targetProductId : null,
        confirmedTarget: mode === 'machine_data' ? confirmedTarget : false,
        rows,
      },
      {
        onSuccess: (result) => {
          toast.success(`${result.imported} teknik satır içe aktarıldı. ${result.created} yeni alan, ${result.updated} güncellenen alan.`);
          router.back();
        },
        onError: (err) => toast.error(`İçe aktarma tamamlanamadı: ${err.message}`),
      }
    );
  };

  const machines = (preview?.suggestedProducts ?? []).map((item) => ({ value: item.id, label: item.label }));
  const fieldOptions = availableFields.map((field) => ({ value: field.key, label: field.key }));
  const loadingPreview = previewMutation.isPending;
  const committing = commitMutation.isPending;

  const header = (
    <View className="gap-3 pb-2">
      {!divisionId ? (
        <Notice tone="warning" title="Bölüm seçilmedi">
          Önce aktarım bölümünü seçin.
        </Notice>
      ) : null}
      {!params.type ? (
        <OptionPicker
          label="Ürün tipi"
          value={typeCode}
          options={(types.data ?? []).filter((row) => row.isActive !== false).map((row) => ({ value: row.code, label: row.name }))}
          placeholder="Ürün tipi bulunamadı"
          searchable
          onChange={(value) => {
            setTypeCode(value);
            resetPreview();
          }}
        />
      ) : null}
      <ChipSelect
        label="Aktarım türü"
        options={MODE_OPTIONS}
        value={mode}
        onChange={(next) => {
          setMode(next);
          resetPreview();
        }}
      />
      <Card className="gap-2 p-3.5">
        <Text className="font-inter-semibold text-[14px] text-foreground" numberOfLines={1}>
          {file?.name ?? 'Excel veya CSV dosyası seçin'}
        </Text>
        <Text className="font-inter text-[12px] text-muted-foreground">
          {file ? `${(file.size / 1024).toFixed(0)} KB` : 'XLSX / CSV · en fazla 10 MB'}
          {preview ? ` · ${preview.file.sheetNames.length} çalışma sayfası · ${preview.file.rowCount} teknik satır` : ''}
        </Text>
        <View className="flex-row flex-wrap gap-2">
          <ActionPill icon="document-outline" label={file ? 'Değiştir' : 'Dosya seç'} disabled={loadingPreview || committing} onPress={() => void selectFile()} />
          <ActionPill icon="search" label="İncele" disabled={!file || !typeCode || loadingPreview} onPress={() => void createPreview()} />
        </View>
      </Card>
      {mode === 'machine_data' ? (
        <Card className="gap-2 p-3.5">
          <OptionPicker
            label="Bu çalışma sayfası hangi makineye ait?"
            value={targetProductId}
            options={machines}
            placeholder={preview ? 'Hedef makineyi seçin' : 'Önce dosyayı inceleyin'}
            searchable
            clearable
            onChange={(value) => {
              setTargetProductId(value);
              setConfirmedTarget(false);
            }}
          />
          {targetProductId ? <Chip tone="info" label="Kullanıcı seçimi gerekli" /> : null}
          <SwitchRow
            title="Seçilen makine hedefini onaylıyorum"
            value={confirmedTarget}
            onValueChange={setConfirmedTarget}
            disabled={!targetProductId}
          />
        </Card>
      ) : (
        <Notice tone="info" title="Şablon alanları">
          {`Dosyadaki alanlar ${typeLabel || 'seçili ürün tipi'} şablonuna başlangıç değeri olarak yazılacak.`}
        </Notice>
      )}
      {!preview ? (
        <Help>
          Bölüm, teknik bilgi, değer ve birim kolonlarını otomatik tanır. Hiçbir veri önizleme ve kullanıcı onayı olmadan kaydedilmez.
        </Help>
      ) : (
        <>
          <Text className="font-inter text-[12px] text-muted-foreground">
            {`${preview.summary.exact} tam eşleşti · ${preview.summary.normalized} isimle eşleşti · ${counts.review} onay bekliyor`}
          </Text>
          <SearchBar value={search} onChange={setSearch} placeholder="Alan veya değerde ara" />
          <ChipSelect
            label="Filtre"
            options={[
              { value: 'all' as const, label: `Tümü ${counts.total}` },
              { value: 'review' as const, label: `İnceleme gerekli ${counts.review}` },
              { value: 'unmatched' as const, label: `Eşleşmeyenler ${counts.unmatched}` },
            ]}
            value={filter}
            onChange={setFilter}
          />
        </>
      )}
    </View>
  );

  const footer = (
    <View className="gap-2 pt-3">
      {preview ? (
        <Text className="font-inter text-[12px] text-muted-foreground">
          {`${counts.total} satır · ${counts.ready} hazır`}
          {counts.review ? ` · ${counts.review} inceleme gerekiyor` : ''}
          {counts.unmatched ? ' · Eşleşmeyen satırlar içe aktarılmayacak.' : ''}
        </Text>
      ) : null}
      <View className="flex-row gap-2">
        <View className="flex-1">
          <Button label="Vazgeç" variant="ghost" disabled={committing} onPress={() => router.back()} />
        </View>
        <View className="flex-1">
          <Button
            label={`${counts.ready} satırı içe aktar`}
            loading={committing}
            disabled={!preview || !counts.ready || committing || loadingPreview || (mode === 'machine_data' && (!targetProductId || !confirmedTarget))}
            onPress={commit}
          />
        </View>
      </View>
    </View>
  );

  return (
    <ModalShell
      title={`${typeLabel ? `${typeLabel} · ` : ''}Teknik Bilgi İçe Aktar`}
      allowed={allowed}
      loading={(!params.type && types.isPending) || (Boolean(typeCode) && specs.isPending)}
      error={specs.error ? `Teknik şablonlar yüklenemedi: ${specs.error.message}` : types.error ? types.error.message : null}
      onRetry={() => {
        void types.refetch();
        void specs.refetch();
      }}
      scroll={false}
    >
      <FlashList
        maintainVisibleContentPosition={{ disabled: true }}
        style={{ flex: 1 }}
        data={visible}
        keyExtractor={importRowKey}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: SCREEN_PAD, paddingTop: 12, paddingBottom: 40 }}
        ListHeaderComponent={header}
        ListFooterComponent={footer}
        renderItem={({ item }) => {
          const meta = IMPORT_STATUS_META[item.matchStatus];
          const key = importRowKey(item);
          return (
            <Card className={`my-1.5 gap-2 p-3 ${item.include ? '' : 'opacity-60'}`}>
              <View className="flex-row flex-wrap items-center gap-2">
                <Chip tone="neutral" label={item.section} />
                <Chip tone={meta.tone} label={meta.label} />
              </View>
              <Text className="font-inter text-[12px] text-muted-foreground">Dosyadaki Alan</Text>
              <Text className="font-inter-semibold text-[14px] text-foreground">{item.sourceKey}</Text>
              <OptionPicker
                label="Sistem Alanı"
                value={item.targetKey || null}
                options={fieldOptions}
                placeholder="Eşleşme seçin"
                searchable
                clearable
                onChange={(value) => updateRow(key, (row) => retargetImportRow(row, value ?? '', availableFields))}
              />
              <View className="flex-row gap-2">
                <TextInput
                  value={item.sourceValue}
                  onChangeText={(sourceValue) => updateRow(key, (row) => ({ ...row, sourceValue }))}
                  placeholder="Dosyadan Gelen Değer"
                  placeholderTextColor={colors.mutedForeground}
                  accessibilityLabel={`${item.sourceKey} değeri`}
                  className="min-h-[44px] flex-[2] rounded-control border border-border bg-input-background px-3 font-inter text-[14px] text-foreground"
                />
                <TextInput
                  value={item.targetUnit || item.sourceUnit}
                  onChangeText={(targetUnit) => updateRow(key, (row) => ({ ...row, targetUnit }))}
                  placeholder="Birim"
                  placeholderTextColor={colors.mutedForeground}
                  accessibilityLabel={`${item.sourceKey} birimi`}
                  className="min-h-[44px] flex-1 rounded-control border border-border bg-input-background px-3 font-inter text-[14px] text-foreground"
                />
              </View>
              <View className="min-h-[44px] flex-row items-center justify-between">
                <Text className="font-inter text-[13px] text-foreground">İçe aktar</Text>
                <Switch
                  value={item.include}
                  onValueChange={(include) => updateRow(key, (row) => ({ ...row, include }))}
                  accessibilityLabel={`${item.sourceKey} satırını içe aktar`}
                  trackColor={{ true: colors.primary, false: colors.border }}
                />
              </View>
            </Card>
          );
        }}
      />
    </ModalShell>
  );
}
