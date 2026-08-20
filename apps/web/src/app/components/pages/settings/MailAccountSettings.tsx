import { useEffect, useState } from "react";
import { AlertTriangle, Check, Eye, EyeOff, Loader2, LockKeyhole, MailCheck, Power, Server, ShieldCheck } from "lucide-react";
import type { UserMailAccountStatus } from "@haksan/shared";
import { toast } from "sonner";
import { mailService } from "../../../../lib/services";
import { useAuth } from "../../../../lib/auth";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
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
import { InfoCallout, SettingsSection } from "./settings-controls";

function formatDate(value: string | null) {
  if (!value) return "Henüz doğrulanmadı";
  return new Date(value).toLocaleString("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function MailAccountSettings() {
  const { user } = useAuth();
  const [status, setStatus] = useState<UserMailAccountStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState(user?.fullName ?? "");
  const [password, setPassword] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    mailService.account()
      .then((next) => {
        if (cancelled) return;
        setStatus(next);
        setEmail(next.email ?? "");
        setDisplayName(next.displayName ?? user?.fullName ?? "");
      })
      .catch((error: any) => {
        if (!cancelled) toast.error("Webmail ayarları alınamadı", { description: error?.message });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [user?.fullName]);

  const connect = async () => {
    if (!email.trim() || !displayName.trim() || !password) {
      toast.error("E-posta, görünen ad ve webmail şifresi zorunludur");
      return;
    }
    setSaving(true);
    try {
      const next = await mailService.connect({
        email: email.trim(),
        displayName: displayName.trim(),
        password,
      });
      setStatus(next);
      setPassword("");
      toast.success("Webmail hesabı bağlandı", { description: "SMTP bağlantısı doğrulandı ve gönderime hazır." });
    } catch (error: any) {
      toast.error("Webmail hesabı bağlanamadı", { description: error?.message ?? "Bilgileri kontrol edip tekrar deneyin." });
    } finally {
      setSaving(false);
    }
  };

  const disconnect = async () => {
    setSaving(true);
    try {
      await mailService.disconnect();
      setStatus((current) => current ? { ...current, configured: false, email: null, displayName: null, status: null, lastVerifiedAt: null, lastUsedAt: null } : current);
      setEmail("");
      setDisplayName(user?.fullName ?? "");
      setPassword("");
      setDisconnectOpen(false);
      toast.success("Webmail bağlantısı kaldırıldı");
    } catch (error: any) {
      toast.error("Bağlantı kaldırılamadı", { description: error?.message });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="grid min-h-52 place-items-center text-sm text-muted-foreground"><Loader2 className="mr-2 inline size-4 animate-spin" />Webmail ayarları hazırlanıyor</div>;
  }

  const connected = Boolean(status?.configured && status.status === "active");
  const connectionError = status?.configured && status.status === "error";

  return (
    <div className="space-y-4">
      {!status?.featureEnabled && (
        <InfoCallout icon={<AlertTriangle />} tone="warning">
          Kişisel webmail bağlantısı sunucuda henüz açılmamış. Sistem yöneticisi SMTP sunucusunu ve izin verilen kurumsal alan adlarını tanımladıktan sonra bu ekran aktif olur.
        </InfoCallout>
      )}

      <section className="precision-corners relative overflow-hidden rounded-2xl border border-slate-800 bg-[#07142b] text-white shadow-lg shadow-slate-950/10">
        <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#dc2626_0_18%,#36a4ff_18%_100%)]" />
        <div className="grid gap-5 px-5 py-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-6">
          <div className="flex min-w-0 items-start gap-4">
            <div className="relative flex size-12 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/10">
              <MailCheck className="size-6 text-sky-300" />
              <span className={`absolute -bottom-1 -right-1 size-3 rounded-full border-2 border-[#07142b] ${connected ? "bg-emerald-400" : connectionError ? "bg-amber-400" : "bg-slate-500"}`} />
            </div>
            <div className="min-w-0">
              <p className="font-mono text-[10px] font-semibold tracking-[0.18em] text-sky-300">KİŞİSEL GÖNDERİCİ</p>
              <h3 className="mt-1 truncate font-display text-xl font-semibold">
                {connected ? status?.email : connectionError ? "Hesabı yeniden doğrulayın" : "Webmail hesabınızı bağlayın"}
              </h3>
              <p className="mt-1 max-w-xl text-xs leading-relaxed text-white/60">
                {connected
                  ? "CRM’den gönderdiğiniz e-postalar doğrudan bu kurumsal adresten çıkar."
                  : "E-posta adresinizi ve webmail giriş şifrenizi kullanarak güvenli SMTP bağlantısı kurun."}
              </p>
            </div>
          </div>
          <div className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${connected ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" : connectionError ? "border-amber-400/30 bg-amber-400/10 text-amber-300" : "border-white/15 bg-white/5 text-white/65"}`}>
            {connected ? <Check className="size-3.5" /> : <Power className="size-3.5" />}
            {connected ? "Gönderime hazır" : connectionError ? "Bağlantı kesildi" : "Bağlı değil"}
          </div>
        </div>
        {status?.serverLabel && (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/10 bg-white/[0.035] px-5 py-3 text-[11px] text-white/55 sm:px-6">
            <span className="inline-flex items-center gap-1.5"><Server className="size-3.5" />{status.serverLabel}</span>
            <span>Son doğrulama: {formatDate(status.lastVerifiedAt)}</span>
            {status.lastUsedAt && <span>Son gönderim: {formatDate(status.lastUsedAt)}</span>}
          </div>
        )}
      </section>

      <SettingsSection
        icon={<LockKeyhole />}
        tone={connected ? "success" : "primary"}
        title={status?.configured ? "Webmail bilgilerini güncelle" : "Webmail ile bağlan"}
        description="Şifre yalnız bağlantı kurulurken gönderilir; ekranda ve tarayıcı depolamasında tutulmaz."
        action={status?.configured ? <Button variant="outline" size="sm" disabled={saving} onClick={() => setDisconnectOpen(true)}>Bağlantıyı kaldır</Button> : undefined}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="webmail-display-name" className="text-xs text-muted-foreground">Gönderen adı</Label>
            <Input id="webmail-display-name" className="mt-1" value={displayName} maxLength={255} disabled={!status?.featureEnabled || saving} onChange={(event) => setDisplayName(event.target.value)} placeholder="Ad Soyad" />
          </div>
          <div>
            <Label htmlFor="webmail-email" className="text-xs text-muted-foreground">Kurumsal e-posta</Label>
            <Input id="webmail-email" className="mt-1" type="email" value={email} maxLength={255} autoComplete="username" disabled={!status?.featureEnabled || saving} onChange={(event) => setEmail(event.target.value)} placeholder="ad.soyad@firma.com" />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="webmail-password" className="text-xs text-muted-foreground">Webmail şifresi</Label>
            <div className="relative mt-1">
              <Input
                id="webmail-password"
                type={showPassword ? "text" : "password"}
                value={password}
                maxLength={512}
                autoComplete="current-password"
                disabled={!status?.featureEnabled || saving}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={status?.configured ? "Değiştirmek için şifreyi yeniden girin" : "Webmail giriş şifreniz"}
                className="pr-10"
              />
              <button type="button" className="absolute right-1 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Şifreyi gizle" : "Şifreyi göster"}>
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>
        </div>
        <div className="mt-5 flex flex-col-reverse gap-3 border-t border-border/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="inline-flex items-start gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" />
            Parola AES-256-GCM ile şifrelenir ve hiçbir API yanıtında geri döndürülmez.
          </div>
          <Button disabled={!status?.featureEnabled || saving || !email.trim() || !displayName.trim() || !password} onClick={() => void connect()} className="min-w-36 gap-2">
            {saving ? <Loader2 className="size-4 animate-spin" /> : <MailCheck className="size-4" />}
            {saving ? "Doğrulanıyor" : status?.configured ? "Yeniden doğrula" : "Bağlantıyı doğrula"}
          </Button>
        </div>
      </SettingsSection>

      <AlertDialog open={disconnectOpen} onOpenChange={setDisconnectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Webmail bağlantısını kaldır?</AlertDialogTitle>
            <AlertDialogDescription>
              Şifreli hesap bilgisi silinir ve CRM’den kendi adresinizle e-posta gönderemezsiniz. Daha sonra yeniden bağlayabilirsiniz.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Vazgeç</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" disabled={saving} onClick={(event) => { event.preventDefault(); void disconnect(); }}>
              Bağlantıyı kaldır
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
