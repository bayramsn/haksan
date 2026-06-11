import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Button } from "../ui/button";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import {
  Phone, Smartphone, Mail, MapPin, Building2, Star, Globe, Hash, Briefcase,
  FileText, FileSignature, Receipt, Wallet, Cpu, Wrench, ChevronRight, User as UserIcon,
} from "lucide-react";
import { Customer, Contact, FirmType, salesStageLabel } from "../../lib/mock";
import { useStore } from "../../lib/store";
import { StatusBadge } from "../Layout";

// ───────────────────────── helpers ─────────────────────────

const initials = (n: string) =>
  n.split(" ").slice(0, 2).map((p) => p[0]).join("").toUpperCase();

const FIRM_TYPE_LABEL: Record<FirmType, string> = {
  customer: "Müşteri",
  supplier_customer: "Tedarikçi + Müşteri",
  supplier: "Tedarikçi",
};

const FIRM_TYPE_COLOR: Record<FirmType, string> = {
  customer: "bg-blue-50 text-blue-700 border-blue-200",
  supplier_customer: "bg-brand-blue-soft text-brand-blue border-blue-200",
  supplier: "bg-amber-50 text-amber-700 border-amber-200",
};

const fmtMoney = (n: number, cur: string) => `${n.toLocaleString("tr-TR")} ${cur}`;

/** Sum amounts grouped by currency, rendered as "170.000 USD · 50.000 EUR". */
function sumByCurrency(items: Array<{ amount: number; currency: string }>): string {
  const totals = new Map<string, number>();
  for (const it of items) totals.set(it.currency, (totals.get(it.currency) ?? 0) + it.amount);
  if (totals.size === 0) return "—";
  return Array.from(totals.entries()).map(([cur, n]) => fmtMoney(n, cur)).join(" · ");
}

function Stat({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: React.ReactNode; accent?: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-white px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground whitespace-nowrap">
        <span className={`shrink-0 ${accent ?? "text-muted-foreground"}`}>{icon}</span>
        {label}
      </div>
      <div className="mt-1 text-xl leading-none tabular-nums">{value}</div>
    </div>
  );
}

function Field({ icon, label, value }: { icon?: React.ReactNode; label: string; value?: React.ReactNode }) {
  if (value === undefined || value === null || value === "" || value === "—") return null;
  return (
    <div className="flex items-start gap-2.5">
      {icon && <div className="text-muted-foreground mt-0.5">{icon}</div>}
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-sm break-words">{value}</div>
      </div>
    </div>
  );
}

function EmptyRow({ cols, text }: { cols: number; text: string }) {
  return (
    <TableRow>
      <TableCell colSpan={cols} className="text-center py-8 text-sm text-muted-foreground">{text}</TableCell>
    </TableRow>
  );
}

// ───────────────────────── Company popup ─────────────────────────

