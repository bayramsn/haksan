import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Ban, FileSpreadsheet, Loader2, Mails, Paperclip, Plus, Send, Trash2, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { MAIL_CAMPAIGN_MAX_RECIPIENTS, MAIL_MAX_ATTACHMENTS, MAIL_MAX_ATTACHMENT_BYTES, type UserMailAccountStatus } from "@haksan/shared";
import { useAuth } from "../../../lib/auth";
import { companyService, mailCampaignService, mailService, tradeFairService, type MailCampaignDetail, type MailCampaignSummary, type TradeFairContactDTO } from "../../../lib/services";
import { useStore } from "../../lib/store";
import { CatalogLibraryDialog, type CatalogAttachment } from "../mail/CatalogLibraryDialog";
import { MAIL_TEMPLATE_SCOPE } from "../mail/ComposeMailDialog";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Checkbox } from "../ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../ui/alert-dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Textarea } from "../ui/textarea";

type Recipient = { email: string; name?: string; companyName?: string; companyId?: string; contactId?: string; source: "CRM" | "Fuar" | "Liste" };

const STATUS: Record<string, { label: string; className: string }> = {
  sending: { label: "Gönderiliyor", className: "bg-info/10 text-info border-info/20" },
  completed: { label: "Tamamlandı", className: "bg-success/10 text-success border-success/20" },
  cancelled: { label: "Durduruldu", className: "bg-muted text-muted-foreground" },
  failed: { label: "Hata", className: "bg-destructive/10 text-destructive border-destructive/20" },
  pending: { label: "Bekliyor", className: "bg-muted text-muted-foreground" },
  sent: { label: "Gönderildi", className: "bg-success/10 text-success border-success/20" },
  skipped: { label: "Atlandı", className: "bg-warning/10 text-warning border-warning/20" },
};
const StatusBadge = ({ status }: { status: string }) => (
  <Badge variant="outline" className={STATUS[status]?.className}>{STATUS[status]?.label ?? status}</Badge>
);
const DEFAULT_BODY = "Merhaba {{ad}},\n\n\n\nSaygılarımızla";
const fmtDate = (value?: string | null) => (value ? new Date(value).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" }) : "—");
const ALL = "__all__";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? "").split(",").pop() ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function BulkMailPage() {
  const { hasPermission, hasRole } = useAuth();
  const canSend = hasRole("super_admin") || hasPermission("mail_campaigns.create");
  const [campaigns, setCampaigns] = useState<MailCampaignSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [composing, setComposing] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [suppressionOpen, setSuppressionOpen] = useState(false);

  const load = () => mailCampaignService.list()
    .then(setCampaigns)
    .catch((error: any) => toast.error("Toplu mailler yüklenemedi", { description: error?.message }))
    .finally(() => setLoading(false));
  useEffect(() => { void load(); }, []);
  const sending = campaigns.some((c) => c.status === "sending");
  useEffect(() => {
    if (!sending) return;
    const timer = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(timer);
  }, [sending]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Her alıcıya ayrı e-posta, kendi webmail hesabınızdan gider (dakikada ~20). Tek gönderimde en fazla {MAIL_CAMPAIGN_MAX_RECIPIENTS} alıcı.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => setSuppressionOpen(true)}><Ban className="size-4" />Ret listesi</Button>
          {canSend && !composing && <Button size="sm" className="h-9 gap-1.5" onClick={() => setComposing(true)}><Plus className="size-4" />Yeni toplu mail</Button>}
        </div>
      </div>

      {composing && <Composer onCancel={() => setComposing(false)} onCreated={(id) => { setComposing(false); setOpenId(id); void load(); }} />}

      <Card className="overflow-hidden border-border/60 shadow-sm">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead>Konu</TableHead>
                <TableHead>Durum</TableHead>
                <TableHead className="text-right">Gönderilen</TableHead>
                <TableHead>Gönderen</TableHead>
                <TableHead>Tarih</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.map((c) => (
                <TableRow key={c.id} className="cursor-pointer" onClick={() => setOpenId(c.id)}>
                  <TableCell className="max-w-[360px] truncate font-medium">{c.subject}</TableCell>
                  <TableCell><StatusBadge status={c.status} /></TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {c.sent}/{c.total}{c.failed ? <span className="ml-1 text-destructive">· {c.failed} hata</span> : null}{c.skipped ? <span className="ml-1 text-muted-foreground">· {c.skipped} atlandı</span> : null}
                  </TableCell>
                  <TableCell className="text-sm">{c.createdByName ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{fmtDate(c.createdAt)}</TableCell>
                </TableRow>
              ))}
              {!campaigns.length && (
                <TableRow><TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">{loading ? "Yükleniyor…" : "Henüz toplu mail gönderilmedi."}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <CampaignDialog id={openId} canSend={canSend} onClose={() => setOpenId(null)} onChanged={() => void load()} />
      <SuppressionDialog open={suppressionOpen} canEdit={canSend} onOpenChange={setSuppressionOpen} />
    </div>
  );
}

function Composer({ onCancel, onCreated }: { onCancel: () => void; onCreated: (id: string) => void }) {
  const { noteTemplates } = useStore();
  const [account, setAccount] = useState<UserMailAccountStatus | null>(null);
  const [selected, setSelected] = useState<Map<string, Recipient>>(new Map());
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState(DEFAULT_BODY);
  const [attachments, setAttachments] = useState<CatalogAttachment[]>([]);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const mailTemplates = noteTemplates.filter((t) => t.scope === MAIL_TEMPLATE_SCOPE);

  useEffect(() => { mailService.account().then(setAccount).catch(() => setAccount(null)); }, []);
  const ready = Boolean(account?.featureEnabled && account.configured && account.status === "active");

  const add = (rows: Recipient[]) => {
    const next = new Map(selected);
    let skipped = 0;
    for (const row of rows) {
      const key = row.email.toLocaleLowerCase("en-US");
      if (next.has(key)) continue;
      if (next.size >= MAIL_CAMPAIGN_MAX_RECIPIENTS) { skipped++; continue; }
      next.set(key, { ...row, email: key });
    }
    if (skipped) toast.warning(`${MAIL_CAMPAIGN_MAX_RECIPIENTS} alıcı sınırı: ${skipped} adres eklenmedi`);
    setSelected(next);
  };
  const remove = (email: string) => setSelected((current) => { const next = new Map(current); next.delete(email); return next; });
  const recipients = [...selected.values()];

  const submit = async () => {
    setBusy(true);
    try {
      const created = await mailCampaignService.create({
        subject: subject.trim(),
        body: body.trim(),
        fileIds: attachments.length ? attachments.map((a) => a.fileId) : undefined,
        recipients: recipients.map(({ source: _source, ...r }) => ({
          email: r.email,
          name: r.name?.slice(0, 255) || undefined,
          companyName: r.companyName?.slice(0, 255) || undefined,
          companyId: r.companyId,
          contactId: r.companyId ? r.contactId : undefined,
        })),
      });
      toast.success("Toplu mail sıraya alındı", { description: `${created.recipients.length} alıcı · arka planda gönderiliyor` });
      onCreated(created.id);
    } catch (error: any) {
      toast.error("Toplu mail başlatılamadı", { description: error?.message });
    } finally {
      setBusy(false);
      setConfirmOpen(false);
    }
  };

  return (
    <Card className="space-y-5 border-border/60 p-4 shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">Yeni toplu mail</h2>
          <p className="text-xs text-muted-foreground">Alıcıları seçin, mesajı yazın, gerekirse genel katalog ekleyin.</p>
        </div>
        <Button variant="ghost" size="icon" aria-label="Vazgeç" onClick={onCancel} disabled={busy}><X className="size-4" /></Button>
      </div>

      {account && !ready && (
        <div className="flex items-start gap-2 rounded-lg border border-warning/25 bg-warning/5 px-3 py-2.5 text-xs">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          <span>Gönderici hesabı hazır değil. Ayarlar &gt; Webmail bölümünden kurumsal adresinizi bağlayın.</span>
        </div>
      )}

      <section className="space-y-2">
        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">1 · Alıcılar</Label>
        <Tabs defaultValue="crm">
          <TabsList>
            <TabsTrigger value="crm">CRM kontakları</TabsTrigger>
            <TabsTrigger value="fair">Fuar görüşmeleri</TabsTrigger>
            <TabsTrigger value="excel">Excel / CSV</TabsTrigger>
          </TabsList>
          <TabsContent value="crm"><CrmSource selected={selected} onAdd={add} onRemove={remove} /></TabsContent>
          <TabsContent value="fair"><FairSource selected={selected} onAdd={add} onRemove={remove} /></TabsContent>
          <TabsContent value="excel"><ExcelSource onAdd={add} /></TabsContent>
        </Tabs>

        <div className="rounded-lg border border-border/60">
          <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2 text-xs">
            <span><b>{recipients.length}</b> / {MAIL_CAMPAIGN_MAX_RECIPIENTS} alıcı seçildi</span>
            <Button variant="ghost" size="sm" className="h-7" disabled={!recipients.length} onClick={() => setSelected(new Map())}>Temizle</Button>
          </div>
          <div className="max-h-48 overflow-y-auto p-2">
            {recipients.length ? (
              <div className="flex flex-wrap gap-1.5">
                {recipients.map((r) => (
                  <span key={r.email} className="inline-flex max-w-full items-center gap-1 rounded-full border border-border/60 bg-muted/30 py-0.5 pl-2.5 pr-1 text-xs">
                    <span className="truncate">{r.name ? `${r.name} · ` : ""}{r.email}</span>
                    <span className="text-[10px] text-muted-foreground">{r.source}</span>
                    <button type="button" aria-label={`${r.email} çıkar`} className="rounded-full p-0.5 hover:bg-muted" onClick={() => remove(r.email)}><X className="size-3" /></button>
                  </span>
                ))}
              </div>
            ) : <p className="py-3 text-center text-xs text-muted-foreground">Yukarıdan alıcı ekleyin.</p>}
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">2 · Mesaj</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input aria-label="Konu" placeholder="Konu (ör. 2026 Ürün Kataloğumuz)" value={subject} maxLength={255} onChange={(e) => setSubject(e.target.value)} className="flex-1" />
          <Select value={undefined} onValueChange={(id) => { const t = mailTemplates.find((x) => x.id === id); if (t) setBody(t.body); }} disabled={!mailTemplates.length}>
            <SelectTrigger className="sm:w-56" aria-label="Mail şablonu seç"><SelectValue placeholder={mailTemplates.length ? "Şablon seç" : "Kayıtlı şablon yok"} /></SelectTrigger>
            <SelectContent>{mailTemplates.map((t) => <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <Textarea aria-label="Mesaj" className="min-h-48 resize-y leading-relaxed" value={body} maxLength={10_000} onChange={(e) => setBody(e.target.value)} />
        <p className="text-[11px] text-muted-foreground">
          <code>{"{{ad}}"}</code> alıcının adıyla, <code>{"{{firma}}"}</code> firma adıyla dolar (boşsa kaldırılır). İmzanız ve her mailin altına "abonelikten çık" bağlantısı otomatik eklenir; çıkan adres ret listesine düşer.
        </p>
      </section>

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">3 · Katalog eki (isteğe bağlı)</Label>
          <Button variant="outline" size="sm" className="gap-1.5" disabled={attachments.length >= MAIL_MAX_ATTACHMENTS} onClick={() => setCatalogOpen(true)}><Paperclip className="size-3.5" />Katalog ekle</Button>
        </div>
        {attachments.map((a) => (
          <div key={a.fileId} className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs">
            <Paperclip className="size-3.5 text-muted-foreground" /><span className="flex-1 truncate font-medium">{a.name}</span>
            <span className="text-muted-foreground">{(a.size / 1048576).toFixed(1)} MB</span>
            <Button variant="ghost" size="icon" className="size-7" aria-label={`${a.name} ekini kaldır`} onClick={() => setAttachments((cur) => cur.filter((x) => x.fileId !== a.fileId))}><X className="size-3.5" /></Button>
          </div>
        ))}
        <CatalogLibraryDialog open={catalogOpen} onOpenChange={setCatalogOpen} onSelect={(file) => {
          if (attachments.some((a) => a.fileId === file.fileId)) return;
          if (attachments.reduce((sum, a) => sum + a.size, 0) + file.size > MAIL_MAX_ATTACHMENT_BYTES) { toast.error("Eklerin toplamı 15 MB sınırını aşıyor"); return; }
          setAttachments((cur) => [...cur, file]);
        }} />
      </section>

      <div className="flex flex-wrap justify-end gap-2 border-t border-border/60 pt-4">
        <Button variant="outline" onClick={onCancel} disabled={busy}>Vazgeç</Button>
        <Button className="gap-2" disabled={!ready || busy || !recipients.length || !subject.trim() || !body.trim()} onClick={() => setConfirmOpen(true)}>
          <Send className="size-4" />{recipients.length} alıcıya gönder
        </Button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={(open) => !busy && setConfirmOpen(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{recipients.length} alıcıya gönderilsin mi?</AlertDialogTitle>
            <AlertDialogDescription>
              Her alıcıya ayrı e-posta, {account?.email ?? "webmail hesabınızdan"} gider. Gönderim arka planda yaklaşık {Math.max(1, Math.ceil(recipients.length / 20))} dakika sürer; ret listesindekiler atlanır.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Vazgeç</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={(e) => { e.preventDefault(); void submit(); }}>{busy ? "Başlatılıyor…" : "Gönderimi başlat"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

type SourceProps = { selected: Map<string, Recipient>; onAdd: (rows: Recipient[]) => void; onRemove: (email: string) => void };

/** Kaynak listesinin ortak gövdesi: işaretli satırlar seçili alıcılardır. */
function SourceList({ rows, selected, onAdd, onRemove, empty }: SourceProps & { rows: Array<Recipient & { detail?: string }>; empty: string }) {
  const visible = rows.slice(0, 300);
  const addable = rows.filter((r) => !selected.has(r.email.toLocaleLowerCase("en-US")));
  return (
    <div className="mt-2 rounded-lg border border-border/60">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-3 py-2 text-xs text-muted-foreground">
        <span>{rows.length} e-posta adresi{rows.length > visible.length ? ` · ilk ${visible.length} gösteriliyor` : ""}</span>
        <Button size="sm" variant="outline" className="h-7 gap-1.5" disabled={!addable.length} onClick={() => onAdd(addable)}><UserPlus className="size-3.5" />Tümünü ekle ({addable.length})</Button>
      </div>
      <div className="max-h-64 overflow-y-auto">
        {visible.map((r) => {
          const checked = selected.has(r.email.toLocaleLowerCase("en-US"));
          return (
            <label key={`${r.source}-${r.email}-${r.contactId ?? r.companyId ?? ""}`} className="flex cursor-pointer items-center gap-3 border-b border-border/40 px-3 py-2 text-sm last:border-0 hover:bg-muted/30">
              <Checkbox checked={checked} onCheckedChange={(value) => (value ? onAdd([r]) : onRemove(r.email.toLocaleLowerCase("en-US")))} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{r.name || r.email}</span>
                <span className="block truncate text-xs text-muted-foreground">{[r.name ? r.email : null, r.companyName, r.detail].filter(Boolean).join(" · ")}</span>
              </span>
            </label>
          );
        })}
        {!rows.length && <p className="py-6 text-center text-xs text-muted-foreground">{empty}</p>}
      </div>
    </div>
  );
}

const RELATION_LABEL: Record<string, string> = { customer: "Müşteri", supplier_customer: "Tedarikçi + Müşteri", supplier: "Tedarikçi", competitor: "Rakip" };
const CUSTOMER_STATUS_LABEL: Record<string, string> = { potential: "Potansiyel", active: "Aktif müşteri", passive: "Pasif" };

function CrmSource(props: SourceProps) {
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [city, setCity] = useState(ALL);
  const [sector, setSector] = useState(ALL);
  const [relation, setRelation] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [withCompanyEmails, setWithCompanyEmails] = useState(false);
  const [options, setOptions] = useState<{ cities: string[]; sectors: string[] }>({ cities: [], sectors: [] });
  const [rows, setRows] = useState<Array<Recipient & { detail?: string }>>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => { companyService.summary().then((s) => setOptions({ cities: s.cities, sectors: s.sectors })).catch(() => undefined); }, []);
  useEffect(() => { const timer = window.setTimeout(() => setSearch(q.trim()), 350); return () => window.clearTimeout(timer); }, [q]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    mailCampaignService.candidates({
      search: search || undefined,
      city: city === ALL ? undefined : city,
      sector: sector === ALL ? undefined : sector,
      relationTypeCode: relation === ALL ? undefined : relation,
      customerStatusCode: status === ALL ? undefined : status,
      includeCompanyEmails: withCompanyEmails ? "true" : undefined,
    }, { signal: controller.signal })
      .then((result) => {
        setRows(result.rows.map((r) => ({ email: r.email, name: r.name ?? undefined, companyName: r.companyName, companyId: r.companyId, contactId: r.contactId ?? undefined, source: "CRM" as const, detail: r.detail ?? undefined })));
        setTruncated(result.truncated);
        setLoading(false);
      })
      .catch((error: any) => {
        if (controller.signal.aborted) return;
        setLoading(false);
        toast.error("Kontaklar yüklenemedi", { description: error?.message });
      });
    return () => controller.abort();
  }, [search, city, sector, relation, status, withCompanyEmails]);

  const filterSelect = (label: string, value: string, onChange: (v: string) => void, entries: Array<[string, string]>) => (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label}><SelectValue placeholder={label} /></SelectTrigger>
      <SelectContent><SelectItem value={ALL}>{label}: tümü</SelectItem>{entries.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
    </Select>
  );

  return (
    <div className="space-y-2 pt-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <Input aria-label="Firma veya kontak ara" placeholder="Firma ara…" value={q} onChange={(e) => setQ(e.target.value)} />
        {filterSelect("İl", city, setCity, options.cities.map((c) => [c, c]))}
        {filterSelect("Sektör", sector, setSector, options.sectors.map((c) => [c, c]))}
        {filterSelect("Firma tipi", relation, setRelation, Object.entries(RELATION_LABEL))}
        {filterSelect("Durum", status, setStatus, Object.entries(CUSTOMER_STATUS_LABEL))}
      </div>
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <Checkbox checked={withCompanyEmails} onCheckedChange={(v) => setWithCompanyEmails(Boolean(v))} />Firmaların genel e-posta adreslerini de listele
      </label>
      {truncated && <p className="text-xs text-warning">Çok fazla sonuç var; ilk 2.000 adres listelendi. Süzgeçleri daraltın.</p>}
      {loading && !rows.length ? <p className="flex items-center gap-2 py-4 text-xs text-muted-foreground"><Loader2 className="size-4 animate-spin" />Yükleniyor…</p>
        : <SourceList {...props} rows={rows} empty="Süzgece uyan, e-postası olan kontak yok." />}
    </div>
  );
}

function FairSource(props: SourceProps) {
  const [fairs, setFairs] = useState<string[]>([]);
  const [fair, setFair] = useState(ALL);
  const [rows, setRows] = useState<TradeFairContactDTO[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => { tradeFairService.summary().then((s) => setFairs(s.fairs.map((f) => f.name))).catch(() => setFairs([])); }, []);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      const all: TradeFairContactDTO[] = [];
      // ponytail: 10 sayfa (2.000 kayıt) tavanı; tek fuar bunu aşmaz, aşarsa sunucu tarafı e-posta süzgeci eklenir.
      for (let page = 1; page <= 10; page++) {
        const result = await tradeFairService.list({ fairName: fair === ALL ? undefined : fair, page, pageSize: 200 });
        all.push(...result.data);
        if (page >= result.meta.totalPages || !result.data.length) break;
      }
      if (alive) setRows(all);
    })()
      .catch((error: any) => toast.error("Fuar kayıtları yüklenemedi", { description: error?.message }))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [fair]);
  const recipients = rows.flatMap((r) => r.email?.trim() ? [{
    email: r.email.trim(), name: r.contactName, companyName: r.companyName,
    companyId: r.companyId ?? undefined, contactId: r.companyId ? r.contactId ?? undefined : undefined,
    source: "Fuar" as const, detail: [r.fairName, r.province].filter(Boolean).join(" · "),
  }] : []);
  return (
    <div className="space-y-2 pt-2">
      <Select value={fair} onValueChange={setFair}>
        <SelectTrigger className="sm:w-72" aria-label="Fuar"><SelectValue placeholder="Fuar" /></SelectTrigger>
        <SelectContent><SelectItem value={ALL}>Tüm fuarlar</SelectItem>{fairs.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
      </Select>
      {loading ? <p className="flex items-center gap-2 py-4 text-xs text-muted-foreground"><Loader2 className="size-4 animate-spin" />Yükleniyor…</p>
        : <SourceList {...props} rows={recipients} empty="Bu fuarda e-postası olan görüşme yok." />}
    </div>
  );
}

function ExcelSource({ onAdd }: { onAdd: (rows: Recipient[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const pick = async (file?: File) => {
    if (!file) return;
    if (!/\.(xlsx|csv)$/i.test(file.name) || file.size > 2 * 1024 * 1024) { toast.error("Liste .xlsx veya .csv olmalı ve 2 MB'ı aşmamalı"); return; }
    setBusy(true);
    try {
      const result = await mailCampaignService.parseList({ fileName: file.name, fileBase64: await fileToBase64(file) });
      onAdd(result.rows.map((r) => ({ ...r, source: "Liste" as const })));
      toast.success(`${result.rows.length} adres okundu`, { description: result.invalid ? `${result.invalid} satırda geçerli e-posta yok, atlandı.` : undefined });
    } catch (error: any) {
      toast.error("Liste okunamadı", { description: error?.message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-2 flex flex-col items-start gap-2 rounded-lg border border-dashed border-border p-4 text-sm">
      <p className="text-muted-foreground">İlk satırda <b>E-posta</b> (zorunlu), <b>Ad Soyad</b> ve <b>Firma</b> başlıkları olan bir .xlsx veya .csv yükleyin. Okunan adresler doğrudan seçilenlere eklenir.</p>
      <input ref={input} type="file" accept=".xlsx,.csv" className="sr-only" aria-label="Alıcı listesi yükle" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
      <Button variant="outline" className="gap-1.5" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <FileSpreadsheet className="size-4" />}Liste yükle
      </Button>
    </div>
  );
}

function CampaignDialog({ id, canSend, onClose, onChanged }: { id: string | null; canSend: boolean; onClose: () => void; onChanged: () => void }) {
  const [detail, setDetail] = useState<MailCampaignDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const load = (campaignId: string) => mailCampaignService.get(campaignId).then(setDetail).catch((error: any) => toast.error("Toplu mail açılamadı", { description: error?.message }));
  useEffect(() => { setDetail(null); if (id) void load(id); }, [id]);
  useEffect(() => {
    if (!id || detail?.status !== "sending") return;
    const timer = window.setInterval(() => void load(id).then(onChanged), 4000);
    return () => window.clearInterval(timer);
  }, [id, detail?.status]);

  const counts = detail?.recipients.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }), {}) ?? {};
  const act = async (action: "cancel" | "resume") => {
    if (!detail) return;
    setBusy(true);
    try { setDetail(await mailCampaignService[action](detail.id)); onChanged(); }
    catch (error: any) { toast.error(action === "cancel" ? "Durdurulamadı" : "Sürdürülemedi", { description: error?.message }); }
    finally { setBusy(false); }
  };
  const suppress = async (email: string) => {
    try { await mailCampaignService.addSuppression({ email, reason: detail ? `Toplu mail: ${detail.subject}`.slice(0, 255) : undefined }); toast.success("Ret listesine eklendi", { description: email }); if (id) void load(id); }
    catch (error: any) { toast.error("Eklenemedi", { description: error?.message }); }
  };

  return (
    <Dialog open={Boolean(id)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-6"><Mails className="size-4 shrink-0" /><span className="truncate">{detail?.subject ?? "Toplu mail"}</span></DialogTitle>
          <DialogDescription>{detail ? `${fmtDate(detail.createdAt)} · ${detail.recipients.length} alıcı` : "Yükleniyor…"}</DialogDescription>
        </DialogHeader>
        {detail && <>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <StatusBadge status={detail.status} />
            {(["sent", "pending", "failed", "skipped"] as const).map((s) => counts[s] ? <span key={s} className="text-muted-foreground">{STATUS[s].label}: <b className="text-foreground">{counts[s]}</b></span> : null)}
            {detail.status === "sending" && canSend && <Button size="sm" variant="outline" className="ml-auto h-7" disabled={busy} onClick={() => void act("cancel")}>Gönderimi durdur</Button>}
            {detail.status !== "sending" && canSend && counts.pending > 0 && <Button size="sm" className="ml-auto h-7" disabled={busy} onClick={() => void act("resume")}>Kalan {counts.pending} alıcıya gönder</Button>}
          </div>
          {detail.error && <p className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">{detail.error}</p>}
          <details className="rounded-md border border-border/60 px-3 py-2 text-sm">
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Mesaj</summary>
            <p className="mt-2 whitespace-pre-line">{detail.body}</p>
          </details>
          <div className="overflow-x-auto rounded-md border border-border/60">
            <Table>
              <TableHeader><TableRow><TableHead>Alıcı</TableHead><TableHead>Durum</TableHead><TableHead>Zaman</TableHead><TableHead className="w-10" /></TableRow></TableHeader>
              <TableBody>
                {detail.recipients.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="max-w-[320px]">
                      <span className="block truncate text-sm">{r.name ? `${r.name} · ` : ""}{r.email}</span>
                      {(r.companyName || r.error) && <span className="block truncate text-xs text-muted-foreground">{[r.companyName, r.error].filter(Boolean).join(" · ")}</span>}
                    </TableCell>
                    <TableCell><StatusBadge status={r.status} /></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{fmtDate(r.sentAt)}</TableCell>
                    <TableCell>{canSend && r.status !== "skipped" && <Button variant="ghost" size="icon" className="size-7" title="Ret listesine ekle" aria-label={`${r.email} ret listesine ekle`} onClick={() => void suppress(r.email)}><Ban className="size-3.5" /></Button>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>}
      </DialogContent>
    </Dialog>
  );
}

function SuppressionDialog({ open, canEdit, onOpenChange }: { open: boolean; canEdit: boolean; onOpenChange: (open: boolean) => void }) {
  const [rows, setRows] = useState<Array<{ id: string; email: string; reason: string | null; createdAt: string }>>([]);
  const [email, setEmail] = useState("");
  const load = () => mailCampaignService.suppressions().then(setRows).catch((error: any) => toast.error("Ret listesi yüklenemedi", { description: error?.message }));
  useEffect(() => { if (open) void load(); }, [open]);
  const add = async () => {
    try { await mailCampaignService.addSuppression({ email: email.trim() }); setEmail(""); void load(); }
    catch (error: any) { toast.error("Eklenemedi", { description: error?.message }); }
  };
  const remove = async (id: string) => {
    try { await mailCampaignService.removeSuppression(id); void load(); }
    catch (error: any) { toast.error("Kaldırılamadı", { description: error?.message }); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Ban className="size-4" />Ret listesi</DialogTitle>
          <DialogDescription>Toplu mail almak istemediğini bildiren adresler. Bu adresler tüm toplu gönderimlerde atlanır.</DialogDescription>
        </DialogHeader>
        {canEdit && (
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (email.trim()) void add(); }}>
            <Input type="email" aria-label="Ret listesine eklenecek e-posta" placeholder="ornek@firma.com" value={email} maxLength={255} onChange={(e) => setEmail(e.target.value)} />
            <Button type="submit" variant="outline" disabled={!email.trim()}>Ekle</Button>
          </form>
        )}
        <div className="space-y-1.5">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center gap-2 rounded-md border border-border/60 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1"><span className="block truncate">{r.email}</span>{r.reason && <span className="block truncate text-xs text-muted-foreground">{r.reason}</span>}</span>
              {canEdit && <Button variant="ghost" size="icon" className="size-7" aria-label={`${r.email} listeden çıkar`} onClick={() => void remove(r.id)}><Trash2 className="size-3.5" /></Button>}
            </div>
          ))}
          {!rows.length && <p className="py-4 text-center text-xs text-muted-foreground">Ret listesi boş.</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
