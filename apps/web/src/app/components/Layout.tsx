import { ReactNode, useMemo, useState, useEffect } from "react";
import { useStore } from "../lib/store";
import { SALES_STAGE_LABELS, type Customer } from "../lib/mock";
import {
  LayoutDashboard, Users, Briefcase, KanbanSquare, FileText, FolderOpen,
  CreditCard, Boxes, ShoppingCart, Truck, Wrench, PackageCheck, Cpu,
  LifeBuoy, BarChart3, ShieldCheck, Building2, Contact as ContactIcon, Settings as SettingsIcon,
  Search, Bell, ChevronDown, LogOut, Plus, HelpCircle, Menu,
  CheckCircle2, Clock, AlertTriangle, XCircle, ChevronRight, Tag, Receipt, Map as MapIcon, FileSignature, QrCode, Wallet, Calendar, MessageCircle,
} from "lucide-react";
import { chatService } from "../../lib/services";
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
import { HelpCenterDialog } from "./HelpCenterDialog";
import { ApprovalsDialog } from "./ApprovalsDialog";
import { CommandPalette } from "./operations/CommandPalette";
import { AssistantPanel } from "./operations/AssistantPanel";
import { buildAlerts, type OperationAction } from "../lib/operations";

export type NavKey =
  | "dashboard" | "chat" | "customers" | "contacts" | "sales-cases" | "kanban" | "sales-map" | "offers"
  | "proformas" | "contracts" | "documents" | "payments" | "accounting-invoices" | "customer-balances" | "due-dates" | "sales-price-list" | "products"
  | "stock" | "purchase-orders" | "shipments"
  | "installations" | "deliveries" | "machines" | "lifecycle" | "service-requests" | "service-kanban" | "service-price-list"
  | "reports" | "users" | "roles" | "departments" | "settings";

type NavItem = { key: NavKey; label: string; icon: any; badge?: string; roles?: string[] };

// Yönetim grubu sadece admin/super_admin'e açıktır (canSee bu set'i kullanır).
const MGMT_KEYS = new Set<NavKey>(["users", "roles", "departments", "settings"]);

