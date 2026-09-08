import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { laserSelectionSchema, type LaserSelection, type LaserTechnicalConfiguration } from '@haksan/shared';
import { AlertCircle, FileSpreadsheet, Loader2, RotateCcw } from 'lucide-react';
import { useAuth } from '../../../lib/auth';
import { laserProfilesService, type LaserProfileOptions } from '../../../lib/services/laser-profiles.service';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { changeLaserSelection, editLaserSpec, laserDraftKey, laserSelectionKey, readLaserDraft, resetLaserSpec, type LaserDraftScope } from './laser-editor-state';

export interface LaserConfigurationEditorProps {
  divisionId?: string;
  brandId?: string;
  value?: LaserTechnicalConfiguration | null;
  onChange: (configuration: LaserTechnicalConfiguration | null) => void;
  draftScope: string;
  initialProductTypeCode?: LaserSelection['productTypeCode'];
  onSelectionChange?: (selection: Partial<LaserSelection>) => void;
  disabled?: boolean;
}

export function LaserConfigurationEditor(props: LaserConfigurationEditorProps) {
  const { user } = useAuth();
  const scope: LaserDraftScope = {
    tenantId: user?.tenantId ?? '', divisionId: props.divisionId ?? '', brandId: props.brandId ?? '', draftScope: props.draftScope,
  };
  // Remounting on an identity change also aborts requests for the previous tenant/brand.
  return <LaserEditor key={JSON.stringify(scope)} {...props} scope={scope} />;
}

