import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Switch } from "../../ui/switch";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../../../lib/auth";

type SettingsData = {
  companyName: string;
  taxId: string;
  email: string;
  phone: string;
  notifyNewCase: boolean;
  notifyQuoteApproved: boolean;
  notifyPaymentOverdue: boolean;
  notifyService: boolean;
  currency: string;
  timezone: string;
};

const defaults: SettingsData = {
  companyName: "",
  taxId: "",
  email: "",
  phone: "",
  notifyNewCase: true,
  notifyQuoteApproved: true,
  notifyPaymentOverdue: true,
  notifyService: false,
  currency: "USD",
  timezone: "Europe/Istanbul",
};

function storageKey(userId?: string) {
  return userId ? `haksan:settings:${userId}` : "haksan:settings:guest";
}

export function SettingsPage() {
  const { user } = useAuth();
  const [form, setForm] = useState<SettingsData>(() => {
    try {
      const raw = localStorage.getItem(storageKey(user?.id));
      return raw ? { ...defaults, ...JSON.parse(raw) } : defaults;
    } catch {
      return defaults;
    }
  });
  const [saved, setSaved] = useState(false);

  const save = () => {
    localStorage.setItem(storageKey(user?.id), JSON.stringify(form));
    setSaved(true);
    toast.success("Ayarlar kaydedildi", {
      description: user ? "Bu kullanıcı için bu cihazda saklandı." : "Bu cihazda saklandı.",
    });
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
        Bildirim ve görünüm tercihleri kullanıcı bazında bu cihazda saklanır. Kurumsal şirket bilgileri tenant kaydından yönetilir.
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-border/60 shadow-sm overflow-hidden">
          <CardHeader><CardTitle>Şirket Bilgileri (görüntüleme)</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <SettingsField label="Şirket Adı" value={form.companyName} onChange={(v) => setForm({ ...form, companyName: v })} />
            <SettingsField label="VKN" value={form.taxId} onChange={(v) => setForm({ ...form, taxId: v })} />
            <SettingsField label="E-posta" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
            <SettingsField label="Telefon" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
            <p className="text-xs text-muted-foreground">Resmi tenant bilgileri için yönetici panelini kullanın.</p>
          </CardContent>
        </Card>
        <Card className="border-border/60 shadow-sm overflow-hidden">
          <CardHeader><CardTitle>Bildirimler</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <SettingsToggle label="Yeni satış kartı oluşturulduğunda" checked={form.notifyNewCase} onChange={(v) => setForm({ ...form, notifyNewCase: v })} />
            <SettingsToggle label="Teklif onaylandığında" checked={form.notifyQuoteApproved} onChange={(v) => setForm({ ...form, notifyQuoteApproved: v })} />
            <SettingsToggle label="Ödeme gecikmesinde" checked={form.notifyPaymentOverdue} onChange={(v) => setForm({ ...form, notifyPaymentOverdue: v })} />
            <SettingsToggle label="Yeni servis talebinde" checked={form.notifyService} onChange={(v) => setForm({ ...form, notifyService: v })} />
          </CardContent>
        </Card>
        <Card className="border-border/60 shadow-sm overflow-hidden">
          <CardHeader><CardTitle>Para Birimi & Bölge</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <SettingsField label="Varsayılan Para Birimi" value={form.currency} onChange={(v) => setForm({ ...form, currency: v })} />
            <SettingsField label="Saat Dilimi" value={form.timezone} onChange={(v) => setForm({ ...form, timezone: v })} />
          </CardContent>
        </Card>
        <Card className="border-border/60 shadow-sm overflow-hidden">
          <CardHeader><CardTitle>Depolama</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Dosya yüklemeleri S3 uyumlu depolamada tutulur. Bucket ve sağlayıcı yapılandırması sunucu tarafından yönetilir.</p>
          </CardContent>
        </Card>
      </div>
      <Button onClick={save} className="gap-1">
        <Save className="size-4" /> {saved ? "Kaydedildi" : "Kaydet"}
      </Button>
    </div>
  );
}

function SettingsField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} className="mt-1" />
    </div>
  );
}

function SettingsToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <Label className="font-normal text-sm">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
