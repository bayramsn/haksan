import { useEffect, useState } from "react";
import { Button } from "../../ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../ui/tabs";
import { Bell, Briefcase, Building2, Clock, Database, FileCheck2, Globe, Layers, Save, Settings2, SlidersHorizontal, Wrench } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../../../lib/auth";
import { adminService } from "../../../../lib/services";
import { ProductSpecTemplatesCard } from "./ProductSpecTemplatesCard";
import { LookupManagerTab } from "./LookupManagerTab";
import { InfoCallout, SettingsField, SettingsSection, SettingsToggle } from "./settings-controls";

type Preferences = {
  notifyNewCase: boolean;
  notifyQuoteApproved: boolean;
  notifyPaymentOverdue: boolean;
  notifyService: boolean;
  currency: string;
  timezone: string;
};

type CompanyInfo = {
  companyName: string;
  taxId: string;
  email: string;
  phone: string;
};

const prefDefaults: Preferences = {
  notifyNewCase: true,
  notifyQuoteApproved: true,
  notifyPaymentOverdue: true,
  notifyService: false,
  currency: "USD",
  timezone: "Europe/Istanbul",
};

const companyDefaults: CompanyInfo = {
  companyName: "",
  taxId: "",
  email: "",
  phone: "",
};

function storageKey(userId?: string) {
  return userId ? `haksan:settings:${userId}` : "haksan:settings:guest";
}

