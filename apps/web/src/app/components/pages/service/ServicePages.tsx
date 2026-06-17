import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Textarea } from "../../ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../ui/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "../../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "../../ui/avatar";
import { StatusBadge } from "../../Layout";
import { CreateServiceRequestDialog } from "../../dialogs/CreateDialogs";
import { KanbanBoard, type KanbanColumn } from "../../KanbanBoard";
import { ServiceCardAttachments } from "../../KanbanCardAttachments";
import { DocumentPreviewDialog } from "../../dialogs/DocumentPreviewDialog";
import { useStore } from "../../../lib/store";
import { ServiceRequest, ServiceStage, type DocumentItem } from "../../../lib/mock";
import { useAuth } from "../../../../lib/auth";
import { toast } from "sonner";
import { inventoryService } from "../../../../lib/services";
import { ExportExcelButton } from "../../ui/ExportExcelButton";
import type { OperationFocus } from "../../../lib/operations";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "../../ui/dropdown-menu";
import {
  printAssetBase, trShortDate, serviceFormDoc, serviceQuoteDoc, SERVICE_NOTE_VARIANTS,
} from "../../../lib/print";
import { printOrWarn, openInMaps } from "../../../lib/pageHelpers";
import {
  Plus, Printer, MapPin, Wrench, Building2, Lock, Play, Pause, Square, MessageSquare,
} from "lucide-react";

const SERVICE_CURRENCIES = ["USD", "EUR", "TRY"] as const;

const serviceNoteText = (s: ServiceRequest) =>
  s.serviceNote || s.diagnosisNote || s.description || s.issueType || "Not girilmedi";

const timestamp = () => new Date().toISOString().slice(0, 16).replace("T", " ");

const formatElapsed = (seconds: number) => {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

const serviceElapsedSeconds = (s: ServiceRequest, nowMs = Date.now()) => {
  const base = s.timerElapsedSeconds ?? 0;
  if (s.timerStatus !== "running" || !s.timerStartedAt) return base;
  const started = new Date(s.timerStartedAt).getTime();
  if (!Number.isFinite(started)) return base;
  return base + Math.max(0, Math.floor((nowMs - started) / 1000));
};

const moneyText = (value: number, currency = "USD") =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency, maximumFractionDigits: 2 }).format(value || 0);

const serviceAgeDays = (s: ServiceRequest) => {
  const time = new Date(s.createdAt).getTime();
  if (!Number.isFinite(time)) return 0;
  return Math.max(0, Math.floor((Date.now() - time) / (24 * 60 * 60 * 1000)));
};

const matchesServiceFocus = (s: ServiceRequest, focus?: OperationFocus) => {
  if (focus === "open") return s.stage !== "Closed";
  if (focus === "sla" || focus === "late") return s.stage !== "Closed" && serviceAgeDays(s) > 7;
  if (focus === "scheduled") return s.stage === "Scheduled";
  return true;
};