export function CompanyDetailDialog({
  customer,
  onClose,
  onOpenContact,
}: {
  customer: Customer | null;
  onClose: () => void;
  onOpenContact?: (c: Contact) => void;
}) {
  const { contacts, cases, offers, documents, payments, machines, service } = useStore();
  if (!customer) return null;

  const firmContacts = contacts.filter((k) => k.customerId === customer.id);
  const firmCases = cases.filter((c) => c.customerId === customer.id);
  const caseIds = new Set(firmCases.map((c) => c.id));
  // Quotes/documents tie to a firm directly via companyId; fall back to the
  // opportunity (case) chain for any legacy rows that only carry salesCaseId.
  const firmOffers = offers.filter((o) => o.companyId === customer.id || (o.salesCaseId && caseIds.has(o.salesCaseId)));
  const firmDocs = documents.filter((d) => d.companyId === customer.id || (d.salesCaseId && caseIds.has(d.salesCaseId)));
  const firmProformas = firmDocs.filter((d) => d.type === "Proforma");
  const firmPayments = payments.filter((p) => p.customerId === customer.id);
  const firmMachines = machines.filter((m) => m.customerId === customer.id);
  const firmService = service.filter((s) => s.customerId === customer.id);

  // Total quoted value across all offers for this firm, grouped by currency.
  const totalQuoted = sumByCurrency(firmOffers.map((o) => ({ amount: o.amount, currency: o.currency })));

  const DOC_LABEL: Record<string, string> = {
    Proforma: "Proforma",
    Contract: "Sözleşme",
    CommercialInvoice: "Ticari Fatura",
    AccountingInvoice: "Muhasebe Faturası",
    DeliveryForm: "Teslim Formu",
    InstallationForm: "Kurulum Formu",
    Other: "Diğer",
  };

  return (
    <Dialog open={!!customer} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto p-0 gap-0">
        {/* header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/60">
          <div className="flex items-start gap-3">
            <div className={`size-11 rounded-xl grid place-items-center shrink-0 ${
              customer.type === "company"
                ? "bg-gradient-to-br from-primary/15 to-primary/5 text-primary"
                : "bg-gradient-to-br from-blue-100 to-blue-50 text-blue-700"
            }`}>
              {customer.type === "company" ? <Building2 className="size-5" /> : <UserIcon className="size-5" />}
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-lg truncate">{customer.name}</DialogTitle>
              <DialogDescription className="mt-1 flex items-center gap-2 flex-wrap">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] ${FIRM_TYPE_COLOR[customer.firmType]}`}>
                  {FIRM_TYPE_LABEL[customer.firmType]}
                </span>
                {customer.firmType !== "supplier" && (
                  <span className={`inline-flex px-2 py-0.5 rounded-full border text-[11px] ${
                    customer.salesStatus === "active_customer"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-zinc-100 text-zinc-700 border-zinc-200"
                  }`}>
                    {customer.salesStatus === "active_customer" ? "Cari Satış" : "Potansiyel"}
                  </span>
                )}
                <span className="text-muted-foreground">{customer.type === "company" ? "Kurumsal" : "Bireysel"}</span>
              </DialogDescription>
            </div>
          </div>

          {/* contact info row */}
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Field icon={<Hash className="size-4" />} label="VKN" value={customer.taxNumber} />
            <Field icon={<Phone className="size-4" />} label="Telefon" value={customer.phone} />
            <Field icon={<Mail className="size-4" />} label="E-posta" value={customer.email} />
            <Field icon={<MapPin className="size-4" />} label="Konum" value={[customer.city, customer.district].filter(Boolean).join(" / ")} />
            <Field icon={<Briefcase className="size-4" />} label="Sektör" value={customer.sector} />
            <Field icon={<Globe className="size-4" />} label="Web" value={customer.website} />
          </div>
        </DialogHeader>

        {/* KPI tiles */}
        <div className="px-6 py-4 grid grid-cols-3 gap-2.5">
          <Stat icon={<UserIcon className="size-3.5" />} label="Kontak" value={firmContacts.length} accent="text-indigo-600" />
          <Stat icon={<Briefcase className="size-3.5" />} label="Satış Kartı" value={firmCases.length} accent="text-sky-600" />
          <Stat icon={<FileText className="size-3.5" />} label="Teklif" value={firmOffers.length} accent="text-blue-600" />
          <Stat icon={<FileSignature className="size-3.5" />} label="Proforma" value={firmProformas.length} accent="text-brand-blue" />
          <Stat icon={<Cpu className="size-3.5" />} label="Makine" value={firmMachines.length} accent="text-amber-600" />
          <Stat icon={<Wrench className="size-3.5" />} label="Servis" value={firmService.length} accent="text-rose-600" />
        </div>

        <div className="px-6 pb-2">
          <div className="rounded-lg bg-muted/40 border border-border/60 px-3 py-2 text-sm flex items-center gap-2">
            <Wallet className="size-4 text-emerald-600" />
            <span className="text-muted-foreground">Toplam teklif tutarı:</span>
            <b className="tabular-nums">{totalQuoted}</b>
          </div>
        </div>

        {/* tabs */}
        <div className="px-6 pb-6">
          <Tabs defaultValue="kontaklar">
            <TabsList className="h-auto flex-wrap justify-start bg-muted/60">
              <TabsTrigger value="kontaklar">Kontaklar ({firmContacts.length})</TabsTrigger>
              <TabsTrigger value="satis">Satış ({firmCases.length})</TabsTrigger>
              <TabsTrigger value="teklif">Teklifler ({firmOffers.length})</TabsTrigger>
              <TabsTrigger value="dokuman">Dökümanlar ({firmDocs.length})</TabsTrigger>
              <TabsTrigger value="cari">Cari ({firmPayments.length})</TabsTrigger>
              <TabsTrigger value="makine">Makineler ({firmMachines.length})</TabsTrigger>
            </TabsList>

            {/* contacts */}
            <TabsContent value="kontaklar" className="mt-3">
              <div className="rounded-lg border border-border/60 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableHead>Kişi</TableHead>
                      <TableHead>Ünvan</TableHead>
                      <TableHead>İletişim</TableHead>
                      <TableHead className="w-8"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {firmContacts.map((k) => (
                      <TableRow
                        key={k.id}
                        className={onOpenContact ? "cursor-pointer group" : ""}
                        onClick={() => onOpenContact?.(k)}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <Avatar className="size-8">
                              <AvatarFallback className="bg-primary/15 text-primary text-[11px]">{initials(k.name)}</AvatarFallback>
                            </Avatar>
                            <span className="flex items-center gap-1.5 group-hover:text-primary transition-colors">
                              {k.name}
                              {k.isPrimary && <Star className="size-3 fill-amber-400 text-amber-400" />}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{k.title || "—"}</div>
                          <div className="text-[11px] text-muted-foreground">{k.department}</div>
                        </TableCell>
                        <TableCell>
                          <div className="text-xs flex items-center gap-1.5"><Phone className="size-3 text-muted-foreground" />{k.phone || "—"}</div>
                          <div className="text-xs flex items-center gap-1.5 mt-0.5"><Mail className="size-3 text-muted-foreground" />{k.email || "—"}</div>
                        </TableCell>
                        <TableCell>{onOpenContact && <ChevronRight className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100" />}</TableCell>
                      </TableRow>
                    ))}
                    {firmContacts.length === 0 && <EmptyRow cols={4} text="Bu firmaya bağlı kontak yok." />}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            {/* sales cases */}
            <TabsContent value="satis" className="mt-3">
              <div className="rounded-lg border border-border/60 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableHead>Ürün / Model</TableHead>
                      <TableHead>Tutar</TableHead>
                      <TableHead>Aşama</TableHead>
                      <TableHead>Tarih</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {firmCases.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell>{s.requestedProduct}{s.requestedModel && s.requestedModel !== s.requestedProduct && <span className="text-muted-foreground"> · {s.requestedModel}</span>}</TableCell>
                        <TableCell className="tabular-nums">{fmtMoney(s.estimatedAmount, s.currency)}</TableCell>
                        <TableCell><StatusBadge status={salesStageLabel(s.stage)} /></TableCell>
                        <TableCell className="text-muted-foreground tabular-nums">{s.createdAt}</TableCell>
                      </TableRow>
                    ))}
                    {firmCases.length === 0 && <EmptyRow cols={4} text="Satış kartı yok." />}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            {/* offers */}
            <TabsContent value="teklif" className="mt-3">
              <div className="rounded-lg border border-border/60 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableHead>Teklif No</TableHead>
                      <TableHead>Tutar</TableHead>
                      <TableHead>Durum</TableHead>
                      <TableHead>Tarih</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {firmOffers.map((o) => (
                      <TableRow key={o.id}>
                        <TableCell className="font-medium">{o.quoteNo}</TableCell>
                        <TableCell className="tabular-nums">{fmtMoney(o.amount, o.currency)}</TableCell>
                        <TableCell><StatusBadge status={o.status} /></TableCell>
                        <TableCell className="text-muted-foreground tabular-nums">{o.date}</TableCell>
                      </TableRow>
                    ))}
                    {firmOffers.length === 0 && <EmptyRow cols={4} text="Teklif yok." />}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            {/* documents (proformas + contracts + invoices) */}
            <TabsContent value="dokuman" className="mt-3">
              <div className="rounded-lg border border-border/60 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableHead>Tip</TableHead>
                      <TableHead>Belge</TableHead>
                      <TableHead>Tarih</TableHead>
                      <TableHead>Durum</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {firmDocs.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell>
                          <span className="inline-flex items-center gap-1.5">
                            {d.type === "Proforma" ? <FileSignature className="size-3.5 text-brand-blue" /> : d.type === "Contract" ? <FileText className="size-3.5 text-sky-600" /> : <Receipt className="size-3.5 text-amber-600" />}
                            {DOC_LABEL[d.type] ?? d.type}
                          </span>
                        </TableCell>
                        <TableCell className="font-medium">{d.fileName}</TableCell>
                        <TableCell className="text-muted-foreground tabular-nums">{d.uploadedAt || "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{d.size}</TableCell>
                      </TableRow>
                    ))}
                    {firmDocs.length === 0 && <EmptyRow cols={4} text="Proforma / sözleşme / fatura yok." />}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            {/* payments */}
            <TabsContent value="cari" className="mt-3">
              <div className="rounded-lg border border-border/60 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableHead>Tip</TableHead>
                      <TableHead>Tutar</TableHead>
                      <TableHead>Vade</TableHead>
                      <TableHead>Durum</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {firmPayments.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>{p.paymentType === "received" ? "Tahsilat" : "Beklenen"}</TableCell>
                        <TableCell className="tabular-nums">{fmtMoney(p.amount, p.currency)}</TableCell>
                        <TableCell className="text-muted-foreground tabular-nums">{p.dueDate}</TableCell>
                        <TableCell><StatusBadge status={p.status} /></TableCell>
                      </TableRow>
                    ))}
                    {firmPayments.length === 0 && <EmptyRow cols={4} text="Cari hareket yok." />}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            {/* machines */}
            <TabsContent value="makine" className="mt-3">
              <div className="rounded-lg border border-border/60 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableHead>Seri No</TableHead>
                      <TableHead>Model</TableHead>
                      <TableHead>Kurulum</TableHead>
                      <TableHead>Garanti Bitiş</TableHead>
                      <TableHead>Durum</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {firmMachines.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="font-medium">{m.serialNumber}</TableCell>
                        <TableCell>{m.model}</TableCell>
                        <TableCell className="text-muted-foreground tabular-nums">{m.installationDate || "—"}</TableCell>
                        <TableCell className="text-muted-foreground tabular-nums">{m.warrantyEnd || "—"}</TableCell>
                        <TableCell><StatusBadge status={m.status} /></TableCell>
                      </TableRow>
                    ))}
                    {firmMachines.length === 0 && <EmptyRow cols={5} text="Kurulu makine yok." />}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ───────────────────────── Contact popup ─────────────────────────