// Her nav öğesinin `roles` listesi, backend izin matrisini (rolePermissionMatrix)
// yansıtır. admin/super_admin her şeyi görür; readonly yönetim hariç her şeyi.
const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: "Genel",
    items: [
      { key: "dashboard", label: "Gösterge Paneli", icon: LayoutDashboard },
      { key: "chat", label: "Sohbet", icon: MessageCircle },
    ],
  },
  {
    group: "Satış",
    items: [
      { key: "customers", label: "Firmalar", icon: Building2, roles: ["sales", "service", "finance"] },
      { key: "contacts", label: "Kontaklar", icon: ContactIcon, roles: ["sales", "service"] },
      { key: "sales-cases", label: "Satış Kartları", icon: Briefcase, roles: ["sales"] },
      { key: "sales-map", label: "Firma Haritası", icon: MapIcon, roles: ["sales", "service"] },
      { key: "offers", label: "Teklifler", icon: FileText, roles: ["sales", "finance"] },
      { key: "proformas", label: "Proformalar", icon: FileText, roles: ["sales", "finance"] },
      { key: "contracts", label: "Sözleşmeler", icon: FileSignature, roles: ["sales", "finance"] },
      { key: "documents", label: "Dokümanlar", icon: FolderOpen, roles: ["sales", "finance"] },
      { key: "sales-price-list", label: "Satış Fiyat Listesi", icon: Tag, roles: ["sales"] },
    ],
  },
  {
    group: "Operasyon",
    items: [
      { key: "products", label: "Ürünler", icon: Cpu, roles: ["sales", "service", "stock"] },
      { key: "stock", label: "Stok", icon: Boxes, roles: ["stock"] },
      { key: "purchase-orders", label: "Satın Alma", icon: ShoppingCart, roles: ["stock", "finance"] },
      { key: "payments", label: "Ödemeler & Kasa", icon: CreditCard, roles: ["finance"] },
      { key: "accounting-invoices", label: "Muhasebe Faturaları", icon: Receipt, roles: ["finance", "sales"] },
      { key: "customer-balances", label: "Cari Rapor", icon: Wallet, roles: ["finance"] },
      { key: "due-dates", label: "Vade Takvimi", icon: Calendar, roles: ["finance"] },
      { key: "shipments", label: "Sevkiyat", icon: Truck, roles: ["stock"] },
      { key: "deliveries", label: "Teslimat", icon: PackageCheck, roles: ["stock", "service"] },
    ],
  },
  {
    group: "Servis",
    items: [
      { key: "machines", label: "Makineler", icon: Cpu, roles: ["service", "stock"] },
      { key: "lifecycle", label: "Yaşam Döngüsü", icon: QrCode, roles: ["sales", "service"] },
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
  const store = useStore();
  const { customers, service } = store;
  const { hasRole, hasPermission, user, activeDivision, setActiveDivision } = useAuth();
  const canApprove = hasPermission("companies.update") || hasRole("super_admin");
  const divisions = user?.divisions ?? [];
  const canViewAllDivisions = user?.canViewAllDivisions ?? false;
  const showDivisionMenu = divisions.length > 1 || canViewAllDivisions;
  const activeDivisionLabel =
    activeDivision === "all" ? "Tümü" : divisions.find((d) => d.id === activeDivision)?.name ?? "Bölüm";
  const roleLabel = user?.roles?.[0] ? user.roles[0].replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "Kullanıcı";
  const userInitials = (user?.fullName ?? "?").split(" ").slice(0, 2).map((p) => p[0]).join("").toUpperCase();
  // Departman bazlı menü görünürlüğü:
  // - admin / super_admin: her şeyi görür.
  // - readonly: yönetim grubu hariç her şeyi (salt-okunur) görür.
  // - departman rolleri (sales/service/finance/stock): yalnızca öğenin `roles`
  //   listesinde kendi rolü varsa. `roles` taşımayan öğeler (Gösterge Paneli)
  //   herkese açıktır.
  const canSee = (item: NavItem) => {
    if (hasRole("admin") || hasRole("super_admin")) return true;
    if (hasRole("readonly")) return !MGMT_KEYS.has(item.key);
    if (!item.roles) return true;
    return item.roles.some((r) => hasRole(r));
  };
  const canSeeReports = hasRole("admin") || hasRole("super_admin") || hasRole("readonly") || hasRole("sales") || hasRole("finance");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  // Sohbet okunmamış rozeti — konuşmaları 15 sn'de bir özetleyip toplam okunmamışı gösterir.
  const [chatUnread, setChatUnread] = useState(0);
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

  const renderSidebarContent = (onItemClick?: () => void, menuSide: "right" | "top" = "right") => (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* Logo */}
      <div className="h-16 shrink-0 flex items-center gap-3 px-5 border-b border-border/60">
        <img
          src="/brand/haksan-logo.png"
          alt="Haksan Makina"
          className="h-10 w-auto max-w-[138px] shrink-0 object-contain"
        />
        <div className="min-w-0 flex-1">
          <div className="text-[11px] text-muted-foreground leading-tight truncate uppercase tracking-wider">CRM · Operasyon · Servis</div>
        </div>
      </div>

      {/* Nav */}
      <ScrollArea className="min-h-0 flex-1 overflow-hidden">
        <nav className="px-3 py-4 space-y-5">
          {NAV.map((group) => {
            const items = group.items.filter(canSee);
            if (!items.length) return null;
            return (
            <div key={group.group}>
              <div className="px-3 mb-1.5 text-[10px] uppercase tracking-[0.08em] text-muted-foreground/70">{group.group}</div>
              <div className="space-y-0.5">
                {items.map((item) => {
                  const Icon = item.icon;
                  const active = current === item.key;
                  return (
                    <button
                      key={item.key}
                      onClick={() => {
                        onNavigate(item.key);
                        onItemClick?.();
                      }}
                      aria-current={active ? "page" : undefined}
                      className={`group w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-all relative ${
                        active
                          ? "bg-primary/10 text-primary"
                          : "text-foreground/75 hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      {active && (
                        <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-primary" />
                      )}
                      <Icon className={`size-[17px] shrink-0 ${active ? "text-primary" : "text-muted-foreground group-hover:text-foreground"}`} strokeWidth={1.8} />
                      <span className="truncate flex-1 text-left">{item.label}</span>
                      {(item.key === "chat" && chatUnread > 0) ? (
                        <Badge variant="secondary" className={`h-5 px-1.5 text-[10px] ${active ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"}`}>
                          {chatUnread}
                        </Badge>
                      ) : (item.key === "service-requests" && service.length > 0) ? (
                        <Badge variant="secondary" className={`h-5 px-1.5 text-[10px] ${active ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"}`}>
                          {service.length}
                        </Badge>
                      ) : item.key === "service-kanban" && openServiceCount > 0 ? (
                        <Badge variant="secondary" className={`h-5 px-1.5 text-[10px] ${active ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"}`}>
                          {openServiceCount}
                        </Badge>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
            );
          })}
        </nav>
      </ScrollArea>

      {/* User strip */}
      <div className="shrink-0 p-3 border-t border-border/60">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="w-full flex items-center gap-2.5 px-2 py-2 rounded-md hover:bg-muted/50 transition-colors text-left outline-none">
              <Avatar className="size-8">
                <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                  {userInitials || "U"}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="text-sm leading-tight truncate">{user?.fullName || "Kullanıcı"}</div>
                <div className="text-[11px] text-muted-foreground leading-tight truncate">Hesabım & Yönetim</div>
              </div>
              <ChevronDown className="size-4 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-[236px]" align="end" side={menuSide} sideOffset={12}>
            <DropdownMenuLabel>Hesabım & Analiz</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => onNavigate("settings")}><ContactIcon className="size-4 mr-2 text-muted-foreground" /> Profil & Ayarlar</DropdownMenuItem>
            <DropdownMenuItem onClick={() => toast.message("Klavye Kısayolları", { description: "⌘K komut paleti · / arama" })}><HelpCircle className="size-4 mr-2 text-muted-foreground" /> Klavye Kısayolları</DropdownMenuItem>
            {canSeeReports && (
              <DropdownMenuItem onClick={() => { onNavigate("reports"); onItemClick?.(); }}><BarChart3 className="size-4 mr-2 text-muted-foreground" /> Raporlar</DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Yönetim</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => { onNavigate("users"); onItemClick?.(); }}><Users className="size-4 mr-2 text-muted-foreground" /> Kullanıcılar</DropdownMenuItem>
            <DropdownMenuItem onClick={() => { onNavigate("roles"); onItemClick?.(); }}><ShieldCheck className="size-4 mr-2 text-muted-foreground" /> Roller & Yetkiler</DropdownMenuItem>
            <DropdownMenuItem onClick={() => { onNavigate("departments"); onItemClick?.(); }}><Building2 className="size-4 mr-2 text-muted-foreground" /> Departmanlar</DropdownMenuItem>
            <DropdownMenuItem onClick={() => { onNavigate("settings"); onItemClick?.(); }}><SettingsIcon className="size-4 mr-2 text-muted-foreground" /> Ayarlar</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => { onItemClick?.(); onLogout(); }} className="text-destructive focus:text-destructive focus:bg-destructive/10">
              <LogOut className="size-4 mr-2" /> Çıkış Yap
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex h-full min-h-0 w-full overflow-hidden bg-[#f7f7f8] text-foreground">
        {mobileNavOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button
              type="button"
              aria-label="Menüyü kapat"
              className="absolute inset-0 bg-black/40"
              onClick={() => setMobileNavOpen(false)}
            />
            <aside className="relative z-10 flex h-full min-h-0 w-[min(300px,calc(100vw-2rem))] flex-col overflow-hidden border-r border-border/60 bg-white shadow-xl">
              {renderSidebarContent(() => setMobileNavOpen(false), "top")}
            </aside>
          </div>
        )}

        {/* SIDEBAR */}
        <aside className="hidden lg:flex h-full min-h-0 w-[260px] shrink-0 flex-col overflow-hidden border-r border-border/60 bg-white">
          {renderSidebarContent()}
        </aside>

        {/* MAIN */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
          {/* Topbar */}
          <header className="h-16 border-b border-border/60 bg-white flex items-center gap-3 px-3 md:px-6 shrink-0">
            <Button variant="ghost" size="icon" className="lg:hidden size-9" aria-label="Menüyü aç" onClick={() => setMobileNavOpen(true)}>
              <Menu className="size-[18px]" />
            </Button>
            <img
              src="/brand/haksan-logo.png"
              alt="Haksan Makina"
              className="lg:hidden h-8 w-auto max-w-[120px] object-contain"
            />
            <Button variant="ghost" size="icon" className="md:hidden size-9" aria-label="Global arama" onClick={() => setCommandOpen(true)}>
              <Search className="size-[18px] text-muted-foreground" />
            </Button>
            <div className="relative hidden md:block w-[420px] max-w-[40%]">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <button
                type="button"
                className="h-9 w-full rounded-md border border-transparent bg-muted/40 pl-9 pr-16 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/70 focus-visible:border-border focus-visible:bg-white focus-visible:outline-none"
                onClick={() => setCommandOpen(true)}
              >
                Firma, teklif, stok, servis ara...
              </button>
              <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 hidden md:flex items-center gap-1 px-1.5 h-5 rounded text-[10px] text-muted-foreground bg-white border">
                ⌘K
              </kbd>
            </div>

            <div className="flex-1" />

            {/* Bölüm seçici (CNC/Üniversal/Sac/Tümü) — yalnızca birden çok bölüm
                veya 'tümünü gör' yetkisi olanlara. Tek bölümlülerde statik rozet. */}
            {divisions.length > 0 &&
              (showDivisionMenu ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-1.5 h-9 px-2 sm:px-3" aria-label="Bölüm seç">
                      <Building2 className="size-4 text-muted-foreground" />
                      <span className="hidden sm:inline max-w-[110px] truncate">{activeDivisionLabel}</span>
                      <ChevronDown className="size-3.5 text-muted-foreground" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuLabel>Bölüm</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {canViewAllDivisions && (
                      <DropdownMenuItem className="justify-between" onClick={() => setActiveDivision("all")}>
                        Tümü
                        {activeDivision === "all" && <CheckCircle2 className="size-4 text-primary" />}
                      </DropdownMenuItem>
                    )}
                    {divisions.map((d) => (
                      <DropdownMenuItem key={d.id} className="justify-between" onClick={() => setActiveDivision(d.id)}>
                        {d.name}
                        {activeDivision === d.id && <CheckCircle2 className="size-4 text-primary" />}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Badge variant="outline" className="gap-1.5 h-9 px-2.5 font-normal hidden sm:inline-flex">
                  <Building2 className="size-3.5 text-muted-foreground" />
                  {divisions[0]?.name}
                </Badge>
              ))}

            {canApprove && (
              <ApprovalsDialog
                trigger={
                  <Button variant="ghost" size="icon" className="relative size-9" aria-label="Onay bekleyen firma talepleri">
                    <ShieldCheck className="size-[18px] text-muted-foreground" />
                  </Button>
                }
              />
            )}

            <QuickCreateDialog
              trigger={
                <Button variant="outline" size="sm" className="gap-1.5 h-9 px-2 sm:px-3">
                  <Plus className="size-4" />
                  <span className="hidden sm:inline">Hızlı Oluştur</span>
                </Button>
              }
            />

            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCenterDialog
                  trigger={
                    <Button variant="ghost" size="icon" className="relative size-9" aria-label="Yardım Merkezi">
                      <HelpCircle className="size-[18px] text-muted-foreground" />
                    </Button>
                  }
                />
              </TooltipTrigger>
              <TooltipContent>Yardım Merkezi</TooltipContent>
            </Tooltip>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative size-9" aria-label="Bildirimler">
                  <Bell className="size-[18px] text-muted-foreground" />
                  {alerts.length > 0 && (
                    <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-red-500 ring-2 ring-white" aria-hidden />
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80">
                <DropdownMenuLabel className="flex items-center justify-between">
                  <span>Bildirimler</span>
                  <Badge variant="secondary" className="text-[10px]">{alerts.length} yeni</Badge>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {alerts.length === 0 ? (
                  <div className="px-3 py-8 text-center text-sm text-muted-foreground">Aktif uyarı yok.</div>
                ) : alerts.map((alert) => (
                  <NotifItem
                    key={alert.id}
                    icon={alert.severity === "critical" ? <AlertTriangle className="size-4 text-red-600" /> : alert.severity === "warning" ? <Clock className="size-4 text-amber-600" /> : <CheckCircle2 className="size-4 text-blue-600" />}
                    title={alert.title}
                    desc={alert.description}
                    time={alert.severity === "critical" ? "kritik" : "takip"}
                    onClick={() => executeOperationAction(alert.action)}
                  />
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="h-6 w-px bg-border mx-1" />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-2 px-2 h-9">
                  <Avatar className="size-7">
                    <AvatarFallback className="bg-primary text-primary-foreground text-xs">{userInitials}</AvatarFallback>
                  </Avatar>
                  <div className="text-left hidden md:block">
                    <div className="text-[13px] leading-tight">{user?.fullName ?? "Kullanıcı"}</div>
                    <div className="text-[10px] text-muted-foreground leading-tight uppercase tracking-wide">{roleLabel}</div>
                  </div>
                  <ChevronDown className="size-3.5 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Hesabım & Analiz</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => onNavigate("settings")}><ContactIcon className="size-4 mr-2 text-muted-foreground" /> Profil & Ayarlar</DropdownMenuItem>
                <DropdownMenuItem onClick={() => toast.message("Klavye Kısayolları", { description: "⌘K komut paleti · / arama" })}><HelpCircle className="size-4 mr-2 text-muted-foreground" /> Klavye Kısayolları</DropdownMenuItem>
                {canSeeReports && (
                  <DropdownMenuItem onClick={() => onNavigate("reports")}><BarChart3 className="size-4 mr-2 text-muted-foreground" /> Raporlar</DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Yönetim</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => onNavigate("users")}><Users className="size-4 mr-2 text-muted-foreground" /> Kullanıcılar</DropdownMenuItem>
                <DropdownMenuItem onClick={() => onNavigate("roles")}><ShieldCheck className="size-4 mr-2 text-muted-foreground" /> Roller & Yetkiler</DropdownMenuItem>
                <DropdownMenuItem onClick={() => onNavigate("departments")}><Building2 className="size-4 mr-2 text-muted-foreground" /> Departmanlar</DropdownMenuItem>
                <DropdownMenuItem onClick={() => onNavigate("settings")}><SettingsIcon className="size-4 mr-2 text-muted-foreground" /> Ayarlar</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onLogout} className="text-destructive focus:text-destructive">
                  <LogOut className="size-4 mr-2" /> Çıkış yap
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </header>

          {/* Page header */}
          <div className="flex items-end justify-between gap-4 px-4 md:px-6 pt-5 pb-4 border-b border-border/60 bg-white shrink-0">
            <div className="min-w-0">
              <nav className="flex items-center gap-1 text-[11px] text-muted-foreground uppercase tracking-wider">
                <span>Haksan</span>
                <ChevronRight className="size-3" />
                <span className="text-foreground/70">{pageTitle}</span>
              </nav>
              <h1 className="text-[22px] leading-tight mt-1.5 tracking-tight truncate">{pageTitle}</h1>
              {pageSubtitle && (
                <p className="text-sm text-muted-foreground mt-0.5 truncate">{pageSubtitle}</p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">{actions}</div>
          </div>

          {/* Content */}
          <main className="app-main flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain p-4 md:p-6 min-w-0 bg-[#f7f7f8]">{children}</main>
        </div>
        <CommandPalette
          open={commandOpen}
          onOpenChange={setCommandOpen}
          onAction={executeOperationAction}
          canUseAction={canUseAction}
        />
        <AssistantPanel onAction={executeOperationAction} canUseAction={canUseAction} />
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

const STATUS_META: Record<string, { cls: string; icon?: ReactNode }> = {
  lead: { cls: "bg-zinc-100 text-zinc-700 border-zinc-200" },
  sales: { cls: "bg-zinc-100 text-zinc-700 border-zinc-200" },
  call: { cls: "bg-blue-50 text-blue-700 border-blue-200" },
  visit: { cls: "bg-blue-50 text-blue-700 border-blue-200" },
  cancelled: { cls: "bg-red-50 text-red-700 border-red-200", icon: <XCircle className="size-3" /> },
  quote: { cls: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  proforma: { cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  contract: { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: <CheckCircle2 className="size-3" /> },
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
