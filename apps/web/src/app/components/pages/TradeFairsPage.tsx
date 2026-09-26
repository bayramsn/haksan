import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Building2, Camera, ExternalLink, FileText, Images, Loader2, Mail, MapPin, Paperclip, Pencil, Phone, Plus, Search, Store, Trash2, Users, X } from "lucide-react";
import { toast } from "sonner";
import { COUNTRY_OPTIONS, TRADE_FAIR_NOTE_OR_ATTACHMENT_MESSAGE, tradeFairContactCreateSchema } from "@haksan/shared";
import { Card, CardContent } from "../ui/card";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { Combobox } from "../ui/combobox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { useStore } from "../../lib/store";
import { useAuth } from "../../../lib/auth";
import { getSignedFile } from "../../lib/signedFileCache";
import { districtsForCountry, provincesForCountry } from "../../lib/geoByCountry";
import {
  fileService,
  tradeFairService,
  type TradeFairContactBody,
  type TradeFairContactDTO,
  type TradeFairSummary,
} from "../../../lib/services";
import { EmptyState } from "../shared/EmptyState";
import { RemoteCompanyCombobox } from "../shared/RemoteCompanyCombobox";
import { ApiError } from "../../../lib/apiClient";
import { InsightStat } from "../shared/PremiumPrimitives";

const ALL = "__all__";
const PAGE_SIZE = 50;
const ENTITY = "trade_fair_contact" as const;
const MAX_BYTES = 25 * 1024 * 1024;
const EXT_TO_MIME: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};
const DOC_ACCEPT = Object.keys(EXT_TO_MIME).map((e) => `.${e}`).join(",");

type Attachment = { id: string; fileId: string; filename: string; mimeType: string; uploadedBy: string | null };

const options = (values: readonly string[]) => values.map((v) => ({ value: v, label: v }));
// Combobox yalnız listedeki değeri gösterir; elle yazılan (yeni) değer boş görünmesin.
const withCurrent = (opts: Array<{ value: string; label: string }>, value?: string | null) =>
  value && !opts.some((o) => o.value === value) ? [{ value, label: value }, ...opts] : opts;
/** Kayıttaki departman silinmişse listede yoksa da adıyla görünsün. */
const withDepartment = (list: Array<{ id: string; name: string }>, editing: TradeFairContactDTO | null) =>
  editing?.departmentId && !list.some((d) => d.id === editing.departmentId)
    ? [...list, { id: editing.departmentId, name: editing.departmentName ?? "Silinmiş departman" }]
    : list;
const distinct = (values: Array<string | null | undefined>) =>
  [...new Set(values.map((v) => v?.trim()).filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b, "tr-TR"));
const fileExt = (name: string) => name.split(".").pop()?.toLocaleLowerCase("tr-TR") ?? "";

