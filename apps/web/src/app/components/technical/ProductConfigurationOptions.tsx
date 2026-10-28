import { useEffect, useState } from 'react';
import { productService } from '../../../lib/services';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { toast } from 'sonner';
import type { LaserBaseConfiguration, BaseModelConfiguration, Product } from '../../lib/mock';

export const isConfigurableLaserProduct = (product?: Pick<Product, "productTypeCode" | "laserBaseConfiguration">) => Boolean(product?.laserBaseConfiguration || /^(FIBER_LAZER(?:_KESIM|_BORU_KESIM|_3D_KESIM|_KAYNAK)?|BORU_LAZER_KESIM|SAC_LAZER_KESIM|LAZER_KESIM)$/i.test(product?.productTypeCode ?? ""));

export const isConfigurableProduct = (product?: Pick<Product, "productTypeCode" | "laserBaseConfiguration" | "baseModelConfiguration">) => Boolean(product?.baseModelConfiguration || isConfigurableLaserProduct(product));

export type ConfigurationValue = { id: string; value: string; priceDelta: string | null; currencyCode: string | null; sourceModelCode?: string | null; powerKw?: number | null; cabinType?: 'open' | 'closed' | null };
export type ConfigurationSet = { id: string; name: string; configurationKind: 'table' | 'power' | 'cabin' | null; values: ConfigurationValue[] };
export type SelectedProductOption = { optionSetId: string; optionValueId: string; name: string; value: string; priceDelta: string | null; currencyCode: string | null };
export function optionSnapshot(set: ConfigurationSet, value: ConfigurationValue): SelectedProductOption {
  return { optionSetId: set.id, optionValueId: value.id, name: set.name, value: value.value, priceDelta: value.priceDelta, currencyCode: value.currencyCode };
}

/** Compare a draft selection with the current active catalog before generating quoted prices. */
export function selectedOptionsMatchCatalog(sets: ConfigurationSet[], selected: SelectedProductOption[]): boolean {
  return selected.every(snapshot => {
    const set = sets.find(entry => entry.id === snapshot.optionSetId);
    const value = set?.values.find(entry => entry.id === snapshot.optionValueId);
    return Boolean(set && value && value.priceDelta != null && snapshot.priceDelta != null
      && Number.isFinite(Number(value.priceDelta)) && Number.isFinite(Number(snapshot.priceDelta))
      && Number(value.priceDelta) === Number(snapshot.priceDelta)
      && value.currencyCode === snapshot.currencyCode && set.name === snapshot.name && value.value === snapshot.value);
  });
}

export function isRequiredConfigurationSet(set: ConfigurationSet, genericBase?: BaseModelConfiguration | null) {
  return Boolean(set.configurationKind || (genericBase && genericBase.configurations.length > 1 && set.values.some(value => value.sourceModelCode)));
}

/** Keep fixed base facts; hydrate variable facts only from one verified source configuration. */
export function baseModelOptionSpecs(base: BaseModelConfiguration, sets: ConfigurationSet[], selected: SelectedProductOption[], fixedSpecs: { key: string; value: string; unit?: string }[]) {
  const sourceCodes = [...new Set(selected.map(option => sets.find(set => set.id === option.optionSetId)?.values.find(value => value.id === option.optionValueId)?.sourceModelCode).filter((code): code is string => Boolean(code)))];
  if (sourceCodes.length > 1) throw new Error('Seçenekler farklı makine konfigürasyonlarına ait.');
  const configuration = base.configurations.find(row => row.sourceModelCode === sourceCodes[0]);
  if (sourceCodes.length && !configuration) throw new Error('Kaynak model doğrulanamadı.');
  const fixed = fixedSpecs.filter(spec => !base.variableSpecKeys.includes(spec.key));
  const variable = configuration?.specs.filter(spec => base.variableSpecKeys.includes(spec.key)) ?? [];
  return [...fixed, ...variable].map(spec => ({ key: spec.key, value: spec.unit ? `${spec.value} ${spec.unit}` : spec.value }));
}

