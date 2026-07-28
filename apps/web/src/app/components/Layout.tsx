import { ReactNode, useMemo, useState, useEffect, useRef } from "react";
import { useStore } from "../lib/store";
import { SALES_STAGE_LABELS, type Customer } from "../lib/mock";
import {
  LayoutDashboard, Users, Briefcase, KanbanSquare, FileText, FolderOpen,
  CreditCard, Boxes, Truck, Wrench, Cpu,
  LifeBuoy, BarChart3, ShieldCheck, Building2, Contact as ContactIcon, Settings as SettingsIcon,
  Search, Bell, ChevronDown, LogOut, Plus, HelpCircle, Menu, PanelLeftClose, PanelLeftOpen,
  CheckCircle2, Clock, AlertTriangle, XCircle, ChevronRight, Tag, Receipt, Map as MapIcon, FileSignature, Wallet, Calendar, MessageCircle, MessageSquare,
  PhoneCall, ListChecks,
  Star, Rows3,
} from "lucide-react";
import { callAssistantService, chatService, notificationService, type CallSuggestionDTO, type NotificationDTO, type NotificationTarget } from "../../lib/services";
import { useAuth } from "../../lib/auth";
import { toast } from "sonner";
import { Button } from "./ui/button";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "./ui/dialog";
import { Input } from "./ui/input";
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
import { AssistantPanel } from "./operations/AssistantPanel";
import { buildAlerts, type OperationAction, type OperationNav } from "../lib/operations";

export type NavKey =
  | "dashboard" | "chat" | "calendar" | "call-assistant" | "customers" | "contacts" | "sales-cases" | "kanban" | "sales-map" | "offers"
  | "proformas" | "contracts" | "documents" | "payments" | "accounting-invoices" | "customer-balances" | "due-dates" | "sales-price-list" | "references" | "products"
  | "stock" | "purchase-orders" | "shipments"
  | "installations" | "deliveries" | "machines" | "service-requests" | "service-kanban" | "service-price-list"
  | "reports" | "users" | "roles" | "departments" | "settings";

type NavItem = { key: NavKey; label: string; icon: any; badge?: string; roles?: string[] };

// Yönetim grubu sadece admin/super_admin'e açıktır (canSee bu set'i kullanır).
export const MGMT_KEYS = new Set<NavKey>(["users", "roles", "departments", "settings"]);

export const RESOURCE_BY_NAV: Partial<Record<NavKey, string>> = {
  calendar: "calendar",
  "call-assistant": "activities",
  customers: "companies",
  contacts: "contacts",
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
  const resource = RESOURCE_BY_NAV[key];
  if (!resource) return true;
  return hasPermission(`${resource}.read`);
}