export function ContactDetailDialog({
  contact,
  onClose,
  onOpenCompany,
  onSwitchContact,
}: {
  contact: Contact | null;
  onClose: () => void;
  onOpenCompany?: (c: Customer) => void;
  onSwitchContact?: (c: Contact) => void;
}) {
  const { customers, contacts } = useStore();
  if (!contact) return null;

  const firm = customers.find((c) => c.id === contact.customerId) ?? null;
  const siblings = contacts.filter((k) => k.customerId === contact.customerId && k.id !== contact.id);

  const personalFields: Array<[string, string | undefined]> = [
    ["Memleket", contact.hometown],
    ["Takım", contact.favoriteTeam],
    ["Renk", contact.favoriteColor],
    ["Mezun Okul", contact.graduatedSchool],
    ["Bilinen Rahatsızlık", contact.knownIllness],
    ["Görüş", contact.politicalView],
  ];
  const hasPersonal = personalFields.some(([, v]) => v && v !== "—");

  return (
    <Dialog open={!!contact} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto p-0 gap-0">
        {/* header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/60">
          <div className="flex items-start gap-3">
            <Avatar className="size-11">
              <AvatarFallback className="bg-primary/15 text-primary">{initials(contact.name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-lg truncate flex items-center gap-2">
                {contact.name}
                {contact.isPrimary && <Star className="size-4 fill-amber-400 text-amber-400" />}
              </DialogTitle>
              <DialogDescription className="mt-1">
                {[contact.title, contact.department].filter(Boolean).join(" · ") || "Kontak"}
                {contact.decisionRoleName && (
                  <span className="ml-2 inline-flex px-2 py-0.5 rounded-full border text-[11px] bg-indigo-50 text-indigo-700 border-indigo-200">
                    {contact.decisionRoleName}
                  </span>
                )}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* contact details */}
        <div className="px-6 py-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3.5">
          <Field icon={<Phone className="size-4" />} label="İş Telefonu" value={[contact.phone, contact.phoneExtension && `dh. ${contact.phoneExtension}`].filter(Boolean).join(" ")} />
          <Field icon={<Smartphone className="size-4" />} label="Cep Telefonu" value={contact.mobilePhone} />
          <Field icon={<Phone className="size-4" />} label="Diğer Telefon" value={contact.otherPhone} />
          <Field icon={<Mail className="size-4" />} label="İş E-postası" value={contact.email} />
          <Field icon={<Mail className="size-4" />} label="Kişisel E-posta" value={contact.personalEmail} />
          <Field icon={<Mail className="size-4" />} label="Diğer E-posta" value={contact.otherEmail} />
          <Field label="Cinsiyet" value={contact.gender} />
          <Field label="Doğum Tarihi" value={contact.birthDate} />
        </div>

        {contact.note && (
          <div className="px-6 pb-4">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Not</div>
            <div className="text-sm rounded-lg bg-muted/40 border border-border/60 px-3 py-2">{contact.note}</div>
          </div>
        )}

        {hasPersonal && (
          <div className="px-6 pb-4">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Kişisel Bilgiler</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2.5">
              {personalFields.map(([label, value]) => <Field key={label} label={label} value={value} />)}
            </div>
          </div>
        )}

        {/* linked company */}
        <div className="px-6 pb-4">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Bağlı Firma</div>
          {firm ? (
            <button
              type="button"
              onClick={() => onOpenCompany?.(firm)}
              disabled={!onOpenCompany}
              className="w-full text-left rounded-lg border border-border/60 bg-white px-3.5 py-3 flex items-center gap-3 transition-colors enabled:hover:border-primary/40 enabled:hover:bg-primary/5 group disabled:cursor-default"
            >
              <div className="size-9 rounded-lg grid place-items-center bg-gradient-to-br from-primary/15 to-primary/5 text-primary shrink-0">
                <Building2 className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm truncate group-enabled:group-hover:text-primary transition-colors">{firm.name}</div>
                <div className="text-[11px] text-muted-foreground truncate flex items-center gap-2">
                  <span className={`inline-flex px-1.5 py-0 rounded-full border text-[10px] ${FIRM_TYPE_COLOR[firm.firmType]}`}>{FIRM_TYPE_LABEL[firm.firmType]}</span>
                  {firm.city && <span className="inline-flex items-center gap-1"><MapPin className="size-3" />{firm.city}</span>}
                  {firm.phone && <span className="inline-flex items-center gap-1"><Phone className="size-3" />{firm.phone}</span>}
                </div>
              </div>
              {onOpenCompany && <ChevronRight className="size-4 text-muted-foreground group-hover:text-primary shrink-0" />}
            </button>
          ) : (
            <div className="text-sm text-muted-foreground rounded-lg border border-dashed border-border/60 px-3 py-3">Bağlı firma bulunamadı.</div>
          )}
        </div>

        {/* sibling contacts at the same firm */}
        {siblings.length > 0 && (
          <div className="px-6 pb-6">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">
              Aynı Firmadaki Diğer Kontaklar ({siblings.length})
            </div>
            <div className="space-y-1.5">
              {siblings.map((k) => (
                <button
                  key={k.id}
                  type="button"
                  onClick={() => onSwitchContact?.(k)}
                  disabled={!onSwitchContact}
                  className="w-full text-left rounded-lg border border-border/60 bg-white px-3 py-2 flex items-center gap-2.5 transition-colors enabled:hover:border-primary/40 enabled:hover:bg-primary/5 group disabled:cursor-default"
                >
                  <Avatar className="size-7">
                    <AvatarFallback className="bg-muted text-foreground/70 text-[10px]">{initials(k.name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm truncate flex items-center gap-1.5 group-enabled:group-hover:text-primary transition-colors">
                      {k.name}
                      {k.isPrimary && <Star className="size-3 fill-amber-400 text-amber-400" />}
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">{[k.title, k.department].filter(Boolean).join(" · ")}</div>
                  </div>
                  {onSwitchContact && <ChevronRight className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0" />}
                </button>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ───────────────── controller hook: cross-linked dialogs ─────────────────

/**
 * Manages the two cross-linked popups so a page can drop them in with one
 * line and get smooth contact ⇄ company navigation. Opening one closes the
 * other to avoid stacked overlays.
 */
export function useDetailDialogs() {
  const [contact, setContact] = useState<Contact | null>(null);
  const [company, setCompany] = useState<Customer | null>(null);

  const openContact = (c: Contact) => { setCompany(null); setContact(c); };
  const openCompany = (c: Customer) => { setContact(null); setCompany(c); };

  const dialogs = (
    <>
      <ContactDetailDialog
        contact={contact}
        onClose={() => setContact(null)}
        onOpenCompany={openCompany}
        onSwitchContact={setContact}
      />
      <CompanyDetailDialog
        customer={company}
        onClose={() => setCompany(null)}
        onOpenContact={openContact}
      />
    </>
  );

  return { openContact, openCompany, dialogs };
}
