import { ReactNode, useMemo, useState, useRef, useEffect } from "react";
import { useStore } from "../lib/store";
import { SALES_STAGE_LABELS, type Customer } from "../lib/mock";
import {
  LayoutDashboard, Users, Briefcase, KanbanSquare, FileText, FolderOpen,
  CreditCard, Boxes, ShoppingCart, Truck, Wrench, PackageCheck, Cpu,
  LifeBuoy, BarChart3, ShieldCheck, Building2, Contact as ContactIcon, Settings as SettingsIcon,
  Search, Bell, ChevronDown, LogOut, Plus, HelpCircle, Menu,
  CheckCircle2, Clock, AlertTriangle, XCircle, ChevronRight, Tag, Receipt,
} from "lucide-react";
import { useAuth } from "../../lib/auth";
import { toast } from "sonner";
import { Button } from "./ui/button";
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

export type NavKey =
  | "dashboard" | "customers" | "contacts" | "sales-cases" | "kanban" | "offers"
  | "documents" | "payments" | "sales-price-list" | "products"
  | "stock" | "purchase-orders" | "shipments"
  | "installations" | "deliveries" | "machines" | "service-requests" | "service-kanban" | "service-price-list"
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
    ],
  },
  {
    group: "Satış",
    items: [
      { key: "customers", label: "Firmalar", icon: Building2, roles: ["sales", "service", "finance"] },
      { key: "contacts", label: "Kontaklar", icon: ContactIcon, roles: ["sales", "service"] },
      { key: "sales-cases", label: "Satış Kartları", icon: Briefcase, roles: ["sales"] },
      { key: "offers", label: "Teklifler", icon: FileText, roles: ["sales", "finance"] },
      { key: "documents", label: "Dokümanlar", icon: FolderOpen, roles: ["sales", "finance"] },
      { key: "payments", label: "Ödemeler & Cari", icon: CreditCard, roles: ["finance"] },
      { key: "sales-price-list", label: "Satış Fiyat Listesi", icon: Tag, roles: ["sales"] },
    ],
  },
  {
    group: "Operasyon",
    items: [
      { key: "products", label: "Ürünler", icon: Cpu, roles: ["sales", "service", "stock"] },
      { key: "stock", label: "Stok", icon: Boxes, roles: ["stock"] },
      { key: "purchase-orders", label: "Satın Alma", icon: ShoppingCart, roles: ["stock", "finance"] },
      { key: "shipments", label: "Sevkiyat", icon: Truck, roles: ["stock"] },
      { key: "deliveries", label: "Teslimat", icon: PackageCheck, roles: ["stock", "service"] },
    ],
  },
  {
    group: "Servis",
    items: [
      { key: "machines", label: "Makineler", icon: Cpu, roles: ["service", "stock"] },
      { key: "installations", label: "Kurulum", icon: Wrench, roles: ["service"] },
      { key: "service-requests", label: "Servis Talepleri", icon: LifeBuoy, badge: "3", roles: ["service"] },
      { key: "service-kanban", label: "Servis Kanban", icon: KanbanSquare, badge: "Yeni", roles: ["service"] },
      { key: "service-price-list", label: "Servis Fiyat Listesi", icon: Receipt, roles: ["service"] },
    ],
  },
  {
    group: "Analiz",
    items: [
      { key: "reports", label: "Raporlar", icon: BarChart3, roles: ["sales", "finance"] },
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
};

const FIRM_TYPE_LABEL_TR: Record<string, string> = {
  customer: "Müşteri",
  supplier_customer: "Tedarikçi + Müşteri",
  supplier: "Tedarikçi",
};

export function Layout({ current, onNavigate, onLogout, pageTitle, pageSubtitle, actions, children, onSelectFirm }: Props) {
  const { customers, service } = useStore();
  const { hasRole, user } = useAuth();
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
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const [mgmtOpen, setMgmtOpen] = useState(MGMT_KEYS.has(current));
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const results = useMemo(() => {
    const t = search.trim().toLowerCase();
    if (!t) return [];
    return customers
      .filter(
        (c) =>
          c.name.toLowerCase().includes(t) ||
          c.city.toLowerCase().includes(t) ||
          c.email.toLowerCase().includes(t) ||
          c.taxNumber.toLowerCase().includes(t),
      )
      .slice(0, 8);
  }, [customers, search]);

  const renderSidebarContent = (onItemClick?: () => void, menuSide: "right" | "top" = "right") => (
    <>
      {/* Logo */}
      <div className="h-16 flex items-center gap-3 px-5 border-b border-border/60">
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
      <ScrollArea className="flex-1">
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
                      {(item.key === "service-requests" && service.length > 0) ? (
                        <Badge variant="secondary" className={`h-5 px-1.5 text-[10px] ${active ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"}`}>
                          {service.length}
                        </Badge>
                      ) : item.badge && item.key !== "service-requests" ? (
                        <Badge
                          variant="secondary"
                          className={`h-5 px-1.5 text-[10px] ${active ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"}`}
                        >
                          {item.badge}
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
      <div className="p-3 border-t border-border/60">
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
    </>
  );

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex h-dvh overflow-hidden bg-[#f7f7f8] text-foreground">
        {mobileNavOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button
              type="button"
              aria-label="Menüyü kapat"
              className="absolute inset-0 bg-black/40"
              onClick={() => setMobileNavOpen(false)}
            />
            <aside className="relative z-10 h-full w-[min(300px,calc(100vw-2rem))] border-r border-border/60 bg-white flex flex-col shadow-xl">
              {renderSidebarContent(() => setMobileNavOpen(false), "top")}
            </aside>
          </div>
        )}

        {/* SIDEBAR */}
        <aside className="hidden lg:flex w-[260px] shrink-0 border-r border-border/60 bg-white flex-col">
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
            <div className="relative hidden md:block w-[420px] max-w-[40%]" ref={searchRef}>
              <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Firma ara: ad, şehir, e-posta, VKN..."
                className="pl-9 pr-16 h-9 bg-muted/40 border-transparent focus-visible:bg-white focus-visible:border-border"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setSearchOpen(true); }}
                onFocus={() => setSearchOpen(true)}
              />
              <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 hidden md:flex items-center gap-1 px-1.5 h-5 rounded text-[10px] text-muted-foreground bg-white border">
                ⌘K
              </kbd>

              {searchOpen && search.trim() && (
                <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 rounded-lg border border-border/60 bg-white shadow-lg overflow-hidden">
                  <div className="px-3 py-2 border-b border-border/60 flex items-center justify-between bg-muted/30">
                    <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Firmalar</span>
                    <span className="text-[11px] text-muted-foreground">{results.length} sonuç</span>
                  </div>
                  {results.length === 0 ? (
                    <div className="px-3 py-6 text-sm text-muted-foreground text-center">Sonuç bulunamadı.</div>
                  ) : (
                    <div className="max-h-[360px] overflow-auto">
                      {results.map((c) => (
                        <button
                          key={c.id}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            onSelectFirm?.(c);
                            setSearch("");
                            setSearchOpen(false);
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-muted/60 flex items-center gap-3 group"
                        >
                          <div className="size-8 rounded-md bg-gradient-to-br from-primary/15 to-primary/5 text-primary grid place-items-center shrink-0">
                            <Building2 className="size-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm leading-tight truncate group-hover:text-primary">{c.name}</div>
                            <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                              {FIRM_TYPE_LABEL_TR[c.firmType] ?? c.firmType} · {c.city} · VKN {c.taxNumber}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="px-3 py-2 border-t border-border/60 bg-muted/20 text-[11px] text-muted-foreground">
                    Tüm firmalara git: <button
                      className="text-primary hover:underline"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => { onNavigate("customers"); setSearchOpen(false); setSearch(""); }}
                    >Firmalar sayfası</button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex-1" />

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
                <Button variant="ghost" size="icon" className="relative size-9"
                  onClick={() => toast.message("Yardım Merkezi", { description: "Sorularınız için destek@haksan.local ile iletişime geçebilirsiniz." })}>
                  <HelpCircle className="size-[18px] text-muted-foreground" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Yardım Merkezi</TooltipContent>
            </Tooltip>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative size-9">
                  <Bell className="size-[18px] text-muted-foreground" />
                  <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-red-500 ring-2 ring-white" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80">
                <DropdownMenuLabel className="flex items-center justify-between">
                  <span>Bildirimler</span>
                  <Badge variant="secondary" className="text-[10px]">4 yeni</Badge>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <NotifItem
                  icon={<CheckCircle2 className="size-4 text-emerald-600" />}
                  title="Q-2026-0061 onaylandı"
                  desc="Marmara Lojistik · 32.000 €"
                  time="10 dk önce"
                />
                <NotifItem
                  icon={<AlertTriangle className="size-4 text-red-600" />}
                  title="Ödeme gecikmesi"
                  desc="Çukurova İnşaat · 9.000 USD"
                  time="1 saat önce"
                />
                <NotifItem
                  icon={<Wrench className="size-4 text-amber-600" />}
                  title="Yeni servis talebi"
                  desc="Karadeniz Gıda · SN-300-0003"
                  time="2 saat önce"
                />
                <NotifItem
                  icon={<Clock className="size-4 text-blue-600" />}
                  title="Sevkiyat yola çıktı"
                  desc="TRK-009122 · Hamburg → İstanbul"
                  time="dün"
                />
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
                <DropdownMenuLabel>Hesabım & Yönetim</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => toast.message(user?.fullName ?? "Profil", { description: user?.email ?? "" })}><ContactIcon className="size-4 mr-2 text-muted-foreground" /> Profil</DropdownMenuItem>
                <DropdownMenuItem onClick={() => toast.message("Klavye Kısayolları", { description: "⌘K ara · ⌘N yeni kayıt · ⌘/ yardım" })}><HelpCircle className="size-4 mr-2 text-muted-foreground" /> Klavye Kısayolları</DropdownMenuItem>
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
      </div>
    </TooltipProvider>
  );
}

function NotifItem({ icon, title, desc, time }: { icon: ReactNode; title: string; desc: string; time: string }) {
  return (
    <div className="flex gap-3 px-3 py-2.5 hover:bg-muted/60 cursor-pointer">
      <div className="size-8 rounded-full bg-muted grid place-items-center shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-sm leading-tight truncate">{title}</div>
        <div className="text-xs text-muted-foreground truncate">{desc}</div>
      </div>
      <div className="text-[10px] text-muted-foreground shrink-0">{time}</div>
    </div>
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