function LaserEditor({ divisionId, brandId, value, onChange, initialProductTypeCode, onSelectionChange, disabled, scope }: LaserConfigurationEditorProps & { scope: LaserDraftScope }) {
  const id = useId();
  const [selection, setSelection] = useState<Partial<LaserSelection>>(() => value?.selection ?? { productTypeCode: initialProductTypeCode ?? 'FIBER_LAZER_KESIM' });
  const [configuration, setConfiguration] = useState<LaserTechnicalConfiguration | null>(value ?? null);
  const [options, setOptions] = useState<LaserProfileOptions | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [optionsError, setOptionsError] = useState('');
  const [resolveError, setResolveError] = useState('');
  const [storageError, setStorageError] = useState(false);
  const [restoredDraft, setRestoredDraft] = useState(false);
  const [retry, setRetry] = useState(0);
  const requestVersion = useRef(0);
  const currentConfiguration = useRef(configuration);
  const callbacks = useRef({ onChange, onSelectionChange });
  callbacks.current = { onChange, onSelectionChange };
  currentConfiguration.current = configuration;
  const selectionKey = laserSelectionKey(selection);

  const publish = (next: LaserTechnicalConfiguration | null) => {
    currentConfiguration.current = next;
    setConfiguration(next);
    callbacks.current.onChange(next);
  };

  useEffect(() => {
    if (!divisionId) return;
    const controller = new AbortController();
    setLoadingOptions(true);
    setOptionsError('');
    void laserProfilesService.options({ divisionId, brandId }, controller.signal)
      .then((result) => { if (!controller.signal.aborted) setOptions(result); })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setOptionsError(error instanceof Error ? error.message : 'Lazer seçenekleri yüklenemedi.');
      })
      .finally(() => { if (!controller.signal.aborted) setLoadingOptions(false); });
    return () => controller.abort();
  }, [divisionId, brandId, retry]);

  // Accept saved data that arrives after mount and metadata returned by a save.
  useEffect(() => {
    if (value && value !== currentConfiguration.current) {
      if (laserSelectionKey(value.selection) !== selectionKey) {
        requestVersion.current += 1;
        setSelection(value.selection);
      }
      currentConfiguration.current = value;
      setConfiguration(value);
    }
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (initialProductTypeCode && initialProductTypeCode !== selection.productTypeCode) {
      requestVersion.current += 1;
      setSelection({ productTypeCode: initialProductTypeCode });
      publish(null);
    }
  }, [initialProductTypeCode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const controller = new AbortController();
    const version = ++requestVersion.current;
    const parsed = laserSelectionSchema.safeParse(selection);
    setResolveError('');
    setRestoredDraft(false);
    if (!parsed.success || !divisionId || !brandId) {
      setLoading(false);
      return () => controller.abort();
    }
    const selected = parsed.data;
    // A saved snapshot wins over a stale browser draft; changing selection clears
    // currentConfiguration first, so unsaved combination drafts still restore.
    if (currentConfiguration.current && laserSelectionKey(currentConfiguration.current.selection) === selectionKey) {
      setLoading(false);
      return () => controller.abort();
    }
    const draft = readLaserDraft(localStorage, laserDraftKey(scope, selected), selected);
    if (draft) {
      publish(draft);
      setRestoredDraft(true);
      setLoading(false);
      return () => controller.abort();
    }
    setLoading(true);
    void laserProfilesService.resolve({ divisionId, brandId }, selected, controller.signal)
      .then((result) => {
        if (controller.signal.aborted || version !== requestVersion.current) return;
        publish(result);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || version !== requestVersion.current) return;
        setResolveError(error instanceof Error ? error.message : 'Teknik bilgiler yüklenemedi.');
      })
      .finally(() => { if (!controller.signal.aborted && version === requestVersion.current) setLoading(false); });
    return () => controller.abort();
  }, [selectionKey, divisionId, brandId, retry]); // eslint-disable-line react-hooks/exhaustive-deps

  const change = (field: keyof LaserSelection, nextValue: string) => {
    const next = changeLaserSelection(selection, field, nextValue);
    if (laserSelectionKey(next) === selectionKey) return;
    requestVersion.current += 1;
    setSelection(next);
    setRestoredDraft(false);
    setResolveError('');
    publish(null);
    callbacks.current.onSelectionChange?.(next);
  };

  const updateSpec = (index: number, nextValue: string, restoreSource = false) => {
    if (!configuration) return;
    const next = { ...configuration, specs: configuration.specs.map((spec, i) => i === index ? (restoreSource ? resetLaserSpec(spec) : editLaserSpec(spec, nextValue)) : spec) };
    publish(next);
    try { localStorage.setItem(laserDraftKey(scope, next.selection), JSON.stringify(next)); setStorageError(false); }
    catch { setStorageError(true); }
  };

  const models = useMemo(() => options?.models.filter((model) => model.series === selection.series && model.productTypeCode === selection.productTypeCode) ?? [], [options, selection.series, selection.productTypeCode]);
  const isTube = selection.productTypeCode === 'BORU_LAZER_KESIM';
  const inputDisabled = disabled || !divisionId || !brandId;
  const sourceCount = configuration?.specs.filter((spec) => spec.value.trim() && !spec.isManual).length ?? 0;
  const manualCount = configuration?.specs.filter((spec) => spec.isManual).length ?? 0;
  const missingCount = configuration?.specs.filter((spec) => !spec.value.trim()).length ?? 0;
  const selectClass = 'h-10 w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-500';

  return (
    <section className="space-y-4" aria-label="Lazer teknik yapılandırması">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div className="space-y-1.5"><Label htmlFor={`${id}-category`}>1. Ürün kategorisi</Label><select id={`${id}-category`} className={selectClass} value="TEZGAH" disabled><option value="TEZGAH">Tezgah</option></select></div>
        <div className="space-y-1.5"><Label htmlFor={`${id}-type`}>2. Ürün alt kategorisi</Label><select id={`${id}-type`} className={selectClass} disabled={inputDisabled} value={selection.productTypeCode ?? ''} onChange={(event) => change('productTypeCode', event.target.value)}><option value="FIBER_LAZER_KESIM">Sac Lazer Kesim</option><option value="BORU_LAZER_KESIM">Boru/Profil Lazer Kesim</option></select></div>
        <div className="space-y-1.5"><Label htmlFor={`${id}-series`}>3. Ürün serisi tipi</Label><select id={`${id}-series`} className={selectClass} disabled={inputDisabled || !selection.productTypeCode} value={selection.series ?? ''} onChange={(event) => change('series', event.target.value)}><option value="">Seri seçin</option>{(isTube ? ['TG'] : ['F', 'PG']).map((series) => <option key={series} value={series}>{series} Serisi</option>)}</select></div>
        <div className="space-y-1.5"><Label htmlFor={`${id}-cabin`}>4. Kabin tipi</Label><select id={`${id}-cabin`} className={selectClass} aria-describedby={`${id}-cabin-hint`} disabled={inputDisabled || !selection.series} value={selection.cabinType ?? ''} onChange={(event) => change('cabinType', event.target.value)}><option value="">Kabin seçin</option><option value="open">Açık</option><option value="closed">Kapalı</option></select><p id={`${id}-cabin-hint`} className="text-xs text-slate-500">{isTube ? 'Kesim bölgesi koruması; boru besleme alanını kapsamaz.' : selection.series === 'F' ? 'Katalog: açık kabin, tek tabla.' : selection.series === 'PG' ? 'Katalog: kapalı kabin, değişimli çift tabla.' : 'Seriyi seçtikten sonra kabin tipini belirleyin.'}</p></div>
        <div className="space-y-1.5"><Label htmlFor={`${id}-power`}>5. Rezonatör gücü</Label><select id={`${id}-power`} className={selectClass} disabled={inputDisabled || !selection.cabinType} value={selection.powerKw ?? ''} onChange={(event) => change('powerKw', event.target.value)}><option value="">Güç seçin</option>{[3, 6, 12, 20, 30].map((power) => <option key={power} value={power}>{power} kW</option>)}</select></div>
        <div className="space-y-1.5"><Label htmlFor={`${id}-model`}>6. {isTube ? 'Model ve boru kapasitesi' : 'Tabla ölçüsü'}</Label><select id={`${id}-model`} className={selectClass} disabled={inputDisabled || !selection.powerKw || loadingOptions || !options} value={selection.sourceModelCode ?? ''} onChange={(event) => change('sourceModelCode', event.target.value)}><option value="">{loadingOptions ? 'Modeller yükleniyor…' : isTube ? 'Model ve kapasite seçin' : 'Model ve tabla seçin'}</option>{models.map((model) => <option key={model.code} value={model.code}>{model.code} — {model.sizeLabel}</option>)}{configuration && !models.some((model) => model.code === configuration.selection.sourceModelCode) && <option value={configuration.selection.sourceModelCode}>{configuration.modelLabel} — {configuration.sizeLabel}</option>}</select></div>
      </div>

      {(!divisionId || !brandId) && <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Lazer teknik bilgileri için Sac İşleme bölümünü ve AORE markasını seçin.</p>}
      {(optionsError || resolveError) && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"><span>{optionsError || resolveError}</span><Button type="button" variant="outline" size="sm" onClick={() => setRetry((attempt) => attempt + 1)}>Tekrar dene</Button></div>}
      <div aria-live="polite" aria-atomic="true" className="text-sm text-slate-600">
        {loading ? <span className="flex items-center gap-2"><Loader2 className="size-4 animate-spin" />Seçilen makinenin teknik bilgileri yükleniyor…</span> : configuration ? <span>{sourceCount} kaynak değeri · {manualCount} elle düzenlenen · {missingCount} eksik alan{restoredDraft ? ' · Bu kombinasyonun taslağı geri yüklendi.' : ''}</span> : 'Seri, kabin, güç ve ölçü seçimlerini tamamlayın.'}
      </div>
      {storageError && <p role="alert" className="text-sm text-amber-800">Tarayıcı taslağı saklayamıyor. Seçimi değiştirmeden düzenlemelerinizi kaydedin.</p>}

      {configuration && <>
        {(!configuration.supportedPower || !configuration.standardCabin) && <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><AlertCircle className="mt-0.5 size-4 shrink-0" /><div>{!configuration.supportedPower && <p>Seçilen güç için kaynak doğrulaması eksik. Boş alanları elle tamamlayıp kaydedebilirsiniz.</p>}{!configuration.standardCabin && <p>Bu kabin katalogdaki standart yapıdan farklı. Kabine bağlı kaynaksız değerler boş bırakıldı.</p>}</div></div>}
        {configuration.issues.length > 0 && <details className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600"><summary className="cursor-pointer font-medium text-slate-800">Kaynak notları ve eksikler ({configuration.issues.length})</summary><ul className="mt-2 space-y-1 pl-4">{configuration.issues.map((issue, index) => <li key={`${issue.code}-${index}`} className="list-disc">{issue.field ? `${issue.field}: ` : ''}{issue.message}</li>)}</ul></details>}
        <div className="max-h-[38rem] overflow-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[660px] border-collapse text-sm">
            <caption className="sr-only">{configuration.modelLabel} için teknik değerler ve kaynakları</caption>
            <thead className="sticky top-0 z-10 bg-slate-100 text-left text-xs text-slate-700"><tr><th scope="col" className="px-3 py-3">Teknik bilgi</th><th scope="col" className="px-3 py-3">Değer</th><th scope="col" className="px-3 py-3">Birim</th><th scope="col" className="px-3 py-3">Kaynak / düzenleme</th></tr></thead>
            <tbody>{configuration.specs.map((spec, index) => <tr key={`${spec.key}-${index}`} className="border-t border-slate-100 align-top">
              <th scope="row" className="min-w-44 px-3 py-3 text-left font-medium text-slate-800"><label htmlFor={`${id}-spec-${index}`}>{spec.key}</label></th>
              <td className="min-w-44 px-3 py-2"><Input id={`${id}-spec-${index}`} value={spec.value} disabled={disabled || loading} readOnly={spec.key === 'Lazer Gücü'} title={spec.key === 'Lazer Gücü' ? 'Üstteki rezonatör gücü seçimiyle belirlenir.' : undefined} maxLength={2000} placeholder="Elle tamamlayın" onChange={(event) => updateSpec(index, event.target.value)} className={!spec.value.trim() ? 'border-amber-300 bg-amber-50/50' : ''} /></td>
              <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-500">{spec.unit || '—'}</td>
              <td className="max-w-80 px-3 py-2 text-xs text-slate-500">
                {spec.isManual && <div className="mb-1 flex items-center gap-2"><Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-800">Elle düzenlendi</Badge><button type="button" disabled={disabled} className="rounded p-1 text-slate-600 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500" aria-label={`${spec.key} kaynak değerine dön`} title="Kaynak değerine dön" onClick={() => updateSpec(index, spec.sourceValue ?? '', true)}><RotateCcw className="size-3.5" /></button></div>}
                {spec.isManual && <p className="mb-1 break-words">Kaynak değeri: {spec.sourceValue || 'Belirtilmemiş'}</p>}
                {spec.source ? <div className="flex items-start gap-1.5"><FileSpreadsheet className="mt-0.5 size-3.5 shrink-0" /><span className="break-words">{spec.source.document}{spec.source.sheet ? ` · ${spec.source.sheet}` : ''}{spec.source.cell ? ` · ${spec.source.cell}` : ''}{spec.source.page ? ` · s. ${spec.source.page}` : ''}</span></div> : <span>Kaynakta belirtilmemiş</span>}
              </td>
            </tr>)}</tbody>
          </table>
        </div>
      </>}
    </section>
  );
}
