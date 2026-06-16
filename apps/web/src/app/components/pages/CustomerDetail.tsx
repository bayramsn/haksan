import { type ReactNode, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { ArrowLeft, Phone, Mail, MapPin, Building2, Plus, ArrowUpRight, Clock } from "lucide-react";
import { Customer } from "../../lib/mock";
import { useStore } from "../../lib/store";
import { StatusBadge } from "../Layout";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { CreateCaseDialog, LogActivityDialog } from "../dialogs/CreateDialogs";
import { buildCustomerTimeline, type OperationAction } from "../../lib/operations";
import { CompanyFinancePanel } from "../shared/CompanyFinancePanel";

export function CustomerDetailPage({ customer, onBack, onAction }: { customer: Customer; onBack: () => void; onAction?: (action: OperationAction) => void }) {
  const store = useStore();
  const { cases: allCases, activities: allActivities, payments: allPayments, machines: allMachines } = store;
  const cases = allCases.filter((s) => s.customerId === customer.id);
  const acts = allActivities.filter((a) => a.customerId === customer.id);
  const pays = allPayments.filter((p) => p.customerId === customer.id);
  const mcs = allMachines.filter((m) => m.customerId === customer.id);
  const timeline = useMemo(() => buildCustomerTimeline(customer.id, store), [customer.id, store]);

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack} className="gap-1">
        <ArrowLeft className="size-4" /> Müşteri listesine dön
      </Button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-1">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xl">{customer.name}</div>
                <div className="text-sm text-muted-foreground">{customer.type === "company" ? "Kurumsal Müşteri" : "Bireysel Müşteri"}</div>
              </div>
              <StatusBadge status={customer.status} />
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row icon={<Building2 className="size-4" />} label="VKN" value={customer.taxNumber} />
            <Row icon={<Phone className="size-4" />} label="Telefon" value={customer.phone} />
            <Row icon={<Mail className="size-4" />} label="E-posta" value={customer.email} />
            <Row icon={<MapPin className="size-4" />} label="Adres" value={`${customer.city} · ${customer.address}`} />
            <div className="pt-3 border-t">
              <div className="text-xs uppercase text-muted-foreground mb-1">İletişim Kişisi</div>
              <div>{customer.contactPerson}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-muted-foreground mb-1">Talep Edilen Ürün</div>
              <div>{customer.wantedProduct}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-muted-foreground mb-1">İlk Not</div>
              <div className="text-muted-foreground">{customer.initialNote}</div>
            </div>
            <CompanyFinancePanel companyId={customer.id} companyName={customer.name} />
          </CardContent>
        </Card>

        <div className="lg:col-span-2">
          <Tabs defaultValue="timeline">
            <TabsList className="h-auto flex-wrap justify-start">
              <TabsTrigger value="timeline">Geçmiş ({timeline.length})</TabsTrigger>
              <TabsTrigger value="cases">Satış Kartları ({cases.length})</TabsTrigger>
              <TabsTrigger value="activity">Aktivite ({acts.length})</TabsTrigger>
              <TabsTrigger value="payments">Cari ({pays.length})</TabsTrigger>
              <TabsTrigger value="machines">Makineler ({mcs.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="timeline" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="size-4 text-primary" />
                    Kayıt Geçmişi
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {timeline.length === 0 ? (
                    <div className="grid min-h-40 place-items-center rounded-lg border border-dashed border-border/70 bg-muted/20 px-5 text-center text-sm text-muted-foreground">
                      Bu firma için geçmiş kaydı yok.
                    </div>
                  ) : (
                    <ol className="relative ml-3 max-h-[560px] space-y-4 overflow-y-auto border-l border-border pr-2">
                      {timeline.map((item) => (
                        <li key={item.id} className="ml-4">
                          <span className="absolute -left-1.5 mt-1.5 size-3 rounded-full border-2 border-white bg-primary shadow-sm" />
                          <button
                            type="button"
                            disabled={!item.action}
                            onClick={() => item.action && onAction?.(item.action)}
                            className="w-full rounded-md border border-border/60 bg-white px-3 py-2.5 text-left transition-colors enabled:hover:border-primary/30 enabled:hover:bg-muted/30 disabled:cursor-default"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{item.type}</span>
                                  <span className="truncate text-xs text-muted-foreground">{item.date}</span>
                                </div>
                                <div className="mt-1.5 text-sm font-medium leading-tight">{item.title}</div>
                                <div className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.description}</div>
                                {item.meta && <div className="mt-1 text-xs text-muted-foreground">{item.meta}</div>}
                              </div>
                              {item.action && <ArrowUpRight className="mt-1 size-4 shrink-0 text-muted-foreground" />}
                            </div>
                          </button>
                        </li>
                      ))}
                    </ol>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="cases" className="mt-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>Satış Kartları</CardTitle>
                  <CreateCaseDialog
                    defaultCustomerId={customer.id}
                    trigger={<Button size="sm" className="gap-1"><Plus className="size-4" /> Yeni Kart</Button>}
                  />
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Ürün / Model</TableHead>
                        <TableHead>Tutar</TableHead>
                        <TableHead>Aşama</TableHead>
                        <TableHead>Tarih</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cases.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell>{s.requestedProduct} <span className="text-muted-foreground">· {s.requestedModel}</span></TableCell>
                          <TableCell className="tabular-nums">{s.estimatedAmount.toLocaleString()} {s.currency}</TableCell>
                          <TableCell><StatusBadge status={s.stage} /></TableCell>
                          <TableCell className="text-muted-foreground">{s.createdAt}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="activity" className="mt-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
                  <CardTitle className="text-base">Aktiviteler</CardTitle>
                  <div className="flex items-center gap-2">
                    <LogActivityDialog
                      customerId={customer.id}
                      defaultKind="visit"
                      trigger={<Button size="sm" variant="outline" className="gap-1"><Plus className="size-4" /> Ziyaret</Button>}
                    />
                    <LogActivityDialog
                      customerId={customer.id}
                      defaultKind="call"
                      trigger={<Button size="sm" variant="outline" className="gap-1"><Phone className="size-4" /> Arama</Button>}
                    />
                  </div>
                </CardHeader>
                <CardContent className="p-6 pt-0">
                  <ol className="relative border-l border-border ml-3 space-y-5">
                    {acts.map((a) => (
                      <li key={a.id} className="ml-4">
                        <span className="absolute -left-1.5 size-3 rounded-full bg-primary" />
                        <div className="text-xs text-muted-foreground">{a.date}{a.type ? ` · ${a.type}` : ""}</div>
                        <div className="text-sm font-medium">{a.title}</div>
                        <div className="text-sm text-muted-foreground">{a.note}</div>
                      </li>
                    ))}
                    {acts.length === 0 && <div className="text-sm text-muted-foreground">Aktivite yok.</div>}
                  </ol>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="payments" className="mt-4">
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tip</TableHead>
                      <TableHead>Fatura No</TableHead>
                      <TableHead>Tutar</TableHead>
                      <TableHead>Vade</TableHead>
                      <TableHead>Durum</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pays.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>{p.paymentType === "received" ? "Tahsilat" : p.direction === "out" ? "Ödeme" : "Beklenen"}</TableCell>
                        <TableCell className="text-muted-foreground">{p.invoiceNo || "—"}</TableCell>
                        <TableCell className="tabular-nums">{p.amount.toLocaleString()} {p.currency}</TableCell>
                        <TableCell className="text-muted-foreground">{p.dueDate}</TableCell>
                        <TableCell><StatusBadge status={p.status} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            </TabsContent>

            <TabsContent value="machines" className="mt-4">
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Seri No</TableHead>
                      <TableHead>Model</TableHead>
                      <TableHead>Kurulum</TableHead>
                      <TableHead>Garanti Bitiş</TableHead>
                      <TableHead>Durum</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mcs.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell>{m.serialNumber}</TableCell>
                        <TableCell>{m.model}</TableCell>
                        <TableCell className="text-muted-foreground">{m.installationDate}</TableCell>
                        <TableCell className="text-muted-foreground">{m.warrantyEnd}</TableCell>
                        <TableCell><StatusBadge status={m.status} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

function Row({ icon, label, value }: { icon: ReactNode; label: string; value?: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="text-muted-foreground mt-0.5">{icon}</div>
      <div className="flex-1">
        <div className="text-xs uppercase text-muted-foreground">{label}</div>
        <div>{value || "—"}</div>
      </div>
    </div>
  );
}
