import { useEffect, useRef, useState } from 'react';
import type { LaserTechnicalConfiguration } from '@haksan/shared';
import { FileSpreadsheet, Save, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../../../lib/auth';
import { productService } from '../../../../lib/services';
import { laserProfilesService, type LaserImportPreview, type LaserProfileScope } from '../../../../lib/services/laser-profiles.service';
import { LaserConfigurationEditor } from '../../technical/LaserConfigurationEditor';
import { laserDraftKey } from '../../technical/laser-editor-state';
import { Button } from '../../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../ui/dialog';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';

type Brand = { id: string; name: string; code?: string; isActive?: boolean };
const errorMessage = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;

export function LaserProfilesPanel({ divisionId }: { divisionId?: string }) {
  const { user, hasRole } = useAuth();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [brandId, setBrandId] = useState('');
  const [loadingBrands, setLoadingBrands] = useState(false);
  const [brandError, setBrandError] = useState('');
  const [configuration, setConfiguration] = useState<LaserTechnicalConfiguration | null>(null);
  const [saving, setSaving] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const canEdit = hasRole('super_admin');

  useEffect(() => {
    let cancelled = false;
    if (!divisionId) return;
    setLoadingBrands(true);
    setBrandError('');
    void productService.listBrands(divisionId)
      .then((rows: Brand[]) => {
        if (cancelled) return;
        const aore = rows.filter((brand) => brand.isActive !== false && /\baore\b/i.test(`${brand.code ?? ''} ${brand.name}`));
        setBrands(aore);
        setBrandId(aore[0]?.id ?? '');
      })
      .catch((error: unknown) => { if (!cancelled) setBrandError(errorMessage(error, 'AORE markası yüklenemedi.')); })
      .finally(() => { if (!cancelled) setLoadingBrands(false); });
    return () => { cancelled = true; };
  }, [divisionId]);

  const save = async () => {
    if (!configuration || !divisionId || !brandId) return;
    setSaving(true);
    try {
      const saved = await laserProfilesService.save({ divisionId, brandId }, configuration.selection, configuration.specs);
      setConfiguration(saved);
      try { localStorage.removeItem(laserDraftKey({ tenantId: user?.tenantId ?? '', divisionId, brandId, draftScope: 'settings' }, saved.selection)); } catch { /* Browser storage may be unavailable. */ }
      toast.success('Lazer teknik profili kaydedildi', { description: `${saved.modelLabel} · ${saved.selection.powerKw} kW · ${saved.selection.cabinType === 'open' ? 'Açık' : 'Kapalı'} kabin` });
    } catch (error: unknown) { toast.error('Profil kaydedilemedi', { description: errorMessage(error, 'Teknik profil kaydı başarısız oldu.') }); }
    finally { setSaving(false); }
  };

  const reloadSelected = async () => {
    if (!configuration || !divisionId || !brandId) return;
    try {
      const resolved = await laserProfilesService.resolve({ divisionId, brandId }, configuration.selection);
      setConfiguration(resolved);
    } catch (error: unknown) { toast.error('Seçili profil yenilenemedi', { description: errorMessage(error, 'Profili yeniden seçerek güncel bilgileri yükleyin.') }); }
  };

  return (
    <div className="space-y-5 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl"><h2 className="text-base font-semibold text-slate-900">AORE lazer teknik profilleri</h2><p className="mt-1 text-sm text-slate-600">Seri, kabin, güç ve ölçü seçimine ait değerleri düzenleyin. Kaydedilen profil, aynı seçimlerle açılan ürün kartına uygulanır.</p></div>
        <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" disabled={!divisionId || !brandId || saving || !canEdit} onClick={() => setImportOpen(true)}><Upload className="mr-1.5 size-4" />Excel'den profil aktar</Button><Button type="button" size="sm" disabled={!configuration || !divisionId || !brandId || saving || !canEdit} onClick={() => void save()}><Save className="mr-1.5 size-4" />{saving ? 'Kaydediliyor…' : 'Profili kaydet'}</Button></div>
      </div>
      <div className="max-w-sm space-y-1.5"><Label htmlFor="laser-profile-brand">Marka</Label><select id="laser-profile-brand" className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:bg-slate-100" value={brandId} disabled={loadingBrands || saving || !brands.length} onChange={(event) => { setBrandId(event.target.value); setConfiguration(null); }}><option value="">{loadingBrands ? 'Marka yükleniyor…' : 'AORE markasını seçin'}</option>{brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></div>
      {brandError && <p role="alert" className="text-sm text-red-700">{brandError}</p>}
      {!loadingBrands && !brandError && divisionId && !brands.length && <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Bu bölümde aktif AORE markası bulunamadı. CRM Alan Ayarları → Markalar bölümünden mevcut markanın Sac İşleme kapsamını kontrol edin.</p>}
      <LaserConfigurationEditor key={`editor-${divisionId}-${brandId}`} divisionId={divisionId} brandId={brandId || undefined} value={configuration} onChange={setConfiguration} draftScope="settings" disabled={saving || !canEdit} />
      {divisionId && brandId && <LaserProfileImportDialog key={`import-${divisionId}-${brandId}`} open={importOpen} onOpenChange={setImportOpen} scope={{ divisionId, brandId }} onImported={reloadSelected} />}
    </div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? '').split(',')[1] ?? '');
    reader.onerror = () => reject(new Error('Dosya okunamadı.'));
    reader.readAsDataURL(file);
  });
}