export function ServiceRequestsPage({ initialView = "list", focus }: { initialView?: "list" | "board"; focus?: OperationFocus }) {
  const { service, machines, customers } = useStore();
  const [view, setView] = useState<"list" | "board">(initialView);
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const customerName = (id: string) => customers.find((c) => c.id === id)?.name ?? "—";
  const selectedService = selectedServiceId ? service.find((s) => s.id === selectedServiceId) ?? null : null;
  const visibleService = service.filter((s) => matchesServiceFocus(s, focus));

  useEffect(() => {
    setView(initialView);
  }, [initialView]);

  // DR.MAK Servis Formu — müşteri ve makine bilgileri CRM'den, işlem/parça
  // alanları sahada doldurulmak üzere boş basılır.
  const printServiceForm = (s: ServiceRequest, index: number) => {
    const cust = customers.find((c) => c.id === s.customerId);
    const m = machines.find((x) => x.id === s.machineId);
    const sikayet = (s as any).description || s.diagnosisNote || (s as any).issueType || "";
    printOrWarn(
      serviceFormDoc(
        {
          firma: cust?.name,
          ilgili: cust?.contactPerson,
          adres: cust ? [cust.address, cust.district, cust.city].filter(Boolean).join(" ") : "",
          tel: cust?.phone,
          faks: cust?.fax,
          gsm: cust?.phone2,
          eposta: cust?.email,
          vergiDairesi: cust?.taxOffice,
          vergiNo: cust?.taxNumber,
          formNo: String(index + 1),
          tarih: trShortDate(s.createdAt),
          tezgah: m ? { marka: m.brand, tip: m.type, model: m.model, seriNo: m.serialNumber } : undefined,
          cnc: m?.controlUnit
            ? {
                marka: m.controlUnit.split(" ")[0],
                model: m.controlUnit.split(" ").slice(1).join(" ") || undefined,
                seriNo: m.controlUnitSerial,
              }
            : undefined,
          sikayet,
          servisTipi: "ariza",
          yukumluluk: m && m.status === "Active" ? "garanti" : "ucretli",
        },
        printAssetBase()
      )
    );
  };

  // Teknik Servis Teklifi — seçilen not setiyle (teknik servis / periyodik
  // bakım / söküm-kurulum / eğitim) basılır; kalemler teklif aşamasında girilir.
  const printServiceQuote = (s: ServiceRequest, variantKey: string) => {
    const variant = SERVICE_NOTE_VARIANTS.find((v) => v.key === variantKey) ?? SERVICE_NOTE_VARIANTS[0];
    const cust = customers.find((c) => c.id === s.customerId);
    const m = machines.find((x) => x.id === s.machineId);
    printOrWarn(
      serviceQuoteDoc(
        {
          firma: cust?.name ?? "",
          ilgili: cust?.contactPerson,
          mobil: cust?.phone2,
          adres: cust ? [cust.address, cust.district, cust.city].filter(Boolean).join(" ") : "",
          tel: cust?.phone,
          email: cust?.email,
          tarih: trShortDate(new Date()),
          belgeNo: `SRV-${s.id.slice(0, 6).toUpperCase()}`,
          konu: m ? `${m.model} · ${m.serialNumber}` : undefined,
          items: [],
          kdvOran: 20,
          kdvTutar: 0,
          currency: "USD",
          baslik: variant.label.toLocaleUpperCase("tr-TR"),
          notlar: variant.notlar,
        },
        printAssetBase()
      )
    );
  };

  return (
    <>
    <Tabs value={view} onValueChange={(v) => setView(v as "list" | "board")}>
      <TabsList>
        <TabsTrigger value="list">Liste</TabsTrigger>
        <TabsTrigger value="board">Servis Akışı</TabsTrigger>
      </TabsList>
      <TabsContent value="list" className="mt-4">
        <Card className="border-border/60 shadow-sm overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Servis Talepleri</CardTitle>
            <div className="flex items-center gap-2">
              <ExportExcelButton path="/exports/service-tickets" filename="servis-talepleri.xlsx" />
              <CreateServiceRequestDialog
                trigger={<Button className="gap-1"><Plus className="size-4" /> Yeni Talep</Button>}
              />
            </div>
          </CardHeader>
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Firma</TableHead>
                <TableHead>Not</TableHead>
                <TableHead>Aşama</TableHead>
                <TableHead>Tarih</TableHead>
                <TableHead className="w-16 text-right">İşlem</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleService.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                    Bu filtreye uyan servis talebi bulunmuyor.
                  </TableCell>
                </TableRow>
              ) : (
              visibleService.map((s, idx) => {
                return (
                  <TableRow
                    key={s.id}
                    className="cursor-pointer group"
                    onClick={() => setSelectedServiceId(s.id)}
                    onKeyDown={(e) => e.key === "Enter" && setSelectedServiceId(s.id)}
                    tabIndex={0}
                    role="button"
                    aria-label={`${customerName(s.customerId)} servis talebi, ${s.stage}`}
                  >
                    <TableCell className="font-medium">{customerName(s.customerId)}</TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground line-clamp-1">{serviceNoteText(s)}</span>
                    </TableCell>
                    <TableCell><StatusBadge status={s.stage} /></TableCell>
                    <TableCell className="text-muted-foreground">{s.createdAt}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        title="Konumu haritada aç"
                        onClick={(event) => {
                          event.stopPropagation();
                          const c = customers.find((x) => x.id === s.customerId);
                          openInMaps([c?.address, c?.district, c?.city]);
                        }}
                      >
                        <MapPin className="size-4 text-muted-foreground hover:text-primary" />
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            title="Yazdır / PDF"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <Printer className="size-4 text-muted-foreground hover:text-primary" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
                          <DropdownMenuItem onClick={() => printServiceForm(s, idx)}>
                            Servis Formu yazdır
                          </DropdownMenuItem>
                          {SERVICE_NOTE_VARIANTS.map((v) => (
                            <DropdownMenuItem key={v.key} onClick={() => printServiceQuote(s, v.key)}>
                              Servis Teklifi · {v.label}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              }))}
            </TableBody>
          </Table>
          </div>
        </Card>
      </TabsContent>
      <TabsContent value="board" className="mt-4">
        <ServiceBoard onOpen={(s) => setSelectedServiceId(s.id)} focus={focus} />
      </TabsContent>
    </Tabs>
    <ServiceDetailDialog serviceRequest={selectedService} onClose={() => setSelectedServiceId(null)} />
    </>
  );
}

type ServiceColumnKey =
  | "Servis Talep"
  | "Müşteri İletişim"
  | "Servis Teklifi"
  | "Bakım/Onarım & Yedek Parça"
  | "Servis Devam Ediyor"
  | "Servis Tamamlandı Formu";

const SERVICE_COLUMNS: { key: ServiceColumnKey; stages: ServiceStage[]; primary: ServiceStage; dot: string }[] = [
  { key: "Servis Talep", stages: ["Request Opened"], primary: "Request Opened", dot: "bg-zinc-400" },
  { key: "Müşteri İletişim", stages: ["Diagnosis"], primary: "Diagnosis", dot: "bg-blue-400" },
  { key: "Servis Teklifi", stages: ["Quote Needed", "Quote Sent", "Approval"], primary: "Quote Sent", dot: "bg-indigo-500" },
  { key: "Bakım/Onarım & Yedek Parça", stages: ["Scheduled"], primary: "Scheduled", dot: "bg-amber-500" },
  { key: "Servis Devam Ediyor", stages: ["Service In Progress"], primary: "Service In Progress", dot: "bg-sky-500" },
  { key: "Servis Tamamlandı Formu", stages: ["Service Completed", "Signed Form", "Closed"], primary: "Signed Form", dot: "bg-emerald-600" },
];

const STAGE_TO_COLUMN: Record<ServiceStage, ServiceColumnKey> = SERVICE_COLUMNS.reduce((acc, col) => {
  for (const st of col.stages) acc[st] = col.key;
  return acc;
}, {} as Record<ServiceStage, ServiceColumnKey>);

type ServiceDetailTab = "summary" | "communication" | "notes" | "activities" | "operations";

const SERVICE_ACTIVITY_ENABLED_STAGES = new Set<ServiceStage>(["Service In Progress", "Service Completed", "Signed Form", "Closed"]);
const SERVICE_FEE_ENABLED_STAGES = new Set<ServiceStage>(["Service Completed", "Signed Form", "Closed"]);

const isServiceDetailTabEnabled = (stage: ServiceStage, tab: ServiceDetailTab) => {
  if (tab === "activities") return SERVICE_ACTIVITY_ENABLED_STAGES.has(stage);
  if (tab === "operations") return SERVICE_FEE_ENABLED_STAGES.has(stage);
  return true;
};

export function ServiceKanbanPage({ focus }: { focus?: OperationFocus }) {
  return <ServiceRequestsPage initialView="board" focus={focus} />;
}

function ServiceBoard({ onOpen, focus }: { onOpen?: (s: ServiceRequest) => void; focus?: OperationFocus }) {
  const { service, moveService, customers, documents } = useStore();
  const [previewDoc, setPreviewDoc] = useState<DocumentItem | null>(null);
  const customerName = (id: string) => customers.find((c) => c.id === id)?.name ?? "—";
  const visibleService = service.filter((s) => matchesServiceFocus(s, focus));
  const columns: KanbanColumn<ServiceRequest>[] = SERVICE_COLUMNS.map((col) => {
    const items = visibleService.filter((s) => STAGE_TO_COLUMN[s.stage] === col.key);
    return {
      key: col.key,
      title: col.key,
      dot: col.dot,
      items,
      footer: (
        <div className="flex items-center justify-between">
          <span>Toplam</span>
          <span>{items.length} kayıt</span>
        </div>
      ),
    };
  });
  return (
    <>
    <KanbanBoard<ServiceRequest>
      columns={columns}
      fit={false}
      columnWidth={260}
      onMove={async (id, _from, to) => {
        const target = SERVICE_COLUMNS.find((c) => c.key === to);
        if (!target) return;
        try {
          await moveService(id, target.primary);
          toast.success("Servis kartı taşındı", { description: `Yeni aşama: ${target.key}` });
        } catch (err: any) {
          toast.error("Servis kartı taşınamadı", { description: err?.message ?? "Aşama geçişi reddedildi." });
        }
      }}
      renderCard={(s) => {
        const c = customers.find((x) => x.id === s.customerId);
        return (
          <Card
            onClick={() => onOpen?.(s)}
            className="p-3 hover:shadow-md hover:border-primary/40 transition-all border-border/60 group bg-white cursor-pointer"
          >
            <div className="flex items-start gap-2">
              <div className="size-8 rounded-md bg-gradient-to-br from-primary/15 to-primary/5 text-primary grid place-items-center text-[10px] shrink-0">
                {c?.type === "company" ? <Building2 className="size-3.5" /> : <Wrench className="size-3.5" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] leading-tight truncate group-hover:text-primary transition-colors">{customerName(s.customerId)}</div>
                <div className="text-[11px] text-muted-foreground line-clamp-3 break-words mt-1.5">{serviceNoteText(s)}</div>
              </div>
            </div>
            <ServiceCardAttachments
              serviceRequestId={s.id}
              docs={documents.filter((d) => d.serviceRequestId === s.id)}
              onPreview={setPreviewDoc}
              onOpenDetail={() => onOpen?.(s)}
            />
          </Card>
        );
      }}
    />
    <DocumentPreviewDialog doc={previewDoc} onClose={() => setPreviewDoc(null)} />
    </>
  );
}

type ServiceActor = {
  id?: string;
  name: string;
  email?: string;
  department?: string;
  avatarUrl?: string;
};

function ServiceActorAvatar({ actor, className = "size-8" }: { actor?: ServiceActor | null; className?: string }) {
  const fallback = initials(actor?.name ?? "Kullanıcı") || "K";
  return (
    <Avatar className={`${className} border border-border/60 bg-white`}>
      {actor?.avatarUrl && <AvatarImage src={actor.avatarUrl} alt={actor.name} />}
      <AvatarFallback className="bg-primary/10 text-primary text-[11px] font-medium">{fallback}</AvatarFallback>
    </Avatar>
  );
}

function ServiceHistoryCard({
  text,
  createdAt,
  actor,
}: {
  text: string;
  createdAt?: string;
  actor?: ServiceActor | null;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-white px-3 py-2.5">
      <div className="flex items-start gap-3">
        <ServiceActorAvatar actor={actor} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-medium truncate">{actor?.name ?? "Bilinmeyen kullanıcı"}</span>
            {actor?.department && <span className="text-[11px] text-muted-foreground">{actor.department}</span>}
            {createdAt && <span className="text-[11px] text-muted-foreground tabular-nums">{createdAt}</span>}
          </div>
          <div className="mt-1 text-sm leading-relaxed whitespace-pre-wrap break-words">{text}</div>
        </div>
      </div>
    </div>
  );
}

function ServiceDetailDialog({
  serviceRequest,
  onClose,
}: {
  serviceRequest: ServiceRequest | null;
  onClose: () => void;
}) {
  const { updateService, customers, machines, users, products } = useStore();
  const { user: authUser } = useAuth();
  const [nowMs, setNowMs] = useState(Date.now());
  const [note, setNote] = useState("");
  const [complaint, setComplaint] = useState("");
  const [operationDescription, setOperationDescription] = useState("");
  const [operationQty, setOperationQty] = useState("1");
  const [operationPrice, setOperationPrice] = useState("0");
  const [operationCurrency, setOperationCurrency] = useState<(typeof SERVICE_CURRENCIES)[number]>("USD");
  const [detailTab, setDetailTab] = useState<ServiceDetailTab>("summary");
  const [partProductId, setPartProductId] = useState<string>("");
  const [partQty, setPartQty] = useState("1");
  const [partNote, setPartNote] = useState("");
  const [consumingParts, setConsumingParts] = useState(false);

  useEffect(() => {
    setNote("");
    setComplaint("");
    setOperationDescription("");
    setOperationQty("1");
    setOperationPrice("0");
    setOperationCurrency(serviceRequest?.serviceCurrency ?? "USD");
    setDetailTab("summary");
    setPartProductId("");
    setPartQty("1");
    setPartNote("");
  }, [serviceRequest?.id, serviceRequest?.serviceCurrency, serviceRequest?.stage]);

  useEffect(() => {
    if (serviceRequest?.timerStatus !== "running") return;
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [serviceRequest?.timerStatus, serviceRequest?.timerStartedAt]);

  if (!serviceRequest) return null;

  const customer = customers.find((c) => c.id === serviceRequest.customerId);
  const machine = machines.find((m) => m.id === serviceRequest.machineId);
  const assignee = users.find((u) => u.id === serviceRequest.assignedUserId);
  const resolveActor = (id?: string): ServiceActor | null => {
    const localUser = users.find((u) => u.id === id);
    if (localUser) {
      return {
        id: localUser.id,
        name: localUser.name,
        email: localUser.email,
        department: localUser.department,
        avatarUrl: localUser.avatarUrl,
      };
    }
    if (authUser && (!id || id === authUser.id)) {
      return {
        id: authUser.id,
        name: authUser.fullName,
        email: authUser.email,
        department: authUser.roles?.[0]?.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toLocaleUpperCase("tr-TR")),
      };
    }
    return null;
  };
  const currentActorId = authUser?.id ?? serviceRequest.assignedUserId;
  const currentActor = resolveActor(currentActorId) ?? resolveActor(serviceRequest.assignedUserId);
  const fallbackActor = resolveActor(serviceRequest.assignedUserId) ?? currentActor;
  const actorFor = (id?: string) => resolveActor(id) ?? fallbackActor;
  const elapsed = serviceElapsedSeconds(serviceRequest, nowMs);
  const hourlyRate = serviceRequest.serviceHourlyRate ?? 0;
  const serviceCurrency = serviceRequest.serviceCurrency ?? "USD";
  const serviceFee = (elapsed / 3600) * hourlyRate;
  const operations = serviceRequest.operations ?? [];
  const manualTotal = operations
    .filter((op) => op.currency === serviceCurrency)
    .reduce((sum, op) => sum + op.quantity * op.unitPrice, 0);
  const activityTabEnabled = isServiceDetailTabEnabled(serviceRequest.stage, "activities");
  const feeTabEnabled = isServiceDetailTabEnabled(serviceRequest.stage, "operations");
  const setAllowedDetailTab = (value: string) => {
    const next = value as ServiceDetailTab;
    if (!isServiceDetailTabEnabled(serviceRequest.stage, next)) return;
    setDetailTab(next);
  };

  const makeHistoryItem = (prefix: string, text: string) => ({
    id: `${prefix}-${Date.now()}`,
    text,
    createdAt: timestamp(),
    byUserId: currentActorId,
  });

  const withActivity = (text: string, patch: Partial<ServiceRequest> = {}) => ({
    ...patch,
    activityHistory: [
      ...(serviceRequest.activityHistory ?? []),
      makeHistoryItem("srv-act", text),
    ],
  });

  const startTimer = async () => {
    await updateService(
      serviceRequest.id,
      withActivity("Sayaç başlatıldı.", {
        timerStatus: "running",
        timerStartedAt: new Date().toISOString(),
      })
    );
  };

  const pauseTimer = async () => {
    await updateService(
      serviceRequest.id,
      withActivity("Sayaç beklemeye alındı.", {
        timerStatus: "paused",
        timerStartedAt: undefined,
        timerElapsedSeconds: elapsed,
      })
    );
  };

  const stopTimer = async () => {
    await updateService(
      serviceRequest.id,
      withActivity("Sayaç durduruldu.", {
        timerStatus: "stopped",
        timerStartedAt: undefined,
        timerElapsedSeconds: elapsed,
      })
    );
  };

  const addNote = async () => {
    const text = note.trim();
    if (!text) return;
    await updateService(
      serviceRequest.id,
      withActivity("Not eklendi.", {
        serviceNote: text,
        noteHistory: [
          ...(serviceRequest.noteHistory ?? []),
          makeHistoryItem("srv-note", text),
        ],
      })
    );
    setNote("");
  };

  const addComplaint = async () => {
    const text = complaint.trim();
    if (!text) return;
    await updateService(
      serviceRequest.id,
      withActivity("Şikayet kaydı eklendi.", {
        diagnosisNote: text,
        complaints: [
          ...(serviceRequest.complaints ?? []),
          makeHistoryItem("srv-complaint", text),
        ],
      })
    );
    setComplaint("");
  };

  const addOperation = async () => {
    const description = operationDescription.trim();
    if (!description) return;
    const quantity = Math.max(1, Number(operationQty) || 1);
    const unitPrice = Math.max(0, Number(operationPrice) || 0);
    await updateService(
      serviceRequest.id,
      withActivity("Manuel servis işlemi eklendi.", {
        operations: [
          ...operations,
          {
            id: `srv-op-${Date.now()}`,
            description,
            quantity,
            unitPrice,
            currency: operationCurrency,
            createdAt: timestamp(),
            byUserId: currentActorId,
          },
        ],
      })
    );
    setOperationDescription("");
    setOperationQty("1");
    setOperationPrice("0");
  };

  const spareProducts = products.filter((p) => p.categoryCode === "YEDEK_PARCA" || p.categoryCode === "AKSESUAR");

  const consumeParts = async () => {
    if (!partProductId) return;
    const qty = Math.max(1, Number(partQty) || 1);
    const prod = spareProducts.find((p) => p.id === partProductId);
    setConsumingParts(true);
    try {
      await inventoryService.consumeServiceParts({
        serviceTicketId: serviceRequest.id,
        companyId: serviceRequest.customerId,
        lines: [{ productModelId: partProductId, quantity: qty, notes: partNote.trim() || undefined }],
      });
      await updateService(
        serviceRequest.id,
        withActivity(`Stoktan parça düşüldü: ${prod?.model ?? partProductId} × ${qty}.`, {
          operations: [
            ...operations,
            {
              id: `srv-part-${Date.now()}`,
              description: `Parça kullanımı: ${prod?.model ?? prod?.modelName ?? 'Ürün'}${prod?.stockCode ? ` (${prod.stockCode})` : ''}`,
              quantity: qty,
              unitPrice: 0,
              currency: serviceCurrency,
              createdAt: timestamp(),
              byUserId: currentActorId,
            },
          ],
        })
      );
      toast.success("Parça stoğu düşüldü");
      setPartProductId("");
      setPartQty("1");
      setPartNote("");
    } catch (err: any) {
      toast.error("Parça stoğu düşülemedi", { description: err?.message ?? "İşlem başarısız." });
    } finally {
      setConsumingParts(false);
    }
  };

  return (
    <Dialog open={!!serviceRequest} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[min(1120px,calc(100vw-2rem))] max-w-none sm:max-w-none max-h-[90dvh] overflow-hidden p-0 gap-0">
        <DialogHeader className="border-b border-border/60 px-5 pt-5 pb-4 pr-12">
          <DialogTitle className="flex min-w-0 items-center gap-2">
            <Wrench className="size-5 text-primary" />
            <span className="min-w-0 truncate">{customer?.name ?? "Firma bulunamadı"}</span>
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={serviceRequest.stage} />
            {machine && <span>{machine.model} · {machine.serialNumber}</span>}
            {assignee && <span>Atanan: {assignee.name}</span>}
          </DialogDescription>
          <p className="text-xs text-muted-foreground bg-muted/50 border border-border/60 rounded-md px-3 py-2 mt-2">
            Sayaç, işlemler ve aktivite geçmişi sunucuya kaydedilir; not ve şikayet kayıtları ayrıca metin alanlarına yazılır.
          </p>
        </DialogHeader>

        <Tabs value={detailTab} onValueChange={setAllowedDetailTab} className="flex min-h-0 flex-col">
          <div className="border-b border-border/60 px-5 py-3">
            <TabsList className="h-auto w-full justify-start overflow-x-auto">
              <TabsTrigger value="summary">Özet</TabsTrigger>
              <TabsTrigger value="communication">Müşteri İletişim</TabsTrigger>
              <TabsTrigger value="notes">Not Geçmişi</TabsTrigger>
              <TabsTrigger value="activities" disabled={!activityTabEnabled} title="Servis Devam Ediyor aşamasından sonra açılır">
                {!activityTabEnabled && <Lock className="size-3" />}
                Aktivite Geçmişi
              </TabsTrigger>
              <TabsTrigger value="operations" disabled={!feeTabEnabled} title="Servis Tamamlandı alanında aktif olur">
                {!feeTabEnabled && <Lock className="size-3" />}
                Ücret
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="min-h-0 max-h-[calc(90dvh-146px)] overflow-y-auto px-5 py-4">

          <TabsContent value="summary" className="m-0 space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <Card className="lg:col-span-2 border-border/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Servis Notu</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{serviceNoteText(serviceRequest)}</p>
                </CardContent>
              </Card>
              <Card className="border-border/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Saha Süresi</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="text-3xl tabular-nums tracking-tight">{formatElapsed(elapsed)}</div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" className="gap-1" onClick={startTimer} disabled={serviceRequest.timerStatus === "running"}>
                      <Play className="size-4" /> Başlat
                    </Button>
                    <Button size="sm" variant="outline" className="gap-1" onClick={pauseTimer} disabled={serviceRequest.timerStatus !== "running"}>
                      <Pause className="size-4" /> Beklet
                    </Button>
                    <Button size="sm" variant="outline" className="gap-1" onClick={stopTimer} disabled={serviceRequest.timerStatus === "idle" || serviceRequest.timerStatus === "stopped"}>
                      <Square className="size-4" /> Durdur
                    </Button>
                  </div>
                  <div className="rounded-md border border-border/60 bg-primary/5 px-3 py-2 text-sm flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <span>Servis Ücreti Kalemi</span>
                    <b className="tabular-nums">{moneyText(serviceFee, serviceCurrency)}</b>
                  </div>
                </CardContent>
              </Card>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-lg border border-border/60 bg-white px-3 py-2.5">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Firma</div>
                <div className="mt-1 text-sm">{customer?.name ?? "—"}</div>
              </div>
              <div className="rounded-lg border border-border/60 bg-white px-3 py-2.5">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Açılış</div>
                <div className="mt-1 text-sm tabular-nums">{serviceRequest.createdAt}</div>
              </div>
              <div className="rounded-lg border border-border/60 bg-white px-3 py-2.5">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Teklif</div>
                <div className="mt-1 text-sm">{serviceRequest.quoteRequired ? "Gerekli" : "Gerekli değil"}</div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="communication" className="m-0 space-y-4">
            <Card className="border-border/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2"><MessageSquare className="size-4" /> Şikayetler</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Textarea value={complaint} onChange={(e) => setComplaint(e.target.value)} placeholder="Şikayet / müşteri iletişim notu" className="min-h-20" />
                  <Button className="self-start gap-1 sm:w-auto" onClick={addComplaint}><Plus className="size-4" /> Ekle</Button>
                </div>
                <div className="space-y-2">
                  {(serviceRequest.complaints ?? []).map((item) => (
                    <ServiceHistoryCard
                      key={item.id}
                      text={item.text}
                      createdAt={item.createdAt}
                      actor={actorFor(item.byUserId)}
                    />
                  ))}
                  {(serviceRequest.complaints ?? []).length === 0 && <div className="text-sm text-muted-foreground">Şikayet kaydı yok.</div>}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="notes" className="m-0 space-y-4">
            <Card className="border-border/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Not Geçmişi</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Servis notu" className="min-h-20" />
                  <Button className="self-start gap-1" onClick={addNote}><Plus className="size-4" /> Ekle</Button>
                </div>
                <div className="space-y-2">
                  {(serviceRequest.noteHistory ?? []).map((item) => (
                    <ServiceHistoryCard
                      key={item.id}
                      text={item.text}
                      createdAt={item.createdAt}
                      actor={actorFor(item.byUserId)}
                    />
                  ))}
                  {(serviceRequest.noteHistory ?? []).length === 0 && <div className="text-sm text-muted-foreground">Not kaydı yok.</div>}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="activities" className="m-0">
            <Card className="border-border/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Aktivite Geçmişi</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="relative space-y-3">
                  {(serviceRequest.activityHistory ?? []).map((item) => (
                    <li key={item.id}>
                      <ServiceHistoryCard
                        text={item.text}
                        createdAt={item.createdAt}
                        actor={actorFor(item.byUserId)}
                      />
                    </li>
                  ))}
                  {(serviceRequest.activityHistory ?? []).length === 0 && <div className="text-sm text-muted-foreground">Aktivite kaydı yok.</div>}
                </ol>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="operations" className="m-0 space-y-4">
            <Card className="border-border/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Servis Ücreti</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                <div>
                  <Label>Saatlik Ücret</Label>
                  <Input
                    type="number"
                    className="mt-1"
                    value={hourlyRate}
                    onChange={(e) => updateService(serviceRequest.id, { serviceHourlyRate: Number(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <Label>Para Birimi</Label>
                  <Select
                    value={serviceCurrency}
                    onValueChange={(v) => updateService(serviceRequest.id, { serviceCurrency: v as typeof serviceCurrency })}
                  >
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SERVICE_CURRENCIES.map((cur) => <SelectItem key={cur} value={cur}>{cur}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Geçirilen Süre</Label>
                  <div className="mt-1 h-10 rounded-md border border-border/60 bg-muted/30 px-3 flex items-center tabular-nums">{formatElapsed(elapsed)}</div>
                </div>
                <div>
                  <Label>Servis Ücreti Kalemi</Label>
                  <div className="mt-1 h-10 rounded-md border border-border/60 bg-primary/5 px-3 flex items-center tabular-nums font-medium">
                    {moneyText(serviceFee, serviceCurrency)}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Manuel İşlemler</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_96px_120px_110px_auto] gap-2 items-end">
                  <div>
                    <Label>İşlem</Label>
                    <Input className="mt-1" value={operationDescription} onChange={(e) => setOperationDescription(e.target.value)} placeholder="Yapılan işlem" />
                  </div>
                  <div>
                    <Label>Adet</Label>
                    <Input className="mt-1" type="number" value={operationQty} onChange={(e) => setOperationQty(e.target.value)} />
                  </div>
                  <div>
                    <Label>Birim</Label>
                    <Input className="mt-1" type="number" value={operationPrice} onChange={(e) => setOperationPrice(e.target.value)} />
                  </div>
                  <div>
                    <Label>Para</Label>
                    <Select value={operationCurrency} onValueChange={(v) => setOperationCurrency(v as typeof operationCurrency)}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {SERVICE_CURRENCIES.map((cur) => <SelectItem key={cur} value={cur}>{cur}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button className="gap-1 lg:w-auto" onClick={addOperation}><Plus className="size-4" /> Ekle</Button>
                </div>

                <div className="rounded-lg border border-border/60 overflow-hidden">
                  <Table className="min-w-[620px]">
                    <TableHeader>
                      <TableRow className="bg-muted/30 hover:bg-muted/30">
                        <TableHead>İşlem</TableHead>
                        <TableHead>Ekleyen</TableHead>
                        <TableHead>Tarih</TableHead>
                        <TableHead className="text-right">Adet</TableHead>
                        <TableHead className="text-right">Birim</TableHead>
                        <TableHead className="text-right">Tutar</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {operations.map((op) => (
                        <TableRow key={op.id}>
                          <TableCell className="min-w-[220px]">{op.description}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2 min-w-[170px]">
                              <ServiceActorAvatar actor={actorFor(op.byUserId ?? serviceRequest.assignedUserId)} className="size-7" />
                              <div className="min-w-0">
                                <div className="text-sm truncate">{actorFor(op.byUserId ?? serviceRequest.assignedUserId)?.name ?? "Bilinmeyen kullanıcı"}</div>
                                <div className="text-[11px] text-muted-foreground truncate">{actorFor(op.byUserId ?? serviceRequest.assignedUserId)?.department ?? "—"}</div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground tabular-nums whitespace-nowrap">{op.createdAt ?? "—"}</TableCell>
                          <TableCell className="text-right tabular-nums">{op.quantity}</TableCell>
                          <TableCell className="text-right tabular-nums">{moneyText(op.unitPrice, op.currency)}</TableCell>
                          <TableCell className="text-right tabular-nums">{moneyText(op.quantity * op.unitPrice, op.currency)}</TableCell>
                        </TableRow>
                      ))}
                      {operations.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-8 text-sm text-muted-foreground">Manuel işlem yok.</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>

                <div className="rounded-lg bg-muted/40 border border-border/60 px-3 py-2 text-sm flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <span>Servis ücreti + aynı para birimindeki manuel işlemler</span>
                  <b className="tabular-nums">{moneyText(serviceFee + manualTotal, serviceCurrency)}</b>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Yedek Parça / Aksesuar Kullanımı</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_110px_minmax(0,1fr)_auto] gap-2 items-end">
                  <div>
                    <Label>Ürün</Label>
                    <Select value={partProductId} onValueChange={setPartProductId}>
                      <SelectTrigger className="mt-1"><SelectValue placeholder="Parça seçin" /></SelectTrigger>
                      <SelectContent>
                        {spareProducts.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.model}{p.stockCode ? ` · ${p.stockCode}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Adet</Label>
                    <Input className="mt-1" type="number" value={partQty} onChange={(e) => setPartQty(e.target.value)} />
                  </div>
                  <div>
                    <Label>Not</Label>
                    <Input className="mt-1" value={partNote} onChange={(e) => setPartNote(e.target.value)} placeholder="Opsiyonel" />
                  </div>
                  <Button className="gap-1 lg:w-auto" onClick={consumeParts} disabled={!partProductId || consumingParts}>
                    <Plus className="size-4" /> Stoktan düş
                  </Button>
                </div>
                {spareProducts.length === 0 && (
                  <div className="text-sm text-muted-foreground">
                    Ürün listesinde YEDEK_PARCA / AKSESUAR kategorisinde kayıt bulunamadı.
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
