import { useEffect, useMemo, useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { cn } from "../ui/utils";
import {
  AlertTriangle, BriefcaseBusiness, ChevronDown, CircleDollarSign, Eraser, LayoutDashboard, ListChecks, PackageCheck,
  PenLine, RotateCcw, Settings2, Target, Trash2, TrendingUp, Truck, Users, Wrench, Zap,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { reportService } from "../../../lib/services";

/**
 * Kullanıcı / departman / rol için ortak hedef belirleme diyaloğu ve hedef form
 * yardımcıları. UsersPage'deki UserTargetDialog'dan genelleştirildi; rol kapsamı
 * kaydedilirken hedef roldeki tüm kullanıcılara kişisel hedef olarak kopyalanır.
 */

export type UserTargetType = "sales" | "service" | "finance" | "purchase" | "operations" | "logistics" | "other";
type UserTargetUnit = "count" | "amount";
type TargetTrackingMode = "automatic" | "manual";
type TargetMetricKey =
  | "salesAmount"
  | "salesNewCustomers"
  | "quoteTarget"
  | "visitTarget"
  | "callTarget"
  | "serviceCompleted"
  | "serviceAmount"
  | "digitalLeadTarget"
  | "digitalConversionTarget"
  | "digitalBudget"
  | "paymentsInAmount"
  | "purchaseInvoiceAmount"
  | "purchaseOrderAmount"
  | "purchaseOrderCount"
  | "salesOrderAmount"
  | "salesOrderCount"
  | "installationCompleted";

export type UserTargetItem = {
  targetType: UserTargetType;
  category: string;
  activity: string;
  description: string;
  unit: UserTargetUnit;
  defaultTarget: string;
  target: string;
  metricKey?: TargetMetricKey | null;
  trackingMode?: TargetTrackingMode;
  actual?: number | null;
  pct?: number | null;
};

type TargetTemplateItem = Omit<UserTargetItem, "target" | "actual" | "pct">;

export type UserTarget = {
  period: string;
  salesAmount: string;
  currency: "USD";
  salesNewCustomers: string;
  serviceAmount: string;
  serviceCompleted: string;
  digitalLeadTarget: string;
  digitalConversionTarget: string;
  digitalBudget: string;
  visitTarget: string;
  callTarget: string;
  quoteTarget: string;
  targetItems: UserTargetItem[];
  note: string;
};

export const currentPeriod = () => new Date().toISOString().slice(0, 7);

const expectedPeriodPct = (period: string) => {
  const now = new Date();
  const current = now.toISOString().slice(0, 7);
  if (period < current) return 100;
  if (period > current) return 0;
  const [year, month] = period.split("-").map(Number);
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Math.round((now.getUTCDate() / days) * 100);
};

export const TARGET_TYPE_ORDER: UserTargetType[] = ["sales", "service", "finance", "purchase", "operations", "logistics", "other"];

const TARGET_TYPE_META: Record<UserTargetType, { label: string; title: string; icon: LucideIcon }> = {
  sales: { label: "Satış", title: "Satış Hedefleri", icon: TrendingUp },
  service: { label: "Servis", title: "Servis Hedefleri", icon: Wrench },
  finance: { label: "Finans", title: "Finans Hedefleri", icon: CircleDollarSign },
  purchase: { label: "Satınalma", title: "Satınalma Hedefleri", icon: PackageCheck },
  operations: { label: "Operasyon", title: "Operasyon Hedefleri", icon: Settings2 },
  logistics: { label: "Lojistik", title: "Lojistik Hedefleri", icon: Truck },
  other: { label: "Diğer", title: "Diğer Hedefler", icon: BriefcaseBusiness },
};

const sharedVisitTargets: Omit<TargetTemplateItem, "targetType">[] = [
  {
    category: "ZİYARET",
    activity: "MÜŞTERİ ZİYARETİ",
    description: "Halihazırdaki cari hesaplarda bulunan müşterimize yapılan ziyaret",
    unit: "count",
    defaultTarget: "20",
  },
  {
    category: "ZİYARET",
    activity: "TEKLİF TAKİP ZİYARETİ",
    description: "Verilen teklifler ile ilgili müşterilerle değerlendirme toplantısı yapılacak.",
    unit: "count",
    defaultTarget: "30",
  },
  {
    category: "ZİYARET",
    activity: "YENİ MÜŞTERİ ZİYARETİ",
    description: "Sistemimizde kayıtlı olmayan, daha önce teklif verilmemiş ve ziyaret edilmemiş potansiyel müşteri ziyareti",
    unit: "count",
    defaultTarget: "30",
  },
  {
    category: "ZİYARET",
    activity: "FUAR ZİYARETİ",
    description: "Sektörel ve ilgili potansiyel sektör fuarları ziyaret edilecek, müşterilerimizin standları ziyaret edilip, potansiyel firmalar ile görüşmeler sağlanacak.",
    unit: "count",
    defaultTarget: "2",
  },
];
const sharedDigitalTargets: Omit<TargetTemplateItem, "targetType">[] = [
  {
    category: "DİJİTAL PAZARLAMA",
    activity: "ÇEVRİMİÇİ TOPLANTI",
    description: "Potansiyel müşterilerle ilk tanışma toplantısı ve şirket sunumu için Zoom veya Windows Teams üzerinden toplantı yapılacak",
    unit: "count",
    defaultTarget: "8",
  },
  {
    category: "DİJİTAL PAZARLAMA",
    activity: "LINKEDIN PAYLAŞIMI",
    description: "Kurumsal sosyal medya hesaplarının gönderilerinin yeniden paylaşılması, web sitesi ürünlerinin link ile paylaşılması, üretici firmaların gönderilerinin yeniden paylaşılması",
    unit: "count",
    defaultTarget: "10",
  },
  {
    category: "DİJİTAL PAZARLAMA",
    activity: "INSTAGRAM PAYLAŞIMI",
    description: "Şirket ve ürünler ile ilgili hikaye paylaşımı",
    unit: "count",
    defaultTarget: "4",
  },
  {
    category: "DİJİTAL PAZARLAMA",
    activity: "YOUTUBE PAYLAŞIMI",
    description: "Haksan Makina Youtube hesabındaki videoların linkedin ve instagram hesaplarında paylaşılması",
    unit: "count",
    defaultTarget: "4",
  },
  {
    category: "DİJİTAL PAZARLAMA",
    activity: "WHATSAPP DURUM",
    description: "Şahsi ve şirket hatlarında Haksan Makina paylaşımı",
    unit: "count",
    defaultTarget: "10",
  },
];
const sharedQuoteTargets: Omit<TargetTemplateItem, "targetType">[] = [
  {
    category: "TEKLİF",
    activity: "YENİ TEKLİF",
    description: "Yeni tekliflerde firma baz alınacak",
    unit: "count",
    defaultTarget: "30",
  },
  {
    category: "TEKLİF",
    activity: "TEKLİF DURUM GÜNCELLEMESİ",
    description: "Sistemde açık olan tekliflerin durumlarının müşteri ile iletişim kurularak güncellenmesi, iptal veya kayıp olan tekliflerin teklif sahipleri ile iletişim kurularak güncellenmesi",
    unit: "count",
    defaultTarget: "30",
  },
];
const inferTemplateMetricKey = (targetType: UserTargetType, row: Omit<TargetTemplateItem, "targetType">): TargetMetricKey | null => {
  const text = `${row.category} ${row.activity}`.toLocaleUpperCase("tr-TR");
  if (text.includes("TAHSİLAT")) return "paymentsInAmount";
  if (targetType === "sales" && text.includes("SATIŞ HEDEF")) return "salesOrderCount";
  if (targetType === "sales" && row.unit === "amount") return "salesAmount";
  if (targetType === "service" && text.includes("KURULUM")) return "installationCompleted";
  if (targetType === "service" && (text.includes("SERVİS") || text.includes("BAKIM"))) return row.unit === "amount" ? "serviceAmount" : "serviceCompleted";
  if (targetType === "finance" && text.includes("ALIŞ FATUR")) return "purchaseInvoiceAmount";
  if (targetType === "finance" && row.unit === "amount") return "paymentsInAmount";
  if (targetType === "purchase") return row.unit === "amount" ? "purchaseOrderAmount" : "purchaseOrderCount";
  if (targetType === "operations" && text.includes("SATIŞ SİPARİŞ")) return row.unit === "amount" ? "salesOrderAmount" : "salesOrderCount";
  if (targetType === "operations" && text.includes("KURULUM")) return "installationCompleted";
  if (text.includes("TEKLİF")) return "quoteTarget";
  if (text.includes("ZİYARET")) return "visitTarget";
  if (text.includes("ARAMA")) return "callTarget";
  if (text.includes("DİJİTAL") || text.includes("LEAD")) return "digitalLeadTarget";
  return null;
};
const withTargetType = (targetType: UserTargetType, rows: Omit<TargetTemplateItem, "targetType">[]): TargetTemplateItem[] =>
  rows.map((row) => {
    const metricKey = row.metricKey ?? inferTemplateMetricKey(targetType, row);
    return {
      targetType,
      ...row,
      metricKey,
      trackingMode: row.trackingMode ?? (metricKey ? "automatic" : "manual"),
    };
  });
export const TARGET_TEMPLATES: Record<UserTargetType, TargetTemplateItem[]> = {
  sales: withTargetType("sales", [
    {
      category: "SATIŞ",
      activity: "SATIŞ HEDEFİ",
      description: "Tezgah teslimi yapıldığında hedef gerçekleşmiş olur.",
      unit: "count",
      defaultTarget: "3",
    },
    {
      category: "SATIŞ",
      activity: "TAHSİLAT HEDEFİ",
      description: "Satılan tezgahların bedellerinin tahsil edilmesi, sıralı ödemelerin takip edilmesi, açık kalan bakiyenin aylık ciro içindeki payı maksimum %5 olmalı.",
      unit: "amount",
      defaultTarget: "",
    },
    ...sharedVisitTargets,
    {
      category: "ARAMA",
      activity: "MÜŞTERİ MEMNUNİYET ARAMASI",
      description: "Halihazırdaki cari hesaplarda bulunan müşterimize yapılan telefon araması",
      unit: "count",
      defaultTarget: "60",
    },
    {
      category: "ARAMA",
      activity: "TEKLİF TAKİP ARAMASI",
      description: "Özellikle şehir dışı müşterilerin teklif durumları ile ilgili aramalar",
      unit: "count",
      defaultTarget: "40",
    },
    {
      category: "ARAMA",
      activity: "YENİ MÜŞTERİ ARAMASI",
      description: "Sistemimizde kayıtlı olmayan, daha önce teklif verilmemiş ve aranmamış potansiyel müşteri araması",
      unit: "count",
      defaultTarget: "40",
    },
    ...sharedDigitalTargets,
    ...sharedQuoteTargets,
  ]),
  service: withTargetType("service", [
    {
      category: "SATIŞ",
      activity: "DIŞ SERVİS",
      description: "Satışını bizim yapmadığımız, tezgahımızı kullanmayan firmalara servis hizmet verme",
      unit: "amount",
      defaultTarget: "50000",
    },
    {
      category: "SATIŞ",
      activity: "PERİYODİK BAKIM",
      description: "Periyodik bakım hizmet satışı",
      unit: "count",
      defaultTarget: "3",
    },
    {
      category: "SATIŞ",
      activity: "YEDEK PARÇA & AKSESUAR SATIŞI",
      description: "Yedek parça ve tezgah aksesuarlarının satışı",
      unit: "amount",
      defaultTarget: "25000",
    },
    ...sharedVisitTargets,
    {
      category: "ARAMA",
      activity: "HİZMET MEMNUNİYET ARAMASI",
      description: "Servis hizmeti verdiğimiz müşterilerin servis hizmet sonrası aranması, tezgahın bakım/onarım sonrası durumu hakkında bilgi alınması ve hizmet kalitemiz için müşterinin aranması",
      unit: "count",
      defaultTarget: "40",
    },
    {
      category: "ARAMA",
      activity: "TEKLİF TAKİP ARAMASI",
      description: "Teklif verdiğimiz müşterinin teklifin durumu hakkında aranması",
      unit: "count",
      defaultTarget: "40",
    },
    {
      category: "ARAMA",
      activity: "YENİ MÜŞTERİ ARAMASI",
      description: "Servis hizmeti verebileceğimiz yeni müşteri tarama araması",
      unit: "count",
      defaultTarget: "25",
    },
    ...sharedDigitalTargets,
    ...sharedQuoteTargets,
    {
      category: "TEKNİK",
      activity: "DEMO PARÇA ÜRETİMİ",
      description: "Tezgahlarımızın teknik kabiliyet ve kapasitesini gösteren demo parça işlenmesi, video çekimi",
      unit: "count",
      defaultTarget: "30",
    },
    {
      category: "TEKNİK",
      activity: "MÜŞTERİ BİLGİ PAYLAŞIMI",
      description: "Tezgahların kullanım kolaylığı sağlayan fonksiyonlarını, gizli özelliklerini, bakım ipuçları v.s. gibi müşterilere mail yoluyla bilgi paylaşımı, Youtube kanalımıza kısa video hazırlanması",
      unit: "count",
      defaultTarget: "30",
    },
    {
      category: "TEKNİK",
      activity: "TEZGAH ARGE ÇALIŞMASI",
      description: "Tezgahların teknik olarak eksik kalan, yetersiz kalan ve geliştirilmesi gerek konuların raporlanması",
      unit: "count",
      defaultTarget: "1",
    },
  ]),
  finance: withTargetType("finance", [
    {
      category: "FİNANS",
      activity: "TAHSİLAT",
      description: "Dönem içinde müşterilerden gelen tahsilat toplamı.",
      unit: "amount",
      defaultTarget: "",
      metricKey: "paymentsInAmount",
    },
    {
      category: "FİNANS",
      activity: "ALIŞ FATURASI KONTROLÜ",
      description: "Dönem içinde işlenen alış faturalarının toplam tutarı.",
      unit: "amount",
      defaultTarget: "",
      metricKey: "purchaseInvoiceAmount",
    },
    {
      category: "FİNANS",
      activity: "CARİ MUTABAKAT",
      description: "Müşteri ve tedarikçi cari mutabakatlarının tamamlanması.",
      unit: "count",
      defaultTarget: "20",
      trackingMode: "manual",
    },
    {
      category: "FİNANS",
      activity: "VADE TAKİBİ",
      description: "Vadesi yaklaşan ve geciken ödemelerin takip edilmesi.",
      unit: "count",
      defaultTarget: "30",
      trackingMode: "manual",
    },
  ]),
  purchase: withTargetType("purchase", [
    {
      category: "SATINALMA",
      activity: "SATINALMA SİPARİŞİ",
      description: "Dönem içinde oluşturulan satınalma siparişi adedi.",
      unit: "count",
      defaultTarget: "20",
      metricKey: "purchaseOrderCount",
    },
    {
      category: "SATINALMA",
      activity: "SATINALMA SİPARİŞ TUTARI",
      description: "Dönem içinde oluşturulan satınalma siparişlerinin toplam tutarı.",
      unit: "amount",
      defaultTarget: "",
      metricKey: "purchaseOrderAmount",
    },
    {
      category: "TEDARİK",
      activity: "TEDARİKÇİ GÖRÜŞMESİ",
      description: "Fiyat, teslim ve termin takibi için yapılan tedarikçi görüşmeleri.",
      unit: "count",
      defaultTarget: "30",
      trackingMode: "manual",
    },
  ]),
  operations: withTargetType("operations", [
    {
      category: "OPERASYON",
      activity: "SATIŞ SİPARİŞİ",
      description: "Dönem içinde satış siparişine çevrilen işler.",
      unit: "count",
      defaultTarget: "15",
      metricKey: "salesOrderCount",
    },
    {
      category: "OPERASYON",
      activity: "SATIŞ SİPARİŞ TUTARI",
      description: "Dönem içinde oluşturulan satış siparişlerinin toplam tutarı.",
      unit: "amount",
      defaultTarget: "",
      metricKey: "salesOrderAmount",
    },
    {
      category: "OPERASYON",
      activity: "KURULUM TAMAMLAMA",
      description: "Dönem içinde tamamlanan kurulum işleri.",
      unit: "count",
      defaultTarget: "8",
      metricKey: "installationCompleted",
    },
  ]),
  logistics: withTargetType("logistics", [
    {
      category: "LOJİSTİK",
      activity: "SEVKİYAT PLANLAMA",
      description: "Dönem içinde planlanan sevkiyat operasyonları.",
      unit: "count",
      defaultTarget: "20",
      trackingMode: "manual",
    },
    {
      category: "LOJİSTİK",
      activity: "TESLİMAT TAKİBİ",
      description: "Teslimat, evrak ve gümrük adımlarının takip edilmesi.",
      unit: "count",
      defaultTarget: "20",
      trackingMode: "manual",
    },
    {
      category: "LOJİSTİK",
      activity: "GECİKME AKSİYONU",
      description: "Geciken teslimatlarda müşteri ve tedarikçi iletişimi.",
      unit: "count",
      defaultTarget: "10",
      trackingMode: "manual",
    },
  ]),
  other: withTargetType("other", [
    {
      category: "GENEL",
      activity: "PROJE / İYİLEŞTİRME",
      description: "Departmana özel proje, süreç iyileştirme veya operasyonel iş hedefi.",
      unit: "count",
      defaultTarget: "1",
      trackingMode: "manual",
    },
    {
      category: "GENEL",
      activity: "EĞİTİM / DOKÜMANTASYON",
      description: "Ekip içi eğitim, süreç dokümantasyonu veya bilgi paylaşımı.",
      unit: "count",
      defaultTarget: "2",
      trackingMode: "manual",
    },
  ]),
};
const allTargetTemplates = () => TARGET_TYPE_ORDER.flatMap((targetType) => TARGET_TEMPLATES[targetType]);
export const targetItemKey = (item: Pick<UserTargetItem, "targetType" | "category" | "activity">) =>
  `${item.targetType}:${item.category}:${item.activity}`;
const defaultTargetItems = (): UserTargetItem[] => allTargetTemplates().map((item) => ({ ...item, target: item.defaultTarget }));
export const emptyTarget = (): UserTarget => ({
  period: currentPeriod(),
  salesAmount: "",
  currency: "USD",
  salesNewCustomers: "",
  serviceAmount: "",
  serviceCompleted: "",
  digitalLeadTarget: "",
  digitalConversionTarget: "",
  digitalBudget: "",
  visitTarget: "",
  callTarget: "",
  quoteTarget: "",
  targetItems: defaultTargetItems(),
  note: "",
});
const targetValue = (value: unknown) => (value === null || value === undefined ? "" : String(value));
export const parseTargetNumber = (value: string) => {
  const compact = value.trim().replace(/\s/g, "");
  if (!compact) return null;
  const turkishThousands = /^\d{1,3}(\.\d{3})+(,\d+)?$/;
  const plainNumber = /^\d+([.,]\d+)?$/;
  if (!turkishThousands.test(compact) && !plainNumber.test(compact)) return null;
  const normalized = turkishThousands.test(compact) ? compact.replace(/\./g, "").replace(",", ".") : compact.replace(",", ".");
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
};
export const mergeTargetItems = (items: unknown): UserTargetItem[] => {
  const incoming = Array.isArray(items) ? items : [];
  const byKey = new Map<string, any>();
  incoming.forEach((item) => {
    if (!item || typeof item !== "object") return;
    const maybe = item as Partial<UserTargetItem>;
    if (!maybe.targetType || !maybe.category || !maybe.activity) return;
    byKey.set(targetItemKey(maybe as UserTargetItem), maybe);
  });
  return allTargetTemplates().map((template) => {
    const existing = byKey.get(targetItemKey(template as UserTargetItem));
    return {
      ...template,
      target: targetValue(existing?.target ?? template.defaultTarget),
      metricKey: existing?.metricKey ?? template.metricKey,
      trackingMode: existing?.trackingMode ?? template.trackingMode,
    };
  });
};
const targetNumberOrNull = (value: string) => {
  const numeric = parseTargetNumber(value);
  return numeric === null ? null : numeric;
};
export const targetFromApi = (row: any): UserTarget => ({
  period: row.period ?? currentPeriod(),
  currency: "USD",
  salesAmount: targetValue(row.salesAmount),
  salesNewCustomers: targetValue(row.salesNewCustomers),
  serviceAmount: targetValue(row.serviceAmount),
  serviceCompleted: targetValue(row.serviceCompleted),
  digitalLeadTarget: targetValue(row.digitalLeadTarget),
  digitalConversionTarget: targetValue(row.digitalConversionTarget),
  digitalBudget: targetValue(row.digitalBudget),
  visitTarget: targetValue(row.visitTarget),
  callTarget: targetValue(row.callTarget),
  quoteTarget: targetValue(row.quoteTarget),
  targetItems: mergeTargetItems(row.targetItems),
  note: row.note ?? "",
});
export const targetToApi = (target: UserTarget) => ({
  period: target.period,
  currency: "USD" as const,
  salesAmount: targetNumberOrNull(target.salesAmount),
  salesNewCustomers: targetNumberOrNull(target.salesNewCustomers),
  serviceAmount: targetNumberOrNull(target.serviceAmount),
  serviceCompleted: targetNumberOrNull(target.serviceCompleted),
  digitalLeadTarget: targetNumberOrNull(target.digitalLeadTarget),
  digitalConversionTarget: targetNumberOrNull(target.digitalConversionTarget),
  digitalBudget: targetNumberOrNull(target.digitalBudget),
  visitTarget: targetNumberOrNull(target.visitTarget),
  callTarget: targetNumberOrNull(target.callTarget),
  quoteTarget: targetNumberOrNull(target.quoteTarget),
  targetItems: target.targetItems.map(({ targetType, category, activity, description, unit, target, metricKey, trackingMode }) => ({
    targetType,
    category,
    activity,
    description,
    unit,
    target: target.trim(),
    metricKey: metricKey ?? undefined,
    trackingMode: trackingMode ?? (metricKey ? "automatic" : "manual"),
  })),
  note: target.note.trim() || undefined,
});
export const hasTargetValue = (t?: UserTarget) =>
  !!t &&
  ([
    t.salesAmount,
    t.salesNewCustomers,
    t.serviceAmount,
    t.serviceCompleted,
    t.digitalLeadTarget,
    t.digitalConversionTarget,
    t.digitalBudget,
    t.visitTarget,
    t.callTarget,
    t.quoteTarget,
  ].some((value) => !!value?.trim()) ||
    t.targetItems.some((item) => !!item.target.trim()));
export const targetFilledCount = (target: UserTarget, targetType: UserTargetType) =>
  target.targetItems.filter((item) => item.targetType === targetType && !!item.target.trim()).length;
export const targetTotalCount = (targetType: UserTargetType) => TARGET_TEMPLATES[targetType].length;
const targetTypeLabel = (targetType: UserTargetType) => TARGET_TYPE_META[targetType]?.label ?? targetType;
const targetTypeTitle = (targetType: UserTargetType) => TARGET_TYPE_META[targetType]?.title ?? `${targetTypeLabel(targetType)} Hedefleri`;
export const formatPeriodLabel = (period: string) => {
  const [year, month] = period.split("-").map(Number);
  if (!year || !month) return period;
  return new Date(year, month - 1, 1).toLocaleDateString("tr-TR", { month: "long", year: "numeric" });
};
const formatTargetNumber = (value: number) =>
  value.toLocaleString("tr-TR", { maximumFractionDigits: Number.isInteger(value) ? 0 : 2 });
const isInvalidTargetItem = (item: UserTargetItem) => {
  if (!item.target.trim()) return false;
  const numeric = parseTargetNumber(item.target);
  if (numeric === null || numeric < 0) return true;
  return item.unit === "count" && !Number.isInteger(numeric);
};
const summarizeTargetItems = (items: UserTargetItem[]) => {
  return items.reduce(
    (summary, item) => {
      const filled = !!item.target.trim();
      const numeric = parseTargetNumber(item.target);
      const invalid = isInvalidTargetItem(item);
      if (filled) summary.filled += 1;
      if (invalid) summary.invalid += 1;
      if (!invalid && numeric !== null) {
        if (item.unit === "count") summary.countTotal += numeric;
        if (item.unit === "amount") summary.amountTotal += numeric;
      }
      return summary;
    },
    { filled: 0, total: items.length, countTotal: 0, amountTotal: 0, invalid: 0 }
  );
};
const targetCurrencyLabel = () => "USD";
const targetCategoryToneClass = (category: string) =>
  ({
    "SATIŞ": "border-blue-200 bg-blue-50 text-blue-700",
    "ZİYARET": "border-emerald-200 bg-emerald-50 text-emerald-700",
    "ARAMA": "border-amber-200 bg-amber-50 text-amber-700",
    "DİJİTAL PAZARLAMA": "border-violet-200 bg-violet-50 text-violet-700",
    "TEKLİF": "border-sky-200 bg-sky-50 text-sky-700",
    "TEKNİK": "border-slate-200 bg-slate-100 text-slate-700",
    "FİNANS": "border-cyan-200 bg-cyan-50 text-cyan-700",
    "SATINALMA": "border-indigo-200 bg-indigo-50 text-indigo-700",
    "TEDARİK": "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700",
    "OPERASYON": "border-teal-200 bg-teal-50 text-teal-700",
    "LOJİSTİK": "border-orange-200 bg-orange-50 text-orange-700",
    "GENEL": "border-zinc-200 bg-zinc-50 text-zinc-700",
  }[category] ?? "border-border bg-muted text-muted-foreground");

function groupTargetItems(items: UserTargetItem[]) {
  const groups: { category: string; items: UserTargetItem[] }[] = [];
  items.forEach((item) => {
    const last = groups[groups.length - 1];
    if (last?.category === item.category) {
      last.items.push(item);
    } else {
      groups.push({ category: item.category, items: [item] });
    }
  });
  return groups;
}

export function TargetPill({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-brand-blue-soft px-2 py-0.5 text-[11px] text-brand-blue">
      <TrendingUp className="size-3" />
      <span>{label}</span>
      <span className="text-blue-500">{value}</span>
    </span>
  );
}

/* ─────────────────────────── Otomatik takip altyapısı ─────────────────────────── */

/** Backend'in sistem verisinden ölçtüğü metrikler (reports.service MEASURED_METRICS aynası). */
const MEASURED_METRIC_KEYS: TargetMetricKey[] = [
  "salesAmount", "salesNewCustomers", "quoteTarget", "visitTarget", "callTarget", "serviceCompleted", "serviceAmount",
  "digitalLeadTarget", "paymentsInAmount", "purchaseInvoiceAmount", "purchaseOrderAmount", "purchaseOrderCount",
  "salesOrderAmount", "salesOrderCount", "installationCompleted",
];
const measuredMetricSet = new Set<TargetMetricKey>(MEASURED_METRIC_KEYS);
const isAutoTracked = (item: Pick<UserTargetItem, "metricKey" | "trackingMode">) =>
  item.trackingMode !== "manual" && !!item.metricKey && measuredMetricSet.has(item.metricKey);

type LiveMetric = { target: number | null; actual: number | null; pct: number | null };
type LiveProgress = { metrics: Record<string, LiveMetric>; hasTarget: boolean };
type LiveState = "idle" | "loading" | "ready" | "error";

/** Ana metrik alanları: form alanı ↔ ölçüm anahtarı eşleşmesi. */
const MAIN_METRIC_FIELDS: { key: Extract<keyof UserTarget, string>; label: string; unit: "USD" | "adet"; metricKey: TargetMetricKey }[] = [
  { key: "salesAmount", label: "Satış Cirosu", unit: "USD", metricKey: "salesAmount" },
  { key: "salesNewCustomers", label: "Yeni Müşteri", unit: "adet", metricKey: "salesNewCustomers" },
  { key: "quoteTarget", label: "Teklif", unit: "adet", metricKey: "quoteTarget" },
  { key: "visitTarget", label: "Ziyaret", unit: "adet", metricKey: "visitTarget" },
  { key: "callTarget", label: "Arama", unit: "adet", metricKey: "callTarget" },
  { key: "serviceAmount", label: "Servis Cirosu", unit: "USD", metricKey: "serviceAmount" },
  { key: "serviceCompleted", label: "Tamamlanan Servis", unit: "adet", metricKey: "serviceCompleted" },
  { key: "digitalLeadTarget", label: "Dijital Fırsat", unit: "adet", metricKey: "digitalLeadTarget" },
  { key: "digitalConversionTarget", label: "Dijital Dönüşüm", unit: "adet", metricKey: "digitalConversionTarget" },
  { key: "digitalBudget", label: "Dijital Bütçe", unit: "USD", metricKey: "digitalBudget" },
];

const progressPct = (actual: number | null, target: number | null) =>
  actual != null && target != null && target > 0 ? Math.round((actual / target) * 100) : null;

const pctToneClass = (pct: number) => (pct >= 100 ? "text-success" : pct >= 60 ? "text-foreground" : "text-warning");
const pctBarClass = (pct: number) => (pct >= 100 ? "bg-success" : "bg-brand-blue");

function TrackingBadge({ auto }: { auto: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {auto ? (
          <span className="inline-flex shrink-0 cursor-default items-center gap-1 rounded-full border border-success/25 bg-success-soft px-1.5 py-0.5 text-[10px] font-semibold text-success">
            <Zap className="size-3" /> Otomatik
          </span>
        ) : (
          <span className="inline-flex shrink-0 cursor-default items-center gap-1 rounded-full border border-border/60 bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            <PenLine className="size-3" /> Manuel
          </span>
        )}
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[280px] leading-relaxed">
        {auto
          ? "Gerçekleşme; fatura, teklif, ziyaret, arama, servis ve sipariş kayıtlarından sistemce otomatik ölçülür."
          : "Bu hedef sistem verisinden ölçülemez; gerçekleşme manuel değerlendirilir."}
      </TooltipContent>
    </Tooltip>
  );
}

function LiveProgressBar({ actual, pct, label }: { actual: number; pct: number | null; label: string }) {
  return (
    <div className="mt-1.5">
      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="truncate">
          {label}: <span className="font-semibold tabular-nums text-foreground">{formatTargetNumber(actual)}</span>
        </span>
        {pct != null && <span className={cn("shrink-0 font-semibold tabular-nums", pctToneClass(pct))}>%{pct}</span>}
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-[width]", pctBarClass(pct ?? 0))}
          style={{ width: `${Math.min(Math.max(pct ?? 0, 0), 100)}%` }}
        />
      </div>
    </div>
  );
}

function ReadonlyTargetField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold text-foreground">{label}</Label>
      <div className="flex h-10 items-center rounded-md border border-border/60 bg-muted/35 px-3 text-sm font-medium text-foreground">
        {value}
      </div>
    </div>
  );
}