export function SettingsPage() {
  const { user, hasPermission, hasRole } = useAuth();
  const canReadTenant = hasPermission("tenants.read");
  const canEditTenant = hasPermission("tenants.update");
  const canManageLookups = hasRole("super_admin");

  const [prefs, setPrefs] = useState<Preferences>(() => {
    try {
      const raw = localStorage.getItem(storageKey(user?.id));
      return raw ? { ...prefDefaults, ...JSON.parse(raw) } : prefDefaults;
    } catch {
      return prefDefaults;
    }
  });
  const [prefsSaved, setPrefsSaved] = useState(false);

  const [company, setCompany] = useState<CompanyInfo>(companyDefaults);
  const [companyLoading, setCompanyLoading] = useState(canReadTenant);
  const [companySaving, setCompanySaving] = useState(false);
  const [tab, setTab] = useState("genel");

  useEffect(() => {
    if (!canReadTenant) return;
    let cancelled = false;
    setCompanyLoading(true);
    adminService
      .tenant()
      .then((t) => {
        if (cancelled) return;
        setCompany({
          companyName: t.name ?? "",
          taxId: t.taxNumber ?? "",
          email: t.email ?? "",
          phone: t.phone ?? "",
        });
      })
      .catch(() => {
        if (!cancelled) toast.error("Şirket bilgileri yüklenemedi");
      })
      .finally(() => {
        if (!cancelled) setCompanyLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [canReadTenant]);

  const savePrefs = () => {
    localStorage.setItem(storageKey(user?.id), JSON.stringify(prefs));
    setPrefsSaved(true);
    toast.success("Tercihler kaydedildi", {
      description: user ? "Bu kullanıcı için bu cihazda saklandı." : "Bu cihazda saklandı.",
    });
    setTimeout(() => setPrefsSaved(false), 2000);
  };

  const saveCompany = async () => {
    if (!canEditTenant) return;
    setCompanySaving(true);
    try {
      const updated = await adminService.updateTenant({
        name: company.companyName,
        taxNumber: company.taxId || null,
        email: company.email || null,
        phone: company.phone || null,
      });
      setCompany({
        companyName: updated.name ?? "",
        taxId: updated.taxNumber ?? "",
        email: updated.email ?? "",
        phone: updated.phone ?? "",
      });
      toast.success("Şirket bilgileri kaydedildi");
    } catch (err: any) {
      toast.error("Şirket bilgileri kaydedilemedi", { description: err?.message ?? "API isteği başarısız oldu." });
    } finally {
      setCompanySaving(false);
    }
  };

  const tabTriggerClass =
    "flex-none gap-2 rounded-lg px-3.5 py-2 text-muted-foreground data-[state=active]:text-foreground data-[state=active]:ring-1 data-[state=active]:ring-border/70";

  return (
    <div className="max-w-6xl">
      <Tabs value={tab} onValueChange={setTab} className="gap-4">
        <div className="rounded-xl border border-border/60 bg-gradient-to-br from-primary/8 via-card to-info/8 p-1.5 shadow-sm">
          <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-transparent p-0">
            <TabsTrigger value="genel" className={tabTriggerClass}>
              <Settings2 className="size-4" /> Genel
            </TabsTrigger>
            <TabsTrigger value="sirket" className={tabTriggerClass}>
              <Building2 className="size-4" /> Şirket
            </TabsTrigger>
            <TabsTrigger value="bildirimler" className={tabTriggerClass}>
              <Bell className="size-4" /> Bildirimler
            </TabsTrigger>
            {canManageLookups && (
              <TabsTrigger value="crm-alan" className={tabTriggerClass}>
                <SlidersHorizontal className="size-4" /> CRM Alan Ayarları
              </TabsTrigger>
            )}
            {canManageLookups && (
              <TabsTrigger value="teknik-bilgi" className={tabTriggerClass}>
                <Layers className="size-4" /> Teknik Bilgi
              </TabsTrigger>
            )}
          </TabsList>
        </div>

        {/* Genel */}
        <TabsContent value="genel" className="space-y-4">
          <InfoCallout>
            Bildirim ve görünüm tercihleri kullanıcı bazında bu cihazda saklanır. Kurumsal şirket bilgileri <span className="font-medium">Şirket</span> sekmesinden yönetilir ve tüm kullanıcılarda ortaktır.
          </InfoCallout>
          <SettingsSection icon={<Globe />} tone="info" title="Para Birimi & Bölge" description="Varsayılan para birimi ve saat dilimi.">
            <div className="grid gap-3 sm:grid-cols-2">
              <SettingsField label="Varsayılan Para Birimi" value={prefs.currency} onChange={(v) => setPrefs({ ...prefs, currency: v })} />
              <SettingsField label="Saat Dilimi" value={prefs.timezone} onChange={(v) => setPrefs({ ...prefs, timezone: v })} />
            </div>
          </SettingsSection>
          <SettingsSection icon={<Database />} tone="muted" title="Depolama" description="Dosya yükleme altyapısı.">
            <p className="text-sm text-muted-foreground">
              Dosya yüklemeleri S3 uyumlu depolamada tutulur. Bucket ve sağlayıcı yapılandırması sunucu tarafından yönetilir.
            </p>
          </SettingsSection>
          <div className="flex justify-end">
            <Button onClick={savePrefs} className="gap-1">
              <Save className="size-4" /> {prefsSaved ? "Tercihler Kaydedildi" : "Tercihleri Kaydet"}
            </Button>
          </div>
        </TabsContent>

        {/* Şirket */}
        <TabsContent value="sirket" className="space-y-4">
          <SettingsSection
            icon={<Building2 />}
            tone="primary"
            title="Şirket Bilgileri"
            description="Tenant kaydından yönetilir; tüm kullanıcılarda ortaktır."
            action={
              canEditTenant ? (
                <Button size="sm" onClick={saveCompany} disabled={companyLoading || companySaving} className="gap-1">
                  <Save className="size-4" /> {companySaving ? "Kaydediliyor" : "Kaydet"}
                </Button>
              ) : undefined
            }
          >
            {!canReadTenant ? (
              <p className="text-sm text-muted-foreground">Şirket bilgilerini görüntüleme yetkiniz yok.</p>
            ) : companyLoading ? (
              <p className="text-sm text-muted-foreground">Yükleniyor…</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <SettingsField label="Şirket Adı" value={company.companyName} disabled={!canEditTenant} onChange={(v) => setCompany({ ...company, companyName: v })} />
                <SettingsField label="VKN" value={company.taxId} disabled={!canEditTenant} onChange={(v) => setCompany({ ...company, taxId: v })} />
                <SettingsField label="E-posta" value={company.email} disabled={!canEditTenant} onChange={(v) => setCompany({ ...company, email: v })} />
                <SettingsField label="Telefon" value={company.phone} disabled={!canEditTenant} onChange={(v) => setCompany({ ...company, phone: v })} />
                {!canEditTenant && <p className="text-xs text-muted-foreground sm:col-span-2">Düzenleme için yönetici yetkisi gerekir.</p>}
              </div>
            )}
          </SettingsSection>
        </TabsContent>

        {/* Bildirimler */}
        <TabsContent value="bildirimler" className="space-y-4">
          <SettingsSection icon={<Bell />} tone="warning" title="Bildirim Tercihleri" description="Hangi olaylarda bildirim almak istediğinizi seçin." bodyClassName="py-1">
            <div className="divide-y divide-border/60">
              <SettingsToggle
                icon={<Briefcase />}
                label="Yeni satış kartı oluşturulduğunda"
                description="Sana atanan veya ekibinde yeni bir satış kartı açıldığında bildirim al."
                checked={prefs.notifyNewCase}
                onChange={(v) => setPrefs({ ...prefs, notifyNewCase: v })}
              />
              <SettingsToggle
                icon={<FileCheck2 />}
                label="Teklif onaylandığında"
                description="Gönderdiğin bir teklif müşteri tarafından onaylandığında bildirim al."
                checked={prefs.notifyQuoteApproved}
                onChange={(v) => setPrefs({ ...prefs, notifyQuoteApproved: v })}
              />
              <SettingsToggle
                icon={<Clock />}
                label="Ödeme gecikmesinde"
                description="Bir ödeme vadesi geçtiğinde bildirim al."
                checked={prefs.notifyPaymentOverdue}
                onChange={(v) => setPrefs({ ...prefs, notifyPaymentOverdue: v })}
              />
              <SettingsToggle
                icon={<Wrench />}
                label="Yeni servis talebinde"
                description="Yeni bir servis talebi oluşturulduğunda bildirim al."
                checked={prefs.notifyService}
                onChange={(v) => setPrefs({ ...prefs, notifyService: v })}
              />
            </div>
          </SettingsSection>
          <div className="flex justify-end">
            <Button onClick={savePrefs} className="gap-1">
              <Save className="size-4" /> {prefsSaved ? "Tercihler Kaydedildi" : "Tercihleri Kaydet"}
            </Button>
          </div>
        </TabsContent>

        {/* CRM Alan Ayarları (super_admin) */}
        {canManageLookups && (
          <TabsContent value="crm-alan" className="space-y-4">
            <LookupManagerTab />
          </TabsContent>
        )}

        {/* Teknik Bilgi (super_admin) */}
        {canManageLookups && (
          <TabsContent value="teknik-bilgi" className="space-y-4">
            <ProductSpecTemplatesCard />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