function LaserProfileImportDialog({ open, onOpenChange, scope, onImported }: { open: boolean; onOpenChange: (open: boolean) => void; scope: LaserProfileScope; onImported: () => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<LaserImportPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  const selectFile = (selected?: File) => {
    request.current?.abort();
    setPreview(null);
    setSelectedIndex(0);
    setError('');
    setFile(null);
    if (!selected) return;
    if (!/\.xlsx$/i.test(selected.name)) { setError('AORE çok sütunlu aktarımı için XLSX dosyası seçin.'); return; }
    if (selected.size > 10 * 1024 * 1024) { setError('Dosya boyutu en fazla 10 MB olabilir.'); return; }
    setFile(selected);
  };

  const makePreview = async () => {
    if (!file) return;
    const controller = new AbortController();
    request.current?.abort();
    request.current = controller;
    setPreviewing(true);
    setError('');
    try {
      const fileBase64 = await fileToBase64(file);
      if (controller.signal.aborted) return;
      const result = await laserProfilesService.previewImport(scope, { fileName: file.name, fileBase64, mimeType: file.type || undefined }, controller.signal);
      if (!controller.signal.aborted) { setPreview(result); setSelectedIndex(0); }
    } catch (reason: unknown) { if (!controller.signal.aborted) setError(errorMessage(reason, 'Dosya incelenemedi.')); }
    finally { if (!controller.signal.aborted) setPreviewing(false); }
  };

  const commit = async () => {
    if (!preview) return;
    setCommitting(true);
    setError('');
    try {
      const result = await laserProfilesService.commitImport(scope, preview);
      toast.success('Lazer profilleri aktarıldı', { description: `${result.created} yeni, ${result.updated} güncellenen profil. Elle düzenlenen değerler korundu.` });
      setPreview(null);
      setFile(null);
      onOpenChange(false);
      await onImported();
    } catch (reason: unknown) { setError(errorMessage(reason, 'Aktarım tamamlanamadı. Önizleme süresi dolduysa dosyayı yeniden inceleyin.')); }
    finally { setCommitting(false); }
  };

  const selected = preview?.laserProfiles[selectedIndex];
  const changeOpen = (next: boolean) => {
    if (committing) return;
    if (!next) { request.current?.abort(); setPreviewing(false); setPreview(null); setFile(null); setError(''); }
    onOpenChange(next);
  };
  return <Dialog open={open} onOpenChange={changeOpen}><DialogContent className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-5xl"><DialogHeader><DialogTitle>Lazer profillerini Excel'den aktar</DialogTitle><DialogDescription>Standart Yapılandırma, F, PG ve TG sayfaları birlikte okunur. Her model, kabin ve güç için teknik değerleri kaydetmeden önce inceleyin.</DialogDescription></DialogHeader>
    <div className="min-h-0 space-y-4 overflow-y-auto pr-1">
      <div className="flex flex-wrap items-end gap-3"><div className="min-w-0 flex-1 space-y-1.5"><Label htmlFor="laser-import-file">AORE teknik parametre dosyası (.xlsx)</Label><Input id="laser-import-file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={previewing || committing} onChange={(event) => selectFile(event.target.files?.[0])} /></div><Button type="button" variant="outline" disabled={!file || previewing || committing} onClick={() => void makePreview()}><FileSpreadsheet className="mr-1.5 size-4" />{previewing ? 'İnceleniyor…' : 'Önizlemeyi oluştur'}</Button></div>
      {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {preview && <>
        <p role="status" className="text-sm text-slate-600">{preview.laserProfiles.length} profil hazır. Aynı kayıtlar güncellenir, elle düzenlenen değerler korunur. Önizleme 15 dakika geçerlidir.</p>
        {preview.issues.length > 0 && <ul className="space-y-1 rounded-md bg-amber-50 p-3 text-xs text-amber-900">{preview.issues.map((issue, index) => <li key={index}>{issue.message}</li>)}</ul>}
        <div className="max-h-60 overflow-auto rounded-md border border-slate-200"><table className="w-full min-w-[700px] text-left text-xs"><caption className="sr-only">İçe aktarılacak lazer profilleri</caption><thead className="sticky top-0 bg-slate-100"><tr>{['Model', 'Kabin', 'Güç', 'Ölçü / kapasite', 'Dolu', 'Eksik', 'Kaynak notları', 'İncele'].map((title) => <th key={title} scope="col" className="px-3 py-2">{title}</th>)}</tr></thead><tbody>{preview.laserProfiles.map((profile, index) => <tr key={`${profile.selection.sourceModelCode}-${profile.selection.cabinType}-${profile.selection.powerKw}`} className={`border-t border-slate-100 ${selectedIndex === index ? 'bg-blue-50' : ''}`}><th scope="row" className="px-3 py-2 font-medium">{profile.modelLabel}</th><td className="px-3 py-2">{profile.selection.cabinType === 'open' ? 'Açık' : 'Kapalı'}</td><td className="whitespace-nowrap px-3 py-2">{profile.selection.powerKw} kW</td><td className="max-w-64 px-3 py-2">{profile.sizeLabel}</td><td className="px-3 py-2">{profile.specs.filter((spec) => spec.value.trim()).length}</td><td className="px-3 py-2">{profile.specs.filter((spec) => !spec.value.trim()).length}</td><td className="px-3 py-2">{profile.issues.length}</td><td className="px-3 py-2"><button type="button" className="rounded px-2 py-1 text-blue-700 underline focus-visible:outline focus-visible:outline-2" aria-label={`${profile.modelLabel} ${profile.selection.cabinType === 'open' ? 'açık' : 'kapalı'} ${profile.selection.powerKw} kW profilini incele`} onClick={() => setSelectedIndex(index)}>İncele</button></td></tr>)}</tbody></table></div>
        {selected && <div className="space-y-2"><h3 className="text-sm font-semibold">{selected.modelLabel} · {selected.selection.cabinType === 'open' ? 'Açık' : 'Kapalı'} · {selected.selection.powerKw} kW</h3>{selected.issues.length > 0 && <ul className="space-y-1 text-xs text-amber-800">{selected.issues.map((issue, index) => <li key={index}>{issue.message}</li>)}</ul>}<div className="max-h-64 overflow-auto rounded-md border border-slate-200"><table className="w-full min-w-[600px] text-left text-xs"><thead className="sticky top-0 bg-slate-100"><tr><th scope="col" className="px-3 py-2">Alan</th><th scope="col" className="px-3 py-2">Değer</th><th scope="col" className="px-3 py-2">Kaynak</th></tr></thead><tbody>{selected.specs.map((spec) => <tr key={spec.key} className="border-t border-slate-100"><th scope="row" className="px-3 py-2 font-medium">{spec.key}</th><td className="px-3 py-2">{spec.value || 'Eksik'} {spec.value ? spec.unit : ''}</td><td className="px-3 py-2">{spec.source ? `${spec.source.document} · ${spec.source.sheet ?? ''} ${spec.source.cell ?? ''}${spec.source.page ? ` s. ${spec.source.page}` : ''}` : 'Kaynakta belirtilmemiş'}</td></tr>)}</tbody></table></div></div>}
      </>}
    </div>
    <div className="flex justify-end gap-2 border-t pt-3"><Button type="button" variant="outline" disabled={committing} onClick={() => changeOpen(false)}>Kapat</Button><Button type="button" disabled={!preview?.laserProfiles.length || previewing || committing} onClick={() => void commit()}>{committing ? 'Aktarılıyor…' : `${preview?.laserProfiles.length ?? 0} profili kaydet`}</Button></div>
  </DialogContent></Dialog>;
}
