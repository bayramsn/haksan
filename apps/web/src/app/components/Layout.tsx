import { ReactNode, useMemo, useState, useEffect, useRef } from "react";
import { useStore } from "../lib/store";
import { type Customer } from "../lib/mock";
import {
  LayoutDashboard, Users, Briefcase, KanbanSquare, FileText, FolderOpen,
  CreditCard, Boxes, Truck, Wrench, Cpu,
  LifeBuoy, BarChart3, ShieldCheck, Building2, Contact as ContactIcon, Settings as SettingsIcon,
  Search, Bell, ChevronDown, LogOut, Plus, HelpCircle, Menu, PanelLeftClose, PanelLeftOpen,
  CheckCircle2, Clock, AlertTriangle, Tag, Receipt, Map as MapIcon, Wallet, Calendar, MessageCircle, MessageSquare,
  ListChecks,
  Star, Rows3,
} from "lucide-react";
import { chatService, notificationService, type NotificationDTO, type NotificationTarget } from "../../lib/services";
import { useAuth } from "../../lib/auth";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { Badge } from "./ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { ScrollArea } from "./ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";
import { QuickCreateDialog } from "./dialogs/CreateDialogs";
import { BrandIllustration } from "./brand";
import { HelpCenterDialog } from "./HelpCenterDialog";
import { ApprovalsDialog } from "./ApprovalsDialog";
import { CommandPalette } from "./operations/CommandPalette";
import { buildAlerts, type OperationAction, type OperationNav } from "../lib/operations";
import { isNavigationAreaEnabled, NAVIGATION_GROUPS, type NavigationVisibilityKey } from "@haksan/shared";
import { normalizeCompany } from "../lib/companyNormalizer";
import { Kbd } from "./ui/kbd";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "./ui/sheet";
import { PageHeader } from "./shared/PageHeader";

export type NavKey =
  | NavigationVisibilityKey | "kanban"
  | "proformas" | "contracts" | "documents" | "payments" | "accounting-invoices" | "customer-balances" | "due-dates" | "sales-price-list" | "references" | "products"
  | "stock" | "purchase-orders" | "shipments"
  | "installations" | "deliveries" | "machines" | "service-requests" | "service-kanban" | "service-price-list"
  | "reports" | "users" | "roles" | "departments" | "settings";

type NavItem = { key: NavKey; label: string; icon: any; badge?: string; roles?: string[] };

// Yönetim grubu sadece admin/super_admin'e açıktır (canSee bu set'i kullanır).
export const MGMT_KEYS = new Set<NavKey>(["users", "roles", "departments", "settings"]);

export const RESOURCE_BY_NAV: Partial<Record<NavKey, string>> = {
  calendar: "calendar",
  customers: "companies",
  contacts: "contacts",
  leads: "opportunities",
  "sales-cases": "opportunities",
  kanban: "opportunities",
  "sales-map": "companies",
  offers: "quotes",
  proformas: "proformas",
  contracts: "contracts",
  documents: "files",
  "sales-price-list": "price_lists",
  references: "brands",
  products: "products",
  stock: "inventory",
  "purchase-orders": "purchase_orders",
  payments: "payments",
  "accounting-invoices": "accounting_invoices",
  "customer-balances": "receivables",
  "due-dates": "payments",
  shipments: "shipments",
  machines: "customer_devices",
  installations: "installations",
  "service-requests": "service_tickets",
  "service-kanban": "service_tickets",
  "service-price-list": "price_lists",
  reports: "reports",
  users: "users",
  roles: "roles",
  departments: "departments",
  settings: "tenants",
};

export function canAccessNavKey(
  key: NavKey,
  hasPermission: (permission: string) => boolean,
  hasRole: (role: string) => boolean
) {
  if (hasRole("admin") || hasRole("super_admin")) return true;
  if (MGMT_KEYS.has(key)) return false;
  if (key === "documents") {
    return ["files", "proformas", "contracts", "commercial_invoices"].some((resource) =>
      hasPermission(`${resource}.read`)
    );
  }
  const resource = RESOURCE_BY_NAV[key];
  if (!resource) return true;
  return hasPermission(`${resource}.read`);
}

// Her nav öğesinin `roles` listesi, backend izin matrisini (rolePermissionMatrix)
// yansıtır. admin/super_admin her şeyi görür; readonly yönetim hariç her şeyi.
const NAV_ICON: Record<NavigationVisibilityKey, any> = {
  dashboard: LayoutDashboard,
  chat: MessageCircle,
  calendar: Calendar,
  customers: Building2,
  leads: Rows3,
  "sales-cases": Briefcase,
  references: ListChecks,
  contacts: ContactIcon,
  "sales-map": MapIcon,
  offers: FileText,
  documents: FolderOpen,
  "sales-price-list": Tag,
  products: Cpu,
  stock: Boxes,
  payments: CreditCard,
  "accounting-invoices": Receipt,
  "customer-balances": Wallet,
  "due-dates": Calendar,
  shipments: Truck,
  machines: Cpu,
  installations: Wrench,
  "service-requests": LifeBuoy,
  "service-kanban": KanbanSquare,
  "service-price-list": Receipt,
};

