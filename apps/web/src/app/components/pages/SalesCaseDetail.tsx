import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { ArrowLeft, Plus, Upload, X, XCircle } from "lucide-react";
import { SalesCase, SALES_STAGES, salesStageLabel } from "../../lib/mock";
import { StatusBadge } from "../Layout";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { useStore } from "../../lib/store";
import { AddActivityDialog } from "../dialogs/CreateDialogs";
import { QuoteDialog } from "../dialogs/QuoteDialog";
import { LostCaseDialog } from "../dialogs/LostCaseDialog";
import { Dialog, DialogContent } from "../ui/dialog";
import { DocumentUploadDialog } from "../dialogs/DocumentUploadDialog";

export function SalesCaseDetailDialog({
  sc,
  onClose,
}: {
  sc: SalesCase | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!sc} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[min(1120px,calc(100vw-2rem))] max-w-none sm:max-w-none max-h-[90dvh] overflow-hidden p-0 gap-0">
        {sc && <SalesCaseDetailPage sc={sc} onBack={onClose} mode="dialog" />}
      </DialogContent>
    </Dialog>
  );
}

export function SalesCaseDetailPage({
  sc,
  onBack,
  mode = "page",
}: {
  sc: SalesCase;
  onBack: () => void;
  mode?: "page" | "dialog";
}) {
  const { offers, activities, customers, users, documents, payments } = useStore();
  const [lostOpen, setLostOpen] = useState(false);
  const canMarkLost = !sc.isLost && sc.stage !== "cancelled" && sc.stage !== "delivered";
  const c = customers.find((x) => x.id === sc.customerId);
  const u = users.find((x) => x.id === sc.assignedUserId);
  const acts = activities.filter((a) => a.salesCaseId === sc.id);
  const offs = offers.filter((o) => o.salesCaseId === sc.id);
  const docs = documents.filter((d) => d.salesCaseId === sc.id);
  const pays = payments.filter((p) => p.salesCaseId === sc.id);
  const rootClass = mode === "dialog" ? "flex max-h-[90dvh] min-h-0 flex-col overflow-hidden" : "space-y-4";
  const toolbarClass =
    mode === "dialog"
      ? "flex items-center justify-between gap-2 border-b border-border/60 px-5 py-4 pr-12"
      : "flex items-center justify-between gap-2";
  const bodyClass = mode === "dialog" ? "min-h-0 overflow-y-auto px-5 py-4 space-y-4" : "space-y-4";

  return (
    <div className={rootClass}>
      <div className={toolbarClass}>
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1">
          {mode === "dialog" ? <X className="size-4" /> : <ArrowLeft className="size-4" />}
          {mode === "dialog" ? "Kapat" : "Listeye dön"}
        </Button>
        {canMarkLost && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLostOpen(true)}
            className="gap-1 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
          >
            <XCircle className="size-4" /> Kaybedildi olarak işaretle
          </Button>
        )}
      </div>

      <LostCaseDialog open={lostOpen} onOpenChange={setLostOpen} caseId={sc.id} caseName={c?.name} />

      <div className={bodyClass}>
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground">SATIŞ KARTI · #{sc.id.toUpperCase()}</div>
              <div className="text-xl mt-1 break-words">{c?.name ?? "Firma bulunamadı"}</div>
              <div className="text-sm text-muted-foreground mt-0.5 break-words">{sc.requestedProduct} · {sc.requestedModel} · {sc.quantity} adet</div>
            </div>
            <div className="shrink-0 text-left lg:text-right">
              <div className="text-2xl tabular-nums">{sc.estimatedAmount.toLocaleString()} {sc.currency}</div>
              <div className="mt-2"><StatusBadge status={sc.stage} /></div>
              <div className="text-xs text-muted-foreground mt-1">Atanan: {u?.name ?? "Atanmadı"}</div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-1">
            {SALES_STAGES.filter((s) => s !== "cancelled").map((s, i) => {
              const idx = SALES_STAGES.indexOf(sc.stage);
              const reached = i <= idx;
              return (
                <div
                  key={s}
                  className={`px-2 py-1 text-xs rounded ${reached ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                >
                  {salesStageLabel(s)}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="timeline">
        <TabsList className="h-auto w-full justify-start overflow-x-auto">
          <TabsTrigger value="timeline">Zaman Çizelgesi</TabsTrigger>
          <TabsTrigger value="offers">Teklifler ({offs.length})</TabsTrigger>
          <TabsTrigger value="documents">Dokümanlar ({docs.length})</TabsTrigger>
          <TabsTrigger value="payments">Ödemeler ({pays.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="timeline" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Aktiviteler</CardTitle>
              <AddActivityDialog
                salesCaseId={sc.id}
                customerId={sc.customerId}
                trigger={<Button size="sm" className="gap-1"><Plus className="size-4" /> Aktivite Ekle</Button>}
              />
            </CardHeader>
            <CardContent>
              <ol className="relative border-l border-border ml-3 space-y-5">
                {acts.map((a) => (
                  <li key={a.id} className="ml-4">
                    <span className="absolute -left-1.5 size-3 rounded-full bg-primary" />
                    <div className="text-xs text-muted-foreground">{a.date}</div>
                    <div className="text-sm">{a.title}</div>
                    <div className="text-sm text-muted-foreground">{a.note}</div>
                  </li>
                ))}
                {acts.length === 0 && <div className="text-sm text-muted-foreground">Aktivite yok.</div>}
              </ol>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="offers" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Teklifler</CardTitle>
              <QuoteDialog
                defaultCaseId={sc.id}
                defaultCustomerId={sc.customerId}
                trigger={<Button size="sm" className="gap-1"><Plus className="size-4" /> Yeni Teklif</Button>}
              />
            </CardHeader>
            <div className="overflow-x-auto">
              <Table className="min-w-[620px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Teklif No</TableHead>
                    <TableHead>Revizyon</TableHead>
                    <TableHead>Tarih</TableHead>
                    <TableHead>Tutar</TableHead>
                    <TableHead>Durum</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {offs.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell>{o.quoteNo}</TableCell>
                      <TableCell>R{o.revision}</TableCell>
                      <TableCell className="text-muted-foreground">{o.date}</TableCell>
                      <TableCell className="tabular-nums">{o.amount.toLocaleString()} {o.currency}</TableCell>
                      <TableCell><StatusBadge status={o.status} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="documents" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Dokümanlar</CardTitle>
              <DocumentUploadDialog
                defaultSalesCaseId={sc.id}
                defaultCompanyId={sc.customerId}
                trigger={<Button size="sm" className="gap-1"><Upload className="size-4" /> Yükle</Button>}
              />
            </CardHeader>
            <div className="overflow-x-auto">
              <Table className="min-w-[560px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Tip</TableHead>
                    <TableHead>Dosya</TableHead>
                    <TableHead>Boyut</TableHead>
                    <TableHead>Tarih</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {docs.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell><StatusBadge status={d.type} /></TableCell>
                      <TableCell className="max-w-[320px] truncate">{d.fileName}</TableCell>
                      <TableCell className="text-muted-foreground">{d.size}</TableCell>
                      <TableCell className="text-muted-foreground">{d.uploadedAt}</TableCell>
                    </TableRow>
                  ))}
                  {docs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-sm text-muted-foreground">Doküman yok.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="payments" className="mt-4">
          <Card>
            <div className="overflow-x-auto">
              <Table className="min-w-[620px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Tip</TableHead>
                    <TableHead>Tutar</TableHead>
                    <TableHead>Vade</TableHead>
                    <TableHead>Ödeme Tarihi</TableHead>
                    <TableHead>Durum</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pays.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{p.paymentType === "received" ? "Tahsilat" : "Beklenen"}</TableCell>
                      <TableCell className="tabular-nums">{p.amount.toLocaleString()} {p.currency}</TableCell>
                      <TableCell className="text-muted-foreground">{p.dueDate}</TableCell>
                      <TableCell className="text-muted-foreground">{p.paidDate ?? "—"}</TableCell>
                      <TableCell><StatusBadge status={p.status} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
      </div>
    </div>
  );
}