function TargetCategoryBadge({ category }: { category: string }) {
  return (
    <span className={cn("inline-flex max-w-full items-center rounded-md border px-2 py-1 text-[11px] font-semibold leading-none", targetCategoryToneClass(category))}>
      <span className="truncate">{category}</span>
    </span>
  );
}

function TargetDescription({ description }: { description: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <p className="line-clamp-2 cursor-default text-xs leading-relaxed text-muted-foreground">{description}</p>
      </TooltipTrigger>
      <TooltipContent side="top" align="start" className="max-w-[440px] leading-relaxed">
        {description}
      </TooltipContent>
    </Tooltip>
  );
}

function TargetValueControl({ item, onTargetChange, className }: {
  item: UserTargetItem;
  onTargetChange: (key: string, value: string) => void;
  className?: string;
}) {
  const invalid = isInvalidTargetItem(item);
  return (
    <div className={cn("w-full", className)}>
      <div className={cn("flex h-9 overflow-hidden rounded-md border bg-background", invalid ? "border-destructive ring-1 ring-destructive/20" : "border-input")}>
        {item.unit === "amount" && (
          <span className="grid w-14 shrink-0 place-items-center border-r border-border/60 bg-muted/45 text-[11px] font-medium text-muted-foreground">
            {targetCurrencyLabel()}
          </span>
        )}
        <Input
          className="h-9 rounded-none border-0 bg-transparent px-2 text-right tabular-nums shadow-none focus-visible:border-transparent focus-visible:ring-0"
          inputMode={item.unit === "amount" ? "decimal" : "numeric"}
          aria-invalid={invalid}
          value={item.target}
          onChange={(e) => onTargetChange(targetItemKey(item), e.target.value)}
          placeholder={item.unit === "amount" ? "tutar" : "0"}
        />
        {item.unit === "count" && (
          <span className="grid w-14 shrink-0 place-items-center border-l border-border/60 bg-muted/45 text-[11px] font-medium text-muted-foreground">
            adet
          </span>
        )}
      </div>
      {invalid && (
        <div className="mt-1 flex items-center justify-end gap-1 text-[11px] text-destructive">
          <AlertTriangle className="size-3" /> Geçersiz değer
        </div>
      )}
    </div>
  );
}