const NAV_ROLES: Partial<Record<NavigationVisibilityKey, string[]>> = {
  customers: ["sales", "finance"],
  leads: ["sales"],
  "sales-cases": ["sales"],
  references: ["sales"],
  contacts: ["sales"],
  "sales-map": ["sales", "service"],
  offers: ["sales", "finance"],
  documents: ["sales", "finance"],
  "sales-price-list": ["sales"],
  products: ["sales", "service", "stock"],
  stock: ["stock"],
  payments: ["finance"],
  "accounting-invoices": ["finance", "sales"],
  "customer-balances": ["finance"],
  "due-dates": ["finance"],
  shipments: ["stock"],
  machines: ["service", "stock"],
  installations: ["service"],
  "service-requests": ["service"],
  "service-kanban": ["service"],
  "service-price-list": ["service"],
};

const NAV: { group: string; items: NavItem[] }[] = NAVIGATION_GROUPS.map((group) => ({
  group: group.group,
  items: group.items.map((item) => ({
    key: item.key,
    label: item.label,
    icon: NAV_ICON[item.key],
    roles: NAV_ROLES[item.key],
  })),
}));

type Props = {
  current: NavKey;
  onNavigate: (k: NavKey) => void;
  onLogout: () => void;
  pageTitle: string;
  pageSubtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  onSelectFirm?: (c: Customer) => void;
  onSelectCase?: (id: string, focus?: { activityId?: string }) => void;
  onOperationAction?: (action: OperationAction) => void;
};

