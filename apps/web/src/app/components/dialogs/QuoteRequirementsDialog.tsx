import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import type { OpportunityPaymentMethodCode } from "@haksan/shared";
import { useAuth } from "../../../lib/auth";
import { opportunityService } from "../../../lib/services";
import { useCompanyDetail } from "../../lib/companyServerData";
import { useStore } from "../../lib/store";
import { serverScopeKey } from "../../lib/serverPagination";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { RemoteContactCombobox } from "../shared/RemoteContactCombobox";
import { PaymentMethodSelect } from "../shared/PaymentMethodSelect";
import { RequestedMachineCombobox } from "../shared/RequestedMachineCombobox";

// CreateDialogs also imports QuoteDialog. Load these editors only when requested.
const EditCustomerDialog = lazy(() => import("./CreateDialogs").then((module) => ({ default: module.EditCustomerDialog })));
const CreateContactDialog = lazy(() => import("./CreateDialogs").then((module) => ({ default: module.CreateContactDialog })));
const LogActivityDialog = lazy(() => import("./CreateDialogs").then((module) => ({ default: module.LogActivityDialog })));

export type QuoteRequirementBlocker = { key: string; label: string; actionKey: string };
export interface QuoteRequirementsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opportunityId: string | null;
  companyId: string;
  blockers: QuoteRequirementBlocker[];
  onRecheck: () => Promise<void>;
  onOpportunitySelected?: (id: string) => void;
}
const EMPTY_FORM = { ownerUserId: "", title: "", primaryContactId: "", requestedMachine: "", paymentMethod: "undecided" as OpportunityPaymentMethodCode };