function TargetItemRow({ item, onTargetChange, actual, factor, actualLabel }: {
  item: UserTargetItem;
  onTargetChange: (key: string, value: string) => void;
  actual: number | null;
  factor: number | null;
  actualLabel: string;
}) {
  const auto = isAutoTracked(item);
  const typed = parseTargetNumber(item.target);
  const effectiveTarget = typed != null && factor != null ? typed * factor : null;
  const pct = auto ? progressPct(actual, effectiveTarget) : null;
  return (
    <div className={cn("grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_190px] sm:gap-4", isInvalidTargetItem(item) && "bg-destructive/5")}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-semibold leading-snug text-foreground">{item.activity}</span>
          <TrackingBadge auto={auto} />
        </div>
        <div className="mt-1">
          <TargetDescription description={item.description} />
        </div>
      </div>
      <div className="w-full sm:justify-self-end">
        <TargetValueControl item={item} onTargetChange={onTargetChange} />
        {auto && actual != null && <LiveProgressBar actual={actual} pct={pct} label={actualLabel} />}
      </div>
    </div>
  );
}

function MainMetricCard({ label, unit, value, onChange, actual, tracked, factor, actualLabel }: {
  label: string;
  unit: "USD" | "adet";
  value: string;
  onChange: (value: string) => void;
  actual: number | null;
  tracked: boolean;
  factor: number | null;
  actualLabel: string;
}) {
  const typed = parseTargetNumber(value);
  const invalid = !!value.trim() && typed === null;
  const effectiveTarget = typed != null && factor != null ? typed * factor : null;
  const pct = tracked ? progressPct(actual, effectiveTarget) : null;
  return (
    <div className={cn("rounded-lg border bg-background p-3", invalid ? "border-destructive/50" : "border-border/60")}>
      <div className="flex items-center justify-between gap-2">
        <Label className="min-w-0 truncate text-xs font-semibold text-foreground">{label}</Label>
        <TrackingBadge auto={tracked} />
      </div>
      <div className={cn("mt-2 flex h-9 overflow-hidden rounded-md border bg-background", invalid ? "border-destructive ring-1 ring-destructive/20" : "border-input")}>
        <Input
          className="h-9 rounded-none border-0 bg-transparent px-2 text-right tabular-nums shadow-none focus-visible:border-transparent focus-visible:ring-0"
          inputMode={unit === "USD" ? "decimal" : "numeric"}
          aria-invalid={invalid}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={unit === "USD" ? "tutar" : "0"}
        />
        <span className="grid w-12 shrink-0 place-items-center border-l border-border/60 bg-muted/45 text-[10px] font-medium text-muted-foreground">
          {unit}
        </span>
      </div>
      <div className="mt-1 min-h-[34px]">
        {invalid ? (
          <div className="flex items-center gap-1 text-[11px] text-destructive">
            <AlertTriangle className="size-3" /> Geçersiz değer
          </div>
        ) : tracked && actual != null ? (
          <LiveProgressBar actual={actual} pct={pct} label={actualLabel} />
        ) : (
          <div className="pt-1 text-[11px] text-muted-foreground">
            {tracked ? "Gerçekleşme sistemden ölçülür" : "Manuel takip edilir"}
          </div>
        )}
      </div>
    </div>
  );
}

