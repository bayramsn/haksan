import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import {
  Building2, BriefcaseBusiness, Download, ExternalLink, FileSignature, FileText, Link2, Loader2, Printer, Receipt,
} from "lucide-react";
import { useStore } from "../../lib/store";
import type { DocumentItem } from "../../lib/mock";
import {
  loadContractPrintData, loadProformaPrintData,
  type ContractPrintData, type ProformaPrintData,
} from "../../lib/print";
import { formatCurrency } from "../../lib/pageHelpers";
import { useCompanyDetail } from "../../lib/companyServerData";
import { contactQueryKeys, loadAllCompanyContacts, type ContactQueryScope } from "../../lib/contactServerData";
import { useAuth } from "../../../lib/auth";

const TYPE_META: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  Proforma: { label: "Proforma", icon: FileText },
  Contract: { label: "Sözleşme", icon: FileSignature },
  CommercialInvoice: { label: "Ticari Fatura", icon: Receipt },
};

/**
 * Proforma / sözleşme / ticari fatura kaydının içeriğini pop-up olarak gösterir.
 * İçerik, bağlı teklif ve firma verisinden (yazdırılacak belgeyle aynı kaynak)
 * canlı çözülür — yalnızca meta veri değil, gerçek belge içeriği görüntülenir.
 */