const emptyForm = (fairName = "", metByUserId = "", departmentId = ""): TradeFairContactBody => ({
  fairName,
  companyName: "",
  contactName: "",
  contactTitle: "",
  mobilePhone: "",
  email: "",
  country: "Türkiye",
  province: "",
  district: "",
  productCategory: "",
  productType: "",
  productModelIds: [],
  notes: "",
  metByUserId: metByUserId || null,
  departmentId: departmentId || null,
  visitorCount: 1,
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
/** Yükleme uçları dakikada birkaç istekle sınırlı (sunucu kuralı); sınıra takılan dosya pencere açılınca yeniden denenir. */
const RATE_LIMIT_WAIT_MS = 20_000;
const RATE_LIMIT_RETRIES = 4;
const isRateLimited = (err: unknown) =>
  (err instanceof ApiError && err.status === 429) || /\b429\b|too many/i.test(err instanceof Error ? err.message : "");

/** Seçilen dosyayı fuar kaydına yükleyip bağlar (imzalı yükleme → içerik → bağlantı). */
async function uploadAttachment(recordId: string, file: File) {
  const ext = fileExt(file.name);
  // Tarayıcının bildirdiği tip (image/jpg, application/vnd.ms-excel…) sunucunun
  // izin listesine uymayabilir; uzantı zaten doğrulandığı için tip ondan türetilir.
  const mime = EXT_TO_MIME[ext];
  if (!mime) throw new Error(`${file.name}: PDF, DOCX, XLSX, PNG, JPG veya WEBP yükleyebilirsiniz.`);
  if (file.size > MAX_BYTES) throw new Error(`${file.name}: dosya 25 MB'ı aşamaz.`);
  // ponytail: fuar ekleri genel belge klasörüne gider; ayrı bucket gerekirse setup-buckets'a ekleyin.
  const up = await fileService.signedUpload({
    bucket: "erp-service-documents",
    entityType: ENTITY,
    entityId: recordId,
    filename: file.name,
    mimeType: mime as any,
    extension: ext as any,
    sizeBytes: file.size,
  });
  await fileService.uploadBinary(up, file, mime);
  await fileService.link({ fileId: up.fileId, entityType: ENTITY, entityId: recordId, documentTypeCode: "other" });
}

function AttachmentTile({ item, canDelete, onDelete }: { item: Attachment; canDelete: boolean; onDelete: () => void }) {
  const [src, setSrc] = useState<string | null>(null);
  const isImage = item.mimeType.startsWith("image/");
  useEffect(() => {
    if (!isImage) return;
    let alive = true;
    getSignedFile(item.fileId).then((f) => alive && setSrc(f.url)).catch(() => undefined);
    return () => { alive = false; };
  }, [isImage, item.fileId]);
  const open = () => getSignedFile(item.fileId).then((f) => window.open(f.url, "_blank", "noopener")).catch(() => toast.error("Dosya açılamadı"));
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={open}
        title={item.filename}
        className="grid size-20 place-items-center overflow-hidden rounded-lg border border-border/70 bg-muted/40 transition hover:border-primary/60"
      >
        {isImage && src ? (
          <img src={src} alt={item.filename} className="size-full object-cover" />
        ) : (
          <span className="flex flex-col items-center gap-1 px-1 text-[10px] text-muted-foreground">
            <FileText className="size-5 text-primary" />
            <span className="w-16 truncate">{item.filename}</span>
          </span>
        )}
      </button>
      {canDelete && (
        <button
          type="button"
          aria-label={`${item.filename} dosyasını sil`}
          onClick={onDelete}
          className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full border bg-white text-destructive shadow-sm"
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  );
}

export function TradeFairsPage({ onOpenCompany }: { onOpenCompany?: (companyId: string) => void }) {
  const { products } = useStore();
  const { user, hasPermission, hasRole } = useAuth();
  const isManager = hasRole("admin") || hasRole("super_admin");
  const canCreate = isManager || hasPermission("trade_fairs.create");
  const canUpdate = isManager || hasPermission("trade_fairs.update");
  const canDelete = isManager || hasPermission("trade_fairs.delete");

  const [fair, setFair] = useState(ALL);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<TradeFairContactDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const listSeq = useRef(0);
  const [summary, setSummary] = useState<TradeFairSummary>({ fairs: [], byUser: [] });
  const [staff, setStaff] = useState<Array<{ id: string; fullName: string }>>([]);
  const [departmentList, setDepartmentList] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TradeFairContactDTO | null>(null);
  const [form, setForm] = useState<TradeFairContactBody>(emptyForm());
  const [pending, setPending] = useState<File[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploadNote, setUploadNote] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<TradeFairContactDTO | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);

  const fairFilter = fair === ALL ? undefined : fair;
  const loadList = useCallback(async (nextPage: number) => {
    // Geç dönen eski arama yanıtı yenisinin üstüne yazmasın.
    const seq = ++listSeq.current;
    setLoading(true);
    try {
      const list = await tradeFairService.list({ fairName: fairFilter, q: q.trim() || undefined, page: nextPage, pageSize: PAGE_SIZE });
      if (seq !== listSeq.current) return;
      setRows((current) => (nextPage === 1 ? list.data : [...current, ...list.data]));
      setTotal(list.meta.total);
      setPage(nextPage);
    } catch (err: any) {
      if (seq === listSeq.current) toast.error("Fuar kayıtları yüklenemedi", { description: err?.message });
    } finally {
      if (seq === listSeq.current) setLoading(false);
    }
  }, [fairFilter, q]);

  // Özet aramadan bağımsız: seçili fuarın tamamını anlatır.
  const loadSummary = useCallback(() => {
    tradeFairService.summary(fairFilter).then(setSummary).catch(() => undefined);
  }, [fairFilter]);

  const reload = () => {
    void loadList(1);
    loadSummary();
  };

  useEffect(() => {
    const t = setTimeout(() => void loadList(1), 250);
    return () => clearTimeout(t);
  }, [loadList]);

  useEffect(loadSummary, [loadSummary]);

  useEffect(() => {
    tradeFairService.staff().then(setStaff).catch(() => setStaff([]));
    tradeFairService.departments().then(setDepartmentList).catch(() => setDepartmentList([]));
  }, []);

  const loadAttachments = useCallback(async (recordId: string) => {
    const res = await fileService.links({ entityType: ENTITY, entityId: recordId, pageSize: 100 });
    setAttachments(
      res.data.map((l: any) => ({
        id: l.id,
        fileId: l.file.id,
        filename: l.file.originalFilename,
        mimeType: l.file.mimeType,
        uploadedBy: l.file.uploadedBy,
      })),
    );
  }, []);

  const categoryOptions = useMemo(() => options(distinct(products.map((p) => p.category))), [products]);
  // CRM ürünleri isteğe bağlı ve birden çok. Kayıttaki ürün kullanıcının bölüm
  // kataloğunda yoksa (başka bölümün ürünü) sunucudan gelen adıyla gösterilir.
  const productLabel = (p: (typeof products)[number]) => [p.brand, p.modelName || p.model].filter(Boolean).join(" ");
  const productNames = useMemo(() => {
    const names = new Map<string, string>(editing?.products.map((p) => [p.id, p.name]) ?? []);
    for (const p of products) names.set(p.id, productLabel(p));
    return names;
  }, [products, editing?.products]);
  const productOptions = useMemo(
    () =>
      products
        .filter((p) => !form.productModelIds.includes(p.id))
        .map((p) => ({ value: p.id, label: productLabel(p), hint: [p.model, p.type].filter(Boolean).join(" · ") })),
    [products, form.productModelIds],
  );
  const addProduct = (value: string) => {
    if (!value || form.productModelIds.includes(value)) return;
    const product = products.find((p) => p.id === value);
    // Kategori boşsa ilk üründen doldurulur; elle yazılanın üstüne yazılmaz.
    setForm((f) => ({
      ...f,
      productModelIds: [...f.productModelIds, value],
      productCategory: f.productCategory || product?.category || "",
    }));
  };
  const removeProduct = (id: string) => setForm((f) => ({ ...f, productModelIds: f.productModelIds.filter((x) => x !== id) }));
  const [companyDialogOpen, setCompanyDialogOpen] = useState(false);
  const canAddToCompanies = isManager || hasPermission("contacts.create");
  const provinceOptions = useMemo(() => options(provincesForCountry(form.country)), [form.country]);
  const districtOptions = useMemo(() => options(districtsForCountry(form.country, form.province ?? "")), [form.country, form.province]);
  const fairOptions = useMemo(() => options(summary.fairs.map((f) => f.name)), [summary.fairs]);
  const totalPeople = summary.byUser.reduce((sum, u) => sum + u.people, 0);
  const totalMeetings = summary.byUser.reduce((sum, u) => sum + u.meetings, 0);
  // Görüşen çalışan sonradan silindiyse aktif listede yok; seçim boş görünmesin.
  const staffOptions =
    editing?.metByUserId && !staff.some((s) => s.id === editing.metByUserId)
      ? [...staff, { id: editing.metByUserId, fullName: `${editing.metByName ?? "Silinmiş kullanıcı"} (ayrıldı)` }]
      : staff;

  const set = <K extends keyof TradeFairContactBody>(key: K, value: TradeFairContactBody[K]) => setForm((f) => ({ ...f, [key]: value }));

  const openCreate = () => {
    setEditing(null);
    // Departman zorunlu; kullanıcının birincil departmanı önerilir.
    const primaryDepartment = user?.departments?.find((d) => d.isPrimary)?.id ?? user?.departments?.[0]?.id ?? "";
    setForm(emptyForm(fairFilter ?? summary.fairs[0]?.name ?? "", user?.id ?? "", primaryDepartment));
    setPending([]);
    setAttachments([]);
    setDialogOpen(true);
  };

  const openEdit = (row: TradeFairContactDTO) => {
    setEditing(row);
    setForm({
      ...emptyForm(),
      ...Object.fromEntries(Object.keys(emptyForm()).map((k) => [k, (row as any)[k] ?? (emptyForm() as any)[k]])),
      productModelIds: row.products.map((p) => p.id),
    } as TradeFairContactBody);
    setPending([]);
    setAttachments([]);
    setDialogOpen(true);
    loadAttachments(row.id).catch(() => toast.error("Ekler yüklenemedi"));
  };

  const pickFiles = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    const bad = files.find((f) => !EXT_TO_MIME[fileExt(f.name)] || f.size > MAX_BYTES);
    if (bad) toast.error("Dosya eklenemedi", { description: `${bad.name}: PDF, DOCX, XLSX, PNG, JPG veya WEBP; en fazla 25 MB.` });
    setPending((list) => [...list, ...files.filter((f) => f !== bad && EXT_TO_MIME[fileExt(f.name)] && f.size <= MAX_BYTES)]);
  };

  // Sunucuyla aynı şema: arayüz ile API farklı şeyi kabul etmesin.
  const parsed = tradeFairContactCreateSchema.safeParse(form);
  const issuePaths = new Set(parsed.success ? [] : parsed.error.issues.map((issue) => String(issue.path[0])));
  const phoneOk = !issuePaths.has("mobilePhone");
  const emailOk = !issuePaths.has("email");
  // Not ya da ek (yeni seçilen veya kayıtta var olan) zorunlu; ikisi birden gerekmez.
  const hasNoteOrAttachment = !!form.notes?.trim() || pending.length > 0 || attachments.length > 0;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!parsed.success) {
      toast.error("Eksik bilgi", { description: parsed.error.issues[0]?.message ?? "Formu kontrol edin." });
      return;
    }
    if (!hasNoteOrAttachment) {
      toast.error("Eksik bilgi", { description: TRADE_FAIR_NOTE_OR_ATTACHMENT_MESSAGE });
      return;
    }
    setSaving(true);
    try {
      const body = parsed.data as TradeFairContactBody;
      const saved = editing ? await tradeFairService.update(editing.id, body) : await tradeFairService.create(body);
      const failed: string[] = [];
      for (const [index, file] of pending.entries()) {
        const step = `${index + 1}/${pending.length}`;
        for (let attempt = 0; ; attempt += 1) {
          setUploadNote(`Yükleniyor ${step}…`);
          try {
            await uploadAttachment(saved.id, file);
            break;
          } catch (err: any) {
            if (isRateLimited(err) && attempt < RATE_LIMIT_RETRIES) {
              setUploadNote(`Yükleme sınırı: ${step} için ${RATE_LIMIT_WAIT_MS / 1000} sn bekleniyor…`);
              await sleep(RATE_LIMIT_WAIT_MS);
              continue;
            }
            failed.push(err?.message ?? file.name);
            break;
          }
        }
      }
      setUploadNote(null);
      if (failed.length) toast.error("Bazı dosyalar yüklenemedi", { description: failed.join("\n") });
      toast.success(editing ? "Fuar kaydı güncellendi" : "Fuar görüşmesi eklendi", { description: `${saved.companyName} · ${saved.contactName}` });
      setDialogOpen(false);
      if (!fairFilter || fairFilter === saved.fairName) reload();
      else setFair(saved.fairName);
    } catch (err: any) {
      toast.error("Kaydedilemedi", { description: err?.message ?? "İstek başarısız oldu." });
    } finally {
      setSaving(false);
      setUploadNote(null);
    }
  };

  const removeAttachment = async (item: Attachment) => {
    try {
      await fileService.remove(item.fileId);
      setAttachments((list) => list.filter((a) => a.id !== item.id));
    } catch (err: any) {
      toast.error("Dosya silinemedi", { description: err?.message });
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await tradeFairService.remove(deleting.id);
      toast.success("Fuar kaydı silindi");
      setDeleting(null);
      reload();
    } catch (err: any) {
      toast.error("Silinemedi", { description: err?.message });
    }
  };

  const canDeleteRow = (row: TradeFairContactDTO) => canDelete && (isManager || row.createdBy === user?.id);
  const location = (row: TradeFairContactDTO) =>
    [row.district, row.province, row.country !== "Türkiye" ? row.country : null].filter(Boolean).join(" / ") || "—";

  return (
    <div className="space-y-4">
      <Card className="premium-blueprint overflow-hidden border-border/75">
        <CardContent className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-4">
          <InsightStat label="Fuar" value={summary.fairs.length} detail="kayıtlı fuar" icon={<Store className="size-3.5" />} />
          <InsightStat label="Görüşme" value={totalMeetings} detail={fairFilter ?? "tüm fuarlar"} icon={<Building2 className="size-3.5" />} />
          <InsightStat label="Görüşülen kişi" value={totalPeople} detail="ziyaretçi toplamı" icon={<Users className="size-3.5" />} tone="success" />
          <InsightStat label="Ekip" value={summary.byUser.length} detail="görüşme yapan çalışan" icon={<Users className="size-3.5" />} />
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-white p-3 shadow-xs">
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <Select value={fair} onValueChange={setFair}>
            <SelectTrigger className="h-9 w-full bg-white sm:w-60" aria-label="Fuar seçin"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Tüm fuarlar</SelectItem>
              {summary.fairs.map((f) => (
                <SelectItem key={f.name} value={f.name}>{f.name} ({f.total})</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative min-w-0 flex-1 sm:w-72">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Firma, yetkili, telefon, il, ürün ara..." className="h-9 bg-white pl-9" />
          </div>
        </div>
        {canCreate && (
          <Button className="h-9 gap-1.5" onClick={openCreate}>
            <Plus className="size-4" /> Yeni Görüşme
          </Button>
        )}
      </div>

      {summary.byUser.length > 0 && (
        <Card className="border-border/70">
          <CardContent className="p-4">
            <div className="font-data text-[9px] font-semibold uppercase tracking-[0.15em] text-operation-blue">Kim kaç kişiyle görüştü</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {summary.byUser.map((u) => (
                <div key={u.userId ?? "none"} className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2">
                  <div className="text-[12px] font-semibold">{u.fullName ?? "Belirtilmemiş"}</div>
                  <div className="text-[11px] text-muted-foreground">
                    <span className="font-semibold text-foreground tabular-nums">{u.meetings}</span> firma ·{" "}
                    <span className="font-semibold text-foreground tabular-nums">{u.people}</span> kişi
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {loading && rows.length === 0 ? (
        <div className="grid place-items-center py-16 text-muted-foreground"><Loader2 className="size-5 animate-spin" /></div>
      ) : rows.length === 0 ? (
        <Card className="overflow-hidden border-border/70">
          <EmptyState
            scene="search"
            eyebrow="Fuar"
            title={q || fairFilter ? "Eşleşen görüşme bulunamadı" : "Henüz fuar görüşmesi yok"}
            description={canCreate ? "Standa gelen firmaları “Yeni Görüşme” ile kaydedin." : "Kayıt eklendiğinde burada listelenir."}
          />
        </Card>
      ) : (
        <Card className="surface-enter overflow-hidden border-border/60 shadow-sm">
          <Table className="w-full table-fixed">
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="md:w-[24%]">Firma / Yetkili</TableHead>
                <TableHead className="hidden w-[20%] md:table-cell">İletişim</TableHead>
                <TableHead className="hidden w-[14%] lg:table-cell">Konum</TableHead>
                <TableHead className="w-[38%] md:w-[20%]">Ürün</TableHead>
                <TableHead className="hidden w-[14%] sm:table-cell">Görüşen</TableHead>
                <TableHead className="w-20 px-1" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id} className="cursor-pointer" onClick={() => openEdit(row)}>
                  <TableCell className="truncate">
                    <div className="truncate font-medium" title={row.companyName}>{row.companyName}</div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {row.contactName}{row.contactTitle ? ` · ${row.contactTitle}` : ""}
                    </div>
                    {!fairFilter && <Badge variant="outline" className="mt-1 h-5 max-w-full truncate text-[9px]">{row.fairName}</Badge>}
                  </TableCell>
                  <TableCell className="hidden text-[12px] md:table-cell">
                    {row.mobilePhone && <div className="flex items-center gap-1 truncate"><Phone className="size-3 shrink-0" /> {row.mobilePhone}</div>}
                    {row.email && <div className="flex items-center gap-1 truncate text-muted-foreground"><Mail className="size-3 shrink-0" /> {row.email}</div>}
                    {!row.mobilePhone && !row.email && "—"}
                  </TableCell>
                  <TableCell className="hidden truncate text-muted-foreground lg:table-cell" title={location(row)}>
                    <span className="inline-flex items-center gap-1"><MapPin className="size-3 shrink-0" /> {location(row)}</span>
                  </TableCell>
                  <TableCell className="truncate text-[12px]">
                    <div className="truncate" title={row.products.map((p) => p.name).join(", ") || undefined}>
                      {row.products[0]?.name || row.productCategory || "—"}
                      {row.products.length > 1 ? <span className="text-muted-foreground"> +{row.products.length - 1}</span> : null}
                    </div>
                    <div className="truncate text-[11px] text-muted-foreground">{row.products.length ? row.productCategory : null}</div>
                    {row.companyId && row.contactId ? (
                      <Badge variant="outline" className="mt-1 h-5 gap-1 text-[9px] text-success"><Building2 className="size-3" /> Firmalar'da</Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="hidden truncate text-[12px] sm:table-cell">
                    <div className="truncate">{row.metByName ?? "—"}</div>
                    <div className="truncate text-[11px] text-muted-foreground">{[`${row.visitorCount} kişi`, row.departmentName].filter(Boolean).join(" · ")}</div>
                  </TableCell>
                  <TableCell className="px-1" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      {canUpdate && (
                        <Button variant="ghost" size="icon" className="size-7" aria-label={`${row.companyName} kaydını düzenle`} onClick={() => openEdit(row)}>
                          <Pencil className="size-3.5" />
                        </Button>
                      )}
                      {canDeleteRow(row) && (
                        <Button variant="ghost" size="icon" className="size-7" aria-label={`${row.companyName} kaydını sil`} onClick={() => setDeleting(row)}>
                          <Trash2 className="size-3.5 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex items-center justify-between gap-3 border-t border-border/60 px-4 py-2.5 text-[12px] text-muted-foreground">
            <span><span className="font-semibold text-foreground tabular-nums">{rows.length}</span> / {total} kayıt gösteriliyor</span>
            {rows.length < total && (
              <Button variant="outline" size="sm" disabled={loading} onClick={() => void loadList(page + 1)}>
                {loading ? <Loader2 className="size-4 animate-spin" /> : "Daha fazla yükle"}
              </Button>
            )}
          </div>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Fuar Görüşmesi" : "Yeni Fuar Görüşmesi"}</DialogTitle>
            <DialogDescription>Standa gelen firmayı, yetkilisini ve ilgilendiği ürünü kaydedin.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} noValidate className="space-y-4">
            <fieldset disabled={!!editing && !canUpdate} className="space-y-4">
              <div>
                <Label>Fuar adı *</Label>
                <Combobox
                  ariaLabel="Fuar adı"
                  className="mt-1.5"
                  options={withCurrent(fairOptions, form.fairName)}
                  value={form.fairName}
                  onChange={(v) => set("fairName", v)}
                  placeholder="Fuar seçin veya yeni ad yazın"
                  searchPlaceholder="Fuar ara…"
                  emptyText="Fuar bulunamadı"
                  onCreate={(v) => set("fairName", v)}
                  createLabel={(v) => `"${v}" fuarını kullan`}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="tf-company">Firma adı *</Label>
                  <Input id="tf-company" className="mt-1.5" maxLength={255} value={form.companyName} onChange={(e) => set("companyName", e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="tf-contact">Firma yetkilisi ad soyad *</Label>
                  <Input id="tf-contact" className="mt-1.5" maxLength={200} value={form.contactName} onChange={(e) => set("contactName", e.target.value)} />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label htmlFor="tf-title">Görevi</Label>
                  <Input id="tf-title" className="mt-1.5" maxLength={120} placeholder="Satın alma müdürü" value={form.contactTitle ?? ""} onChange={(e) => set("contactTitle", e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="tf-phone">Cep telefonu</Label>
                  <Input id="tf-phone" className="mt-1.5" inputMode="tel" maxLength={32} placeholder="05xx xxx xx xx" aria-invalid={!phoneOk} value={form.mobilePhone ?? ""} onChange={(e) => set("mobilePhone", e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="tf-email">E-posta</Label>
                  <Input id="tf-email" className="mt-1.5" type="email" inputMode="email" maxLength={254} placeholder="ornek@firma.com" aria-invalid={!emailOk} value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label>Ülke</Label>
                  <Combobox
                    ariaLabel="Ülke"
                    className="mt-1.5"
                    options={withCurrent(options(COUNTRY_OPTIONS), form.country)}
                    value={form.country}
                    onChange={(v) => setForm((f) => ({ ...f, country: v || "Türkiye", province: "", district: "" }))}
                    placeholder="Ülke seçin"
                    searchPlaceholder="Ülke ara…"
                    emptyText="Ülke bulunamadı"
                    onCreate={(v) => setForm((f) => ({ ...f, country: v, province: "", district: "" }))}
                    createLabel={(v) => `"${v}" ülkesini kullan`}
                  />
                </div>
                <div>
                  <Label>İl</Label>
                  <Combobox
                    ariaLabel="İl"
                    className="mt-1.5"
                    options={withCurrent(provinceOptions, form.province)}
                    value={form.province ?? ""}
                    onChange={(v) => setForm((f) => ({ ...f, province: v, district: "" }))}
                    placeholder="İl seçin veya yazın"
                    searchPlaceholder="İl ara…"
                    emptyText="İl bulunamadı"
                    onCreate={(v) => setForm((f) => ({ ...f, province: v, district: "" }))}
                    createLabel={(v) => `"${v}" ilini kullan`}
                  />
                </div>
                <div>
                  <Label>İlçe</Label>
                  <Combobox
                    ariaLabel="İlçe"
                    className="mt-1.5"
                    options={withCurrent(districtOptions, form.district)}
                    value={form.district ?? ""}
                    onChange={(v) => set("district", v)}
                    placeholder={form.province ? "İlçe seçin veya yazın" : "Önce il seçin"}
                    searchPlaceholder="İlçe ara…"
                    emptyText="İlçe bulunamadı"
                    onCreate={(v) => set("district", v)}
                    createLabel={(v) => `"${v}" ilçesini kullan`}
                  />
                </div>
              </div>
              <div>
                <Label>CRM ürünleri <span className="font-normal text-muted-foreground">(isteğe bağlı, birden çok seçilebilir)</span></Label>
                {form.productModelIds.length > 0 ? (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {form.productModelIds.map((id) => (
                      <Badge key={id} variant="secondary" className="h-7 max-w-full gap-1 pr-1">
                        <span className="truncate">{productNames.get(id) ?? "Seçili ürün"}</span>
                        <button type="button" aria-label={`${productNames.get(id) ?? "Ürün"} ürününü çıkar`} onClick={() => removeProduct(id)}>
                          <X className="size-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                ) : null}
                <Combobox
                  ariaLabel="CRM ürünü ekle"
                  className="mt-1.5"
                  options={productOptions}
                  value=""
                  onChange={addProduct}
                  placeholder={form.productModelIds.length ? "Başka ürün ekle" : "CRM'den ürün seçin (boş bırakılabilir)"}
                  searchPlaceholder="Marka, model ara…"
                  emptyText="Ürün bulunamadı"
                />
              </div>
              <div>
                <Label>Ürün kategorisi</Label>
                <Combobox
                  ariaLabel="Ürün kategorisi"
                  className="mt-1.5"
                  options={withCurrent(categoryOptions, form.productCategory)}
                  value={form.productCategory ?? ""}
                  onChange={(v) => set("productCategory", v)}
                  placeholder="Kategori seçin veya yazın"
                  searchPlaceholder="Kategori ara…"
                  emptyText="Kategori bulunamadı"
                  onCreate={(v) => set("productCategory", v)}
                  createLabel={(v) => `"${v}" kategorisini kullan`}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_120px]">
                <div>
                  <Label>Departman *</Label>
                  <Select value={form.departmentId ?? ""} onValueChange={(v) => set("departmentId", v)}>
                    <SelectTrigger className="mt-1.5" aria-label="Departman" aria-invalid={issuePaths.has("departmentId")}>
                      <SelectValue placeholder="Departman seçin" />
                    </SelectTrigger>
                    <SelectContent>
                      {withDepartment(departmentList, editing).map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Görüşen</Label>
                  <Select value={form.metByUserId ?? ""} onValueChange={(v) => set("metByUserId", v)}>
                    <SelectTrigger className="mt-1.5" aria-label="Görüşen"><SelectValue placeholder="Çalışan seçin" /></SelectTrigger>
                    <SelectContent>
                      {staffOptions.map((s) => <SelectItem key={s.id} value={s.id}>{s.fullName}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="tf-count">Görüşülen kişi</Label>
                  <Input id="tf-count" className="mt-1.5" type="number" min={1} max={999} value={form.visitorCount} onChange={(e) => set("visitorCount", Number(e.target.value))} />
                </div>
              </div>
              <div>
                <Label htmlFor="tf-notes">
                  Not {hasNoteOrAttachment ? null : <span className="font-normal text-muted-foreground">(ya da fotoğraf/dosya ekleyin)</span>}
                </Label>
                <Textarea id="tf-notes" className="mt-1.5" rows={4} maxLength={4000} placeholder="Görüşme notları, talep, bütçe, takip…" value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
              </div>
            </fieldset>

            <div>
              <Label>Fotoğraf ve dosyalar</Label>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                {attachments.map((a) => (
                  <AttachmentTile key={a.id} item={a} canDelete={a.uploadedBy === user?.id} onDelete={() => void removeAttachment(a)} />
                ))}
                {pending.map((file, i) => (
                  <Badge key={`${file.name}-${i}`} variant="outline" className="h-7 gap-1 pr-1">
                    <Paperclip className="size-3" /> <span className="max-w-40 truncate">{file.name}</span>
                    <button type="button" aria-label={`${file.name} dosyasını çıkar`} onClick={() => setPending((list) => list.filter((_, j) => j !== i))}>
                      <X className="size-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              {(!editing || canUpdate) && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {/* capture telefonda doğrudan kamerayı açar ve tek çekime izin verir; galeriden
                      çoklu seçim için ayrı, capture'sız bir seçici var. */}
                  <input ref={cameraRef} type="file" accept="image/png,image/jpeg,image/webp" capture="environment" className="hidden" onChange={pickFiles} />
                  <input ref={photoRef} type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" onChange={pickFiles} />
                  <input ref={docRef} type="file" accept={DOC_ACCEPT} multiple className="hidden" onChange={pickFiles} />
                  <Button type="button" variant="outline" size="sm" className="gap-1.5 sm:hidden" onClick={() => cameraRef.current?.click()}>
                    <Camera className="size-4" /> Kamera
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => photoRef.current?.click()}>
                    <Images className="size-4" /> Fotoğraflar
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => docRef.current?.click()}>
                    <Paperclip className="size-4" /> Dosya
                  </Button>
                  <span className="self-center text-[11px] text-muted-foreground">Birden çok seçilebilir · Kaydet'e basınca yüklenir · PDF, DOCX, XLSX, PNG, JPG, WEBP · dosya başına en fazla 25 MB</span>
                </div>
              )}
            </div>

            {editing ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 bg-muted/30 p-3">
                <div className="min-w-0 text-[12px]">
                  <div className="font-semibold">Firmalar</div>
                  <div className="truncate text-muted-foreground">
                    {editing.companyId && editing.contactId
                      ? `Firmalar'a eklendi: ${editing.linkedCompanyName ?? "firma"}`
                      : editing.companyId
                        ? "Firma açıldı, yetkili kontak olarak eklenemedi; tekrar deneyebilirsiniz."
                        : "Bu firma henüz Firmalar listesinde değil."}
                  </div>
                </div>
                {editing.companyId && editing.contactId ? (
                  onOpenCompany ? (
                    <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => onOpenCompany(editing.companyId!)}>
                      <ExternalLink className="size-4" /> Firmayı aç
                    </Button>
                  ) : null
                ) : canAddToCompanies ? (
                  <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setCompanyDialogOpen(true)}>
                    <Building2 className="size-4" /> Firmalara ekle
                  </Button>
                ) : null}
              </div>
            ) : null}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Kapat</Button>
              {(!editing || canUpdate) && (
                <Button type="submit" disabled={saving}>{saving ? uploadNote ?? "Kaydediliyor..." : editing ? "Kaydet" : "Görüşmeyi Ekle"}</Button>
              )}
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {editing ? (
        <AddToCompaniesDialog
          open={companyDialogOpen}
          onOpenChange={setCompanyDialogOpen}
          record={editing}
          canCreateCompany={isManager || hasPermission("companies.create")}
          onAdded={(updated) => {
            // Yanıtta görüşen/departman adı yok; açık kaydın geri kalanı korunur.
            setEditing((current) => (current ? { ...current, ...updated } : updated));
            reload();
          }}
          onFailed={reload}
        />
      ) : null}

      <Dialog open={!!deleting} onOpenChange={(open) => { if (!open) setDeleting(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Fuar kaydını sil</DialogTitle>
            <DialogDescription>{deleting?.companyName} · {deleting?.contactName} kaydı listeden kaldırılacak.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>Vazgeç</Button>
            <Button variant="destructive" onClick={() => void confirmDelete()}>Sil</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Fuar kaydını Firmalar'a ekler: yeni firma (potansiyel, kaynak Fuar) ya da
 * mevcut firmaya kontak olarak. Aynı ünvanlı firma varsa sunucu yeni firma
 * açmaz; diyalog o firmaya bağlamayı önerir.
 */
function AddToCompaniesDialog({
  open,
  onOpenChange,
  record,
  canCreateCompany,
  onAdded,
  onFailed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: TradeFairContactDTO;
  canCreateCompany: boolean;
  onAdded: (updated: TradeFairContactDTO) => void;
  /** Hata sonrası liste tazelenir: firma açılıp kontak düştüyse kayıt artık firmaya bağlı. */
  onFailed: () => void;
}) {
  const { user, activeDivision } = useAuth();
  const divisions = user?.divisions ?? [];
  const defaultDivision =
    activeDivision && activeDivision !== "all" ? activeDivision : divisions.find((d) => d.isPrimary)?.id ?? divisions[0]?.id ?? "";
  const [mode, setMode] = useState<"new" | "existing">(canCreateCompany ? "new" : "existing");
  const [divisionId, setDivisionId] = useState(defaultDivision);
  const [companyId, setCompanyId] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode(canCreateCompany ? "new" : "existing");
    setDivisionId(defaultDivision);
    setCompanyId("");
  }, [open, canCreateCompany, defaultDivision]);

  const submit = async () => {
    if (mode === "existing" && !companyId) {
      toast.error("Firma seçin");
      return;
    }
    setBusy(true);
    try {
      const updated = await tradeFairService.addToCompanies(
        record.id,
        mode === "existing" ? { companyId } : { divisionIds: divisionId ? [divisionId] : undefined },
      );
      toast.success("Firmalar'a eklendi", { description: `${record.companyName} · ${record.contactName}` });
      onAdded(updated);
      onOpenChange(false);
    } catch (err) {
      const details = err instanceof ApiError ? (err.details as { duplicateCompanyId?: string; accessRequestId?: string } | undefined) : undefined;
      // Başka bölümdeki mükerrer firmada sunucu erişim talebi açar; o firma henüz
      // görünmediği için bağlama önerilmez, sunucunun mesajı gösterilir.
      const duplicateId = details?.accessRequestId ? undefined : details?.duplicateCompanyId;
      if (duplicateId) {
        // Aynı ünvanlı firma zaten var: yeni firma yerine ona bağlamayı öner.
        setMode("existing");
        setCompanyId(duplicateId);
        toast.error("Bu ünvanla firma zaten kayıtlı", { description: "Yetkiliyi mevcut firmaya kontak olarak ekleyebilirsiniz." });
      } else {
        toast.error("Firmalara eklenemedi", { description: err instanceof Error ? err.message : "İstek başarısız oldu." });
      }
      onFailed();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Firmalara ekle</DialogTitle>
          <DialogDescription>
            {record.companyName} ve yetkilisi {record.contactName} normal firma/kontak kaydına dönüşür.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant={mode === "new" ? "default" : "outline"} disabled={!canCreateCompany} onClick={() => setMode("new")}>
              Yeni firma
            </Button>
            <Button type="button" variant={mode === "existing" ? "default" : "outline"} onClick={() => setMode("existing")}>
              Mevcut firmaya bağla
            </Button>
          </div>
          {mode === "new" ? (
            <>
              <p className="text-[12px] text-muted-foreground">
                Ünvan, ülke/il/ilçe fuar kaydından alınır; firma potansiyel müşteri, kaynağı Fuar olarak açılır.
                Yetkili bu firmanın kontağı olur.
              </p>
              {divisions.length > 1 ? (
                <div>
                  <Label>Bölüm</Label>
                  <Select value={divisionId} onValueChange={setDivisionId}>
                    <SelectTrigger className="mt-1.5" aria-label="Bölüm"><SelectValue placeholder="Bölüm seçin" /></SelectTrigger>
                    <SelectContent>
                      {divisions.map((d) => (
                        <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </>
          ) : (
            <div>
              <Label>Firma</Label>
              <RemoteCompanyCombobox className="mt-1.5" value={companyId} onValueChange={setCompanyId} placeholder="Kayıtlı firmayı seçin" />
              <p className="mt-1.5 text-[11px] text-muted-foreground">Yetkili seçilen firmaya kontak olarak eklenir.</p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Vazgeç</Button>
          <Button type="button" onClick={() => void submit()} disabled={busy}>{busy ? "Ekleniyor…" : "Firmalara ekle"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
