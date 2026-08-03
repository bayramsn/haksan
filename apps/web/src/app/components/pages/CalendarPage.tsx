import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { ArchiveRestore, ChevronLeft, ChevronRight, Clock3, Download, MapPin, Plus, RefreshCw, Smartphone, Trash2, Upload, Users } from 'lucide-react';
import { toast } from 'sonner';
import { calendarService, companyService, type CalendarEventDTO, type CalendarEventInput, type CalendarEventType, type CalendarImportEvent, type CalendarImportEventType, type CalendarImportPreview, type CompanyDTO } from '../../../lib/services';
import { useAuth } from '../../../lib/auth';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { BrandIllustration } from '../brand';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Textarea } from '../ui/textarea';

type CalendarView = 'month' | 'week' | 'day' | 'list';
const VIEW_LABELS: Record<CalendarView, string> = { month: 'Ay', week: 'Hafta', day: 'Gün', list: 'Liste' };
const TYPE_LABELS: Record<CalendarEventType, string> = { customer_visit: 'Müşteri ziyareti', meeting: 'Toplantı', call: 'Arama', task: 'Görev', other: 'Diğer' };
const TYPE_STYLES: Record<CalendarEventType, string> = {
  customer_visit: 'border-success/40 bg-success-soft text-success',
  meeting: 'border-info/40 bg-info-soft text-info',
  call: 'border-warning/40 bg-warning-soft text-warning',
  task: 'border-brand-red/40 bg-brand-red-soft text-brand-red',
  other: 'border-border bg-muted text-foreground/80',
};

function startOfWeek(date: Date) {
  const result = new Date(date);
  const day = result.getDay() || 7;
  result.setDate(result.getDate() - day + 1);
  result.setHours(0, 0, 0, 0);
  return result;
}
function addDays(date: Date, days: number) { const result = new Date(date); result.setDate(result.getDate() + days); return result; }
function addMonths(date: Date, months: number) { const result = new Date(date); result.setMonth(result.getMonth() + months); return result; }
function endOfDay(date: Date) { const result = new Date(date); result.setHours(23, 59, 59, 999); return result; }
function dateKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function toLocalInput(value: Date) { return new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); }
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => { const result = String(reader.result ?? ''); resolve(result.includes(',') ? result.split(',').pop() ?? '' : result); };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
const IMPORT_TYPE_LABELS: Record<CalendarImportEventType, string> = { other: 'Diğer', meeting: 'Toplantı', call: 'Arama', task: 'Görev' };

