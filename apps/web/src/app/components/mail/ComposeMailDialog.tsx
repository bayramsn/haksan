import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BookmarkPlus, CheckCircle2, Loader2, LockKeyhole, Mail, Paperclip, Send, Settings2 } from "lucide-react";
import type { MailRecipients } from "@haksan/shared";
import type { UserMailAccountStatus } from "@haksan/shared";
import { toast } from "sonner";
import { mailService } from "../../../lib/services";
import { useStore } from "../../lib/store";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { MultiSelect, type MultiSelectOption } from "../ui/multi-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Textarea } from "../ui/textarea";

/** Mail gövdesi şablonları not şablonlarıyla aynı tabloda, bu kapsam altında tutulur. */
export const MAIL_TEMPLATE_SCOPE = "mail";

export type MailRecipient = {
  email: string;
  name?: string;
  companyId?: string;
  contactId?: string;
  subject?: string;
  body?: string;
  /** Verilirse teklifin PDF'i sunucuda üretilip ek olarak gönderilir. */
  quoteId?: string;
  /** Ek satırında gösterilecek etiket (ör. teklif numarası). */
  attachmentLabel?: string;
};

const emptyRecipients: MailRecipients = { contacts: [], colleagues: [] };

export function ComposeMailDialog({
  recipient,
  onOpenChange,
  onSent,
}: {
  recipient: MailRecipient | null;
  onOpenChange: (open: boolean) => void;
  onSent?: () => Promise<void> | void;
}) {
  const { noteTemplates, addNoteTemplate } = useStore();
  const [account, setAccount] = useState<UserMailAccountStatus | null>(null);
  const [accountLoading, setAccountLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [to, setTo] = useState("");
  const [contactId, setContactId] = useState<string | undefined>(undefined);
  const [cc, setCc] = useState<string[]>([]);
  const [ccManual, setCcManual] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [options, setOptions] = useState<MailRecipients>(emptyRecipients);
  const [templateName, setTemplateName] = useState<string | null>(null);

  useEffect(() => {
    if (!recipient) return;
    setTo(recipient.email);
    setContactId(recipient.contactId);
    setCc([]);
    setCcManual("");
    setSubject(recipient.subject ?? "");
    setTemplateName(null);
    setBody(recipient.body ?? (recipient.name ? `Merhaba ${recipient.name},\n\n` : "Merhaba,\n\n"));
    setAccountLoading(true);
    mailService.account()
      .then(setAccount)
      .catch((error: any) => toast.error("Gönderici hesabı kontrol edilemedi", { description: error?.message }))
      .finally(() => setAccountLoading(false));
    mailService.recipients(recipient.companyId)
      .then(setOptions)
      .catch(() => setOptions(emptyRecipients));
  }, [recipient]);

  const mailTemplates = useMemo(
    () => noteTemplates.filter((template) => template.scope === MAIL_TEMPLATE_SCOPE),
    [noteTemplates],
  );

  // Kendi ekibimiz ve müşteri kontakları tek listede; hangisi olduğu etikette yazar.
  const ccOptions: MultiSelectOption[] = useMemo(() => {
    const manual = cc
      .filter((email) => ![...options.contacts, ...options.colleagues].some((option) => option.email === email))
      .map((email) => ({ value: email, label: email }));
    return [
      ...options.contacts.map((option) => ({
        value: option.email,
        label: `${option.name}${option.detail ? ` · ${option.detail}` : ""} — ${option.email}`,
      })),
      ...options.colleagues.map((option) => ({
        value: option.email,
        label: `${option.name} (ekibimiz) — ${option.email}`,
      })),
      ...manual,
    ];
  }, [cc, options]);

  const close = () => {
    if (sending) return;
    onOpenChange(false);
  };

  const pickContact = (email: string) => {
    setTo(email);
    setContactId(options.contacts.find((option) => option.email === email)?.contactId ?? undefined);
  };

  const addManualCc = () => {
    const email = ccManual.trim();
    if (!email) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Geçerli bir e-posta adresi girin");
      return;
    }
    if (!cc.includes(email)) setCc([...cc, email]);
    setCcManual("");
  };

  const saveTemplate = async () => {
    const text = body.trim();
    const title = (templateName ?? "").trim();
    if (!text) return toast.error("Şablon olarak kaydedilecek bir mesaj yok");
    if (!title) return toast.error("Şablona bir ad verin");
    try {
      await addNoteTemplate({ title, body: text, scope: MAIL_TEMPLATE_SCOPE });
      toast.success("Mail şablonu kaydedildi", { description: title });
      setTemplateName(null);
    } catch (error: any) {
      toast.error("Şablon kaydedilemedi", { description: error?.message ?? "API isteği başarısız oldu." });
    }
  };

  const send = async () => {
    if (!recipient || !to.trim() || !subject.trim() || !body.trim()) {
      toast.error("Alıcı, konu ve mesaj zorunludur");
      return;
    }
    setSending(true);
    try {
      await mailService.send({
        to: to.trim(),
        cc: cc.length ? cc : undefined,
        subject: subject.trim(),
        body: body.trim(),
        companyId: recipient.companyId,
        contactId,
        quoteId: recipient.quoteId,
      });
      await onSent?.();
      toast.success("E-posta gönderildi", { description: `${account?.email ?? "Webmail hesabınız"} üzerinden teslim edildi.` });
      onOpenChange(false);
    } catch (error: any) {
      toast.error("E-posta gönderilemedi", { description: error?.message ?? "Webmail bağlantınızı kontrol edin." });
    } finally {
      setSending(false);
    }
  };

  const ready = account?.featureEnabled && account.configured && account.status === "active";

  return (
    <Dialog open={Boolean(recipient)} onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-h-[92dvh] max-w-2xl overflow-y-auto p-0">
        <div className="border-b border-border/70 bg-[linear-gradient(135deg,#07142b,#102652)] px-6 py-5 text-white">
          <DialogHeader>
            <div className="mb-2 flex items-center gap-2 font-mono text-[10px] font-semibold tracking-[0.17em] text-sky-300">
              <Mail className="size-3.5" /> CRM WEBMAIL
            </div>
            <DialogTitle className="text-white">Yeni e-posta</DialogTitle>
            <DialogDescription className="text-white/60">
              Mesaj CRM’den çıkar, gönderilmiş ileti firma zaman çizelgesine kaydedilir.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-4 px-6 pb-2">
          {accountLoading ? (
            <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Gönderici hesabı kontrol ediliyor
            </div>
          ) : ready ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-success/20 bg-success/5 px-3 py-2.5">
              <span className="inline-flex items-center gap-2 text-xs font-medium text-success"><CheckCircle2 className="size-4" />{account.displayName} &lt;{account.email}&gt;</span>
              <span className="text-[11px] text-muted-foreground">Kişisel webmail üzerinden</span>
            </div>
          ) : (
            <div className="flex items-start gap-3 rounded-lg border border-warning/25 bg-warning/5 px-3 py-3">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
              <div>
                <p className="text-xs font-medium">Gönderici hesabı hazır değil</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Ayarlar &gt; Webmail bölümünden kurumsal adresinizi ve webmail şifrenizi doğrulayın.
                </p>
              </div>
              <Settings2 className="ml-auto size-4 shrink-0 text-muted-foreground" />
            </div>
          )}

          <div>
            <Label htmlFor="compose-mail-to" className="text-xs text-muted-foreground">Alıcı</Label>
            <div className="mt-1 flex flex-col gap-2 sm:flex-row">
              <Input id="compose-mail-to" className="sm:flex-1" type="email" value={to} maxLength={255} onChange={(event) => setTo(event.target.value)} disabled={sending} />
              <Select value={undefined} onValueChange={pickContact} disabled={sending || options.contacts.length === 0}>
                <SelectTrigger className="sm:w-64" aria-label="Firma kontaklarından seç">
                  <SelectValue placeholder={options.contacts.length ? "Firma kontaklarından seç" : "Kontak e-postası yok"} />
                </SelectTrigger>
                <SelectContent>
                  {options.contacts.map((option) => (
                    <SelectItem key={option.email} value={option.email}>
                      {option.name}{option.detail ? ` · ${option.detail}` : ""} — {option.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">CC (bilgi)</Label>
            <div className="mt-1 space-y-2">
              <MultiSelect
                options={ccOptions}
                selected={cc}
                onChange={setCc}
                placeholder="Ekibimizden veya müşteri kontaklarından seç"
                emptyText="Seçilebilecek adres yok"
              />
              <div className="flex gap-2">
                <Input
                  aria-label="CC için e-posta adresi yaz"
                  className="flex-1"
                  type="email"
                  placeholder="Listede olmayan adres..."
                  value={ccManual}
                  maxLength={255}
                  disabled={sending}
                  onChange={(event) => setCcManual(event.target.value)}
                  onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addManualCc(); } }}
                />
                <Button type="button" variant="outline" onClick={addManualCc} disabled={sending || !ccManual.trim()}>Ekle</Button>
              </div>
            </div>
          </div>

          <div>
            <Label htmlFor="compose-mail-subject" className="text-xs text-muted-foreground">Konu</Label>
            <Input id="compose-mail-subject" className="mt-1" value={subject} maxLength={255} onChange={(event) => setSubject(event.target.value)} disabled={sending} placeholder="E-postanın konusu" />
          </div>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor="compose-mail-body" className="text-xs text-muted-foreground">Mesaj</Label>
              <div className="flex items-center gap-2">
                <Select
                  value={undefined}
                  onValueChange={(id) => {
                    const template = mailTemplates.find((item) => item.id === id);
                    if (template) setBody(template.body);
                  }}
                  disabled={sending || mailTemplates.length === 0}
                >
                  <SelectTrigger className="h-8 w-56" aria-label="Mail şablonu seç">
                    <SelectValue placeholder={mailTemplates.length ? "Şablon seç" : "Kayıtlı şablon yok"} />
                  </SelectTrigger>
                  <SelectContent>
                    {mailTemplates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>{template.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5"
                  onClick={() => setTemplateName((current) => (current === null ? subject.trim() : null))}
                  disabled={sending}
                >
                  <BookmarkPlus className="size-3.5" /> Şablon kaydet
                </Button>
              </div>
            </div>
            {templateName !== null && (
              <div className="mt-1.5 flex gap-2 rounded-lg border border-border/60 bg-muted/30 p-2">
                <Input
                  aria-label="Şablon adı"
                  className="h-8 flex-1 bg-white"
                  placeholder="Şablon adı (ör. Standart teklif maili)"
                  maxLength={200}
                  value={templateName}
                  onChange={(event) => setTemplateName(event.target.value)}
                  onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void saveTemplate(); } }}
                />
                <Button type="button" size="sm" className="h-8" onClick={() => void saveTemplate()}>Kaydet</Button>
                <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => setTemplateName(null)}>Vazgeç</Button>
              </div>
            )}
            <Textarea id="compose-mail-body" className="mt-1 min-h-52 resize-y leading-relaxed" value={body} maxLength={10_000} onChange={(event) => setBody(event.target.value)} disabled={sending} />
            <div className="mt-1 text-right font-mono text-[10px] text-muted-foreground">{body.length.toLocaleString("tr-TR")} / 10.000</div>
          </div>

          {recipient?.quoteId && (
            <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5 text-xs">
              <Paperclip className="size-3.5 text-muted-foreground" />
              <span className="font-medium">{recipient.attachmentLabel ?? "Teklif"}.pdf</span>
              <span className="text-muted-foreground">teklif PDF'i ek olarak gönderilir</span>
            </div>
          )}
        </div>

        <DialogFooter className="mx-6 mb-5">
          <div className="mr-auto hidden items-center gap-1.5 text-[11px] text-muted-foreground sm:flex"><LockKeyhole className="size-3.5" />TLS ile güvenli gönderim</div>
          <Button variant="outline" onClick={close} disabled={sending}>Vazgeç</Button>
          <Button className="gap-2" disabled={!ready || sending || !to.trim() || !subject.trim() || !body.trim()} onClick={() => void send()}>
            {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            {sending ? "Gönderiliyor" : "E-postayı gönder"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
