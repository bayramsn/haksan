import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Badge } from "../../ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { Textarea } from "../../ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import { Switch } from "../../ui/switch";
import { Checkbox } from "../../ui/checkbox";
import { Label } from "../../ui/label";
import { Alert, AlertDescription, AlertTitle } from "../../ui/alert";
import { Skeleton } from "../../ui/skeleton";
import { CreateUserDialog, UserDepartmentDialog } from "../../admin/UserAdminDialogs";
import { FormField } from "../shared/formFields";
import { useStore } from "../../../lib/store";
import { useAuth } from "../../../../lib/auth";
import { adminService } from "../../../../lib/services";
import type { User } from "../../../lib/mock";
import { Plus, TrendingUp, ShieldCheck, Settings, Building2, Wrench, RotateCcw, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

type UserTargetType = "sales" | "service";
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

const currentPeriod = () => new Date().toISOString().slice(0, 7);
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
const TARGET_TEMPLATES: Record<UserTargetType, TargetTemplateItem[]> = {
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
const targetItemKey = (item: Pick<UserTargetItem, "targetType" | "category" | "activity">) => `${item.targetType}:${item.category}:${item.activity}`;
const defaultTargetItems = (): UserTargetItem[] => allTargetTemplates().map((item) => ({ ...item, target: item.defaultTarget }));
const emptyTarget = (): UserTarget => ({
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
const mergeTargetItems = (items: unknown): UserTargetItem[] => {
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
  const trimmed = value.trim();
  if (!trimmed) return null;
  const numeric = Number(trimmed.replace(",", "."));
  return Number.isFinite(numeric) ? numeric : null;
};
const targetFromApi = (row: any): UserTarget => ({
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
const targetToApi = (target: UserTarget) => ({
  period: target.period,
  currency: "USD",
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
const hasTargetValue = (t?: UserTarget) =>
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
const targetFilledCount = (target: UserTarget, targetType: UserTargetType) =>
  target.targetItems.filter((item) => item.targetType === targetType && !!item.target.trim()).length;
const targetTotalCount = (targetType: UserTargetType) => TARGET_TEMPLATES[targetType].length;

function TargetPill({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-brand-blue-soft px-2 py-0.5 text-[11px] text-brand-blue">
      <TrendingUp className="size-3" />
      <span>{label}</span>
      <span className="text-blue-500">{value}</span>
    </span>
  );
}

type AssignableRole = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  isSystemRole?: boolean;
};

type AdminUserRow = User & {
  roleCodes: string[];
  roleNames: string[];
  departmentId?: string | null;
  divisionIds: string[];
  divisionNames: string[];
};

const FALLBACK_ROLE_CODES: Record<string, string> = {
  SuperAdmin: "super_admin",
  Admin: "admin",
  Sales: "sales",
  Service: "service",
};

const normalizeStoreUser = (user: User): AdminUserRow => ({
  ...user,
  roleCodes: [FALLBACK_ROLE_CODES[user.role] ?? user.role],
  roleNames: [user.role],
  divisionIds: [],
  divisionNames: [],
});

const normalizeAdminUser = (user: any, fallback?: User): AdminUserRow => {
  const roles = Array.isArray(user.roles) ? user.roles : [];
  const roleCodes = roles.map((role: any) => String(role?.code ?? "")).filter(Boolean);
  const roleNames = roles.map((role: any) => String(role?.name ?? role?.code ?? "")).filter(Boolean);
  const divisionRows = Array.isArray(user.divisions) ? user.divisions : [];
  const divisionIds = divisionRows.map((d: any) => String(d?.id ?? "")).filter(Boolean);
  const divisionNames = divisionRows.map((d: any) => String(d?.name ?? d?.code ?? "")).filter(Boolean);
  const fallbackRole = fallback?.role ?? "Admin";

  return {
    id: user.id,
    name: user.fullName ?? user.name ?? fallback?.name ?? user.email ?? "—",
    email: user.email ?? fallback?.email ?? "",
    role: ((roleNames[0] ?? fallbackRole) as User["role"]) || fallbackRole,
    department: user.department?.name ?? fallback?.department ?? "",
    departmentId: user.departmentId ?? user.department?.id ?? fallback?.departmentId ?? null,
    active: user.status ? user.status !== "passive" : fallback?.active ?? true,
    avatarUrl: user.avatarUrl ?? user.photoUrl ?? fallback?.avatarUrl,
    purchaseApprovalLimit: user.purchaseApprovalLimit ? Number(user.purchaseApprovalLimit) : fallback?.purchaseApprovalLimit,
    managerId: user.managerId ?? fallback?.managerId,
    roleCodes: roleCodes.length ? roleCodes : [FALLBACK_ROLE_CODES[fallbackRole] ?? fallbackRole],
    roleNames: roleNames.length ? roleNames : [fallbackRole],
    divisionIds,
    divisionNames,
  };
};

export function UsersPage() {
  const { users } = useStore();
  const { hasRole, hasPermission } = useAuth();
  // Hedef oluşturma süper admin (ve admin) yetkisine bağlı.
  const canSetTargets = hasRole("super_admin") || hasRole("admin");
  const canAssignRoles = hasRole("super_admin") || hasPermission("users.update");
  const canCreateUser = hasRole("super_admin") || hasPermission("users.create");
  const canUpdateUser = hasRole("super_admin") || hasPermission("users.update");
  const canShowActions = canSetTargets || canAssignRoles || canUpdateUser;
  const [adminUsers, setAdminUsers] = useState<AdminUserRow[]>([]);
  const [departments, setDepartments] = useState<{ id: string; name: string; code?: string }[]>([]);
  const [divisions, setDivisions] = useState<{ id: string; code: string; name: string }[]>([]);
  const [availableRoles, setAvailableRoles] = useState<AssignableRole[]>([]);
  const [adminLoading, setAdminLoading] = useState(true);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [targetPeriod, setTargetPeriod] = useState(currentPeriod());
  const [targets, setTargets] = useState<Record<string, UserTarget>>({});
  const [targetUser, setTargetUser] = useState<User | null>(null);
  const [roleUser, setRoleUser] = useState<AdminUserRow | null>(null);
  const [limitUser, setLimitUser] = useState<User | null>(null);
  const [deptUser, setDeptUser] = useState<AdminUserRow | null>(null);
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [savingRoles, setSavingRoles] = useState(false);
  const [savingLimit, setSavingLimit] = useState(false);
  const [savingDept, setSavingDept] = useState(false);

  const loadAdminUsers = useCallback(async () => {
    setAdminLoading(true);
    setAdminError(null);
    try {
      const [userRows, roleRows, deptRows, divisionRows] = await Promise.all([
        adminService.users(),
        canAssignRoles || canCreateUser ? adminService.roles() : Promise.resolve([]),
        adminService.departments().catch(() => []),
        adminService.divisions().catch(() => []),
      ]);
      const fallbackById = new Map(users.map((user) => [user.id, user]));
      setAdminUsers((Array.isArray(userRows) ? userRows : []).map((user) => normalizeAdminUser(user, fallbackById.get(user.id))));
      setDepartments((Array.isArray(deptRows) ? deptRows : []).map((d: any) => ({ id: d.id, name: d.name, code: d.code })));
      setDivisions((Array.isArray(divisionRows) ? divisionRows : []).map((d: any) => ({ id: d.id, code: d.code, name: d.name })));
      setAvailableRoles(
        (Array.isArray(roleRows) ? roleRows : [])
          .map((role: any) => ({
            id: role.id,
            code: role.code,
            name: role.name,
            description: role.description,
            isSystemRole: role.isSystemRole,
          }))
          .sort((a, b) => {
            if (!!b.isSystemRole !== !!a.isSystemRole) return Number(!!b.isSystemRole) - Number(!!a.isSystemRole);
            return a.name.localeCompare(b.name, "tr");
          })
      );
    } catch (err: any) {
      setAdminError(err?.message ?? "Kullanıcılar yüklenemedi.");
      setAdminUsers([]);
      setAvailableRoles([]);
    } finally {
      setAdminLoading(false);
    }
  }, [canAssignRoles, canCreateUser, users]);

  useEffect(() => {
    loadAdminUsers();
  }, [loadAdminUsers]);

  const displayUsers = adminUsers.length ? adminUsers : users.map(normalizeStoreUser);

  const fetchTargets = useCallback(async () => {
    if (!canSetTargets) return;
    try {
      const rows = await adminService.userTargets({ period: targetPeriod });
      const next: Record<string, UserTarget> = {};
      rows.forEach((row: any) => {
        next[row.userId] = targetFromApi(row);
      });
      setTargets(next);
    } catch (err: any) {
      toast.error("Hedefler yüklenemedi", { description: err?.message ?? "Backend isteği başarısız oldu." });
    }
  }, [canSetTargets, targetPeriod]);

  useEffect(() => {
    fetchTargets();
  }, [fetchTargets]);

  const handleSaveTarget = async (userId: string, target: UserTarget) => {
    const saved = await adminService.saveUserTarget(userId, targetToApi({ ...target, period: targetPeriod }));
    setTargets((prev) => ({ ...prev, [userId]: targetFromApi(saved) }));
  };

  const handleSaveLimit = async (userId: string, limit: number | undefined, managerId: string | undefined) => {
    setSavingLimit(true);
    try {
      await adminService.updateUser(userId, {
        purchaseApprovalLimit: limit ?? 0,
        managerId: managerId ?? null,
      });
      toast.success("Kullanıcı limitleri güncellendi");
      setLimitUser(null);
      await loadAdminUsers();
    } catch (err: any) {
      toast.error("Limitler güncellenemedi", { description: err?.message ?? "Lütfen tekrar deneyin." });
    } finally {
      setSavingLimit(false);
    }
  };

  const handleSaveRoles = async (userId: string, roleCodes: string[]) => {
    setSavingRoles(true);
    try {
      await adminService.updateUser(userId, { roleCodes });
      toast.success("Roller güncellendi");
      setRoleUser(null);
      await loadAdminUsers();
    } catch (err: any) {
      toast.error("Roller güncellenemedi", { description: err?.message ?? "Lütfen tekrar deneyin." });
    } finally {
      setSavingRoles(false);
    }
  };

  const handleSaveDepartment = async (userId: string, departmentId: string | null, active: boolean, divisionIds?: string[]) => {
    setSavingDept(true);
    try {
      await adminService.updateUser(userId, {
        departmentId,
        status: active ? "active" : "passive",
        // Yalnızca dialogdan açıkça düzenlendiğinde gönder — durum anahtarı bölümleri silmesin.
        ...(divisionIds ? { divisionIds } : {}),
      });
      toast.success("Kullanıcı güncellendi");
      setDeptUser(null);
      await loadAdminUsers();
    } catch (err: any) {
      toast.error("Güncellenemedi", { description: err?.message ?? "Lütfen tekrar deneyin." });
    } finally {
      setSavingDept(false);
    }
  };

  return (
    <>
      <Card className="border-border/60 shadow-sm overflow-hidden">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Kullanıcılar</CardTitle>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {canSetTargets && (
              <Input
                type="month"
                className="h-9 w-full sm:w-[150px]"
                value={targetPeriod}
                onChange={(e) => setTargetPeriod(e.target.value || currentPeriod())}
              />
            )}
            {canCreateUser && (
              <Button className="gap-1" onClick={() => setCreateUserOpen(true)}><Plus className="size-4" /> Kullanıcı Ekle</Button>
            )}
          </div>
        </CardHeader>
        {adminError && (
          <div className="mx-4 mb-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {adminError}
          </div>
        )}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ad Soyad</TableHead>
                <TableHead>E-posta</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Departman</TableHead>
                <TableHead>Bölüm</TableHead>
                <TableHead>Hedef</TableHead>
                <TableHead>Onay Limiti</TableHead>
                <TableHead>Yönetici</TableHead>
                <TableHead>Aktif</TableHead>
                {canShowActions && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {adminLoading && displayUsers.length === 0 ? (
                Array.from({ length: 4 }).map((_, index) => (
                  <TableRow key={`users-loading-${index}`}>
                    {Array.from({ length: canShowActions ? 10 : 9 }).map((__, cellIndex) => (
                      <TableCell key={cellIndex}><Skeleton className="h-5 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : displayUsers.map((u) => {
                const t = targets[u.id];
                return (
                  <TableRow key={u.id}>
                    <TableCell>{u.name}</TableCell>
                    <TableCell className="text-muted-foreground">{u.email}</TableCell>
                    <TableCell>
                      <div className="flex max-w-[260px] flex-wrap gap-1">
                        {u.roleNames.map((role) => (
                          <Badge key={role} variant="secondary">{role}</Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      {canUpdateUser ? (
                        <Button variant="link" className="h-auto p-0 text-sm" onClick={() => setDeptUser(u)}>
                          {u.department || "— Atanmadı —"}
                        </Button>
                      ) : (
                        u.department || "—"
                      )}
                    </TableCell>
                    <TableCell>
                      {u.divisionNames.length > 0 ? (
                        <div className="flex max-w-[200px] flex-wrap gap-1">
                          {u.divisionNames.map((d, i) => (
                            <Badge key={d} variant={i === 0 ? "default" : "outline"} className="text-[10px]">{d}</Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {hasTargetValue(t) ? (
                        <div className="flex flex-wrap gap-1">
                          <TargetPill label="Satış" value={`${targetFilledCount(t, "sales")}/${targetTotalCount("sales")}`} />
                          <TargetPill label="Servis" value={`${targetFilledCount(t, "service")}/${targetTotalCount("service")}`} />
                        </div>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {u.purchaseApprovalLimit ? `${u.purchaseApprovalLimit.toLocaleString("tr-TR")} ₺` : <span className="text-muted-foreground text-xs">Limitsiz</span>}
                    </TableCell>
                    <TableCell>
                      {u.managerId ? displayUsers.find((x) => x.id === u.managerId)?.name : <span className="text-muted-foreground text-xs">—</span>}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={u.active}
                        disabled={!canUpdateUser}
                        onCheckedChange={canUpdateUser ? (checked) => void handleSaveDepartment(u.id, u.departmentId ?? null, checked) : undefined}
                      />
                    </TableCell>
                    {canShowActions && (
                      <TableCell className="text-right whitespace-nowrap">
                        {canUpdateUser && (
                          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => setDeptUser(u)}>
                            <Building2 className="size-3.5" /> Departman
                          </Button>
                        )}
                        {canAssignRoles && (
                          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => setRoleUser(u)}>
                            <ShieldCheck className="size-3.5" /> Rol Ata
                          </Button>
                        )}
                        {canSetTargets && (
                          <>
                            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => setTargetUser(u)}>
                              <TrendingUp className="size-3.5" /> Hedef
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => setLimitUser(u)}>
                              <Settings className="size-3.5" /> Limit
                            </Button>
                          </>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>

      {canSetTargets && (
        <UserTargetDialog
          user={targetUser}
          target={targetUser ? targets[targetUser.id] : undefined}
          period={targetPeriod}
          onClose={() => setTargetUser(null)}
          onSave={handleSaveTarget}
        />
      )}
      {canAssignRoles && (
        <UserRoleDialog
          user={roleUser}
          roles={availableRoles}
          saving={savingRoles}
          onClose={() => setRoleUser(null)}
          onSave={handleSaveRoles}
        />
      )}
      {canSetTargets && (
        <UserLimitDialog
          user={limitUser}
          users={displayUsers}
          saving={savingLimit}
          onClose={() => setLimitUser(null)}
          onSave={handleSaveLimit}
        />
      )}
      {canUpdateUser && (
        <UserDepartmentDialog
          user={deptUser}
          departments={departments}
          divisions={divisions}
          saving={savingDept}
          onClose={() => setDeptUser(null)}
          onSave={handleSaveDepartment}
        />
      )}
      {canCreateUser && (
        <CreateUserDialog
          open={createUserOpen}
          onOpenChange={setCreateUserOpen}
          departments={departments}
          roles={availableRoles}
          divisions={divisions}
          onCreated={loadAdminUsers}
        />
      )}
    </>
  );
}

function UserRoleDialog({ user, roles, saving, onClose, onSave }: {
  user: AdminUserRow | null;
  roles: AssignableRole[];
  saving: boolean;
  onClose: () => void;
  onSave: (userId: string, roleCodes: string[]) => Promise<void>;
}) {
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);

  useEffect(() => {
    if (user) setSelectedCodes(user.roleCodes);
  }, [user]);

  if (!user) return null;

  const toggleRole = (code: string, checked: boolean) => {
    setSelectedCodes((current) =>
      checked ? [...new Set([...current, code])].sort() : current.filter((item) => item !== code)
    );
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onSave(user.id, selectedCodes);
  };

  return (
    <Dialog open={!!user} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Rol Ata · {user.name}</DialogTitle>
          <DialogDescription>Kullanıcının erişim rollerini seçin. Kaydettiğinizde roller mevcut seçimle değiştirilir.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-sm">
            <div className="font-medium">{user.email}</div>
            <div className="mt-1 flex flex-wrap gap-1">
              {user.roleNames.map((role) => <Badge key={role} variant="outline">{role}</Badge>)}
            </div>
          </div>
          {roles.length === 0 ? (
            <Alert>
              <AlertTriangle className="size-4" />
              <AlertTitle>Rol listesi yüklenemedi</AlertTitle>
              <AlertDescription>Rol ataması yapabilmek için rol okuma yetkisi veya bağlantı gerekir.</AlertDescription>
            </Alert>
          ) : (
            <div className="grid max-h-[360px] gap-2 overflow-y-auto pr-1">
              {roles.map((role) => {
                const checked = selectedCodes.includes(role.code);
                return (
                  <label
                    key={role.id}
                    htmlFor={`assign-role-${role.id}`}
                    className="flex cursor-pointer items-start gap-3 rounded-md border border-border/60 p-3 transition-colors hover:bg-muted/40"
                  >
                    <Checkbox
                      id={`assign-role-${role.id}`}
                      checked={checked}
                      onCheckedChange={(value) => toggleRole(role.code, value === true)}
                      disabled={saving}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="font-medium leading-none">{role.name}</span>
                        {role.isSystemRole && <Badge variant="secondary" className="text-[10px]">Sistem</Badge>}
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">{role.description || role.code}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>İptal</Button>
            <Button type="submit" disabled={saving || roles.length === 0}>
              {saving ? "Kaydediliyor..." : "Rolleri Kaydet"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function UserLimitDialog({ user, users, saving, onClose, onSave }: {
  user: User | null;
  users: User[];
  saving: boolean;
  onClose: () => void;
  onSave: (userId: string, limit: number | undefined, managerId: string | undefined) => Promise<void>;
}) {
  const [limit, setLimit] = useState<string>(user?.purchaseApprovalLimit?.toString() || "");
  const [managerId, setManagerId] = useState<string>(user?.managerId || "none");

  useEffect(() => {
    if (user) {
      setLimit(user.purchaseApprovalLimit?.toString() || "");
      setManagerId(user.managerId || "none");
    }
  }, [user]);

  if (!user) return null;

  return (
    <Dialog open={!!user} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Satınalma Limit & Onay Yetkisi</DialogTitle>
          <DialogDescription>{user.name} için satınalma onay limitini ve yöneticisini ayarlayın.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Onay Limiti (₺)</Label>
            <Input
              type="number"
              placeholder="Limitsiz için boş bırakın"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Bağlı Olduğu Yönetici</Label>
            <Select value={managerId} onValueChange={setManagerId}>
              <SelectTrigger>
                <SelectValue placeholder="Yönetici Seçin" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Yok (Doğrudan Onaylar)</SelectItem>
                {users.filter(u => u.id !== user.id).map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground mt-1">Limit aşıldığında sipariş bu yöneticinin onayına sunulur.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>İptal</Button>
          <Button
            disabled={saving}
            onClick={async () => {
              await onSave(user.id, limit ? Number(limit) : undefined, managerId === "none" ? undefined : managerId);
            }}
          >
            {saving ? "Kaydediliyor…" : "Kaydet"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UserTargetDialog({ user, target, period, onClose, onSave }: {
  user: User | null;
  target?: UserTarget;
  period: string;
  onClose: () => void;
  onSave: (userId: string, target: UserTarget) => Promise<void>;
}) {
  const [form, setForm] = useState<UserTarget>(emptyTarget());
  const [activeTargetType, setActiveTargetType] = useState<UserTargetType>("sales");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    setForm(target ? { ...emptyTarget(), ...target, period, targetItems: mergeTargetItems(target.targetItems) } : { ...emptyTarget(), period });
    setActiveTargetType("sales");
  }, [user, target, period]);

  if (!user) return null;

  const updateField = (key: keyof UserTarget, value: string) => setForm((prev) => ({ ...prev, [key]: value }));
  const updateItemTarget = (key: string, value: string) => {
    setForm((prev) => ({
      ...prev,
      targetItems: prev.targetItems.map((item) => (targetItemKey(item) === key ? { ...item, target: value } : item)),
    }));
  };
  const resetActiveDefaults = () => {
    setForm((prev) => ({
      ...prev,
      targetItems: prev.targetItems.map((item) => (item.targetType === activeTargetType ? { ...item, target: item.defaultTarget } : item)),
    }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(user.id, {
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
      toast.success("Hedef kaydedildi", { description: `${user.name} · ${period}` });
      onClose();
    } catch (err: any) {
      toast.error("Hedef kaydedilemedi", { description: err?.message ?? "Backend isteği başarısız oldu." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-none gap-0 overflow-hidden p-0 sm:w-[min(1180px,calc(100vw-2rem))] sm:max-w-none max-h-[92dvh]">
        <form onSubmit={submit} className="flex max-h-[92dvh] flex-col">
          <DialogHeader className="border-b border-border/60 px-4 py-4 pr-11 sm:px-5">
            <DialogTitle className="leading-snug">Hedef Belirle · {user.name}</DialogTitle>
            <DialogDescription>{user.role} · {user.department} — {period} dönemi aylık hedefleri.</DialogDescription>
          </DialogHeader>
          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
            <div className="grid gap-3 sm:grid-cols-[160px_120px_1fr]">
              <FormField label="Dönem">
                <Input type="month" className="h-9" value={period} disabled />
              </FormField>
              <FormField label="Para Birimi">
                <Input className="h-9 bg-muted/50 font-medium" value="USD" disabled />
              </FormField>
              <FormField label="Not">
                <Textarea className="min-h-[36px] resize-none" value={form.note} onChange={(e) => updateField("note", e.target.value)} />
              </FormField>
            </div>

            <Tabs value={activeTargetType} onValueChange={(value) => setActiveTargetType(value as UserTargetType)}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <TabsList className="grid h-9 w-full grid-cols-2 bg-muted/60 sm:w-auto">
                  <TabsTrigger value="sales" className="gap-1.5 whitespace-nowrap">
                    <TrendingUp className="size-3.5" /> Satış Hedefleri
                  </TabsTrigger>
                  <TabsTrigger value="service" className="gap-1.5 whitespace-nowrap">
                    <Wrench className="size-3.5" /> Servis Hedefleri
                  </TabsTrigger>
                </TabsList>
                <Button type="button" variant="outline" size="sm" className="h-8 w-full gap-1.5 sm:w-auto" onClick={resetActiveDefaults}>
                  <RotateCcw className="size-3.5" /> Şablondan Doldur
                </Button>
              </div>
              <TabsContent value="sales" className="mt-3">
                <TargetTemplateTable
                  items={form.targetItems.filter((item) => item.targetType === "sales")}
                  onTargetChange={updateItemTarget}
                />
              </TabsContent>
              <TabsContent value="service" className="mt-3">
                <TargetTemplateTable
                  items={form.targetItems.filter((item) => item.targetType === "service")}
                  onTargetChange={updateItemTarget}
                />
              </TabsContent>
            </Tabs>
          </div>
          <DialogFooter className="border-t border-border/60 px-4 py-3 sm:px-5 sm:py-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>İptal</Button>
            <Button type="submit" disabled={saving}>{saving ? "Kaydediliyor..." : "Kaydet"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const targetCurrencyLabel = () => "USD";

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

function TargetTemplateTable({ items, onTargetChange }: {
  items: UserTargetItem[];
  onTargetChange: (key: string, value: string) => void;
}) {
  const groups = groupTargetItems(items);
  return (
    <div className="space-y-3">
      <div className="md:hidden space-y-3">
        {groups.map((group) => (
          <div key={group.category} className="space-y-2">
            <div className="sticky top-0 z-10 rounded-md bg-background/95 py-1 text-[11px] font-semibold tracking-wide text-muted-foreground">
              {group.category}
            </div>
            {group.items.map((item) => (
              <div key={targetItemKey(item)} className="rounded-md border border-border/60 bg-background p-3 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium leading-snug">{item.activity}</div>
                    <div className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.description}</div>
                  </div>
                  <div className="shrink-0">
                    {item.unit === "amount" && <div className="mb-1 text-right text-[11px] text-muted-foreground">{targetCurrencyLabel()}</div>}
                    <Input
                      className="h-8 w-24 text-right tabular-nums"
                      inputMode={item.unit === "amount" ? "decimal" : "numeric"}
                      value={item.target}
                      onChange={(e) => onTargetChange(targetItemKey(item), e.target.value)}
                      placeholder={item.unit === "amount" ? "tutar" : "adet"}
                    />
                    {item.unit === "count" && <div className="mt-1 text-right text-[11px] text-muted-foreground">adet</div>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="hidden overflow-hidden rounded-md border border-border/60 md:block">
      <div className="max-h-[54vh] overflow-auto">
        <Table className="min-w-[900px] table-fixed">
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow>
              <TableHead className="w-[130px]">Kategori</TableHead>
              <TableHead className="w-[250px]">Aktivite</TableHead>
              <TableHead>Aktivite Açıklaması</TableHead>
              <TableHead className="w-[180px] text-right">Aylık Hedef</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((group) =>
              group.items.map((item, index) => (
                <TableRow key={targetItemKey(item)} className={index === 0 ? "border-t border-border/70" : undefined}>
                  <TableCell className="align-top text-xs font-semibold text-muted-foreground">
                    {index === 0 ? group.category : ""}
                  </TableCell>
                  <TableCell className="align-top text-sm font-medium whitespace-normal break-words">{item.activity}</TableCell>
                  <TableCell className="align-top text-xs leading-relaxed text-muted-foreground whitespace-normal break-words">{item.description}</TableCell>
                  <TableCell className="align-top">
                    <div className="flex items-center justify-end gap-1.5">
                      {item.unit === "amount" && <span className="min-w-8 text-right text-xs text-muted-foreground">{targetCurrencyLabel()}</span>}
                      <Input
                        className="h-8 w-24 text-right tabular-nums"
                        inputMode={item.unit === "amount" ? "decimal" : "numeric"}
                        value={item.target}
                        onChange={(e) => onTargetChange(targetItemKey(item), e.target.value)}
                        placeholder={item.unit === "amount" ? "tutar" : "adet"}
                      />
                      {item.unit === "count" && <span className="w-8 text-xs text-muted-foreground">adet</span>}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      </div>
    </div>
  );
}