function emptyDraft(date = new Date()): CalendarEventInput {
  const start = new Date(date);
  start.setMinutes(Math.ceil(start.getMinutes() / 30) * 30, 0, 0);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return { eventType: 'customer_visit', title: '', description: '', location: '', startsAt: toLocalInput(start), endsAt: toLocalInput(end), allDay: false, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Istanbul', companyId: null };
}

export function CalendarPage() {
  const { hasRole, user } = useAuth();
  const isSuperAdmin = hasRole('super_admin');
  const [view, setView] = useState<CalendarView>('month');
  const [cursor, setCursor] = useState(() => new Date());
  const [events, setEvents] = useState<CalendarEventDTO[]>([]);
  const [owners, setOwners] = useState<Array<{ id: string; fullName: string; email: string }>>([]);
  const [ownerUserId, setOwnerUserId] = useState('all');
  const [companies, setCompanies] = useState<CompanyDTO[]>([]);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<CalendarEventDTO | null>(null);
  const [draft, setDraft] = useState<CalendarEventInput>(() => emptyDraft());
  const [saving, setSaving] = useState(false);
  const importFileRef = useRef<HTMLInputElement | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [importFileName, setImportFileName] = useState('');
  const [importPreview, setImportPreview] = useState<CalendarImportPreview | null>(null);
  const [importType, setImportType] = useState<CalendarImportEventType>('other');
  const [importOnlyWindow, setImportOnlyWindow] = useState(true);

  const importSelection = useMemo(
    () => (importPreview ? importPreview.events.filter((event) => !importOnlyWindow || event.inWindow) : []),
    [importPreview, importOnlyWindow]
  );

  const range = useMemo(() => {
    if (view === 'day') return { from: new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate()), to: endOfDay(cursor) };
    if (view === 'week') { const from = startOfWeek(cursor); return { from, to: endOfDay(addDays(from, 6)) }; }
    if (view === 'list') return { from: new Date(cursor.getFullYear(), cursor.getMonth() - 6, cursor.getDate()), to: endOfDay(new Date(cursor.getFullYear(), cursor.getMonth() + 6, cursor.getDate())) };
    const from = startOfWeek(new Date(cursor.getFullYear(), cursor.getMonth(), 1));
    return { from, to: endOfDay(addDays(from, 41)) };
  }, [cursor, view]);

  const load = async () => {
    setLoading(true);
    try {
      setEvents(await calendarService.events({ from: range.from.toISOString(), to: range.to.toISOString(), ownerUserId: ownerUserId === 'all' ? undefined : ownerUserId, includeArchived }));
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Takvim yüklenemedi'); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [range.from.getTime(), range.to.getTime(), ownerUserId, includeArchived]);
  useEffect(() => {
    companyService.list({ pageSize: 200 }).then((result) => setCompanies(result.data)).catch(() => setCompanies([]));
    if (isSuperAdmin) calendarService.owners().then(setOwners).catch(() => setOwners([]));
  }, [isSuperAdmin]);

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEventDTO[]>();
    for (const event of events) { const key = dateKey(new Date(event.startsAt)); map.set(key, [...(map.get(key) ?? []), event]); }
    return map;
  }, [events]);

  const openCreate = (date?: Date) => { setEditing(null); setDraft(emptyDraft(date)); setEditorOpen(true); };
  const openEdit = (event: CalendarEventDTO) => {
    if (event.ownerUserId !== user?.id) return;
    setEditing(event);
    setDraft({ eventType: event.eventType, title: event.title, description: event.description ?? '', location: event.location ?? '', startsAt: toLocalInput(new Date(event.startsAt)), endsAt: toLocalInput(new Date(event.endsAt)), allDay: event.allDay, timezone: event.timezone, companyId: event.companyId });
    setEditorOpen(true);
  };

  const save = async (formEvent: FormEvent) => {
    formEvent.preventDefault();
    if (draft.eventType === 'customer_visit' && !draft.companyId) { toast.error('Müşteri ziyareti için firma seçin'); return; }
    setSaving(true);
    try {
      const payload = { ...draft, startsAt: new Date(draft.startsAt).toISOString(), endsAt: new Date(draft.endsAt).toISOString() };
      if (editing) await calendarService.update(editing.id, payload); else await calendarService.create(payload);
      toast.success(editing ? 'Etkinlik güncellendi' : 'Etkinlik oluşturuldu'); setEditorOpen(false); await load();
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Etkinlik kaydedilemedi'); }
    finally { setSaving(false); }
  };

  const remove = async () => {
    if (!editing) return;
    try { await calendarService.remove(editing.id); toast.success('Etkinlik arşive alındı', { description: '30 gün içinde geri alınabilir.' }); setEditorOpen(false); await load(); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Etkinlik silinemedi'); }
  };
  const restore = async () => {
    if (!editing) return;
    try { await calendarService.restore(editing.id); toast.success('Etkinlik geri alındı'); setEditorOpen(false); await load(); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Etkinlik geri alınamadı'); }
  };
  const openImport = () => { setImportPreview(null); setImportFileName(''); setImportOnlyWindow(true); setImportType('other'); if (importFileRef.current) importFileRef.current.value = ''; setImportOpen(true); };
  const onPickFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImportBusy(true);
    setImportFileName(file.name);
    try {
      const fileBase64 = await fileToBase64(file);
      const preview = await calendarService.importPreview({ fileName: file.name, fileBase64 });
      setImportPreview(preview);
      toast.success('Dosya okundu', { description: `${preview.summary.total} etkinlik · ${preview.summary.inWindow} tanesi ±6 ay içinde` });
    } catch (error) { setImportPreview(null); toast.error(error instanceof Error ? error.message : 'Dosya okunamadı'); }
    finally { setImportBusy(false); }
  };
  const commitImport = async () => {
    if (importSelection.length === 0) { toast.error('İçe aktarılacak etkinlik yok'); return; }
    setImportBusy(true);
    try {
      const result = await calendarService.importCommit({ defaultEventType: importType, events: importSelection });
      toast.success('Takvim içe aktarıldı', { description: `${result.created} yeni, ${result.updated} güncellendi` });
      setImportOpen(false); await load();
    } catch (error) { toast.error(error instanceof Error ? error.message : 'İçe aktarma başarısız'); }
    finally { setImportBusy(false); }
  };
  const move = (direction: -1 | 1) => {
    if (view === 'month') setCursor((value) => addMonths(value, direction));
    else if (view === 'week') setCursor((value) => addDays(value, direction * 7));
    else if (view === 'day') setCursor((value) => addDays(value, direction));
    else setCursor((value) => addMonths(value, direction * 6));
  };

  const periodLabel = view === 'day' ? cursor.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : view === 'week' ? `${range.from.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} — ${range.to.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })}`
    : view === 'list' ? 'Geçmiş 6 ay · Gelecek 6 ay' : cursor.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });
  const upcomingEvents = [...events]
    .filter((event) => !event.deletedAt && new Date(event.endsAt).getTime() >= Date.now())
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
    .slice(0, 8);
  const todayEventCount = events.filter((event) => dateKey(new Date(event.startsAt)) === dateKey(new Date()) && !event.deletedAt).length;

  return <div className="space-y-4">
    <section className="premium-blueprint precision-corners relative overflow-hidden rounded-xl border border-primary/10 bg-white px-4 py-4 shadow-sm">
      <div className="relative flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between"><div><div className="mb-1 font-data text-[9px] font-semibold uppercase tracking-[0.17em] text-operation-blue">Operasyon ajandası</div><h2 className="font-display text-2xl font-semibold tracking-tight">{periodLabel}</h2><p className="mt-1 text-xs text-muted-foreground">Telefon takvimleri, toplantılar ve müşteri ziyaretleri tek akışta.</p><div className="mt-3 flex flex-wrap items-center gap-2 text-[10px]"><Badge variant="outline" className="bg-white"><Clock3 className="mr-1 size-3" />Bugün {todayEventCount}</Badge><Badge variant="outline" className="bg-white">Bu görünümde {events.filter((event) => !event.deletedAt).length}</Badge><span className="text-muted-foreground">Hücreye çift tıklayarak hızlı etkinlik ekleyin</span></div></div>
        <div className="flex w-full flex-wrap items-center gap-2 xl:w-auto xl:justify-end">{isSuperAdmin && <label className="flex h-10 max-w-full items-center gap-2 rounded-lg border border-border bg-white px-3 text-xs"><Users className="size-4 shrink-0 text-primary" /><select value={ownerUserId} onChange={(event) => setOwnerUserId(event.target.value)} className="min-w-0 bg-transparent outline-none"><option value="all">Tüm kullanıcılar</option>{owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.fullName}</option>)}</select></label>}<Button variant="outline" className="min-h-10 gap-2 whitespace-nowrap" onClick={openImport}><Upload className="size-4" /> İçe aktar</Button><Button className="min-h-10 gap-2 whitespace-nowrap" onClick={() => openCreate()}><Plus className="size-4" /> Yeni etkinlik</Button></div>
      </div>
    </section>
    <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_300px]">
    <Card className="min-w-0 overflow-hidden border-border/70 shadow-sm">
      <div className="grid gap-3 border-b bg-muted/20 p-3 xl:grid-cols-[auto_minmax(0,1fr)] xl:items-center">
        <div className="flex items-center gap-1">
          <Button size="icon" variant="outline" aria-label="Önceki dönem" onClick={() => move(-1)}><ChevronLeft className="size-4" /></Button>
          <Button variant="outline" onClick={() => setCursor(new Date())}>Bugün</Button>
          <Button size="icon" variant="outline" aria-label="Sonraki dönem" onClick={() => move(1)}><ChevronRight className="size-4" /></Button>
          <Button size="icon" variant="ghost" aria-label="Takvimi yenile" onClick={load} disabled={loading}><RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} /></Button>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2 xl:justify-end">
          <div className="hidden flex-wrap items-center gap-2 border-r border-border pr-2 2xl:flex">
            {(Object.keys(TYPE_LABELS) as CalendarEventType[]).map((type) => <span key={type} className="inline-flex items-center gap-1 text-[9px] text-muted-foreground"><span className={`size-2 rounded-full border ${TYPE_STYLES[type]}`} />{TYPE_LABELS[type]}</span>)}
          </div>
          <label className="flex min-h-9 shrink-0 items-center gap-2 whitespace-nowrap text-xs text-muted-foreground">
            <Switch aria-label="Arşivlenmiş etkinlikleri göster" checked={includeArchived} onCheckedChange={setIncludeArchived} /> Arşivi göster
          </label>
          <div className="flex max-w-full overflow-x-auto rounded-lg border bg-background p-1">
            {(Object.keys(VIEW_LABELS) as CalendarView[]).map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={view === key}
                onClick={() => setView(key)}
                className={`min-h-9 shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition ${view === key ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted'}`}
              >
                {VIEW_LABELS[key]}
              </button>
            ))}
          </div>
        </div>
      </div>
      <CardContent className="p-0">{view === 'month' ? <div className="overflow-x-auto"><div className="min-w-[720px]"><MonthGrid cursor={cursor} rangeStart={range.from} byDay={byDay} onCreate={openCreate} onOpen={openEdit} /></div></div> : <AgendaView view={view} events={events} range={range} onOpen={openEdit} />}</CardContent>
    </Card>
    <aside className="self-start overflow-hidden rounded-xl border border-primary/10 bg-brand-blue-soft/25 shadow-sm xl:sticky xl:top-3">
      <div className="border-b border-primary/10 bg-white/75 p-4"><div className="font-data text-[9px] font-semibold uppercase tracking-[0.15em] text-operation-blue">Yaklaşanlar</div><div className="mt-1 font-display text-lg font-semibold">Sıradaki operasyonlar</div><p className="mt-1 text-xs text-muted-foreground">Zaman, firma ve konum bağlamıyla.</p></div>
      <div className="max-h-[620px] space-y-2 overflow-y-auto p-3">
        {upcomingEvents.map((event) => <button key={event.id} type="button" onClick={() => openEdit(event)} className="w-full rounded-lg border border-border/60 bg-white p-3 text-left shadow-xs transition hover:border-primary/25 hover:shadow-sm"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="truncate text-xs font-semibold">{event.title}</div><div className="mt-1 font-data text-[10px] text-muted-foreground">{new Date(event.startsAt).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })} · {event.allDay ? 'Tüm gün' : new Date(event.startsAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</div></div><span className={`size-2 shrink-0 rounded-full border ${TYPE_STYLES[event.eventType]}`} /></div><div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">{event.company && <span className="rounded bg-muted px-1.5 py-0.5">{event.company.shortName || event.company.legalTitle}</span>}{event.location && <span className="inline-flex items-center gap-1 truncate"><MapPin className="size-3" />{event.location}</span>}</div></button>)}
        {upcomingEvents.length === 0 && <div className="py-4 text-center"><BrandIllustration scene="calendar" size="sm" className="mx-auto" /><div className="mt-1 text-sm font-semibold">Yaklaşan etkinlik yok</div><p className="mt-1 text-xs text-muted-foreground">Yeni etkinlik oluşturarak operasyon akışını planlayın.</p><Button size="sm" className="mt-3" onClick={() => openCreate()}><Plus className="size-4" /> Etkinlik oluştur</Button></div>}
      </div>
    </aside>
    </div>
    <Dialog open={editorOpen} onOpenChange={setEditorOpen}><DialogContent className="max-w-2xl"><form onSubmit={save} className="space-y-4"><DialogHeader><DialogTitle>{editing ? 'Etkinliği düzenle' : 'Yeni etkinlik'}</DialogTitle><DialogDescription>{editing?.source === 'device' ? 'Değişiklik bir sonraki senkronda telefona yazılır.' : 'Kişisel takvimine yeni bir kayıt ekle.'}</DialogDescription></DialogHeader>
      <div className="grid gap-4 sm:grid-cols-2"><Field label="Etkinlik türü"><select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={draft.eventType} onChange={(event) => setDraft((value) => ({ ...value, eventType: event.target.value as CalendarEventType, companyId: event.target.value === 'customer_visit' ? value.companyId : null }))}>{Object.entries(TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
      {draft.eventType === 'customer_visit' && <Field label="Firma"><select required className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={draft.companyId ?? ''} onChange={(event) => setDraft((value) => ({ ...value, companyId: event.target.value || null }))}><option value="">Firma seçin</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.shortName || company.legalTitle}</option>)}</select></Field>}
      <Field label="Başlık" className="sm:col-span-2"><Input required maxLength={255} value={draft.title} onChange={(event) => setDraft((value) => ({ ...value, title: event.target.value }))} placeholder="Örn. Haksan CNC fabrika ziyareti" /></Field><Field label="Başlangıç"><Input required type="datetime-local" value={draft.startsAt} onChange={(event) => setDraft((value) => ({ ...value, startsAt: event.target.value }))} /></Field><Field label="Bitiş"><Input required type="datetime-local" value={draft.endsAt} onChange={(event) => setDraft((value) => ({ ...value, endsAt: event.target.value }))} /></Field><Field label="Konum" className="sm:col-span-2"><Input value={draft.location ?? ''} onChange={(event) => setDraft((value) => ({ ...value, location: event.target.value }))} /></Field><Field label="Not" className="sm:col-span-2"><Textarea value={draft.description ?? ''} onChange={(event) => setDraft((value) => ({ ...value, description: event.target.value }))} /></Field><label className="flex items-center gap-2 text-sm"><Switch aria-label="Tüm gün" checked={draft.allDay} onCheckedChange={(checked) => setDraft((value) => ({ ...value, allDay: checked }))} /> Tüm gün</label></div>
      <DialogFooter className="items-center sm:justify-between"><div className="flex gap-2">{editing && !editing.deletedAt && <Button type="button" variant="destructive" size="sm" onClick={remove}><Trash2 className="size-4" /> Arşive al</Button>}{editing?.deletedAt && <Button type="button" variant="outline" size="sm" onClick={restore}><ArchiveRestore className="size-4" /> Geri al</Button>}</div><div className="flex gap-2"><Button type="button" variant="outline" onClick={() => setEditorOpen(false)}>Vazgeç</Button><Button disabled={saving || !!editing?.deletedAt}>{saving ? 'Kaydediliyor…' : 'Kaydet'}</Button></div></DialogFooter>
    </form></DialogContent></Dialog>
    <Dialog open={importOpen} onOpenChange={(next) => { if (!importBusy) setImportOpen(next); }}><DialogContent className="max-w-2xl">
      <DialogHeader><DialogTitle>Takvim içe aktar (.ics)</DialogTitle><DialogDescription>Apple Takvim, Google Takvim veya başka bir uygulamadan dışa aktardığın <code>.ics</code> dosyasını yükle. Etkinlikler kişisel takvimine eklenir; aynı dosya tekrar yüklenirse mevcut kayıtlar güncellenir.</DialogDescription></DialogHeader>
      <div className="space-y-4">
        <input ref={importFileRef} type="file" accept=".ics,.ical,text/calendar" className="hidden" onChange={onPickFile} />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" className="gap-2" disabled={importBusy} onClick={() => importFileRef.current?.click()}><Download className="size-4" /> Dosya seç</Button>
          {importFileName && <span className="text-sm text-muted-foreground">{importFileName}{importBusy && ' · okunuyor…'}</span>}
        </div>
        {importPreview && <>
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            <div className="rounded-lg border bg-muted/30 p-2"><div className="text-lg font-semibold">{importPreview.summary.total}</div><div className="text-xs text-muted-foreground">Toplam</div></div>
            <div className="rounded-lg border bg-muted/30 p-2"><div className="text-lg font-semibold">{importPreview.summary.inWindow}</div><div className="text-xs text-muted-foreground">±6 ay içinde</div></div>
            <div className="rounded-lg border bg-muted/30 p-2"><div className="text-lg font-semibold">{importPreview.summary.duplicates}</div><div className="text-xs text-muted-foreground">Daha önce alınmış</div></div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm"><Switch checked={importOnlyWindow} onCheckedChange={setImportOnlyWindow} /> Yalnızca son/önümüzdeki 6 ay</label>
            <Field label="Etkinlik türü"><select className="h-9 rounded-md border bg-background px-3 text-sm" value={importType} onChange={(event) => setImportType(event.target.value as CalendarImportEventType)}>{(Object.keys(IMPORT_TYPE_LABELS) as CalendarImportEventType[]).map((key) => <option key={key} value={key}>{IMPORT_TYPE_LABELS[key]}</option>)}</select></Field>
          </div>
          <div className="max-h-72 space-y-1.5 overflow-auto rounded-lg border p-2">
            {importSelection.length === 0 ? <div className="p-3 text-sm text-muted-foreground">Seçili filtreyle içe aktarılacak etkinlik yok.</div> : importSelection.map((event) => <ImportRow key={event.uid} event={event} />)}
          </div>
        </>}
      </div>
      <DialogFooter className="items-center sm:justify-between"><span className="text-sm text-muted-foreground">{importPreview ? `${importSelection.length} etkinlik içe aktarılacak` : ''}</span><div className="flex gap-2"><Button type="button" variant="outline" onClick={() => setImportOpen(false)} disabled={importBusy}>Vazgeç</Button><Button type="button" onClick={commitImport} disabled={importBusy || !importPreview || importSelection.length === 0}>{importBusy ? 'İşleniyor…' : 'İçe aktar'}</Button></div></DialogFooter>
    </DialogContent></Dialog>
  </div>;
}

