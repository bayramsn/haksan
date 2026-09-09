import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { adminService } from '../../../../lib/services';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../ui/dialog';
import { DIVISION_SCOPED_LOOKUPS, LOOKUP_PARENTS, SPEC_GROUP_LOOKUP } from './lookup-meta';
import { parseLookupCsv, previewLookupCsv, type LookupCsvDraft, type LookupImportContext } from './lookup-import';

type Props = {
  open: boolean; onOpenChange: (open: boolean) => void; lookupName: string; title: string; divisionId: string;
  divisions: Array<{ id: string; code: string; name: string }>; defaultParentId?: string;
  onImported: () => Promise<void> | void;
};
export function LookupImportDialog({ open, onOpenChange, lookupName, title, divisionId, divisions, defaultParentId, onImported }: Props) {
  const [drafts, setDrafts] = useState<LookupCsvDraft[]>([]);
  const [context, setContext] = useState<LookupImportContext | null>(null);
  const [error, setError] = useState('');
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const parent = LOOKUP_PARENTS[lookupName];
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setDrafts([]); setContext(null); setError(''); setRowErrors({}); setLoading(true);
    const params = { divisionId };
    void Promise.all([
      adminService.lookupRows(lookupName, params),
      parent ? adminService.lookupRows(parent.lookup, params) : Promise.resolve([]),
      lookupName === SPEC_GROUP_LOOKUP ? adminService.lookupRows('product-types', params) : Promise.resolve([]),
    ]).then(([existing, parents, productTypes]) => {
      if (!cancelled) setContext({ divisionId, divisions, scoped: DIVISION_SCOPED_LOOKUPS.has(lookupName), existing, parents, productTypes, parentField: parent?.field, defaultParentId, isSpecGroup: lookupName === SPEC_GROUP_LOOKUP });
    }).catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Mevcut kayıtlar yüklenemedi.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, lookupName, divisionId]); // eslint-disable-line react-hooks/exhaustive-deps
  const preview = useMemo(() => context ? previewLookupCsv(drafts, context) : [], [drafts, context]);
  const ready = preview.filter((row) => row.action !== 'skip' && !row.errors.length);
  const invalid = preview.filter((row) => row.action !== 'skip' && row.errors.length);
  const update = (rowNumber: number, patch: Partial<LookupCsvDraft>) => {
    setDrafts((rows) => rows.map((row) => row.row === rowNumber ? { ...row, ...patch } : row));
    setRowErrors((current) => { const next = { ...current }; delete next[rowNumber]; return next; });
  };
  const selectFile = async (file?: File) => {
    setError(''); setDrafts([]); setRowErrors({});
    if (!file) return;
    if (!/\.csv$/i.test(file.name) || file.size > 5 * 1024 * 1024) { setError('En fazla 5 MB boyutunda CSV dosyası seçin.'); return; }
    try { setDrafts(parseLookupCsv(await file.text())); }
    catch (reason: unknown) { setError(reason instanceof Error ? reason.message : 'Dosya okunamadı.'); }
  };
  const commit = async () => {
    if (!context || !ready.length || invalid.length) return;
    setSaving(true); setRowErrors({});
    const succeeded = new Set<number>(); const failures: Record<number, string> = {};
    let created = 0, updated = 0;
    for (const row of ready) {
      try {
        if (row.action === 'update' && row.existingId) { await adminService.updateLookup(lookupName, row.existingId, row.body); updated++; }
        else { await adminService.createLookup(lookupName, row.body); created++; }
        succeeded.add(row.draft.row);
      } catch (reason: unknown) { failures[row.draft.row] = reason instanceof Error ? reason.message : 'Kayıt başarısız oldu.'; }
    }
    setDrafts((rows) => rows.map((row) => succeeded.has(row.row) ? { ...row, skip: true } : row));
    setRowErrors(failures); setSaving(false);
    try { await onImported(); } catch { toast.error("Liste yenilenemedi; kayıt sonuçları aşağıda korunuyor."); }
    if (Object.keys(failures).length) setError(`${created} yeni, ${updated} güncellenen kayıt. Hatalı satırları düzeltip yeniden deneyin; başarılı satırlar tekrar işlenmez.`);
    else { toast.success('Alan listesi aktarıldı', { description: `${created} yeni kayıt, ${updated} güncelleme.` }); onOpenChange(false); }
  };
  const downloadTemplate = () => {
    const headers = ['Ad', 'Sistem Kodu', 'Açıklama', 'Durum', 'Sıra', 'Bölüm', ...(parent ? [`Bağlı Olduğu ${parent.label}`] : []), ...(lookupName === SPEC_GROUP_LOOKUP ? ['Ürün Tipleri'] : [])];
    const url = URL.createObjectURL(new Blob(['\uFEFF' + headers.join(';') + '\n'], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `${lookupName}-${divisions.find((item) => item.id === divisionId)?.code ?? 'ortak'}-sablon.csv`; link.click(); URL.revokeObjectURL(url);
  };
  return <Dialog open={open} onOpenChange={(next) => { if (!saving) onOpenChange(next); }}><DialogContent className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-6xl"><DialogHeader><DialogTitle>{title} — İçe aktar</DialogTitle><DialogDescription>{divisions.find((division) => division.id === divisionId)?.name ?? 'Ortak alanlar'} kapsamına aktarılır. Sistem kodu veya ad eşleşirse mevcut kayıt güncellenir. Satırları kaydetmeden önce düzenleyebilirsiniz.</DialogDescription></DialogHeader>
    <div className="min-h-0 space-y-3 overflow-auto"><div className="flex flex-wrap items-end gap-3"><div className="min-w-0 flex-1 space-y-1"><Label htmlFor="lookup-import-csv">CSV dosyası</Label><Input id="lookup-import-csv" type="file" accept=".csv,text/csv" disabled={loading || saving} onChange={(event) => void selectFile(event.target.files?.[0])} /></div><Button type="button" variant="outline" onClick={downloadTemplate}>Şablon indir</Button></div>
      {loading && <p role="status" className="text-sm text-muted-foreground">Mevcut kayıtlar ve ilişkiler yükleniyor…</p>}
      {error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {preview.length > 0 && <><p role="status" className="text-sm text-muted-foreground">{ready.filter((row) => row.action === 'create').length} yeni · {ready.filter((row) => row.action === 'update').length} güncelleme · {invalid.length} hatalı · {preview.filter((row) => row.action === 'skip').length} atlanacak</p>
        <div className="overflow-auto rounded-md border"><table className="w-full min-w-[900px] text-left text-xs"><thead className="bg-muted"><tr>{['Satır', 'İşlem', 'Ad', 'Sistem kodu', 'Bölüm', ...(parent ? [parent.label] : []), ...(context?.isSpecGroup ? ['Ürün tipleri'] : []), 'Sonuç'].map((label) => <th key={label} scope="col" className="p-2">{label}</th>)}</tr></thead><tbody>{preview.map((row) => <tr key={row.draft.row} className="border-t align-top"><td className="p-2">{row.draft.row}</td><td className="p-2"><select aria-label={`${row.draft.row}. satır işlem`} className="rounded border bg-background p-2" value={row.draft.skip ? 'skip' : 'include'} disabled={saving} onChange={(event) => update(row.draft.row, { skip: event.target.value === 'skip' })}><option value="include">{row.existingId ? 'Güncelle' : 'Yeni kayıt'}</option><option value="skip">Atla</option></select></td>
          <td className="p-2"><Input aria-label={`${row.draft.row}. satır ad`} value={row.draft.name} disabled={saving} onChange={(event) => update(row.draft.row, { name: event.target.value })} /></td><td className="p-2"><Input aria-label={`${row.draft.row}. satır kod`} value={row.draft.code} disabled={saving} onChange={(event) => update(row.draft.row, { code: event.target.value })} /></td><td className="p-2"><Input aria-label={`${row.draft.row}. satır bölüm`} value={row.draft.division} placeholder={divisions.find((division) => division.id === divisionId)?.name} disabled={saving} onChange={(event) => update(row.draft.row, { division: event.target.value })} /></td>
          {parent && <td className="p-2"><Input aria-label={`${row.draft.row}. satır üst kayıt`} value={row.draft.parent ?? ''} placeholder="Ad veya sistem kodu" disabled={saving} onChange={(event) => update(row.draft.row, { parent: event.target.value })} /></td>}{context?.isSpecGroup && <td className="p-2"><Input aria-label={`${row.draft.row}. satır ürün tipleri`} value={row.draft.types ?? ''} placeholder="Virgülle ayırın" disabled={saving} onChange={(event) => update(row.draft.row, { types: event.target.value })} /></td>}
          <td className="max-w-64 p-2 text-red-700">{[...row.errors, rowErrors[row.draft.row]].filter(Boolean).join(' ') || <span className="text-green-700">{row.action === 'skip' ? 'Atlanacak' : 'Hazır'}</span>}</td></tr>)}</tbody></table></div></>}
    </div><DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>Vazgeç</Button><Button type="button" disabled={saving || loading || !ready.length || invalid.length > 0} onClick={() => void commit()}>{saving ? 'Kaydediliyor…' : `${ready.length} kaydı uygula`}</Button></DialogFooter>
  </DialogContent></Dialog>;
}
