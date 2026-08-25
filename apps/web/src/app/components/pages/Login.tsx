import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  ArrowRight, ShieldCheck,
  CheckCircle2, Eye, EyeOff, KeyRound, MailCheck, PlayCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { emailSchema } from "@haksan/shared";
import { authService } from "../../../lib/services";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "../ui/dialog";

const isProd = import.meta.env.PROD;
// Kurumsal SSO henüz uçtan uca bağlı değil; varsayılan olarak gizli.
// Backend OIDC/SAML hazır olduğunda VITE_SSO_ENABLED=true ile açılır.
const ssoEnabled = import.meta.env.VITE_SSO_ENABLED === "true";
// Anahtar adı tarihsel; artık kullanıcı adı da saklayabilir. Kullanıcıların
// kayıtlı değerlerini kaybetmemek için adı değiştirilmedi.
const REMEMBER_KEY = "haksan:login-email";

function readResetToken(): string {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  return (params.get("resetToken") ?? params.get("token"))?.trim() ?? "";
}

export function LoginPage({
  onLogin,
  onReplayIntro,
}: {
  onLogin: (identifier: string, password: string) => Promise<void> | void;
  onReplayIntro?: () => void;
}) {
  const [show, setShow] = useState(false);
  // Kullanıcı adı veya e-posta olabilir; biçim doğrulaması sunucuda yapılır.
  const [identifier, setIdentifier] = useState(() => (typeof localStorage !== "undefined" ? localStorage.getItem(REMEMBER_KEY) ?? "" : ""));
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(() => !!(typeof localStorage !== "undefined" && localStorage.getItem(REMEMBER_KEY)));
  const [busy, setBusy] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotBusy, setForgotBusy] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [resetToken, setResetToken] = useState(readResetToken);
  const [resetOpen, setResetOpen] = useState(() => Boolean(readResetToken()));
  const [resetPassword, setResetPassword] = useState("");
  const [resetPasswordConfirmation, setResetPasswordConfirmation] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [playHeroVideo, setPlayHeroVideo] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(min-width: 1024px) and (prefers-reduced-motion: no-preference)");
    const update = () => setPlayHeroVideo(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  const passwordStrength = [
    resetPassword.length >= 8,
    /[a-z]/.test(resetPassword) && /[A-Z]/.test(resetPassword),
    /\d/.test(resetPassword),
    /[^A-Za-z0-9]/.test(resetPassword),
  ].filter(Boolean).length;
  const passwordStrengthLabel = passwordStrength <= 1 ? "Başlangıç" : passwordStrength <= 2 ? "Orta" : passwordStrength === 3 ? "Güçlü" : "Çok güçlü";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedIdentifier = identifier.trim();
    // Burada e-posta biçimi DAYATILMAZ: alan artık kullanıcı adı da kabul ediyor
    // (örn. `Raifsenturk`). Doğrulama sunucuda yapılır; istemcide biçim kontrolü
    // yapmak kullanıcı adıyla girişi tamamen engellerdi.
    if (!trimmedIdentifier) {
      toast.error("Kullanıcı adı veya e-posta girin");
      return;
    }
    setBusy(true);
    try {
      if (remember) localStorage.setItem(REMEMBER_KEY, trimmedIdentifier);
      else localStorage.removeItem(REMEMBER_KEY);
      await onLogin(trimmedIdentifier, password);
    } catch (err: any) {
      toast.error(err?.message ?? "Giriş başarısız");
    } finally {
      setBusy(false);
    }
  };

  const submitForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = forgotEmail.trim();
    const parsed = emailSchema.safeParse(trimmedEmail);
    if (!parsed.success) return toast.error("Geçerli bir e-posta adresi girin");
    setForgotBusy(true);
    try {
      await authService.forgotPassword(parsed.data);
      toast.success("Şifre sıfırlama bağlantısı gönderildi (varsa)");
      setForgotSent(true);
    } catch (err: any) {
      toast.error(err?.message ?? "İstek başarısız");
    } finally {
      setForgotBusy(false);
    }
  };

  const submitReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetToken) {
      toast.error("Şifre sıfırlama bağlantısı geçersiz");
      return;
    }
    if (resetPassword.length < 8 || resetPassword.length > 128) {
      toast.error("Yeni şifre 8 ile 128 karakter arasında olmalıdır");
      return;
    }
    if (resetPassword !== resetPasswordConfirmation) {
      toast.error("Şifreler birbiriyle eşleşmiyor");
      return;
    }
    setResetBusy(true);
    try {
      await authService.resetPassword(resetToken, resetPassword);
      setResetPassword("");
      setResetPasswordConfirmation("");
      setResetToken("");
      setResetSuccess(true);
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.delete("resetToken");
        url.searchParams.delete("token");
        window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
      }
      toast.success("Şifreniz güncellendi. Yeni şifrenizle giriş yapabilirsiniz.");
    } catch (err: any) {
      toast.error(err?.message ?? "Şifre sıfırlama bağlantısı geçersiz veya süresi dolmuş");
    } finally {
      setResetBusy(false);
    }
  };

  return (
    <div className="grid h-full min-h-0 w-full grid-cols-1 overflow-hidden bg-[#0a0d12] text-foreground lg:grid-cols-[minmax(0,1fr)_530px] xl:grid-cols-[minmax(0,1fr)_590px]">
      {/* Left video panel */}
      <div className="relative hidden min-h-0 overflow-hidden bg-[#020b2b] lg:block">
        <img
          src="/brand/login-hero-2026-07-21-poster.jpg"
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full object-cover object-center"
        />
        {playHeroVideo && (
          <video
            autoPlay
            loop
            muted
            playsInline
            preload="metadata"
            poster="/brand/login-hero-2026-07-21-poster.jpg"
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 h-full w-full object-cover object-center"
          >
            <source src="/brand/login-hero-2026-07-21.mp4" type="video/mp4" />
          </video>
        )}
        <img
          src="/brand/haksan-logo-white.png"
          alt="Haksan Makina"
          className="absolute left-8 top-8 z-10 h-16 w-auto max-w-[230px] object-contain drop-shadow-[0_3px_14px_rgba(0,0,0,0.55)] xl:left-10 xl:top-10"
        />
      </div>

      {/* Right form panel */}
      <div className="flex min-h-0 items-center justify-center overflow-y-auto border-l border-white/10 bg-black/50 p-5 backdrop-blur-3xl backdrop-saturate-150 lg:px-7 lg:py-8 xl:px-9">
        <div className="w-full max-w-[470px]">
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <img
              src="/brand/haksan-logo-white.png"
              alt="Haksan Makina"
              className="h-11 w-auto max-w-[165px] object-contain"
            />
            <div className="text-[11px] uppercase tracking-wider text-white/50">CRM · Operasyon · Servis</div>
          </div>

          <div className="mb-5 hidden items-center gap-2.5 lg:flex">
            <img src="/brand/haksan-logo-white.png" alt="Haksan Makina" className="h-10 w-auto max-w-[150px] object-contain" />
            <div className="h-7 w-px bg-white/15" />
            <div className="text-[11px] uppercase tracking-wider text-white/55">Kurumsal panel</div>
          </div>

          <div className="mb-4">
            <div className="mb-1.5 text-[11px] uppercase tracking-wider text-white/70">Güvenli giriş</div>
            <h1 className="text-2xl leading-tight tracking-tight text-white">Hesabınıza giriş yapın</h1>
            <p className="mt-1 text-xs leading-relaxed text-white/50">
              Henüz hesabınız yok mu?{" "}
              <span className="text-white/85">Sistem yöneticinizle iletişime geçin</span>
            </p>
          </div>

          <Card className="overflow-hidden border-white/15 bg-black/50 text-white shadow-[0_24px_70px_rgba(0,0,0,0.28)] backdrop-blur-2xl backdrop-saturate-150">
            <div className="h-1 bg-brand-red" />
            <CardContent className="p-5">
              <form onSubmit={submit} className="space-y-3.5">
                <div>
                  <Label htmlFor="login-identifier" className="text-xs text-white/75">Kullanıcı adı</Label>
                  <Input
                    id="login-identifier"
                    data-testid="login-identifier"
                    name="identifier"
                    // type="email" KULLANMA: tarayıcı `Raifsenturk` gibi
                    // kullanıcı adlarını geçersiz sayıp formu göndermez.
                    type="text"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    className="mt-1.5 h-10 border-white/15 bg-black/30 text-white shadow-inner shadow-black/10 placeholder:text-white/35 hover:border-white/25 focus-visible:border-white/35 focus-visible:ring-white/10"
                    autoComplete="username"
                    placeholder="örn. raifsenturk"
                    required
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <Label htmlFor="login-password" className="text-xs text-white/75">Şifre</Label>
                    <button
                      type="button"
                      className="text-xs text-white/70 hover:text-white hover:underline"
                      onClick={() => {
                        // Şifre sıfırlama e-posta ile yürür; alanda kullanıcı adı
                        // varsa kullanıcı e-postasını kendisi yazar.
                        setForgotEmail(identifier.includes("@") ? identifier : "");
                        setForgotOpen(true);
                      }}
                    >
                      Şifremi unuttum
                    </button>
                  </div>
                  <div className="relative">
                    <Input
                      id="login-password"
                      name="password"
                      type={show ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="h-10 border-white/15 bg-black/30 pr-10 text-white shadow-inner shadow-black/10 hover:border-white/25 focus-visible:border-white/35 focus-visible:ring-white/10"
                      autoComplete="current-password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShow((s) => !s)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/45 hover:text-white"
                      aria-label={show ? "Şifreyi gizle" : "Şifreyi göster"}
                    >
                      {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>

                <label htmlFor="login-remember" className="flex cursor-pointer select-none items-center gap-2 text-sm text-white/80">
                  <input
                    id="login-remember"
                    name="remember"
                    type="checkbox"
                    className="size-4 rounded border-white/25 accent-brand-red"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                  />
                  <span>Beni hatırla</span>
                </label>

                <Button type="submit" className="w-full h-10 gap-1.5" disabled={busy}>
                  {busy ? "Giriş yapılıyor…" : "Giriş Yap"}
                  {!busy && <ArrowRight className="size-4" />}
                </Button>

                {ssoEnabled && (
                  <>
                    <div className="relative my-2">
                      <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t border-white/15" />
                      </div>
                      <div className="relative flex justify-center text-xs">
                        <span className="bg-black/50 px-2 text-white/45">veya</span>
                      </div>
                    </div>

                    <Button type="button" variant="outline" className="h-10 w-full border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white">
                      <ShieldCheck className="size-4" />
                      SSO ile devam et
                    </Button>
                  </>
                )}
              </form>
            </CardContent>
          </Card>

          {onReplayIntro && (
            <button
              type="button"
              data-testid="onboarding-replay"
              onClick={onReplayIntro}
              className="mx-auto mt-4 flex items-center gap-2 rounded-md px-3 py-2 text-xs font-medium text-white/60 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            >
              <PlayCircle className="size-4" /> Tanıtımı izle
            </button>
          )}

          {!isProd && (
          <div className="mt-5 rounded-lg border border-white/15 bg-black/50 p-3 text-xs text-white/55 shadow-[0_18px_50px_rgba(0,0,0,0.2)] backdrop-blur-2xl backdrop-saturate-150">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-3.5 text-emerald-300" />
              Demo kullanıcılar (yalnızca geliştirme):
            </div>
            <ul className="mt-2 ml-5 list-disc space-y-0.5">
              <li>superadmin / superadmin12345</li>
              <li>admin / admin12345</li>
              <li>sales / sales12345</li>
              <li>service / service12345</li>
              <li>finance / finance12345</li>
            </ul>
          </div>
          )}

          <Dialog
            open={forgotOpen}
            onOpenChange={(next) => {
              setForgotOpen(next);
              if (!next) setForgotSent(false);
            }}
          >
            <DialogContent className="max-w-sm overflow-hidden p-0">
              <div className="h-1 bg-brand-red" />
              <div className="p-6 pt-5">
              <DialogHeader>
                <div className="mb-2 grid size-11 place-items-center rounded-xl border border-primary/15 bg-primary/5 text-primary">
                  {forgotSent ? <MailCheck className="size-5" /> : <KeyRound className="size-5" />}
                </div>
                <DialogTitle>{forgotSent ? "E-postanızı kontrol edin" : "Şifremi unuttum"}</DialogTitle>
                <DialogDescription>
                  {forgotSent
                    ? `${forgotEmail.trim()} adresi sistemde kayıtlıysa güvenli sıfırlama bağlantısı gönderildi.`
                    : "Kayıtlı e-posta adresinize güvenli bir sıfırlama bağlantısı gönderilir."}
                </DialogDescription>
              </DialogHeader>
              {forgotSent ? (
                <div className="mt-5 space-y-4">
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs leading-relaxed text-emerald-800">
                    <div className="flex items-center gap-2 font-medium"><CheckCircle2 className="size-4" /> İstek güvenle alındı</div>
                    <p className="mt-1.5 text-emerald-700">Bağlantı kısa süre içinde ulaşır. Gelen kutunuzda yoksa spam klasörünü kontrol edin.</p>
                  </div>
                  <Button type="button" className="w-full" onClick={() => setForgotOpen(false)}>Giriş ekranına dön</Button>
                </div>
              ) : (
              <form onSubmit={submitForgot} className="mt-5 space-y-3">
                <div>
                  <Label htmlFor="forgot-email" className="text-xs">E-posta</Label>
                  <Input
                    id="forgot-email"
                    name="forgot-email"
                    type="text"
                    inputMode="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    className="mt-1.5"
                    autoComplete="email"
                    required
                  />
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setForgotOpen(false)}>İptal</Button>
                  <Button type="submit" disabled={forgotBusy}>{forgotBusy ? "Gönderiliyor…" : "Gönder"}</Button>
                </DialogFooter>
              </form>
              )}
              </div>
            </DialogContent>
          </Dialog>

          <Dialog
            open={resetOpen}
            onOpenChange={(next) => {
              setResetOpen(next);
              if (!next) setResetSuccess(false);
            }}
          >
            <DialogContent className="max-w-sm overflow-hidden p-0">
              <div className="h-1 bg-brand-red" />
              <div className="p-6 pt-5">
              <DialogHeader>
                <div className="mb-2 grid size-11 place-items-center rounded-xl border border-primary/15 bg-primary/5 text-primary">
                  {resetSuccess ? <CheckCircle2 className="size-5" /> : <ShieldCheck className="size-5" />}
                </div>
                <DialogTitle>{resetSuccess ? "Şifreniz güncellendi" : "Yeni şifre belirle"}</DialogTitle>
                <DialogDescription>
                  {resetSuccess ? "Hesabınız yeni şifrenizle giriş yapmaya hazır." : "En az 8 karakter kullanın; farklı karakter türleri şifrenizi güçlendirir."}
                </DialogDescription>
              </DialogHeader>
              {resetSuccess ? (
                <div className="mt-5 space-y-4">
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs leading-relaxed text-emerald-800">
                    <div className="flex items-center gap-2 font-medium"><CheckCircle2 className="size-4" /> Güvenlik bilgisi kaydedildi</div>
                    <p className="mt-1.5 text-emerald-700">Şimdi yeni şifrenizi kullanarak oturum açabilirsiniz.</p>
                  </div>
                  <Button type="button" className="w-full" onClick={() => setResetOpen(false)}>Giriş yap</Button>
                </div>
              ) : (
              <form onSubmit={submitReset} className="mt-5 space-y-3">
                <div>
                  <Label htmlFor="reset-password" className="text-xs">Yeni şifre</Label>
                  <Input
                    id="reset-password"
                    name="reset-password"
                    type="password"
                    value={resetPassword}
                    onChange={(e) => setResetPassword(e.target.value)}
                    className="mt-1.5"
                    autoComplete="new-password"
                    minLength={8}
                    maxLength={128}
                    required
                  />
                  <div className="mt-2">
                    <div className="flex gap-1" aria-label={`Şifre gücü: ${passwordStrengthLabel}`}>
                      {[0, 1, 2, 3].map((level) => (
                        <span key={level} className={`h-1.5 flex-1 rounded-full ${level < passwordStrength ? passwordStrength >= 3 ? "bg-emerald-500" : "bg-amber-500" : "bg-muted"}`} />
                      ))}
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>Şifre gücü</span><span className="font-medium text-foreground">{resetPassword ? passwordStrengthLabel : "Bekleniyor"}</span>
                    </div>
                  </div>
                </div>
                <div>
                  <Label htmlFor="reset-password-confirmation" className="text-xs">Yeni şifre tekrarı</Label>
                  <Input
                    id="reset-password-confirmation"
                    name="reset-password-confirmation"
                    type="password"
                    value={resetPasswordConfirmation}
                    onChange={(e) => setResetPasswordConfirmation(e.target.value)}
                    className="mt-1.5"
                    autoComplete="new-password"
                    minLength={8}
                    maxLength={128}
                    required
                  />
                </div>
                <div className="grid gap-1.5 rounded-xl border border-border/70 bg-muted/25 p-3 text-xs">
                  <PasswordRule met={resetPassword.length >= 8 && resetPassword.length <= 128} label="8–128 karakter" />
                  <PasswordRule met={Boolean(resetPassword) && resetPassword === resetPasswordConfirmation} label="Şifreler eşleşiyor" />
                  <p className="pt-1 text-[10px] leading-relaxed text-muted-foreground">Büyük/küçük harf, rakam ve sembol kullanımı güç seviyesini artırır.</p>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={resetBusy || resetPassword.length < 8 || resetPassword !== resetPasswordConfirmation}>{resetBusy ? "Kaydediliyor…" : "Şifreyi güncelle"}</Button>
                </DialogFooter>
              </form>
              )}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
}

function PasswordRule({ met, label }: { met: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-2 ${met ? "text-emerald-700" : "text-muted-foreground"}`}>
      <span className={`grid size-4 place-items-center rounded-full border ${met ? "border-emerald-200 bg-emerald-50" : "border-border bg-white"}`}>
        {met ? <CheckCircle2 className="size-3" /> : <span className="size-1 rounded-full bg-current opacity-50" />}
      </span>
      {label}
    </div>
  );
}