type SectionKey = "overview" | UserTargetType;

function SectionNavButton({ active, onClick, icon: Icon, label, meta, progress }: {
  active: boolean;
  onClick: () => void;
  icon: LucideIcon;
  label: string;
  meta?: string;
  progress?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded-md px-3 py-2 text-left transition-colors",
        active ? "bg-brand-blue-soft text-brand-blue" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
      )}
    >
      <span className="flex items-center gap-2">
        <Icon className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{label}</span>
        {meta && <span className="shrink-0 text-[11px] tabular-nums opacity-80">{meta}</span>}
      </span>
      {typeof progress === "number" && (
        <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-muted">
          <span
            className={cn("block h-full rounded-full transition-[width]", active ? "bg-brand-blue" : "bg-brand-blue/40")}
            style={{ width: `${Math.min(Math.max(progress, 0), 100)}%` }}
          />
        </span>
      )}
    </button>
  );
}

export type TargetScope = {
  kind: "user" | "department" | "role";
  id: string;
  name: string;
  subtitle?: string;
  /** Rol kapsamında: hedefin uygulanacağı kullanıcı sayısı (onay metni için). */
  memberCount?: number;
};

const scopeKindLabel = (kind: TargetScope["kind"]) =>
  kind === "user" ? "Kullanıcı" : kind === "department" ? "Departman" : "Rol";

