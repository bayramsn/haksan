import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Button } from "../../ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "../../ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import { StatusBadge } from "../../Layout";
import { CreateMachineDialog, CreateServiceRequestDialog } from "../../dialogs/CreateDialogs";
import { useStore } from "../../../lib/store";
import type { Machine } from "../../../lib/mock";
import { Eye, Wrench, Cpu } from "lucide-react";

function MachineDetailDialog({
  machine,
  onClose,
}: {
  machine: Machine | null;
  onClose: () => void;
}) {
  const { customers, service } = useStore();
  if (!machine) return null;
  const customer = customers.find((c) => c.id === machine.customerId);
  const tickets = service.filter((s) => s.machineId === machine.id);

  return (
    <Dialog open={!!machine} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[min(720px,calc(100vw-2rem))] max-w-none sm:max-w-none">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cpu className="size-5 text-primary" />
            {machine.serialNumber}
          </DialogTitle>
          <DialogDescription>{machine.model} · {customer?.name ?? "—"}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><span className="text-muted-foreground">Marka:</span> {machine.brand || "—"}</div>
          <div><span className="text-muted-foreground">Tip:</span> {machine.type || "—"}</div>
          <div><span className="text-muted-foreground">Kurulum:</span> {machine.installationDate || "—"}</div>
          <div><span className="text-muted-foreground">Garanti bitiş:</span> {machine.warrantyEnd || "—"}</div>
          <div><span className="text-muted-foreground">CNC:</span> {machine.controlUnit || "—"}</div>
          <div><span className="text-muted-foreground">CNC seri:</span> {machine.controlUnitSerial || "—"}</div>
        </div>
        <div className="flex items-center justify-between gap-2 pt-2">
          <StatusBadge status={machine.status} />
          <CreateServiceRequestDialog
            defaultMachineId={machine.id}
            trigger={
              <Button size="sm" className="gap-1">
                <Wrench className="size-4" /> Servis talebi aç
              </Button>
            }
          />
        </div>
        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Servis geçmişi ({tickets.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {tickets.length === 0 && (
              <p className="text-sm text-muted-foreground">Bu makine için servis kaydı yok.</p>
            )}
            {tickets.map((t) => (
              <div key={t.id} className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2 text-sm">
                <div>
                  <div>{t.issueType || "Servis"}</div>
                  <div className="text-xs text-muted-foreground">{t.createdAt}</div>
                </div>
                <StatusBadge status={t.stage} />
              </div>
            ))}
          </CardContent>
        </Card>
      </DialogContent>
    </Dialog>
  );
}

export function MachinesPage() {
  const { machines, service, customers } = useStore();
  const [selected, setSelected] = useState<Machine | null>(null);
  const customerName = (id: string) => customers.find((c) => c.id === id)?.name ?? "—";

  return (
    <>
      <Card className="border-border/60 shadow-sm overflow-hidden">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Makineler / Varlıklar</CardTitle>
            <CreateMachineDialog>
              <Button size="sm">Yeni Makine Ekle</Button>
            </CreateMachineDialog>
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          {machines.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <div className="size-12 rounded-full bg-muted grid place-items-center mb-3">
                <Cpu className="size-6 text-muted-foreground" />
              </div>
              <h3 className="font-medium">Kayıtlı Makine Yok</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                Şu anda sisteme kayıtlı bir makine bulunmuyor. Yeni bir makine/varlık ekleyerek servis süreçlerini başlatabilirsiniz.
              </p>
              <CreateMachineDialog>
                <Button className="mt-4">Yeni Makine Ekle</Button>
              </CreateMachineDialog>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Seri No</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Müşteri</TableHead>
                  <TableHead>Kurulum</TableHead>
                  <TableHead>Garanti Bitiş</TableHead>
                  <TableHead>Servis Sayısı</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {machines.map((m) => {
                  const srCount = service.filter((s) => s.machineId === m.id).length;
                  return (
                    <TableRow
                      key={m.id}
                      className="cursor-pointer hover:bg-muted/40"
                      tabIndex={0}
                      onClick={() => setSelected(m)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelected(m);
                        }
                      }}
                    >
                      <TableCell>{m.serialNumber}</TableCell>
                      <TableCell>{m.model}</TableCell>
                      <TableCell>{customerName(m.customerId)}</TableCell>
                      <TableCell className="text-muted-foreground">{m.installationDate}</TableCell>
                      <TableCell className="text-muted-foreground">{m.warrantyEnd}</TableCell>
                      <TableCell className="tabular-nums">{srCount}</TableCell>
                      <TableCell><StatusBadge status={m.status} /></TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          aria-label="Makine detayı"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelected(m);
                          }}
                        >
                          <Eye className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </Card>
      <MachineDetailDialog machine={selected} onClose={() => setSelected(null)} />
    </>
  );
}