export function QuoteRequirementsDialog({ open, onOpenChange, opportunityId, companyId, blockers, onRecheck, onOpportunitySelected }: QuoteRequirementsDialogProps) {
  const { hasPermission, hasRole, user, activeDivision, activeDepartment } = useAuth();
  const { products } = useStore();
  const companyQuery = useCompanyDetail(open ? companyId : null);
  const [editingCompany, setEditingCompany] = useState(false);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const saveLock = useRef(false);
  const [error, setError] = useState("");
  const [storedForm, setForm] = useState(EMPTY_FORM);
  const [formContext, setFormContext] = useState("");
  const canUpdate = hasPermission("opportunities.update");
  const canEditCompany = hasPermission("companies.update");
  const canCreateContact = hasPermission("contacts.create");
  const canCreateActivity = hasPermission("activities.create");
  const canAssignOwner = canUpdate && (hasRole("sales") || hasRole("super_admin"));
  const identity = serverScopeKey(activeDivision, activeDepartment, user?.tenantId, user?.id);
  const context = JSON.stringify([identity, opportunityId, companyId, open]);
  const form = formContext === context ? storedForm : EMPTY_FORM;
  const opportunityQuery = useQuery({
    queryKey: ["quote-requirements", "opportunity", opportunityId, identity],
    queryFn: () => opportunityService.get(opportunityId!),
    enabled: open && Boolean(opportunityId),
    staleTime: 0,
  });
  const opportunitiesQuery = useQuery({
    queryKey: ["quote-requirements", "company-opportunities", companyId, identity],
    queryFn: () => opportunityService.list({ companyId, pageSize: 100, view: "all" }),
    enabled: open && !opportunityId && Boolean(companyId) && hasPermission("opportunities.read"),
    staleTime: 0,
  });
  const assigneesQuery = useQuery({
    queryKey: ["quote-requirements", "assignees", identity],
    queryFn: () => opportunityService.assignees(),
    enabled: open && canAssignOwner,
  });
  useEffect(() => {
    const opportunity = opportunityQuery.data;
    setFormContext(context);
    if (!open || !opportunity) {
      setForm(EMPTY_FORM);
      return;
    }
    setForm({ ownerUserId: opportunity.ownerUserId ?? "", title: opportunity.title ?? "", primaryContactId: opportunity.primaryContactId ?? "", requestedMachine: opportunity.requestedMachine ?? "", paymentMethod: opportunity.paymentMethod ?? "undecided" });
    setError("");
  }, [open, opportunityId, opportunityQuery.data, context]);

  const recheck = async () => {
    setChecking(true);
    setError("");
    try {
      await companyQuery.refetch();
      if (opportunityId) await opportunityQuery.refetch();
      await onRecheck();
    } catch {
      setError("Gereklilikler kontrol edilemedi. Lütfen tekrar deneyin.");
    } finally {
      setChecking(false);
    }
  };
  const saveOpportunity = async () => {
    if (!canUpdate || !opportunityId || saveLock.current || !opportunityQuery.data) return;
    saveLock.current = true;
    setSaving(true);
    setError("");
    try {
      await opportunityService.update(opportunityId, {
        ...(canAssignOwner ? { ownerUserId: form.ownerUserId || null } : {}),
        ...(!opportunityQuery.data.companyId && companyId ? { companyId } : {}),
        title: form.title.trim(),
        primaryContactId: form.primaryContactId || null,
        requestedMachine: form.requestedMachine.trim() || null,
        paymentMethod: form.paymentMethod,
      });
      toast.success("Fırsat bilgileri kaydedildi");
      await recheck();
    } catch {
      setError("Fırsat bilgileri kaydedilemedi. Alanları ve düzenleme yetkinizi kontrol edin.");
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  };
  const unavailable = !canUpdate || saving || opportunityQuery.isPending || opportunityQuery.isError;
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Teklif için eksik bilgileri tamamlayın</DialogTitle>
            <DialogDescription>Gerekli bilgiler tamamlanmadan teklif kaydedilemez. Bilgileri burada tamamlayıp yeniden kontrol edebilirsiniz.</DialogDescription>
          </DialogHeader>
          <ul className="space-y-1 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950" aria-label="Eksik gereklilikler">
            {blockers.map((blocker) => <li key={blocker.key}>• {blocker.label}</li>)}
            {blockers.length === 0 && <li>Eksik bilgi kalmadı. Kontrol edip teklif formuna dönebilirsiniz.</li>}
          </ul>
          {blockers.some((blocker) => blocker.key === "active_opportunity") && <p className="text-sm text-muted-foreground">Kapalı veya kaybedilmiş fırsatı, fırsat kartındaki yetkili geri açma işlemiyle açın.</p>}
          {!opportunityId ? (
            <div className="space-y-2">
              <Label htmlFor="quote-required-opportunity">Firmaya ait fırsatı seçin</Label>
              <select id="quote-required-opportunity" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value="" onChange={(event) => onOpportunitySelected?.(event.target.value)} disabled={!onOpportunitySelected || opportunitiesQuery.isPending}>
                <option value="">Fırsat seçin</option>
                {(opportunitiesQuery.data?.data ?? []).filter((item) => item.companyId === companyId).map((item) => <option key={item.id} value={item.id}>{item.title || "İsimsiz fırsat"}</option>)}
              </select>
              {!hasPermission("opportunities.read") && <p className="text-sm text-muted-foreground">Fırsat seçmek için fırsat görüntüleme yetkisi gereklidir.</p>}
              {opportunitiesQuery.isError && <p role="alert" className="text-sm text-red-700">Fırsatlar yüklenemedi.</p>}
              {opportunitiesQuery.isSuccess && opportunitiesQuery.data.data.length === 0 && <p className="text-sm text-muted-foreground">Bu firmaya ait fırsat bulunamadı. Önce Fırsatlar ekranından bir kayıt oluşturun.</p>}
            </div>
          ) : (
            <div className="space-y-3 rounded-md border p-4">
              <h3 className="font-medium">Fırsat bilgileri</h3>
              {opportunityQuery.isError && <p role="alert" className="text-sm text-red-700">Fırsat bilgileri yüklenemedi. Yeniden kontrol edin.</p>}
              {!canUpdate && <p className="text-sm text-muted-foreground">Bu bilgileri tamamlamak için fırsat düzenleme yetkisi gereklidir.</p>}
              <div className="space-y-1.5">
                <Label htmlFor="quote-required-owner">Sorumlu</Label>
                <select id="quote-required-owner" className="h-10 w-full rounded-md border bg-background px-3 text-sm" disabled={unavailable || !canAssignOwner || assigneesQuery.isPending} value={form.ownerUserId} onChange={(event) => setForm({ ...form, ownerUserId: event.target.value })}>
                  <option value="">Sorumlu seçin</option>
                  {form.ownerUserId && !assigneesQuery.data?.some((item) => item.id === form.ownerUserId) && <option value={form.ownerUserId}>Mevcut sorumlu</option>}
                  {assigneesQuery.data?.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}
                </select>
                {assigneesQuery.isError && <p className="text-sm text-red-700">Sorumlu listesi yüklenemedi.</p>}
                {!canAssignOwner && <p className="text-sm text-muted-foreground">Sorumlu atamak için satış veya süper yönetici rolü gereklidir.</p>}
              </div>
              <div className="space-y-1.5"><Label htmlFor="quote-required-title">Satış konusu / talep başlığı</Label><Input id="quote-required-title" maxLength={255} value={form.title} disabled={unavailable} onChange={(event) => setForm({ ...form, title: event.target.value })} /></div>
              <div className="space-y-1.5">
                <Label>Firma kontağı</Label>
                <RemoteContactCombobox companyId={companyId} value={form.primaryContactId} disabled={unavailable} onValueChange={(primaryContactId) => setForm({ ...form, primaryContactId })} />
                {canCreateContact && canUpdate && <Suspense fallback={<p className="text-sm">Kontak formu yükleniyor…</p>}><CreateContactDialog defaultCustomerId={companyId} draftKey={`draft.quote-requirements.contact.${companyId}`} trigger={<Button type="button" variant="outline" size="sm" disabled={unavailable}>Yeni kontak ekle</Button>} onCreated={(primaryContactId) => setForm((current) => ({ ...current, primaryContactId }))} /></Suspense>}
              </div>
              <div className="space-y-1.5"><Label>İstenen makine</Label><RequestedMachineCombobox products={products} value={form.requestedMachine} disabled={unavailable} onValueChange={(requestedMachine) => setForm({ ...form, requestedMachine })} /></div>
              <PaymentMethodSelect idPrefix="quote-required-payment" value={form.paymentMethod} onChange={(paymentMethod) => setForm({ ...form, paymentMethod })} disabled={unavailable} />
              <Button type="button" disabled={unavailable || !form.title.trim()} onClick={() => void saveOpportunity()}>{saving ? "Kaydediliyor…" : "Fırsat bilgilerini kaydet"}</Button>
            </div>
          )}
          <div className="space-y-2 rounded-md border p-4">
            <h3 className="font-medium">Firma bilgileri</h3>
            <p className="text-sm text-muted-foreground">Şehir, ilçe, adres, e-posta, sektör ve telefon bilgilerini tamamlayın.</p>
            <Button type="button" variant="outline" disabled={!canEditCompany || !companyQuery.data || companyQuery.isFetching} onClick={() => setEditingCompany(true)}>Firma bilgilerini düzenle</Button>
            {!canEditCompany && <p className="text-sm text-muted-foreground">Firma bilgilerini tamamlamak için firma düzenleme yetkisi gereklidir.</p>}
            {companyQuery.isError && <p role="alert" className="text-sm text-red-700">Firma bilgileri yüklenemedi.</p>}
          </div>
          <div className="space-y-2 rounded-md border p-4">
            <h3 className="font-medium">Telefon görüşmesi</h3>
            <p className="text-sm text-muted-foreground">Gerçekleştirilen aramayı fırsata bağlı aktivite olarak kaydedin.</p>
            {canCreateActivity && opportunityId ? <Suspense fallback={<p className="text-sm">Aktivite formu yükleniyor…</p>}><LogActivityDialog customerId={companyId} opportunityId={opportunityId} defaultKind="outgoing_call" trigger={<Button type="button" variant="outline">Arama kaydı ekle</Button>} onLogged={() => void recheck()} /></Suspense> : <p className="text-sm text-muted-foreground">{!canCreateActivity ? "Arama kaydetmek için aktivite oluşturma yetkisi gereklidir." : "Arama kaydetmeden önce fırsat seçin."}</p>}
          </div>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Teklif formuna dön</Button>
            <Button type="button" disabled={checking || saving} onClick={() => void recheck()}>{checking ? "Kontrol ediliyor…" : "Gereklilikleri yeniden kontrol et"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {open && editingCompany && companyQuery.data && <Suspense fallback={<p role="status">Firma formu yükleniyor…</p>}><EditCustomerDialog customer={companyQuery.data} onClose={() => setEditingCompany(false)} onSaved={() => { setEditingCompany(false); void recheck(); }} /></Suspense>}
    </>
  );
}