// Her nav öğesinin `roles` listesi, backend izin matrisini (rolePermissionMatrix)
// yansıtır. admin/super_admin her şeyi görür; readonly yönetim hariç her şeyi.
const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: "Genel",
    items: [
      { key: "dashboard", label: "Gösterge Paneli", icon: LayoutDashboard },
      { key: "chat", label: "Sohbet", icon: MessageCircle },
      { key: "calendar", label: "Takvim", icon: Calendar },
      { key: "call-assistant", label: "Çağrı Asistanı", icon: PhoneCall, roles: ["sales", "service", "finance"] },
    ],
  },
  {
    group: "Satış",
    items: [
      { key: "customers", label: "Firmalar", icon: Building2, roles: ["sales", "finance"] },
      { key: "contacts", label: "Kontaklar", icon: ContactIcon, roles: ["sales"] },
      { key: "sales-cases", label: "Satış Kartları", icon: Briefcase, roles: ["sales"] },
      { key: "sales-map", label: "Firma Haritası", icon: MapIcon, roles: ["sales", "service"] },
      { key: "offers", label: "Teklifler", icon: FileText, roles: ["sales", "finance"] },
      { key: "proformas", label: "Proformalar", icon: FileText, roles: ["sales", "finance"] },
      { key: "contracts", label: "Sözleşmeler", icon: FileSignature, roles: ["sales", "finance"] },
      { key: "documents", label: "Dokümanlar", icon: FolderOpen, roles: ["sales", "finance"] },
      { key: "sales-price-list", label: "Satış Fiyat Listesi", icon: Tag, roles: ["sales"] },
      { key: "references", label: "Referanslar", icon: ListChecks, roles: ["sales"] },
    ],
  },
  {
    group: "Operasyon",
    items: [
      { key: "products", label: "Ürünler", icon: Cpu, roles: ["sales", "service", "stock"] },
      { key: "stock", label: "Stok", icon: Boxes, roles: ["stock"] },
      { key: "payments", label: "Ödemeler & Kasa", icon: CreditCard, roles: ["finance"] },
      { key: "accounting-invoices", label: "Muhasebe Faturaları", icon: Receipt, roles: ["finance", "sales"] },
      { key: "customer-balances", label: "Cari Rapor", icon: Wallet, roles: ["finance"] },
      { key: "due-dates", label: "Vade Takvimi", icon: Calendar, roles: ["finance"] },
      { key: "shipments", label: "Sevkiyat", icon: Truck, roles: ["stock"] },
    ],
  },
  {
    group: "Servis",
    items: [
      { key: "machines", label: "Makineler", icon: Cpu, roles: ["service", "stock"] },
      { key: "installations", label: "Kurulum", icon: Wrench, roles: ["service"] },
      { key: "service-requests", label: "Servis Talepleri", icon: LifeBuoy, roles: ["service"] },
      { key: "service-kanban", label: "Servis Kanban", icon: KanbanSquare, roles: ["service"] },
      { key: "service-price-list", label: "Servis Fiyat Listesi", icon: Receipt, roles: ["service"] },
    ],
  },
];

