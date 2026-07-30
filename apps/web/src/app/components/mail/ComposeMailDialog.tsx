import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, LockKeyhole, Mail, Send, Settings2 } from "lucide-react";
import type { UserMailAccountStatus } from "@haksan/shared";
import { toast } from "sonner";
import { mailService } from "../../../lib/services";
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
import { Textarea } from "../ui/textarea";

export type MailRecipient = {
  email: string;
  name?: string;
  companyId?: string;
  contactId?: string;
};

export function ComposeMailDialog({
  recipient,
  onOpenChange,
}: {
  recipient: MailRecipient | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [account, setAccount] = useState<UserMailAccountStatus | null>(null);
  const [accountLoading, setAccountLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  useEffect(() => {
    if (!recipient) return;
    setTo(recipient.email);
    setSubject("");
    setBody(recipient.name ? `Merhaba ${recipient.name},\n\n` : "Merhaba,\n\n");
    setAccountLoading(true);
    mailService.account()
      .then(setAccount)
      .catch((error: any) => toast.error("Gönderici hesabı kontrol edilemedi", { description: error?.message }))
      .finally(() => setAccountLoading(false));
  }, [recipient]);

  const close = () => {
    if (sending) return;
    onOpenChange(false);
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
        subject: subject.trim(),
        body: body.trim(),
        companyId: recipient.companyId,
        contactId: recipient.contactId,
      });
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
      <DialogContent className="max-w-2xl p-0">
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
            <Input id="compose-mail-to" className="mt-1" type="email" value={to} maxLength={255} onChange={(event) => setTo(event.target.value)} disabled={sending} />
          </div>
          <div>
            <Label htmlFor="compose-mail-subject" className="text-xs text-muted-foreground">Konu</Label>
            <Input id="compose-mail-subject" className="mt-1" value={subject} maxLength={255} onChange={(event) => setSubject(event.target.value)} disabled={sending} placeholder="E-postanın konusu" />
          </div>
          <div>
            <Label htmlFor="compose-mail-body" className="text-xs text-muted-foreground">Mesaj</Label>
            <Textarea id="compose-mail-body" className="mt-1 min-h-52 resize-y leading-relaxed" value={body} maxLength={10_000} onChange={(event) => setBody(event.target.value)} disabled={sending} />
            <div className="mt-1 text-right font-mono text-[10px] text-muted-foreground">{body.length.toLocaleString("tr-TR")} / 10.000</div>
          </div>
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
