import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  ArrowRight, ShieldCheck, BarChart3, Wrench, Building2,
  CheckCircle2, Eye, EyeOff,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export function LoginPage({ onLogin }: { onLogin: (email: string, password: string) => Promise<void> | void }) {
  const [show, setShow] = useState(false);
  const [email, setEmail] = useState("admin@haksan.local");
  const [password, setPassword] = useState("admin12345");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await onLogin(email, password);
    } catch (err: any) {
      toast.error(err?.message ?? "Giriş başarısız");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-[1.08fr_1fr] bg-[#f4f6f9] text-foreground">
      {/* Left brand panel */}
      <div className="hidden lg:flex flex-col justify-between p-10 xl:p-12 bg-[linear-gradient(135deg,#0a192f_0%,#000c69_54%,#0a1440_100%)] text-white relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-1 bg-brand-red" />
        <div className="absolute right-0 top-0 h-full w-px bg-white/10" />
        <div className="absolute inset-0 opacity-[0.08] [background-image:linear-gradient(to_right,#fff_1px,transparent_1px),linear-gradient(to_bottom,#fff_1px,transparent_1px)] [background-size:44px_44px]" />

        <div className="relative flex flex-col items-start gap-2">
          <img
            src="/brand/haksan-logo-white.png"
            alt="Haksan Makina"
            className="h-16 w-auto max-w-[230px] object-contain"
          />
          <div className="text-xs text-white/70 uppercase tracking-wider">CRM · Operasyon · Servis · Stok</div>
        </div>

        <div className="relative max-w-xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-md border border-white/15 bg-white/10 px-3 py-1.5 text-xs text-white/80">
            <ShieldCheck className="size-3.5" />
            Haksan Makina kurumsal erişim paneli
          </div>
          <h2 className="max-w-[620px] text-[36px] leading-[1.08] tracking-tight xl:text-[42px]">
            Satış, saha servis ve operasyon tek ekranda.
          </h2>
          <p className="mt-5 max-w-[560px] text-[15px] leading-7 text-white/78">
            Haksan Makina ekipleri için müşteri yönetimi, kanban satış akışı, teklif & sözleşme,
            stok takibi ve saha servis süreçlerini bütünleşik şekilde yönetin.
          </p>

          <div className="mt-8 grid grid-cols-3 gap-3">
            <BrandMetric value="24/7" label="Operasyon izleme" />
            <BrandMetric value="ERP" label="Merkezi kayıt" />
            <BrandMetric value="ISO" label="Süreç disiplini" />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <Feature icon={<BarChart3 className="size-4" />} title="Pipeline & Raporlar" desc="Anlık görünürlük" />
            <Feature icon={<Wrench className="size-4" />} title="Servis Yönetimi" desc="Saha + Garanti" />
            <Feature icon={<Building2 className="size-4" />} title="Çok Şubeli" desc="Şehirler arası erişim" />
            <Feature icon={<ShieldCheck className="size-4" />} title="Yetki & Rol" desc="Kurumsal güvenlik" />
          </div>
        </div>

        <div className="relative flex items-center justify-between gap-4 text-xs text-white/70">
          <div>© {new Date().getFullYear()} Haksan Makina A.Ş.</div>
          <div className="flex items-center gap-4 text-white/65">
            <span>Gizlilik</span>
            <span>Şartlar</span>
            <span>Yardım</span>
          </div>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex items-center justify-center p-6 lg:p-10">
        <div className="w-full max-w-[440px]">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <img
              src="/brand/haksan-logo.png"
              alt="Haksan Makina"
              className="h-11 w-auto max-w-[165px] object-contain"
            />
            <div className="text-[11px] text-muted-foreground uppercase tracking-wider">CRM · Operasyon · Servis</div>
          </div>

          <div className="mb-7 hidden items-center gap-3 lg:flex">
            <img src="/brand/haksan-logo.png" alt="Haksan Makina" className="h-12 w-auto max-w-[180px] object-contain" />
            <div className="h-8 w-px bg-border" />
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Kurumsal panel</div>
          </div>

          <div className="mb-6">
            <div className="text-[11px] uppercase tracking-wider text-primary mb-1.5">Güvenli giriş</div>
            <h1 className="text-[26px] leading-tight tracking-tight">Hesabınıza giriş yapın</h1>
            <p className="text-sm text-muted-foreground mt-1.5">
              Henüz hesabınız yok mu?{" "}
              <span className="text-primary">Sistem yöneticinizle iletişime geçin</span>
            </p>
          </div>

          <Card className="overflow-hidden border-border/70 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.10)]">
            <div className="h-1 bg-brand-red" />
            <CardContent className="p-6">
              <form onSubmit={submit} className="space-y-4">
                <div>
                  <Label className="text-xs text-foreground/80">E-posta</Label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="mt-1.5 h-10"
                    autoComplete="username"
                    required
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <Label className="text-xs text-foreground/80">Şifre</Label>
                    <span className="text-xs text-primary">Şifremi unuttum</span>
                  </div>
                  <div className="relative">
                    <Input
                      type={show ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="h-10 pr-10"
                      autoComplete="current-password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShow((s) => !s)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>

                <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                  <input type="checkbox" className="size-4 rounded border-border accent-primary" />
                  <span>Beni hatırla</span>
                </label>

                <Button type="submit" className="w-full h-10 gap-1.5" disabled={busy}>
                  {busy ? "Giriş yapılıyor…" : "Giriş Yap"}
                  {!busy && <ArrowRight className="size-4" />}
                </Button>

                <div className="relative my-2">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-border/60" />
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="bg-card px-2 text-muted-foreground">veya</span>
                  </div>
                </div>

                <Button type="button" variant="outline" className="w-full h-10">
                  <ShieldCheck className="size-4" />
                  SSO ile devam et
                </Button>
              </form>
            </CardContent>
          </Card>

          <div className="mt-5 rounded-lg border border-border/70 bg-white p-3 text-xs text-muted-foreground shadow-sm">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-3.5 text-emerald-600" />
              Demo kullanıcılar:
            </div>
            <ul className="mt-2 ml-5 list-disc space-y-0.5">
              <li>superadmin@haksan.local / superadmin12345</li>
              <li>admin@haksan.local / admin12345</li>
              <li>sales@haksan.local / sales12345</li>
              <li>service@haksan.local / service12345</li>
              <li>finance@haksan.local / finance12345</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function BrandMetric({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.07] px-3 py-3">
      <div className="text-lg leading-none tracking-tight">{value}</div>
      <div className="mt-1 text-[11px] leading-tight text-white/65">{label}</div>
    </div>
  );
}

function Feature({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-2.5 p-3 rounded-lg bg-white/[0.07] backdrop-blur border border-white/10">
      <div className="size-8 rounded-md bg-white/12 grid place-items-center shrink-0">{icon}</div>
      <div className="min-w-0">
        <div className="text-sm leading-tight">{title}</div>
        <div className="text-[11px] opacity-75 mt-0.5">{desc}</div>
      </div>
    </div>
  );
}