export function DocumentDetailDialog({
  doc,
  onClose,
  onPrint,
  onDownload,
  onOpenFile,
  onOpenOpportunity,
  onOpenOffer,
  onOpenCustomer,
}: {
  doc: DocumentItem | null;
  onClose: () => void;
  onPrint?: (d: DocumentItem) => void;
  onDownload?: (d: DocumentItem) => void;
  onOpenFile?: (d: DocumentItem) => void;
  onOpenOpportunity?: (salesCaseId: string) => void;
  onOpenOffer?: (query: string) => void;
  onOpenCustomer?: (customerId: string) => void;
}) {
  const { customers, cases, offers, products, contacts, payments, users } = useStore();
  const { user, tenant, activeDivision, activeDepartment } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proforma, setProforma] = useState<ProformaPrintData | null>(null);
  const [contract, setContract] = useState<ContractPrintData | null>(null);
  const sourceCase = doc ? cases.find((salesCase) => salesCase.id === doc.salesCaseId) ?? null : null;
  const sourceOffer = doc?.quoteId
    ? offers.find((offer) => offer.id === doc.quoteId) ?? null
    : offers.filter((offer) => offer.salesCaseId === sourceCase?.id).sort((left, right) => right.revision - left.revision)[0] ?? null;
  const sourceCompanyId = doc ? (doc.companyId || sourceOffer?.companyId || sourceCase?.customerId || "") : "";
  const storedSourceCompany = customers.find((customer) => customer.id === sourceCompanyId) ?? null;
  const snapshotProtected = Boolean(doc?.documentSnapshot);
  const sourceCompanyQuery = useCompanyDetail(
    snapshotProtected ? null : sourceCompanyId,
    storedSourceCompany ?? undefined,
  );
  const sourceCompany = sourceCompanyQuery.data ?? storedSourceCompany;
  const contactScope = useMemo<ContactQueryScope>(() => ({
    tenantId: tenant?.id ?? user?.tenantId ?? "anonymous",
    userId: user?.id ?? "anonymous",
    activeDivision,
    activeDepartment,
  }), [activeDepartment, activeDivision, tenant?.id, user?.id, user?.tenantId]);
  const needsLiveContacts = Boolean(doc && !snapshotProtected && doc.type !== "Contract" && sourceCompanyId);
  const sourceContactsQuery = useQuery({
    queryKey: contactQueryKeys.companyContacts(contactScope, sourceCompanyId || "none"),
    queryFn: ({ signal }) => loadAllCompanyContacts(sourceCompanyId, signal),
    enabled: needsLiveContacts,
    staleTime: 60_000,
  });

  useEffect(() => {
    let alive = true;
    setProforma(null);
    setContract(null);
    setError(null);
    setLoading(Boolean(doc));
    if (!doc) return;
    if (!snapshotProtected && sourceCompanyId && sourceCompanyQuery.isPending) return;
    if (needsLiveContacts && sourceContactsQuery.isPending) return;
    void (async () => {
      try {
        const hydratedCustomers = sourceCompany
          ? [sourceCompany, ...customers.filter((customer) => customer.id !== sourceCompany.id)]
          : customers;
        const remoteContacts = sourceContactsQuery.data?.data ?? [];
        const remoteContactIds = new Set(remoteContacts.map((contact) => contact.id));
        const hydratedContacts = [
          ...remoteContacts,
          ...contacts.filter((contact) => !remoteContactIds.has(contact.id)),
        ];
        if (doc.type === "Contract") {
          const initialSc = cases.find((s) => s.id === doc.salesCaseId) ?? null;
          const offer = doc.quoteId
            ? offers.find((o) => o.id === doc.quoteId) ?? null
            : offers
                .filter((o) => (initialSc && o.salesCaseId === initialSc.id) || (doc.companyId && o.companyId === doc.companyId))
                .sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
          const sc = initialSc ?? cases.find((s) => s.id === offer?.salesCaseId) ?? null;
          const cust = hydratedCustomers.find((c) => c.id === (doc.companyId || offer?.companyId || sc?.customerId)) ?? null;
          if (!sc) throw new Error("Bağlı satış kartı bulunamadı.");
          const data = await loadContractPrintData({
            customer: cust,
            salesCase: sc,
            offer,
            products,
            payments,
            contractDate: doc.uploadedAt || new Date().toISOString().slice(0, 10),
            contractNo: doc.fileName,
            documentSnapshot: doc.documentSnapshot,
            users,
          });
          if (alive) setContract(data);
        } else {
          const data = await loadProformaPrintData({
            doc,
            customers: hydratedCustomers,
            cases,
            offers,
            products,
            contacts: hydratedContacts,
            users,
            variantKey: "",
          });
          if (alive) setProforma(data);
        }
      } catch (e: any) {
        if (alive) setError(e?.message ?? "Belge içeriği yüklenemedi.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [
    cases,
    contacts,
    customers,
    doc,
    needsLiveContacts,
    offers,
    payments,
    products,
    snapshotProtected,
    sourceCompany,
    sourceCompanyId,
    sourceCompanyQuery.isPending,
    sourceContactsQuery.data,
    sourceContactsQuery.isPending,
    users,
  ]);

  const meta = doc ? TYPE_META[doc.type] ?? { label: doc.type, icon: FileText } : null;
  const Icon = meta?.icon ?? FileText;
  const sourceCompanyName = sourceCompany?.name || doc?.companyNameText || sourceCase?.leadCompanyTitle || "";

  return (
    <Dialog open={!!doc} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[min(880px,calc(100vw-2rem))] max-w-none sm:max-w-none max-h-[90dvh] grid-rows-[auto_1fr_auto] overflow-hidden p-0 gap-0">
        {doc && (
          <>
            <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/60">
              <div className="flex items-start gap-3">
                <div className="size-11 rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 text-primary grid place-items-center shrink-0">
                  <Icon className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <DialogTitle className="text-lg truncate">{doc.fileName}</DialogTitle>
                  <DialogDescription className="mt-1">
                    {meta?.label}
                    {doc.uploadedAt ? ` · ${doc.uploadedAt}` : ""}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="min-h-0 overflow-y-auto px-6 py-5">
              <div className="mb-4 rounded-lg border border-primary/15 bg-primary/[0.035] p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 font-data text-[9px] font-semibold uppercase tracking-[0.14em] text-primary"><Link2 className="size-3" /> Kaynak kayıt</div>
                    <div className="mt-1 truncate text-xs text-muted-foreground">
                      {sourceOffer ? `${sourceOffer.quoteNo} · R${sourceOffer.revision}` : sourceCase ? `Fırsat #${sourceCase.id.slice(0, 8).toUpperCase()}` : sourceCompanyName || "Bağlantı bulunamadı"}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {sourceOffer && onOpenOffer && <Button variant="outline" size="sm" className="h-7 px-2 text-[10px]" onClick={() => { onClose(); onOpenOffer(sourceOffer.quoteNo); }}><FileText className="mr-1 size-3" /> Teklif</Button>}
                    {sourceCase && onOpenOpportunity && <Button variant="outline" size="sm" className="h-7 px-2 text-[10px]" onClick={() => { onClose(); onOpenOpportunity(sourceCase.id); }}><BriefcaseBusiness className="mr-1 size-3" /> Fırsat</Button>}
                    {sourceCompanyId && onOpenCustomer && <Button variant="outline" size="sm" className="h-7 px-2 text-[10px]" onClick={() => { onClose(); onOpenCustomer(sourceCompanyId); }}><Building2 className="mr-1 size-3" /> Firma</Button>}
                  </div>
                </div>
              </div>
              {loading && (
                <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> İçerik yükleniyor…
                </div>
              )}
              {!loading && error && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-6 text-center text-sm text-amber-800">
                  {error}
                </div>
              )}
              {!loading && !error && proforma && <ProformaContent data={proforma} />}
              {!loading && !error && contract && <ContractContent data={contract} />}
            </div>

            <DialogFooter className="px-6 py-3 border-t border-border/60 bg-muted/20 flex-row flex-wrap items-center justify-end gap-2">
              {onPrint && (
                <Button variant="outline" size="sm" className="h-9 gap-1" onClick={() => onPrint(doc)}>
                  <Printer className="size-4" /> Yazdır / PDF
                </Button>
              )}
              {onDownload && (
                <Button variant="outline" size="sm" className="h-9 gap-1" onClick={() => onDownload(doc)}>
                  <Download className="size-4" /> İndir
                </Button>
              )}
              {doc.fileId && onOpenFile && (
                <Button variant="outline" size="sm" className="h-9 gap-1" onClick={() => onOpenFile(doc)}>
                  <ExternalLink className="size-4" /> Yüklenen dosya
                </Button>
              )}
              <Button variant="outline" size="sm" className="h-9 ml-auto sm:ml-2" onClick={onClose}>Kapat</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function InfoRow({ label, value }: { label: string; value?: React.ReactNode }) {
  if (!value) return null;
  return (
    <div className="grid grid-cols-[110px_1fr] gap-3 text-sm">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="min-w-0 break-words">{value}</div>
    </div>
  );
}

function CustomerCard({
  firma,
  adres,
  vergiDairesi,
  vergiNo,
  tel,
  faks,
  ilgili,
}: {
  firma?: string;
  adres?: string;
  vergiDairesi?: string;
  vergiNo?: string;
  tel?: string;
  faks?: string;
  ilgili?: string;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-white p-4">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-3">Müşteri</div>
      <div className="flex items-start gap-3">
        <div className="size-9 rounded-lg bg-muted text-primary grid place-items-center shrink-0">
          <Building2 className="size-4" />
        </div>
        <div className="min-w-0 space-y-1.5">
          <div className="text-sm font-medium break-words">{firma || "Müşteri bulunamadı"}</div>
          <InfoRow label="İlgili" value={ilgili} />
          <InfoRow label="Adres" value={adres} />
          <InfoRow label="Vergi Dairesi" value={vergiDairesi} />
          <InfoRow label="Vergi No" value={vergiNo} />
          <InfoRow label="Telefon" value={tel} />
          <InfoRow label="Faks" value={faks} />
        </div>
      </div>
    </div>
  );
}

function ProformaContent({ data }: { data: ProformaPrintData }) {
  const araToplam = data.items.reduce((sum, it) => sum + Number(it.tutar ?? 0), 0);
  const genelToplam = araToplam + Number(data.kdvTutar ?? 0);
  const fmt = (n?: number | null) => (n == null ? "—" : formatCurrency(Number(n), data.currency));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <CustomerCard
          firma={data.firma}
          ilgili={data.ilgili}
          adres={data.adres}
          vergiDairesi={data.vergiDairesi}
          vergiNo={data.vergiNo}
          tel={data.tel}
          faks={data.faks}
        />
        <div className="rounded-lg border border-border/60 bg-white p-4 space-y-1.5">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Belge</div>
          <InfoRow label="Belge No" value={data.belgeNo} />
          <InfoRow label="Tarih" value={data.tarih} />
          <InfoRow label="Para Birimi" value={data.currency} />
          <InfoRow label="KDV Oranı" value={`%${data.kdvOran}`} />
        </div>
      </div>

      <div className="rounded-lg border border-border/60 overflow-hidden">
        <Table className="min-w-[560px]">
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead>Açıklama</TableHead>
              <TableHead>Birim</TableHead>
              <TableHead className="text-right">Birim Fiyat</TableHead>
              <TableHead className="text-right">İskonto</TableHead>
              <TableHead className="text-right">Tutar</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((it, i) => (
              <TableRow key={i}>
                <TableCell className="text-sm">
                  <div className="break-words">{it.aciklama}</div>
                  {(it.marka || it.mensei || it.gtip) && (
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {[it.marka, it.mensei, it.gtip && `GTİP ${it.gtip}`].filter(Boolean).join(" · ")}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-sm tabular-nums text-muted-foreground">{it.birim}</TableCell>
                <TableCell className="text-right text-sm tabular-nums">{fmt(it.birimFiyati)}</TableCell>
                <TableCell className="text-right text-sm tabular-nums">{it.iskonto ? fmt(it.iskonto) : "—"}</TableCell>
                <TableCell className="text-right text-sm tabular-nums">{fmt(it.tutar)}</TableCell>
              </TableRow>
            ))}
            {data.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-6 text-sm text-muted-foreground">Kalem yok.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex justify-end">
        <div className="w-full sm:w-72 space-y-1.5 rounded-lg border border-border/60 bg-muted/20 p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Ara Toplam</span>
            <span className="tabular-nums">{fmt(araToplam)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">KDV (%{data.kdvOran})</span>
            <span className="tabular-nums">{fmt(data.kdvTutar)}</span>
          </div>
          <div className="flex items-center justify-between text-sm font-medium border-t border-border/60 pt-1.5">
            <span>Genel Toplam</span>
            <span className="tabular-nums text-emerald-600">{fmt(genelToplam)}</span>
          </div>
        </div>
      </div>

      {data.notlar.length > 0 && (
        <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Notlar / Şartlar</div>
          <ul className="space-y-1 text-sm text-foreground/85">
            {data.notlar.map((n, i) => (
              <li key={i} className="break-words">{n}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ContractContent({ data }: { data: ContractPrintData }) {
  const fmt = (n?: number | null) => (n == null ? "—" : formatCurrency(Number(n), data.currency));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <CustomerCard
          firma={data.alici.unvan}
          ilgili={data.alici.yetkili}
          adres={data.alici.adres}
          vergiDairesi={data.alici.vergiDairesi}
          vergiNo={data.alici.vergiNo}
          tel={data.alici.tel}
          faks={data.alici.faks}
        />
        <div className="rounded-lg border border-border/60 bg-white p-4 space-y-1.5">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Sözleşme</div>
          <InfoRow label="Model" value={data.model} />
          <InfoRow label="Adet" value={String(data.adet)} />
          <InfoRow label="Teslim Ayı" value={data.teslimAyi} />
          <InfoRow label="Teslim Şekli" value={data.teslimSekli} />
          <InfoRow label="Sözleşme Tarihi" value={data.sozlesmeTarihi} />
          <InfoRow label="Fiyat" value={<span className="font-medium text-emerald-600 tabular-nums">{fmt(data.fiyat)}</span>} />
        </div>
      </div>

      {data.ozellikler.length > 0 && (
        <div className="rounded-lg border border-border/60 bg-white p-4">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Teknik Özellikler</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
            {data.ozellikler.map((o, i) => (
              <InfoRow key={i} label={o.key} value={o.value} />
            ))}
          </div>
        </div>
      )}

      {data.aksesuarlar.length > 0 && (
        <div className="rounded-lg border border-border/60 bg-white p-4">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Aksesuarlar / Opsiyonlar</div>
          <ul className="list-disc pl-5 space-y-0.5 text-sm text-foreground/85">
            {data.aksesuarlar.map((a, i) => (
              <li key={i} className="break-words">{a}</li>
            ))}
          </ul>
        </div>
      )}

      {data.odemePlani.length > 0 && (
        <div className="rounded-lg border border-border/60 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead>Ödeme Planı</TableHead>
                <TableHead className="text-right">Tutar</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.odemePlani.map((p, i) => (
                <TableRow key={i}>
                  <TableCell className="text-sm">
                    {p.label}
                    {p.senet ? <span className="ml-1.5 text-[11px] text-muted-foreground">(senet)</span> : null}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{fmt(p.tutar)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {(data.odemeKosullari || data.teslimKosullari || data.garantiKosullari || data.notlar) && (
        <div className="rounded-lg border border-border/60 bg-muted/20 p-4 space-y-2 text-sm text-foreground/85">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Koşullar</div>
          {data.odemeKosullari && <InfoRow label="Ödeme" value={data.odemeKosullari} />}
          {data.teslimKosullari && <InfoRow label="Teslim" value={data.teslimKosullari} />}
          {data.garantiKosullari && <InfoRow label="Garanti" value={data.garantiKosullari} />}
          {data.notlar && <InfoRow label="Not" value={data.notlar} />}
        </div>
      )}
    </div>
  );
}
