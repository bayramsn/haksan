import { useEffect, useMemo, useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { cn } from "../ui/utils";
import {
  AlertTriangle, CheckCircle2, ChevronDown, CircleDollarSign, Eraser, ListChecks, RotateCcw, Trash2, TrendingUp, Users, Wrench,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

/**
 * Kullanıcı / departman / rol için ortak hedef belirleme diyaloğu ve hedef form
 * yardımcıları. UsersPage'deki UserTargetDialog'dan genelleştirildi; rol kapsamı
 * kaydedilirken hedef roldeki tüm kullanıcılara kişisel hedef olarak kopyalanır.
 */

export type UserTargetType = "sales" | "service";
type UserTargetUnit = "count" | "amount";

export type UserTargetItem = {
  targetType: UserTargetType;
  category: string;
  activity: string;
  description: string;
  unit: UserTargetUnit;
  defaultTarget: string;
  target: string;
};

type TargetTemplateItem = Omit<UserTargetItem, "target">;

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
const withTargetType = (targetType: UserTargetType, rows: Omit<TargetTemplateItem, "targetType">[]): TargetTemplateItem[] =>
  rows.map((row) => ({ targetType, ...row }));
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
};
const allTargetTemplates = () => [...TARGET_TEMPLATES.sales, ...TARGET_TEMPLATES.service];
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
  targetItems: target.targetItems.map(({ targetType, category, activity, description, unit, target }) => ({
    targetType,
    category,
    activity,
    description,
    unit,
    target: target.trim(),
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
const targetTypeLabel = (targetType: UserTargetType) => (targetType === "sales" ? "Satış" : "Servis");
const targetTypeTitle = (targetType: UserTargetType) => `${targetTypeLabel(targetType)} Hedefleri`;
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

function TargetSummaryMetric({
  icon: Icon,
  label,
  value,
  helper,
  progress,
  tone = "default",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  helper: string;
  progress?: number;
  tone?: "default" | "danger";
}) {
  const danger = tone === "danger";
  return (
    <div className={cn("rounded-md border px-3 py-2.5", danger ? "border-destructive/30 bg-destructive/5" : "border-border/60 bg-muted/20")}>
      <div className="flex items-start gap-3">
        <span className={cn("grid size-8 shrink-0 place-items-center rounded-md", danger ? "bg-destructive/10 text-destructive" : "bg-background text-muted-foreground")}>
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
          <div className="mt-0.5 truncate text-base font-semibold tabular-nums text-foreground">{value}</div>
          <div className={cn("mt-0.5 text-[11px]", danger ? "text-destructive" : "text-muted-foreground")}>{helper}</div>
          {typeof progress === "number" && (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${Math.min(Math.max(progress, 0), 100)}%` }} />
            </div>
          )}
        </div>
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

function TargetTemplateTable({ items, onTargetChange }: {
  items: UserTargetItem[];
  onTargetChange: (key: string, value: string) => void;
}) {
  const groups = groupTargetItems(items);
  return (
    <div className="space-y-3">
      <div className="space-y-3 md:hidden">
        {groups.map((group) => (
          <section key={group.category} className="overflow-hidden rounded-md border border-border/60 bg-background">
            <div className="flex items-center justify-between gap-2 border-b border-border/60 bg-muted/30 px-3 py-2">
              <TargetCategoryBadge category={group.category} />
              <span className="shrink-0 text-[11px] text-muted-foreground">{group.items.length} aktivite</span>
            </div>
            <div className="divide-y divide-border/60">
              {group.items.map((item) => (
                <div key={targetItemKey(item)} className={cn("p-3", isInvalidTargetItem(item) && "bg-destructive/5")}>
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_170px]">
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Aktivite</div>
                      <div className="mt-1 text-sm font-semibold leading-snug text-foreground">{item.activity}</div>
                    </div>
                    <TargetValueControl item={item} onTargetChange={onTargetChange} className="sm:w-[170px]" />
                  </div>
                  <div className="mt-2">
                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Aktivite Açıklaması</div>
                    <TargetDescription description={item.description} />
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
      <div className="hidden overflow-hidden rounded-md border border-border/60 bg-background md:block">
        <div className="overflow-x-auto">
          <div className="min-w-[980px]">
            <div className="grid grid-cols-[160px_260px_1fr_210px] border-b border-border/60 bg-muted/35 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <div className="border-r border-border/60 px-4 py-3">Kategori</div>
              <div className="border-r border-border/60 px-4 py-3">Aktivite</div>
              <div className="border-r border-border/60 px-4 py-3">Aktivite Açıklaması</div>
              <div className="px-4 py-3 text-right">Aylık Hedef</div>
            </div>
            <div className="max-h-[48vh] overflow-y-auto">
              {groups.map((group) => (
                <div key={group.category} className="grid grid-cols-[160px_1fr] border-b border-border/60 last:border-b-0">
                  <div className="flex flex-col gap-2 border-r border-border/60 bg-muted/15 px-4 py-3">
                    <TargetCategoryBadge category={group.category} />
                    <span className="text-[11px] text-muted-foreground">{group.items.length} aktivite</span>
                  </div>
                  <div className="min-w-0">
                    {group.items.map((item) => (
                      <div
                        key={targetItemKey(item)}
                        className={cn(
                          "grid min-h-[72px] grid-cols-[260px_1fr_210px] border-b border-border/60 last:border-b-0",
                          isInvalidTargetItem(item) && "bg-destructive/5"
                        )}
                      >
                        <div className="flex min-w-0 items-center border-r border-border/60 px-4 py-3">
                          <div className="min-w-0 text-sm font-semibold leading-snug text-foreground">{item.activity}</div>
                        </div>
                        <div className="flex min-w-0 items-center border-r border-border/60 px-4 py-3">
                          <TargetDescription description={item.description} />
                        </div>
                        <div className="flex items-center justify-end px-4 py-3">
                          <TargetValueControl item={item} onTargetChange={onTargetChange} className="w-[170px]" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Otomatik ölçülen ana metrik alanı (Hedefler sayfası ilerlemesini besler). */
function MeasuredField({ label, unit, value, onChange }: {
  label: string;
  unit: "USD" | "adet";
  value: string;
  onChange: (value: string) => void;
}) {
  const invalid = !!value.trim() && parseTargetNumber(value) === null;
  return (
    <div className="space-y-1">
      <Label className="text-[11px] font-medium text-muted-foreground">{label}</Label>
      <div className={cn("flex h-9 overflow-hidden rounded-md border bg-background", invalid ? "border-destructive" : "border-input")}>
        <Input
          className="h-9 rounded-none border-0 bg-transparent px-2 text-right tabular-nums shadow-none focus-visible:border-transparent focus-visible:ring-0"
          inputMode={unit === "USD" ? "decimal" : "numeric"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={unit === "USD" ? "tutar" : "0"}
        />
        <span className="grid w-12 shrink-0 place-items-center border-l border-border/60 bg-muted/45 text-[10px] font-medium text-muted-foreground">
          {unit}
        </span>
      </div>
    </div>
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
  const [activeTargetType, setActiveTargetType] = useState<UserTargetType>("sales");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!scope) return;
    setForm(target ? { ...emptyTarget(), ...target, period, targetItems: mergeTargetItems(target.targetItems) } : { ...emptyTarget(), period });
    setActiveTargetType("sales");
  }, [scope, target, period]);

  const salesItems = useMemo(() => form.targetItems.filter((item) => item.targetType === "sales"), [form.targetItems]);
  const serviceItems = useMemo(() => form.targetItems.filter((item) => item.targetType === "service"), [form.targetItems]);
  const salesStats = useMemo(() => summarizeTargetItems(salesItems), [salesItems]);
  const serviceStats = useMemo(() => summarizeTargetItems(serviceItems), [serviceItems]);
  const allStats = useMemo(() => summarizeTargetItems(form.targetItems), [form.targetItems]);
  const activeStats = activeTargetType === "sales" ? salesStats : serviceStats;
  const invalidCount = salesStats.invalid + serviceStats.invalid;
  const hasInvalidTargets = invalidCount > 0;
  const activeCompletion = activeStats.total ? Math.round((activeStats.filled / activeStats.total) * 100) : 0;
  const activeLabel = targetTypeLabel(activeTargetType);

  if (!scope) return null;

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

  return (
    <Dialog open={!!scope} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] w-[calc(100vw-1rem)] max-w-none gap-0 overflow-hidden p-0 sm:w-[min(1220px,calc(100vw-2rem))] sm:max-w-none">
        <form onSubmit={submit} className="flex max-h-[92dvh] min-h-0 flex-col">
          <DialogHeader className="border-b border-border/60 bg-background px-4 py-4 pr-11 sm:px-5">
            <DialogTitle className="leading-snug">Hedef Belirle · {scope.name}</DialogTitle>
            <DialogDescription>
              {scopeKindLabel(scope.kind)}{scope.subtitle ? ` · ${scope.subtitle}` : ""} · {formatPeriodLabel(period)} dönemi aylık hedefleri.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
            {scope.kind === "role" && (
              <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <Users className="mt-0.5 size-4 shrink-0 text-amber-700" />
                <span>
                  Kaydedildiğinde bu roldeki <b>{scope.memberCount ?? "tüm"}</b> aktif kullanıcıya {formatPeriodLabel(period)} dönemi için
                  kişisel hedef olarak uygulanır; kullanıcıların mevcut dönem hedefleri bu değerlerle değiştirilir.
                </span>
              </div>
            )}
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

            <section className="rounded-md border border-border/60 bg-muted/10 p-3">
              <div className="mb-2 flex items-center gap-2">
                <TrendingUp className="size-4 text-primary" />
                <span className="text-sm font-semibold">Ana Hedefler</span>
                <span className="text-[11px] text-muted-foreground">— gerçekleşmeler sistemden otomatik ölçülür (fatura, teklif, ziyaret, arama, servis)</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <MeasuredField label="Satış Cirosu" unit="USD" value={form.salesAmount} onChange={(v) => updateField("salesAmount", v)} />
                <MeasuredField label="Yeni Müşteri" unit="adet" value={form.salesNewCustomers} onChange={(v) => updateField("salesNewCustomers", v)} />
                <MeasuredField label="Teklif" unit="adet" value={form.quoteTarget} onChange={(v) => updateField("quoteTarget", v)} />
                <MeasuredField label="Ziyaret" unit="adet" value={form.visitTarget} onChange={(v) => updateField("visitTarget", v)} />
                <MeasuredField label="Arama" unit="adet" value={form.callTarget} onChange={(v) => updateField("callTarget", v)} />
                <MeasuredField label="Servis Cirosu" unit="USD" value={form.serviceAmount} onChange={(v) => updateField("serviceAmount", v)} />
                <MeasuredField label="Tamamlanan Servis" unit="adet" value={form.serviceCompleted} onChange={(v) => updateField("serviceCompleted", v)} />
                <MeasuredField label="Dijital Lead" unit="adet" value={form.digitalLeadTarget} onChange={(v) => updateField("digitalLeadTarget", v)} />
                <MeasuredField label="Dijital Dönüşüm" unit="adet" value={form.digitalConversionTarget} onChange={(v) => updateField("digitalConversionTarget", v)} />
                <MeasuredField label="Dijital Bütçe" unit="USD" value={form.digitalBudget} onChange={(v) => updateField("digitalBudget", v)} />
              </div>
            </section>

            <div className="grid gap-2 md:grid-cols-3">
              <TargetSummaryMetric
                icon={CheckCircle2}
                label={`${activeLabel} doluluk`}
                value={`${activeStats.filled}/${activeStats.total}`}
                helper={`%${activeCompletion} tamamlandı`}
                progress={activeCompletion}
              />
              <TargetSummaryMetric
                icon={ListChecks}
                label="Adet hedefi"
                value={`${formatTargetNumber(activeStats.countTotal)} adet`}
                helper={`${activeLabel} sekmesi`}
              />
              <TargetSummaryMetric
                icon={CircleDollarSign}
                label="Tutar hedefi"
                value={`${targetCurrencyLabel()} ${formatTargetNumber(activeStats.amountTotal)}`}
                helper={activeStats.invalid ? `${activeStats.invalid} değer kontrol edilmeli` : `${activeLabel} sekmesi`}
                tone={activeStats.invalid ? "danger" : "default"}
              />
            </div>

            <Tabs value={activeTargetType} onValueChange={(value) => setActiveTargetType(value as UserTargetType)}>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <TabsList className="grid h-auto w-full grid-cols-2 bg-muted/60 p-1 lg:w-[460px]">
                  <TabsTrigger value="sales" className="h-10 gap-2 whitespace-nowrap px-3">
                    <TrendingUp className="size-3.5" />
                    <span>Satış</span>
                    <span className="ml-auto rounded bg-background/80 px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground">
                      {salesStats.filled}/{salesStats.total}
                    </span>
                  </TabsTrigger>
                  <TabsTrigger value="service" className="h-10 gap-2 whitespace-nowrap px-3">
                    <Wrench className="size-3.5" />
                    <span>Servis</span>
                    <span className="ml-auto rounded bg-background/80 px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground">
                      {serviceStats.filled}/{serviceStats.total}
                    </span>
                  </TabsTrigger>
                </TabsList>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="outline" size="sm" className="h-9 w-full justify-between gap-2 sm:w-auto">
                      <span className="inline-flex items-center gap-1.5">
                        <RotateCcw className="size-3.5" /> Şablon İşlemleri
                      </span>
                      <ChevronDown className="size-3.5 text-muted-foreground" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64">
                    <DropdownMenuLabel>{targetTypeTitle(activeTargetType)}</DropdownMenuLabel>
                    <DropdownMenuItem onClick={() => applyTemplateTargets(activeTargetType)}>
                      <RotateCcw className="size-4" /> Aktif sekmeyi şablondan doldur
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => applyTemplateTargets()}>
                      <ListChecks className="size-4" /> Tüm hedefleri şablondan doldur
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => clearTargets(activeTargetType)}>
                      <Eraser className="size-4" /> Aktif sekmeyi temizle
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => clearTargets()} variant="destructive">
                      <Trash2 className="size-4" /> Tüm hedefleri temizle
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <TabsContent value="sales" className="mt-3">
                <TargetTemplateTable
                  items={salesItems}
                  onTargetChange={updateItemTarget}
                />
              </TabsContent>
              <TabsContent value="service" className="mt-3">
                <TargetTemplateTable
                  items={serviceItems}
                  onTargetChange={updateItemTarget}
                />
              </TabsContent>
            </Tabs>
          </div>
          <DialogFooter className="border-t border-border/60 px-4 py-3 sm:items-center sm:justify-between sm:px-5 sm:py-4">
            <div className={cn("min-h-5 text-xs", hasInvalidTargets ? "text-destructive" : "text-muted-foreground")}>
              {hasInvalidTargets ? (
                <span className="inline-flex items-center gap-1.5">
                  <AlertTriangle className="size-3.5" /> {invalidCount} hedef değeri kontrol edilmeli
                </span>
              ) : (
                <span>{allStats.filled}/{allStats.total} hedef dolu</span>
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