function ImportRow({ event }: { event: CalendarImportEvent }) {
  const start = new Date(event.startsAt);
  return <div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/40">
    <div className="min-w-32 text-xs tabular-nums text-muted-foreground">{start.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: '2-digit' })}{!event.allDay && ` ${start.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`}</div>
    <div className="min-w-0 flex-1 truncate font-medium">{event.title}</div>
    {event.duplicate && <Badge variant="outline" className="shrink-0">Güncellenecek</Badge>}
    {!event.inWindow && <Badge variant="outline" className="shrink-0 text-warning">Pencere dışı</Badge>}
  </div>;
}

function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return <div className={className}><Label className="block space-y-1.5"><span className="block">{label}</span>{children}</Label></div>;
}

function MonthGrid({ cursor, rangeStart, byDay, onCreate, onOpen }: { cursor: Date; rangeStart: Date; byDay: Map<string, CalendarEventDTO[]>; onCreate: (date: Date) => void; onOpen: (event: CalendarEventDTO) => void }) {
  return <div><div className="grid grid-cols-7 border-b bg-muted/20 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map((day) => <div key={day} className="py-2">{day}</div>)}</div><div className="grid grid-cols-7">{Array.from({ length: 42 }, (_, index) => addDays(rangeStart, index)).map((day) => { const rows = byDay.get(dateKey(day)) ?? []; const outside = day.getMonth() !== cursor.getMonth(); const today = dateKey(day) === dateKey(new Date()); return <div key={dateKey(day)} onDoubleClick={() => onCreate(day)} className={`min-h-28 border-b border-r p-1.5 transition hover:bg-muted/40 ${outside ? 'bg-muted/20 text-muted-foreground' : 'bg-background'}`}><div className={`mb-1 grid size-6 place-items-center rounded-full text-xs font-semibold ${today ? 'bg-success text-success-foreground' : ''}`}>{day.getDate()}</div><div className="space-y-1">{rows.slice(0, 4).map((event) => <EventChip key={event.id} event={event} onOpen={onOpen} />)}{rows.length > 4 && <div className="px-1 text-[10px] text-muted-foreground">+{rows.length - 4} daha</div>}</div></div>; })}</div></div>;
}

