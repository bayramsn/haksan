import { useEffect, useMemo, useState } from "react";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Badge } from "../../ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../ui/tabs";
import { Bell, Briefcase, Building2, Clock, Database, FileCheck2, Globe, Layers, Pencil, Plus, Save, Search, Settings2, SlidersHorizontal, Trash2, Wrench } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../../../lib/auth";
import { adminService } from "../../../../lib/services";
import { ProductSpecTemplatesCard } from "./ProductSpecTemplatesCard";
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

type LookupRow = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  province?: string | null;
};

type LookupForm = {
  code: string;
  name: string;
  description: string;
  province: string;
  sortOrder: string;
  isActive: boolean;
};

const lookupLabels: Record<string, string> = {
  "company-sectors": "Sektörler",
  "contact-sources": "Firma İrtibat Şekli",
  "company-groups": "Firma Grupları",
  "company-statuses": "Firma Durumları",
  "company-relation-types": "Firma İlişki Türleri",
  "decision-roles": "Karar Rolleri",
  "activity-types": "Aktivite Türleri",
  "pipeline-stages": "Satış Aşamaları",
  "opportunity-statuses": "Satış Kartı Durumları",
  "quote-statuses": "Teklif Durumları",
  "proforma-statuses": "Proforma Durumları",
  "contract-statuses": "Sözleşme Durumları",
  "product-types": "Ürün Tipleri",
  "product-groups": "Ürün Grupları",
  "product-categories": "Ürün Kategorileri",
  "product-subcategories": "Ürün Alt Kategorileri",
  "product-spec-groups": "Teknik Bilgi Grupları",
  "equipment-types": "Donanım Tipleri",
  "units": "Birimler",
  "inventory-statuses": "Stok Durumları",
  "stock-location-statuses": "Stok Lokasyon Durumları",
  "warranty-statuses": "Garanti Durumları",
  "service-ticket-statuses": "Servis Talebi Durumları",
  "installation-statuses": "Kurulum Durumları",
  "shipment-statuses": "Sevkiyat Durumları",
  "payment-statuses": "Ödeme Durumları",
  "invoice-statuses": "Fatura Durumları",
  "currencies": "Para Birimleri",
  "file-document-types": "Doküman Türleri",
  "storage-providers": "Depolama Sağlayıcıları",
  "tax-offices": "Vergi Daireleri",
};

const LOOKUP_MENU_GROUPS: Array<{ label: string; names: string[] }> = [
  {
    label: "Firma",
    names: ["company-sectors", "company-groups", "company-statuses", "company-relation-types", "contact-sources", "decision-roles", "tax-offices"],
  },
  {
    label: "Satış",
    names: ["pipeline-stages", "opportunity-statuses", "activity-types", "quote-statuses", "proforma-statuses", "contract-statuses"],
  },
  {
    label: "Ürün",
    names: ["product-categories", "product-subcategories", "product-types", "product-groups", "product-spec-groups", "equipment-types", "units"],
  },
  {
    label: "Stok & Servis",
    names: ["inventory-statuses", "stock-location-statuses", "warranty-statuses", "service-ticket-statuses", "installation-statuses", "shipment-statuses"],
  },
  {
    label: "Finans",
    names: ["payment-statuses", "invoice-statuses", "currencies"],
  },
  {
    label: "Genel",
    names: ["file-document-types", "storage-providers"],
  },
];

