import { useEffect, useState } from "react";
import { CheckCircle2, MessageSquareWarning, Paperclip, ShieldCheck } from "lucide-react";
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
    if (!subject.trim()) {
      toast.error("Konu girilmeli.");
      return;
    }
    setSubmitting(true);
    try {
      const row = await publicComplaintService.submit(slug, token, {
        subject,
        description,
        severity,
        ticketType: warrantyClaim ? "warranty_claim" : "complaint",
        source,
        contactName,
        contactPhone,
        contactEmail,
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
      const res = await fetch(up.uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": mime } });
      if (!res.ok) throw new Error(`Depoya yükleme başarısız (${res.status})`);
      setAttachments((prev) => [...prev, { fileId: up.fileId, name: file.name, size: file.size }]);
      toast.success("Dosya eklendi");
    } catch (err: any) {
      toast.error("Dosya yüklenemedi", { description: err?.message ?? "İşlem başarısız." });
    } finally {
      setUploading(false);
    }
  };

  if (loading) return <div className="grid min-h-screen place-items-center bg-[#f7f7f8] text-muted-foreground">Form yükleniyor...</div>;
  if (!data) return <div className="grid min-h-screen place-items-center bg-[#f7f7f8] text-muted-foreground">Şikayet formu bulunamadı.</div>;

  return (
    <div className="min-h-screen bg-[#f7f7f8] text-foreground">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-4">
          <img src="/brand/haksan-logo.png" alt="Haksan Makina" className="h-9 w-auto" />
          <Badge variant="secondary" className="gap-1">
            <MessageSquareWarning className="size-3.5" /> Servis Şikayet Formu
          </Badge>
        </div>
      </header>
      <main className="mx-auto grid max-w-4xl gap-4 px-4 py-6 lg:grid-cols-[1fr_360px]">
        <section className="space-y-4">
          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle>{data.link?.title ?? "Servis Şikayet Formu"}</CardTitle>
              <CardDescription>{data.company?.name ?? "Haksan Makina servis ekibi"}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
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
            <Card className="rounded-lg border-emerald-200 bg-emerald-50">
              <CardContent className="flex items-start gap-3 py-4 text-emerald-800">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
                <div>
                  <div className="font-medium">Şikayet kaydınız alındı.</div>
                  <div className="text-sm">Kayıt numarası: {submittedNo}</div>
                </div>
              </CardContent>
            </Card>
          )}
        </section>

        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Şikayet bilgileri</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Konu</Label>
              <Input className="mt-1" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <div>
                <Label>Ad Soyad</Label>
                <Input className="mt-1" value={contactName} onChange={(e) => setContactName(e.target.value)} />
              </div>
              <div>
                <Label>Telefon</Label>
                <Input className="mt-1" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>E-posta</Label>
              <Input className="mt-1" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
            </div>
            <div>
              <Label>Öncelik</Label>
              <Select value={severity} onValueChange={(v) => setSeverity(v as typeof severity)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Düşük</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">Yüksek</SelectItem>
                  <SelectItem value="critical">Kritik</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-start gap-2 rounded-md border bg-muted/20 p-3 text-sm">
              <Checkbox checked={warrantyClaim} onCheckedChange={(v) => setWarrantyClaim(Boolean(v))} />
              <span>
                <span className="inline-flex items-center gap-1 font-medium"><ShieldCheck className="size-3.5" /> Garanti kapsamında</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">Servis ekibi garanti/RMA olarak değerlendirsin.</span>
              </span>
            </label>
            <div>
              <Label>Açıklama</Label>
              <Textarea className="mt-1 min-h-32" value={description} onChange={(e) => setDescription(e.target.value)} />
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
            </div>
            <Button className="w-full" onClick={submit} disabled={submitting}>
              Şikayeti gönder
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