function EventChip({ event, onOpen }: { event: CalendarEventDTO; onOpen: (event: CalendarEventDTO) => void }) { return <button onClick={() => onOpen(event)} className={`block w-full truncate rounded border-l-4 px-1.5 py-1 text-left text-[10px] font-medium shadow-sm ${TYPE_STYLES[event.eventType]} ${event.deletedAt ? 'opacity-40 line-through' : ''}`}>{!event.allDay && <span className="mr-1 tabular-nums opacity-60">{new Date(event.startsAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>}{event.title}</button>; }

function AgendaView({ view, events, range, onOpen }: { view: CalendarView; events: CalendarEventDTO[]; range: { from: Date; to: Date }; onOpen: (event: CalendarEventDTO) => void }) {
  const days = view === 'day' ? [range.from] : view === 'week' ? Array.from({ length: 7 }, (_, index) => addDays(range.from, index)) : Array.from(new Set(events.map((event) => dateKey(new Date(event.startsAt))))).map((key) => new Date(`${key}T12:00:00`));
  return <div className="divide-y">{days.map((day) => { const rows = events.filter((event) => dateKey(new Date(event.startsAt)) === dateKey(day)); return <section key={dateKey(day)} className="grid min-h-24 gap-3 p-4 md:grid-cols-[150px_1fr]"><div><div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{day.toLocaleDateString('tr-TR', { weekday: 'long' })}</div><div className="text-lg font-semibold">{day.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })}</div></div><div className="space-y-2">{rows.length === 0 ? <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Planlanmış etkinlik yok.</div> : rows.map((event) => <button key={event.id} onClick={() => onOpen(event)} className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${TYPE_STYLES[event.eventType]} ${event.deletedAt ? 'opacity-40' : ''}`}><div className="min-w-20 text-xs font-semibold tabular-nums"><Clock3 className="mr-1 inline size-3.5" />{event.allDay ? 'Tüm gün' : new Date(event.startsAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</div><div className="min-w-0 flex-1"><div className="font-semibold">{event.title}</div><div className="mt-1 flex flex-wrap gap-2 text-xs opacity-70">{event.location && <span><MapPin className="mr-1 inline size-3" />{event.location}</span>}{event.company && <span>{event.company.shortName || event.company.legalTitle}</span>}{event.source === 'device' && <span><Smartphone className="mr-1 inline size-3" />Telefon</span>}{event.source === 'import' && <span><Upload className="mr-1 inline size-3" />İçe aktarıldı</span>}</div></div><Badge variant="outline">{TYPE_LABELS[event.eventType]}</Badge></button>)}</div></section>; })}</div>;
}
