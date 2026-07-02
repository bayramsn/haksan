import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Switch } from "../../ui/switch";
import { Pencil, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../../../lib/auth";
import { adminService } from "../../../../lib/services";

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

type SpecTemplateRow = {
  id: string;
  productTypeCode: string;
  specKey: string;
  defaultValue?: string | null;
  specUnit?: string | null;
  sortOrder?: number;
  isActive?: boolean;
};

const lookupLabels: Record<string, string> = {
  "company-sectors": "Sektörler",
  "contact-sources": "Firma İrtibat Şekli",
  "company-groups": "Firma Grupları",
  "company-statuses": "Firma Durumları",
  "activity-types": "Aktivite Türleri",
  "product-types": "Ürün Tipleri",
  "product-groups": "Ürün Grupları",
  "product-categories": "Ürün Kategorileri",
  "product-subcategories": "Ürün Alt Kategorileri",
  "product-spec-groups": "Teknik Bilgi Grupları",
  "equipment-types": "Donanım Tipleri",
  "inventory-statuses": "Stok Durumları",
  "tax-offices": "Vergi Daireleri",
};

const emptyLookupForm: LookupForm = { code: "", name: "", description: "", province: "", sortOrder: "0", isActive: true };
const emptySpecForm = { productTypeCode: "", specKey: "", defaultValue: "", specUnit: "", sortOrder: "0", isActive: true };

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
  const [specRows, setSpecRows] = useState<SpecTemplateRow[]>([]);
  const [specForm, setSpecForm] = useState(emptySpecForm);
  const [editingSpecId, setEditingSpecId] = useState<string | null>(null);
  const [specBusy, setSpecBusy] = useState(false);

  const orderedLookupNames = useMemo(() => {
    const rows = lookupNames.length ? lookupNames : Object.keys(lookupLabels);
    return [...rows].sort((a, b) => (lookupLabels[a] ?? a).localeCompare(lookupLabels[b] ?? b, "tr-TR"));
  }, [lookupNames]);

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

  const loadSpecTemplates = async () => {
    if (!canManageLookups) return;
    setSpecBusy(true);
    try {
      setSpecRows(await adminService.productSpecTemplates());
    } catch (err: any) {
      toast.error("Teknik bilgi şablonları yüklenemedi", { description: err?.message ?? "API isteği başarısız oldu." });
    } finally {
      setSpecBusy(false);
    }
  };

  useEffect(() => {
    void loadSpecTemplates();
  }, [canManageLookups]);

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

  const submitSpecTemplate = async () => {
    if (!specForm.productTypeCode.trim() || !specForm.specKey.trim()) return toast.error("Ürün tipi ve teknik alan zorunludur");
    const body = {
      productTypeCode: specForm.productTypeCode.trim(),
      specKey: specForm.specKey.trim(),
      defaultValue: specForm.defaultValue || undefined,
      specUnit: specForm.specUnit || undefined,
      sortOrder: Number(specForm.sortOrder || 0),
      isActive: specForm.isActive,
    };
    setSpecBusy(true);
    try {
      if (editingSpecId) await adminService.updateProductSpecTemplate(editingSpecId, body);
      else await adminService.createProductSpecTemplate(body);
      toast.success(editingSpecId ? "Teknik alan güncellendi" : "Teknik alan eklendi");
      setSpecForm(emptySpecForm);
      setEditingSpecId(null);
      await loadSpecTemplates();
    } catch (err: any) {
      toast.error("Teknik alan kaydedilemedi", { description: err?.message ?? "API isteği başarısız oldu." });
    } finally {
      setSpecBusy(false);
    }
  };

  const editSpecTemplate = (row: SpecTemplateRow) => {
    setEditingSpecId(row.id);
    setSpecForm({
      productTypeCode: row.productTypeCode,
      specKey: row.specKey,
      defaultValue: row.defaultValue ?? "",
      specUnit: row.specUnit ?? "",
      sortOrder: String(row.sortOrder ?? 0),
      isActive: row.isActive !== false,
    });
  };

  const deleteSpecTemplate = async (row: SpecTemplateRow) => {
    if (!window.confirm(`${row.specKey} teknik alanı pasifleştirilsin mi?`)) return;
    setSpecBusy(true);
    try {
      await adminService.deleteProductSpecTemplate(row.id);
      toast.success("Teknik alan pasifleştirildi");
      await loadSpecTemplates();
    } catch (err: any) {
      toast.error("Teknik alan pasifleştirilemedi", { description: err?.message ?? "API isteği başarısız oldu." });
    } finally {
      setSpecBusy(false);
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

  return (
    <div className="space-y-4 max-w-6xl">
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
        Kurumsal şirket bilgileri tenant kaydından yönetilir ve tüm kullanıcılarda ortaktır. Bildirim ve görünüm tercihleri kullanıcı bazında bu cihazda saklanır.
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-border/60 shadow-sm overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Şirket Bilgileri</CardTitle>
            {canEditTenant && (
              <Button size="sm" onClick={saveCompany} disabled={companyLoading || companySaving} className="gap-1">
                <Save className="size-4" /> {companySaving ? "Kaydediliyor" : "Kaydet"}
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {!canReadTenant ? (
              <p className="text-sm text-muted-foreground">Şirket bilgilerini görüntüleme yetkiniz yok.</p>
            ) : companyLoading ? (
              <p className="text-sm text-muted-foreground">Yükleniyor…</p>
            ) : (
              <>
                <SettingsField label="Şirket Adı" value={company.companyName} disabled={!canEditTenant} onChange={(v) => setCompany({ ...company, companyName: v })} />
                <SettingsField label="VKN" value={company.taxId} disabled={!canEditTenant} onChange={(v) => setCompany({ ...company, taxId: v })} />
                <SettingsField label="E-posta" value={company.email} disabled={!canEditTenant} onChange={(v) => setCompany({ ...company, email: v })} />
                <SettingsField label="Telefon" value={company.phone} disabled={!canEditTenant} onChange={(v) => setCompany({ ...company, phone: v })} />
                {!canEditTenant && <p className="text-xs text-muted-foreground">Düzenleme için yönetici yetkisi gerekir.</p>}
              </>
            )}
          </CardContent>
        </Card>
        <Card className="border-border/60 shadow-sm overflow-hidden">
          <CardHeader><CardTitle>Bildirimler</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <SettingsToggle label="Yeni satış kartı oluşturulduğunda" checked={prefs.notifyNewCase} onChange={(v) => setPrefs({ ...prefs, notifyNewCase: v })} />
            <SettingsToggle label="Teklif onaylandığında" checked={prefs.notifyQuoteApproved} onChange={(v) => setPrefs({ ...prefs, notifyQuoteApproved: v })} />
            <SettingsToggle label="Ödeme gecikmesinde" checked={prefs.notifyPaymentOverdue} onChange={(v) => setPrefs({ ...prefs, notifyPaymentOverdue: v })} />
            <SettingsToggle label="Yeni servis talebinde" checked={prefs.notifyService} onChange={(v) => setPrefs({ ...prefs, notifyService: v })} />
          </CardContent>
        </Card>
        <Card className="border-border/60 shadow-sm overflow-hidden">
          <CardHeader><CardTitle>Para Birimi & Bölge</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <SettingsField label="Varsayılan Para Birimi" value={prefs.currency} onChange={(v) => setPrefs({ ...prefs, currency: v })} />
            <SettingsField label="Saat Dilimi" value={prefs.timezone} onChange={(v) => setPrefs({ ...prefs, timezone: v })} />
          </CardContent>
        </Card>
        <Card className="border-border/60 shadow-sm overflow-hidden">
          <CardHeader><CardTitle>Depolama</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Dosya yüklemeleri S3 uyumlu depolamada tutulur. Bucket ve sağlayıcı yapılandırması sunucu tarafından yönetilir.</p>
          </CardContent>
        </Card>
      </div>
      <Button onClick={savePrefs} className="gap-1">
        <Save className="size-4" /> {prefsSaved ? "Tercihler Kaydedildi" : "Tercihleri Kaydet"}
      </Button>
      {canManageLookups && (
        <>
          <Card className="border-border/60 shadow-sm overflow-hidden">
            <CardHeader>
              <CardTitle>CRM Alan Ayarları</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4">
                <div className="rounded-lg border border-border/60 overflow-hidden">
                  {orderedLookupNames.map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setSelectedLookup(name)}
                      className={`block w-full px-3 py-2 text-left text-sm border-b border-border/60 last:border-b-0 ${selectedLookup === name ? "bg-primary/10 text-primary" : "hover:bg-muted/50"}`}
                    >
                      {lookupLabels[name] ?? name}
                    </button>
                  ))}
                </div>
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-6 gap-2 rounded-lg border border-border/60 p-3">
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
                    <div className="md:col-span-6 flex justify-end gap-2">
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
                  <div className="overflow-x-auto rounded-lg border border-border/60">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2">Kod</th>
                          <th className="px-3 py-2">Ad</th>
                          {selectedLookup === "tax-offices" && <th className="px-3 py-2">İl</th>}
                          <th className="px-3 py-2">Sıra</th>
                          <th className="px-3 py-2">Durum</th>
                          <th className="px-3 py-2 text-right">İşlem</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lookupRows.map((row) => (
                          <tr key={row.id} className="border-t border-border/60">
                            <td className="px-3 py-2 font-mono text-xs">{row.code}</td>
                            <td className="px-3 py-2">{row.name}</td>
                            {selectedLookup === "tax-offices" && <td className="px-3 py-2">{row.province || "-"}</td>}
                            <td className="px-3 py-2">{row.sortOrder ?? 0}</td>
                            <td className="px-3 py-2">{row.isActive === false ? "Pasif" : "Aktif"}</td>
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
                            <td className="px-3 py-6 text-center text-muted-foreground" colSpan={selectedLookup === "tax-offices" ? 6 : 5}>
                              Kayıt yok.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60 shadow-sm overflow-hidden">
            <CardHeader>
              <CardTitle>Ürün Teknik Bilgi Şablonları</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-6 gap-2 rounded-lg border border-border/60 p-3">
                <SettingsField label="Ürün Tipi Kodu" value={specForm.productTypeCode} onChange={(v) => setSpecForm({ ...specForm, productTypeCode: v })} />
                <div className="md:col-span-2">
                  <SettingsField label="Alan Etiketi" value={specForm.specKey} onChange={(v) => setSpecForm({ ...specForm, specKey: v })} />
                </div>
                <SettingsField label="Varsayılan" value={specForm.defaultValue} onChange={(v) => setSpecForm({ ...specForm, defaultValue: v })} />
                <SettingsField label="Birim" value={specForm.specUnit} onChange={(v) => setSpecForm({ ...specForm, specUnit: v })} />
                <SettingsField label="Sıra" value={specForm.sortOrder} onChange={(v) => setSpecForm({ ...specForm, sortOrder: v })} />
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={specForm.isActive}
                    onChange={(e) => setSpecForm({ ...specForm, isActive: e.target.checked })}
                  />
                  Aktif
                </label>
                <div className="md:col-span-5 flex justify-end gap-2">
                  {editingSpecId && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setEditingSpecId(null);
                        setSpecForm(emptySpecForm);
                      }}
                    >
                      Temizle
                    </Button>
                  )}
                  <Button type="button" onClick={submitSpecTemplate} disabled={specBusy} className="gap-1">
                    <Plus className="size-4" /> {editingSpecId ? "Güncelle" : "Ekle"}
                  </Button>
                </div>
              </div>
              <div className="overflow-x-auto rounded-lg border border-border/60">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Ürün Tipi</th>
                      <th className="px-3 py-2">Alan</th>
                      <th className="px-3 py-2">Varsayılan</th>
                      <th className="px-3 py-2">Birim</th>
                      <th className="px-3 py-2">Sıra</th>
                      <th className="px-3 py-2">Durum</th>
                      <th className="px-3 py-2 text-right">İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {specRows.map((row) => (
                      <tr key={row.id} className="border-t border-border/60">
                        <td className="px-3 py-2 font-mono text-xs">{row.productTypeCode}</td>
                        <td className="px-3 py-2">{row.specKey}</td>
                        <td className="px-3 py-2">{row.defaultValue || "-"}</td>
                        <td className="px-3 py-2">{row.specUnit || "-"}</td>
                        <td className="px-3 py-2">{row.sortOrder ?? 0}</td>
                        <td className="px-3 py-2">{row.isActive === false ? "Pasif" : "Aktif"}</td>
                        <td className="px-3 py-2">
                          <div className="flex justify-end gap-1">
                            <Button type="button" variant="ghost" size="icon" className="size-8" onClick={() => editSpecTemplate(row)}>
                              <Pencil className="size-4" />
                            </Button>
                            <Button type="button" variant="ghost" size="icon" className="size-8 text-destructive" onClick={() => deleteSpecTemplate(row)}>
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!specRows.length && (
                      <tr>
                        <td className="px-3 py-6 text-center text-muted-foreground" colSpan={7}>Kayıt yok.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function SettingsField({ label, value, onChange, disabled }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="mt-1" />
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
