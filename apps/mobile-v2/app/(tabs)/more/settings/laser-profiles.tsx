import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import type { LaserSpec, LaserTechnicalConfiguration } from '@haksan/shared';
import type { LaserImportPreview, LaserProfileScope } from '@/src/api/admin.api';
import {
  useCatalogBrands,
  useLaserCommitImport,
  useLaserOptions,
  useLaserPreviewImport,
  useLaserResolve,
  useLaserSave,
} from '@/src/api/admin.hooks';
import { useTheme } from '@/src/theme/theme';
import { Button, Card, Chip, ErrorState } from '@/src/ui';
import { toast } from '@/src/ui/toast';
import { OptionPicker } from '@/src/ui/pickers/OptionPicker';
import { useAdminAccess } from '@/src/ui/admin/access';
import { ActionPill, ChipSelect, Notice } from '@/src/ui/admin/controls';
import { Help } from '@/src/ui/admin/ModalShell';
import { SettingsSubpage } from '@/src/ui/admin/SettingsSubpage';
import {
  LASER_CABINS,
  LASER_POWERS_FALLBACK,
  LASER_POWER_KEY,
  LASER_PRODUCT_TYPES,
  addLaserSpec,
  cabinLabel,
  changeLaserSelection,
  completeLaserSelection,
  editLaserField,
  editLaserSpec,
  isLaserCatalogBrand,
  isLaserImportFile,
  laserCabinHint,
  laserCounts,
  laserSelectionKey,
  laserSeriesOptions,
  moveLaserSpec,
  powerLabel,
  removeLaserSpec,
  resetLaserSpec,
  type PartialLaserSelection,
} from '@/src/ui/admin/laser-model';
import { TECHNICAL_IMPORT_MAX_BYTES } from '@/src/ui/admin/spec-template-model';
import { useSettingsDivision } from '@/src/ui/admin/useSettingsDivision';

const inputClass = 'min-h-[44px] rounded-control border border-border bg-input-background px-3 font-inter text-[14px] text-foreground';

