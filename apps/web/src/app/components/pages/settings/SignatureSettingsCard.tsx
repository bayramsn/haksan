import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ImageOff, Loader2, Pencil, PenLine, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  SIGNATURE_IMAGE_MAX_BYTES,
  type SignatureView,
} from "@haksan/shared";
import { useAuth } from "../../../../lib/auth";
import { resolveMediaUrl } from "../../../../lib/apiClient";
import { signatureService } from "../../../../lib/services";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Badge } from "../../ui/badge";
import { Switch } from "../../ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../ui/dialog";
import { SettingsSection } from "./settings-controls";

/** Bölüm seçiminde "Tümü" — API'ye `divisionId: null` olarak gider. */
const ALL_DIVISIONS_VALUE = "__all__";

/**
 * Uzantı → MIME eşlemesi. Tarayıcının bildirdiği `file.type` boş gelebildiği
 * için (bazı tarayıcılar bilinmeyen uzantılarda boş döner) uzantıdan türetilir;
 * ikisi doluysa uyuşmaları beklenir. Sunucu aynı kontrolü tekrar yapar.
 */
const SIGNATURE_MIME_BY_EXTENSION = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
} as const;

type SignatureForm = {
  name: string;
  title: string;
  divisionId: string;
  isActive: boolean;
};

const EMPTY_FORM: SignatureForm = { name: "", title: "", divisionId: ALL_DIVISIONS_VALUE, isActive: true };

function signatureImageMeta(file: File) {
  const extension = (file.name.split(".").pop() ?? "").toLocaleLowerCase("en-US") as keyof typeof SIGNATURE_MIME_BY_EXTENSION;
  const mimeType = SIGNATURE_MIME_BY_EXTENSION[extension];
  if (!mimeType || (file.type && file.type !== mimeType)) return null;
  return { extension, mimeType };
}

function validateSignatureImage(file: File): string | null {
  if (!signatureImageMeta(file)) return "Yalnızca PNG, JPG veya WEBP imza görseli yükleyebilirsiniz.";
  if (file.size <= 0) return "İmza görseli boş olamaz.";
  if (file.size > SIGNATURE_IMAGE_MAX_BYTES) return "İmza görseli 2 MB'ı aşamaz.";
  return null;
}

/**
 * Ayarlar → İmzalar.
 *
 * Teklif, proforma, servis teklifi ve sözleşme çıktılarının altına basılan
 * ad + ünvan + (opsiyonel) ıslak imza görselini burada tanımlanan kayıtlardan
 * seçilir. Öncesinde tek bir kişinin imzası yazdırma şablonuna gömülüydü ve
 * yeni imza eklemek kod değişikliği + deploy gerektiriyordu.
 */