export function ProductConfigurationOptionsEditor({ productId, base, genericBase, currency }: { productId: string; base?: LaserBaseConfiguration | null; genericBase?: BaseModelConfiguration | null; currency: string }) {
  const [sets, setSets] = useState<ConfigurationSet[]>([]);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState('');
  const load = async () => setSets(await productService.options(productId));
  useEffect(() => { void load().catch(() => toast.error('Donanım seçenekleri yüklenemedi')); }, [productId]);
  const mutate = async (task: () => Promise<unknown>) => {
    setBusy(true);
    try { await task(); await load(); } catch { toast.error('Donanım seçeneği kaydedilemedi'); } finally { setBusy(false); }
  };
  return <div className="space-y-3">
    <p className="text-xs text-muted-foreground">Baz fiyat ürün kartında kalır. Teklifte her gruptan bir seçenek seçilir ve ek fiyatı ayrı donanım satırı olarak eklenir.</p>
    {sets.map(set => <fieldset disabled={busy} key={set.id} className="rounded-md border p-3 space-y-2">
      <legend className="px-1 text-sm font-medium">{set.name}</legend>
      <div className="flex gap-2"><Input aria-label={`${set.name} grup adı`} defaultValue={set.name} onBlur={e => { if (e.target.value.trim() && e.target.value !== set.name) void mutate(() => productService.updateOptionSet(set.id, { name: e.target.value.trim() })); }} /><Button type="button" variant="outline" onClick={() => void mutate(() => productService.archiveOptionSet(set.id))}>Grubu pasife al</Button></div>
      {set.values.map(value => <OptionValueRow key={value.id} set={set} value={value} base={base} genericBase={genericBase} currency={currency} save={body => mutate(() => productService.updateOptionValue(value.id, body))} archive={() => mutate(() => productService.archiveOptionValue(value.id))} />)}
      <OptionValueRow key={`new-${set.values.length}`} set={set} base={base} genericBase={genericBase} currency={currency} save={body => mutate(() => productService.addOptionValue(set.id, body))} />
    </fieldset>)}
    <fieldset disabled={busy} className="flex flex-wrap gap-2"><Input className="flex-1" aria-label="Yeni seçenek grubu" placeholder="Yeni grup adı" value={name} onChange={e => setName(e.target.value)} /><select aria-label="Seçenek türü" className="rounded-md border px-2" value={kind} onChange={e => setKind(e.target.value)}><option value="">Diğer donanım</option>{!genericBase && <><option value="table">Tabla / kapasite</option><option value="power">Lazer gücü</option><option value="cabin">Kabin</option></>}</select><Button type="button" disabled={!name.trim()} onClick={() => void mutate(async () => { await productService.addOptionSet(productId, { name: name.trim(), configurationKind: kind || null }); setName(''); })}>Grup ekle</Button></fieldset>
  </div>;
}
function OptionValueRow({ set, value, base, genericBase, currency, save, archive }: { set: ConfigurationSet; value?: ConfigurationValue; base?: LaserBaseConfiguration | null; genericBase?: BaseModelConfiguration | null; currency: string; save: (body: unknown) => Promise<void>; archive?: () => Promise<void> }) {
  const [label, setLabel] = useState(value?.value ?? '');
  const [price, setPrice] = useState(value?.priceDelta ?? '');
  const [code, setCode] = useState(value?.currencyCode ?? currency);
  const [source, setSource] = useState(value?.sourceModelCode ?? '');
  const [power, setPower] = useState(value?.powerKw == null ? '' : String(value.powerKw));
  const [cabin, setCabin] = useState(value?.cabinType ?? '');
  const priceValid = price.trim() !== '' && Number.isFinite(Number(price)) && Number(price) >= 0;
  const mappingValid = (set.configurationKind !== 'power' || (Number.isFinite(Number(power)) && Number(power) > 0 && Number(power) <= 1000))
    && (set.configurationKind !== 'cabin' || cabin === 'open' || cabin === 'closed');
  return <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/30 p-2">
    <Input className="min-w-40 flex-1" aria-label={`${set.name} seçenek adı`} placeholder="Seçenek adı" value={label} onChange={e => setLabel(e.target.value)} />
    {(set.configurationKind === 'table' || genericBase) && <select className="rounded-md border p-2 text-xs" aria-label={`${set.name} kaynak model`} value={source} onChange={e => setSource(e.target.value)}><option value="">Özel seçenek (manuel teknik bilgi)</option>{(genericBase?.sourceModelCodes ?? base?.sourceModelCodes ?? []).map(code => <option key={code}>{code}</option>)}</select>}
    {set.configurationKind === 'power' && <Input className="w-24" aria-label={`${set.name} kW`} type="number" min="0" step="0.1" placeholder="kW" value={power} onChange={e => setPower(e.target.value)} />}
    {set.configurationKind === 'cabin' && <select className="rounded-md border p-2 text-xs" aria-label={`${set.name} kabin`} value={cabin} onChange={e => setCabin(e.target.value)}><option value="">Kabin seçin</option><option value="open">Açık</option><option value="closed">Kapalı</option></select>}
    <Input className="w-28" aria-label={`${set.name} ek fiyat`} type="number" min="0" step="0.01" placeholder="Ek fiyat" value={price} onChange={e => setPrice(e.target.value)} />
    <select className="rounded-md border p-2 text-xs" aria-label={`${set.name} para birimi`} value={code} onChange={e => setCode(e.target.value)}>{['USD', 'EUR', 'TRY'].map(c => <option key={c}>{c}</option>)}</select>
    <Button type="button" variant="outline" disabled={!label.trim() || !priceValid || !mappingValid} onClick={() => void save({ value: label.trim(), priceDelta: price, currencyCode: code, ...(set.configurationKind === 'table' || genericBase ? { sourceModelCode: source || null } : {}), ...(set.configurationKind === 'power' ? { powerKw: Number(power) } : {}), ...(set.configurationKind === 'cabin' ? { cabinType: cabin } : {}) })}>{value ? 'Kaydet' : 'Seçenek ekle'}</Button>
    {archive && <Button type="button" variant="ghost" onClick={() => void archive()}>Pasife al</Button>}
  </div>;
}