export function Layout({ current, onNavigate, onLogout, pageTitle, pageSubtitle, actions, children, onSelectFirm, onSelectCase, onOperationAction }: Props) {
  const mainScrollRef = useRef<HTMLElement | null>(null);
  const store = useStore();
  const { customers, service } = store;
  const {
    activeDepartment,
    activeDivision,
    canUseAllDivisionsForResource,
    hasPermission,
    hasRole,
    scopesForResource,
    setActiveDepartment,
    setActiveDivision,
    tenant,
    user,
  } = useAuth();
  const canApprove = hasPermission("companies.update") || hasRole("super_admin");
  const divisions = user?.divisions ?? [];
  const departments = user?.departments ?? [];
  const currentResource = RESOURCE_BY_NAV[current] ?? "reports";
  const currentScopes = scopesForResource(currentResource);
  const canPickAllForResource = currentScopes.length === 0 ? (user?.canViewAllDivisions ?? false) : canUseAllDivisionsForResource(currentResource);
  const scopedDivisionIds = new Set(currentScopes.map((scope) => scope.divisionId).filter((id): id is string => !!id));
  const hasAllDepartmentScope = currentScopes.some((scope) => scope.departmentId === null);
  const scopedDepartmentIds = new Set(currentScopes.map((scope) => scope.departmentId).filter((id): id is string => !!id));

  useEffect(() => {
    mainScrollRef.current?.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [current]);
  const visibleDivisions =
    currentScopes.length === 0 || canPickAllForResource ? divisions : divisions.filter((division) => scopedDivisionIds.has(division.id));
  const visibleDepartments =
    currentScopes.length === 0 || hasAllDepartmentScope ? departments : departments.filter((department) => scopedDepartmentIds.has(department.id));
  const canPickDivision = visibleDivisions.length > 1 || canPickAllForResource;
  const canPickDepartment = visibleDepartments.length > 1;
  const activeDivisionLabel =
    activeDivision === "all" ? "Tümü" : divisions.find((d) => d.id === activeDivision)?.name ?? "Bölüm";
  const activeDepartmentLabel = departments.find((department) => department.id === activeDepartment)?.name ?? "Departman";
  const roleLabel = user?.roles?.[0] ? user.roles[0].replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "Kullanıcı";
  const userInitials = (user?.fullName ?? "?").split(" ").slice(0, 2).map((p) => p[0]).join("").toUpperCase();
  useEffect(() => {
    if (!user) return;
    if (activeDivision === "all") {
      if (!canPickAllForResource) {
        const next = visibleDivisions.find((division) => division.isPrimary)?.id ?? visibleDivisions[0]?.id;
        if (next) setActiveDivision(next);
      }
      return;
    }
    if (visibleDivisions.length > 0 && !visibleDivisions.some((division) => division.id === activeDivision)) {
      setActiveDivision(visibleDivisions.find((division) => division.isPrimary)?.id ?? visibleDivisions[0].id);
    }
  }, [activeDivision, canPickAllForResource, currentResource, setActiveDivision, user?.id, visibleDivisions]);
  useEffect(() => {
    if (!user) return;
    if (visibleDepartments.length > 0 && !visibleDepartments.some((department) => department.id === activeDepartment)) {
      setActiveDepartment(visibleDepartments.find((department) => department.isPrimary)?.id ?? visibleDepartments[0].id);
    }
  }, [activeDepartment, currentResource, setActiveDepartment, user?.id, visibleDepartments]);
  const canSee = (item: NavItem) => {
    return canAccessNavKey(item.key, hasPermission, hasRole);
  };
  const hiddenNavigationKeys = tenant?.hiddenNavigationKeys ?? [];
  const canDisplay = (item: NavItem) => canSee(item) && isNavigationAreaEnabled(item.key, hiddenNavigationKeys);
  const canSeeReports = hasRole("admin") || hasRole("super_admin") || hasPermission("reports.read");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("haksan:sidebar-collapsed") === "true";
  });
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") return {};
    try {
      return JSON.parse(window.localStorage.getItem("haksan:sidebar-groups") ?? "{}") as Record<string, boolean>;
    } catch {
      return {};
    }
  });
  const [pinnedNav, setPinnedNav] = useState<NavKey[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      return (JSON.parse(window.localStorage.getItem("haksan:pinned-nav") ?? "[]") as NavKey[]).filter((key) => NAV.some((group) => group.items.some((item) => item.key === key)));
    } catch {
      return [];
    }
  });
  const [recentNav, setRecentNav] = useState<NavKey[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(window.localStorage.getItem("haksan:recent-nav") ?? "[]") as NavKey[];
    } catch {
      return [];
    }
  });
  const [density, setDensity] = useState<"comfortable" | "compact">(() => {
    if (typeof window === "undefined") return "comfortable";
    return window.localStorage.getItem("haksan:density") === "compact" ? "compact" : "comfortable";
  });
  const [commandOpen, setCommandOpen] = useState(false);
  useEffect(() => {
    window.localStorage.setItem("haksan:sidebar-collapsed", String(sidebarCollapsed));
  }, [sidebarCollapsed]);
  useEffect(() => {
    window.localStorage.setItem("haksan:sidebar-groups", JSON.stringify(expandedGroups));
  }, [expandedGroups]);
  useEffect(() => {
    window.localStorage.setItem("haksan:pinned-nav", JSON.stringify(pinnedNav));
  }, [pinnedNav]);
  useEffect(() => {
    setRecentNav((items) => {
      const next = [current, ...items.filter((key) => key !== current)].slice(0, 5);
      window.localStorage.setItem("haksan:recent-nav", JSON.stringify(next));
      return next;
    });
    const activeGroup = NAV.find((group) => group.items.some((item) => item.key === current));
    if (activeGroup) setExpandedGroups((groups) => ({ ...groups, [activeGroup.group]: true }));
  }, [current]);
  useEffect(() => {
    window.localStorage.setItem("haksan:density", density);
  }, [density]);
  // Sohbet okunmamış rozeti — konuşmaları 15 sn'de bir özetleyip toplam okunmamışı gösterir.
  const [chatUnread, setChatUnread] = useState(0);
  const [dbNotifications, setDbNotifications] = useState<NotificationDTO[]>([]);
  useEffect(() => {
    const tick = () => {
      if (document.hidden) return;
      chatService
        .conversations()
        .then((rows) => setChatUnread(rows.reduce((sum, c) => sum + (c.unreadCount ?? 0), 0)))
        .catch(() => {});
    };
    tick();
    const h = setInterval(tick, 15000);
    return () => clearInterval(h);
  }, []);

  const refreshNotifications = () => {
    notificationService
      .list({ unread: true, pageSize: 20 })
      .then((res) => setDbNotifications(res.data ?? []))
      .catch(() => {});
  };
  useEffect(() => {
    const tick = () => {
      if (document.hidden) return;
      refreshNotifications();
    };
    tick();
    const h = setInterval(tick, 15000);
    return () => clearInterval(h);
  }, [user?.id, activeDivision]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen(true);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        setCommandOpen(true);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const navItems = useMemo(() => NAV.flatMap((group) => group.items), []);
  const pinnedItems = navItems.filter((item) => pinnedNav.includes(item.key) && canDisplay(item));
  const recentItems = recentNav
    .filter((key) => key !== current && !pinnedNav.includes(key))
    .map((key) => navItems.find((item) => item.key === key))
    .filter((item): item is NavItem => !!item && canDisplay(item))
    .slice(0, 3);
  const toggleCurrentPin = () => {
    setPinnedNav((items) => items.includes(current) ? items.filter((key) => key !== current) : [...items, current]);
  };
  const canSeeNav = (key: string) => {
    return canAccessNavKey(key as NavKey, hasPermission, hasRole) && isNavigationAreaEnabled(key, hiddenNavigationKeys);
  };
  const canUseAction = (action: OperationAction) => {
    if (action.kind === "navigate") return canSeeNav(action.nav);
    if (action.kind === "customer") return canSeeNav("customers");
    if (action.kind === "salesCase") return canSeeNav("sales-cases");
    return true;
  };
  const executeOperationAction = (action: OperationAction) => {
    if (!canUseAction(action)) {
      toast.error("Bu alan şirket ayarlarında kapalı veya erişim yetkiniz yok.");
      return;
    }
    if (onOperationAction) {
      onOperationAction(action);
      return;
    }
    if (action.kind === "navigate") onNavigate(action.nav as NavKey);
    if (action.kind === "customer") {
      const customer = customers.find((c) => c.id === action.customerId);
      onSelectFirm?.(customer ?? normalizeCompany({
        id: action.customerId,
        legalTitle: "Firma yükleniyor…",
        createdAt: "",
      }));
    }
    if (action.kind === "salesCase") {
      onNavigate("sales-cases");
      onSelectCase?.(action.salesCaseId);
    }
  };
  const openServiceCount = service.filter((s) => s.stage !== "Closed").length;
  const alerts = useMemo(
    () => buildAlerts(store).filter((alert) => canUseAction(alert.action)),
    [store, user?.roles?.join("|"), hiddenNavigationKeys.join("|")]
  );
  const notificationTarget = (notification: NotificationDTO): NotificationTarget | null =>
    notification.target ??
    (notification.entityType === "service_complaint_intake" && notification.entityId
      ? { kind: "navigate", nav: "service-requests", query: `complaint:${notification.entityId}` }
      : null);
  const canUseNotificationTarget = (target: NotificationTarget | null) => {
    if (!target) return true;
    if (target.kind === "opportunity") return canSeeNav("sales-cases");
    if (target.kind === "company") return canSeeNav("customers");
    return canSeeNav(target.nav);
  };
  const visibleDbNotifications = dbNotifications.filter((notification) => canUseNotificationTarget(notificationTarget(notification)));
  const notificationCount = alerts.length + visibleDbNotifications.length;
  const openDbNotification = async (notification: NotificationDTO) => {
    try {
      await notificationService.markRead(notification.id);
      setDbNotifications((rows) => rows.filter((row) => row.id !== notification.id));
    } catch {
      // Bildirim okunma kaydı başarısız olsa da yönlendirme çalışsın.
    }
    // Hedef API'de çözülür (ör. bahsedilen aktivite → bağlı satış kartı/firma).
    // Eski sürüm yanıtları için şikayet bildirimi yerel olarak da ele alınır.
    const target = notificationTarget(notification);
    if (!target) {
      toast.message(notification.title, { description: notification.body ?? "Bu bildirim için açılacak kayıt yok." });
      return;
    }
    if (target.kind === "opportunity") {
      if (!canSeeNav("sales-cases")) {
        toast.error("Fırsatlar alanı şirket ayarlarında kapalı.");
        return;
      }
      onNavigate("sales-cases");
      onSelectCase?.(target.opportunityId, { activityId: target.activityId });
      return;
    }
    const action: OperationAction =
      target.kind === "company"
        ? { kind: "customer", customerId: target.companyId }
        : { kind: "navigate", nav: target.nav as OperationNav, query: target.query };
    executeOperationAction(action);
  };
  const renderSidebarContent = (onItemClick?: () => void, collapsed = false, onToggle?: () => void) => (
    <div className="flex h-full min-h-0 flex-col overflow-visible">
      {/* Logo */}
      <div className={`h-[60px] shrink-0 flex items-center gap-2 border-b border-border/70 ${collapsed ? "justify-center px-2" : "px-4"}`}>
        <img
          src={collapsed ? "/brand/haksan-wlogo.gif" : "/brand/haksan-logo.png"}
          alt="Haksan Makina"
          className={`w-auto shrink-0 object-contain transition-all ${collapsed ? "size-8" : "h-9 max-w-[108px]"}`}
        />
        {!collapsed && (
          <div className="min-w-0 flex-1 border-l border-border pl-2.5">
            <div className="text-[9px] text-muted-foreground leading-[1.35] uppercase tracking-[0.14em]">CRM · Operasyon<br />Servis · Stok</div>
          </div>
        )}
        {onToggle && (
          <Button
            variant="ghost"
            size="icon"
            className={`size-8 shrink-0 text-muted-foreground hover:text-primary ${collapsed ? "absolute left-[58px] top-3.5 z-10 border bg-white shadow-sm" : ""}`}
            aria-label={collapsed ? "Menüyü genişlet" : "Menüyü daralt"}
            onClick={onToggle}
          >
            {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          </Button>
        )}
      </div>

      {/* Nav */}
      <ScrollArea className="min-h-0 flex-1 overflow-hidden">
        <nav className={`${collapsed ? "px-2" : "px-3"} py-3.5 space-y-4`}>
          {!collapsed && pinnedItems.length > 0 && (
            <div>
              <div className="mb-1.5 flex items-center gap-1.5 px-3 text-[9px] font-semibold uppercase tracking-[0.14em] text-operation-blue">
                <Star className="size-3 fill-current" /> Sabitlenenler
              </div>
              <div className="space-y-0.5">
                {pinnedItems.map((item) => {
                  const Icon = item.icon;
                  const active = current === item.key;
                  return (
                    <button
                      key={`pin-${item.key}`}
                      type="button"
                      onClick={() => { onNavigate(item.key); onItemClick?.(); }}
                      aria-current={active ? "page" : undefined}
                      className={`relative flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${active ? "bg-primary text-white shadow-sm" : "bg-brand-blue-soft/65 text-primary hover:bg-brand-blue-soft"}`}
                    >
                      <Icon className="size-[17px] shrink-0" strokeWidth={1.8} />
                      <span className="min-w-0 flex-1 truncate text-left">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {!collapsed && recentItems.length > 0 && (
            <div>
              <div className="mb-1.5 px-3 text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/75">Son kullanılan</div>
              <div className="space-y-0.5">
                {recentItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={`recent-${item.key}`}
                      type="button"
                      onClick={() => { onNavigate(item.key); onItemClick?.(); }}
                      className="flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-[13px] text-foreground/65 transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <Icon className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.8} />
                      <span className="min-w-0 flex-1 truncate text-left">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {NAV.map((group) => {
            const items = group.items.filter(canDisplay);
            if (!items.length) return null;
            const expanded = expandedGroups[group.group] !== false;
            return (
            <div key={group.group}>
              {collapsed ? (
                <div className="mx-2 mb-1.5 h-px bg-border" aria-hidden />
              ) : (
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => setExpandedGroups((groups) => ({ ...groups, [group.group]: !expanded }))}
                  className="mb-1.5 flex w-full items-center justify-between rounded px-3 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/75 transition-colors hover:bg-muted hover:text-foreground"
                >
                  {group.group}
                  <ChevronDown className={`size-3 transition-transform ${expanded ? "rotate-0" : "-rotate-90"}`} />
                </button>
              )}
              <div className={`${!collapsed && !expanded ? "hidden" : "space-y-0.5"}`}>
                {items.map((item) => {
                  const Icon = item.icon;
                  const active = current === item.key;
                  const navButton = (
                    <button
                      onClick={() => {
                        onNavigate(item.key);
                        onItemClick?.();
                      }}
                      aria-current={active ? "page" : undefined}
                      aria-label={collapsed ? item.label : undefined}
                      className={`group w-full flex items-center rounded-md text-sm transition-all relative ${collapsed ? "justify-center px-2 py-2.5" : "gap-2.5 px-3 py-2"} ${
                        active
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-foreground/75 hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      {active && (
                        <span className={`absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full ${collapsed ? "bg-brand-red" : "bg-white/80"}`} />
                      )}
                      <Icon className={`size-[17px] shrink-0 ${active ? "text-primary-foreground" : "text-muted-foreground group-hover:text-foreground"}`} strokeWidth={1.8} />
                      {!collapsed && <span className="truncate flex-1 text-left">{item.label}</span>}
                      {item.key === "chat" && chatUnread > 0 ? (
                        <Badge variant="secondary" className={`${collapsed ? "absolute -right-0.5 -top-0.5 size-4 p-0 text-[8px]" : "h-5 px-1.5 text-[10px]"} ${active ? "bg-white text-primary" : "bg-primary/10 text-primary"}`}>
                          {chatUnread}
                        </Badge>
                      ) : (item.key === "service-requests" && service.length > 0) ? (
                        <Badge variant="secondary" className={`${collapsed ? "absolute -right-0.5 -top-0.5 size-4 p-0 text-[8px]" : "h-5 px-1.5 text-[10px]"} ${active ? "bg-white text-primary" : "bg-primary/10 text-primary"}`}>
                          {service.length}
                        </Badge>
                      ) : item.key === "service-kanban" && openServiceCount > 0 ? (
                        <Badge variant="secondary" className={`${collapsed ? "absolute -right-0.5 -top-0.5 size-4 p-0 text-[8px]" : "h-5 px-1.5 text-[10px]"} ${active ? "bg-white text-primary" : "bg-primary/10 text-primary"}`}>
                          {openServiceCount}
                        </Badge>
                      ) : null}
                    </button>
                  );
                  if (!collapsed) return <div key={item.key}>{navButton}</div>;
                  return (
                    <Tooltip key={item.key}>
                      <TooltipTrigger asChild>{navButton}</TooltipTrigger>
                      <TooltipContent side="right">{item.label}</TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
            );
          })}
        </nav>
      </ScrollArea>
      {onItemClick && (canPickDepartment || (canPickDivision && visibleDivisions.length > 0)) && (
        <div className="shrink-0 border-t border-border/70 bg-canvas/60 p-3">
          <div className="mb-2 px-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Çalışma alanı
          </div>
          <div className={`grid gap-2 ${canPickDepartment && canPickDivision ? "grid-cols-2" : "grid-cols-1"}`}>
            {canPickDepartment && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="min-w-0 justify-start gap-1.5 bg-white px-2" aria-label="Departman seç">
                    <Briefcase className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{activeDepartmentLabel}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  <DropdownMenuLabel>Departman</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {visibleDepartments.map((department) => (
                    <DropdownMenuItem key={department.id} className="justify-between" onClick={() => setActiveDepartment(department.id)}>
                      {department.name}
                      {activeDepartment === department.id && <CheckCircle2 className="size-4 text-primary" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {canPickDivision && visibleDivisions.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="min-w-0 justify-start gap-1.5 bg-white px-2" aria-label="Bölüm seç">
                    <Building2 className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{activeDivisionLabel}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  <DropdownMenuLabel>Bölüm</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {canPickAllForResource && (
                    <DropdownMenuItem className="justify-between" onClick={() => setActiveDivision("all")}>
                      Tümü
                      {activeDivision === "all" && <CheckCircle2 className="size-4 text-primary" />}
                    </DropdownMenuItem>
                  )}
                  {visibleDivisions.map((division) => (
                    <DropdownMenuItem key={division.id} className="justify-between" onClick={() => setActiveDivision(division.id)}>
                      {division.name}
                      {activeDivision === division.id && <CheckCircle2 className="size-4 text-primary" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <TooltipProvider delayDuration={150}>
      <div data-density={density} className="flex h-full min-h-0 w-full overflow-hidden bg-canvas text-foreground">
        <a href="#main-content" className="fixed left-3 top-3 z-[100] -translate-y-20 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-lg transition-transform focus:translate-y-0">
          Ana içeriğe geç
        </a>

        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <SheetContent side="left" className="w-[min(300px,calc(100vw-2rem))] gap-0 overflow-hidden p-0 lg:hidden">
            <SheetTitle className="sr-only">Ana menü</SheetTitle>
            <SheetDescription className="sr-only">Haksan modülleri ve çalışma alanı seçimi</SheetDescription>
            {renderSidebarContent(() => setMobileNavOpen(false))}
          </SheetContent>
        </Sheet>

        {/* SIDEBAR */}
        <aside className={`relative hidden h-full min-h-0 shrink-0 flex-col overflow-visible border-r border-sidebar-border bg-sidebar transition-[width] duration-150 motion-reduce:transition-none lg:flex ${sidebarCollapsed ? "w-[76px]" : "w-[252px]"}`}>
          {renderSidebarContent(undefined, sidebarCollapsed, () => setSidebarCollapsed((value) => !value))}
        </aside>

        {/* MAIN */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
          {/* Topbar */}
          <header className="flex h-16 shrink-0 items-center gap-1.5 overflow-hidden border-b border-border/70 bg-card/95 px-3 shadow-[0_1px_0_rgba(13,20,68,0.02)] backdrop-blur sm:gap-2.5 md:px-5">
            <Button variant="ghost" size="icon" className="lg:hidden size-9" aria-label="Menüyü aç" onClick={() => setMobileNavOpen(true)}>
              <Menu className="size-[18px]" />
            </Button>
            <img
              src="/brand/haksan-logo.png"
              alt="Haksan Makina"
              className="h-8 w-auto max-w-[90px] object-contain lg:hidden sm:max-w-[120px]"
            />
            <Button variant="ghost" size="icon" className="md:hidden size-9" aria-label="Global arama" onClick={() => setCommandOpen(true)}>
              <Search className="size-[18px] text-muted-foreground" />
            </Button>
            <div className="relative hidden w-[420px] max-w-[40%] md:block">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <button
                type="button"
                className="h-10 w-full rounded-lg border border-border/70 bg-canvas/70 pl-9 pr-16 text-left text-sm text-muted-foreground shadow-xs transition-colors hover:border-primary/25 hover:bg-card focus-visible:border-ring focus-visible:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20"
                onClick={() => setCommandOpen(true)}
              >
                {pageTitle} içinde veya tüm kayıtlarda ara...
              </button>
              <Kbd className="absolute right-2.5 top-1/2 -translate-y-1/2">⌘K</Kbd>
            </div>

            <div className="flex-1" />

            {(canPickDepartment || (canPickDivision && visibleDivisions.length > 0)) && (
              <div className="hidden lg:block">
                <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 gap-2 bg-card px-2.5" aria-label="Çalışma alanını değiştir">
                    <Building2 className="size-4 text-primary" />
                    <span className="hidden max-w-[150px] truncate xl:inline">{activeDivisionLabel}</span>
                    {canPickDepartment ? <span className="hidden text-muted-foreground 2xl:inline">· {activeDepartmentLabel}</span> : null}
                    <ChevronDown className="size-3.5 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  {canPickDivision && visibleDivisions.length > 0 ? (
                    <>
                      <DropdownMenuLabel>Bölüm</DropdownMenuLabel>
                      {canPickAllForResource ? (
                        <DropdownMenuItem className="justify-between" onClick={() => setActiveDivision("all")}>
                          Tümü
                          {activeDivision === "all" && <CheckCircle2 className="size-4 text-primary" />}
                        </DropdownMenuItem>
                      ) : null}
                      {visibleDivisions.map((division) => (
                        <DropdownMenuItem key={division.id} className="justify-between" onClick={() => setActiveDivision(division.id)}>
                          {division.name}
                          {activeDivision === division.id && <CheckCircle2 className="size-4 text-primary" />}
                        </DropdownMenuItem>
                      ))}
                    </>
                  ) : null}
                  {canPickDepartment ? (
                    <>
                      {canPickDivision && visibleDivisions.length > 0 ? <DropdownMenuSeparator /> : null}
                      <DropdownMenuLabel>Departman</DropdownMenuLabel>
                      {visibleDepartments.map((department) => (
                        <DropdownMenuItem key={department.id} className="justify-between" onClick={() => setActiveDepartment(department.id)}>
                          {department.name}
                          {activeDepartment === department.id && <CheckCircle2 className="size-4 text-primary" />}
                        </DropdownMenuItem>
                      ))}
                    </>
                  ) : null}
                </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}

            {canApprove && (
              <div className="hidden lg:block">
                <ApprovalsDialog
                  trigger={
                    <Button variant="ghost" size="icon" className="relative size-9" aria-label="Onay bekleyen firma talepleri">
                      <ShieldCheck className="size-[18px] text-muted-foreground" />
                    </Button>
                  }
                />
              </div>
            )}

            {((canSeeNav("customers") && hasPermission("companies.create")) ||
              (canSeeNav("contacts") && hasPermission("contacts.create")) ||
              (canSeeNav("sales-cases") && hasPermission("opportunities.create"))) && (
              <QuickCreateDialog
                enabledAreas={{
                  customers: canSeeNav("customers") && hasPermission("companies.create"),
                  contacts: canSeeNav("contacts") && hasPermission("contacts.create"),
                  salesCases: canSeeNav("sales-cases") && hasPermission("opportunities.create"),
                }}
                trigger={
                  <Button variant="outline" size="sm" className="gap-1.5 h-9 px-2 sm:px-3" aria-label="Hızlı Oluştur">
                    <Plus className="size-4" />
                    <span className="hidden xl:inline">Hızlı Oluştur</span>
                  </Button>
                }
              />
            )}

            <div className="hidden xl:block">
              <HelpCenterDialog
                trigger={
                  <Button variant="ghost" size="icon" className="relative size-9" aria-label="Yardım Merkezi" title="Yardım Merkezi">
                    <HelpCircle className="size-[18px] text-muted-foreground" />
                  </Button>
                }
              />
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative size-9" aria-label="Bildirimler">
                  <Bell className="size-[18px] text-muted-foreground" />
                  {notificationCount > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-destructive px-1 font-data text-[8px] font-semibold leading-4 text-white ring-2 ring-white" aria-hidden>
                      {notificationCount > 99 ? "99+" : notificationCount}
                    </span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-[min(640px,calc(100dvh-5rem))] w-[min(390px,calc(100vw-1rem))] overflow-y-auto p-1.5">
                <DropdownMenuLabel className="flex items-center justify-between">
                  <span>
                    <span className="block font-display text-lg leading-none text-foreground">Bildirim Merkezi</span>
                    <span className="mt-1 block text-[10px] font-normal text-muted-foreground">Çağrı, kayıt ve operasyon uyarıları</span>
                  </span>
                  <Badge variant="secondary" className="text-[10px]">{notificationCount} yeni</Badge>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {notificationCount === 0 ? (
                  <div className="flex flex-col items-center px-3 py-6 text-center text-sm text-muted-foreground">
                    <BrandIllustration scene="notifications" size="sm" className="mb-1" />
                    Aktif uyarı yok.
                  </div>
                ) : (
                  <>
                    {visibleDbNotifications.length > 0 && <div className="px-2.5 pb-1 pt-2 font-data text-[9px] font-semibold uppercase tracking-[0.13em] text-operation-blue">CRM bildirimleri · {visibleDbNotifications.length}</div>}
                    {visibleDbNotifications.map((notification) => (
                      <NotifItem
                        key={notification.id}
                        icon={<MessageSquare className="size-4 text-emerald-600" />}
                        title={notification.title}
                        desc={notification.body ?? ""}
                        time="yeni"
                        onClick={() => openDbNotification(notification)}
                      />
                    ))}
                    {visibleDbNotifications.length > 0 && alerts.length > 0 && <DropdownMenuSeparator />}
                    {alerts.length > 0 && <div className="px-2.5 pb-1 pt-2 font-data text-[9px] font-semibold uppercase tracking-[0.13em] text-operation-blue">Operasyon takibi · {alerts.length}</div>}
                    {alerts.map((alert) => (
                      <NotifItem
                        key={alert.id}
                        icon={alert.severity === "critical" ? <AlertTriangle className="size-4 text-red-600" /> : alert.severity === "warning" ? <Clock className="size-4 text-amber-600" /> : <CheckCircle2 className="size-4 text-blue-600" />}
                        title={alert.title}
                        desc={alert.description}
                        time={alert.severity === "critical" ? "kritik" : "takip"}
                        onClick={() => executeOperationAction(alert.action)}
                      />
                    ))}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="mx-1 hidden h-6 w-px bg-border sm:block" />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-9 gap-2 px-1.5 sm:px-2" aria-label="Hesap menüsü">
                  <Avatar className="size-7">
                    <AvatarFallback className="bg-primary text-primary-foreground text-xs">{userInitials}</AvatarFallback>
                  </Avatar>
                  <div className="text-left hidden md:block">
                    <div className="text-[13px] leading-tight">{user?.fullName ?? "Kullanıcı"}</div>
                    <div className="text-[10px] text-muted-foreground leading-tight uppercase tracking-wide">{roleLabel}</div>
                  </div>
                  <ChevronDown className="hidden size-3.5 text-muted-foreground sm:block" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Hesabım & Analiz</DropdownMenuLabel>
                <DropdownMenuItem onClick={toggleCurrentPin}>
                  <Star className={`size-4 mr-2 text-muted-foreground ${pinnedNav.includes(current) ? "fill-current text-operation-blue" : ""}`} />
                  {pinnedNav.includes(current) ? "Bu sayfanın sabitini kaldır" : "Bu sayfayı sabitle"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setDensity((value) => value === "compact" ? "comfortable" : "compact")}>
                  <Rows3 className="size-4 mr-2 text-muted-foreground" />
                  {density === "compact" ? "Rahat görünüm" : "Kompakt görünüm"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onNavigate("settings")}><ContactIcon className="size-4 mr-2 text-muted-foreground" /> Profil & Ayarlar</DropdownMenuItem>
                <DropdownMenuItem onClick={() => toast.message("Klavye Kısayolları", { description: "⌘K komut paleti · / arama" })}><HelpCircle className="size-4 mr-2 text-muted-foreground" /> Klavye Kısayolları</DropdownMenuItem>
                {canSeeReports && (
                  <DropdownMenuItem onClick={() => onNavigate("reports")}><BarChart3 className="size-4 mr-2 text-muted-foreground" /> Raporlar</DropdownMenuItem>
                )}
                {(hasRole("admin") || hasRole("super_admin")) && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>Yönetim</DropdownMenuLabel>
                    <DropdownMenuItem onClick={() => onNavigate("users")}><Users className="size-4 mr-2 text-muted-foreground" /> Kullanıcılar</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onNavigate("roles")}><ShieldCheck className="size-4 mr-2 text-muted-foreground" /> Roller & Yetkiler</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onNavigate("departments")}><Building2 className="size-4 mr-2 text-muted-foreground" /> Departmanlar</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onNavigate("settings")}><SettingsIcon className="size-4 mr-2 text-muted-foreground" /> Ayarlar</DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onLogout} className="text-destructive focus:text-destructive">
                  <LogOut className="size-4 mr-2" /> Çıkış yap
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </header>

          <PageHeader title={pageTitle} subtitle={pageSubtitle} scopeLabel={activeDivisionLabel} actions={actions} />

          {/* Content */}
          <main id="main-content" tabIndex={-1} ref={mainScrollRef} className="app-main min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain bg-canvas p-3 outline-none sm:p-4 lg:p-5 xl:p-6">{children}</main>
        </div>
        <CommandPalette
          open={commandOpen}
          onOpenChange={setCommandOpen}
          onAction={executeOperationAction}
          canUseAction={canUseAction}
        />
      </div>
    </TooltipProvider>
  );
}

function NotifItem({ icon, title, desc, time, onClick }: { icon: ReactNode; title: string; desc: string; time: string; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full gap-3 px-3 py-2.5 text-left hover:bg-muted/60">
      <div className="size-8 rounded-full bg-muted grid place-items-center shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-sm leading-tight truncate">{title}</div>
        <div className="text-xs text-muted-foreground truncate">{desc}</div>
      </div>
      <div className="text-[10px] text-muted-foreground shrink-0">{time}</div>
    </button>
  );
}