export default function LaserProfilesScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const access = useAdminAccess();
  const canEdit = access.isSuperAdmin;
  const { divisionId, setDivisionId, options: divisionOptions } = useSettingsDivision();
  const brands = useCatalogBrands(divisionId || undefined, canEdit);
  const laserBrands = useMemo(() => (brands.data ?? []).filter(isLaserCatalogBrand), [brands.data]);
  const [brandId, setBrandId] = useState<string | null>(null);
  const scope: LaserProfileScope | null = divisionId && brandId ? { divisionId, brandId } : null;
  const options = useLaserOptions(scope);
  const [selection, setSelection] = useState<PartialLaserSelection>({ productTypeCode: 'FIBER_LAZER_KESIM' });
  const selectionKey = laserSelectionKey(selection);
  const complete = completeLaserSelection(selection);
  const resolved = useLaserResolve(scope, complete, selectionKey);
  const [configuration, setConfiguration] = useState<LaserTechnicalConfiguration | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const save = useLaserSave();

  useEffect(() => {
    if (brandId && laserBrands.some((brand) => brand.id === brandId)) return;
    setBrandId(laserBrands[0]?.id ?? null);
  }, [brandId, laserBrands]);

  useEffect(() => {
    setConfiguration(null);
  }, [selectionKey, brandId, divisionId]);

  useEffect(() => {
    if (resolved.data && laserSelectionKey(resolved.data.selection) === selectionKey) setConfiguration(resolved.data);
  }, [resolved.data, selectionKey]);

  const change = (field: Parameters<typeof changeLaserSelection>[1], value: string) =>
    setSelection((current) => changeLaserSelection(current, field, value));

  const models = useMemo(
    () => (options.data?.models ?? []).filter((model) => model.series === selection.series && model.productTypeCode === selection.productTypeCode),
    [options.data, selection.productTypeCode, selection.series]
  );
  const series = laserSeriesOptions(options.data?.models ?? [], selection.productTypeCode);
  const powers = options.data?.powerOptions ?? [...LASER_POWERS_FALLBACK];
  const isTube = selection.productTypeCode === 'BORU_LAZER_KESIM';
  const counts = laserCounts(configuration);
  const setSpecs = (specs: LaserSpec[]) => configuration && setConfiguration({ ...configuration, specs });

  const submit = () => {
    if (!configuration || !scope) return;
    save.mutate(
      { scope, selection: configuration.selection, specs: configuration.specs },
      {
        onSuccess: (saved) => {
          setConfiguration(saved);
          toast.success(
            `Lazer teknik profili kaydedildi. ${saved.modelLabel} · ${saved.selection.powerKw} kW · ${cabinLabel(saved.selection.cabinType)} kabin · ${saved.syncedProductCount} ürün kartı güncellendi.`
          );
        },
        onError: (err) => toast.error(`Profil kaydedilemedi: ${err.message}`),
      }
    );
  };

  const brandMissing = !brands.isPending && !brands.error && Boolean(divisionId) && laserBrands.length === 0;

  return (
    <SettingsSubpage
      title="Makine teknik bilgileri"
      subtitle="Lazer teknik profilleri"
      allowed={canEdit}
      loading={brands.isPending && Boolean(divisionId)}
      error={brands.error ? `Teknik katalog markaları yüklenemedi. ${brands.error.message}` : null}
      onRetry={() => void brands.refetch()}
      refreshing={brands.isRefetching || options.isRefetching}
      onRefresh={() => {
        void brands.refetch();
        void options.refetch();
      }}
      actions={[{ icon: 'save-outline', label: 'Profili kaydet', onPress: submit }]}
    >
      <Help>Seri, kabin, güç ve ölçü seçimine ait değerleri düzenleyin. Kaydedilen profil, aynı seçimlerle açılan ürün kartına uygulanır.</Help>
      {divisionOptions.length ? (
        <ChipSelect label="Bölüm" options={divisionOptions.map((d) => ({ value: d.id, label: d.name }))} value={divisionId} onChange={setDivisionId} />
      ) : null}
      <OptionPicker
        label="Marka"
        value={brandId}
        options={laserBrands.map((brand) => ({ value: brand.id, label: brand.name }))}
        placeholder={brands.isPending ? 'Marka yükleniyor…' : 'Marka seçin'}
        onChange={(value) => setBrandId(value)}
      />
      {brandMissing ? (
        <Notice tone="warning" title="Marka bulunamadı">
          Bu bölümde teknik kataloğu bağlı marka bulunamadı. CRM Alan Ayarları → Markalar üzerinden marka kapsamını ve teknik kataloğunu düzenleyin.
        </Notice>
      ) : null}
      {brandMissing ? (
        <ActionPill icon="pricetags-outline" label="CRM Alan Ayarları → Markalar" onPress={() => router.push(`/(tabs)/more/settings/lookups/brands?divisionId=${divisionId}` as Href)} />
      ) : null}
      <View className="flex-row flex-wrap gap-2">
        <ActionPill
          icon="cloud-upload-outline"
          label="Excel'den profil aktar"
          disabled={!scope || save.isPending}
          onPress={() => setImportOpen((open) => !open)}
        />
      </View>

      {importOpen && scope ? <LaserImportCard scope={scope} onClose={() => setImportOpen(false)} onImported={() => void resolved.refetch()} /> : null}

      <OptionPicker
        label="2. Ürün alt kategorisi"
        value={selection.productTypeCode ?? null}
        options={LASER_PRODUCT_TYPES.map((item) => ({ value: item.value, label: item.label }))}
        onChange={(value) => value && change('productTypeCode', value)}
      />
      {options.error ? (
        <ErrorState message={options.error.message} onRetry={() => void options.refetch()} />
      ) : (
        <>
          <OptionPicker
            label="3. Ürün serisi tipi"
            value={selection.series ?? null}
            options={series.map((item) => ({ value: item, label: `${item} Serisi` }))}
            placeholder={options.isPending && scope ? 'Modeller yükleniyor…' : 'Seri seçin'}
            onChange={(value) => change('series', value ?? '')}
          />
          {selection.series ? (
            <>
              <ChipSelect
                label="4. Kabin tipi"
                options={LASER_CABINS.map((item) => ({ value: item.value, label: item.label }))}
                value={selection.cabinType ?? ''}
                onChange={(value) => change('cabinType', value)}
              />
              <Help>{laserCabinHint(selection, models)}</Help>
            </>
          ) : null}
          {selection.cabinType ? (
            <ChipSelect
              label="5. Rezonatör gücü"
              options={powers.map((power) => ({ value: String(power), label: powerLabel(power) }))}
              value={selection.powerKw ? String(selection.powerKw) : ''}
              onChange={(value) => change('powerKw', value)}
            />
          ) : null}
          {selection.powerKw ? (
            <OptionPicker
              label={isTube ? '6. Model ve boru kapasitesi' : '6. Tabla ölçüsü'}
              value={selection.sourceModelCode ?? null}
              options={models.map((model) => ({ value: model.code, label: `${model.code} — ${model.sizeLabel}` }))}
              placeholder={isTube ? 'Model ve kapasite seçin' : 'Model ve tabla seçin'}
              searchable
              onChange={(value) => change('sourceModelCode', value ?? '')}
            />
          ) : null}
        </>
      )}

      {!scope ? (
        <Notice tone="warning" title="Seçim eksik">
          Lazer teknik bilgileri için Sac İşleme bölümünü ve teknik kataloğu bağlı markayı seçin.
        </Notice>
      ) : null}
      {resolved.error ? <ErrorState message={resolved.error.message || 'Teknik bilgiler yüklenemedi.'} onRetry={() => void resolved.refetch()} /> : null}
      <Text className="font-inter text-[13px] text-muted-foreground" accessibilityLiveRegion="polite">
        {complete && resolved.isFetching
          ? 'Seçilen makinenin teknik bilgileri yükleniyor…'
          : configuration
            ? `${counts.source} kaynak değeri · ${counts.manual} elle düzenlenen · ${counts.missing} eksik alan`
            : 'Seri, kabin, güç ve ölçü seçimlerini tamamlayın.'}
      </Text>

      {configuration ? (
        <>
          {!configuration.supportedPower || !configuration.standardCabin ? (
            <Notice tone="warning" title="Kaynak doğrulaması">
              {[
                !configuration.supportedPower ? 'Seçilen güç için kaynak doğrulaması eksik. Boş alanları elle tamamlayıp kaydedebilirsiniz.' : null,
                !configuration.standardCabin ? 'Bu kabin için kaynak doğrulaması bulunmuyor. Kabine bağlı değerleri elle tamamlayabilirsiniz.' : null,
              ]
                .filter(Boolean)
                .join(' ')}
            </Notice>
          ) : null}
          {configuration.issues.length ? (
            <Card className="gap-1 p-3">
              <Text className="font-inter-semibold text-[13px] text-foreground">{`Kaynak notları ve eksikler (${configuration.issues.length})`}</Text>
              {configuration.issues.map((issue, index) => (
                <Text key={`${issue.code}-${index}`} className="font-inter text-[12px] text-muted-foreground">
                  {`• ${issue.field ? `${issue.field}: ` : ''}${issue.message}`}
                </Text>
              ))}
            </Card>
          ) : null}
          <Help>Alan adı, değer, birim ve grubu düzenleyebilir; alan ekleyip kaldırabilirsiniz.</Help>
          {configuration.specs.map((spec, index) => {
            const locked = spec.key === LASER_POWER_KEY;
            return (
              <Card key={`${index}-${spec.key}`} className="gap-2 p-3">
                <View className="flex-row items-center gap-2">
                  <TextInput
                    value={spec.key}
                    editable={!locked && !save.isPending}
                    maxLength={255}
                    onChangeText={(key) => setSpecs(configuration.specs.map((s, i) => (i === index ? editLaserField(s, { key }) : s)))}
                    accessibilityLabel={`${index + 1}. alan adı`}
                    className={`${inputClass} flex-1 font-inter-semibold`}
                  />
                  {spec.isManual ? <Chip tone="info" label="Elle düzenlendi" /> : null}
                </View>
                <TextInput
                  value={spec.value}
                  editable={!locked && !save.isPending}
                  maxLength={2000}
                  placeholder="Elle tamamlayın"
                  placeholderTextColor={colors.mutedForeground}
                  onChangeText={(value) => setSpecs(configuration.specs.map((s, i) => (i === index ? editLaserSpec(s, value) : s)))}
                  accessibilityLabel={`${spec.key} değeri`}
                  className={`${inputClass} ${spec.value.trim() ? '' : 'border-warning'}`}
                />
                <View className="flex-row gap-2">
                  <TextInput
                    value={spec.unit ?? ''}
                    editable={!locked && !save.isPending}
                    maxLength={64}
                    placeholder="Birim"
                    placeholderTextColor={colors.mutedForeground}
                    onChangeText={(unit) => setSpecs(configuration.specs.map((s, i) => (i === index ? editLaserField(s, { unit }) : s)))}
                    accessibilityLabel={`${spec.key} birimi`}
                    className={`${inputClass} flex-1`}
                  />
                  <TextInput
                    value={spec.groupCode ?? ''}
                    editable={!save.isPending}
                    maxLength={64}
                    placeholder="Grup"
                    placeholderTextColor={colors.mutedForeground}
                    onChangeText={(groupCode) => setSpecs(configuration.specs.map((s, i) => (i === index ? editLaserField(s, { groupCode }) : s)))}
                    accessibilityLabel={`${spec.key} grubu`}
                    className={`${inputClass} flex-1`}
                  />
                </View>
                {spec.source ? (
                  <Text className="font-inter text-[11px] text-muted-foreground">
                    {`${spec.source.document} · ${spec.source.sheet ?? ''} ${spec.source.cell ?? ''}${spec.source.page ? ` s. ${spec.source.page}` : ''}`}
                  </Text>
                ) : null}
                <View className="flex-row justify-end gap-2">
                  {spec.isManual ? (
                    <IconButton icon="refresh" label={`${spec.key} kaynak değerine dön`} onPress={() => setSpecs(configuration.specs.map((s, i) => (i === index ? resetLaserSpec(s) : s)))} />
                  ) : null}
                  <IconButton icon="arrow-up" label={`${spec.key} yukarı taşı`} disabled={index === 0} onPress={() => setSpecs(moveLaserSpec(configuration.specs, index, -1))} />
                  <IconButton
                    icon="arrow-down"
                    label={`${spec.key} aşağı taşı`}
                    disabled={index === configuration.specs.length - 1}
                    onPress={() => setSpecs(moveLaserSpec(configuration.specs, index, 1))}
                  />
                  <IconButton icon="trash-outline" label={`${spec.key} kaldır`} disabled={locked} destructive onPress={() => setSpecs(removeLaserSpec(configuration.specs, index))} />
                </View>
              </Card>
            );
          })}
          <View className="flex-row gap-2">
            <View className="flex-1">
              <Button label="Alan ekle" variant="ghost" disabled={save.isPending || configuration.specs.length >= 150} onPress={() => setSpecs(addLaserSpec(configuration.specs))} />
            </View>
            <View className="flex-1">
              <Button label={save.isPending ? 'Kaydediliyor…' : 'Profili kaydet'} loading={save.isPending} disabled={!scope || save.isPending} onPress={submit} />
            </View>
          </View>
        </>
      ) : null}
    </SettingsSubpage>
  );
}

