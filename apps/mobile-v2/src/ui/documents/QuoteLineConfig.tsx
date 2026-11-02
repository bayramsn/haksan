import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { LASER_POWERS, type BaseModelConfiguration, type LaserBaseConfiguration, type LaserTechnicalConfiguration } from '@haksan/shared';
import { useAuth } from '@/src/auth/AuthProvider';
import { adminApi } from '@/src/api/admin.api';
import { useProduct } from '@/src/api/inventory.hooks';
import { useOptionSets, useProductConfigurationPrices } from '@/src/api/products.hooks';
import {
  matrixConfigurationSetIds,
  quoteConfigurationChoices,
  quoteMatrixPrice,
  quoteOptionSnapshot,
  type LaserListCode,
} from './quote-configuration';
import { ChoiceChips } from './pickers';
import { OptionPicker } from '@/src/ui/pickers/OptionPicker';
import { toast } from '@/src/ui/toast';
import type { EditableQuoteItem, QuoteSelectedOptionDraft } from './quote-logic';
import { APPLY_FAILED_NOTICE, applyResolvedLaserProfile, planBaseOptionSpecs, sacIslemeDivisionId } from './quote-base-specs';

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
  const { user } = useAuth();
  const laserDivisionId = sacIslemeDivisionId(user?.divisions) ?? divisionId;
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  const busyCallback = useRef(onBusyChange);
  busyCallback.current = onBusyChange;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; busyCallback.current?.(false); }; }, []);
  if (!config) return null;

  async function resolve(patch: Partial<LaserTechnicalConfiguration['selection']>) {
    if (!brandId) {
      toast.error('Lazer profili için marka gerekli.');
      return;
    }
    if (!laserDivisionId) {
      toast.error('Sac İşleme bölümü yetkiniz yok; seçim değiştirilemedi.');
      return;
    }
    setBusy(true);
    onBusyChange?.(true);
    try {
      const resolved = await adminApi.laserResolve(
        { divisionId: laserDivisionId, brandId },
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
      toast.error(error instanceof Error && error.message ? error.message : 'Seçilen kabin/güç için teknik profil çözülemedi.');
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
  priceListCode = null,
  brandId,
  divisionId,
  onChange,
  onBusyChange,
}: {
  item: EditableQuoteItem;
  currencyCode: string;
  /** Teslim şekli lazer listesine karşılık geliyorsa (CIF / millileştirilmiş) model fiyatı oradan. */
  priceListCode?: LaserListCode | null;
  brandId?: string | null;
  divisionId?: string | null;
  onChange: (patch: Partial<EditableQuoteItem>) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const productId = item.productModelId ?? '';
  const options = useOptionSets(productId, Boolean(productId));
  const productDetail = useProduct(productId);
  const sets = options.data ?? [];
  // Matris yoksa (ya da yüklenemezse) kart baz fiyat + donanım olarak fiyatlanır (web ile aynı).
  const matrixQuery = useProductConfigurationPrices(productId, Boolean(productId));
  const matrix = matrixQuery.data?.rows ?? [];
  const hasLaser = Boolean(asLaserConfig(item.technicalConfiguration));
  const resolvedBrandId = brandId || productDetail.data?.brand?.id || null;
  const { user } = useAuth();
  // Baz kart seçimi profil çözerken seçiciler kilitlenir; geç yanıt eski seçimi ezmesin.
  const [resolving, setResolving] = useState(false);
  const alive = useRef(true);
  const busyRef = useRef(onBusyChange);
  busyRef.current = onBusyChange;
  useEffect(() => { alive.current = true; return () => { alive.current = false; busyRef.current?.(false); }; }, []);

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

  // Teslim şekli (CIF / millileştirilmiş) değişince seçili model + güç yeni listeden fiyatlanır.
  // Yalnız kullanıcı değişikliğinde çalışır; kayıtlı teklif açılışta yeniden fiyatlanmaz.
  const pricedList = useRef(priceListCode);
  useEffect(() => {
    if (pricedList.current === priceListCode) return;
    pricedList.current = priceListCode;
    if (matrix.length && item.selectedProductOptions.length) applySelection(item.selectedProductOptions);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceListCode]);

  if (!productId) return null;
  if (options.isPending && !hasLaser) {
    return <Text className="font-inter text-xs text-muted-foreground">Konfigürasyon yükleniyor…</Text>;
  }
  if (options.error && !hasLaser && !sets.length) {
    return <Text className="font-inter text-xs text-destructive">Opsiyonlar yüklenemedi: {options.error.message}</Text>;
  }
  if (!sets.length && !hasLaser) return null;

  function applySelection(nextSelected: QuoteSelectedOptionDraft[]) {
    const configurationSetIds = matrixConfigurationSetIds(sets, matrix);
    const children = nextSelected
      .filter((row) => row.priceDelta >= 0 && !configurationSetIds.has(row.optionSetId))
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
    const priced = quoteMatrixPrice(sets, nextSelected, matrix, priceListCode, currencyCode);
    if (priced.notice) (priced.notice.tone === 'error' ? toast.error : toast.info)(priced.notice.message);
    // Baz model opsiyonları lazer snapshot'ını geçersiz kılar (web changeBaseOptions).
    const next: Partial<EditableQuoteItem> = {
      selectedProductOptions: nextSelected,
      optionChildren: [...manual, ...children],
      configurationChanged: true,
      technicalConfiguration: sets.some((set) => set.configurationKind) ? null : item.technicalConfiguration,
      configurationPrice: priced.configurationPrice,
      ...(priced.unitPrice ? { unitPrice: priced.unitPrice } : {}),
    };
    // Teknik bilgi: genel baz kart / lazer profil çözümü / elle tamamlama (web changeBaseOptions).
    const detail = productDetail.data as
      | (NonNullable<typeof productDetail.data> & { laserBaseConfiguration?: LaserBaseConfiguration | null; baseModelConfiguration?: BaseModelConfiguration | null })
      | undefined;
    let plan: ReturnType<typeof planBaseOptionSpecs>;
    try {
      plan = planBaseOptionSpecs({
        laserBase: detail?.laserBaseConfiguration,
        baseModel: detail?.baseModelConfiguration,
        productSpecs: detail?.specs ?? [],
        brandId: resolvedBrandId,
        sets,
        selected: nextSelected,
        hasMatrix: matrix.length > 0,
      });
    } catch {
      toast.error(APPLY_FAILED_NOTICE);
      return;
    }
    if (plan.kind === 'unchanged') return onChange(next);
    if (plan.kind === 'specs') {
      onChange({ ...next, technicalSpecs: plan.technicalSpecs });
      if (plan.notice) toast.info(plan.notice);
      return;
    }
    const laserDivisionId = sacIslemeDivisionId(user?.divisions);
    if (!laserDivisionId || !resolvedBrandId) {
      toast.error(APPLY_FAILED_NOTICE);
      return;
    }
    const selection = plan.selection;
    setResolving(true);
    onBusyChange?.(true);
    void adminApi
      .laserResolve({ divisionId: laserDivisionId, brandId: resolvedBrandId }, selection)
      .then((resolved) => {
        if (!resolved.supportedPower) throw new Error('Bu ölçü ve güç birleşimi kaynakta doğrulanmıyor.');
        if (alive.current) onChange({ ...next, ...applyResolvedLaserProfile(resolved) });
      })
      .catch(() => { if (alive.current) toast.error(APPLY_FAILED_NOTICE); })
      .finally(() => { if (alive.current) { setResolving(false); busyRef.current?.(false); } });
  }

  return (
    <View className="gap-2 rounded-control border border-border bg-muted/20 p-3">
      <Text className="font-inter-semibold text-xs text-foreground">Makine konfigürasyonu</Text>
      {sets.length ? (
        <Text className="font-inter text-[11px] text-muted-foreground">
          {matrix.length
            ? 'Model ve güç fiyatı + seçilen donanım. Birim fiyat seçilen model ve güçten gelir.'
            : 'Baz fiyat + seçilen donanım. Ek fiyatlı seçenekler alt satır olarak eklenir.'}
        </Text>
      ) : null}
      <QuoteLaserConfig item={item} brandId={resolvedBrandId} divisionId={divisionId} onChange={onChange} onBusyChange={onBusyChange} />
      {sets.map((set) => {
        const selected = item.selectedProductOptions.find((row) => row.optionSetId === set.id);
        const pickerOptions = quoteConfigurationChoices(set, sets, item.selectedProductOptions, matrix, priceListCode, currencyCode);
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
            disabled={resolving}
            loading={resolving}
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
