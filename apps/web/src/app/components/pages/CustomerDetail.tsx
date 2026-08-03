import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { ArrowLeft, Phone, Mail, MapPin, Building2, Plus, ArrowUpRight, Clock, AlertTriangle, NotebookText } from "lucide-react";
import { Customer } from "../../lib/mock";
import { useStore } from "../../lib/store";
import { StatusBadge } from "../Layout";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { CreateCaseDialog, LogActivityDialog } from "../dialogs/CreateDialogs";
import { buildCustomerTimeline, type OperationAction } from "../../lib/operations";
import { CompanyFinancePanel } from "../shared/CompanyFinancePanel";
import { companyService } from "../../../lib/services";

const ADDRESS_TYPE_LABELS: Record<string, string> = {
  office: "Ofis",
  factory: "Fabrika",
  work_area: "Çalışma Alanı",
  shipping: "Sevkiyat",
  billing: "Fatura",
  other: "Diğer",
};

/**
 * Ortak firmada başka bölüm(ler)e açık borç varsa kırmızı uyarı gösterir.
 * Tutar yalnızca süper yönetici/view_all için backend'den döner.
 */
function CrossDivisionDebtWarning({ companyId }: { companyId: string }) {
  const [debt, setDebt] = useState<{
    hasDebt: boolean;
    departments: { id: string; name: string; amount?: number }[];
    amount?: number;
  } | null>(null);

  useEffect(() => {
    let alive = true;
    companyService
      .crossDivisionDebt(companyId)
      .then((d) => alive && setDebt(d))
      .catch(() => {
        /* yetkisiz / hata — uyarı gösterme */
      });
    return () => {
      alive = false;
    };
  }, [companyId]);

  if (!debt?.hasDebt) return null;
  const names = debt.departments.map((d) => d.name).join(", ");
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-red-300 bg-red-50 px-3.5 py-2.5 text-sm text-red-800">
      <AlertTriangle className="size-4 mt-0.5 shrink-0 text-red-600" />
      <div>
        <span className="font-medium">Bu müşterinin {names} birimine borcu bulunmaktadır.</span>
        {debt.amount != null && (
          <span className="ml-1 tabular-nums">Toplam açık alacak: {debt.amount.toLocaleString("tr-TR")}</span>
        )}
      </div>
    </div>
  );
}

export function CustomerDetailPage({ customer, onBack, onAction }: { customer: Customer; onBack: () => void; onAction?: (action: OperationAction) => void }) {
  const store = useStore();
  const { cases: allCases, activities: allActivities, payments: allPayments, machines: allMachines } = store;
  const cases = allCases.filter((s) => s.customerId === customer.id);
  const acts = allActivities.filter((a) => a.customerId === customer.id);
  const pays = allPayments.filter((p) => p.customerId === customer.id);
  const mcs = allMachines.filter((m) => m.customerId === customer.id);
  const timeline = useMemo(() => buildCustomerTimeline(customer.id, store), [customer.id, store]);
  const companyAddresses = customer.addresses?.length
    ? customer.addresses
    : (customer.address || customer.city || customer.district || customer.country)
      ? [{
          addressType: "office" as const,
          address: customer.address,
          district: customer.district,
          city: customer.city,
          country: customer.country ?? "Türkiye",
          isDefault: true,
          isShipping: true,
          isBilling: true,
        }]
      : [];

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack} className="gap-1">
        <ArrowLeft className="size-4" /> Müşteri listesine dön
      </Button>

      <CrossDivisionDebtWarning companyId={customer.id} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-1">
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-display text-2xl font-semibold leading-none tracking-tight">{customer.name}</div>
                <div className="text-sm text-muted-foreground">{customer.type === "company" ? "Kurumsal Müşteri" : "Bireysel Müşteri"}</div>
              </div>
              <div className="shrink-0"><StatusBadge status={customer.status} /></div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row icon={<Building2 className="size-4" />} label="VKN" value={customer.taxNumber} />
            <Row icon={<Phone className="size-4" />} label="Telefon" value={customer.phone} />
            <Row icon={<Mail className="size-4" />} label="E-posta" value={customer.email} />
            {companyAddresses.length > 0 && (
              <section className="overflow-hidden rounded-lg border border-border/60" aria-label="Firma adresleri">
                <div className="flex items-center justify-between border-b border-border/60 bg-muted/30 px-3 py-2">
                  <div className="flex items-center gap-2 text-xs font-semibold">
                    <MapPin className="size-3.5 text-primary" /> Adresler
                  </div>
                  <span className="text-[11px] tabular-nums text-muted-foreground">{companyAddresses.length} kayıt</span>
                </div>
                <ul className="divide-y divide-border/50">
                  {companyAddresses.map((address, index) => (
                    <li key={address.id ?? index} className="px-3 py-2.5">
                      <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        <span className="font-medium">{ADDRESS_TYPE_LABELS[address.addressType] ?? "Adres"}</span>
                        {address.isDefault && <span className="text-[10px] font-medium text-primary">Ana adres</span>}
                        {address.isShipping && <span className="text-[10px] font-medium text-sky-700">Sevkiyat</span>}
                        {address.isBilling && <span className="text-[10px] font-medium text-amber-700">Fatura</span>}
                      </div>
                      <div className="mt-0.5 break-words text-xs leading-relaxed text-muted-foreground">
                        {[address.address, address.district, address.city, address.country].filter(Boolean).join(", ") || "Adres bilgisi yok"}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <div className="pt-3 border-t">
              <div className="text-xs uppercase text-muted-foreground mb-1">İletişim Kişisi</div>
              <div>{customer.contactPerson}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-muted-foreground mb-1">Talep Edilen Ürün</div>
              <div>{customer.wantedProduct}</div>
            </div>
            <section className="overflow-hidden rounded-lg border border-amber-200/80 bg-amber-50/45" aria-label="Firma notları">
              <div className="flex items-center gap-2 border-b border-amber-200/70 bg-amber-50/70 px-3 py-2 text-xs font-semibold text-amber-950">
                <NotebookText className="size-3.5 text-amber-700" />
                Firma Notları
              </div>
              <div className={`max-h-40 overflow-y-auto whitespace-pre-wrap break-words px-3 py-2.5 text-sm leading-relaxed ${customer.initialNote?.trim() ? "text-foreground" : "text-muted-foreground"}`}>
                {customer.initialNote?.trim() || "Bu firma için henüz not eklenmemiş."}
              </div>
            </section>
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
                <CardHeader className="flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
                  <CardTitle className="font-display text-xl font-semibold">Satış Kartları</CardTitle>
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
                <CardHeader className="flex flex-col items-stretch justify-between gap-3 pb-3 sm:flex-row sm:items-center">
                  <CardTitle className="font-display text-xl font-semibold">Aktiviteler</CardTitle>
                  <div className="flex flex-wrap items-center gap-2">
                    <LogActivityDialog
                      customerId={customer.id}
                      defaultKind="customer_visit"
                      trigger={<Button size="sm" variant="outline" className="gap-1"><Plus className="size-4" /> Müşteri Ziyareti</Button>}
                    />
                    <LogActivityDialog
                      customerId={customer.id}
                      defaultKind="outgoing_call"
                      trigger={<Button size="sm" variant="outline" className="gap-1"><Phone className="size-4" /> Giden Arama</Button>}
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