function IconButton({
  icon,
  label,
  onPress,
  disabled,
  destructive,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  destructive?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      className="h-11 w-11 items-center justify-center rounded-control border border-border active:opacity-70"
      style={{ opacity: disabled ? 0.4 : 1 }}
    >
      <Ionicons name={icon} size={18} color={destructive ? colors.destructive : colors.foreground} />
    </Pressable>
  );
}

function LaserImportCard({ scope, onClose, onImported }: { scope: LaserProfileScope; onClose: () => void; onImported: () => void }) {
  const previewMutation = useLaserPreviewImport();
  const commitMutation = useLaserCommitImport();
  const [file, setFile] = useState<{ name: string; uri: string; mimeType?: string } | null>(null);
  const [preview, setPreview] = useState<LaserImportPreview | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [error, setError] = useState('');
  const selected = preview?.laserProfiles[selectedIndex];

  const selectFile = async () => {
    setPreview(null);
    setSelectedIndex(0);
    setError('');
    setFile(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      if (!isLaserImportFile(asset.name)) return setError('Çok sütunlu teknik bilgi aktarımı için XLSX dosyası seçin.');
      if ((asset.size ?? 0) > TECHNICAL_IMPORT_MAX_BYTES) return setError('Dosya boyutu en fazla 10 MB olabilir.');
      setFile({ name: asset.name, uri: asset.uri, mimeType: asset.mimeType ?? undefined });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Dosya okunamadı.');
    }
  };

  const makePreview = async () => {
    if (!file) return;
    setError('');
    try {
      const fileBase64 = await LegacyFileSystem.readAsStringAsync(file.uri, { encoding: LegacyFileSystem.EncodingType.Base64 });
      const result = await previewMutation.mutateAsync({ scope, file: { fileName: file.name, fileBase64, mimeType: file.mimeType } });
      setPreview(result);
      setSelectedIndex(0);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Dosya incelenemedi.');
    }
  };

  const commit = () => {
    if (!preview) return;
    setError('');
    commitMutation.mutate(
      { scope, preview },
      {
        onSuccess: (result) => {
          toast.success(
            `Lazer profilleri aktarıldı. ${result.created} yeni, ${result.updated} güncellenen profil · ${result.syncedProductCount} ürün kartı güncellendi. Elle düzenlenen profil değerleri korundu.`
          );
          setPreview(null);
          setFile(null);
          onClose();
          onImported();
        },
        onError: (err) => {
          const message = err.message || 'Aktarım tamamlanamadı. Önizleme süresi dolduysa dosyayı yeniden inceleyin.';
          setError(message);
          toast.error(message);
        },
      }
    );
  };

  const busy = previewMutation.isPending || commitMutation.isPending;

  return (
    <Card className="gap-3 p-3.5">
      <Text className="font-display text-[17px] text-foreground">Model değerlerini Excel&apos;den aktar</Text>
      <Help>
        Standart Yapılandırma ve dosyadaki tüm desteklenen kesim serileri birlikte okunur. Her model, kabin ve güç için teknik değerleri kaydetmeden önce inceleyin.
      </Help>
      <Text className="font-inter text-[13px] text-foreground" numberOfLines={1}>
        {file?.name ?? 'Teknik parametre dosyası (.xlsx)'}
      </Text>
      <View className="flex-row flex-wrap gap-2">
        <ActionPill icon="document-outline" label={file ? 'Değiştir' : 'Dosya seç'} disabled={busy} onPress={() => void selectFile()} />
        <ActionPill
          icon="grid-outline"
          label={previewMutation.isPending ? 'İnceleniyor…' : 'Önizlemeyi oluştur'}
          disabled={!file || busy}
          onPress={() => void makePreview()}
        />
      </View>
      {error ? (
        <Text accessibilityRole="alert" className="font-inter text-[13px] text-destructive">
          {error}
        </Text>
      ) : null}
      {preview ? (
        <>
          <Text className="font-inter text-[13px] text-muted-foreground" accessibilityLiveRegion="polite">
            {`${preview.laserProfiles.length} profil hazır. Aynı kayıtlar güncellenir, elle düzenlenen değerler korunur. Önizleme 15 dakika geçerlidir.`}
          </Text>
          {preview.issues.length ? (
            <Notice tone="warning" title="Kaynak notları">
              {preview.issues.map((issue) => issue.message).join('\n')}
            </Notice>
          ) : null}
          {preview.laserProfiles.map((profile, index) => {
            const filled = profile.specs.filter((spec) => spec.value.trim()).length;
            const active = index === selectedIndex;
            return (
              <Pressable
                key={`${profile.selection.sourceModelCode}-${profile.selection.cabinType}-${profile.selection.powerKw}`}
                onPress={() => setSelectedIndex(index)}
                accessibilityRole="button"
                accessibilityLabel={`${profile.modelLabel} ${profile.selection.cabinType === 'open' ? 'açık' : 'kapalı'} ${profile.selection.powerKw} kW profilini incele`}
                className={`min-h-[44px] gap-1 rounded-control border p-2.5 ${active ? 'border-primary' : 'border-border'}`}
              >
                <Text className="font-inter-semibold text-[13px] text-foreground">
                  {`${profile.modelLabel} · ${cabinLabel(profile.selection.cabinType)} · ${profile.selection.powerKw} kW`}
                </Text>
                <Text className="font-inter text-[12px] text-muted-foreground">
                  {`${profile.sizeLabel} · Dolu ${filled} · Eksik ${profile.specs.length - filled} · Kaynak notları ${profile.issues.length}`}
                </Text>
              </Pressable>
            );
          })}
          {selected ? (
            <View className="gap-1.5">
              <Text className="font-inter-semibold text-[14px] text-foreground">
                {`${selected.modelLabel} · ${cabinLabel(selected.selection.cabinType)} · ${selected.selection.powerKw} kW`}
              </Text>
              {selected.issues.map((issue, index) => (
                <Text key={index} className="font-inter text-[12px] text-warning">
                  {issue.message}
                </Text>
              ))}
              {selected.specs.map((spec) => (
                <View key={spec.key} className="flex-row justify-between gap-3 border-b border-border py-1.5">
                  <Text className="shrink font-inter-medium text-[12px] text-foreground">{spec.key}</Text>
                  <Text className="shrink text-right font-inter text-[12px] text-muted-foreground">
                    {spec.value ? `${spec.value} ${spec.unit ?? ''}`.trim() : 'Eksik'}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </>
      ) : null}
      <View className="flex-row gap-2">
        <View className="flex-1">
          <Button label="Kapat" variant="ghost" disabled={commitMutation.isPending} onPress={onClose} />
        </View>
        <View className="flex-1">
          <Button
            label={commitMutation.isPending ? 'Aktarılıyor…' : `${preview?.laserProfiles.length ?? 0} profili kaydet`}
            loading={commitMutation.isPending}
            disabled={!preview?.laserProfiles.length || busy}
            onPress={commit}
          />
        </View>
      </View>
    </Card>
  );
}
