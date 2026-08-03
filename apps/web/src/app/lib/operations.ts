import {
  salesStageLabel,
  type Activity,
  type Contact,
  type Customer,
  type Delivery,
  type DocumentItem,
  type Machine,
  type Offer,
  type Payment,
  type Product,
  type SalesCase,
  type ServiceRequest,
  type Shipment,
  type StockItem,
  type User,
} from "./mock";

export type OperationNav =
  | "dashboard"
  | "calendar"
  | "call-assistant"
  | "customers"
  | "contacts"
  | "leads"
  | "sales-cases"
  | "kanban"
  | "sales-map"
  | "offers"
  | "proformas"
  | "contracts"
  | "documents"
  | "payments"
  | "accounting-invoices"
  | "customer-balances"
  | "sales-price-list"
  | "products"
  | "stock"
  | "purchase-orders"
  | "shipments"
  | "installations"
  | "deliveries"
  | "machines"
  | "service-requests"
  | "service-kanban"
  | "service-price-list"
  | "reports"
  | "users"
  | "roles"
  | "departments"
  | "settings";

export type OperationFocus =
  | "open"
  | "overdue"
  | "upcoming"
  | "paid"
  | "pending"
  | "reserved"
  | "available"
  | "low"
  | "sla"
  | "late"
  | "scheduled"
  | "shipments"
  | "delivered"
  | "expired"
  | "won"
  | "lost"
  | "today"
  | "sla_risk"
  | "uncontacted"
  | "unassigned"
  | "no_action";

export type OperationAction =
  | { kind: "navigate"; nav: OperationNav; focus?: OperationFocus; query?: string }
  | { kind: "customer"; customerId: string }
  | { kind: "salesCase"; salesCaseId: string };

export type OperationSeverity = "critical" | "warning" | "info" | "success";

export type OperationStoreSnapshot = {
  customers: Customer[];
  contacts: Contact[];
  cases: SalesCase[];
  offers: Offer[];
  payments: Payment[];
  service: ServiceRequest[];
  stock: StockItem[];
  products: Product[];
  activities: Activity[];
  users: User[];
  machines: Machine[];
  documents: DocumentItem[];
  shipments: Shipment[];
  deliveries: Delivery[];
};

export type WorkItem = {
  id: string;
  title: string;
  subtitle: string;
  meta: string;
  owner: string;
  severity: OperationSeverity;
  module: OperationNav;
  action: OperationAction;
  dueDate?: string;
};

export type OperationAlert = {
  id: string;
  title: string;
  description: string;
  severity: OperationSeverity;
  module: OperationNav;
  action: OperationAction;
};

export type SearchResult = {
  id: string;
  type: string;
  title: string;
  subtitle: string;
  badge: string;
  keywords: string;
  action: OperationAction;
};

export type TimelineItem = {
  id: string;
  date: string;
  type: string;
  title: string;
  description: string;
  meta?: string;
  action?: OperationAction;
};

export type AssistantReply = {
  text: string;
  actions: Array<{ label: string; action: OperationAction }>;
  results?: SearchResult[];
};

export type ManagementInsightCategory = "risk" | "opportunity" | "action" | "trend";

export type ManagementInsight = {
  id: string;
  category: ManagementInsightCategory;
  title: string;
  description: string;
  metric: string;
  severity: OperationSeverity;
  action: OperationAction;
};

export type KpiDrilldown = {
  id: string;
  label: string;
  value: string;
  description: string;
  severity: OperationSeverity;
  action: OperationAction;
  records: SearchResult[];
};

