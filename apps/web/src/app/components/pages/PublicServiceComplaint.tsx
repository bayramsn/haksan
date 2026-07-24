import { useEffect, useState } from "react";
import { ArrowRight, CheckCircle2, Clock3, FileCheck2, Headphones, MessageSquareWarning, Paperclip, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { publicComplaintService } from "../../../lib/services";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Checkbox } from "../ui/checkbox";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Textarea } from "../ui/textarea";

const PUBLIC_EVIDENCE_ACCEPT = ".pdf,.docx,.xlsx,.png,.jpg,.jpeg,.webp";
const EXT_TO_MIME: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

const INTAKE_STEPS = [
  { no: "01", title: "Bildir", detail: "Sorunu ve kanıtları paylaşın" },
  { no: "02", title: "İnceleme", detail: "Teknik ekip kaydı değerlendirir" },
  { no: "03", title: "Takip", detail: "Kayıt numarasıyla süreç başlar" },
] as const;

export function PublicServiceComplaintPage({ slug, token }: { slug: string; token: string }) {
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [submittedNo, setSubmittedNo] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<"low" | "normal" | "high" | "critical">("normal");
  const [warrantyClaim, setWarrantyClaim] = useState(false);
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [attachments, setAttachments] = useState<Array<{ fileId: string; name: string; size: number }>>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const source = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("source") === "qr" ? "qr" : "web";

  useEffect(() => {
    publicComplaintService
      .form(slug, token)
      .then(setData)
      .catch((err: any) => toast.error("Şikayet formu açılamadı", { description: err?.message }))
      .finally(() => setLoading(false));
  }, [slug, token]);

  const submit = async () => {
    const nextSubject = subject.trim();
    if (nextSubject.length < 3) {
      toast.error("Konu en az 3 karakter olmalı.");
      return;
    }
    setSubmitting(true);
    try {
      const row = await publicComplaintService.submit(slug, token, {
        subject: nextSubject,
        description: description.trim() || undefined,
        severity,
        ticketType: warrantyClaim ? "warranty_claim" : "complaint",
        source,
        contactName: contactName.trim() || undefined,
        contactPhone: contactPhone.trim() || undefined,
        contactEmail: contactEmail.trim(),
        attachmentFileIds: attachments.map((file) => file.fileId),
      });
      setSubmittedNo(row.complaintNo);
      setSubject("");
      setDescription("");
      setWarrantyClaim(false);
      setContactName("");
      setContactPhone("");
      setContactEmail("");
      setAttachments([]);
      toast.success("Şikayetiniz alındı", { description: row.complaintNo });
    } catch (err: any) {
      toast.error("Şikayet gönderilemedi", { description: err?.message ?? "İstek başarısız." });
    } finally {
      setSubmitting(false);
    }
  };

  const uploadEvidence = async (file: File | undefined) => {
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLocaleLowerCase("tr-TR") ?? "";
    const mime = file.type || EXT_TO_MIME[ext];
    if (!EXT_TO_MIME[ext] || !mime) {
      toast.error("Desteklenmeyen dosya tipi", { description: "PDF, DOCX, XLSX, PNG, JPG veya WEBP yükleyebilirsiniz." });
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      toast.error("Dosya boyutu 25 MB'ı aşamaz");
      return;
    }
    setUploading(true);
    try {
      const up = await publicComplaintService.signedUpload(slug, token, {
        bucket: "erp-service-documents",
        filename: file.name,
        mimeType: mime as any,
        extension: ext as any,
        sizeBytes: file.size,
      });
      await publicComplaintService.uploadBinary(slug, token, up.fileId, file, mime);
      setAttachments((prev) => [...prev, { fileId: up.fileId, name: file.name, size: file.size }]);
      toast.success("Dosya eklendi");
    } catch (err: any) {
      toast.error("Dosya yüklenemedi", { description: err?.message ?? "İşlem başarısız." });
    } finally {
      setUploading(false);
    }
  };

  if (loading) return <div className="grid h-full overflow-y-auto bg-canvas text-muted-foreground place-items-center">Form yükleniyor...</div>;
  if (!data) return <div className="grid h-full overflow-y-auto bg-canvas text-muted-foreground place-items-center">Şikayet formu bulunamadı.</div>;

  return (
    <div className="h-full overflow-y-auto bg-canvas text-foreground">
      <div className="datum-rail h-[5px]" aria-hidden />
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <img src="/brand/haksan-logo.png" alt="Haksan Makina" className="h-9 w-auto" />
          <Badge variant="secondary" className="shrink-0 gap-1 border border-primary/10">
            <MessageSquareWarning className="size-3.5" /> Servis Şikayet Formu
          </Badge>
        </div>
      </header>
      <main className="mx-auto grid max-w-5xl items-start gap-5 px-4 py-5 sm:px-6 sm:py-7 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="space-y-4">
          <Card className="relative overflow-hidden border-t-2 border-t-brand-red">
            <svg
              viewBox="0 0 320 180"
              aria-hidden="true"
              className="pointer-events-none absolute -right-16 -top-5 h-48 w-80 text-primary/[0.055]"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.25"
            >
              <path d="M39 131h228M57 131V87l25-27h112l31 27v44M78 131v-24h127v24M105 60V42h66v18" />
              <path d="M113 42V28h49v14M89 82h103M101 96h79M128 28V15h23v13" />
              <circle cx="87" cy="132" r="13" /><circle cx="214" cy="132" r="13" />
              <path d="M246 41a25 25 0 1 0 24 31l-14-9 1-16 13-9a25 25 0 0 0-24 3Z" />
              <path d="m225 73-38 38M185 111l-14 4 4-14" />
            </svg>
            <CardHeader className="relative z-10">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Yetkili servis kaydı</div>
              <CardTitle className="font-display text-3xl font-semibold leading-none tracking-tight">
                {data.link?.title ?? "Servis Şikayet Formu"}
              </CardTitle>
              <CardDescription className="max-w-xl text-sm">
                {data.company?.name ?? "Haksan Makina servis ekibi"} için güvenli servis bildirim kanalı
              </CardDescription>
            </CardHeader>
            <CardContent className="relative z-10 grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2 rounded-lg border bg-white/85 p-2.5 shadow-sm backdrop-blur-sm sm:col-span-2 sm:grid-cols-3">
                {INTAKE_STEPS.map((step, index) => {
                  const completed = Boolean(submittedNo) || index === 0;
                  const current = submittedNo ? index === 2 : index === 0;
                  return (
                    <div key={step.no} className="flex min-w-0 items-center gap-2.5 rounded-md px-2 py-1.5">
                      <span className={`grid size-8 shrink-0 place-items-center rounded-full border font-data text-[11px] font-semibold ${completed ? "border-primary/25 bg-primary text-primary-foreground" : "border-border bg-muted text-muted-foreground"}`}>
                        {completed && !current ? <CheckCircle2 className="size-4" /> : step.no}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-xs font-semibold">{step.title}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">{step.detail}</span>
                      </span>
                      {index < INTAKE_STEPS.length - 1 && <ArrowRight className="ml-auto hidden size-3.5 shrink-0 text-muted-foreground/50 sm:block" />}
                    </div>
                  );
                })}
              </div>
              <div className="rounded-md border bg-muted/20 p-3">
                <div className="text-xs text-muted-foreground">Firma</div>
                <div className="mt-1 font-medium">{data.company?.name ?? "-"}</div>
              </div>
              <div className="rounded-md border bg-muted/20 p-3">
                <div className="text-xs text-muted-foreground">Makine</div>
                <div className="mt-1 font-medium">
                  {[data.machine?.brand, data.machine?.model, data.machine?.serialNumber].filter(Boolean).join(" · ") || "-"}
                </div>
              </div>
              {data.machine && (
                <div className="rounded-md border bg-muted/20 p-3 sm:col-span-2">
                  <div className="text-xs text-muted-foreground">Garanti</div>
                  <div className="mt-1 font-medium">
                    {data.machine.warrantyStatusSuggestion === "in_warranty"
                      ? "Garanti içi"
                      : data.machine.warrantyStatusSuggestion === "out_of_warranty"
                        ? "Garanti dışı"
                        : "Garanti bilgisi bilinmiyor"}
                  </div>
                  {data.machine.warrantyEndDate && (
                    <div className="mt-1 text-xs text-muted-foreground">Bitiş: {data.machine.warrantyEndDate.slice(0, 10)}</div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {submittedNo && (
            <Card className="overflow-hidden border-success/25 bg-success-soft" aria-live="polite">
              <CardContent className="py-4 text-emerald-900">
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-emerald-600 text-white shadow-sm">
                    <CheckCircle2 className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-display text-xl font-semibold">Şikayet kaydınız alındı.</div>
                    <div className="mt-0.5 text-sm">Takip numaranız: <strong className="font-data">{submittedNo}</strong></div>
                    <p className="mt-2 max-w-xl text-xs leading-relaxed text-emerald-800/80">
                      Teknik servis ekibi kaydı makine ve garanti bilgileriyle inceleyecek; gerekli olduğunda paylaştığınız telefon veya e-posta üzerinden sizinle iletişime geçecektir.
                    </p>
                  </div>
                </div>
                <div className="mt-4 grid gap-2 border-t border-emerald-700/10 pt-3 sm:grid-cols-3">
                  {[
                    [CheckCircle2, "Kayıt oluşturuldu", "Tamamlandı"],
                    [Clock3, "Teknik ön inceleme", "Sıradaki adım"],
                    [Headphones, "Servis iletişimi", "İnceleme sonrası"],
                  ].map(([Icon, title, meta]) => (
                    <div key={String(title)} className="flex items-center gap-2 rounded-md bg-white/45 p-2.5">
                      <Icon className="size-4 shrink-0" />
                      <span>
                        <span className="block text-xs font-semibold">{String(title)}</span>
                        <span className="block text-[11px] opacity-70">{String(meta)}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="hidden lg:flex">
            <CardHeader>
              <CardTitle className="font-display text-2xl font-semibold">Kayıttan çözüme üç adım</CardTitle>
              <CardDescription>Bildirim servis ekibinin operasyon kuyruğuna güvenli biçimde aktarılır.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {[
                ["01", "Bilgileri paylaşın", "Arıza konusunu, iletişim bilgilerinizi ve varsa kanıt dosyalarını ekleyin."],
                ["02", "Teknik ön inceleme", "Servis ekibi makine ve garanti bilgileriyle birlikte kaydı değerlendirir."],
                ["03", "Takip numarası", "Gönderim tamamlandığında ekranda kayıt numaranız gösterilir."],
              ].map(([no, title, text]) => (
                <div key={no} className="grid grid-cols-[2.5rem_1fr] gap-3 rounded-lg border bg-muted/20 p-3">
                  <span className="font-data text-sm font-semibold text-primary">{no}</span>
                  <div>
                    <div className="text-sm font-semibold">{title}</div>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{text}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>

        <Card className="lg:sticky lg:top-5">
          <CardHeader>
            <CardTitle className="font-display text-2xl font-semibold">Şikayet bilgileri</CardTitle>
            <CardDescription>Zorunlu alanları doldurarak servis kaydınızı oluşturun.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label htmlFor="complaint-subject">Konu</Label>
              <Input id="complaint-subject" className="mt-1" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <div>
                <Label htmlFor="complaint-contact-name">Ad Soyad</Label>
                <Input id="complaint-contact-name" autoComplete="name" className="mt-1" value={contactName} onChange={(e) => setContactName(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="complaint-contact-phone">Telefon</Label>
                <Input id="complaint-contact-phone" type="tel" autoComplete="tel" className="mt-1" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
              </div>
            </div>
            <div>
              <Label htmlFor="complaint-contact-email">E-posta</Label>
              <Input id="complaint-contact-email" type="email" autoComplete="email" className="mt-1" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="complaint-severity">Öncelik</Label>
              <Select value={severity} onValueChange={(v) => setSeverity(v as typeof severity)}>
                <SelectTrigger id="complaint-severity" className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Düşük</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">Yüksek</SelectItem>
                  <SelectItem value="critical">Kritik</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-start gap-2 rounded-md border bg-muted/20 p-3 text-sm">
              <Checkbox aria-label="Garanti kapsamında servis talebi" checked={warrantyClaim} onCheckedChange={(v) => setWarrantyClaim(Boolean(v))} />
              <span>
                <span className="inline-flex items-center gap-1 font-medium"><ShieldCheck className="size-3.5" /> Garanti kapsamında</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">Servis ekibi garanti/RMA olarak değerlendirsin.</span>
              </span>
            </label>
            <div>
              <Label htmlFor="complaint-description">Açıklama</Label>
              <Textarea id="complaint-description" className="mt-1 min-h-32" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="rounded-md border bg-muted/20 p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-medium">Fotoğraf / dosya</div>
                  <div className="text-xs text-muted-foreground">{attachments.length} dosya eklendi</div>
                </div>
                <Label className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-md border border-border bg-white px-3 text-sm hover:bg-muted">
                  <Paperclip className="size-4" />
                  {uploading ? "Yükleniyor" : "Ekle"}
                  <Input
                    type="file"
                    accept={PUBLIC_EVIDENCE_ACCEPT}
                    className="hidden"
                    disabled={uploading}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.currentTarget.value = "";
                      uploadEvidence(file);
                    }}
                  />
                </Label>
              </div>
              {attachments.length > 0 && (
                <div className="mt-2 grid gap-1 text-xs text-muted-foreground">
                  {attachments.map((file) => <div key={file.fileId} className="truncate">{file.name}</div>)}
                </div>
              )}
              <div className="mt-3 flex items-start gap-2 border-t pt-2.5 text-[11px] leading-relaxed text-muted-foreground">
                <FileCheck2 className="mt-0.5 size-3.5 shrink-0 text-primary" />
                <span>PDF, DOCX, XLSX, PNG, JPG veya WEBP · Dosya başına en fazla 25 MB. Arızayı gösteren yakın ve genel plan fotoğrafları incelemeyi hızlandırır.</span>
              </div>
            </div>
            <Button className="w-full shadow-sm" onClick={submit} disabled={submitting}>
              {submitting ? "Güvenli biçimde gönderiliyor..." : "Şikayeti gönder"}
            </Button>
            <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-muted-foreground">
              <ShieldCheck className="size-3.5" /> Bilgileriniz yalnızca servis kaydının değerlendirilmesi için kullanılır.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
