import { useEffect, useMemo, useRef, useState } from "react";
import {
  PIPELINE_STAGES,
  type PipelineStageCode,
  type TrelloCompanyCandidate,
  type TrelloCompanyResolution,
} from "@haksan/shared";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  FileCheck2,
  FileSpreadsheet,
  GitCompareArrows,
  Link2,
  Loader2,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  SkipForward,
  Upload,
  UserRound,
  Workflow,
} from "lucide-react";
import { toast } from "sonner";
import {
  opportunityService,
  type TrelloImportPreview,
  type TrelloImportPreviewRow,
} from "../../../lib/services";
import { useAuth } from "../../../lib/auth";
import { useStore } from "../../lib/store";
import { salesStageLabel } from "../../lib/mock";
import { EditCustomerDialog } from "./CreateDialogs";
import { RemoteCompanyCombobox } from "../shared/RemoteCompanyCombobox";
import { useCompanyDetail } from "../../lib/companyServerData";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

const MAX_CSV_BYTES = 2 * 1024 * 1024;
const NO_LIST = "__trello_no_list__";

type PendingResolution = { action: "pending" };
type RowResolution = PendingResolution | TrelloCompanyResolution;

function ExistingCompanyResolutionControl({
  row,
  candidate,
  resolution,
  canUpdateCompany,
  canCreateContact,
  onResolutionChange,
  onEditCompany,
}: {
  row: TrelloImportPreviewRow;
  candidate: TrelloCompanyCandidate;
  resolution: RowResolution;
  canUpdateCompany: boolean;
  canCreateContact: boolean;
  onResolutionChange: (resolution: RowResolution) => void;
  onEditCompany: (companyId: string) => void;
}) {
  const selectedCompanyId = resolution.action === "existing" ? resolution.companyId : "";
  const selectedMatch = row.matches.find((match) => match.id === selectedCompanyId);
  const selectedCompanyQuery = useCompanyDetail(selectedMatch ? null : selectedCompanyId);
  const selectedCompany = selectedCompanyQuery.data;
  const selectedCompanyName = selectedMatch?.legalTitle ?? selectedCompany?.name;
  const existingPhone = selectedMatch?.primaryPhone ?? selectedCompany?.phone;
  const existingEmail = selectedMatch?.primaryEmail ?? selectedCompany?.email;

  return (
    <>
      <div>
        <Label className="text-[11px]">CRM’de manuel firma seç</Label>
        <RemoteCompanyCombobox
          value={selectedCompanyId}
          onValueChange={(companyId) => onResolutionChange({
            action: "existing",
            companyId,
            createContact: false,
            addSecondaryPhone: false,
            addSecondaryEmail: false,
          })}
          className="mt-1 h-8 bg-white text-xs"
          placeholder="Firma ara / seç"
        />
        {selectedCompanyId && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="mt-1 h-7 px-2 text-[11px] text-muted-foreground"
            onClick={() => onResolutionChange({ action: "pending" })}
          >
            Seçimi kaldır
          </Button>
        )}
      </div>

      {resolution.action === "existing" && (
        <div className="space-y-3 rounded-lg border border-operation-blue/20 bg-white p-3">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <CheckCircle2 className="size-4 text-success" />
            {selectedCompanyName ?? (selectedCompanyQuery.isPending ? "Firma bilgisi yükleniyor…" : "Seçilen CRM firması")}
            {canUpdateCompany && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="ml-auto h-7 px-2 text-[11px]"
                onClick={() => onEditCompany(selectedCompanyId)}
              >
                Firma kartını düzenle
              </Button>
            )}
          </div>
          <div className="grid min-w-0 grid-cols-2 gap-2 text-[11px]">
            <div className="min-w-0 rounded-md bg-muted/35 p-2">
              <div className="font-medium text-muted-foreground">CRM korunacak</div>
              <div className="mt-1 break-all">{existingPhone || "Telefon yok"}</div>
              <div className="break-all">{existingEmail || "E-posta yok"}</div>
            </div>
            <div className="min-w-0 rounded-md bg-operation-blue/[0.05] p-2">
              <div className="font-medium text-operation-blue">Trello’dan gelen</div>
              <div className="mt-1 break-all">{candidate.phone || "Telefon yok"}</div>
              <div className="break-all">{candidate.email || "E-posta yok"}</div>
            </div>
          </div>

          {canUpdateCompany && candidate.phone && candidate.phone !== existingPhone && (
            <label className="flex cursor-pointer items-start gap-2 text-xs">
              <Checkbox
                checked={resolution.addSecondaryPhone}
                onCheckedChange={(checked) =>
                  onResolutionChange({ ...resolution, addSecondaryPhone: checked === true })
                }
              />
              <span>
                {existingPhone
                  ? "Trello telefonunu ikincil telefon olarak ekle"
                  : "CRM’deki boş telefon alanını Trello değeriyle doldur"}
              </span>
            </label>
          )}
          {canUpdateCompany && candidate.email && candidate.email !== existingEmail && (
            <label className="flex cursor-pointer items-start gap-2 text-xs">
              <Checkbox
                checked={resolution.addSecondaryEmail}
                onCheckedChange={(checked) =>
                  onResolutionChange({ ...resolution, addSecondaryEmail: checked === true })
                }
              />
              <span>
                {existingEmail
                  ? "Trello e-postasını ikincil e-posta olarak ekle"
                  : "CRM’deki boş e-posta alanını Trello değeriyle doldur"}
              </span>
            </label>
          )}
          {canCreateContact && candidate.contactName && !resolution.primaryContactId && (
            <label className="flex cursor-pointer items-start gap-2 text-xs">
              <Checkbox
                checked={resolution.createContact}
                onCheckedChange={(checked) =>
                  onResolutionChange({ ...resolution, createContact: checked === true })
                }
              />
              <span>{candidate.contactName} için yeni kontak oluştur</span>
            </label>
          )}
        </div>
      )}
    </>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.includes(",") ? result.split(",").pop() ?? "" : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function listKey(row: Pick<TrelloImportPreviewRow, "listName">) {
  return row.listName?.trim() || NO_LIST;
}

