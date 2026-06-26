import { useState } from "react";
import { Card } from "../ui/card";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { SALES_STAGES, SalesCase, SalesStage, salesStageLabel, DocumentItem } from "../../lib/mock";
import { ArrowRight, Building2, Calendar } from "lucide-react";
import { KanbanBoard, KanbanColumn } from "../KanbanBoard";
import { KanbanCardAttachments } from "../KanbanCardAttachments";
import { DocumentPreviewDialog } from "../dialogs/DocumentPreviewDialog";
import { useStore } from "../../lib/store";
import { LostCaseDialog } from "../dialogs/LostCaseDialog";
import { loadContractPrintData, loadProformaPrintData, proformaDoc, contractDoc, installationFormDoc, printAssetBase, trShortDate } from "../../lib/print";
import { printOrWarn } from "../../lib/pageHelpers";
import { toast } from "sonner";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

const STAGE_DOT: Record<string, string> = {
  lead: "bg-zinc-400",
  sales: "bg-zinc-400",
  call: "bg-blue-400",
  visit: "bg-blue-500",
  cancelled: "bg-red-500",
  quote: "bg-indigo-500",
  proforma: "bg-emerald-500",
  contract: "bg-emerald-500",
  payment_plan: "bg-emerald-500",
  commercial_invoice: "bg-amber-500",
  customs_approved: "bg-amber-500",
  stock_picking: "bg-sky-500",
  shipping: "bg-blue-500",
  installation: "bg-brand-blue",
  delivered: "bg-emerald-600",
  Lead: "bg-zinc-400",
  "Initial Contact": "bg-zinc-400",
  "Requirement Analysis": "bg-blue-400",
  "Offer Preparing": "bg-blue-500",
  "Offer Sent": "bg-indigo-500",
  "Follow-up": "bg-indigo-400",
  "Offer Approved": "bg-emerald-500",
  "Proforma / Contract": "bg-emerald-500",
  Customs: "bg-amber-500",
  Shipment: "bg-amber-500",
  Installation: "bg-amber-500",
  Completed: "bg-emerald-600",
  Lost: "bg-red-500",
};

const initials = (n: string) => (n || "—").split(" ").slice(0, 2).map((p) => p[0]).join("").toUpperCase();