export type ReportSummary = {
  kpis: KpiDrilldown[];
  risks: ManagementInsight[];
  opportunities: ManagementInsight[];
  actions: ManagementInsight[];
  trends: ManagementInsight[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

const today = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};

const parseDate = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const daysUntil = (value?: string | null) => {
  const date = parseDate(value);
  if (!date) return null;
  const start = today().getTime();
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  return Math.round((target - start) / DAY_MS);
};

const daysSince = (value?: string | null) => {
  const until = daysUntil(value);
  return until === null ? null : Math.max(0, -until);
};

const formatMoney = (amount: number, currency = "USD") =>
  `${amount.toLocaleString("tr-TR", { maximumFractionDigits: 0 })} ${currency}`;

const summarizePayments = (payments: Payment[]) => {
  const totals = payments.reduce((map, payment) => {
    map.set(payment.currency, (map.get(payment.currency) ?? 0) + payment.amount);
    return map;
  }, new Map<string, number>());
  return Array.from(totals.entries())
    .map(([currency, amount]) => formatMoney(amount, currency))
    .join(" · ");
};

const findCustomer = (data: OperationStoreSnapshot, id: string) =>
  data.customers.find((c) => c.id === id);

const paidInboundPayments = (data: OperationStoreSnapshot) =>
  data.payments.filter((p) => p.status === "Paid" && p.direction === "in");

const topCustomersByPaid = (data: OperationStoreSnapshot, limit = 5) => {
  const byCustomer = new Map<string, Payment[]>();
  for (const payment of paidInboundPayments(data)) {
    const list = byCustomer.get(payment.customerId) ?? [];
    list.push(payment);
    byCustomer.set(payment.customerId, list);
  }
  return Array.from(byCustomer.entries())
    .map(([customerId, payments]) => ({
      customerId,
      total: payments.reduce((sum, p) => sum + p.amount, 0),
      payments,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
};

const monthKeyOf = (iso?: string) => (iso ?? "").slice(0, 7);

const sumPaidByMonth = (data: OperationStoreSnapshot, monthKey: string) => {
  const totals = new Map<string, number>();
  for (const payment of paidInboundPayments(data)) {
    // Ay ataması yalnız gerçek tahsilat tarihine göre yapılır; paidDate'i
    // olmayan Paid kayıtlar vade ayına yazılıp ciroyu saptırmasın.
    if (!payment.paidDate || monthKeyOf(payment.paidDate) !== monthKey) continue;
    totals.set(payment.currency, (totals.get(payment.currency) ?? 0) + payment.amount);
  }
  return Array.from(totals.entries())
    .map(([currency, amount]) => formatMoney(amount, currency))
    .join(" · ");
};

const findUser = (data: OperationStoreSnapshot, id?: string) =>
  data.users.find((u) => u.id === id)?.name ?? "Atanmadı";

const isOpenSalesCase = (s: SalesCase) =>
  (s.qualificationStage ?? "lead") !== "lead" &&
  !s.isLost &&
  !["Completed", "Lost", "delivered"].includes(String(s.stage));

const isWonSalesCase = (s: SalesCase) =>
  !s.isLost && ["Completed", "delivered"].includes(String(s.stage));

const isLostSalesCase = (s: SalesCase) => s.isLost || String(s.stage) === "Lost";

const isOpenService = (s: ServiceRequest) => s.stage !== "Closed";

const isLateService = (s: ServiceRequest) =>
  isOpenService(s) && (daysSince(s.createdAt) ?? 0) > 7;

const isExpiredOffer = (o: Offer) =>
  o.status === "Sent" && (daysSince(o.date) ?? 0) > (o.validityDays ?? 20);

const latestOfferDate = (data: OperationStoreSnapshot, salesCaseId: string) =>
  {
    const dates = data.offers
    .filter((o) => o.salesCaseId === salesCaseId)
    .map((o) => o.date)
      .sort();
    return dates[dates.length - 1];
  };

const normalize = (value: string) =>
  value
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const COMMAND_WORDS = new Set([
  "ac", "aç", "ara", "bak", "bul", "durum", "filtrele", "getir", "git", "goster", "göster",
  "hangi", "kac", "kaç", "liste", "listele", "ne", "nedir", "nerede", "ozet", "özet", "sayfa",
  "sonuc", "sonuç", "tum", "tüm", "var",
].map(normalize));

const stripCommandWords = (query: string, intentWords: string[] = []) => {
  const ignored = new Set([...COMMAND_WORDS, ...intentWords.map(normalize)]);
  return query
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token && !ignored.has(normalize(token)))
    .join(" ")
    .trim();
};

const includesAny = (text: string, words: string[]) =>
  words.some((word) => text.includes(normalize(word)));

const byType = (index: SearchResult[], type: string, query: string, intentWords: string[], limit = 6) => {
  const term = stripCommandWords(query, intentWords);
  const pool = term ? searchOperationIndex(term, index, Math.max(limit * 2, 12)) : index;
  return pool.filter((result) => result.type === type).slice(0, limit);
};

const asAssistantResults = (items: WorkItem[]): SearchResult[] =>
  items.map((w) => ({
    id: w.id,
    type: "İş",
    title: w.title,
    subtitle: `${w.subtitle} · ${w.meta}`,
    badge: w.owner,
    keywords: w.title,
    action: w.action,
  }));

const customerName = (data: OperationStoreSnapshot, id?: string) =>
  id ? findCustomer(data, id)?.name ?? "Firma" : "Firma";

const documentNav = (_type: DocumentItem["type"]): OperationNav => "documents";

export function buildWorkItems(data: OperationStoreSnapshot): WorkItem[] {
  const items: WorkItem[] = [];

  data.cases
    .filter((salesCase) =>
      (salesCase.qualificationStage ?? "lead") === "lead" &&
      salesCase.leadFollowUpStatus !== "disqualified"
    )
    .sort((left, right) =>
      Number(Boolean(right.qualificationReadiness?.health?.leadSlaBreached)) -
        Number(Boolean(left.qualificationReadiness?.health?.leadSlaBreached)) ||
      (right.leadInsights?.priorityScore ?? 0) - (left.leadInsights?.priorityScore ?? 0)
    )
    .slice(0, 8)
    .forEach((salesCase) => {
      const health = salesCase.qualificationReadiness?.health;
      const slaRisk = Boolean(health?.leadSlaBreached || health?.actionOverdue);
      const needsAction = !salesCase.nextActionAt;
      const leadTitle =
        salesCase.leadCompanyTitle ||
        salesCase.leadContactName ||
        findCustomer(data, salesCase.customerId)?.name ||
        "Yeni lead";
      items.push({
        id: `lead:${salesCase.id}`,
        title: `${leadTitle} lead takibi`,
        subtitle: salesCase.nextAction || salesCase.requestedProduct || "İlk temas aksiyonu planlanmalı",
        meta: health?.leadSlaBreached
          ? "SLA aşıldı"
          : needsAction
            ? "Aksiyon tarihi yok"
            : `Öncelik %${salesCase.leadInsights?.priorityScore ?? 0}`,
        owner: findUser(data, salesCase.assignedUserId),
        severity: slaRisk ? "critical" : !salesCase.assignedUserId || needsAction ? "warning" : "info",
        module: "leads",
        action: { kind: "salesCase", salesCaseId: salesCase.id },
        dueDate: salesCase.nextActionAt ?? salesCase.createdAt,
      });
    });

  data.payments
    .filter((p) => p.status === "Overdue")
    .forEach((p) => {
      const customer = findCustomer(data, p.customerId);
      items.push({
        id: `payment:${p.id}`,
        title: `${customer?.name ?? "Firma"} gecikmiş ödeme`,
        subtitle: `${formatMoney(p.amount, p.currency)} · ${p.note || "Tahsilat takibi"}`,
        meta: p.dueDate ? `${Math.abs(daysUntil(p.dueDate) ?? 0)} gün gecikmiş` : "Vade geçti",
        owner: "Finans",
        severity: "critical",
        module: "payments",
        action: { kind: "navigate", nav: "payments", focus: "overdue" },
        dueDate: p.dueDate,
      });
    });

  data.payments
    .filter((p) => p.status === "Pending" && (daysUntil(p.dueDate) ?? 99) <= 7)
    .forEach((p) => {
      const customer = findCustomer(data, p.customerId);
      items.push({
        id: `payment-due:${p.id}`,
        title: `${customer?.name ?? "Firma"} yaklaşan ödeme`,
        subtitle: `${formatMoney(p.amount, p.currency)} · ${p.direction === "in" ? "Alınacak" : "Ödenecek"}`,
        meta: p.dueDate ? `${Math.max(daysUntil(p.dueDate) ?? 0, 0)} gün kaldı` : "Vade yakın",
        owner: "Finans",
        severity: "warning",
        module: "payments",
        action: { kind: "navigate", nav: "payments", focus: "upcoming" },
        dueDate: p.dueDate,
      });
    });

  data.cases
    .filter(isOpenSalesCase)
    .slice(0, 8)
    .forEach((s) => {
      const customer = findCustomer(data, s.customerId);
      const offerDate = latestOfferDate(data, s.id);
      const stale = offerDate ? (daysUntil(offerDate) ?? 0) < -14 : (daysUntil(s.createdAt) ?? 0) < -10;
      items.push({
        id: `case:${s.id}`,
        title: `${customer?.name ?? "Firma"} satış kartı`,
        subtitle: `${s.requestedProduct} · ${s.requestedModel}`,
        meta: salesStageLabel(s.stage),
        owner: findUser(data, s.assignedUserId),
        severity: stale ? "warning" : "info",
        module: "sales-cases",
        action: { kind: "salesCase", salesCaseId: s.id },
        dueDate: offerDate ?? s.createdAt,
      });
    });

  data.service
    .filter(isOpenService)
    .forEach((s) => {
      const customer = findCustomer(data, s.customerId);
      const age = Math.abs(daysUntil(s.createdAt) ?? 0);
      items.push({
        id: `service:${s.id}`,
        title: `${customer?.name ?? "Firma"} servis talebi`,
        subtitle: s.description || s.diagnosisNote || s.serviceNote || "Servis takibi gerekli",
        meta: age > 7 ? `${age} gündür açık` : s.stage,
        owner: findUser(data, s.assignedUserId),
        severity: age > 7 || s.priority === "critical" ? "critical" : s.priority === "high" ? "warning" : "info",
        module: "service-requests",
        action: { kind: "navigate", nav: "service-requests", focus: age > 7 ? "late" : "open" },
        dueDate: s.createdAt,
      });
    });

  data.shipments
    .filter((s) => s.status !== "Teslim Edildi")
    .forEach((s) => {
      const salesCase = data.cases.find((c) => c.id === s.salesCaseId);
      const customer = salesCase ? findCustomer(data, salesCase.customerId) : null;
      items.push({
        id: `shipment:${s.id}`,
        title: `${s.trackingNo} sevkiyat`,
        subtitle: `${customer?.name ?? "Müşteri"} · ${s.origin} → ${s.destination}`,
        meta: `${s.status} · ETA ${s.eta}`,
        owner: "Operasyon",
        severity: s.status === "Gümrükte" ? "warning" : "info",
        module: "shipments",
        action: { kind: "navigate", nav: "shipments", focus: "pending" },
        dueDate: s.eta,
      });
    });

  data.stock
    .filter((s) => s.status === "Reserved")
    .forEach((s) => {
      items.push({
        id: `stock:${s.id}`,
        title: `${s.counterModel} rezerve stok`,
        subtitle: `${s.stockCode} · ${s.serialNumber}`,
        meta: s.warehouse,
        owner: "Stok",
        severity: "info",
        module: "stock",
        action: { kind: "navigate", nav: "stock", focus: "reserved" },
      });
    });

  const severityRank: Record<OperationSeverity, number> = { critical: 0, warning: 1, info: 2, success: 3 };
  return items.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]).slice(0, 14);
}

export function buildAlerts(data: OperationStoreSnapshot): OperationAlert[] {
  const leads = data.cases.filter((salesCase) =>
    (salesCase.qualificationStage ?? "lead") === "lead" &&
    salesCase.leadFollowUpStatus !== "disqualified"
  );
  const leadSlaRisks = leads.filter((salesCase) => {
    const health = salesCase.qualificationReadiness?.health;
    const nearLimit =
      health?.leadSlaHours != null &&
      health.leadStatusAgeHours != null &&
      health.leadStatusAgeHours >= health.leadSlaHours * 0.75;
    return Boolean(health?.leadSlaBreached || health?.actionOverdue || nearLimit);
  });
  const uncontactedLeads = leads.filter((salesCase) => !salesCase.qualificationReadiness?.health?.firstContactAt);
  const unassignedLeads = leads.filter((salesCase) => !salesCase.assignedUserId);
  const leadsWithoutAction = leads.filter((salesCase) => !salesCase.nextActionAt);
  const overduePayments = data.payments.filter((p) => p.status === "Overdue");
  const expiringOffers = data.offers.filter(isExpiredOffer);
  const lateServices = data.service.filter(isLateService);
  const pendingShipments = data.shipments.filter((s) => s.status !== "Teslim Edildi");
  const pendingDeliveries = data.deliveries.filter((d) => d.status === "Bekliyor");
  const reservedStock = data.stock.filter((s) => s.status === "Reserved");

  return [
    leadSlaRisks.length
      ? {
          id: "alert:lead-sla",
          title: `${leadSlaRisks.length} lead SLA riski`,
          description: "İlk temas veya sonraki aksiyon süresi kritik seviyede",
          severity: "critical" as const,
          module: "leads" as const,
          action: { kind: "navigate", nav: "leads", focus: "sla_risk" } as OperationAction,
        }
      : null,
    unassignedLeads.length
      ? {
          id: "alert:lead-unassigned",
          title: `${unassignedLeads.length} sahipsiz lead`,
          description: "Atama kuralı eşleşmeyen kayıtlar satış yöneticisi kararı bekliyor",
          severity: "warning" as const,
          module: "leads" as const,
          action: { kind: "navigate", nav: "leads", focus: "unassigned" } as OperationAction,
        }
      : null,
    leadsWithoutAction.length
      ? {
          id: "alert:lead-no-action",
          title: `${leadsWithoutAction.length} aksiyonsuz lead`,
          description: "Tarihli sonraki aksiyonu olmayan kayıtlar var",
          severity: "warning" as const,
          module: "leads" as const,
          action: { kind: "navigate", nav: "leads", focus: "no_action" } as OperationAction,
        }
      : null,
    uncontactedLeads.length
      ? {
          id: "alert:lead-uncontacted",
          title: `${uncontactedLeads.length} temas kurulmamış lead`,
          description: "Henüz ilk temas kaydı bulunmayan leadler var",
          severity: "info" as const,
          module: "leads" as const,
          action: { kind: "navigate", nav: "leads", focus: "uncontacted" } as OperationAction,
        }
      : null,
    overduePayments.length
      ? {
          id: "alert:overdue-payments",
          title: `${overduePayments.length} gecikmiş ödeme`,
          description: `${summarizePayments(overduePayments)} açık takip var`,
          severity: "critical" as const,
          module: "payments" as const,
          action: { kind: "navigate", nav: "payments", focus: "overdue" } as OperationAction,
        }
      : null,
    expiringOffers.length
      ? {
          id: "alert:offers",
          title: `${expiringOffers.length} teklif takibi`,
          description: "Gönderilmiş ve uzun süredir açık teklifler var",
          severity: "warning" as const,
          module: "offers" as const,
          action: { kind: "navigate", nav: "offers", focus: "expired" } as OperationAction,
        }
      : null,
    lateServices.length
      ? {
          id: "alert:service-sla",
          title: `${lateServices.length} servis gecikmesi`,
          description: "Açık servis taleplerinde SLA riski oluştu",
          severity: "critical" as const,
          module: "service-requests" as const,
          action: { kind: "navigate", nav: "service-requests", focus: "late" } as OperationAction,
        }
      : null,
    pendingShipments.length
      ? {
          id: "alert:shipments",
          title: `${pendingShipments.length} sevkiyat bekliyor`,
          description: "Yolda veya gümrükte görünen sevkiyatlar var",
          severity: "info" as const,
          module: "shipments" as const,
          action: { kind: "navigate", nav: "shipments", focus: "pending" } as OperationAction,
        }
      : null,
    pendingDeliveries.length
      ? {
          id: "alert:installation-forms",
          title: `${pendingDeliveries.length} kurulum tutanağı bekliyor`,
          description: "Kurulum akışında imza veya tutanak tamamlanması bekleyen kayıt var",
          severity: "warning" as const,
          module: "installations" as const,
          action: { kind: "navigate", nav: "installations" } as OperationAction,
        }
      : null,
    reservedStock.length
      ? {
          id: "alert:stock",
          title: `${reservedStock.length} rezerve stok`,
          description: "Rezerve kalemlerin satış/sevkiyat akışı kontrol edilmeli",
          severity: "info" as const,
          module: "stock" as const,
          action: { kind: "navigate", nav: "stock", focus: "reserved" } as OperationAction,
        }
      : null,
  ].filter(Boolean) as OperationAlert[];
}

export function buildGlobalSearchIndex(data: OperationStoreSnapshot): SearchResult[] {
  const results: SearchResult[] = [];

  results.push(
    {
      id: "report:management",
      type: "Rapor",
      title: "Yönetim özeti",
      subtitle: "Riskler, fırsatlar, KPI kaynakları ve aksiyon listesi",
      badge: "Dashboard",
      keywords: "yonetim yönetim risk fırsat firsat kpi ciro dönüşüm donusum karlılık karlilik rapor özet ozet",
      action: { kind: "navigate", nav: "reports" },
    },
    {
      id: "report:dashboard",
      type: "Rapor",
      title: "Yönetim merkezi",
      subtitle: "Ciro, teklif dönüşümü, servis, ödeme ve stok KPI'ları",
      badge: "Dashboard",
      keywords: "dashboard gösterge panel yönetim merkezi performans operasyon",
      action: { kind: "navigate", nav: "dashboard" },
    }
  );

  data.customers.forEach((c) =>
    results.push({
      id: `customer:${c.id}`,
      type: "Firma",
      title: c.name,
      subtitle: `${c.city || "Şehir yok"} · ${c.email || c.phone || "İletişim yok"}`,
      badge: c.firmType,
      keywords: [c.name, c.city, c.email, c.phone, c.taxNumber, c.contactPerson, c.wantedProduct].join(" "),
      action: { kind: "customer", customerId: c.id },
    })
  );

  data.contacts.forEach((c) => {
    const customer = findCustomer(data, c.customerId);
    results.push({
      id: `contact:${c.id}`,
      type: "Kontak",
      title: c.name,
      subtitle: `${customer?.name ?? "Firma"} · ${c.title || c.email || "Kontak"}`,
      badge: c.department || "Kontak",
      keywords: [c.name, c.email, c.phone, c.mobilePhone, c.title, customer?.name].join(" "),
      action: { kind: "customer", customerId: c.customerId },
    });
  });

  data.cases.forEach((s) => {
    const customer = findCustomer(data, s.customerId);
    results.push({
      id: `case:${s.id}`,
      type: "Satış",
      title: `${customer?.name ?? "Firma"} · ${s.requestedModel || s.requestedProduct}`,
      subtitle: `${salesStageLabel(s.stage)} · ${formatMoney(s.estimatedAmount, s.currency)}`,
      badge: s.id.toUpperCase(),
      keywords: [s.id, customer?.name, s.requestedProduct, s.requestedModel, salesStageLabel(s.stage)].join(" "),
      action: { kind: "salesCase", salesCaseId: s.id },
    });
  });

  data.offers.forEach((o) => {
    const salesCase = data.cases.find((s) => s.id === o.salesCaseId);
    const customer = salesCase ? findCustomer(data, salesCase.customerId) : o.companyId ? findCustomer(data, o.companyId) : null;
    results.push({
      id: `offer:${o.id}`,
      type: "Teklif",
      title: o.quoteNo,
      subtitle: `${customer?.name ?? "Firma"} · ${formatMoney(o.amount, o.currency)}`,
      badge: o.status,
      keywords: [o.quoteNo, o.note, customer?.name, salesCase?.requestedModel].join(" "),
      action: salesCase ? { kind: "salesCase", salesCaseId: salesCase.id } : { kind: "navigate", nav: "offers", focus: o.status === "Approved" ? "won" : o.status === "Rejected" ? "lost" : o.status === "Sent" ? "open" : undefined },
    });
  });

  data.stock.forEach((s) =>
    results.push({
      id: `stock:${s.id}`,
      type: "Stok",
      title: `${s.counterModel} · ${s.serialNumber}`,
      subtitle: `${s.stockCode} · ${s.warehouse}`,
      badge: s.status,
      keywords: [s.brand, s.counterType, s.counterModel, s.serialNumber, s.stockCode, s.controlPanel, s.warehouse].join(" "),
      action: { kind: "navigate", nav: "stock", focus: s.status === "Reserved" ? "reserved" : undefined, query: s.counterModel },
    })
  );

  data.products.forEach((p) =>
    results.push({
      id: `product:${p.id}`,
      type: "Ürün",
      title: `${p.brand} ${p.model}`,
      subtitle: p.shortDescription || p.type || "Ürün",
      badge: p.currency,
      keywords: [p.brand, p.model, p.type, p.category, p.shortDescription, p.stockCode].join(" "),
      action: { kind: "navigate", nav: "products", query: p.model },
    })
  );

  data.service.forEach((s) => {
    const customer = findCustomer(data, s.customerId);
    const machine = data.machines.find((m) => m.id === s.machineId);
    results.push({
      id: `service:${s.id}`,
      type: "Servis",
      title: `${customer?.name ?? "Firma"} servis`,
      subtitle: `${machine?.model ?? "Makine"} · ${s.stage}`,
      badge: s.priority ?? "normal",
      keywords: [customer?.name, machine?.model, machine?.serialNumber, s.description, s.diagnosisNote, s.serviceNote, s.stage].join(" "),
      action: { kind: "navigate", nav: "service-requests", focus: isOpenService(s) ? "open" : undefined },
    });
  });

  data.payments.forEach((p) => {
    const customer = findCustomer(data, p.customerId);
    results.push({
      id: `payment:${p.id}`,
      type: "Ödeme",
      title: `${customer?.name ?? "Firma"} · ${formatMoney(p.amount, p.currency)}`,
      subtitle: `${p.direction === "in" ? "Alınan" : "Ödenen"} · ${p.dueDate}`,
      badge: p.status,
      keywords: [customer?.name, p.note, p.status, p.amount, p.currency, p.dueDate].join(" "),
      action: { kind: "navigate", nav: "payments", focus: p.status === "Overdue" ? "overdue" : p.status === "Pending" ? "pending" : undefined },
    });
  });

  data.machines.forEach((m) => {
    const customer = findCustomer(data, m.customerId);
    results.push({
      id: `machine:${m.id}`,
      type: "Makine",
      title: `${m.model} · ${m.serialNumber}`,
      subtitle: `${customer?.name ?? "Firma"} · garanti ${m.warrantyEnd}`,
      badge: m.status,
      keywords: [m.model, m.serialNumber, m.brand, m.controlUnit, customer?.name].join(" "),
      action: { kind: "customer", customerId: m.customerId },
    });
  });

  data.documents.forEach((d) => {
    const salesCase = data.cases.find((s) => s.id === d.salesCaseId);
    const customer = salesCase ? findCustomer(data, salesCase.customerId) : d.companyId ? findCustomer(data, d.companyId) : null;
    results.push({
      id: `document:${d.id}`,
      type: "Doküman",
      title: d.fileName,
      subtitle: `${customer?.name ?? "Firma"} · ${d.uploadedAt}`,
      badge: d.type,
      keywords: [d.fileName, d.type, customer?.name, d.uploadedAt].join(" "),
      action: { kind: "navigate", nav: documentNav(d.type), query: d.fileName },
    });
  });

  data.shipments.forEach((s) => {
    const salesCase = data.cases.find((c) => c.id === s.salesCaseId);
    const customer = salesCase ? findCustomer(data, salesCase.customerId) : null;
    results.push({
      id: `shipment:${s.id}`,
      type: "Sevkiyat",
      title: s.trackingNo,
      subtitle: `${customer?.name ?? "Firma"} · ${s.origin} → ${s.destination}`,
      badge: s.status,
      keywords: [s.trackingNo, s.carrier, s.origin, s.destination, s.status, customer?.name, salesCase?.requestedModel].join(" "),
      action: { kind: "navigate", nav: "shipments", focus: s.status === "Teslim Edildi" ? "delivered" : "pending", query: s.trackingNo },
    });
  });

  data.deliveries.forEach((d) => {
    const customer = findCustomer(data, d.customerId);
    const salesCase = data.cases.find((s) => s.id === d.salesCaseId);
    results.push({
      id: `delivery:${d.id}`,
      type: "Kurulum Tutanağı",
      title: `${customer?.name ?? "Firma"} kurulum tutanağı`,
      subtitle: `${d.date} · ${d.signedBy || "İmza bekliyor"}`,
      badge: d.status,
      keywords: [customer?.name, salesCase?.requestedModel, d.signedBy, d.status, d.date].join(" "),
      action: { kind: "navigate", nav: "installations", query: customer?.name },
    });
  });

  return results;
}

export function searchOperationIndex(query: string, index: SearchResult[], limit = 8) {
  const needle = normalize(query.trim());
  if (!needle) return index.slice(0, limit);
  return index
    .map((item) => {
      const haystack = normalize(`${item.title} ${item.subtitle} ${item.badge} ${item.keywords}`);
      const score = normalize(item.title).includes(needle) ? 3 : haystack.includes(needle) ? 1 : 0;
      return { item, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title, "tr"))
    .slice(0, limit)
    .map((x) => x.item);
}

const indexByIds = (data: OperationStoreSnapshot, ids: string[]) => {
  const wanted = new Set(ids);
  return buildGlobalSearchIndex(data).filter((item) => wanted.has(item.id));
};

export function buildKpiDrilldowns(data: OperationStoreSnapshot): KpiDrilldown[] {
  const wonCases = data.cases.filter(isWonSalesCase);
  const openCases = data.cases.filter(isOpenSalesCase);
  const approvedOffers = data.offers.filter((o) => o.status === "Approved");
  const sentOffers = data.offers.filter((o) => o.status === "Sent");
  const overduePayments = data.payments.filter((p) => p.status === "Overdue");
  const openServices = data.service.filter(isOpenService);
  const lateServices = data.service.filter(isLateService);
  const stockRisk = data.stock.filter((s) => s.status === "Reserved" || s.status === "Inactive");
  const pendingShipments = data.shipments.filter((s) => s.status !== "Teslim Edildi");
  const wonRevenue = wonCases.reduce((sum, item) => sum + item.estimatedAmount, 0);
  const openPipeline = openCases.reduce((sum, item) => sum + item.estimatedAmount, 0);
  const overdueTotal = overduePayments.reduce((sum, item) => sum + item.amount, 0);
  const conversion = data.offers.length > 0 ? Math.round((approvedOffers.length / data.offers.length) * 100) : 0;
  const estimatedGrossProfit = Math.round(wonRevenue * 0.18);

  return [
    {
      id: "kpi:revenue",
      label: "Kazanılan ciro",
      value: formatMoney(wonRevenue, "USD"),
      description: `${wonCases.length} tamamlanan satış kartından hesaplandı`,
      severity: wonCases.length ? "success" : "info",
      action: { kind: "navigate", nav: "sales-cases", focus: "won" },
      records: indexByIds(data, wonCases.map((item) => `case:${item.id}`)),
    },
    {
      id: "kpi:conversion",
      label: "Teklif dönüşümü",
      value: `%${conversion}`,
      description: `${approvedOffers.length} onaylı / ${data.offers.length} toplam teklif`,
      severity: conversion >= 40 ? "success" : conversion >= 25 ? "warning" : "critical",
      action: { kind: "navigate", nav: "offers", focus: "won" },
      records: indexByIds(data, [...approvedOffers, ...sentOffers].map((item) => `offer:${item.id}`)),
    },
    {
      id: "kpi:service-open",
      label: "Açık servis",
      value: String(openServices.length),
      description: `${lateServices.length} kayıt 7 günü geçti`,
      severity: lateServices.length ? "critical" : openServices.length ? "warning" : "success",
      action: { kind: "navigate", nav: "service-requests", focus: lateServices.length ? "late" : "open" },
      records: indexByIds(data, openServices.map((item) => `service:${item.id}`)),
    },
    {
      id: "kpi:overdue",
      label: "Geciken ödeme",
      value: formatMoney(overdueTotal, "USD"),
      description: `${overduePayments.length} gecikmiş kasa hareketi`,
      severity: overduePayments.length ? "critical" : "success",
      action: { kind: "navigate", nav: "payments", focus: "overdue" },
      records: indexByIds(data, overduePayments.map((item) => `payment:${item.id}`)),
    },
    {
      id: "kpi:stock-risk",
      label: "Stok riski",
      value: String(stockRisk.length),
      description: "Rezerve veya pasif görünen stok kalemleri",
      severity: stockRisk.length ? "warning" : "success",
      action: { kind: "navigate", nav: "stock", focus: "low" },
      records: indexByIds(data, stockRisk.map((item) => `stock:${item.id}`)),
    },
    {
      id: "kpi:shipments",
      label: "Bekleyen sevkiyat",
      value: String(pendingShipments.length),
      description: "Teslim edilmemiş lojistik kayıtları",
      severity: pendingShipments.some((item) => item.status === "Gümrükte") ? "warning" : pendingShipments.length ? "info" : "success",
      action: { kind: "navigate", nav: "shipments", focus: "pending" },
      records: indexByIds(data, pendingShipments.map((item) => `shipment:${item.id}`)),
    },
    {
      id: "kpi:pipeline",
      label: "Açık pipeline",
      value: formatMoney(openPipeline, "USD"),
      description: `${openCases.length} açık satış kartı`,
      severity: openCases.length ? "info" : "warning",
      action: { kind: "navigate", nav: "sales-cases", focus: "open" },
      records: indexByIds(data, openCases.map((item) => `case:${item.id}`)),
    },
    {
      id: "kpi:profit",
      label: "Tahmini brüt kâr",
      value: formatMoney(estimatedGrossProfit, "USD"),
      description: "Kazanılan ciro üzerinden %18 yönetim varsayımı",
      severity: estimatedGrossProfit > 0 ? "success" : "info",
      action: { kind: "navigate", nav: "reports" },
      records: indexByIds(data, wonCases.map((item) => `case:${item.id}`)),
    },
  ];
}

export function buildManagementInsights(data: OperationStoreSnapshot): ReportSummary {
  const kpis = buildKpiDrilldowns(data);
  const workItems = buildWorkItems(data);
  const overdue = data.payments.filter((p) => p.status === "Overdue");
  const lateServices = data.service.filter(isLateService);
  const expiredOffers = data.offers.filter(isExpiredOffer);
  const customsShipments = data.shipments.filter((s) => s.status === "Gümrükte");
  const reservedStock = data.stock.filter((s) => s.status === "Reserved");
  const approvedOffers = data.offers.filter((o) => o.status === "Approved");
  const openCases = data.cases.filter(isOpenSalesCase);
  const availableStock = data.stock.filter((s) => s.status === "Available");
  const wonCases = data.cases.filter(isWonSalesCase);
  const lostCases = data.cases.filter(isLostSalesCase);
  const conversion = data.offers.length > 0 ? Math.round((approvedOffers.length / data.offers.length) * 100) : 0;
  const collectionBase = data.payments.filter((p) => p.direction === "in" && p.status !== "Cancelled");
  const paidIn = collectionBase.filter((p) => p.status === "Paid").reduce((sum, p) => sum + p.amount, 0);
  const totalIn = collectionBase.reduce((sum, p) => sum + p.amount, 0);
  const collectionRate = totalIn > 0 ? Math.round((paidIn / totalIn) * 100) : 0;

  const risks: ManagementInsight[] = [
    overdue.length
      ? {
          id: "risk:overdue",
          category: "risk",
          title: "Tahsilat gecikmesi",
          description: `${overdue.length} ödeme vadesini geçti; toplam ${summarizePayments(overdue) || "0"}.`,
          metric: String(overdue.length),
          severity: "critical",
          action: { kind: "navigate", nav: "payments", focus: "overdue" },
        }
      : null,
    lateServices.length
      ? {
          id: "risk:service",
          category: "risk",
          title: "Servis SLA riski",
          description: `${lateServices.length} açık servis talebi 7 günü geçti.`,
          metric: String(lateServices.length),
          severity: "critical",
          action: { kind: "navigate", nav: "service-requests", focus: "late" },
        }
      : null,
    expiredOffers.length
      ? {
          id: "risk:offers",
          category: "risk",
          title: "Teklif takip riski",
          description: `${expiredOffers.length} gönderilmiş teklif geçerlilik penceresini aştı.`,
          metric: String(expiredOffers.length),
          severity: "warning",
          action: { kind: "navigate", nav: "offers", focus: "expired" },
        }
      : null,
    customsShipments.length
      ? {
          id: "risk:customs",
          category: "risk",
          title: "Gümrükte bekleyen sevkiyat",
          description: `${customsShipments.length} sevkiyat gümrük aşamasında bekliyor.`,
          metric: String(customsShipments.length),
          severity: "warning",
          action: { kind: "navigate", nav: "shipments", focus: "pending" },
        }
      : null,
    reservedStock.length
      ? {
          id: "risk:reserved-stock",
          category: "risk",
          title: "Rezerve stok kilidi",
          description: `${reservedStock.length} stok kalemi satış/sevkiyat akışında rezerve görünüyor.`,
          metric: String(reservedStock.length),
          severity: "info",
          action: { kind: "navigate", nav: "stock", focus: "reserved" },
        }
      : null,
  ].filter(Boolean) as ManagementInsight[];

  const opportunities: ManagementInsight[] = [
    {
      id: "opp:pipeline",
      category: "opportunity",
      title: "Açık pipeline",
      description: `${openCases.length} açık satış kartında ${formatMoney(openCases.reduce((sum, s) => sum + s.estimatedAmount, 0), "USD")} potansiyel var.`,
      metric: String(openCases.length),
      severity: openCases.length ? "info" : "warning",
      action: { kind: "navigate", nav: "sales-cases", focus: "open" },
    },
    {
      id: "opp:approved-offers",
      category: "opportunity",
      title: "Onaylı teklifler",
      description: `${approvedOffers.length} onaylı teklif sipariş/sevkiyat akışına bağlanabilir.`,
      metric: String(approvedOffers.length),
      severity: approvedOffers.length ? "success" : "info",
      action: { kind: "navigate", nav: "offers", focus: "won" },
    },
    {
      id: "opp:available-stock",
      category: "opportunity",
      title: "Hazır stok",
      description: `${availableStock.length} hazır stok kalemi hızlı satış için kullanılabilir.`,
      metric: String(availableStock.length),
      severity: availableStock.length ? "success" : "info",
      action: { kind: "navigate", nav: "stock", focus: "available" },
    },
  ];

  const actions: ManagementInsight[] = workItems.slice(0, 5).map((item) => ({
    id: `action:${item.id}`,
    category: "action",
    title: item.title,
    description: `${item.subtitle} · ${item.meta}`,
    metric: item.owner,
    severity: item.severity,
    action: item.action,
  }));

  const trends: ManagementInsight[] = [
    {
      id: "trend:conversion",
      category: "trend",
      title: "Teklif dönüşümü",
      description: `${approvedOffers.length}/${data.offers.length} teklif onaylandı.`,
      metric: `%${conversion}`,
      severity: conversion >= 40 ? "success" : conversion >= 25 ? "warning" : "critical",
      action: { kind: "navigate", nav: "offers", focus: "won" },
    },
    {
      id: "trend:collection",
      category: "trend",
      title: "Tahsilat gerçekleşme",
      description: "Giren kasa hareketlerinde ödenmiş tutar oranı.",
      metric: `%${collectionRate}`,
      severity: collectionRate >= 75 ? "success" : collectionRate >= 50 ? "warning" : "critical",
      action: { kind: "navigate", nav: "payments", focus: collectionRate >= 75 ? "paid" : "overdue" },
    },
    {
      id: "trend:sales-outcome",
      category: "trend",
      title: "Satış sonucu",
      description: `${wonCases.length} kazanılan, ${lostCases.length} kaybedilen satış kartı var.`,
      metric: `${wonCases.length}/${lostCases.length}`,
      severity: wonCases.length >= lostCases.length ? "success" : "warning",
      action: { kind: "navigate", nav: "sales-cases", focus: "won" },
    },
  ];

  return { kpis, risks, opportunities, actions, trends };
}

export function buildCustomerTimeline(customerId: string, data: OperationStoreSnapshot): TimelineItem[] {
  const customer = findCustomer(data, customerId);
  const customerCases = data.cases.filter((s) => s.customerId === customerId);
  const caseIds = new Set(customerCases.map((s) => s.id));
  const items: TimelineItem[] = [];

  if (customer) {
    items.push({
      id: `customer:${customer.id}`,
      date: customer.createdAt,
      type: "Firma",
      title: "Firma kaydı oluşturuldu",
      description: `${customer.source || "Kaynak yok"} · ${customer.wantedProduct || "Ürün talebi yok"}`,
      action: { kind: "customer", customerId },
    });
  }

  data.activities.filter((a) => a.customerId === customerId).forEach((a) =>
    items.push({
      id: `activity:${a.id}`,
      date: a.date,
      type: "Aktivite",
      title: a.title,
      description: a.note,
      meta: findUser(data, a.byUserId),
      action: a.salesCaseId ? { kind: "salesCase", salesCaseId: a.salesCaseId } : undefined,
    })
  );

  customerCases.forEach((s) =>
    items.push({
      id: `case:${s.id}`,
      date: s.createdAt,
      type: "Satış",
      title: `${s.requestedProduct} satış kartı`,
      description: `${s.requestedModel} · ${salesStageLabel(s.stage)} · ${formatMoney(s.estimatedAmount, s.currency)}`,
      meta: findUser(data, s.assignedUserId),
      action: { kind: "salesCase", salesCaseId: s.id },
    })
  );

  data.offers.filter((o) => caseIds.has(o.salesCaseId) || o.companyId === customerId).forEach((o) =>
    items.push({
      id: `offer:${o.id}`,
      date: o.date,
      type: "Teklif",
      title: `${o.quoteNo} gönderildi`,
      description: `${formatMoney(o.amount, o.currency)} · ${o.status} · R${o.revision}`,
      action: o.salesCaseId ? { kind: "salesCase", salesCaseId: o.salesCaseId } : undefined,
    })
  );

  data.payments.filter((p) => p.customerId === customerId).forEach((p) =>
    items.push({
      id: `payment:${p.id}`,
      date: p.paidDate ?? p.dueDate,
      type: "Kasa",
      title: `${p.direction === "in" ? "Tahsilat" : "Ödeme"} · ${p.status}`,
      description: `${formatMoney(p.amount, p.currency)} · ${p.note || "Not yok"}`,
      action: { kind: "navigate", nav: "payments", focus: p.status === "Overdue" ? "overdue" : undefined },
    })
  );

  data.service.filter((s) => s.customerId === customerId).forEach((s) =>
    items.push({
      id: `service:${s.id}`,
      date: s.createdAt,
      type: "Servis",
      title: `Servis talebi · ${s.stage}`,
      description: s.description || s.diagnosisNote || s.serviceNote || "Servis kaydı",
      meta: findUser(data, s.assignedUserId),
      action: { kind: "navigate", nav: "service-requests", focus: isOpenService(s) ? "open" : undefined },
    })
  );

  data.machines.filter((m) => m.customerId === customerId).forEach((m) =>
    items.push({
      id: `machine:${m.id}`,
      date: m.installationDate,
      type: "Makine",
      title: `${m.model} kuruldu`,
      description: `${m.serialNumber} · garanti ${m.warrantyEnd}`,
      action: { kind: "customer", customerId },
    })
  );

  data.documents
    .filter((d) => d.companyId === customerId || caseIds.has(d.salesCaseId))
    .forEach((d) =>
      items.push({
        id: `document:${d.id}`,
        date: d.uploadedAt,
        type: "Doküman",
        title: d.fileName,
        description: `${d.type} · ${d.size}`,
        action: { kind: "navigate", nav: documentNav(d.type), query: d.fileName },
      })
    );

  data.deliveries.filter((d) => d.customerId === customerId || caseIds.has(d.salesCaseId)).forEach((d) =>
    items.push({
      id: `delivery:${d.id}`,
      date: d.date,
      type: "Kurulum Tutanağı",
      title: `Teslimat · ${d.status}`,
      description: `İmzalayan: ${d.signedBy || "—"}`,
      action: { kind: "navigate", nav: "installations", query: customer?.name },
    })
  );

  return items.sort((a, b) => (parseDate(b.date)?.getTime() ?? 0) - (parseDate(a.date)?.getTime() ?? 0));
}

const COMMAND_HELP_TEXT = [
  "Şu komutları API kullanmadan mevcut veriden cevaplayabilirim:",
  "• Bugün / görevler / takip işleri",
  "• Firma ara, firma geçmişi, kontak ara, haritada firma",
  "• Açık satış kartları, pipeline, kaybedilen/kazanılan işler",
  "• Teklifler, gönderilen teklifler, onaylanan teklifler",
  "• Geciken ödeme, bekleyen tahsilat, kasa özeti",
  "• Stok, rezerve stok, hazır stok, seri no ara",
  "• Ürün/model/fiyat ara, satış fiyat listesi",
  "• Servis talepleri, servis gecikmeleri, servis kanban, servis fiyat listesi",
  "• Sevkiyat, gümrükte olanlar, teslimatlar, kurulumlar",
  "• Makineler, garanti durumu, doküman/fatura/proforma ara",
  "• Yönetim özeti, riskler, fırsatlar, ciro, dönüşüm ve karlılık",
  "• Raporlar, dashboard, kullanıcı/rol/ayar sayfaları",
].join("\n");

export type AssistantExtras = { pendingCallCount?: number };

export function answerAssistant(input: string, data: OperationStoreSnapshot, extras?: AssistantExtras): AssistantReply {
  const query = input.trim();
  const text = normalize(query);
  const index = buildGlobalSearchIndex(data);

  if (!query || includesAny(text, ["komut", "yardim", "yardım", "ne yapabil", "neler yapabil"])) {
    return {
      text: COMMAND_HELP_TEXT,
      actions: [
        { label: "Bugün ne var?", action: { kind: "navigate", nav: "dashboard", focus: "today" } },
        { label: "Yönetim özeti", action: { kind: "navigate", nav: "reports" } },
        { label: "Global arama", action: { kind: "navigate", nav: "dashboard", focus: "today" } },
        { label: "Harita", action: { kind: "navigate", nav: "sales-map" } },
      ],
    };
  }

  if (includesAny(text, ["arayan", "cagri", "çağrı", "cevapsiz", "cevapsız", "kacan arama", "kaçan arama", "santral"])) {
    const pending = extras?.pendingCallCount;
    return {
      text:
        pending === undefined
          ? "Çağrı Asistanı gelen aramaları firma ve kontaklarla eşleştirip teklif, servis kaydı ve görüşme notu önerir."
          : pending > 0
            ? `${pending} bekleyen çağrı önerisi var. Çağrı Asistanı sayfasından teklif, servis kaydı veya görüşme notu oluşturabilirsiniz.`
            : "Bekleyen çağrı önerisi yok. Manuel arama kaydıyla yeni öneri oluşturabilirsiniz.",
      actions: [
        { label: "Çağrı Asistanı", action: { kind: "navigate", nav: "call-assistant" } },
        { label: "Kontaklar", action: { kind: "navigate", nav: "contacts" } },
      ],
    };
  }

  if (
    includesAny(text, ["bu ay", "gecen ay", "geçen ay", "aylik", "aylık"]) &&
    includesAny(text, ["ciro", "tahsilat", "odeme", "ödeme", "gelir", "kasa"])
  ) {
    const now = new Date();
    const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const previousKey = `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, "0")}`;
    const currentTotal = sumPaidByMonth(data, currentKey);
    const previousTotal = sumPaidByMonth(data, previousKey);
    return {
      text: `Bu ay tahsilat: ${currentTotal || "0"} · Geçen ay: ${previousTotal || "0"}. Detay için ödemeler sayfasına geçebilirsiniz.`,
      actions: [
        { label: "Ödemeler & Kasa", action: { kind: "navigate", nav: "payments", focus: "paid" } },
        { label: "Geciken ödemeler", action: { kind: "navigate", nav: "payments", focus: "overdue" } },
        { label: "Cari Rapor", action: { kind: "navigate", nav: "customer-balances" } },
      ],
    };
  }

  if (
    includesAny(text, ["en iyi", "en cok", "en çok", "top "]) &&
    includesAny(text, ["musteri", "müşteri", "firma", "alici", "alıcı", "ciro"])
  ) {
    const top = topCustomersByPaid(data, 5);
    return {
      text: top.length
        ? `Tahsilata göre öne çıkan ${top.length} müşteri listeleniyor.`
        : "Ödenmiş tahsilat kaydı bulunamadığı için müşteri sıralaması yapılamadı.",
      actions: [
        { label: "Firmalar", action: { kind: "navigate", nav: "customers" } },
        { label: "Cari Rapor", action: { kind: "navigate", nav: "customer-balances" } },
      ],
      results: top.map((entry, i) => ({
        id: `top-customer:${entry.customerId}`,
        type: "Firma",
        title: `${i + 1}. ${customerName(data, entry.customerId)}`,
        subtitle: `Tahsilat: ${summarizePayments(entry.payments)}`,
        badge: `${entry.payments.length} ödeme`,
        keywords: customerName(data, entry.customerId),
        action: { kind: "customer", customerId: entry.customerId },
      })),
    };
  }

  if (includesAny(text, ["teklif"])) {
    const term = stripCommandWords(query, ["teklif", "teklifleri", "teklifler", "durum", "durumu", "firmasinin", "firmasının", "firma"]);
    const customer = term
      ? data.customers.find((c) => normalize(c.name).includes(normalize(term)))
      : undefined;
    if (customer) {
      const caseIds = new Set(data.cases.filter((s) => s.customerId === customer.id).map((s) => s.id));
      const offers = data.offers.filter((o) => caseIds.has(o.salesCaseId) || o.companyId === customer.id);
      const sent = offers.filter((o) => o.status === "Sent").length;
      const approved = offers.filter((o) => o.status === "Approved").length;
      return {
        text: offers.length
          ? `${customer.name} için ${offers.length} teklif var: ${sent} gönderilen, ${approved} onaylı.`
          : `${customer.name} için kayıtlı teklif bulunamadı.`,
        actions: [
          { label: "Firma Kartı", action: { kind: "customer", customerId: customer.id } },
          { label: "Teklifler", action: { kind: "navigate", nav: "offers", query: customer.name } },
        ],
        results: offers.slice(0, 6).map((o) => ({
          id: `offer:${o.id}`,
          type: "Teklif",
          title: `${o.quoteNo} · ${formatMoney(o.amount, o.currency)}`,
          subtitle: `${o.date} · rev ${o.revision}`,
          badge: o.status,
          keywords: [o.quoteNo, customer.name].join(" "),
          action: { kind: "navigate", nav: "offers", query: o.quoteNo },
        })),
      };
    }
  }

  {
    const serialTerm = stripCommandWords(query, ["seri", "no", "numara", "numarasi", "numarası", "servis", "ile", "makine", "makina", "cihaz"]);
    // 1-2 karakterlik generik terimler ("3" gibi) rastgele bir seri numarasına
    // tutunmasın; en az 3 karakterlik anlamlı bir arama terimi iste.
    const machine = serialTerm && serialTerm.length >= 3
      ? data.machines.find((m) => normalize(m.serialNumber).includes(normalize(serialTerm)))
      : undefined;
    if (machine && includesAny(text, ["seri", "servis", "makine", "makina", "cihaz"])) {
      const openTickets = data.service.filter((s) => s.machineId === machine.id && isOpenService(s));
      const owner = customerName(data, machine.customerId);
      return {
        text: openTickets.length
          ? `${machine.serialNumber} (${machine.model}) için ${openTickets.length} açık servis kaydı var. Firma: ${owner}.`
          : `${machine.serialNumber} (${machine.model}) için açık servis kaydı yok. Firma: ${owner}.`,
        actions: [
          { label: "Makineler", action: { kind: "navigate", nav: "machines", query: machine.serialNumber } },
          { label: "Servis Talepleri", action: { kind: "navigate", nav: "service-requests", query: machine.serialNumber } },
          { label: "Firma Kartı", action: { kind: "customer", customerId: machine.customerId } },
        ],
        results: openTickets.slice(0, 5).map((s) => ({
          id: `service:${s.id}`,
          type: "Servis",
          title: s.ticketNo ?? s.diagnosisNote ?? "Servis kaydı",
          subtitle: `${owner} · ${String(s.stage)}`,
          badge: s.priority ?? "normal",
          keywords: [s.ticketNo ?? "", machine.serialNumber].join(" "),
          action: { kind: "navigate", nav: "service-requests", focus: "open", query: s.ticketNo ?? machine.serialNumber },
        })),
      };
    }
  }

  if (includesAny(text, ["yonetim", "yönetim", "risk", "firsat", "fırsat", "ciro", "donusum", "dönüşüm", "karlilik", "karlılık", "marj", "rapor ozeti", "rapor özeti", "stok riski"])) {
    const summary = buildManagementInsights(data);
    const riskIntent = includesAny(text, ["risk", "gecik", "gecikmis", "gecikmiş", "sla", "stok riski"]);
    const opportunityIntent = includesAny(text, ["firsat", "fırsat", "pipeline", "hazir", "hazır"]);
    const trendIntent = includesAny(text, ["donusum", "dönüşüm", "performans", "trend"]);
    const selected = riskIntent
      ? summary.risks
      : opportunityIntent
      ? summary.opportunities
      : trendIntent
      ? summary.trends
      : [...summary.risks.slice(0, 2), ...summary.opportunities.slice(0, 2), ...summary.trends.slice(0, 2)];
    const kpiText = summary.kpis
      .slice(0, 4)
      .map((kpi) => `${kpi.label}: ${kpi.value}`)
      .join(" · ");
    return {
      text: selected.length
        ? `Yönetim özeti: ${summary.risks.length} risk, ${summary.opportunities.length} fırsat, ${summary.actions.length} aksiyon var. ${kpiText}`
        : `Yönetim özeti sakin görünüyor. ${kpiText}`,
      actions: [
        { label: "Raporlar", action: { kind: "navigate", nav: "reports" } },
        { label: "Dashboard", action: { kind: "navigate", nav: "dashboard" } },
        { label: "Riskler", action: { kind: "navigate", nav: "payments", focus: "overdue" } },
        { label: "Fırsatlar", action: { kind: "navigate", nav: "sales-cases", focus: "open" } },
      ],
      results: selected.slice(0, 8).map((item) => ({
        id: item.id,
        type: item.category === "risk" ? "Risk" : item.category === "opportunity" ? "Fırsat" : item.category === "trend" ? "Trend" : "Aksiyon",
        title: item.title,
        subtitle: item.description,
        badge: item.metric,
        keywords: [item.title, item.description, item.metric].join(" "),
        action: item.action,
      })),
    };
  }

  if (includesAny(text, ["bugun", "bugün", "gorev", "görev", "takip", "yapilacak", "yapılacak"])) {
    const work = buildWorkItems(data);
    const critical = work.filter((w) => w.severity === "critical").length;
    const warning = work.filter((w) => w.severity === "warning").length;
    return {
      text: `Bugün takip edilmesi gereken ${work.length} iş var. ${critical} kritik, ${warning} yakın takip görünüyor.`,
      actions: [
        { label: "Dashboard'a git", action: { kind: "navigate", nav: "dashboard", focus: "today" } },
        { label: "Geciken ödemeler", action: { kind: "navigate", nav: "payments", focus: "overdue" } },
        { label: "Açık servisler", action: { kind: "navigate", nav: "service-requests", focus: "open" } },
      ],
      results: asAssistantResults(work.slice(0, 6)),
    };
  }

  if (includesAny(text, ["harita", "konum", "lokasyon", "yakindaki", "yakındaki", "yol tarifi", "rota"])) {
    const term = stripCommandWords(query, ["harita", "konum", "lokasyon", "yakındaki", "yakindaki", "rota"]);
    return {
      text: term
        ? `"${term}" için firma sonuçlarını ve harita sayfasını açabilirsiniz. Pinler v1'de il/ilçe merkezine göre yaklaşık konumdur; yol tarifi gerçek adres metniyle açılır.`
        : "Harita sayfası yakın firmaları gösterir. GPS izin verirse sizin konumunuza, izin yoksa seçilen ile göre sıralar.",
      actions: [
        { label: "Firma Haritası", action: { kind: "navigate", nav: "sales-map", query: term } },
        { label: "Firmalar", action: { kind: "navigate", nav: "customers", query: term } },
      ],
      results: byType(index, "Firma", term || query, ["firma", "harita", "konum"], 5),
    };
  }

  if (includesAny(text, ["firma", "musteri", "müşteri", "tedarikci", "tedarikçi", "gecmis", "geçmiş"])) {
    const results = byType(index, "Firma", query, ["firma", "musteri", "müşteri", "tedarikci", "tedarikçi", "gecmis", "geçmiş"], 6);
    return {
      text: results.length
        ? `${results.length} firma sonucu buldum. Firma kartına girince birleşik geçmiş sekmesinden satış, teklif, ödeme, servis, makine ve dokümanları görebilirsiniz.`
        : `${data.customers.length} firma var; ${data.customers.filter((c) => c.status === "active").length} tanesi aktif.`,
      actions: [
        { label: "Firmalar", action: { kind: "navigate", nav: "customers" } },
        { label: "Firma Haritası", action: { kind: "navigate", nav: "sales-map" } },
      ],
      results,
    };
  }

  if (includesAny(text, ["kontak", "kisi", "kişi", "ilgili", "yetkili"])) {
    const results = byType(index, "Kontak", query, ["kontak", "kisi", "kişi", "ilgili", "yetkili"], 6);
    return {
      text: results.length ? `${results.length} kontak sonucu buldum.` : `${data.contacts.length} kontak kaydı var.`,
      actions: [{ label: "Kontaklar", action: { kind: "navigate", nav: "contacts" } }],
      results,
    };
  }

  if (includesAny(text, ["fiyat listesi", "fiyatlistesi", "price list", "servis fiyat", "satis fiyat", "satış fiyat"])) {
    const serviceIntent = includesAny(text, ["servis"]);
    const salesIntent = includesAny(text, ["satis", "satış"]);
    return {
      text: "Fiyat listesi komutları ürün kataloğu, satış fiyat listesi ve servis fiyat listesine yönlendirir.",
      actions: [
        { label: serviceIntent ? "Servis fiyat listesi" : "Satış fiyat listesi", action: { kind: "navigate", nav: serviceIntent ? "service-price-list" : "sales-price-list" } },
        { label: salesIntent ? "Satış fiyat listesi" : "Servis fiyat listesi", action: { kind: "navigate", nav: salesIntent ? "sales-price-list" : "service-price-list" } },
        { label: "Ürünler", action: { kind: "navigate", nav: "products", query: stripCommandWords(query, ["fiyat", "liste", "listesi"]) } },
      ],
    };
  }

  if (includesAny(text, ["satis", "satış", "kart", "firsat", "fırsat", "pipeline", "kayip", "kayıp", "kazanan"])) {
    const open = data.cases.filter(isOpenSalesCase);
    const lost = data.cases.filter((s) => s.isLost || String(s.stage) === "Lost").length;
    const pipeline = open.reduce((sum, s) => sum + s.estimatedAmount, 0);
    const results = byType(index, "Satış", query, ["satis", "satış", "kart", "firsat", "fırsat", "pipeline"], 6);
    return {
      text: `${open.length} açık satış kartı var. Açık pipeline yaklaşık ${formatMoney(pipeline, "USD")} seviyesinde; ${lost} kayıp/iptal kayıt görünüyor.`,
      actions: [
        { label: "Açık kartlar", action: { kind: "navigate", nav: "sales-cases", focus: "open" } },
        { label: "Kanban", action: { kind: "navigate", nav: "kanban", focus: "open" } },
      ],
      results,
    };
  }

  if (includesAny(text, ["teklif", "quote", "onay", "gonderilen", "gönderilen", "revizyon"])) {
    const sent = data.offers.filter((o) => o.status === "Sent");
    const approved = data.offers.filter((o) => o.status === "Approved");
    const draft = data.offers.filter((o) => o.status === "Draft");
    const results = byType(index, "Teklif", query, ["teklif", "quote", "onay", "gonderilen", "gönderilen", "revizyon"], 6);
    return {
      text: `${data.offers.length} teklif var: ${sent.length} gönderilen, ${approved.length} onaylı, ${draft.length} taslak.`,
      actions: [
        { label: "Teklifler", action: { kind: "navigate", nav: "offers" } },
        { label: "Süresi geçen teklifler", action: { kind: "navigate", nav: "offers", focus: "expired" } },
        { label: "Onaylı teklifler", action: { kind: "navigate", nav: "offers", focus: "won" } },
        { label: "Satış kartları", action: { kind: "navigate", nav: "sales-cases" } },
      ],
      results,
    };
  }

  if (includesAny(text, ["gecik", "gecikmis", "gecikmiş", "odeme", "ödeme", "tahsilat", "kasa", "borc", "borç", "alacak"])) {
    const overdue = data.payments.filter((p) => p.status === "Overdue");
    const pending = data.payments.filter((p) => p.status === "Pending");
    const paid = data.payments.filter((p) => p.status === "Paid");
    const showOverdue = includesAny(text, ["gecik", "gecikmis", "gecikmiş"]);
    const base = showOverdue ? overdue : pending.length ? pending : overdue;
    return {
      text: `${overdue.length} gecikmiş, ${pending.length} bekleyen, ${paid.length} ödenmiş hareket var. Gecikmiş toplam: ${summarizePayments(overdue) || "0"}.`,
      actions: [
        { label: "Geciken ödemeler", action: { kind: "navigate", nav: "payments", focus: "overdue" } },
        { label: "Bekleyen tahsilat", action: { kind: "navigate", nav: "payments", focus: "upcoming" } },
        { label: "Ödenmiş hareketler", action: { kind: "navigate", nav: "payments", focus: "paid" } },
      ],
      results: base.slice(0, 6).map((p) => ({
        id: `pay:${p.id}`,
        type: "Ödeme",
        title: customerName(data, p.customerId),
        subtitle: `${formatMoney(p.amount, p.currency)} · vade ${p.dueDate} · ${p.direction === "in" ? "Giren" : "Çıkan"}`,
        badge: p.status,
        keywords: customerName(data, p.customerId),
        action: { kind: "navigate", nav: "payments", focus: p.status === "Overdue" ? "overdue" : p.status === "Paid" ? "paid" : "upcoming" },
      })),
    };
  }

  if (includesAny(text, ["stok", "seri", "rezerve", "hazir", "hazır", "depo", "envanter"])) {
    const available = data.stock.filter((s) => s.status === "Available");
    const reserved = data.stock.filter((s) => s.status === "Reserved");
    const sold = data.stock.filter((s) => s.status === "Sold");
    const stockTerm = stripCommandWords(query, ["stok", "seri", "rezerve", "hazir", "hazır", "depo", "envanter"]);
    const reservedIntent = includesAny(text, ["rezerve"]);
    const availableIntent = includesAny(text, ["hazir", "hazır"]);
    const scopedStock = reservedIntent ? reserved : availableIntent ? available : data.stock;
    const results = stockTerm
      ? byType(index, "Stok", stockTerm, [], 6)
      : scopedStock.slice(0, 6).map((s): SearchResult => ({
          id: `stock:${s.id}`,
          type: "Stok",
          title: `${s.counterModel} · ${s.serialNumber}`,
          subtitle: `${s.stockCode} · ${s.warehouse}`,
          badge: s.status,
          keywords: [s.brand, s.counterType, s.counterModel, s.serialNumber, s.stockCode].join(" "),
          action: { kind: "navigate", nav: "stock", focus: s.status === "Reserved" ? "reserved" : undefined, query: s.counterModel },
        }));
    return {
      text: `${available.length} hazır, ${reserved.length} rezerve, ${sold.length} satılan stok kalemi var.`,
      actions: [
        { label: "Stok", action: { kind: "navigate", nav: "stock" } },
        { label: "Rezerve stok", action: { kind: "navigate", nav: "stock", focus: "reserved" } },
        { label: "Hazır stok", action: { kind: "navigate", nav: "stock", focus: "available" } },
      ],
      results,
    };
  }

  if (includesAny(text, ["urun", "ürün", "model", "fiyat", "liste", "opsiyon", "muadil"])) {
    const active = data.products.filter((p) => p.status === "active").length;
    const results = byType(index, "Ürün", query, ["urun", "ürün", "model", "fiyat", "liste", "opsiyon", "muadil"], 6);
    return {
      text: `${data.products.length} ürün/model var; ${active} aktif ürün listeleniyor.`,
      actions: [
        { label: "Ürünler", action: { kind: "navigate", nav: "products", query: stripCommandWords(query, ["urun", "ürün", "model", "fiyat"]) } },
        { label: "Satış fiyat listesi", action: { kind: "navigate", nav: "sales-price-list" } },
      ],
      results,
    };
  }

  if (includesAny(text, ["servis", "ariza", "arıza", "sla", "bakim", "bakım", "kanban", "teknik"])) {
    const open = data.service.filter(isOpenService);
    const late = data.service.filter((s) => isOpenService(s) && Math.abs(daysUntil(s.createdAt) ?? 0) > 7);
    const results = byType(index, "Servis", query, ["servis", "ariza", "arıza", "sla", "bakim", "bakım", "kanban", "teknik"], 6);
    return {
      text: `${open.length} açık servis talebi var. ${late.length} kayıt SLA/gecikme riski taşıyor.`,
      actions: [
        { label: "Açık servisler", action: { kind: "navigate", nav: "service-requests", focus: "open" } },
        { label: "Servis gecikmeleri", action: { kind: "navigate", nav: "service-requests", focus: "late" } },
        { label: "Servis Kanban", action: { kind: "navigate", nav: "service-kanban", focus: "open" } },
      ],
      results,
    };
  }

  if (includesAny(text, ["sevkiyat", "kargo", "lojistik", "gumruk", "gümrük", "yolda", "eta"])) {
    const pending = data.shipments.filter((s) => s.status !== "Teslim Edildi");
    const customs = data.shipments.filter((s) => s.status === "Gümrükte");
    const results = byType(index, "Sevkiyat", query, ["sevkiyat", "kargo", "lojistik", "gumruk", "gümrük", "yolda", "eta"], 6);
    return {
      text: `${pending.length} sevkiyat açık; ${customs.length} kayıt gümrükte görünüyor.`,
      actions: [
        { label: "Bekleyen sevkiyatlar", action: { kind: "navigate", nav: "shipments", focus: "pending" } },
        { label: "Teslim edilenler", action: { kind: "navigate", nav: "shipments", focus: "delivered" } },
      ],
      results,
    };
  }

  if (includesAny(text, ["teslim", "teslimat", "imza", "form"])) {
    const waiting = data.deliveries.filter((d) => d.status === "Bekliyor");
    const results = byType(index, "Kurulum Tutanağı", query, ["teslim", "teslimat", "imza", "form", "kurulum"], 6);
    return {
      text: `${data.deliveries.length} teslimat kaydı var; ${waiting.length} tanesi bekliyor.`,
      actions: [{ label: "Kurulum Tutanakları", action: { kind: "navigate", nav: "installations" } }],
      results,
    };
  }

  if (includesAny(text, ["kurulum", "montaj", "saha"])) {
    const waitingDeliveries = data.deliveries.filter((d) => d.status === "Bekliyor");
    const pendingShipments = data.shipments.filter((s) => s.status !== "Teslim Edildi").length;
    return {
      text: `${waitingDeliveries.length} teslimat bekliyor, ${pendingShipments} sevkiyat yolda. Kurulum planı ve formlar için saha operasyonu ekranına geçebilirsiniz.`,
      actions: [
        { label: "Kurulumlar", action: { kind: "navigate", nav: "installations" } },
        { label: "Kurulum Tutanakları", action: { kind: "navigate", nav: "installations" } },
        { label: "Sevkiyatlar", action: { kind: "navigate", nav: "shipments", focus: "pending" } },
      ],
      results: waitingDeliveries.slice(0, 5).map((d) => ({
        id: `delivery:${d.id}`,
        type: "Kurulum Tutanağı",
        title: customerName(data, d.customerId),
        subtitle: `Planlanan: ${d.date}`,
        badge: d.status,
        keywords: customerName(data, d.customerId),
        action: { kind: "navigate", nav: "installations" },
      })),
    };
  }

  if (includesAny(text, ["makine", "cihaz", "varlik", "varlık", "garanti", "seri no"])) {
    const active = data.machines.filter((m) => m.status === "Active");
    const out = data.machines.filter((m) => m.status === "Out of Warranty");
    const results = byType(index, "Makine", query, ["makine", "cihaz", "varlik", "varlık", "garanti", "seri", "no"], 6);
    return {
      text: `${data.machines.length} makine kaydı var. ${active.length} aktif, ${out.length} garanti dışı görünüyor.`,
      actions: [{ label: "Makineler", action: { kind: "navigate", nav: "machines" } }],
      results,
    };
  }

  if (includesAny(text, ["dokuman", "doküman", "belge", "fatura", "proforma", "sozlesme", "sözleşme", "pdf"])) {
    const results = byType(index, "Doküman", query, ["dokuman", "doküman", "belge", "fatura", "proforma", "sozlesme", "sözleşme", "pdf"], 6);
    const proformas = data.documents.filter((d) => d.type === "Proforma").length;
    const contracts = data.documents.filter((d) => d.type === "Contract").length;
    return {
      text: `${data.documents.length} doküman var. ${proformas} proforma ve ${contracts} sözleşme tek ticari belge merkezinde kaynak kayıtlarıyla izleniyor.`,
      actions: [
        { label: "Ticari belge merkezi", action: { kind: "navigate", nav: "documents" } },
      ],
      results,
    };
  }

  if (includesAny(text, ["rapor", "dashboard", "kpi", "analiz", "performans"])) {
    return {
      text: "KPI için Dashboard, detay analiz için Raporlar ekranını açabilirsiniz. Dashboard kartları ilgili listeye drilldown yapar.",
      actions: [
        { label: "Dashboard", action: { kind: "navigate", nav: "dashboard" } },
        { label: "Raporlar", action: { kind: "navigate", nav: "reports" } },
      ],
    };
  }

  if (includesAny(text, ["kullanici", "kullanıcı", "rol", "yetki", "departman", "ayar"])) {
    return {
      text: "Yönetim komutları kullanıcı, rol, departman ve ayar sayfalarına yönlendirir. Yetkiniz yoksa aksiyon gizlenir.",
      actions: [
        { label: "Kullanıcılar", action: { kind: "navigate", nav: "users" } },
        { label: "Roller", action: { kind: "navigate", nav: "roles" } },
        { label: "Ayarlar", action: { kind: "navigate", nav: "settings" } },
      ],
    };
  }

  const results = searchOperationIndex(query, index, 8);
  if (results.length) {
    return {
      text: `${results.length} sonuç buldum. İlk sonuçtan devam edebilir veya ilgili sayfaya gidebilirsiniz.`,
      actions: [
        { label: "Firmalar", action: { kind: "navigate", nav: "customers" } },
        { label: "Satış kartları", action: { kind: "navigate", nav: "sales-cases" } },
        { label: "Ürünler", action: { kind: "navigate", nav: "products", query } },
      ],
      results,
    };
  }

  return {
    text: "Bu komut için sonuç bulamadım. Firma adı, kontak adı, teklif no, stok kodu, seri no, model, sevkiyat no veya servis notu ile tekrar arayın. “Komutlar” yazarak tüm desteklenen komutları görebilirsiniz.",
    actions: [
      { label: "Komutlar", action: { kind: "navigate", nav: "dashboard", focus: "today" } },
      { label: "Global arama", action: { kind: "navigate", nav: "dashboard", focus: "today" } },
      { label: "Firma Haritası", action: { kind: "navigate", nav: "sales-map" } },
    ],
  };
}
