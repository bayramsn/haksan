import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { LASER_POWERS, type LaserTechnicalConfiguration } from '@haksan/shared';
import { adminApi } from '@/src/api/admin.api';
import { useProduct } from '@/src/api/inventory.hooks';
import { useOptionSets } from '@/src/api/products.hooks';
import { quoteOptionSnapshot } from './quote-configuration';
import { ChoiceChips } from './pickers';
import { OptionPicker } from '@/src/ui/pickers/OptionPicker';
import { toast } from '@/src/ui/toast';
import type { EditableQuoteItem, QuoteSelectedOptionDraft } from './quote-logic';

function asLaserConfig(value: unknown): LaserTechnicalConfiguration | null {
  if (!value || typeof value !== 'object') return null;
  const selection = (value as LaserTechnicalConfiguration).selection;
  if (!selection?.productTypeCode || !selection.series || !selection.sourceModelCode) return null;
  return value as LaserTechnicalConfiguration;
}

/**
 * Web QuoteDialog lazer kabin/güç — profil yeniden çözülür, teknik spec snapshot güncellenir.
 */
function QuoteLaserConfig({
  item,
  brandId,
  divisionId,
  onChange,
  onBusyChange,
}: {
  item: EditableQuoteItem;
  brandId?: string | null;
  divisionId?: string | null;
  onChange: (patch: Partial<EditableQuoteItem>) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const config = asLaserConfig(item.technicalConfiguration);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  const busyCallback = useRef(onBusyChange);
  busyCallback.current = onBusyChange;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; busyCallback.current?.(false); }; }, []);
  if (!config) return null;

  async function resolve(patch: Partial<LaserTechnicalConfiguration['selection']>) {
    if (!brandId || !divisionId) {
      toast.error('Lazer profili için bölüm ve marka gerekli.');
      return;
    }
    setBusy(true);
    onBusyChange?.(true);
    try {
      const resolved = await adminApi.laserResolve(
        { divisionId, brandId },
        { ...config!.selection, ...patch }
      );
      if (!mounted.current) return;
      onChange({
        technicalConfiguration: resolved,
        technicalSpecs: resolved.specs.map((spec) => ({
          key: spec.key,
          value: spec.value,
          unit: spec.unit,
        })),
        configurationChanged: true,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Lazer profili çözülemedi');
    } finally {
      if (mounted.current) { setBusy(false); busyCallback.current?.(false); }
    }
  }

  return (
    <View className="gap-2">
      <Text className="font-inter-semibold text-xs text-foreground">Lazer profili</Text>
      <Text className="font-inter text-[11px] text-muted-foreground">
        {config.modelLabel} · {config.sizeLabel}
        {busy ? ' · yükleniyor…' : ''}
      </Text>
      <ChoiceChips
        label="Kabin"
        options={[
          { value: 'open', label: 'Açık' },
          { value: 'closed', label: 'Kapalı' },
        ]}
        value={config.selection.cabinType}
        onChange={(cabinType) => {
          if (!busy) void resolve({ cabinType: cabinType as 'open' | 'closed' });
        }}
      />
      <ChoiceChips
        label="Güç (kW)"
        options={LASER_POWERS.map((power) => ({ value: String(power), label: `${power} kW` }))}
        value={String(config.selection.powerKw)}
        onChange={(power) => {
          if (!busy) void resolve({ powerKw: Number(power) });
        }}
      />
    </View>
  );
}

/**
 * Web QuoteConfigurationOptions + lazer kabin/güç.
 * Seçim değişince `selectedProductOptions` + opsiyon çocuk satırları güncellenir.
 */
export function QuoteLineConfig({
  item,
  currencyCode,
  brandId,
  divisionId,
  onChange,
  onBusyChange,
}: {
  item: EditableQuoteItem;
  currencyCode: string;
  brandId?: string | null;
  divisionId?: string | null;
  onChange: (patch: Partial<EditableQuoteItem>) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const productId = item.productModelId ?? '';
  const options = useOptionSets(productId, Boolean(productId));
  const productDetail = useProduct(productId);
  const sets = options.data ?? [];
  const hasLaser = Boolean(asLaserConfig(item.technicalConfiguration));
  const resolvedBrandId = brandId || productDetail.data?.brand?.id || null;

  useEffect(() => {
    const detail = productDetail.data as (typeof productDetail.data & { technicalConfiguration?: unknown }) | undefined;
    if (!detail || item.technicalConfiguration || item.configurationChanged) return;
    const tech = detail.technicalConfiguration;
    if (!asLaserConfig(tech)) return;
    onChange({
      technicalConfiguration: tech,
      brandId: detail.brand?.id ?? item.brandId,
      technicalSpecs: item.technicalSpecs.length
        ? item.technicalSpecs
        : (detail.specs ?? []).map((spec) => ({ key: spec.key, value: spec.value, unit: spec.unit ?? undefined })),
    });
    // Yalnız ürün detayı gelince bir kez doldur; onChange her render’da yeni referans.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productDetail.data, item.technicalConfiguration, item.configurationChanged]);

  if (!productId) return null;
  if (options.isPending && !hasLaser) {
    return <Text className="font-inter text-xs text-muted-foreground">Konfigürasyon yükleniyor…</Text>;
  }
  if (options.error && !hasLaser && !sets.length) {
    return <Text className="font-inter text-xs text-destructive">Opsiyonlar yüklenemedi: {options.error.message}</Text>;
  }
  if (!sets.length && !hasLaser) return null;

  function applySelection(nextSelected: QuoteSelectedOptionDraft[]) {
    const children = nextSelected
      .filter((row) => row.priceDelta >= 0)
      .map((row) => {
        const existing = item.optionChildren.find((child) => child.optionSetId === row.optionSetId);
        return {
          key: existing?.key ?? `opt-${row.optionSetId}`,
          itemId: existing?.itemId,
          optionSetId: row.optionSetId,
          description: `${row.name}: ${row.value}`,
          quantity: existing?.quantity ?? item.quantity ?? '1',
          unitPrice: String(row.priceDelta),
          discount: existing?.discount ?? '',
          discountType: existing?.discountType ?? ('amount' as const),
          vatRate: existing?.vatRate ?? item.vatRate,
        };
      });
    const manual = item.optionChildren.filter((child) => !child.optionSetId);
    // Baz model opsiyonları lazer snapshot'ını geçersiz kılar (web changeBaseOptions).
    onChange({
      selectedProductOptions: nextSelected,
      optionChildren: [...manual, ...children],
      configurationChanged: true,
      technicalConfiguration: sets.some((set) => set.configurationKind) ? null : item.technicalConfiguration,
    });
  }

  return (
    <View className="gap-2 rounded-control border border-border bg-muted/20 p-3">
      <Text className="font-inter-semibold text-xs text-foreground">Makine konfigürasyonu</Text>
      {sets.length ? (
        <Text className="font-inter text-[11px] text-muted-foreground">
          Baz fiyat + seçilen donanım. Ek fiyatlı seçenekler alt satır olarak eklenir.
        </Text>
      ) : null}
      <QuoteLaserConfig item={item} brandId={resolvedBrandId} divisionId={divisionId} onChange={onChange} onBusyChange={onBusyChange} />
      {sets.map((set) => {
        const selected = item.selectedProductOptions.find((row) => row.optionSetId === set.id);
        const pickerOptions = set.values.map((value) => ({
          value: value.id,
          label: `${value.value} · ${value.priceDelta == null ? 'Fiyat yok' : `+${value.priceDelta} ${value.currencyCode ?? currencyCode}`}`,
        }));
        if (selected && !set.values.some((value) => value.id === selected.optionValueId)) {
          pickerOptions.unshift({
            value: selected.optionValueId,
            label: `${selected.value} · kayıtlı teklif seçimi`,
          });
        }
        return (
          <OptionPicker
            key={set.id}
            label={set.name}
            icon="options-outline"
            placeholder="Seçiniz"
            value={selected?.optionValueId ?? null}
            options={pickerOptions}
            clearable
            onChange={(valueId) => {
              const without = item.selectedProductOptions.filter((row) => row.optionSetId !== set.id);
              if (!valueId) {
                applySelection(without);
                return;
              }
              try {
                const snapshot = quoteOptionSnapshot(set, valueId, currencyCode);
                applySelection([...without, snapshot]);
              } catch (error) { toast.error(error instanceof Error ? error.message : 'Seçenek doğrulanamadı'); }
            }}
          />
        );
      })}
    </View>
  );
}