export function QuoteConfigurationOptions({ productId, selected, disabled, onChange, refreshKey = 0 }: { refreshKey?: number; productId: string; selected: SelectedProductOption[]; disabled: boolean; onChange: (sets: ConfigurationSet[], snapshots: SelectedProductOption[]) => Promise<void> }) {
  const [sets, setSets] = useState<ConfigurationSet[]>([]);
  useEffect(() => { let current = true; productService.options(productId).then(rows => { if (current) setSets(rows); }).catch(() => toast.error('Donanım seçenekleri yüklenemedi')); return () => { current = false; }; }, [productId, refreshKey]);
  return <fieldset disabled={disabled} className="flex flex-wrap gap-3 rounded-md border p-3"><legend className="px-1 text-xs font-medium">Makine konfigürasyonu · baz fiyat + seçilen donanım</legend>{sets.map(set => <label className="flex min-w-44 flex-col gap-1 text-xs" key={set.id}>{set.name}<select className="h-9 rounded-md border bg-background px-2" aria-label={set.name} value={selected.find(s => s.optionSetId === set.id)?.optionValueId ?? ''} onChange={e => { const value = set.values.find(v => v.id === e.target.value); const next = selected.filter(s => s.optionSetId !== set.id); if (value) next.push(optionSnapshot(set, value));
      const canonical = next.map(snapshot => { const currentSet = sets.find(entry => entry.id === snapshot.optionSetId); const currentValue = currentSet?.values.find(entry => entry.id === snapshot.optionValueId); return currentSet && currentValue ? optionSnapshot(currentSet, currentValue) : null; });
      if (canonical.some(snapshot => !snapshot)) { toast.error('Pasif donanım seçimini aktif bir seçenekle değiştirin.'); return; }
      void onChange(sets, canonical.filter((snapshot): snapshot is SelectedProductOption => Boolean(snapshot))); }}><option value="">Seçiniz</option>{selected.filter(snapshot => snapshot.optionSetId === set.id && !set.values.some(value => value.id === snapshot.optionValueId)).map(snapshot => <option key={snapshot.optionValueId} value={snapshot.optionValueId}>{snapshot.value} · kayıtlı teklif seçimi</option>)}{set.values.map(value => <option key={value.id} value={value.id}>{value.value} · {value.priceDelta == null ? 'Fiyat girilmemiş' : `+${value.priceDelta} ${value.currencyCode ?? ''}`}</option>)}</select></label>)}</fieldset>;
}