function rowKey(row: Pick<TrelloImportPreviewRow, "rowNumber" | "externalReference">) {
  return `${row.rowNumber}:${row.externalReference}`;
}

function statusMeta(row: TrelloImportPreviewRow) {
  if (row.status === "create") return { label: "Firma kararı gerekli", variant: "default" as const };
  if (row.status === "skip") return { label: "Mükerrer", variant: "outline" as const };
  return { label: "Hatalı", variant: "destructive" as const };
}

function Summary({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "destructive";
}) {
  return (
    <div
      className={
        tone === "destructive"
          ? "rounded-lg border border-destructive/30 bg-destructive/5 p-3"
          : "rounded-lg border border-border/60 bg-white p-3"
      }
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-data text-lg tabular-nums tracking-tight">{value}</div>
    </div>
  );
}

function CandidateField({
  icon: Icon,
  label,
  value,
  placeholder,
  type,
  onChange,
}: {
  icon: typeof Building2;
  label: string;
  value: string;
  placeholder: string;
  type?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="min-w-0">
      <Label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </Label>
      <Input
        type={type}
        className="mt-1 h-8 min-w-0 bg-white text-xs"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

export function TrelloCsvImportDialog() {
  const { activeDivision, hasPermission, hasRole, user } = useAuth();
  const { refresh } = useStore();
  const canImport = hasPermission("opportunities.create") || hasRole("super_admin");
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<TrelloImportPreview | null>(null);
  const [divisionId, setDivisionId] = useState("");
  const [currencyCode, setCurrencyCode] = useState<"USD" | "EUR" | "TRY" | "GBP">("EUR");
  const [stageByList, setStageByList] = useState<Record<string, PipelineStageCode>>({});
  const [candidates, setCandidates] = useState<Record<string, TrelloCompanyCandidate>>({});
  const [resolutions, setResolutions] = useState<Record<string, RowResolution>>({});
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [editingCompanyId, setEditingCompanyId] = useState<string | null>(null);
  const editingCompanyQuery = useCompanyDetail(editingCompanyId);

  const divisions = user?.divisions ?? [];
  const importRows = useMemo(
    () => preview?.rows.filter((row) => row.status === "create") ?? [],
    [preview]
  );
  const unresolvedCount = importRows.filter(
    (row) => !resolutions[rowKey(row)] || resolutions[rowKey(row)].action === "pending"
  ).length;
  const invalidCandidateCount = importRows.filter((row) => {
    const resolution = resolutions[rowKey(row)];
    if (!resolution || resolution.action === "pending" || resolution.action === "skip") return false;
    return !(candidates[rowKey(row)] ?? row.candidate).companyTitle.trim();
  }).length;
  const skippedByDecision = importRows.filter(
    (row) => resolutions[rowKey(row)]?.action === "skip"
  ).length;
  const listMappings = useMemo(() => {
    const map = new Map<string, { key: string; label: string; count: number; suggested: PipelineStageCode }>();
    for (const row of importRows) {
      const key = listKey(row);
      const current = map.get(key);
      map.set(key, {
        key,
        label: key === NO_LIST ? "Liste bilgisi yok" : key,
        count: (current?.count ?? 0) + 1,
        suggested: current?.suggested ?? row.stageCode,
      });
    }
    return Array.from(map.values());
  }, [importRows]);

  useEffect(() => {
    if (!open) return;
    const nextDivision =
      activeDivision && activeDivision !== "all"
        ? activeDivision
        : divisions.find((division) => division.isPrimary)?.id ?? divisions[0]?.id ?? "";
    setDivisionId(nextDivision);
  }, [activeDivision, divisions, open]);

  const reset = () => {
    setFile(null);
    setPreview(null);
    setStageByList({});
    setCandidates({});
    setResolutions({});
    setLoading(false);
    setCommitting(false);
    setEditingCompanyId(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleOpen = (next: boolean) => {
    setOpen(next);
    if (!next) reset();
  };

  const patchCandidate = (
    row: TrelloImportPreviewRow,
    patch: Partial<TrelloCompanyCandidate>
  ) => {
    const key = rowKey(row);
    setCandidates((current) => ({
      ...current,
      [key]: { ...(current[key] ?? row.candidate), ...patch },
    }));
  };

  const setResolution = (row: TrelloImportPreviewRow, resolution: RowResolution) => {
    setResolutions((current) => ({ ...current, [rowKey(row)]: resolution }));
  };

  const previewFile = async (selectedFile: File) => {
    if (!selectedFile.name.toLocaleLowerCase("tr-TR").endsWith(".csv")) {
      toast.error("Yalnızca Trello CSV dosyası seçebilirsiniz");
      return;
    }
    if (selectedFile.size > MAX_CSV_BYTES) {
      toast.error("CSV dosyası 2 MB'ı aşamaz");
      return;
    }
    setLoading(true);
    try {
      const fileBase64 = await fileToBase64(selectedFile);
      const result = await opportunityService.previewTrelloImport({
        fileName: selectedFile.name,
        fileBase64,
      });
      setPreview(result);
      const mappings: Record<string, PipelineStageCode> = {};
      const nextCandidates: Record<string, TrelloCompanyCandidate> = {};
      const nextResolutions: Record<string, RowResolution> = {};
      for (const row of result.rows) {
        if (row.status !== "create") continue;
        if (!mappings[listKey(row)]) mappings[listKey(row)] = row.stageCode;
        nextCandidates[rowKey(row)] = row.candidate;
        nextResolutions[rowKey(row)] = { action: "pending" };
      }
      setStageByList(mappings);
      setCandidates(nextCandidates);
      setResolutions(nextResolutions);
      toast.success("Trello kartları karşılaştırmaya hazır", {
        description: `${result.summary.create} kart için firma kararı gerekiyor; ${result.summary.skip} mükerrer, ${result.summary.error} hatalı.`,
      });
    } catch (error: any) {
      setPreview(null);
      setStageByList({});
      setCandidates({});
      setResolutions({});
      toast.error("Trello CSV okunamadı", {
        description: error?.message ?? "Dosya önizlemesi oluşturulamadı.",
      });
    } finally {
      setLoading(false);
    }
  };

  const commit = async () => {
    if (!preview || !importRows.length || !divisionId || unresolvedCount || invalidCandidateCount) return;
    setCommitting(true);
    try {
      const rows = importRows.map(
        ({ status: _status, errors: _errors, warnings: _warnings, matches: _matches, candidate: original, ...row }) => ({
          ...row,
          stageCode: stageByList[listKey(row)] ?? row.stageCode,
          candidate: candidates[rowKey(row)] ?? original,
          resolution: resolutions[rowKey(row)] as TrelloCompanyResolution,
        })
      );
      const result = await opportunityService.commitTrelloImport({
        divisionId,
        currencyCode,
        rows,
      });
      await refresh();
      if (result.summary.error) {
        toast.warning("Trello aktarımı kısmen tamamlandı", {
          description: `${result.summary.create} satış kartı oluşturuldu, ${result.summary.skip} atlandı, ${result.summary.error} hata oluştu.`,
        });
      } else {
        toast.success("Firma kararlarıyla birlikte aktarıldı", {
          description: `${result.summary.create} satış kartı oluşturuldu, ${result.summary.skip} kart atlandı.`,
        });
      }
      handleOpen(false);
    } catch (error: any) {
      toast.error("Trello aktarımı tamamlanamadı", {
        description: error?.message ?? "API isteği başarısız oldu.",
      });
    } finally {
      setCommitting(false);
    }
  };

  if (!canImport) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="h-9 gap-1.5">
          <Workflow className="size-4" />
          Trello CSV
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[92dvh] w-[min(1180px,calc(100vw-1rem))] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none">
        <DialogHeader className="shrink-0 border-b border-border/70 bg-white px-5 py-4 pr-12">
          <DialogTitle>Trello Kartlarını Firma Kararıyla Aktar</DialogTitle>
          <DialogDescription>
            CRM ana kayıttır. Trello verisini karşılaştırın; her kartı mevcut firmaya bağlayın, yeni Potansiyel firma açın veya atlayın.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden bg-[#f7f8fa] px-4 py-4 sm:px-5">
          <div className="grid gap-2 md:grid-cols-3">
            {[
              [FileSpreadsheet, "Kaynak", "Trello kartı ve açıklaması güvenli biçimde okunur."],
              [GitCompareArrows, "Karşılaştırma", "CRM ünvanı, telefon, e-posta ve konumuyla puanlanır."],
              [ShieldCheck, "Onay", "Güçlü eşleşme bile siz seçmeden bağlanmaz."],
            ].map(([Icon, title, text]) => (
              <div
                key={String(title)}
                className="flex items-start gap-2.5 rounded-lg border border-border/60 bg-white p-3"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-operation-blue/10 text-operation-blue">
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-semibold">{String(title)}</span>
                  <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">
                    {String(text)}
                  </span>
                </span>
              </div>
            ))}
          </div>

          <div className="grid gap-3 rounded-lg border border-border/60 bg-white p-3 md:grid-cols-[minmax(0,1fr)_220px_150px_auto] md:items-end">
            <div className="min-w-0">
              <Label>CSV dosyası</Label>
              <div className="mt-1.5 flex min-h-9 min-w-0 items-center rounded-md border border-border/70 bg-white px-3 text-sm">
                <span className="min-w-0 flex-1 truncate">{file?.name ?? "Dosya seçilmedi"}</span>
                {file && (
                  <span className="shrink-0 pl-3 text-xs text-muted-foreground">
                    {(file.size / 1024).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} KB
                  </span>
                )}
              </div>
              <Input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(event) => {
                  const selected = event.target.files?.[0] ?? null;
                  setFile(selected);
                  setPreview(null);
                  setStageByList({});
                  setCandidates({});
                  setResolutions({});
                  if (selected) void previewFile(selected);
                }}
              />
            </div>
            <div>
              <Label>Bölüm</Label>
              <Select value={divisionId} onValueChange={setDivisionId}>
                <SelectTrigger className="mt-1.5 bg-white">
                  <SelectValue placeholder="Bölüm seçin" />
                </SelectTrigger>
                <SelectContent>
                  {divisions.map((division) => (
                    <SelectItem key={division.id} value={division.id}>
                      {division.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Para birimi</Label>
              <Select
                value={currencyCode}
                onValueChange={(value) => setCurrencyCode(value as typeof currencyCode)}
              >
                <SelectTrigger className="mt-1.5 bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["EUR", "USD", "TRY", "GBP"].map((currency) => (
                    <SelectItem key={currency} value={currency}>
                      {currency}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              className="gap-1.5"
              variant="outline"
              disabled={loading}
              onClick={() => fileRef.current?.click()}
            >
              {loading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              CSV Seç
            </Button>
          </div>

          {!divisions.length && (
            <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-soft p-3 text-sm text-warning">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              Satış kartlarını aktarabilmek için kullanıcıya en az bir bölüm atanmalıdır.
            </div>
          )}

          {preview && (
            <>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
                <Summary label="Toplam" value={preview.summary.total} />
                <Summary label="Karar bekleyen" value={unresolvedCount} tone={unresolvedCount ? "destructive" : "default"} />
                <Summary label="Bilinçli atlanan" value={skippedByDecision} />
                <Summary label="Mükerrer" value={preview.summary.skip} />
                <Summary label="Hatalı" value={preview.summary.error} tone={preview.summary.error ? "destructive" : "default"} />
              </div>

              {listMappings.length > 0 && (
                <div className="rounded-lg border border-primary/15 bg-primary/[0.035]">
                  <div className="border-b border-primary/10 px-3 py-2.5">
                    <div className="text-sm font-semibold">Trello listesi → CRM aşaması</div>
                    <p className="mt-0.5 text-xs text-muted-foreground">Liste eşlemesini firma kararlarından bağımsız düzenleyebilirsiniz.</p>
                  </div>
                  <div className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-3">
                    {listMappings.map((mapping) => (
                      <div key={mapping.key} className="rounded-md border border-border/60 bg-white p-2.5">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <span className="min-w-0 truncate text-xs font-medium" title={mapping.label}>{mapping.label}</span>
                          <Badge variant="outline" className="shrink-0 text-[10px]">{mapping.count} kart</Badge>
                        </div>
                        <Select
                          value={stageByList[mapping.key] ?? mapping.suggested}
                          onValueChange={(value) =>
                            setStageByList((current) => ({ ...current, [mapping.key]: value as PipelineStageCode }))
                          }
                        >
                          <SelectTrigger className="h-8 bg-white text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {PIPELINE_STAGES.filter((stage) => stage !== "lead").map((stage) => (
                              <SelectItem key={stage} value={stage}>{salesStageLabel(stage)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-3">
                {preview.rows.map((row) => {
                  const status = statusMeta(row);
                  const key = rowKey(row);
                  const candidate = candidates[key] ?? row.candidate;
                  const resolution = resolutions[key] ?? { action: "pending" as const };

                  if (row.status !== "create") {
                    return (
                      <div key={key} className="flex min-w-0 items-start gap-3 rounded-xl border border-border/60 bg-white p-4 opacity-75">
                        <FileCheck2 className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium break-words">{row.title}</span>
                            <Badge variant={status.variant}>{status.label}</Badge>
                          </div>
                          <div className="mt-1 break-all text-xs text-muted-foreground">
                            {row.errors.join(", ") || row.warnings.join(", ") || row.cardUrl || row.externalReference}
                          </div>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <article key={key} className="min-w-0 overflow-hidden rounded-xl border border-border/70 bg-white shadow-xs">
                      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3 border-b border-border/60 px-4 py-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-data text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Satır {row.rowNumber}</span>
                            <Badge variant="outline">{salesStageLabel(stageByList[listKey(row)] ?? row.stageCode)}</Badge>
                            {resolution.action === "pending" && <Badge variant="destructive">Karar bekliyor</Badge>}
                            {resolution.action === "existing" && <Badge className="bg-operation-blue">Mevcut firma</Badge>}
                            {resolution.action === "create" && <Badge className="bg-success">Yeni Potansiyel</Badge>}
                            {resolution.action === "skip" && <Badge variant="secondary">Atlanacak</Badge>}
                          </div>
                          <h3 className="mt-1 break-words font-display text-lg font-semibold leading-tight">{row.title}</h3>
                          <div className="mt-1 flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                            <span>{row.boardName || "Pano yok"} / {row.listName || "Liste yok"}</span>
                            {row.cardUrl && (
                              <a className="inline-flex min-w-0 items-center gap-1 text-primary hover:underline" href={row.cardUrl} target="_blank" rel="noreferrer">
                                <Link2 className="size-3 shrink-0" /><span className="max-w-[260px] truncate">Trello kartı</span>
                              </a>
                            )}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant={resolution.action === "create" ? "default" : "outline"}
                            disabled={!preview.capabilities.canCreateCompany}
                            onClick={() =>
                              setResolution(row, {
                                action: "create",
                                createContact: Boolean(preview.capabilities.canCreateContact && candidate.contactName),
                              })
                            }
                          >
                            <Building2 className="size-4" /> Yeni firma
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={resolution.action === "skip" ? "secondary" : "ghost"}
                            onClick={() => setResolution(row, { action: "skip" })}
                          >
                            <SkipForward className="size-4" /> Atla
                          </Button>
                        </div>
                      </div>

                      <div className="grid min-w-0 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.95fr)]">
                        <section className="min-w-0 space-y-3 border-b border-border/60 p-4 lg:border-b-0 lg:border-r">
                          <div>
                            <div className="flex items-center gap-2 text-sm font-semibold">
                              <FileSpreadsheet className="size-4 text-operation-blue" />
                              Trello’dan çıkarılan bilgi
                            </div>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">Bu alanları firma kararından önce düzeltebilirsiniz.</p>
                          </div>
                          <div className="grid min-w-0 gap-2 sm:grid-cols-2">
                            <CandidateField
                              icon={Building2}
                              label="Firma adayı"
                              value={candidate.companyTitle}
                              placeholder="Firma ünvanı"
                              onChange={(value) => patchCandidate(row, { companyTitle: value })}
                            />
                            <CandidateField
                              icon={MapPin}
                              label="Konum ipucu"
                              value={candidate.locationHint ?? ""}
                              placeholder="İl / ilçe"
                              onChange={(value) => patchCandidate(row, {
                                locationHint: value || undefined,
                                province: value || undefined,
                              })}
                            />
                            <CandidateField
                              icon={UserRound}
                              label="Kontak adayı"
                              value={candidate.contactName ?? ""}
                              placeholder="Ad soyad"
                              onChange={(value) => patchCandidate(row, { contactName: value || undefined })}
                            />
                            <CandidateField
                              icon={Phone}
                              label="Telefon"
                              value={candidate.phone ?? ""}
                              placeholder="05xx xxx xx xx"
                              onChange={(value) => patchCandidate(row, { phone: value || undefined })}
                            />
                            <CandidateField
                              icon={Mail}
                              label="E-posta"
                              value={candidate.email ?? ""}
                              placeholder="firma@example.com"
                              type="email"
                              onChange={(value) => patchCandidate(row, { email: value || undefined })}
                            />
                            <CandidateField
                              icon={Link2}
                              label="Web sitesi"
                              value={candidate.website ?? ""}
                              placeholder="https://..."
                              onChange={(value) => patchCandidate(row, { website: value || undefined })}
                            />
                          </div>
                          {row.description && (
                            <div className="min-w-0 rounded-lg bg-muted/35 p-3 text-xs leading-relaxed text-muted-foreground">
                              <div className="mb-1 font-medium text-foreground">Kart açıklaması</div>
                              <div className="max-h-24 overflow-y-auto whitespace-pre-wrap break-words">{row.description}</div>
                            </div>
                          )}
                        </section>

                        <section className="min-w-0 space-y-3 bg-[#fbfcfe] p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2 text-sm font-semibold">
                                <GitCompareArrows className="size-4 text-operation-blue" />
                                CRM ana kayıt
                              </div>
                              <p className="mt-0.5 text-[11px] text-muted-foreground">En fazla üç benzer firma; hiçbirisi otomatik seçilmez.</p>
                            </div>
                            <Badge variant="outline" className="shrink-0">{row.matches.length} öneri</Badge>
                          </div>

                          {row.matches.length > 0 ? (
                            <div className="space-y-2">
                              {row.matches.map((match) => {
                                const selected = resolution.action === "existing" && resolution.companyId === match.id;
                                return (
                                  <button
                                    key={match.id}
                                    type="button"
                                    className={`w-full min-w-0 rounded-lg border p-3 text-left transition-colors ${
                                      selected
                                        ? "border-operation-blue bg-operation-blue/[0.06] ring-1 ring-operation-blue/20"
                                        : "border-border/70 bg-white hover:border-operation-blue/40"
                                    }`}
                                    onClick={() =>
                                      setResolution(row, {
                                        action: "existing",
                                        companyId: match.id,
                                        ...(match.contactMatch ? { primaryContactId: match.contactMatch.id } : {}),
                                        createContact: false,
                                        addSecondaryPhone: false,
                                        addSecondaryEmail: false,
                                      })
                                    }
                                  >
                                    <span className="flex min-w-0 items-start justify-between gap-3">
                                      <span className="min-w-0">
                                        <span className="block break-words text-xs font-semibold">{match.legalTitle}</span>
                                        <span className="mt-1 block text-[11px] text-muted-foreground">{match.reasons.join(" · ")}</span>
                                        {match.contactMatch && (
                                          <span className="mt-1 block text-[11px] text-success">
                                            Kontak: {match.contactMatch.fullName} · {match.contactMatch.reason}
                                          </span>
                                        )}
                                      </span>
                                      <span className={`shrink-0 rounded-md px-2 py-1 font-data text-xs font-semibold ${
                                        match.confidence === "strong"
                                          ? "bg-success-soft text-success"
                                          : "bg-warning-soft text-warning"
                                      }`}>
                                        %{match.score}
                                      </span>
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="rounded-lg border border-dashed border-warning/35 bg-warning-soft/45 p-3 text-xs text-muted-foreground">
                              Yeterli benzerlikte CRM firması bulunamadı. Yeni Potansiyel firma taslağını kontrol edin veya aşağıdan manuel firma arayın.
                            </div>
                          )}

                          <ExistingCompanyResolutionControl
                            row={row}
                            candidate={candidate}
                            resolution={resolution}
                            canUpdateCompany={preview.capabilities.canUpdateCompany}
                            canCreateContact={preview.capabilities.canCreateContact}
                            onResolutionChange={(nextResolution) => setResolution(row, nextResolution)}
                            onEditCompany={setEditingCompanyId}
                          />

                          {resolution.action === "create" && (
                            <div className="rounded-lg border border-success/25 bg-success-soft/50 p-3 text-xs">
                              <div className="flex items-center gap-2 font-semibold text-success">
                                <Building2 className="size-4" /> Yeni Potansiyel firma
                              </div>
                              <div className="mt-1 text-muted-foreground">
                                <b className="text-foreground">{candidate.companyTitle}</b> seçilen bölümde Potansiyel açılır. İlk satış siparişinde Aktif müşteriye dönüşür.
                              </div>
                              {preview.capabilities.canCreateContact && candidate.contactName && (
                                <label className="mt-3 flex cursor-pointer items-start gap-2">
                                  <Checkbox
                                    checked={resolution.createContact}
                                    onCheckedChange={(checked) =>
                                      setResolution(row, { ...resolution, createContact: checked === true })
                                    }
                                  />
                                  <span>{candidate.contactName} kontağını da oluştur</span>
                                </label>
                              )}
                            </div>
                          )}
                        </section>
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <DialogFooter className="shrink-0 border-t border-border/70 bg-white px-5 py-3">
          <div className="mr-auto min-w-0 text-xs text-muted-foreground">
            {preview && invalidCandidateCount > 0
              ? `${invalidCandidateCount} kartta firma adı boş bırakılamaz.`
              : preview && unresolvedCount > 0
              ? `${unresolvedCount} kart için mevcut firma, yeni firma veya atla kararı verin.`
              : preview
                ? "Tüm kart kararları tamamlandı."
                : "Önce CSV dosyasını seçin."}
          </div>
          <Button type="button" variant="outline" onClick={() => handleOpen(false)}>Kapat</Button>
          <Button
            type="button"
            disabled={!preview || !importRows.length || !divisionId || unresolvedCount > 0 || invalidCandidateCount > 0 || committing}
            onClick={commit}
          >
            {committing ? (
              <>
                <Loader2 className="mr-1.5 size-4 animate-spin" />
                Aktarılıyor...
              </>
            ) : (
              `${Math.max(0, importRows.length - skippedByDecision)} Kartı Satışa Aktar`
            )}
          </Button>
        </DialogFooter>
        <EditCustomerDialog
          customer={editingCompanyQuery.data ?? null}
          onClose={() => setEditingCompanyId(null)}
        />
      </DialogContent>
    </Dialog>
  );
}