export function SignatureSettingsCard() {
  const { user, hasPermission } = useAuth();
  const canManage = hasPermission("tenants.update");
  const divisions = user?.divisions ?? [];

  const [rows, setRows] = useState<SignatureView[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SignatureView | null>(null);
  const [form, setForm] = useState<SignatureForm>(EMPTY_FORM);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageCleared, setImageCleared] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<SignatureView | null>(null);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      // Ayar ekranı pasifleri de görür; belge ekranları `activeOnly` ister.
      setRows(await signatureService.list());
    } catch (error: any) {
      setLoadError(error?.message ?? "İmzalar yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Seçilen dosyanın önizlemesi; kaydedilmiş görselin URL'i API'den gelir.
  const [filePreview, setFilePreview] = useState("");
  useEffect(() => {
    if (!imageFile) {
      setFilePreview("");
      return;
    }
    const objectUrl = URL.createObjectURL(imageFile);
    setFilePreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [imageFile]);

  const previewUrl = useMemo(() => {
    if (filePreview) return filePreview;
    if (imageCleared) return "";
    return resolveMediaUrl(editing?.imageUrl) || "";
  }, [filePreview, imageCleared, editing?.imageUrl]);

  const divisionLabel = useCallback(
    (divisionId: string | null) => {
      if (!divisionId) return "Tüm bölümler";
      return divisions.find((division) => division.id === divisionId)?.name ?? "Bölüm";
    },
    [divisions],
  );

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setImageFile(null);
    setImageCleared(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const openCreate = () => {
    setEditing(null);
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (signature: SignatureView) => {
    setEditing(signature);
    setForm({
      name: signature.name,
      title: signature.title,
      divisionId: signature.divisionId ?? ALL_DIVISIONS_VALUE,
      isActive: signature.isActive,
    });
    setImageFile(null);
    setImageCleared(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setDialogOpen(true);
  };

  const pickImage = (file: File | null) => {
    if (!file) return;
    const validationError = validateSignatureImage(file);
    if (validationError) {
      toast.error("İmza görseli eklenemedi", { description: validationError });
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setImageFile(file);
    setImageCleared(false);
  };

  const clearImage = () => {
    setImageFile(null);
    setImageCleared(true);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = form.name.trim();
    const title = form.title.trim();
    if (!name || !title) {
      toast.error("Ad ve ünvan zorunlu");
      return;
    }
    const divisionId = form.divisionId === ALL_DIVISIONS_VALUE ? null : form.divisionId;

    setSaving(true);
    try {
      let saved: SignatureView;
      if (editing) {
        // Görsel önce yüklenir; `fileId` ile bağlama işini API üstlenir.
        const fileId = imageFile
          ? await signatureService.uploadImage(editing.id, imageFile, {
              filename: imageFile.name,
              ...signatureImageMeta(imageFile)!,
            })
          : imageCleared
            ? null
            : undefined;
        saved = await signatureService.update(editing.id, {
          name,
          title,
          divisionId,
          isActive: form.isActive,
          ...(fileId === undefined ? {} : { fileId }),
        });
      } else {
        // Kayıt henüz yok: görsel 'new' hedefine yüklenir, kayıt `fileId` ile açılır.
        const fileId = imageFile
          ? await signatureService.uploadImage("new", imageFile, {
              filename: imageFile.name,
              ...signatureImageMeta(imageFile)!,
            })
          : undefined;
        saved = await signatureService.create({
          name,
          title,
          divisionId,
          isActive: form.isActive,
          ...(fileId ? { fileId } : {}),
        });
      }

      setRows((current) =>
        [...current.filter((row) => row.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name, "tr-TR")),
      );
      setDialogOpen(false);
      setEditing(null);
      resetForm();
      toast.success(editing ? "İmza güncellendi" : "İmza eklendi", {
        description: "Teklif, proforma ve sözleşme çıktılarında seçilebilir.",
      });
    } catch (error: any) {
      toast.error(editing ? "İmza güncellenemedi" : "İmza eklenemedi", {
        description: error?.message ?? "API isteği başarısız oldu.",
      });
    } finally {
      setSaving(false);
    }
  };

  const removeSignature = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await signatureService.remove(pendingDelete.id);
      setRows((current) => current.filter((row) => row.id !== pendingDelete.id));
      toast.success("İmza kaldırıldı", {
        description: "Yeni belgelerde seçilemez; basılmış belgeler kendi imzasını korur.",
      });
      setPendingDelete(null);
    } catch (error: any) {
      toast.error("İmza kaldırılamadı", {
        description: error?.message ?? "API isteği başarısız oldu.",
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <SettingsSection
        icon={<PenLine />}
        tone="primary"
        title="Belge İmzaları"
        description="Teklif, proforma, servis teklifi ve sözleşme çıktılarının altına basılan ad, ünvan ve imza görseli."
        action={
          canManage ? (
            <Button size="sm" className="gap-1.5" onClick={openCreate}>
              <Plus className="size-3.5" /> İmza Ekle
            </Button>
          ) : null
        }
      >
        {loadError ? (
          <div className="flex flex-col items-start justify-between gap-3 rounded-lg border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm sm:flex-row sm:items-center">
            <span className="text-destructive">{loadError}</span>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              Tekrar dene
            </Button>
          </div>
        ) : loading ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {Array.from({ length: 2 }).map((_, index) => (
              <div key={index} className="h-[84px] animate-pulse rounded-lg border border-border/50 bg-muted/30" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/70 px-4 py-8 text-center">
            <PenLine className="mx-auto size-6 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium">Henüz imza tanımlı değil</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {canManage
                ? "İlk imzayı ekleyin; belge çıktılarında seçilebilir olsun."
                : "İmza tanımlamak için şirket ayarlarını düzenleme yetkisi gerekir."}
            </p>
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {rows.map((signature) => (
              <div
                key={signature.id}
                className="flex min-w-0 items-center gap-3 rounded-lg border border-border/60 bg-muted/10 px-3 py-3"
              >
                {signature.imageUrl ? (
                  <img
                    src={resolveMediaUrl(signature.imageUrl)}
                    alt=""
                    className="h-10 w-16 shrink-0 rounded border border-border/50 bg-card object-contain p-0.5"
                  />
                ) : (
                  <span className="flex h-10 w-16 shrink-0 items-center justify-center rounded border border-dashed border-border/60 text-muted-foreground">
                    <ImageOff className="size-4" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <p className="truncate text-sm font-medium">{signature.name}</p>
                    {!signature.isActive && (
                      <Badge variant="outline" className="shrink-0 text-[9px] uppercase text-muted-foreground">
                        Pasif
                      </Badge>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {signature.title} · {divisionLabel(signature.divisionId)}
                  </p>
                </div>
                {canManage && (
                  <div className="flex shrink-0 items-center">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      onClick={() => openEdit(signature)}
                      aria-label={`${signature.name} imzasını düzenle`}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-destructive hover:text-destructive"
                      onClick={() => setPendingDelete(signature)}
                      aria-label={`${signature.name} imzasını kaldır`}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </SettingsSection>

      <Dialog open={dialogOpen} onOpenChange={(open) => !saving && setDialogOpen(open)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "İmzayı Düzenle" : "Yeni İmza"}</DialogTitle>
            <DialogDescription>
              Belge çıktısında ad ve ünvan basılır; görsel yüklenirse adın üstünde ıslak imza olarak görünür.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label htmlFor="signature-name" className="text-xs">Ad Soyad *</Label>
              <Input
                id="signature-name"
                className="mt-1.5"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Raif Şentürk"
                maxLength={255}
                disabled={saving}
              />
            </div>
            <div>
              <Label htmlFor="signature-title" className="text-xs">Ünvan *</Label>
              <Input
                id="signature-title"
                className="mt-1.5"
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                placeholder="Satış Koordinatörü"
                maxLength={255}
                disabled={saving}
              />
            </div>
            {/* Bölüm seçeneği yalnızca kullanıcının birden çok bölümü varsa
                anlamlı; tek bölümde seçim yapmayan bir kutu göstermek yerine
                kayıt sessizce "Tüm bölümler" olarak açılır. */}
            {divisions.length > 1 && (
              <div>
                <Label htmlFor="signature-division" className="text-xs">Bölüm</Label>
                <Select
                  value={form.divisionId}
                  onValueChange={(value) => setForm((current) => ({ ...current, divisionId: value }))}
                  disabled={saving}
                >
                  <SelectTrigger id="signature-division" className="mt-1.5">
                    <SelectValue placeholder="Seçin" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_DIVISIONS_VALUE}>Tüm bölümler</SelectItem>
                    {divisions.map((division) => (
                      <SelectItem key={division.id} value={division.id}>{division.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Bölüm seçilirse imza yalnızca o bölümün belgelerinde listelenir.
                </p>
              </div>
            )}
            <div>
              <Label className="text-xs">İmza Görseli</Label>
              <div className="mt-1.5 flex items-center gap-3">
                {previewUrl ? (
                  <img
                    src={previewUrl}
                    alt=""
                    className="h-14 w-24 shrink-0 rounded border border-border/60 bg-card object-contain p-1"
                  />
                ) : (
                  <span className="flex h-14 w-24 shrink-0 items-center justify-center rounded border border-dashed border-border/60 text-muted-foreground">
                    <ImageOff className="size-4" />
                  </span>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    disabled={saving}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="size-3.5" /> {previewUrl ? "Değiştir" : "Görsel Seç"}
                  </Button>
                  {previewUrl && (
                    <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={clearImage}>
                      Kaldır
                    </Button>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(event) => pickImage(event.target.files?.[0] ?? null)}
                />
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                PNG, JPG veya WEBP · en fazla 2 MB. Beyaz zeminli taramalarda saydam PNG daha temiz basar.
              </p>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2.5">
              <div>
                <p className="text-sm font-medium">Aktif</p>
                <p className="text-[11px] text-muted-foreground">Pasif imza yeni belgelerde seçilemez.</p>
              </div>
              <Switch
                checked={form.isActive}
                onCheckedChange={(checked) => setForm((current) => ({ ...current, isActive: checked }))}
                disabled={saving}
                aria-label="İmza aktif"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
                Vazgeç
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-1.5 size-4 animate-spin" />}
                {editing ? "Kaydet" : "İmza Ekle"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(pendingDelete)} onOpenChange={(open) => !open && !deleting && setPendingDelete(null)}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>İmza kaldırılsın mı?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium text-foreground">{pendingDelete?.name}</span> yeni belgelerde seçilemez olur.
              Daha önce basılmış belgeler kendi imzasını korur, ancak kaldırılan imzanın görseli yeniden yazdırmada
              çıkmaz — ad ve ünvan basılmaya devam eder.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Vazgeç</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting}
              onClick={(event) => {
                event.preventDefault();
                void removeSignature();
              }}
            >
              {deleting && <Loader2 className="mr-1.5 size-4 animate-spin" />}
              Kaldır
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