const emptyLookupForm: LookupForm = { code: "", name: "", description: "", province: "", sortOrder: "0", isActive: true };

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
  const [lookupNames, setLookupNames] = useState<string[]>([]);
  const [selectedLookup, setSelectedLookup] = useState("company-sectors");
  const [lookupRows, setLookupRows] = useState<LookupRow[]>([]);
  const [lookupForm, setLookupForm] = useState<LookupForm>(emptyLookupForm);
  const [editingLookupId, setEditingLookupId] = useState<string | null>(null);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupSearch, setLookupSearch] = useState("");
  const [tab, setTab] = useState("genel");

  const lookupMenuGroups = useMemo(() => {
    const names = new Set(lookupNames.length ? lookupNames : Object.keys(lookupLabels));
    const grouped = new Set(LOOKUP_MENU_GROUPS.flatMap((group) => group.names));
    const rest = [...names]
      .filter((name) => !grouped.has(name))
      .sort((a, b) => (lookupLabels[a] ?? a).localeCompare(lookupLabels[b] ?? b, "tr-TR"));
    const groups = LOOKUP_MENU_GROUPS.map((group) => ({
      label: group.label,
      names: group.names.filter((name) => names.has(name)),
    }));
    if (rest.length) groups.push({ label: "Diğer", names: rest });
    const query = lookupSearch.trim().toLocaleLowerCase("tr-TR");
    return groups
      .map((group) => ({
        label: group.label,
        names: query ? group.names.filter((name) => (lookupLabels[name] ?? name).toLocaleLowerCase("tr-TR").includes(query)) : group.names,
      }))
      .filter((group) => group.names.length > 0);
  }, [lookupNames, lookupSearch]);

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

  const loadLookupRows = async (name = selectedLookup) => {
    if (!canManageLookups) return;
    setLookupBusy(true);
    try {
      setLookupRows(await adminService.lookupRows(name));
    } catch (err: any) {
      toast.error("Lookup kayıtları yüklenemedi", { description: err?.message ?? "API isteği başarısız oldu." });
    } finally {
      setLookupBusy(false);
    }
  };

  useEffect(() => {
    if (!canManageLookups) return;
    let cancelled = false;
    adminService
      .lookups()
      .then((res) => {
        if (cancelled) return;
        setLookupNames(res.available ?? []);
        if (res.available?.length && !res.available.includes(selectedLookup)) setSelectedLookup(res.available[0]);
      })
      .catch(() => setLookupNames(Object.keys(lookupLabels)));
    return () => {
      cancelled = true;
    };
  }, [canManageLookups]);

  useEffect(() => {
    void loadLookupRows(selectedLookup);
    setLookupForm(emptyLookupForm);
    setEditingLookupId(null);
  }, [selectedLookup, canManageLookups]);

  const submitLookup = async () => {
    if (!lookupForm.name.trim()) return toast.error("Ad alanı zorunludur");
    if (selectedLookup === "tax-offices" && !lookupForm.province.trim()) return toast.error("Vergi dairesi için il zorunludur");
    const body = {
      code: lookupForm.code || undefined,
      name: lookupForm.name,
      description: lookupForm.description || undefined,
      province: selectedLookup === "tax-offices" ? lookupForm.province : undefined,
      sortOrder: Number(lookupForm.sortOrder || 0),
      isActive: lookupForm.isActive,
    };
    setLookupBusy(true);
    try {
      if (editingLookupId) await adminService.updateLookup(selectedLookup, editingLookupId, body);
      else await adminService.createLookup(selectedLookup, body);
      toast.success(editingLookupId ? "Lookup güncellendi" : "Lookup eklendi");
      setLookupForm(emptyLookupForm);
      setEditingLookupId(null);
      await loadLookupRows(selectedLookup);
    } catch (err: any) {
      toast.error("Lookup kaydedilemedi", { description: err?.message ?? "API isteği başarısız oldu." });
    } finally {
      setLookupBusy(false);
    }
  };

  const editLookup = (row: LookupRow) => {
    setEditingLookupId(row.id);
    setLookupForm({
      code: row.code ?? "",
      name: row.name ?? "",
      description: row.description ?? "",
      province: row.province ?? "",
      sortOrder: String(row.sortOrder ?? 0),
      isActive: row.isActive !== false,
    });
  };

  const deleteLookup = async (row: LookupRow) => {
    if (!window.confirm(`${row.name} kaydı silinsin mi? Kullanılıyorsa pasifleştirilecek.`)) return;
    setLookupBusy(true);
    try {
      const result = await adminService.deleteLookup(selectedLookup, row.id);
      toast.success(result?.deactivated ? "Lookup pasifleştirildi" : "Lookup silindi");
      await loadLookupRows(selectedLookup);
    } catch (err: any) {
      toast.error("Lookup silinemedi", { description: err?.message ?? "API isteği başarısız oldu." });
    } finally {
      setLookupBusy(false);
    }
  };

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
            <SettingsSection
              icon={<SlidersHorizontal />}
              tone="primary"
              title="CRM Alan Ayarları"
              description="Açılır listelerin (sektör, durum, tip vb.) değerlerini yönetin."
            >
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={lookupSearch}
                      onChange={(e) => setLookupSearch(e.target.value)}
                      placeholder="Alan ayarında ara…"
                      className="pl-9"
                    />
                  </div>
                  <div className="overflow-hidden rounded-lg border border-border/60">
                    {lookupMenuGroups.map((group) => (
                      <div key={group.label} className="border-b border-border/60 last:border-b-0">
                        <div className="bg-muted/50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-foreground/70">
                          {group.label}
                        </div>
                        {group.names.map((name) => (
                          <button
                            key={name}
                            type="button"
                            onClick={() => setSelectedLookup(name)}
                            className={`block w-full border-t border-l-2 border-border/60 px-3 py-2 text-left text-sm transition-colors ${selectedLookup === name ? "border-l-primary bg-primary/10 font-medium text-primary" : "border-l-transparent hover:bg-muted/50"}`}
                          >
                            {lookupLabels[name] ?? name}
                          </button>
                        ))}
                      </div>
                    ))}
                    {!lookupMenuGroups.length && (
                      <div className="px-3 py-6 text-center text-xs text-muted-foreground">Eşleşen alan yok.</div>
                    )}
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-2 rounded-lg border border-border/60 p-3 md:grid-cols-6">
                    <SettingsField label="Kod" value={lookupForm.code} onChange={(v) => setLookupForm({ ...lookupForm, code: v })} />
                    <div className="md:col-span-2">
                      <SettingsField label="Ad" value={lookupForm.name} onChange={(v) => setLookupForm({ ...lookupForm, name: v })} />
                    </div>
                    {selectedLookup === "tax-offices" && (
                      <SettingsField label="İl" value={lookupForm.province} onChange={(v) => setLookupForm({ ...lookupForm, province: v })} />
                    )}
                    <SettingsField label="Sıra" value={lookupForm.sortOrder} onChange={(v) => setLookupForm({ ...lookupForm, sortOrder: v })} />
                    <label className="flex items-end gap-2 pb-2 text-sm">
                      <input
                        type="checkbox"
                        checked={lookupForm.isActive}
                        onChange={(e) => setLookupForm({ ...lookupForm, isActive: e.target.checked })}
                      />
                      Aktif
                    </label>
                    <div className="md:col-span-6">
                      <SettingsField label="Açıklama" value={lookupForm.description} onChange={(v) => setLookupForm({ ...lookupForm, description: v })} />
                    </div>
                    <div className="flex justify-end gap-2 md:col-span-6">
                      {editingLookupId && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setEditingLookupId(null);
                            setLookupForm(emptyLookupForm);
                          }}
                        >
                          Temizle
                        </Button>
                      )}
                      <Button type="button" onClick={submitLookup} disabled={lookupBusy} className="gap-1">
                        <Plus className="size-4" /> {editingLookupId ? "Güncelle" : "Ekle"}
                      </Button>
                    </div>
                  </div>
                  <div className="overflow-hidden rounded-lg border border-border/60 bg-card">
                    <div className="grid grid-cols-[56px_minmax(0,1fr)]">
                      <div className="flex items-center justify-center border-r border-border/60 bg-muted/50 px-1 py-2">
                        <div className="rotate-180 text-center text-[10px] font-semibold uppercase tracking-[0.16em] text-foreground/80 [writing-mode:vertical-rl]">
                          {lookupLabels[selectedLookup] ?? selectedLookup}
                        </div>
                      </div>
                      <div className="min-w-0 overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-muted/20 text-left text-[11px] uppercase text-muted-foreground">
                            <tr>
                              <th className="px-3 py-2">Kod</th>
                              <th className="px-3 py-2">Ad</th>
                              <th className="px-3 py-2">Açıklama</th>
                              {selectedLookup === "tax-offices" && <th className="px-3 py-2">İl</th>}
                              <th className="px-3 py-2">Sıra</th>
                              <th className="px-3 py-2">Durum</th>
                              <th className="px-3 py-2 text-right">İşlem</th>
                            </tr>
                          </thead>
                          <tbody>
                            {lookupRows.map((row) => (
                              <tr key={row.id} className="border-t border-dotted border-foreground/30">
                                <td className="px-3 py-2 font-mono text-xs">{row.code}</td>
                                <td className="px-3 py-2 font-medium">{row.name}</td>
                                <td className="max-w-[220px] truncate px-3 py-2 text-xs text-muted-foreground" title={row.description ?? undefined}>{row.description || "-"}</td>
                                {selectedLookup === "tax-offices" && <td className="px-3 py-2">{row.province || "-"}</td>}
                                <td className="px-3 py-2 tabular-nums">{row.sortOrder ?? 0}</td>
                                <td className="px-3 py-2">
                                  {row.isActive === false ? (
                                    <Badge variant="outline" className="text-muted-foreground">Pasif</Badge>
                                  ) : (
                                    <Badge variant="outline" className="border-success/40 bg-success-soft text-success">Aktif</Badge>
                                  )}
                                </td>
                                <td className="px-3 py-2">
                                  <div className="flex justify-end gap-1">
                                    <Button type="button" variant="ghost" size="icon" className="size-8" onClick={() => editLookup(row)}>
                                      <Pencil className="size-4" />
                                    </Button>
                                    <Button type="button" variant="ghost" size="icon" className="size-8 text-destructive" onClick={() => deleteLookup(row)}>
                                      <Trash2 className="size-4" />
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                            {!lookupRows.length && (
                              <tr>
                                <td className="px-3 py-6 text-center text-muted-foreground" colSpan={selectedLookup === "tax-offices" ? 7 : 6}>
                                  Kayıt yok.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </SettingsSection>
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
