import { useEffect, useRef, useState } from 'react';
import { BookOpen, Download, Loader2, Search, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { MAIL_MAX_ATTACHMENT_BYTES } from '@haksan/shared';
import { useAuth } from '../../../lib/auth';
import { fileService } from '../../../lib/services';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';

export type CatalogAttachment = { fileId: string; name: string; size: number };
type CatalogRow = { file: { id: string; originalFilename: string; sizeBytes: number; uploaderName?: string | null } };

/** Tenant-wide library; files keep their own normal upload/access/magic-byte checks. */
export function CatalogLibraryDialog({ open, onOpenChange, onSelect }: {
  open: boolean; onOpenChange: (open: boolean) => void; onSelect: (file: CatalogAttachment) => void;
}) {
  const { user, hasPermission, hasRole } = useAuth();
  const [rows, setRows] = useState<CatalogRow[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const canUpload = hasPermission('files.create') && (hasPermission('products.update') || hasRole('super_admin'));
  const load = async () => {
    if (!user) return;
    setLoading(true); setError(false);
    try {
      const all: CatalogRow[] = [];
      for (let page = 1; ; page++) {
        const result = await fileService.links({ entityType: 'catalog', entityId: user.tenantId, page, pageSize: 100 });
        all.push(...result.data);
        if (page >= result.meta.totalPages || !result.data.length) break;
      }
      setRows(all);
    } catch (e: any) { setRows([]); setError(true); toast.error('Kataloglar yüklenemedi', { description: e?.message }); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (open) { setQ(''); void load(); } }, [open, user?.tenantId]);
  const upload = async (file?: File) => {
    if (!file || !user) return;
    if (!/\.pdf$/i.test(file.name) || (file.type && file.type !== 'application/pdf') || !file.size || file.size > MAIL_MAX_ATTACHMENT_BYTES) {
      toast.error('Katalog PDF olmalı ve 15 MB sınırını aşmamalıdır'); return;
    }
    setBusy(true);
    try {
      const uploaded = await fileService.signedUpload({ bucket: 'erp-quote-documents', entityType: 'catalog', entityId: user.tenantId, filename: file.name, mimeType: 'application/pdf', extension: 'pdf', sizeBytes: file.size });
      await fileService.uploadBinary(uploaded, file, 'application/pdf');
      await fileService.link({ fileId: uploaded.fileId, entityType: 'catalog', entityId: user.tenantId, documentTypeCode: 'other' });
      toast.success('Katalog kütüphaneye eklendi'); await load();
    } catch (e: any) { toast.error('Katalog yüklenemedi', { description: e?.message }); }
    finally { setBusy(false); }
  };
  const download = async (id: string) => {
    try { const link = await fileService.signedDownload(id); window.open(link.downloadUrl, '_blank', 'noopener,noreferrer'); }
    catch (e: any) { toast.error('Katalog açılamadı', { description: e?.message }); }
  };
  const visible = rows.filter(row => row.file.originalFilename.toLocaleLowerCase('tr-TR').includes(q.toLocaleLowerCase('tr-TR')));
  return <Dialog open={open} onOpenChange={value => !busy && onOpenChange(value)}>
    <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
      <DialogHeader><DialogTitle className="flex items-center gap-2"><BookOpen className="size-4" />Genel Kataloglar</DialogTitle>
        <DialogDescription>Kataloğu bir kez yükleyin; mail gönderirken kütüphaneden seçin. PDF, en fazla 15 MB.</DialogDescription></DialogHeader>
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input aria-label="Katalog ara" placeholder="Katalog adı ara..." value={q} onChange={e => setQ(e.target.value)} className="pl-9" /></div>
        {canUpload && <><input ref={input} type="file" accept=".pdf,application/pdf" className="sr-only" aria-label="Katalog PDF yükle" onChange={e => { void upload(e.target.files?.[0]); e.target.value = ''; }} /><Button variant="outline" disabled={busy} onClick={() => input.current?.click()}>{busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Upload className="mr-2 size-4" />}Katalog Yükle</Button></>}
      </div>
      {loading ? <p className="text-sm text-muted-foreground">Kataloglar yükleniyor…</p> : error ? <Button variant="outline" onClick={() => void load()}>Yeniden dene</Button> : <div className="space-y-2">{visible.map(({ file }) => <div key={file.id} className="flex items-center gap-2 rounded-lg border p-3">
        <div className="min-w-0 flex-1"><p className="break-words text-sm font-medium">{file.originalFilename}</p><p className="text-xs text-muted-foreground">{(file.sizeBytes / 1048576).toFixed(1)} MB{file.uploaderName ? ` · ${file.uploaderName}` : ''}</p></div>
        <Button variant="ghost" size="icon" title="Kataloğu aç" aria-label={`${file.originalFilename} aç`} onClick={() => void download(file.id)}><Download className="size-4" /></Button>
        <Button size="sm" disabled={busy} onClick={() => { onSelect({ fileId: file.id, name: file.originalFilename, size: file.sizeBytes }); onOpenChange(false); }}>Mail Ekine Ekle</Button>
      </div>)}{!visible.length && <p className="py-6 text-center text-sm text-muted-foreground">{q ? 'Aramaya uygun katalog yok.' : 'Henüz katalog yüklenmemiş.'}</p>}</div>}
    </DialogContent>
  </Dialog>;
}