export function KanbanPage({ onSelect, items }: { onSelect: (s: SalesCase) => void; items?: SalesCase[] }) {
  const { cases: storeCases, moveCase, customers, contacts, users, documents, offers, products, payments, machines, addDocument } = useStore();
  const cases = items ?? storeCases;
  const [lostId, setLostId] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<DocumentItem | null>(null);
  const lostCustomer = lostId ? customers.find((x) => x.id === cases.find((s) => s.id === lostId)?.customerId)?.name : undefined;

  // Kart "Proforma" aşamasına geldiğinde: kartın ve (varsa) ilişkili teklifin
  // bilgilerinden örnek PDF formatında proforma üretip yeni sekmede açar ve
  // sistemde bir Proforma belge kaydı oluşturur (zaten varsa yalnızca açar).
  const generateProforma = async (sc: SalesCase) => {
    const loading = toast.loading("Proforma hazırlanıyor…");
    try {
      const existing = documents.find((d) => d.salesCaseId === sc.id && d.type === "Proforma");
      const year = new Date().getFullYear();
      const seq = String(documents.filter((d) => d.type === "Proforma").length + 1).padStart(3, "0");
      const belgeNo = existing?.fileName ?? `${year}/${seq}`;

      const doc: DocumentItem = {
        id: existing?.id ?? `pf-${sc.id}`,
        salesCaseId: sc.id,
        companyId: sc.customerId,
        quoteId: existing?.quoteId,
        type: "Proforma",
        fileName: belgeNo,
        uploadedBy: "",
        uploadedAt: new Date().toISOString().slice(0, 10),
        size: "—",
      };

      // 1) Örnek formatında proformayı oluştur ve yeni sekmede aç.
      const data = await loadProformaPrintData({
        doc,
        customers,
        cases,
        offers,
        products,
        contacts,
      });
      printOrWarn(proformaDoc(data, printAssetBase()));

      // 2) Sistemde proforma kaydı oluştur (zaten varsa atla).
      if (!existing) {
        try {
          await addDocument({
            salesCaseId: sc.id,
            companyId: sc.customerId,
            type: "Proforma",
            fileName: belgeNo,
            size: "—",
          });
          toast.success("Proforma oluşturuldu", { description: `Belge No: ${belgeNo}` });
        } catch (err: any) {
          toast.message("Proforma açıldı, kayıt oluşturulamadı", {
            description: err?.message ?? "İlişkili teklif bulunamadı.",
          });
        }
      }
    } catch (err: any) {
      toast.error("Proforma oluşturulamadı", { description: err?.message ?? "Teklif verisi okunamadı." });
    } finally {
      toast.dismiss(loading);
    }
  };

  // Satış Sözleşmesi PDF'ini kartın/teklifinin verisinden üretir (Belgeler
  // sayfasındaki printContract ile aynı kurallar).
  const buildContractDoc = async (sc: SalesCase) => {
    const cust = customers.find((c) => c.id === sc.customerId) ?? null;
    const offer = offers
      .filter((o) => o.salesCaseId === sc.id || (cust && o.companyId === cust.id))
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    const data = await loadContractPrintData({
      customer: cust,
      salesCase: sc,
      offer,
      products,
      payments,
      contractDate: new Date().toISOString().slice(0, 10),
    });
    return contractDoc(data, printAssetBase());
  };

  // Sözleşme aşaması backend'de bir sözleşme kaydı şartı koşar; bu yüzden
  // proformanın aksine önce sözleşmeyi üretip kaydı oluştururuz, sonra
  // aşamayı taşırız. Kapı sağlanırsa true döner.
  const prepareContract = async (sc: SalesCase): Promise<boolean> => {
    const loading = toast.loading("Sözleşme hazırlanıyor…");
    try {
      const existing = documents.find((d) => d.salesCaseId === sc.id && d.type === "Contract");
      const year = new Date().getFullYear();
      const seq = String(documents.filter((d) => d.type === "Contract").length + 1).padStart(3, "0");
      const sozlesmeNo = existing?.fileName ?? `${year}/S-${seq}`;

      // 1) Satış Sözleşmesi PDF'ini üret ve yeni sekmede aç.
      printOrWarn(await buildContractDoc(sc));

      // 2) Kayıt yoksa oluştur (backend aşama kapısını geçirir).
      if (!existing) {
        await addDocument({
          salesCaseId: sc.id,
          companyId: sc.customerId,
          type: "Contract",
          fileName: sozlesmeNo,
          size: "—",
        });
        toast.success("Sözleşme oluşturuldu", { description: `Belge No: ${sozlesmeNo}` });
      }
      return true;
    } catch (err: any) {
      toast.error("Sözleşme oluşturulamadı", { description: err?.message ?? "İlişkili teklif bulunamadı." });
      return false;
    } finally {
      toast.dismiss(loading);
    }
  };

  // Kurulum aşamasına gelince Kurulum Tutanağı'nı (DR.MAK) kartın müşterisi ve
  // (varsa) bağlı makinesinin bilgileriyle üretip yeni sekmede açar. Sahada
  // doldurulacak alanlar (seri no, tarih, imza) boş kalır. Garanti, aşama
  // geçişiyle backend tarafında otomatik başlatılır.
  const generateInstallationForm = (sc: SalesCase) => {
    const cust = customers.find((c) => c.id === sc.customerId);
    const m =
      machines.find((x) => x.salesCaseId === sc.id) ??
      machines.find((x) => x.customerId === sc.customerId);
    printOrWarn(
      installationFormDoc(
        {
          teslimTarihi: m?.deliveryDate ? trShortDate(m.deliveryDate) : "",
          kurulumTarihi: m?.installationDate ? trShortDate(m.installationDate) : "",
          formNo: sc.id.slice(0, 6).toUpperCase(),
          tezgah: m ? { marka: m.brand, tip: m.type, model: m.model, seriNo: m.serialNumber } : undefined,
          cnc: m?.controlUnit
            ? {
                marka: m.controlUnit.split(" ")[0],
                model: m.controlUnit.split(" ").slice(1).join(" ") || undefined,
                seriNo: m.controlUnitSerial,
              }
            : undefined,
          firma: cust?.name ?? "",
          ilgili: cust?.contactPerson,
          adres: cust ? [cust.address, cust.district, cust.city].filter(Boolean).join(" ") : "",
          telefon: cust?.phone,
          faks: cust?.fax,
          gsm: cust?.phone2,
          eposta: cust?.email,
          technicalSpecs: m?.technicalSpecs,
        },
        printAssetBase()
      )
    );
  };

  const moveToStage = async (id: string, from: SalesStage, to: SalesStage) => {
    if (from === to) return;
    if (to === "cancelled") {
      setLostId(id);
      return;
    }
    const sc = storeCases.find((s) => s.id === id);

    // Sözleşme aşaması belge şartlı: önce üret+kaydet, kapı sağlanmazsa taşıma.
    if (to === "contract" && sc) {
      const ready = await prepareContract(sc);
      if (!ready) return;
    }

    try {
      await moveCase(id, to);
      toast.success("Kart taşındı", { description: `Yeni aşama: ${salesStageLabel(to)}` });
      if (to === "proforma" && sc) {
        void generateProforma(sc);
      }
      if (to === "installation" && sc) {
        generateInstallationForm(sc);
        toast.success("Kurulum tutanağı hazırlandı", { description: "Garanti, kurulumla otomatik başlatıldı." });
      }
      if (to === "payment_plan" && sc) {
        // Kart Ödeme Planı aşamasına geldiğinde detay/dialog otomatik açılır;
        // SalesCaseDetail içindeki "Ödeme Planı Gerekli" kartı kullanıcıyı
        // "Ödeme Planı Oluştur" butonuna yönlendirir.
        onSelect({ ...sc, stage: to });
      }
    } catch (err: any) {
      toast.error("Kart taşınamadı", { description: err?.message ?? "Aşama gereksinimleri tamamlanmalı." });
    }
  };

  const columns: KanbanColumn<SalesCase>[] = SALES_STAGES.map((stage) => {
    const items = cases.filter((s) => s.stage === stage);
    const total = items.reduce((a, s) => a + s.estimatedAmount, 0);
    return {
      key: stage,
      title: salesStageLabel(stage),
      dot: STAGE_DOT[stage],
      items,
      footer: (
        <div className="flex items-center justify-between">
          <span>Toplam</span>
          <span>€ {total.toLocaleString()}</span>
        </div>
      ),
    };
  });

  return (
    <>
    <LostCaseDialog open={!!lostId} onOpenChange={(o) => !o && setLostId(null)} caseId={lostId} caseName={lostCustomer} />
    <DocumentPreviewDialog doc={previewDoc} onClose={() => setPreviewDoc(null)} />
    <KanbanBoard<SalesCase>
      columns={columns}
      fit={false}
      columnWidth={292}
      onMove={(id, from, to) => moveToStage(id, from as SalesStage, to as SalesStage)}
      renderCard={(s) => {
        const c = customers.find((x) => x.id === s.customerId);
        const u = users.find((x) => x.id === s.assignedUserId);
        const caseDocs = documents.filter((d) => d.salesCaseId === s.id);
        return (
          <Card
            data-testid={`sales-kanban-card-${s.id}`}
            onClick={() => onSelect(s)}
            className="overflow-hidden p-3 hover:shadow-md hover:border-primary/40 transition-all border-border/60 group bg-white"
          >
            <div className="flex items-start gap-2">
              <div className="size-8 rounded-md bg-gradient-to-br from-primary/15 to-primary/5 text-primary grid place-items-center text-[10px] shrink-0">
                {c?.type !== "person" ? <Building2 className="size-3.5" /> : initials(c.name)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] leading-tight truncate group-hover:text-primary transition-colors">{c?.name ?? "Firma bulunamadı"}</div>
                <div className="text-[11px] text-muted-foreground line-clamp-2 break-words mt-0.5">{s.requestedProduct}</div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7 shrink-0 opacity-80 hover:opacity-100"
                    title="Aşamaya gönder"
                    onClick={(event) => event.stopPropagation()}
                    onMouseDown={(event) => event.stopPropagation()}
                  >
                    <ArrowRight className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56" onClick={(event) => event.stopPropagation()}>
                  <DropdownMenuLabel>Aşamaya gönder</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {SALES_STAGES.map((stage) => (
                    <DropdownMenuItem
                      key={stage}
                      disabled={stage === s.stage}
                      onSelect={() => void moveToStage(s.id, s.stage, stage)}
                    >
                      <span className={`size-2 rounded-full shrink-0 ${STAGE_DOT[stage]}`} />
                      <span className="truncate">{salesStageLabel(stage)}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
              <span className="inline-flex max-w-full truncate px-1.5 py-0.5 rounded text-[10px] bg-muted text-foreground/70">{s.requestedModel || "Model yok"}</span>
              <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] bg-muted text-foreground/70">×{s.quantity}</span>
              {s.isOfferPrepared && (
                <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] bg-emerald-50 text-emerald-700">Teklif</span>
              )}
            </div>

            <KanbanCardAttachments
              caseId={s.id}
              companyId={s.customerId}
              docs={caseDocs}
              onPreview={setPreviewDoc}
              onOpenCase={() => onSelect(s)}
            />

            <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-border/60">
              <div className="min-w-0 truncate text-[13px] tabular-nums tracking-tight">
                {s.estimatedAmount.toLocaleString()} <span className="text-[11px] text-muted-foreground">{s.currency}</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Calendar className="size-2.5" />
                  {s.createdAt.slice(5)}
                </span>
                <Avatar className="size-5">
                  <AvatarFallback className="bg-primary/15 text-primary text-[9px]">
                    {initials(u?.name ?? "—")}
                  </AvatarFallback>
                </Avatar>
              </div>
            </div>
          </Card>
        );
      }}
    />
    </>
  );
}
