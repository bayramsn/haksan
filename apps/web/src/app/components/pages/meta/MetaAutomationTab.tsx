import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, AlertTriangle, ArrowRight, Plus, RefreshCw, Send, Settings2 } from "lucide-react";
import { toast } from "sonner";
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
import { Button } from "../../ui/button";
import { Checkbox } from "../../ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../ui/dialog";
import { Input } from "../../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { Switch } from "../../ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import {
  getMetaErrorMessage,
  metaQueryKeys,
  metaService,
  type MetaFormMapping,
} from "../../../../lib/meta-service";
import {
  formatMetaDate,
  formatMetaMoney,
  MetaEmpty,
  MetaErrorState,
  MetaPagination,
  MetaSectionHeader,
  MetaStatusBadge,
  MetaSurface,
  MetaTableSkeleton,
} from "./meta-shared";

const PAGE_SIZE = 20;

export function MetaAutomationTab({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const [eventPage, setEventPage] = useState(1);
  const [mappingOpen, setMappingOpen] = useState(false);
  const [eventOpen, setEventOpen] = useState(false);
  const [processConfirm, setProcessConfirm] = useState(false);
  const [mappingDraft, setMappingDraft] = useState({ connectionId: "", formId: "", formName: "" });
  const [eventConfirmed, setEventConfirmed] = useState(false);
  const [eventDraft, setEventDraft] = useState({ connectionId: "", opportunityId: "", eventName: "QualifiedLead", value: "", currency: "TRY" });

  const connectionsQuery = useQuery({ queryKey: metaQueryKeys.connections, queryFn: metaService.connections, staleTime: 60_000 });
  const mappingsQuery = useQuery({ queryKey: metaQueryKeys.mappings, queryFn: metaService.formMappings, staleTime: 30_000 });
  const eventParams = { page: eventPage, pageSize: PAGE_SIZE };
  const eventsQuery = useQuery({ queryKey: metaQueryKeys.conversions(eventParams), queryFn: () => metaService.conversionEvents(eventParams), staleTime: 20_000 });

  const mappingMutation = useMutation({
    mutationFn: metaService.createFormMapping,
    onSuccess: async () => {
      toast.success("Form eşlemesi oluşturuldu");
      setMappingOpen(false);
      setMappingDraft({ connectionId: "", formId: "", formName: "" });
      await queryClient.invalidateQueries({ queryKey: metaQueryKeys.mappings });
    },
    onError: (error) => toast.error("Form eşlemesi oluşturulamadı", { description: getMetaErrorMessage(error) }),
  });
  const mappingToggleMutation = useMutation({
    mutationFn: ({ mapping, isActive }: { mapping: MetaFormMapping; isActive: boolean }) => metaService.updateFormMapping(mapping.id, { isActive }),
    onSuccess: async () => {
      toast.success("Otomasyon durumu güncellendi");
      await queryClient.invalidateQueries({ queryKey: metaQueryKeys.mappings });
    },
    onError: (error) => toast.error("Otomasyon güncellenemedi", { description: getMetaErrorMessage(error) }),
  });
  const eventMutation = useMutation({
    mutationFn: metaService.createConversionEvent,
    onSuccess: async () => {
      toast.success("Dönüşüm olayı kuyruğa alındı");
      setEventOpen(false);
      setEventConfirmed(false);
      setEventDraft({ connectionId: "", opportunityId: "", eventName: "QualifiedLead", value: "", currency: "TRY" });
      await queryClient.invalidateQueries({ queryKey: ["meta", "conversion-events"] });
    },
    onError: (error) => toast.error("Dönüşüm olayı oluşturulamadı", { description: getMetaErrorMessage(error) }),
  });
  const processMutation = useMutation({
    mutationFn: metaService.processJobs,
    onSuccess: async (result) => {
      toast.success("Meta işleri işlendi", { description: `${result.processed} işlendi, ${result.failed} başarısız.` });
      setProcessConfirm(false);
      await queryClient.invalidateQueries({ queryKey: metaQueryKeys.root });
    },
    onError: (error) => toast.error("Meta işleri işlenemedi", { description: getMetaErrorMessage(error) }),
  });

  const createMapping = () => {
    if (!mappingDraft.connectionId || !mappingDraft.formId.trim() || !mappingDraft.formName.trim()) {
      toast.error("Bağlantı, form kimliği ve form adı zorunludur");
      return;
    }
    mappingMutation.mutate({
      connectionId: mappingDraft.connectionId,
      formId: mappingDraft.formId.trim(),
      formName: mappingDraft.formName.trim(),
      isActive: true,
      fieldMappings: { full_name: "contactName", company_name: "companyTitle", email: "email", phone_number: "phone", city: "city" },
    });
  };

  const createEvent = () => {
    const value = eventDraft.value.trim() ? Number(eventDraft.value.replace(",", ".")) : undefined;
    if (!eventDraft.connectionId || !eventDraft.opportunityId.trim() || !eventConfirmed || (value !== undefined && (!Number.isFinite(value) || value < 0))) {
      toast.error("Fırsat kimliği, onay ve tutar alanlarını kontrol edin");
      return;
    }
    eventMutation.mutate({
      connectionId: eventDraft.connectionId,
      opportunityId: eventDraft.opportunityId.trim(),
      eventName: eventDraft.eventName,
      occurredAt: new Date().toISOString(),
      value,
      currency: value === undefined ? undefined : eventDraft.currency,
      eventId: `crm-${eventDraft.opportunityId.trim()}-${eventDraft.eventName}-${Date.now()}`,
    });
  };

  return (
    <div className="space-y-4">
      <MetaSurface>
        <MetaSectionHeader
          title="Lead form otomasyonları"
          description="Meta form alanlarını CRM alanlarına eşleyin ve kaynak bazlı atama akışını etkinleştirin."
          actions={<Button type="button" size="sm" disabled={!canManage} onClick={() => setMappingOpen(true)}><Plus className="size-3.5" /> Form eşle</Button>}
        />
        {mappingsQuery.isLoading ? (
          <MetaTableSkeleton columns={5} rows={4} />
        ) : mappingsQuery.isError ? (
          <MetaErrorState error={getMetaErrorMessage(mappingsQuery.error)} onRetry={() => void mappingsQuery.refetch()} />
        ) : (mappingsQuery.data?.length ?? 0) === 0 ? (
          <MetaEmpty title="Form eşlemesi yok" description="Bir Meta lead formunu CRM alanları ve kaynak koduyla eşleyerek otomasyonu başlatın." />
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-[760px]">
              <TableHeader><TableRow><TableHead>Form</TableHead><TableHead>Kaynak</TableHead><TableHead>Alan eşlemesi</TableHead><TableHead>Son lead</TableHead><TableHead className="text-right">Aktif</TableHead></TableRow></TableHeader>
              <TableBody>
                {mappingsQuery.data?.map((mapping) => (
                  <TableRow key={mapping.id}>
                    <TableCell><p className="text-sm font-semibold">{mapping.formName}</p><p className="mt-0.5 font-data text-[10px] text-muted-foreground">{mapping.formId}</p></TableCell>
                    <TableCell className="text-xs">meta_lead_ads</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
                        {Object.entries(mapping.fieldMappings).slice(0, 4).map(([from, to]) => <span key={from} className="rounded-md border border-border bg-muted px-1.5 py-1">{from} <ArrowRight className="inline size-2.5" /> {to}</span>)}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatMetaDate(mapping.lastLeadAt)}</TableCell>
                    <TableCell className="text-right"><Switch checked={mapping.isActive} disabled={!canManage || mappingToggleMutation.isPending} onCheckedChange={(checked) => mappingToggleMutation.mutate({ mapping, isActive: checked })} aria-label={`${mapping.formName} otomasyonunu ${mapping.isActive ? "durdur" : "etkinleştir"}`} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </MetaSurface>

      <MetaSurface>
        <MetaSectionHeader
          title="Conversions API olayları"
          description="CRM nitelik ve satış sinyallerini sunucu tarafında eşleyip Meta'ya güvenli biçimde iletin."
          actions={
            <>
              <Button type="button" variant="outline" size="sm" disabled={!canManage} onClick={() => setProcessConfirm(true)}><RefreshCw className="size-3.5" /> Kuyruğu işle</Button>
              <Button type="button" size="sm" disabled={!canManage} onClick={() => setEventOpen(true)}><Send className="size-3.5" /> Olay gönder</Button>
            </>
          }
        />
        {eventsQuery.isLoading ? (
          <MetaTableSkeleton columns={6} />
        ) : eventsQuery.isError ? (
          <MetaErrorState error={getMetaErrorMessage(eventsQuery.error)} onRetry={() => void eventsQuery.refetch()} />
        ) : !eventsQuery.data || eventsQuery.data.items.length === 0 ? (
          <MetaEmpty title="Dönüşüm olayı yok" description="CRM aşamaları tetiklendiğinde CAPI olayları burada izlenecek." />
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-[860px]">
              <TableHeader><TableRow><TableHead>Olay</TableHead><TableHead>Fırsat</TableHead><TableHead>Durum</TableHead><TableHead>Değer</TableHead><TableHead>Oluşma</TableHead><TableHead>Deneme</TableHead><TableHead>Hata</TableHead></TableRow></TableHeader>
              <TableBody>
                {eventsQuery.data?.items.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell className="text-sm font-semibold">{event.eventName}</TableCell>
                    <TableCell className="font-data text-[11px]">{event.opportunityId}</TableCell>
                    <TableCell><MetaStatusBadge status={event.status} /></TableCell>
                    <TableCell className="font-data text-xs">{event.valueMinor == null ? "-" : formatMetaMoney(event.valueMinor, event.currency ?? "TRY")}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatMetaDate(event.occurredAt)}</TableCell>
                    <TableCell className="text-center font-data text-xs">{event.retryCount ?? 0}</TableCell>
                    <TableCell><p className="max-w-[220px] truncate text-xs text-destructive">{event.lastError ?? "-"}</p></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {eventsQuery.data && <MetaPagination {...eventsQuery.data} onPageChange={setEventPage} />}
      </MetaSurface>

      <Dialog open={mappingOpen} onOpenChange={setMappingOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Lead formunu eşle</DialogTitle><DialogDescription>Varsayılan kişisel bilgi alanları CRM alanlarına sunucuda allowlist ile aktarılır.</DialogDescription></DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2"><label htmlFor="meta-mapping-connection" className="text-sm font-medium">Meta bağlantısı</label><Select value={mappingDraft.connectionId} onValueChange={(value) => setMappingDraft((current) => ({ ...current, connectionId: value }))}><SelectTrigger id="meta-mapping-connection"><SelectValue placeholder="Bağlantı seçin" /></SelectTrigger><SelectContent>{(connectionsQuery.data ?? []).filter((item) => item.status === "active").map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2"><label htmlFor="meta-mapping-form-id" className="text-sm font-medium">Form kimliği</label><Input id="meta-mapping-form-id" value={mappingDraft.formId} onChange={(event) => setMappingDraft((current) => ({ ...current, formId: event.target.value }))} /></div>
            <div className="space-y-2"><label htmlFor="meta-mapping-form-name" className="text-sm font-medium">Form adı</label><Input id="meta-mapping-form-name" value={mappingDraft.formName} onChange={(event) => setMappingDraft((current) => ({ ...current, formName: event.target.value }))} /></div>
            <div className="flex items-start gap-3 rounded-lg border border-primary/15 bg-brand-blue-soft p-3 text-xs text-primary sm:col-span-2"><Settings2 className="mt-0.5 size-4 shrink-0" /> Ad, e-posta, telefon ve şehir alanları varsayılan eşlemeyle kaydedilir. Ham Meta payload'ı istemciye taşınmaz.</div>
          </div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setMappingOpen(false)}>Vazgeç</Button><Button type="button" disabled={mappingMutation.isPending} onClick={createMapping}>Eşlemeyi oluştur</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={eventOpen} onOpenChange={setEventOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>CAPI olayı gönder</DialogTitle><DialogDescription>Seçili CRM fırsatı için dönüşüm sinyalini kuyruğa ekleyin.</DialogDescription></DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2"><label htmlFor="meta-event-connection" className="text-sm font-medium">Meta dataset bağlantısı</label><Select value={eventDraft.connectionId} onValueChange={(value) => setEventDraft((current) => ({ ...current, connectionId: value }))}><SelectTrigger id="meta-event-connection"><SelectValue placeholder="Bağlantı seçin" /></SelectTrigger><SelectContent>{(connectionsQuery.data ?? []).filter((item) => item.status === "active" && item.datasetId).map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2 sm:col-span-2"><label htmlFor="meta-event-opportunity" className="text-sm font-medium">CRM fırsat kimliği</label><Input id="meta-event-opportunity" value={eventDraft.opportunityId} onChange={(event) => setEventDraft((current) => ({ ...current, opportunityId: event.target.value }))} /></div>
            <div className="space-y-2"><label htmlFor="meta-event-name" className="text-sm font-medium">Olay</label><Select value={eventDraft.eventName} onValueChange={(value) => setEventDraft((current) => ({ ...current, eventName: value }))}><SelectTrigger id="meta-event-name"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="QualifiedLead">Nitelikli lead</SelectItem><SelectItem value="Contact">İletişim kuruldu</SelectItem><SelectItem value="Schedule">Randevu</SelectItem><SelectItem value="Purchase">Satış</SelectItem></SelectContent></Select></div>
            <div className="space-y-2"><label htmlFor="meta-event-currency" className="text-sm font-medium">Para birimi</label><Select value={eventDraft.currency} onValueChange={(value) => setEventDraft((current) => ({ ...current, currency: value }))}><SelectTrigger id="meta-event-currency"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="TRY">TRY</SelectItem><SelectItem value="USD">USD</SelectItem><SelectItem value="EUR">EUR</SelectItem></SelectContent></Select></div>
            <div className="space-y-2 sm:col-span-2"><label htmlFor="meta-event-value" className="text-sm font-medium">Dönüşüm değeri (isteğe bağlı)</label><Input id="meta-event-value" inputMode="decimal" value={eventDraft.value} onChange={(event) => setEventDraft((current) => ({ ...current, value: event.target.value }))} /></div>
            <label className="flex items-start gap-3 rounded-lg border border-warning/25 bg-warning-soft p-3 text-xs text-warning sm:col-span-2"><Checkbox checked={eventConfirmed} onCheckedChange={(value) => setEventConfirmed(value === true)} className="mt-0.5" /><span>Bu CRM olayının Meta reklam optimizasyonuna sinyal olarak gönderileceğini onaylıyorum.</span></label>
          </div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setEventOpen(false)}>Vazgeç</Button><Button type="button" disabled={!eventConfirmed || eventMutation.isPending} onClick={createEvent}>Onaylayıp kuyruğa al</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={processConfirm} onOpenChange={setProcessConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Meta iş kuyruğunu işle</AlertDialogTitle><AlertDialogDescription>Bekleyen ve yeniden denenebilir webhook, CAPI ve senkron işlerini şimdi çalıştırır.</AlertDialogDescription></AlertDialogHeader>
          <div className="flex items-start gap-2 rounded-lg border border-warning/25 bg-warning-soft p-3 text-xs text-warning"><AlertTriangle className="mt-0.5 size-4 shrink-0" /> Bu yönetim işlemi dış Meta API istekleri ve kota tüketimi oluşturabilir.</div>
          <AlertDialogFooter><AlertDialogCancel>Vazgeç</AlertDialogCancel><AlertDialogAction disabled={processMutation.isPending} onClick={() => processMutation.mutate()}><Activity className="size-4" /> İşleri çalıştır</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