export function TargetDialog({ scope, target, period, onClose, onSave }: {
  scope: TargetScope | null;
  target?: UserTarget;
  period: string;
  onClose: () => void;
  onSave: (scope: TargetScope, target: UserTarget) => Promise<void>;
}) {
  const [form, setForm] = useState<UserTarget>(emptyTarget());
  const [activeSection, setActiveSection] = useState<SectionKey>("overview");
  const [saving, setSaving] = useState(false);
  const [live, setLive] = useState<LiveProgress | null>(null);
  const [liveState, setLiveState] = useState<LiveState>("idle");
  const [liveRefreshKey, setLiveRefreshKey] = useState(0);

  const scopeKind = scope?.kind;
  const scopeId = scope?.id;

  useEffect(() => {
    if (!scope) return;
    setForm(target ? { ...emptyTarget(), ...target, period, targetItems: mergeTargetItems(target.targetItems) } : { ...emptyTarget(), period });
    setActiveSection("overview");
  }, [scope, target, period]);

  useEffect(() => {
    if (!scopeKind || !scopeId) return;
    const timer = window.setInterval(() => setLiveRefreshKey((value) => value + 1), 60_000);
    return () => window.clearInterval(timer);
  }, [scopeKind, scopeId]);

  // Canlı gerçekleşme: diyalog açılınca ve her 60 saniyede dönem fiilîleri sistemden okunur.
  useEffect(() => {
    if (!scopeKind || !scopeId) {
      setLive(null);
      setLiveState("idle");
      return;
    }
    let cancelled = false;
    setLiveState("loading");
    reportService
      .targetProgress({ period, scope: scopeKind, id: scopeId })
      .then((res: any) => {
        if (cancelled) return;
        const subject = Array.isArray(res?.subjects) ? res.subjects[0] : null;
        setLive(subject ? { metrics: subject.metrics ?? {}, hasTarget: !!subject.hasTarget } : null);
        setLiveState("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setLive(null);
        setLiveState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [scopeKind, scopeId, period, liveRefreshKey]);

  const itemsByType = useMemo(
    () =>
      TARGET_TYPE_ORDER.reduce((acc, targetType) => {
        acc[targetType] = form.targetItems.filter((item) => item.targetType === targetType);
        return acc;
      }, {} as Record<UserTargetType, UserTargetItem[]>),
    [form.targetItems]
  );
  const statsByType = useMemo(
    () =>
      TARGET_TYPE_ORDER.reduce((acc, targetType) => {
        acc[targetType] = summarizeTargetItems(itemsByType[targetType]);
        return acc;
      }, {} as Record<UserTargetType, ReturnType<typeof summarizeTargetItems>>),
    [itemsByType]
  );
  const allStats = useMemo(() => summarizeTargetItems(form.targetItems), [form.targetItems]);
  const autoItemCount = useMemo(() => form.targetItems.filter(isAutoTracked).length, [form.targetItems]);
  const autoMainCount = MAIN_METRIC_FIELDS.filter((f) => measuredMetricSet.has(f.metricKey)).length;
  const invalidMainCount = MAIN_METRIC_FIELDS.filter((f) => {
    const value = (form[f.key] as string) ?? "";
    return !!value.trim() && parseTargetNumber(value) === null;
  }).length;
  const invalidCount = allStats.invalid + invalidMainCount;
  const hasInvalidTargets = invalidCount > 0;

  if (!scope) return null;

  // Rol hedefi kişi başına yazılır; ekip gerçekleşmesi üye sayısıyla çarpılan hedefe oranlanır.
  const factor = scope.kind === "role" ? (scope.memberCount && scope.memberCount > 0 ? scope.memberCount : null) : 1;
  const actualLabel = scope.kind === "user" ? "Gerçekleşen" : "Ekip gerçekleşen";
  const liveActualFor = (metricKey: TargetMetricKey | null | undefined) => {
    if (!live || !metricKey) return null;
    return live.metrics[metricKey]?.actual ?? null;
  };
  const periodPace = expectedPeriodPct(period);
  const configuredByMetric = new Map<TargetMetricKey, number>();
  const mainConfiguredMetrics = new Set<TargetMetricKey>();
  for (const field of MAIN_METRIC_FIELDS) {
    if (!measuredMetricSet.has(field.metricKey)) continue;
    const targetValue = parseTargetNumber(String(form[field.key] ?? ""));
    if (targetValue != null && targetValue > 0) {
      configuredByMetric.set(field.metricKey, targetValue * (factor ?? 1));
      mainConfiguredMetrics.add(field.metricKey);
    }
  }
  for (const item of form.targetItems) {
    if (!isAutoTracked(item) || !item.metricKey || mainConfiguredMetrics.has(item.metricKey)) continue;
    const targetValue = parseTargetNumber(item.target);
    if (targetValue == null || targetValue <= 0) continue;
    configuredByMetric.set(item.metricKey, (configuredByMetric.get(item.metricKey) ?? 0) + targetValue * (factor ?? 1));
  }
  const paceValues = [...configuredByMetric.entries()]
    .map(([metricKey, targetValue]) => progressPct(liveActualFor(metricKey), targetValue))
    .filter((value): value is number => value != null);
  const livePace = paceValues.length
    ? Math.round(paceValues.reduce((sum, value) => sum + Math.min(100, Math.max(0, value)), 0) / paceValues.length)
    : null;

  const updateField = (key: keyof UserTarget, value: string) => setForm((prev) => ({ ...prev, [key]: value }));
  const updateItemTarget = (key: string, value: string) => {
    setForm((prev) => ({
      ...prev,
      targetItems: prev.targetItems.map((item) => (targetItemKey(item) === key ? { ...item, target: value } : item)),
    }));
  };
  const applyTemplateTargets = (targetType?: UserTargetType) => {
    setForm((prev) => ({
      ...prev,
      targetItems: prev.targetItems.map((item) => (!targetType || item.targetType === targetType ? { ...item, target: item.defaultTarget } : item)),
    }));
  };
  const clearTargets = (targetType?: UserTargetType) => {
    setForm((prev) => ({
      ...prev,
      targetItems: prev.targetItems.map((item) => (!targetType || item.targetType === targetType ? { ...item, target: "" } : item)),
    }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (hasInvalidTargets) {
      toast.error("Hedef değerlerini kontrol edin", { description: "Adet alanları tam sayı, tutar alanları pozitif sayı olmalı." });
      return;
    }
    setSaving(true);
    try {
      await onSave(scope, {
        ...form,
        period,
        salesAmount: form.salesAmount.trim(),
        salesNewCustomers: form.salesNewCustomers.trim(),
        serviceAmount: form.serviceAmount.trim(),
        serviceCompleted: form.serviceCompleted.trim(),
        digitalLeadTarget: form.digitalLeadTarget.trim(),
        digitalConversionTarget: form.digitalConversionTarget.trim(),
        digitalBudget: form.digitalBudget.trim(),
        visitTarget: form.visitTarget.trim(),
        callTarget: form.callTarget.trim(),
        quoteTarget: form.quoteTarget.trim(),
        targetItems: form.targetItems.map((item) => ({ ...item, target: item.target.trim() })),
        note: form.note.trim(),
      });
      toast.success("Hedef kaydedildi", { description: `${scope.name} · ${period}` });
      onClose();
    } catch (err: any) {
      toast.error("Hedef kaydedilemedi", { description: err?.message ?? "Backend isteği başarısız oldu." });
    } finally {
      setSaving(false);
    }
  };

  const templateMenu = (targetType: UserTargetType) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5">
          <RotateCcw className="size-3.5" /> Şablon
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>{targetTypeTitle(targetType)}</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => applyTemplateTargets(targetType)}>
          <RotateCcw className="size-4" /> Bu bölümü şablondan doldur
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => applyTemplateTargets()}>
          <ListChecks className="size-4" /> Tüm hedefleri şablondan doldur
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => clearTargets(targetType)}>
          <Eraser className="size-4" /> Bu bölümü temizle
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => clearTargets()} variant="destructive">
          <Trash2 className="size-4" /> Tüm hedefleri temizle
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const sections: { key: SectionKey; label: string; icon: LucideIcon; meta?: string; progress?: number }[] = [
    { key: "overview", label: "Genel & Ana Metrikler", icon: LayoutDashboard },
    ...TARGET_TYPE_ORDER.map((targetType) => {
      const stats = statsByType[targetType];
      return {
        key: targetType as SectionKey,
        label: targetTypeLabel(targetType),
        icon: TARGET_TYPE_META[targetType].icon,
        meta: `${stats.filled}/${stats.total}`,
        progress: stats.total ? Math.round((stats.filled / stats.total) * 100) : 0,
      };
    }),
  ];

  const activeType = activeSection === "overview" ? null : activeSection;
  const activeStats = activeType ? statsByType[activeType] : null;
  const ActiveIcon = activeType ? TARGET_TYPE_META[activeType].icon : LayoutDashboard;

  return (
    <Dialog open={!!scope} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] w-[calc(100vw-1rem)] max-w-none gap-0 overflow-hidden p-0 sm:w-[min(1220px,calc(100vw-2rem))] sm:max-w-none">
        <form onSubmit={submit} className="flex max-h-[92dvh] min-h-0 flex-col">
          <DialogHeader className="border-b border-border/60 bg-muted/20 px-4 py-4 pr-12 sm:px-5">
            <div className="flex flex-wrap items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-blue text-white">
                <Target className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <DialogTitle className="leading-snug">Hedef Belirle · {scope.name}</DialogTitle>
                <DialogDescription className="mt-0.5">
                  {scopeKindLabel(scope.kind)}{scope.subtitle ? ` · ${scope.subtitle}` : ""} · {formatPeriodLabel(period)} dönemi aylık hedefleri
                </DialogDescription>
              </div>
              <div className="hidden shrink-0 items-center gap-2 md:flex">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                  <ListChecks className="size-3.5" /> {allStats.filled}/{allStats.total} dolu
                </span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex cursor-default items-center gap-1.5 rounded-full border border-success/25 bg-success-soft px-2.5 py-1 text-[11px] font-semibold text-success">
                      <Zap className="size-3.5" /> {autoItemCount + autoMainCount} hedef otomatik takipte
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[300px] leading-relaxed">
                    Gerçekleşmeler fatura, teklif, ziyaret, arama, servis ve sipariş kayıtlarından sistemce otomatik ölçülür; Dashboard ve raporlara anlık yansır.
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          </DialogHeader>

          <div className="flex min-h-0 flex-1">
            <aside className="hidden w-56 shrink-0 flex-col gap-1 overflow-y-auto border-r border-border/60 bg-muted/15 p-2.5 lg:flex">
              <SectionNavButton
                active={activeSection === "overview"}
                onClick={() => setActiveSection("overview")}
                icon={LayoutDashboard}
                label="Genel & Ana Metrikler"
              />
              <div className="mt-2 px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Hedef Grupları
              </div>
              {sections
                .filter((s) => s.key !== "overview")
                .map((section) => (
                  <SectionNavButton
                    key={section.key}
                    active={activeSection === section.key}
                    onClick={() => setActiveSection(section.key)}
                    icon={section.icon}
                    label={section.label}
                    meta={section.meta}
                    progress={section.progress}
                  />
                ))}
            </aside>

            <div className="min-w-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
              <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1 lg:hidden">
                {sections.map((section) => (
                  <button
                    key={section.key}
                    type="button"
                    onClick={() => setActiveSection(section.key)}
                    className={cn(
                      "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                      activeSection === section.key
                        ? "border-brand-blue/30 bg-brand-blue-soft text-brand-blue"
                        : "border-border/60 bg-background text-muted-foreground"
                    )}
                  >
                    <section.icon className="size-3.5" />
                    {section.label}
                    {section.meta && <span className="tabular-nums opacity-75">{section.meta}</span>}
                  </button>
                ))}
              </div>

              {activeSection === "overview" ? (
                <div className="space-y-4">
                  {scope.kind === "role" && (
                    <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-xs text-amber-900">
                      <Users className="mt-0.5 size-4 shrink-0 text-warning" />
                      <span>
                        Kaydedildiğinde bu roldeki <b>{scope.memberCount ?? "tüm"}</b> aktif kullanıcıya {formatPeriodLabel(period)} dönemi için
                        kişisel hedef olarak uygulanır; kullanıcıların mevcut dönem hedefleri bu değerlerle değiştirilir.
                      </span>
                    </div>
                  )}
                  <div className="rounded-lg border border-brand-blue/15 bg-brand-blue-soft/35 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-xs font-semibold text-foreground">Dönem temposu</div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          Program kayıtları hedeflerle otomatik karşılaştırılır
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-[11px] tabular-nums">
                        <span>Beklenen <b>%{periodPace}</b></span>
                        <span>
                          Gerçekleşen <b>{liveState === "loading" ? "hesaplanıyor" : livePace == null ? "—" : `%${livePace}`}</b>
                        </span>
                      </div>
                    </div>
                    <div className="relative mt-2.5 h-2 overflow-hidden rounded-full bg-background">
                      <div
                        className={cn("h-full rounded-full", livePace != null && livePace + 10 < periodPace ? "bg-warning" : "bg-brand-blue")}
                        style={{ width: `${Math.min(100, Math.max(0, livePace ?? 0))}%` }}
                      />
                      <span className="absolute inset-y-0 w-px bg-foreground/60" style={{ left: `${Math.min(99, Math.max(0, periodPace))}%` }} />
                    </div>
                  </div>
                  <div className="grid gap-3 lg:grid-cols-[170px_130px_minmax(0,1fr)]">
                    <ReadonlyTargetField label="Dönem" value={formatPeriodLabel(period)} />
                    <ReadonlyTargetField label="Para Birimi" value="USD" />
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-foreground">Not</Label>
                      <Textarea
                        className="min-h-10 resize-y rounded-md bg-background text-sm"
                        value={form.note}
                        onChange={(e) => updateField("note", e.target.value)}
                        placeholder="Hedef dönemi notu"
                        maxLength={500}
                      />
                    </div>
                  </div>

                  <section>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <TrendingUp className="size-4 text-brand-blue" />
                      <span className="text-sm font-semibold">Ana Metrik Hedefleri</span>
                      <span className="text-[11px] text-muted-foreground">
                        — gerçekleşmeler sistemden otomatik ölçülür ve Dashboard'a yansır
                      </span>
                    </div>
                    {liveState === "error" && (
                      <div className="mb-3 rounded-md border border-border/60 bg-muted/25 px-3 py-2 text-xs text-muted-foreground">
                        Gerçekleşme verisi şu an alınamadı; hedefler yine de kaydedilebilir.
                      </div>
                    )}
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {MAIN_METRIC_FIELDS.map((field) => (
                        <MainMetricCard
                          key={field.key}
                          label={field.label}
                          unit={field.unit}
                          value={(form[field.key] as string) ?? ""}
                          onChange={(v) => updateField(field.key as keyof UserTarget, v)}
                          actual={liveActualFor(field.metricKey)}
                          tracked={measuredMetricSet.has(field.metricKey)}
                          factor={factor}
                          actualLabel={actualLabel}
                        />
                      ))}
                    </div>
                  </section>
                </div>
              ) : activeType && activeStats ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="grid size-9 shrink-0 place-items-center rounded-md bg-brand-blue-soft text-brand-blue">
                        <ActiveIcon className="size-4" />
                      </span>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold leading-tight">{targetTypeTitle(activeType)}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {activeStats.filled}/{activeStats.total} dolu
                          {activeStats.countTotal > 0 && <> · {formatTargetNumber(activeStats.countTotal)} adet</>}
                          {activeStats.amountTotal > 0 && <> · USD {formatTargetNumber(activeStats.amountTotal)}</>}
                          {activeStats.invalid > 0 && (
                            <span className="text-destructive"> · {activeStats.invalid} geçersiz değer</span>
                          )}
                        </div>
                      </div>
                    </div>
                    {templateMenu(activeType)}
                  </div>
                  {groupTargetItems(itemsByType[activeType]).map((group) => {
                    const filled = group.items.filter((item) => !!item.target.trim()).length;
                    return (
                      <section key={group.category} className="overflow-hidden rounded-lg border border-border/60 bg-background">
                        <header className="flex items-center justify-between gap-2 border-b border-border/60 bg-muted/30 px-3 py-2">
                          <TargetCategoryBadge category={group.category} />
                          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                            {filled}/{group.items.length} dolu
                          </span>
                        </header>
                        <div className="divide-y divide-border/60">
                          {group.items.map((item) => (
                            <TargetItemRow
                              key={targetItemKey(item)}
                              item={item}
                              onTargetChange={updateItemTarget}
                              actual={isAutoTracked(item) ? liveActualFor(item.metricKey) : null}
                              factor={factor}
                              actualLabel={actualLabel}
                            />
                          ))}
                        </div>
                      </section>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>

          <DialogFooter className="border-t border-border/60 px-4 py-3 sm:items-center sm:justify-between sm:px-5 sm:py-4">
            <div className={cn("min-h-5 text-xs", hasInvalidTargets ? "text-destructive" : "text-muted-foreground")}>
              {hasInvalidTargets ? (
                <span className="inline-flex items-center gap-1.5">
                  <AlertTriangle className="size-3.5" /> {invalidCount} hedef değeri kontrol edilmeli
                </span>
              ) : (
                <span>{allStats.filled}/{allStats.total} hedef dolu · {autoItemCount + autoMainCount} hedef otomatik takipte</span>
              )}
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button type="button" variant="outline" onClick={onClose} disabled={saving}>İptal</Button>
              <Button type="submit" disabled={saving || hasInvalidTargets}>
                {saving
                  ? "Kaydediliyor..."
                  : scope.kind === "role"
                  ? `${scope.memberCount ?? ""} Kullanıcıya Uygula`.trim()
                  : "Kaydet"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