type Props = {
  current: NavKey;
  onNavigate: (k: NavKey) => void;
  onLogout: () => void;
  pageTitle: string;
  pageSubtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  onSelectFirm?: (c: Customer) => void;
  onSelectCase?: (id: string) => void;
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
  const [callSuggestions, setCallSuggestions] = useState<CallSuggestionDTO[]>([]);
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

  const refreshCallSuggestions = () => {
    if (!hasPermission("companies.read")) return;
    callAssistantService
      .suggestions({ status: "pending" })
      .then((res) => setCallSuggestions(res.data ?? []))
      .catch(() => {});
  };
  useEffect(() => {
    const tick = () => {
      if (document.hidden) return;
      refreshCallSuggestions();
    };
    tick();
    const h = setInterval(tick, 15000);
    return () => clearInterval(h);
  }, [user?.id, activeDivision, hasPermission]);

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
  const pinnedItems = navItems.filter((item) => pinnedNav.includes(item.key) && canSee(item));
  const recentItems = recentNav
    .filter((key) => key !== current && !pinnedNav.includes(key))
    .map((key) => navItems.find((item) => item.key === key))
    .filter((item): item is NavItem => !!item && canSee(item))
    .slice(0, 3);
  const toggleCurrentPin = () => {
    setPinnedNav((items) => items.includes(current) ? items.filter((key) => key !== current) : [...items, current]);
  };
  const canSeeNav = (key: string) => {
    const item = navItems.find((x) => x.key === key);
    return item ? canSee(item) : true;
  };
  const canUseAction = (action: OperationAction) => action.kind !== "navigate" || canSeeNav(action.nav);
  const executeOperationAction = (action: OperationAction) => {
    if (!canUseAction(action)) {
      toast.error("Bu alan için yetkiniz yok.");
      return;
    }
    if (onOperationAction) {
      onOperationAction(action);
      return;
    }
    if (action.kind === "navigate") onNavigate(action.nav as NavKey);
    if (action.kind === "customer") {
      const customer = customers.find((c) => c.id === action.customerId);
      if (customer) onSelectFirm?.(customer);
    }
    if (action.kind === "salesCase") {
      onNavigate("sales-cases");
      onSelectCase?.(action.salesCaseId);
    }
  };
  const openServiceCount = service.filter((s) => s.stage !== "Closed").length;
  const alerts = useMemo(
    () => buildAlerts(store).filter((alert) => canUseAction(alert.action)),
    [store, user?.roles?.join("|")]
  );
  const notificationCount = alerts.length + callSuggestions.length + dbNotifications.length;
  const openDbNotification = async (notification: NotificationDTO) => {
    try {
      await notificationService.markRead(notification.id);
      setDbNotifications((rows) => rows.filter((row) => row.id !== notification.id));
    } catch {
      // Bildirim okunma kaydı başarısız olsa da yönlendirme çalışsın.
    }
    // Hedef API'de çözülür (ör. bahsedilen aktivite → bağlı satış kartı/firma).
    // Eski sürüm yanıtları için şikayet bildirimi yerel olarak da ele alınır.
    const target: NotificationTarget | null =
      notification.target ??
      (notification.entityType === "service_complaint_intake" && notification.entityId
        ? { kind: "navigate", nav: "service-requests", query: `complaint:${notification.entityId}` }
        : null);
    if (!target) {
      toast.message(notification.title, { description: notification.body ?? "Bu bildirim için açılacak kayıt yok." });
      return;
    }
    const action: OperationAction =
      target.kind === "company"
        ? { kind: "customer", customerId: target.companyId }
        : target.kind === "opportunity"
          ? { kind: "salesCase", salesCaseId: target.opportunityId }
          : { kind: "navigate", nav: target.nav as OperationNav, query: target.query };
    executeOperationAction(action);
  };
  const runCallSuggestionAction = async (
    suggestion: CallSuggestionDTO,
    action: "create_quote" | "create_service_ticket" | "log_call" | "dismiss"
  ) => {
    try {
      await callAssistantService.action(suggestion.id, action);
      setCallSuggestions((rows) => rows.filter((row) => row.id !== suggestion.id));
      if (action === "create_quote") {
        toast.success("Teklif taslağı oluşturuldu", { description: suggestion.company.shortName || suggestion.company.legalTitle });
        onNavigate("offers");
      } else if (action === "create_service_ticket") {
        toast.success("Şikayet Kutusu'na aktarıldı", { description: suggestion.company.shortName || suggestion.company.legalTitle });
        if (onOperationAction) onOperationAction({ kind: "navigate", nav: "service-requests", query: "complaints" });
        else onNavigate("service-requests");
      } else if (action === "log_call") {
        toast.success("Arama kaydı oluşturuldu", { description: suggestion.company.shortName || suggestion.company.legalTitle });
      } else {
        toast.message("Arama önerisi kapatıldı");
      }
    } catch (err: any) {
      toast.error("Arama önerisi işlenemedi", { description: err?.message ?? "API isteği başarısız oldu." });
    }
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
            const items = group.items.filter(canSee);
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
                      {(item.key === "call-assistant" && callSuggestions.length > 0) ? (
                        <Badge variant="secondary" className={`${collapsed ? "absolute -right-0.5 -top-0.5 size-4 p-0 text-[8px]" : "h-5 px-1.5 text-[10px]"} ${active ? "bg-white text-primary" : "bg-primary/10 text-primary"}`}>
                          {callSuggestions.length}
                        </Badge>
                      ) : (item.key === "chat" && chatUnread > 0) ? (
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
        {mobileNavOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button
              type="button"
              aria-label="Menüyü kapat"
              className="absolute inset-0 bg-black/40"
              onClick={() => setMobileNavOpen(false)}
            />
            <aside className="relative z-10 flex h-full min-h-0 w-[min(300px,calc(100vw-2rem))] flex-col overflow-hidden border-r border-border/60 bg-white shadow-xl">
              {renderSidebarContent(() => setMobileNavOpen(false))}
            </aside>
          </div>
        )}

        {/* SIDEBAR */}
        <aside className={`relative hidden lg:flex h-full min-h-0 shrink-0 flex-col overflow-visible border-r border-border/70 bg-sidebar transition-[width] duration-200 ${sidebarCollapsed ? "w-[76px]" : "w-[244px]"}`}>
          {renderSidebarContent(undefined, sidebarCollapsed, () => setSidebarCollapsed((value) => !value))}
        </aside>

        {/* MAIN */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
          {/* Topbar */}
          <header className="h-[60px] shrink-0 flex items-center gap-1.5 overflow-hidden border-b border-border/70 bg-white/95 px-3 backdrop-blur sm:gap-2.5 md:px-5">
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
            <div className="relative hidden md:block w-[390px] max-w-[38%]">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <button
                type="button"
                className="h-9 w-full rounded-lg border border-border/70 bg-canvas/70 pl-9 pr-16 text-left text-sm text-muted-foreground shadow-xs transition-colors hover:border-primary/20 hover:bg-white focus-visible:border-ring focus-visible:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20"
                onClick={() => setCommandOpen(true)}
              >
                Firma, teklif, stok, servis ara...
              </button>
              <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 hidden md:flex items-center gap-1 px-1.5 h-5 rounded text-[10px] text-muted-foreground bg-white border">
                ⌘K
              </kbd>
            </div>

            <div className="flex-1" />

            {canPickDepartment && (
              <div className="hidden lg:block">
                <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5 h-9 px-2 sm:px-3" aria-label="Departman seç">
                    <Briefcase className="size-4 text-muted-foreground" />
                    <span className="hidden max-w-[110px] truncate 2xl:inline">{activeDepartmentLabel}</span>
                    <ChevronDown className="size-3.5 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
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
              </div>
            )}

            {canPickDivision && visibleDivisions.length > 0 && (
              <div className="hidden lg:block">
                <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5 h-9 px-2 sm:px-3" aria-label="Bölüm seç">
                    <Building2 className="size-4 text-muted-foreground" />
                    <span className="hidden max-w-[110px] truncate 2xl:inline">{activeDivisionLabel}</span>
                    <ChevronDown className="size-3.5 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuLabel>Bölüm</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {canPickAllForResource && (
                    <DropdownMenuItem className="justify-between" onClick={() => setActiveDivision("all")}>
                      Tümü
                      {activeDivision === "all" && <CheckCircle2 className="size-4 text-primary" />}
                    </DropdownMenuItem>
                  )}
                  {visibleDivisions.map((d) => (
                    <DropdownMenuItem key={d.id} className="justify-between" onClick={() => setActiveDivision(d.id)}>
                      {d.name}
                      {activeDivision === d.id && <CheckCircle2 className="size-4 text-primary" />}
                    </DropdownMenuItem>
                  ))}
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

            <QuickCreateDialog
              trigger={
                <Button variant="outline" size="sm" className="gap-1.5 h-9 px-2 sm:px-3" aria-label="Hızlı Oluştur">
                  <Plus className="size-4" />
                  <span className="hidden xl:inline">Hızlı Oluştur</span>
                </Button>
              }
            />

            {hasPermission("companies.read") && (
              <div className="hidden 2xl:block">
                <ManualSantralDialog onCreated={refreshCallSuggestions} />
              </div>
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
                    {callSuggestions.length > 0 && <div className="px-2.5 pb-1 pt-2 font-data text-[9px] font-semibold uppercase tracking-[0.13em] text-operation-blue">Çağrı asistanı · {callSuggestions.length}</div>}
                    {callSuggestions.map((suggestion) => (
                      <CallSuggestionItem
                        key={suggestion.id}
                        suggestion={suggestion}
                        onAction={(action) => runCallSuggestionAction(suggestion, action)}
                      />
                    ))}
                    {dbNotifications.length > 0 && <div className="px-2.5 pb-1 pt-2 font-data text-[9px] font-semibold uppercase tracking-[0.13em] text-operation-blue">CRM bildirimleri · {dbNotifications.length}</div>}
                    {dbNotifications.map((notification) => (
                      <NotifItem
                        key={notification.id}
                        icon={<MessageSquare className="size-4 text-emerald-600" />}
                        title={notification.title}
                        desc={notification.body ?? ""}
                        time="yeni"
                        onClick={() => openDbNotification(notification)}
                      />
                    ))}
                    {(callSuggestions.length > 0 || dbNotifications.length > 0) && alerts.length > 0 && <DropdownMenuSeparator />}
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

          {/* Page header */}
          <div className="relative flex min-h-[86px] shrink-0 flex-col items-start justify-center gap-3 overflow-hidden border-b border-border/70 bg-white px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between md:px-6">
            <div className="datum-rail absolute inset-x-0 top-0 h-[5px]" aria-hidden />
            <div className="min-w-0 pt-1">
              <nav className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                <span>Haksan</span>
                <ChevronRight className="size-3" />
                <span>{activeDivisionLabel}</span>
                <ChevronRight className="hidden size-3 sm:block" />
                <span className="hidden text-foreground/70 sm:block">{pageTitle}</span>
              </nav>
              <h1 className="font-display mt-1 text-[28px] font-bold leading-none tracking-[-0.01em] truncate">{pageTitle}</h1>
              {pageSubtitle && (
                <p className="mt-1 text-[13px] leading-tight text-muted-foreground truncate">{pageSubtitle}</p>
              )}
            </div>
            {actions && <div className="flex max-w-full shrink-0 items-center gap-2 overflow-x-auto pb-0.5 sm:pb-0">{actions}</div>}
          </div>

          {/* Content */}
          <main ref={mainScrollRef} className="app-main flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain p-3 sm:p-4 lg:p-5 xl:p-6 min-w-0 bg-canvas">{children}</main>
        </div>
        <CommandPalette
          open={commandOpen}
          onOpenChange={setCommandOpen}
          onAction={executeOperationAction}
          canUseAction={canUseAction}
        />
        <AssistantPanel
          onAction={executeOperationAction}
          canUseAction={canUseAction}
          pageContext={current}
          activeDivisionId={activeDivision}
        />
      </div>
    </TooltipProvider>
  );
}

function ManualSantralDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [eventType, setEventType] = useState<"completed" | "missed">("completed");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const phone = phoneNumber.trim();
    if (!phone) {
      toast.error("Telefon numarası gerekli.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await callAssistantService.manualEvent({
        phoneNumber: phone,
        direction: "inbound",
        eventType,
      });
      if (res.suggestions.length > 0) {
        toast.success("Arama önerisi oluşturuldu");
        setPhoneNumber("");
        setOpen(false);
        onCreated();
      } else if (res.event.matchStatus === "ambiguous") {
        toast.warning("Numara birden fazla firmayla eşleşti.");
      } else {
        toast.warning("Numara kayıtlı firmayla eşleşmedi.");
      }
    } catch (err: any) {
      toast.error("Manuel arama kaydedilemedi", { description: err?.message ?? "API isteği başarısız oldu." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 h-9 px-2 sm:px-3">
          <PhoneCall className="size-4" />
          <span className="hidden xl:inline">Manuel santral</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[min(420px,calc(100vw-2rem))]">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Manuel santral</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            inputMode="tel"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            placeholder="0532 111 22 33"
          />
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={eventType === "completed" ? "default" : "outline"}
              onClick={() => setEventType("completed")}
            >
              Arama bitti
            </Button>
            <Button
              type="button"
              variant={eventType === "missed" ? "default" : "outline"}
              onClick={() => setEventType("missed")}
            >
              Kaçan arama
            </Button>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
              Vazgeç
            </Button>
            <Button type="submit" disabled={submitting}>
              Kaydet
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CallSuggestionItem({
  suggestion,
  onAction,
}: {
  suggestion: CallSuggestionDTO;
  onAction: (action: "create_quote" | "create_service_ticket" | "log_call" | "dismiss") => void;
}) {
  const name = suggestion.company.shortName || suggestion.company.legalTitle;
  const eventLabel = suggestion.event.eventType === "missed" ? "Kaçan arama" : "Arama bitti";
  return (
    <div className="px-3 py-2.5 border-b last:border-b-0">
      <div className="flex items-start gap-2.5">
        <PhoneCall className="mt-0.5 size-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <div className="text-sm leading-snug truncate">{name}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {[eventLabel, suggestion.contact?.fullName, suggestion.event.normalizedPhone].filter(Boolean).join(" · ")}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {suggestion.availableActions.createQuote && (
              <Button size="sm" variant="secondary" className="h-7 px-2 text-xs" onClick={() => onAction("create_quote")}>
                Teklif
              </Button>
            )}
            {suggestion.availableActions.createServiceTicket && (
              <Button size="sm" variant="secondary" className="h-7 px-2 text-xs" onClick={() => onAction("create_service_ticket")}>
                Şikayet
              </Button>
            )}
            {suggestion.availableActions.logCall && (
              <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => onAction("log_call")}>
                Arama kaydı
              </Button>
            )}
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onAction("dismiss")}>
              Yoksay
            </Button>
          </div>
        </div>
      </div>
    </div>
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

const STATUS_META: Record<string, { cls: string; icon?: ReactNode }> = {
  lead: { cls: "bg-zinc-100 text-zinc-700 border-zinc-200" },
  sales: { cls: "bg-zinc-100 text-zinc-700 border-zinc-200" },
  call: { cls: "bg-blue-50 text-blue-700 border-blue-200" },
  visit: { cls: "bg-blue-50 text-blue-700 border-blue-200" },
  cancelled: { cls: "bg-red-50 text-red-700 border-red-200", icon: <XCircle className="size-3" /> },
  quote: { cls: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  proforma: { cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  contract: { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: <CheckCircle2 className="size-3" /> },
  payment_plan: { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: <CheckCircle2 className="size-3" /> },
  commercial_invoice: { cls: "bg-amber-50 text-amber-700 border-amber-200" },
  customs_approved: { cls: "bg-amber-50 text-amber-700 border-amber-200", icon: <CheckCircle2 className="size-3" /> },
  stock_picking: { cls: "bg-sky-50 text-sky-700 border-sky-200" },
  shipping: { cls: "bg-blue-50 text-blue-700 border-blue-200" },
  installation: { cls: "bg-brand-blue-soft text-brand-blue border-blue-200" },
  delivered: { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: <CheckCircle2 className="size-3" /> },
  Lead: { cls: "bg-zinc-100 text-zinc-700 border-zinc-200" },
  "Initial Contact": { cls: "bg-zinc-100 text-zinc-700 border-zinc-200" },
  "Requirement Analysis": { cls: "bg-blue-50 text-blue-700 border-blue-200" },
  "Offer Preparing": { cls: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  "Offer Sent": { cls: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  "Follow-up": { cls: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  "Offer Approved": { cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  "Proforma / Contract": { cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  Customs: { cls: "bg-amber-50 text-amber-700 border-amber-200" },
  Shipment: { cls: "bg-blue-50 text-blue-700 border-blue-200" },
  Installation: { cls: "bg-brand-blue-soft text-brand-blue border-blue-200" },
  Completed: { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: <CheckCircle2 className="size-3" /> },
  Lost: { cls: "bg-red-50 text-red-700 border-red-200", icon: <XCircle className="size-3" /> },
  active: { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: <CheckCircle2 className="size-3" /> },
  passive: { cls: "bg-zinc-100 text-zinc-600 border-zinc-200" },
  Available: { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: <CheckCircle2 className="size-3" /> },
  Reserved: { cls: "bg-amber-50 text-amber-700 border-amber-200", icon: <Clock className="size-3" /> },
  InTransit: { cls: "bg-sky-50 text-sky-700 border-sky-200", icon: <Clock className="size-3" /> },
  Sold: { cls: "bg-blue-50 text-blue-700 border-blue-200" },
  Inactive: { cls: "bg-zinc-100 text-zinc-600 border-zinc-200" },
  Pending: { cls: "bg-amber-50 text-amber-700 border-amber-200", icon: <Clock className="size-3" /> },
  "Request Opened": { cls: "bg-zinc-100 text-zinc-700 border-zinc-200" },
  Diagnosis: { cls: "bg-blue-50 text-blue-700 border-blue-200" },
  "Quote Needed": { cls: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  "Quote Sent": { cls: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  Approval: { cls: "bg-amber-50 text-amber-700 border-amber-200", icon: <Clock className="size-3" /> },
  Scheduled: { cls: "bg-amber-50 text-amber-700 border-amber-200" },
  "Service In Progress": { cls: "bg-sky-50 text-sky-700 border-sky-200", icon: <Clock className="size-3" /> },
  "Service Completed": { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: <CheckCircle2 className="size-3" /> },
  "Signed Form": { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: <CheckCircle2 className="size-3" /> },
  Closed: { cls: "bg-zinc-100 text-zinc-600 border-zinc-200", icon: <CheckCircle2 className="size-3" /> },
  Paid: { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: <CheckCircle2 className="size-3" /> },
  Overdue: { cls: "bg-red-50 text-red-700 border-red-200", icon: <AlertTriangle className="size-3" /> },
  Cancelled: { cls: "bg-zinc-100 text-zinc-600 border-zinc-200", icon: <XCircle className="size-3" /> },
  Approved: { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: <CheckCircle2 className="size-3" /> },
  Sent: { cls: "bg-blue-50 text-blue-700 border-blue-200" },
  Draft: { cls: "bg-zinc-100 text-zinc-600 border-zinc-200" },
  Rejected: { cls: "bg-red-50 text-red-700 border-red-200", icon: <XCircle className="size-3" /> },
  "Price Waiting": { cls: "bg-amber-50 text-amber-800 border-amber-200", icon: <Clock className="size-3" /> },
  "Budget Waiting": { cls: "bg-amber-50 text-amber-800 border-amber-200", icon: <Clock className="size-3" /> },
  "On Hold": { cls: "bg-zinc-100 text-zinc-700 border-zinc-200", icon: <Clock className="size-3" /> },
  Postponed: { cls: "bg-blue-50 text-blue-700 border-blue-200", icon: <Clock className="size-3" /> },
  Active: { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: <CheckCircle2 className="size-3" /> },
  "Out of Warranty": { cls: "bg-amber-50 text-amber-700 border-amber-200" },
  Decommissioned: { cls: "bg-zinc-100 text-zinc-600 border-zinc-200" },
};

const STATUS_LABELS: Record<string, string> = {
  ...SALES_STAGE_LABELS,
  active: "Aktif",
  passive: "Pasif",
  Available: "Hazır",
  Reserved: "Rezerve",
  InTransit: "Yolda",
  Sold: "Satıldı",
  Inactive: "Pasif",
  Pending: "Bekliyor",
  "Request Opened": "Servis Talep",
  Diagnosis: "Müşteri İletişim",
  "Quote Needed": "Teklif Gerekli",
  "Quote Sent": "Servis Teklifi",
  Approval: "Onay Bekliyor",
  Scheduled: "Planlandı",
  "Service In Progress": "Servis Devam Ediyor",
  "Service Completed": "Servis Tamamlandı",
  "Signed Form": "Tamamlandı Formu",
  Closed: "Kapandı",
  Paid: "Ödendi",
  Overdue: "Gecikmiş",
  Cancelled: "İptal",
  Approved: "Onaylı",
  Sent: "Gönderildi",
  Draft: "Taslak",
  Rejected: "Reddedildi",
  "Price Waiting": "Fiyat Bekleniyor",
  "Budget Waiting": "Bütçe Bekleniyor",
  "On Hold": "Askıya Alındı",
  Postponed: "Ertelendi",
  Active: "Aktif",
  "Out of Warranty": "Garanti Dışı",
  Decommissioned: "Devre Dışı",
  Proforma: "Proforma",
  Contract: "Sözleşme",
  CommercialInvoice: "Ticari Fatura",
  AccountingInvoice: "Muhasebe Faturası",
  DeliveryForm: "Teslim Formu",
  InstallationForm: "Kurulum Formu",
  Other: "Diğer",
};

export function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? { cls: "bg-brand-blue-soft text-brand-blue border-blue-200" };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] whitespace-nowrap ${meta.cls}`}>
      {meta.icon}
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}
