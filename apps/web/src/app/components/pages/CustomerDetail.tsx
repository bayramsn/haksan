import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { ArrowLeft, Phone, Mail, MapPin, Building2, Plus } from "lucide-react";
import { Customer, salesCases, activities, payments, machines } from "../../lib/mock";
import { StatusBadge } from "../Layout";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";

export function CustomerDetailPage({ customer, onBack }: { customer: Customer; onBack: () => void }) {
  const cases = salesCases.filter((s) => s.customerId === customer.id);
  const acts = activities.filter((a) => a.customerId === customer.id);
  const pays = payments.filter((p) => p.customerId === customer.id);
  const mcs = machines.filter((m) => m.customerId === customer.id);

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
          </CardContent>
        </Card>

        <div className="lg:col-span-2">
          <Tabs defaultValue="cases">
            <TabsList>
              <TabsTrigger value="cases">Satış Kartları ({cases.length})</TabsTrigger>
              <TabsTrigger value="activity">Aktivite ({acts.length})</TabsTrigger>
              <TabsTrigger value="payments">Cari ({pays.length})</TabsTrigger>
              <TabsTrigger value="machines">Makineler ({mcs.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="cases" className="mt-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>Satış Kartları</CardTitle>
                  <Button size="sm" className="gap-1"><Plus className="size-4" /> Yeni Kart</Button>
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
                <CardContent className="p-6">
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

            <TabsContent value="payments" className="mt-4">
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tip</TableHead>
                      <TableHead>Tutar</TableHead>
                      <TableHead>Vade</TableHead>
                      <TableHead>Durum</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pays.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>{p.paymentType === "received" ? "Tahsilat" : "Beklenen"}</TableCell>
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

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="text-muted-foreground mt-0.5">{icon}</div>
      <div className="flex-1">
        <div className="text-xs uppercase text-muted-foreground">{label}</div>
        <div>{value}</div>
      </div>
    </div>
  );
}
