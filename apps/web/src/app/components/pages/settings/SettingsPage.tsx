import { useEffect, useMemo, useState } from "react";
import { Button } from "../../ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../ui/tabs";
import {
  AlertCircle,
  Bell,
  Briefcase,
  Building2,
  CheckCircle2,
  Clock,
  Database,
  FileCheck2,
  Globe,
  GitBranch,
  Eye,
  EyeOff,
  Layers,
  Mail,
  MailCheck,
  RotateCcw,
  Save,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../../../lib/auth";
import { adminService } from "../../../../lib/services";
import { ProductSpecTemplatesCard } from "./ProductSpecTemplatesCard";
import { LookupManagerTab } from "./LookupManagerTab";
import { DepartmentSettingsCard } from "./DepartmentSettingsCard";
import { InfoCallout, SettingsField, SettingsSection, SettingsToggle } from "./settings-controls";
import { MailAccountSettings } from "./MailAccountSettings";
import { LeadAssignmentRulesCard } from "./LeadAssignmentRulesCard";
import { NAVIGATION_GROUPS, type NavigationVisibilityKey } from "@haksan/shared";

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
  const { user, hasPermission, hasRole, refresh } = useAuth();
  const canReadTenant = hasPermission("tenants.read");
  const canEditTenant = hasPermission("tenants.update");
  const canManageLookups = hasRole("super_admin");
  const canManageLeadAssignmentRules = hasPermission("lead_assignment_rules.manage");

  const [prefs, setPrefs] = useState<Preferences>(() => {
    try {
      const raw = localStorage.getItem(storageKey(user?.id));
      return raw ? { ...prefDefaults, ...JSON.parse(raw) } : prefDefaults;
    } catch {
      return prefDefaults;
    }
  });
  const [prefsBaseline, setPrefsBaseline] = useState<Preferences>(prefs);
  const [prefsSaved, setPrefsSaved] = useState(false);

  const [company, setCompany] = useState<CompanyInfo>(companyDefaults);
  const [companyBaseline, setCompanyBaseline] = useState<CompanyInfo>(companyDefaults);
  const [companyLoading, setCompanyLoading] = useState(canReadTenant);
  const [companySaving, setCompanySaving] = useState(false);
  const [hiddenNavigationKeys, setHiddenNavigationKeys] = useState<NavigationVisibilityKey[]>([]);
  const [hiddenNavigationBaseline, setHiddenNavigationBaseline] = useState<NavigationVisibilityKey[]>([]);
  const [navigationSaving, setNavigationSaving] = useState(false);
  const [tab, setTab] = useState("genel");

  useEffect(() => {
    if (!canReadTenant) return;
    let cancelled = false;
    setCompanyLoading(true);
    adminService
      .tenant()
      .then((t) => {
        if (cancelled) return;
        const nextCompany = {
          companyName: t.name ?? "",
          taxId: t.taxNumber ?? "",
          email: t.email ?? "",
          phone: t.phone ?? "",
        };
        setCompany(nextCompany);
        setCompanyBaseline(nextCompany);
        const nextHiddenNavigationKeys = Array.isArray(t.hiddenNavigationKeys)
          ? t.hiddenNavigationKeys as NavigationVisibilityKey[]
          : [];
        setHiddenNavigationKeys(nextHiddenNavigationKeys);
        setHiddenNavigationBaseline(nextHiddenNavigationKeys);
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
    setPrefsBaseline(prefs);
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
      const nextCompany = {
        companyName: updated.name ?? "",
        taxId: updated.taxNumber ?? "",
        email: updated.email ?? "",
        phone: updated.phone ?? "",
      };
      setCompany(nextCompany);
      setCompanyBaseline(nextCompany);
      toast.success("Şirket bilgileri kaydedildi");
    } catch (err: any) {
      toast.error("Şirket bilgileri kaydedilemedi", { description: err?.message ?? "API isteği başarısız oldu." });
    } finally {
      setCompanySaving(false);
    }
  };

  const saveNavigation = async () => {
    if (!canEditTenant) return;
    setNavigationSaving(true);
    try {
      const updated = await adminService.updateTenant({ hiddenNavigationKeys });
      const next = Array.isArray(updated.hiddenNavigationKeys)
        ? updated.hiddenNavigationKeys as NavigationVisibilityKey[]
        : [];
      setHiddenNavigationKeys(next);
      setHiddenNavigationBaseline(next);
      await refresh();
      toast.success("Menü ve akış ayarları kaydedildi", {
        description: "Seçim tüm kullanıcıların sol menüsüne uygulandı.",
      });
    } catch (err: any) {
      toast.error("Menü ve akış ayarları kaydedilemedi", { description: err?.message ?? "API isteği başarısız oldu." });
    } finally {
      setNavigationSaving(false);
    }
  };

  const prefsDirty = useMemo(() => JSON.stringify(prefs) !== JSON.stringify(prefsBaseline), [prefs, prefsBaseline]);
  const companyDirty = useMemo(() => JSON.stringify(company) !== JSON.stringify(companyBaseline), [company, companyBaseline]);
  const navigationDirty = useMemo(
    () => JSON.stringify([...hiddenNavigationKeys].sort()) !== JSON.stringify([...hiddenNavigationBaseline].sort()),
    [hiddenNavigationBaseline, hiddenNavigationKeys]
  );
  const hasPendingChanges = (tab === "genel" || tab === "bildirimler")
    ? prefsDirty
    : tab === "sirket"
      ? companyDirty
      : tab === "menu"
        ? navigationDirty
        : false;
  const canSavePending = (tab !== "sirket" && tab !== "menu") || canEditTenant;
  const pendingSaveBusy = companySaving || navigationSaving;

  const resetPendingChanges = () => {
    if (tab === "sirket") setCompany(companyBaseline);
    else if (tab === "menu") setHiddenNavigationKeys(hiddenNavigationBaseline);
    else setPrefs(prefsBaseline);
  };

  const savePendingChanges = () => {
    if (tab === "sirket") void saveCompany();
    else if (tab === "menu") void saveNavigation();
    else savePrefs();
  };

  const activeSection = {
    genel: { eyebrow: "KİŞİSEL ÇALIŞMA ALANI", title: "Genel tercihler", description: "Bölge, para birimi ve kullanıcıya özel davranışlar." },
    sirket: { eyebrow: "KURUMSAL KİMLİK", title: "Şirket profili", description: "Tüm kullanıcıların gördüğü doğrulanmış şirket bilgileri." },
    bildirimler: { eyebrow: "OLAY AKIŞI", title: "Bildirim merkezi", description: "Kritik operasyon olaylarının kişisel teslim tercihleri." },
    menu: { eyebrow: "ÇALIŞMA ALANI", title: "Menü ve akış", description: "Kullanıcıların kullanacağı sayfaları ve uygulama akışını yönetin." },
    webmail: { eyebrow: "GÜVENLİ GÖNDERİCİ", title: "Webmail bağlantısı", description: "CRM e-postalarını kendi kurumsal adresinizden gönderin." },
    "crm-alan": { eyebrow: "VERİ MODELİ", title: "CRM alan yöneticisi", description: "Kayıt formlarının alan yapısı ve seçim sözlükleri." },
    "lead-atama": { eyebrow: "SATIŞ YÖNLENDİRME", title: "Lead atama motoru", description: "Yeni leadleri bölüm ve ticari kriterlere göre sırayla yönlendirin." },
    "teknik-bilgi": { eyebrow: "ÜRÜN ŞEMASI", title: "Teknik bilgi şablonları", description: "Ürün ailelerine göre teknik bilgi kapsamı." },
  }[tab] ?? { eyebrow: "SİSTEM", title: "Ayarlar", description: "Çalışma alanı ayarlarını yönetin." };

  const tabTriggerClass =
    "h-10 flex-none justify-start gap-2 rounded-lg px-3.5 py-2 text-muted-foreground data-[state=active]:text-foreground data-[state=active]:ring-1 data-[state=active]:ring-border/70 lg:w-full lg:flex-none";

  return (
    <div className="mx-auto max-w-[1480px] space-y-5 pb-20">
      <section className="premium-blueprint precision-corners overflow-hidden rounded-2xl border border-primary/20 bg-[linear-gradient(135deg,var(--card),color-mix(in_srgb,var(--primary)_7%,var(--card)))] px-5 py-5 shadow-sm sm:px-6">
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-mono text-[10px] font-semibold tracking-[0.2em] text-primary">{activeSection.eyebrow}</p>
            <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight sm:text-3xl">{activeSection.title}</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{activeSection.description}</p>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-card/85 px-4 py-3 backdrop-blur">
            <span className="flex size-10 items-center justify-center rounded-lg bg-success/10 text-success"><ShieldCheck className="size-5" /></span>
            <div>
              <p className="text-xs font-medium">Yetki kapsamı</p>
              <p className="text-[11px] text-muted-foreground">{canManageLookups ? "Sistem yöneticisi" : canEditTenant ? "Şirket yöneticisi" : "Kişisel tercihler"}</p>
            </div>
          </div>
        </div>
      </section>

      <Tabs value={tab} onValueChange={setTab} className="gap-5 lg:grid lg:grid-cols-[250px_minmax(0,1fr)] lg:items-start lg:gap-6">
        <aside className="rounded-xl border border-border/60 bg-card p-2 shadow-sm lg:sticky lg:top-4">
          <div className="hidden px-3 pb-2 pt-2 lg:block">
            <p className="font-mono text-[9px] font-semibold tracking-[0.18em] text-muted-foreground">AYAR BÖLÜMLERİ</p>
            <p className="mt-1 text-xs text-muted-foreground">Bir bölüm seçerek yapılandırın.</p>
          </div>
          <TabsList className="flex h-auto w-full justify-start gap-1 overflow-x-auto border-0 bg-transparent p-0 lg:flex-col lg:overflow-visible">
            <TabsTrigger value="genel" className={tabTriggerClass}>
              <Settings2 className="size-4" /> Genel
            </TabsTrigger>
            <TabsTrigger value="sirket" className={tabTriggerClass}>
              <Building2 className="size-4" /> Şirket
            </TabsTrigger>
            <TabsTrigger value="bildirimler" className={tabTriggerClass}>
              <Bell className="size-4" /> Bildirimler
            </TabsTrigger>
            <TabsTrigger value="menu" className={tabTriggerClass}>
              <Eye className="size-4" /> Menü & Akış
            </TabsTrigger>
            <TabsTrigger value="webmail" className={tabTriggerClass}>
              <MailCheck className="size-4" /> Webmail
            </TabsTrigger>
            {canManageLookups && (
              <TabsTrigger value="crm-alan" className={tabTriggerClass}>
                <SlidersHorizontal className="size-4" /> CRM Alan Ayarları
              </TabsTrigger>
            )}
            {canManageLeadAssignmentRules && (
              <TabsTrigger value="lead-atama" className={tabTriggerClass}>
                <GitBranch className="size-4" /> Lead Atama
              </TabsTrigger>
            )}
            {canManageLookups && (
              <TabsTrigger value="teknik-bilgi" className={tabTriggerClass}>
                <Layers className="size-4" /> Teknik Bilgi
              </TabsTrigger>
            )}
          </TabsList>
          <div className="mt-2 hidden border-t border-border/60 px-3 pb-2 pt-3 lg:block">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="size-1.5 rounded-full bg-success" />
              Değişiklik takibi aktif
            </div>
          </div>
        </aside>

        <main className="min-w-0 space-y-4">

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
        </TabsContent>

        {/* Şirket */}
        <TabsContent value="sirket" className="space-y-4">
          <SettingsSection
            icon={<Building2 />}
            tone="primary"
            title="Şirket Bilgileri"
            description="Tenant kaydından yönetilir; tüm kullanıcılarda ortaktır."
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

          {canReadTenant && !companyLoading && (
            <SettingsSection icon={<Globe />} tone="info" title="Canlı Kurumsal Önizleme" description="Kaydetmeden önce şirket kimliğinin çalışma alanında nasıl görüneceğini kontrol edin.">
              <div className="premium-blueprint precision-corners overflow-hidden rounded-xl border border-primary/15 bg-[linear-gradient(135deg,#07113f,#101b55)] p-5 text-white">
                <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="rounded-lg bg-white px-3 py-2 shadow-lg shadow-black/15">
                    <img src="/brand/haksan-logo.png" alt="Haksan Makina" className="h-8 w-auto max-w-[170px] object-contain" />
                  </div>
                  <div className="min-w-0 text-left sm:text-right">
                    <p className="font-display text-xl font-semibold tracking-tight">{company.companyName || "Şirket adını girin"}</p>
                    <p className="mt-1 text-xs text-white/65">VKN {company.taxId || "—"} · {company.phone || "Telefon bilgisi yok"}</p>
                    <p className="mt-0.5 truncate text-xs text-white/65">{company.email || "E-posta bilgisi yok"}</p>
                  </div>
                </div>
              </div>
            </SettingsSection>
          )}
        </TabsContent>

        {/* Bildirimler */}
        <TabsContent value="bildirimler" className="space-y-4">
          <SettingsSection icon={<Bell />} tone="warning" title="Bildirim Tercihleri" description="Hangi olaylarda bildirim almak istediğinizi seçin." bodyClassName="py-1">
            <div className="mx-4 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/25 px-3 py-2.5">
              <div>
                <p className="text-xs font-medium">Etkin olaylar</p>
                <p className="text-[11px] text-muted-foreground">{Object.entries(prefs).filter(([key, value]) => key.startsWith("notify") && value).length} / 4 olay türü</p>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1 rounded-md border border-border/70 bg-card px-2 py-1"><Bell className="size-3" /> Uygulama içi</span>
                <span className="inline-flex items-center gap-1 rounded-md border border-border/70 bg-card px-2 py-1"><Mail className="size-3" /> Olay e-postası</span>
              </div>
            </div>
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
        </TabsContent>

        <TabsContent value="menu" className="space-y-4">
          <InfoCallout>
            Burada kapatılan sayfalar tüm kullanıcıların ana menüsünden, <span className="font-medium">Sabitlenenler</span>, <span className="font-medium">Son kullanılan</span>, <span className="font-medium">Hızlı Oluştur</span> ve uygulama içi yönlendirme akışlarından çıkarılır. Ayarlar sayfası her zaman açık kalır.
          </InfoCallout>
          <SettingsSection
            icon={<Eye />}
            tone="primary"
            title="Çalışma alanları"
            description="Şirket akışında kullanılmayan sayfaları kapatın. Ayarlar sayfası güvenli geri dönüş için her zaman açık kalır."
          >
            <div className="mb-4 flex flex-col gap-3 rounded-lg border border-border/60 bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium">
                  {NAVIGATION_GROUPS.reduce((total, group) => total + group.items.length, 0) - hiddenNavigationKeys.length} sayfa açık
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {hiddenNavigationKeys.length === 0 ? "Tüm çalışma alanları akışta." : `${hiddenNavigationKeys.length} çalışma alanı kapatıldı.`}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={!canEditTenant || hiddenNavigationKeys.length === 0}
                onClick={() => setHiddenNavigationKeys([])}
              >
                <Eye className="size-3.5" /> Tümünü göster
              </Button>
            </div>

            <div className="grid gap-3 xl:grid-cols-2">
              {NAVIGATION_GROUPS.map((group) => (
                <section key={group.group} className="overflow-hidden rounded-lg border border-border/60 bg-card">
                  <div className="flex items-center justify-between border-b border-border/60 bg-muted/25 px-3 py-2.5">
                    <p className="text-xs font-semibold">{group.group}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {group.items.filter((item) => !hiddenNavigationKeys.includes(item.key)).length}/{group.items.length} açık
                    </p>
                  </div>
                  <div className="divide-y divide-border/50">
                    {group.items.map((item) => {
                      const visible = !hiddenNavigationKeys.includes(item.key);
                      return (
                        <button
                          key={item.key}
                          type="button"
                          aria-pressed={visible}
                          disabled={!canEditTenant}
                          onClick={() => setHiddenNavigationKeys((keys) => visible
                            ? [...keys, item.key]
                            : keys.filter((key) => key !== item.key))}
                          className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/35 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <span className={`grid size-8 place-items-center rounded-md ${visible ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                            {visible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                          </span>
                          <span className="min-w-0 flex-1 text-sm font-medium">{item.label}</span>
                          <span className={`text-[11px] font-semibold ${visible ? "text-success" : "text-muted-foreground"}`}>
                            {visible ? "Açık" : "Akış dışı"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
            {!canEditTenant && <p className="mt-3 text-xs text-muted-foreground">Çalışma alanı akışını değiştirmek için şirket ayarlarını düzenleme yetkisi gerekir.</p>}
          </SettingsSection>
        </TabsContent>

        <TabsContent value="webmail" className="space-y-4">
          <MailAccountSettings />
        </TabsContent>

        {/* CRM Alan Ayarları (super_admin) */}
        {canManageLookups && (
          <TabsContent value="crm-alan" className="space-y-4">
            <DepartmentSettingsCard />
            <LookupManagerTab />
          </TabsContent>
        )}

        {canManageLeadAssignmentRules && (
          <TabsContent value="lead-atama" className="space-y-4">
            <LeadAssignmentRulesCard />
          </TabsContent>
        )}

        {/* Teknik Bilgi (super_admin) */}
        {canManageLookups && (
          <TabsContent value="teknik-bilgi" className="space-y-4">
            <ProductSpecTemplatesCard />
          </TabsContent>
        )}
        </main>
      </Tabs>

      {hasPendingChanges && canSavePending && (
        <div className="fixed bottom-4 left-1/2 z-40 w-[min(720px,calc(100%-2rem))] -translate-x-1/2 rounded-xl border border-warning/30 bg-card/95 p-3 shadow-2xl shadow-black/15 backdrop-blur-xl surface-enter lg:left-[calc(50%+8rem)]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-warning/10 text-warning"><AlertCircle className="size-4" /></span>
              <div>
                <p className="text-sm font-medium">Kaydedilmemiş değişiklikler var</p>
                <p className="text-xs text-muted-foreground">
                  {tab === "sirket"
                    ? "Kurumsal profil henüz tüm kullanıcılara yansıtılmadı."
                    : tab === "menu"
                      ? "Menü seçimi henüz tüm kullanıcılara uygulanmadı."
                      : "Bu cihazdaki tercihlerinizi kaydetmeyi unutmayın."}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center justify-end gap-2">
              <Button variant="outline" size="sm" onClick={resetPendingChanges} disabled={pendingSaveBusy} className="gap-1.5"><RotateCcw className="size-3.5" /> Geri Al</Button>
              <Button size="sm" onClick={savePendingChanges} disabled={pendingSaveBusy} className="gap-1.5"><Save className="size-3.5" /> {pendingSaveBusy ? "Kaydediliyor" : "Değişiklikleri Kaydet"}</Button>
            </div>
          </div>
        </div>
      )}

      {prefsSaved && !hasPendingChanges && (
        <div className="pointer-events-none fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-success/25 bg-card/95 px-4 py-2 text-sm shadow-xl backdrop-blur surface-enter">
          <CheckCircle2 className="size-4 text-success" /> Tercihler kaydedildi
        </div>
      )}
    </div>
  );
}
