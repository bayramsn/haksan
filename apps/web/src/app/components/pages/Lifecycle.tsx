import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Copy, ExternalLink, FileText, QrCode, Radar, RefreshCw, ShieldCheck, Wrench } from "lucide-react";
import { toast } from "sonner";
import { lifecycleService } from "../../../lib/services";
import { useStore } from "../../lib/store";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Checkbox } from "../ui/checkbox";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Textarea } from "../ui/textarea";

const NONE = "__none__";

const money = (value: number, currency = "USD") =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(value ?? 0));

const date = (value?: string | null) => (value ? new Date(value).toLocaleDateString("tr-TR") : "-");

const signalLabel: Record<string, string> = {
  open_service: "Açık servis",
  critical_service: "Kritik servis",
  warranty_expired: "Garanti bitti",
  warranty_expiring: "Garanti bitiyor",
  maintenance_due: "Bakım zamanı",
  repeated_failure: "Tekrarlayan arıza",
  low_margin: "Kârsız servis",
};

function fullPublicUrl(path: string) {
  return `${window.location.origin}${path}`;
}

function qrUrl(url: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=360x360&margin=16&data=${encodeURIComponent(url)}`;
}

export function LifecyclePage() {
  const { customers, products } = useStore();
  const [loading, setLoading] = useState(false);
  const [passports, setPassports] = useState<any[]>([]);
  const [latestLink, setLatestLink] = useState<string | null>(null);
  const [radar, setRadar] = useState<any | null>(null);
  const [productId, setProductId] = useState<string>("");
  const [companyId, setCompanyId] = useState<string>("");
  const [inventoryItemId, setInventoryItemId] = useState<string>(NONE);
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [includeInstallation, setIncludeInstallation] = useState(true);
  const [includeLogistics, setIncludeLogistics] = useState(true);
  const [preview, setPreview] = useState<any | null>(null);
  const [creatingQuote, setCreatingQuote] = useState(false);

  useEffect(() => {
    if (!productId && products[0]?.id) setProductId(products[0].id);
    if (!companyId && customers[0]?.id) setCompanyId(customers[0].id);
  }, [products, customers, productId, companyId]);

  const loadLifecycle = async () => {
    setLoading(true);
    try {
      const [passportRows, radarRows] = await Promise.allSettled([lifecycleService.passports(), lifecycleService.serviceRadar()]);
      if (passportRows.status === "fulfilled") setPassports(passportRows.value);
      if (radarRows.status === "fulfilled") setRadar(radarRows.value);
      if (passportRows.status === "rejected" && radarRows.status === "rejected") {
        toast.error("Pasaport ve radar verisi alınamadı", { description: passportRows.reason?.message ?? radarRows.reason?.message });
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLifecycle();
  }, []);

  useEffect(() => {
    if (!productId) return;
    let cancelled = false;
    lifecycleService
      .cpqPreview({
        companyId: companyId || undefined,
        productModelId: productId,
        inventoryItemId: inventoryItemId === NONE ? undefined : inventoryItemId,
        selectedOptionValueIds: selectedOptions,
        includeInstallation,
        includeLogistics,
      })
      .then((res) => {
        if (!cancelled) setPreview(res);
      })
      .catch((err: any) => {
        if (!cancelled) {
          setPreview(null);
          toast.error("CPQ önizleme oluşturulamadı", { description: err?.message });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [productId, companyId, inventoryItemId, selectedOptions, includeInstallation, includeLogistics]);

  const publish = async (device: any) => {
    try {
      const result = await lifecycleService.publishPassport(device.id, {
        publicTitle: [device.brand?.name, device.product?.modelName ?? device.product?.fullName, device.serialNumber].filter(Boolean).join(" "),
      });
      const url = fullPublicUrl(result.publicPath);
      setLatestLink(url);
      await navigator.clipboard?.writeText(url);
      toast.success("Pasaport yayında", { description: "Public link panoya kopyalandı." });
      loadLifecycle();
    } catch (err: any) {
      toast.error("Pasaport yayınlanamadı", { description: err?.message });
    }
  };

  const rotate = async (passportId: string) => {
    try {
      const result = await lifecycleService.rotatePassport(passportId);
      const url = fullPublicUrl(result.publicPath);
      setLatestLink(url);
      await navigator.clipboard?.writeText(url);
      toast.success("Token yenilendi", { description: "Yeni public link panoya kopyalandı." });
      loadLifecycle();
    } catch (err: any) {
      toast.error("Token yenilenemedi", { description: err?.message });
    }
  };

  const revoke = async (passportId: string) => {
    try {
      await lifecycleService.revokePassport(passportId);
      toast.success("Pasaport yayından kaldırıldı");
      loadLifecycle();
    } catch (err: any) {
      toast.error("Pasaport kapatılamadı", { description: err?.message });
    }
  };

  const toggleOption = (id: string, checked: boolean) => {
    setSelectedOptions((current) => (checked ? Array.from(new Set([...current, id])) : current.filter((x) => x !== id)));
  };

  const createQuote = async () => {
    if (!companyId || !productId) {
      toast.error("Firma ve ürün modeli seçilmeli.");
      return;
    }
    setCreatingQuote(true);
    try {
      const result = await lifecycleService.cpqCreateQuote({
        companyId,
        productModelId: productId,
        inventoryItemId: inventoryItemId === NONE ? undefined : inventoryItemId,
        selectedOptionValueIds: selectedOptions,
        includeInstallation,
        includeLogistics,
      });
      toast.success("Teklif oluşturuldu", { description: result.quote?.documentNo });
    } catch (err: any) {
      toast.error("Teklif oluşturulamadı", { description: err?.message });
    } finally {
      setCreatingQuote(false);
    }
  };

  const selectedProduct = useMemo(() => products.find((p) => p.id === productId), [products, productId]);

  return (
    <Tabs defaultValue="passports" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TabsList>
          <TabsTrigger value="passports"><QrCode className="size-4" /> Dijital Pasaport</TabsTrigger>
          <TabsTrigger value="cpq"><FileText className="size-4" /> CPQ</TabsTrigger>
          <TabsTrigger value="radar"><Radar className="size-4" /> Servis Radarı</TabsTrigger>
        </TabsList>
        <Button variant="outline" size="sm" onClick={loadLifecycle} disabled={loading} className="gap-2">
          <RefreshCw className="size-4" /> Yenile
        </Button>
      </div>

      {latestLink ? (
        <Card className="rounded-lg border-primary/20 bg-primary/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div className="min-w-0">
              <div className="text-sm font-medium">Son oluşturulan public pasaport linki</div>
              <div className="truncate text-sm text-muted-foreground">{latestLink}</div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => navigator.clipboard?.writeText(latestLink)}><Copy className="size-4" /></Button>
              <Button variant="outline" size="sm" onClick={() => window.open(qrUrl(latestLink), "_blank", "noopener")}><QrCode className="size-4" /> QR</Button>
              <Button size="sm" onClick={() => window.open(latestLink, "_blank", "noopener")}><ExternalLink className="size-4" /> Aç</Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <TabsContent value="passports">
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Seri numarası bazlı pasaportlar</CardTitle>
            <CardDescription>Yayınlanan pasaport sadece müşteri deneyimi verisini gösterir; fiyat, finans ve iç notlar public payload’a girmez.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Makine</TableHead>
                  <TableHead>Firma</TableHead>
                  <TableHead>Garanti</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead className="text-right">İşlem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {passports.map((item) => {
                  const active = item.passport?.publishedAt && !item.passport?.revokedAt;
                  return (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="font-medium">{[item.brand?.name, item.product?.modelName ?? item.product?.fullName].filter(Boolean).join(" ") || "-"}</div>
                        <div className="text-xs text-muted-foreground">Seri: {item.serialNumber ?? "-"}</div>
                      </TableCell>
                      <TableCell>
                        <div>{item.company?.shortName ?? item.company?.legalTitle ?? "-"}</div>
                        <div className="text-xs text-muted-foreground">{[item.address?.district, item.address?.province].filter(Boolean).join(" / ")}</div>
                      </TableCell>
                      <TableCell>{date(item.warrantyEndDate)}</TableCell>
                      <TableCell>
                        <Badge variant={active ? "default" : "secondary"}>{active ? "Yayında" : item.passport ? "Kapalı" : "Hazır değil"}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => publish(item)}>{item.passport ? "Yayına al" : "Yayınla"}</Button>
                          {item.passport ? <Button size="sm" variant="outline" onClick={() => rotate(item.passport.id)}>Token yenile</Button> : null}
                          {active ? <Button size="sm" variant="ghost" onClick={() => revoke(item.passport.id)}>Kapat</Button> : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!passports.length ? (
                  <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Kurulu makine bulunamadı.</TableCell></TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="cpq">
        <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle>Konfigürasyon sihirbazı</CardTitle>
              <CardDescription>Model, opsiyon, stok seri no ve operasyon kalemlerinden teklif taslağı üretir.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Firma</label>
                <Select value={companyId || NONE} onValueChange={(v) => setCompanyId(v === NONE ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Firma seç" /></SelectTrigger>
                  <SelectContent>
                    {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Ürün modeli</label>
                <Select value={productId || NONE} onValueChange={(v) => { setProductId(v === NONE ? "" : v); setSelectedOptions([]); setInventoryItemId(NONE); }}>
                  <SelectTrigger><SelectValue placeholder="Model seç" /></SelectTrigger>
                  <SelectContent>
                    {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.brand} {p.modelName ?? p.model}</SelectItem>)}
                  </SelectContent>
                </Select>
                {selectedProduct ? <div className="text-xs text-muted-foreground">{selectedProduct.shortDescription}</div> : null}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Stoktaki seri no</label>
                <Select value={inventoryItemId} onValueChange={setInventoryItemId}>
                  <SelectTrigger><SelectValue placeholder="Seri no seç" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Seri no bağlama</SelectItem>
                    {(preview?.availableSerials ?? []).map((item: any) => (
                      <SelectItem key={item.id} value={item.id}>{item.serialNumber} · {item.status?.name ?? item.status?.code ?? "stok"}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="flex items-center gap-2 rounded-md border p-3 text-sm">
                  <Checkbox checked={includeInstallation} onCheckedChange={(v) => setIncludeInstallation(Boolean(v))} />
                  Kurulum
                </label>
                <label className="flex items-center gap-2 rounded-md border p-3 text-sm">
                  <Checkbox checked={includeLogistics} onCheckedChange={(v) => setIncludeLogistics(Boolean(v))} />
                  Lojistik
                </label>
              </div>
              <Button className="w-full gap-2" onClick={createQuote} disabled={creatingQuote || !preview}>
                <FileText className="size-4" /> Teklif üret
              </Button>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card className="rounded-lg">
              <CardHeader>
                <CardTitle>Uyumlu opsiyonlar</CardTitle>
                <CardDescription>Kural motoru `requires`, `excludes`, `recommended`, `compatible` sinyallerini bu seçimler üzerinden üretir.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {(preview?.optionSets ?? []).map((set: any) => (
                  <div key={set.id} className="space-y-2">
                    <div className="text-sm font-medium">{set.name}</div>
                    <div className="grid gap-2 md:grid-cols-2">
                      {set.values.map((value: any) => (
                        <label key={value.id} className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
                          <span className="flex min-w-0 items-center gap-2">
                            <Checkbox checked={selectedOptions.includes(value.id)} onCheckedChange={(v) => toggleOption(value.id, Boolean(v))} />
                            <span className="truncate">{value.value}</span>
                          </span>
                          <span className="shrink-0 text-xs text-muted-foreground">{money(value.priceDelta, value.currencyCode)}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
                {preview?.warnings?.length ? (
                  <div className="space-y-2">
                    {preview.warnings.map((warning: any, idx: number) => (
                      <div key={idx} className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                        <div>{warning.message}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex gap-2 rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> Aktif kural uyarısı yok.
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-lg">
              <CardHeader>
                <CardTitle>Fiyat dökümü</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Kalem</TableHead>
                      <TableHead className="text-right">Tutar</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(preview?.lines ?? []).map((line: any, idx: number) => (
                      <TableRow key={idx}>
                        <TableCell>{line.description}</TableCell>
                        <TableCell className="text-right">{money(line.quantity * line.unitPrice, preview?.totals?.currencyCode)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow>
                      <TableCell className="font-medium">Genel toplam</TableCell>
                      <TableCell className="text-right font-semibold">{money(preview?.totals?.grandTotal ?? 0, preview?.totals?.currencyCode)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </div>
      </TabsContent>

      <TabsContent value="radar">
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          {[
            ["Makine", radar?.summary?.machineCount ?? 0],
            ["Açık servis", radar?.summary?.openServiceCount ?? 0],
            ["Kritik", radar?.summary?.criticalMachineCount ?? 0],
            ["Garanti bitiyor", radar?.summary?.warrantyExpiringCount ?? 0],
            ["Bakım zamanı", radar?.summary?.maintenanceDueCount ?? 0],
            ["Kârsız", radar?.summary?.lowMarginCount ?? 0],
          ].map(([label, value]) => (
            <Card key={label} className="rounded-lg">
              <CardContent className="py-4">
                <div className="text-xs text-muted-foreground">{label}</div>
                <div className="mt-1 text-2xl font-semibold">{value}</div>
              </CardContent>
            </Card>
          ))}
        </div>
        <Card className="mt-4 rounded-lg">
          <CardHeader>
            <CardTitle>Kurulu makine radar listesi</CardTitle>
            <CardDescription>Firma haritası için aynı cihaz/firma/adres bağlamı kullanılabilir.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Makine</TableHead>
                  <TableHead>Firma</TableHead>
                  <TableHead>Sinyaller</TableHead>
                  <TableHead>Servis</TableHead>
                  <TableHead className="text-right">Marj</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(radar?.items ?? []).map((item: any) => (
                  <TableRow key={item.deviceId}>
                    <TableCell>
                      <div className="font-medium">{[item.machine?.brand, item.machine?.model].filter(Boolean).join(" ") || "-"}</div>
                      <div className="text-xs text-muted-foreground">Seri: {item.machine?.serialNumber ?? "-"}</div>
                    </TableCell>
                    <TableCell>
                      <div>{item.company?.shortName ?? item.company?.legalTitle ?? "-"}</div>
                      <div className="text-xs text-muted-foreground">{[item.address?.district, item.address?.province].filter(Boolean).join(" / ")}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex max-w-[360px] flex-wrap gap-1">
                        {item.signals.length ? item.signals.map((signal: string) => (
                          <Badge key={signal} variant={signal.includes("critical") || signal.includes("expired") ? "destructive" : "secondary"}>{signalLabel[signal] ?? signal}</Badge>
                        )) : <span className="text-sm text-muted-foreground">Sinyal yok</span>}
                      </div>
                    </TableCell>
                    <TableCell>{item.openTicketCount} açık / {item.ticketCount} toplam</TableCell>
                    <TableCell className="text-right">{money(item.serviceMargin, "USD")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}

export function PublicPassportPage({ slug, token }: { slug: string; token: string }) {
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState("normal");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    lifecycleService
      .publicPassport(slug, token)
      .then(setData)
      .catch((err: any) => toast.error("Pasaport açılamadı", { description: err?.message }))
      .finally(() => setLoading(false));
  }, [slug, token]);

  const submitTicket = async () => {
    if (!subject.trim()) {
      toast.error("Konu girilmeli.");
      return;
    }
    setSubmitting(true);
    try {
      const ticket = await lifecycleService.publicServiceTicket(slug, token, { subject, description, severity });
      toast.success("Servis talebi alındı", { description: ticket.ticketNo });
      setSubject("");
      setDescription("");
      lifecycleService.publicPassport(slug, token).then(setData);
    } catch (err: any) {
      toast.error("Servis talebi açılamadı", { description: err?.message });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="grid min-h-screen place-items-center bg-[#f7f7f8] text-muted-foreground">Pasaport yükleniyor...</div>;
  if (!data) return <div className="grid min-h-screen place-items-center bg-[#f7f7f8] text-muted-foreground">Pasaport bulunamadı.</div>;

  return (
    <div className="min-h-screen bg-[#f7f7f8] text-foreground">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
          <img src="/brand/haksan-logo.png" alt="Haksan Makina" className="h-9 w-auto" />
          <Badge variant="secondary"><ShieldCheck className="mr-1 size-3.5" /> Dijital Makine Pasaportu</Badge>
        </div>
      </header>
      <main className="mx-auto grid max-w-6xl gap-4 px-4 py-6 lg:grid-cols-[1fr_360px]">
        <section className="space-y-4">
          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle className="text-2xl">{data.passport?.title ?? "Makine Pasaportu"}</CardTitle>
              <CardDescription>{data.company?.shortName ?? data.company?.legalTitle}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {[
                ["Marka", data.machine?.brand],
                ["Model", data.machine?.modelName ?? data.machine?.modelCode],
                ["Seri No", data.machine?.serialNumber],
                ["Kontrol Ünitesi", data.machine?.controlUnit],
                ["Kurulum", date(data.machine?.installationDate)],
                ["Garanti Bitiş", date(data.machine?.warrantyEndDate)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-md border bg-muted/20 p-3">
                  <div className="text-xs text-muted-foreground">{label}</div>
                  <div className="mt-1 font-medium">{value || "-"}</div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle>Bakım ve servis geçmişi</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {data.maintenanceEvents?.map((event: any) => (
                  <div key={event.id} className="flex gap-3 rounded-md border p-3">
                    <Wrench className="mt-1 size-4 text-muted-foreground" />
                    <div>
                      <div className="font-medium">{event.title}</div>
                      <div className="text-sm text-muted-foreground">{date(event.eventDate)}{event.nextDueDate ? ` · Sonraki: ${date(event.nextDueDate)}` : ""}</div>
                    </div>
                  </div>
                ))}
                {!data.maintenanceEvents?.length ? <div className="text-sm text-muted-foreground">Kayıtlı bakım olayı yok.</div> : null}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle>Dokümanlar ve önerilen yedek parçalar</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                {(data.documents ?? []).map((doc: any) => (
                  <div key={doc.id} className="rounded-md border p-3 text-sm">{doc.title}<div className="text-xs text-muted-foreground">{doc.filename}</div></div>
                ))}
                {!data.documents?.length ? <div className="text-sm text-muted-foreground">Public doküman eklenmemiş.</div> : null}
              </div>
              <div className="space-y-2">
                {(data.sparePartRecommendations ?? []).map((part: string) => (
                  <div key={part} className="rounded-md border p-3 text-sm">{part}</div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>

        <aside className="space-y-4">
          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle>Servis talebi aç</CardTitle>
              <CardDescription>Talep doğrudan bu makinenin servis kaydına bağlanır.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Konu" />
              <Select value={severity} onValueChange={setSeverity}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Düşük</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">Yüksek</SelectItem>
                  <SelectItem value="critical">Kritik</SelectItem>
                </SelectContent>
              </Select>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Açıklama" rows={5} />
              <Button className="w-full" onClick={submitTicket} disabled={submitting}>Talebi gönder</Button>
            </CardContent>
          </Card>

          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle>Açık servisler</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(data.serviceTickets ?? []).map((ticket: any) => (
                <div key={ticket.id} className="rounded-md border p-3 text-sm">
                  <div className="font-medium">{ticket.subject}</div>
                  <div className="text-xs text-muted-foreground">{ticket.ticketNo} · {ticket.status?.name ?? ticket.status?.code ?? "-"}</div>
                </div>
              ))}
              {!data.serviceTickets?.length ? <div className="text-sm text-muted-foreground">Servis talebi yok.</div> : null}
            </CardContent>
          </Card>
        </aside>
      </main>
    </div>
  );
}
