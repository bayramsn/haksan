import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { canAccessNavKey, Layout, NavKey } from "./components/Layout";
import { Button } from "./components/ui/button";
import { Plus } from "lucide-react";
import { LoginPage } from "./components/pages/Login";
import { markOnboardingSeen, OnboardingPage, shouldShowOnboarding } from "./components/pages/Onboarding";
import { DashboardPage } from "./components/pages/Dashboard";
import { CustomersPage } from "./components/pages/Customers";
import { ContactsPage } from "./components/pages/Contacts";
import { CustomerDetailPage } from "./components/pages/CustomerDetail";
import { SalesCasesPage } from "./components/pages/SalesCases";
import { LeadsPage } from "./components/pages/LeadsPage";
// Fırsat kartı yalnız kullanıcı bir kayıt açtığında render ediliyor; eager
// import edildiğinde alt ağacı (teklif/proforma/sözleşme dialogları dahil)
// ana pakete giriyordu.
const SalesCaseDetailDialog = lazy(() =>
  import("./components/pages/SalesCaseDetail").then((module) => ({ default: module.SalesCaseDetailDialog })),
);
// Harita (leaflet) ve büyük modüller ilk yükte gerekmediklerinden route bazlı lazy sınıra taşınır.
const SalesMapPage = lazy(() => import("./components/pages/SalesMap").then((m) => ({ default: m.SalesMapPage })));
const OffersPage = lazy(() => import("./components/pages/offers/OffersPage").then((m) => ({ default: m.OffersPage })));
const DocumentsPage = lazy(() => import("./components/pages/documents/DocumentsPage").then((m) => ({ default: m.DocumentsPage })));
const PaymentsPage = lazy(() => import("./components/pages/payments/PaymentsPage").then((m) => ({ default: m.PaymentsPage })));
const AccountingInvoicesPage = lazy(() => import("./components/pages/finance/AccountingInvoicesPage").then((m) => ({ default: m.AccountingInvoicesPage })));
const CustomerBalancesPage = lazy(() => import("./components/pages/finance/CustomerBalancesPage").then((m) => ({ default: m.CustomerBalancesPage })));
const DueDatesCalendarPage = lazy(() => import("./components/pages/finance/DueDatesCalendarPage").then((m) => ({ default: m.DueDatesCalendarPage })));
const StockPage = lazy(() => import("./components/pages/stock/StockPage").then((m) => ({ default: m.StockPage })));
const ShipmentsPage = lazy(() => import("./components/pages/logistics/ShipmentsPage").then((m) => ({ default: m.ShipmentsPage })));
const InstallationsPage = lazy(() => import("./components/pages/logistics/InstallationsPage").then((m) => ({ default: m.InstallationsPage })));
const MachinesPage = lazy(() => import("./components/pages/machines/MachinesPage").then((m) => ({ default: m.MachinesPage })));
const ServiceRequestsPage = lazy(() => import("./components/pages/service/ServicePages").then((m) => ({ default: m.ServiceRequestsPage })));
const ServiceKanbanPage = lazy(() => import("./components/pages/service/ServicePages").then((m) => ({ default: m.ServiceKanbanPage })));
const ReportsPage = lazy(() => import("./components/pages/reports/ReportsPage").then((m) => ({ default: m.ReportsPage })));
const UsersPage = lazy(() => import("./components/pages/admin/UsersPage").then((m) => ({ default: m.UsersPage })));
const RolesPage = lazy(() => import("./components/pages/admin/RolesPage").then((m) => ({ default: m.RolesPage })));
const DepartmentsPage = lazy(() => import("./components/pages/admin/DepartmentsPage").then((m) => ({ default: m.DepartmentsPage })));
const SettingsPage = lazy(() => import("./components/pages/settings/SettingsPage").then((m) => ({ default: m.SettingsPage })));
const ChatPage = lazy(() => import("./components/pages/chat/ChatPage").then((m) => ({ default: m.ChatPage })));
const CalendarPage = lazy(() => import("./components/pages/CalendarPage").then((m) => ({ default: m.CalendarPage })));
import { Customer, SalesCase } from "./lib/mock";
import { StoreProvider, useStore } from "./lib/store";
import { clearDrafts, usePersistentState } from "./lib/persist";
import { Toaster } from "./components/ui/sonner";
import { toast } from "sonner";
import { applyOpportunityUrlState } from "./lib/opportunityUrlState";
import { VoiceCallProvider } from "../lib/voiceCall";
import { CreateCustomerDialog, CreateCaseDialog, CreateContactDialog, CreateServiceRequestDialog } from "./components/dialogs/CreateDialogs";
import { ProductsPage } from "./components/pages/Operations";
import { SalesPriceListPage, ServicePriceListPage } from "./components/pages/PriceLists";
import { ReferencesPage } from "./components/pages/ReferencesPage";
import { PublicServiceComplaintPage } from "./components/pages/PublicServiceComplaint";
import { AuthProvider, useAuth } from "../lib/auth";
import { FxProvider } from "./lib/fx";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ReadinessBanner } from "./components/ReadinessBanner";
import { PageShell } from "./components/shared/PageShell";
import { PageLoadingSkeleton } from "./components/shared/PageLoadingSkeleton";
import type { OperationAction, OperationFocus } from "./lib/operations";
import { isNavigationAreaEnabled, NAVIGATION_VISIBILITY_KEYS } from "@haksan/shared";

const TITLES: Partial<Record<NavKey, { title: string; subtitle?: string }>> = {
  dashboard: { title: "Gösterge Paneli", subtitle: "Genel performans ve KPI özeti" },
  chat: { title: "Sohbet", subtitle: "Çalışanlarla özel ve grup mesajlaşma" },
  calendar: { title: "Takvim", subtitle: "Kişisel planlar, toplantılar ve müşteri ziyaretleri" },
  customers: { title: "Firmalar", subtitle: "Müşteri, tedarikçi+müşteri ve tedarikçi kayıtları" },
  contacts: { title: "Kontaklar", subtitle: "Firmalara bağlı kişiler" },
  leads: { title: "Leadler", subtitle: "Tüm kanallardan gelen satış sinyalleri" },
  "sales-cases": { title: "Fırsatlar", subtitle: "C / B / A / A+ satış akışı" },
  kanban: { title: "Fırsatlar", subtitle: "C / B / A / A+ satış akışı" },
  "sales-map": { title: "Firma Haritası", subtitle: "Yakındaki firmaları haritada görün" },
  offers: { title: "Teklifler", subtitle: "Hazırlanmış ve gönderilmiş teklifler" },
  proformas: { title: "Proformalar", subtitle: "Satış proforma dokümanları ve PDF çıktıları" },
  contracts: { title: "Sözleşmeler", subtitle: "Satış sözleşmeleri ve PDF çıktıları" },
  documents: { title: "Ticari Belge Merkezi", subtitle: "Tekliften faturaya bağlı belgeler ve saha kanıtları" },
  payments: { title: "Ödemeler & Kasa", subtitle: "Kasa giriş/çıkış takibi · alınan ve ödenen" },
  "accounting-invoices": { title: "Muhasebe Faturaları", subtitle: "Satış/alış fatura ve vade planı" },
  "customer-balances": { title: "Cari Rapor", subtitle: "Firma borç/alacak özeti ve ekstre" },
  "due-dates": { title: "Vade Takvimi", subtitle: "Tahsil ve ödeme vadeleri" },
  "sales-price-list": { title: "Satış Fiyat Listesi", subtitle: "Tezgahlar ve uyumlu opsiyonel donanım fiyatları" },
  references: { title: "Referanslar", subtitle: "Satış için firma ve teslim edilen tezgah referansları" },
  products: { title: "Ürünler", subtitle: "Makine modeline göre ürün kataloğu" },
  stock: { title: "Stok", subtitle: "Seri numarası bazlı stok yönetimi" },
  shipments: { title: "Sevkiyat & Lojistik", subtitle: "Gümrük ve nakliye takibi" },
  installations: { title: "Kurulumlar", subtitle: "Saha kurulum operasyonları" },
  deliveries: { title: "Kurulumlar", subtitle: "Teslim, kurulum ve kurulum tutanakları" },
  machines: { title: "Makineler / Varlıklar", subtitle: "Müşteriye kurulu makineler ve garanti" },
  "service-requests": { title: "Servis Talepleri", subtitle: "Talep listesi, şikayet kutusu ve servis geçmişi" },
  "service-kanban": { title: "Servis Kanban", subtitle: "Servis süreç akışı: talep → form" },
  "service-price-list": { title: "Servis Fiyat Listesi", subtitle: "Yedek parça ve işçilik fiyatları" },
  reports: { title: "Raporlar", subtitle: "Satış, finans, stok ve servis raporları" },
  users: { title: "Kullanıcılar" },
  roles: { title: "Roller & Yetkiler", subtitle: "Rol bazlı izin yönetimi" },
  departments: { title: "Departmanlar" },
  settings: { title: "Ayarlar", subtitle: "Kurumsal bilgiler, tercihler ve alan yönetimi" },
};

const DEFAULT_NAV: NavKey = "dashboard";

function isNavKey(value: unknown): value is NavKey {
  return typeof value === "string" && value in TITLES;
}

function AppShell() {
  const { authed, loading, login, logout, hasPermission, hasRole, tenant } = useAuth();
  const { customers, cases, closedCases, loading: storeLoading } = useStore();
  const [showOnboarding, setShowOnboarding] = useState(shouldShowOnboarding);
  // Yenilemede kullanıcının kaldığı yer korunur (sayfa + seçili firma/satış kartı).
  const [nav, setNav] = usePersistentState<NavKey>("nav", "dashboard");
  const [selectedCustomerId, setSelectedCustomerId] = usePersistentState<string | null>("selectedCustomerId", null);
  const [selectedCaseId, setSelectedCaseId] = usePersistentState<string | null>("selectedCaseId", null);
  const [deepLinkReady, setDeepLinkReady] = useState(false);
  const [focus, setFocus] = useState<{ nav: NavKey; focus?: OperationFocus; query?: string } | null>(null);
  const requestedNavValue = isNavKey(nav) ? nav : DEFAULT_NAV;
  const requestedNav = requestedNavValue === "proformas" || requestedNavValue === "contracts" ? "documents" : requestedNavValue;
  const hiddenNavigationKeys = tenant?.hiddenNavigationKeys ?? [];
  const canOpenNav = (key: NavKey) =>
    canAccessNavKey(key, hasPermission, hasRole) && isNavigationAreaEnabled(key, hiddenNavigationKeys);
  const firstEnabledNav = NAVIGATION_VISIBILITY_KEYS.find((key) => canOpenNav(key));
  const reportsEnabled = canOpenNav("reports");
  const workspaceHasEnabledPage = Boolean(firstEnabledNav || reportsEnabled);
  const fallbackNav: NavKey = firstEnabledNav ?? (reportsEnabled ? "reports" : canAccessNavKey("settings", hasPermission, hasRole) ? "settings" : DEFAULT_NAV);
  const currentNav = !authed || canOpenNav(requestedNav) ? requestedNav : fallbackNav;
  const previousNavRef = useRef<NavKey | null>(null);
  const previousAuthedRef = useRef<boolean | null>(null);
  // Fırsat paneli kapatılırken açılışta itilen history kayıtlarını simetrik biçimde geri sarmak için.
  const closingOpportunityRef = useRef(false);
  const closeFallbackTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (nav === "proformas" || nav === "contracts") setNav("documents");
  }, [nav, setNav]);

  // Fırsat kartı lazy chunk'ta: ana paketi 305 kB küçültüyor ama kartı ilk
  // açışta bir ağ turu ekliyordu ve bu kullanıcıya "uygulama yavaşladı" diye
  // hissediliyor. Boşta kalınca önden indirip iki faydayı da alıyoruz:
  // ilk boyama hafif kalır, kart açılışı anlık olur.
  useEffect(() => {
    if (!authed) return;
    let cancelled = false;
    const prefetch = () => {
      if (cancelled) return;
      void import("./components/pages/SalesCaseDetail");
    };
    const idle = (window as typeof window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    });
    const handle = idle.requestIdleCallback
      ? idle.requestIdleCallback(prefetch, { timeout: 3000 })
      : window.setTimeout(prefetch, 1500);
    return () => {
      cancelled = true;
      if (idle.cancelIdleCallback) idle.cancelIdleCallback(handle);
      else window.clearTimeout(handle);
    };
  }, [authed]);

  useEffect(() => {
    const applyLocation = (fromHistory = false) => {
      const opportunityId = new URL(window.location.href).searchParams.get("opportunity");
      // Kapatmanın tek adımlık go(-depth) sıçraması buraya döner: panel kapanır, ek geri adım atılmaz.
      if (fromHistory && closingOpportunityRef.current) {
        closingOpportunityRef.current = false;
        if (closeFallbackTimerRef.current !== null) {
          window.clearTimeout(closeFallbackTimerRef.current);
          closeFallbackTimerRef.current = null;
        }
        setSelectedCaseId(null);
        setDeepLinkReady(true);
        return;
      }
      if (opportunityId) {
        setSelectedCustomerId(null);
        setSelectedCaseId(opportunityId);
        // Yalnız derin bağlantıyla ilk açılışta fırsatlar sayfasına geç; tarayıcı geçmişinde nav zorlanmaz.
        if (!fromHistory) setNav("sales-cases");
      } else if (fromHistory) {
        setSelectedCaseId(null);
      }
      setDeepLinkReady(true);
    };
    applyLocation();
    const handlePopState = () => applyLocation(true);
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      if (closeFallbackTimerRef.current !== null) {
        window.clearTimeout(closeFallbackTimerRef.current);
        closeFallbackTimerRef.current = null;
      }
    };
  }, [setNav, setSelectedCaseId, setSelectedCustomerId]);

  useEffect(() => {
    if (!deepLinkReady) return;
    // Parametre silme listesi elle tutuluyordu; değişmezler artık saf modülde
    // ve testli (fırsat yoksa hiçbiri anlamlı değil, record yalnız
    // section=records iken korunur, aktivite yüzeyi çalışma alanına zorlar).
    const url = new URL(window.location.href);
    const search = applyOpportunityUrlState(url.search, { opportunity: selectedCaseId ?? null });
    window.history.replaceState(window.history.state, "", `${url.pathname}${search}${url.hash}`);
  }, [deepLinkReady, selectedCaseId]);

  useEffect(() => {
    if (currentNav !== nav) setNav(currentNav);
  }, [currentNav, nav, setNav]);

  useEffect(() => {
    if (selectedCustomerId && !isNavigationAreaEnabled("customers", hiddenNavigationKeys)) {
      setSelectedCustomerId(null);
    }
    if (selectedCaseId && !isNavigationAreaEnabled("sales-cases", hiddenNavigationKeys)) {
      setSelectedCaseId(null);
    }
  }, [hiddenNavigationKeys, selectedCaseId, selectedCustomerId, setSelectedCaseId, setSelectedCustomerId]);

  useEffect(() => {
    if (previousNavRef.current && previousNavRef.current !== currentNav) clearDrafts();
    previousNavRef.current = currentNav;
  }, [currentNav]);

  useEffect(() => {
    if (previousAuthedRef.current && !authed) clearDrafts();
    previousAuthedRef.current = authed;
  }, [authed]);

  if (loading) {
    return (
      <div className="grid h-full w-full place-items-center text-muted-foreground">
        Yükleniyor…
      </div>
    );
  }

  if (!authed) {
    if (showOnboarding) {
      return (
        <OnboardingPage
          onFinish={() => {
            markOnboardingSeen();
            setShowOnboarding(false);
          }}
        />
      );
    }
    return (
      <LoginPage
        onLogin={async (identifier, password) => { await login(identifier, password); }}
        onReplayIntro={() => setShowOnboarding(true)}
      />
    );
  }

  // Seçili kayıtlar id ile saklanıp store yüklendiğinde yeniden çözülür.
  const selectedCustomer: Customer | null = selectedCustomerId ? customers.find((c) => c.id === selectedCustomerId) ?? null : null;
  const selectedCase: SalesCase | null = selectedCaseId
    ? cases.find((s) => s.id === selectedCaseId) ?? closedCases.find((s) => s.id === selectedCaseId) ?? null
    : null;

  const selectOpportunity = (opportunityId: string, activityId?: string, historyMode: "push" | "replace" = "push") => {
    if (!canOpenNav("sales-cases")) {
      toast.error("Fırsatlar alanı şirket ayarlarında kapalı.");
      return;
    }
    const url = new URL(window.location.href);
    const currentSurface = url.searchParams.get("surface");
    url.searchParams.set("opportunity", opportunityId);
    if (activityId) url.searchParams.set("activity", activityId);
    else url.searchParams.delete("activity");
    // Fırsatlar arası gezinirken (replace) mevcut yüzey korunur; yeni açılışta aktivite varsa çalışma alanı, yoksa hızlı panel.
    const nextSurface = activityId
      ? "workspace"
      : historyMode === "replace" && currentSurface
        ? currentSurface
        : "quick";
    url.searchParams.set("surface", nextSurface);
    // Önceki fırsatın bölüm/kayıt çapası yeni fırsatın URL'ine sızmasın.
    url.searchParams.delete("section");
    url.searchParams.delete("record");
    const target = `${url.pathname}${url.search}${url.hash}`;
    if (historyMode === "push") {
      // Yalnız gerçekten kayıt iten kol damgalanır; derinlik kapatmada kaç adım geri gidileceğini söyler.
      const state = window.history.state as { haksanOpportunityDepth?: number } | null;
      window.history.pushState(
        { ...state, haksanOpportunity: true, haksanOpportunityDepth: (state?.haksanOpportunityDepth ?? 0) + 1 },
        "",
        target,
      );
    } else {
      // Replace hiçbir kayıt itmez; mevcut state (ve derinliği) olduğu gibi korunur.
      window.history.replaceState(window.history.state, "", target);
    }
    setSelectedCustomerId(null);
    setSelectedCaseId(opportunityId);
    requestAnimationFrame(() => window.dispatchEvent(new Event("haksan:opportunity-focus")));
  };

  const closeOpportunity = () => {
    const depth = (window.history.state as { haksanOpportunityDepth?: number } | null)?.haksanOpportunityDepth ?? 0;
    if (depth <= 0) {
      // Uygulama hiç kayıt itmedi (derin bağlantı, yeni sekme): geri gitmek siteden çıkarırdı, sadece seçimi temizle.
      setSelectedCaseId(null);
      return;
    }
    // Açılışta itilen kayıtlar tek adımda geri sarılır; ara "quick" kaydından geçilmediği için titreme de olmaz.
    closingOpportunityRef.current = true;
    if (closeFallbackTimerRef.current !== null) window.clearTimeout(closeFallbackTimerRef.current);
    closeFallbackTimerRef.current = window.setTimeout(() => {
      closeFallbackTimerRef.current = null;
      if (!closingOpportunityRef.current) return;
      // Savunmacı: beklenen popstate gelmediyse panel asla kilitlenmesin.
      closingOpportunityRef.current = false;
      setSelectedCaseId(null);
      // `depth > 0` iken geri gidilecek kayıt garanti var, yani popstate kesin
      // gelir; kilitlenme hali zaten yukarıdaki `depth <= 0` dalıyla çözülüyor.
      // Süre kısa tutulursa ana iş parçacığı tıkalıyken zamanlayıcı erken
      // ateşleniyor, gecikmiş popstate normal yola girip derin bağlantı
      // kaydındaki `?opportunity=` yüzünden paneli yeniden açıyordu.
    }, 800);
    window.history.go(-depth);
  };

  const goto = (k: NavKey) => {
    if (!canOpenNav(k)) {
      toast.error("Bu alan şirket ayarlarında kapalı veya erişim yetkiniz yok.");
      return;
    }
    setSelectedCustomerId(null);
    setSelectedCaseId(null);
    setFocus(null);
    setNav(k);
  };

  const runOperationAction = (action: OperationAction) => {
    if (action.kind === "navigate") {
      const targetNav = action.nav === "deliveries" ? "installations" : action.nav as NavKey;
      if (!canOpenNav(targetNav)) {
        toast.error("Bu alan şirket ayarlarında kapalı veya erişim yetkiniz yok.");
        return;
      }
      setSelectedCustomerId(null);
      setSelectedCaseId(null);
      setNav(targetNav);
      setFocus({ nav: targetNav, focus: action.focus, query: action.query });
      return;
    }
    if (action.kind === "customer") {
      if (!canOpenNav("customers")) {
        toast.error("Firmalar alanı şirket ayarlarında kapalı.");
        return;
      }
      setSelectedCaseId(null);
      setFocus(null);
      setSelectedCustomerId(action.customerId);
      return;
    }
    if (action.kind === "salesCase") {
      if (!canOpenNav("sales-cases")) {
        toast.error("Fırsatlar alanı şirket ayarlarında kapalı.");
        return;
      }
      setFocus(null);
      selectOpportunity(action.salesCaseId);
    }
  };

  let content: React.ReactNode;
  let actions: React.ReactNode = null;
  let titleOverride: { title: string; subtitle?: string } | null = null;
  const canCreate = (permission: string) => hasPermission(permission);

  if (!workspaceHasEnabledPage && !canAccessNavKey("settings", hasPermission, hasRole)) {
    titleOverride = { title: "Aktif çalışma alanı yok", subtitle: "Şirket yöneticiniz bu kullanıcı için kullanılabilir sayfa bırakmadı" };
    content = (
      <div className="rounded-xl border border-dashed bg-card px-6 py-12 text-center">
        <h2 className="font-display text-xl font-semibold">Tüm çalışma alanları kapalı</h2>
        <p className="mt-2 text-sm text-muted-foreground">Bir sayfanın yeniden açılması için şirket yöneticinizle iletişime geçin.</p>
      </div>
    );
  } else if (selectedCustomer) {
    titleOverride = { title: selectedCustomer.name, subtitle: "Müşteri detayı" };
    content = <CustomerDetailPage customer={selectedCustomer} onBack={() => setSelectedCustomerId(null)} onAction={runOperationAction} />;
  } else {
    switch (currentNav) {
      case "dashboard": content = <DashboardPage onAction={runOperationAction} />; break;
      case "chat": content = (
        <ChatPage
          onOpenRecord={(card) => {
            if (card.missing) return;
            if (card.type === "company") runOperationAction({ kind: "customer", customerId: card.id });
            else if (card.type === "opportunity") runOperationAction({ kind: "salesCase", salesCaseId: card.id });
            else if (card.type === "quote") runOperationAction({ kind: "navigate", nav: "offers" });
            else runOperationAction({ kind: "navigate", nav: "service-requests" });
          }}
        />
      ); break;
      case "calendar": content = <CalendarPage />; break;
      case "customers":
        actions = canCreate("companies.create") ? (
          <CreateCustomerDialog
            trigger={<Button className="gap-1"><Plus className="size-4" /> Yeni Firma</Button>}
          />
        ) : null;
        content = <CustomersPage onSelect={(c) => setSelectedCustomerId(c.id)} />;
        break;
      case "contacts":
        actions = canCreate("contacts.create") ? (
          <CreateContactDialog
            trigger={<Button className="gap-1"><Plus className="size-4" /> Yeni Kontak</Button>}
          />
        ) : null;
        content = <ContactsPage />;
        break;
      case "leads":
        content = <LeadsPage onSelect={(lead) => selectOpportunity(lead.id)} focus={focus?.nav === "leads" ? focus.focus : undefined} />;
        break;
      case "sales-cases":
        actions = canCreate("opportunities.create") ? (
          <CreateCaseDialog
            trigger={<Button className="gap-1"><Plus className="size-4" /> Yeni Fırsat</Button>}
            createAsOpportunity
          />
        ) : null;
        content = <SalesCasesPage onSelect={(s) => selectOpportunity(s.id)} initialView="kanban" focus={focus?.nav === "sales-cases" ? focus.focus : undefined} onAction={runOperationAction} />;
        break;
      case "kanban":
        actions = canCreate("opportunities.create") ? (
          <CreateCaseDialog
            trigger={<Button className="gap-1"><Plus className="size-4" /> Yeni Kart</Button>}
          />
        ) : null;
        content = <SalesCasesPage onSelect={(s) => selectOpportunity(s.id)} initialView="kanban" focus={focus?.nav === "kanban" ? focus.focus : undefined} onAction={runOperationAction} />;
        break;
      case "sales-map": content = <SalesMapPage initialQuery={focus?.nav === "sales-map" ? focus.query : undefined} />; break;
      case "offers": content = (
        <OffersPage
          focus={focus?.nav === "offers" ? focus.focus : undefined}
          initialQuery={focus?.nav === "offers" ? focus.query : undefined}
          onOpenOpportunity={selectOpportunity}
          onOpenDocuments={(query) => runOperationAction({ kind: "navigate", nav: "documents", query })}
        />
      ); break;
      case "documents": content = <DocumentsPage initialQuery={focus?.nav === "documents" ? focus.query : undefined} onOpenOpportunity={selectOpportunity} onOpenOffer={(query) => runOperationAction({ kind: "navigate", nav: "offers", query })} onOpenCustomer={(customerId) => runOperationAction({ kind: "customer", customerId })} onOpenPayment={(query) => runOperationAction({ kind: "navigate", nav: "payments", query })} onOpenServiceRequest={(query) => runOperationAction({ kind: "navigate", nav: "service-requests", query: `ticket:${query}` })} onOpenAccountingInvoices={(query) => runOperationAction({ kind: "navigate", nav: "accounting-invoices", query })} />; break;
      case "payments": content = <PaymentsPage focus={focus?.nav === "payments" ? focus.focus : undefined} initialQuery={focus?.nav === "payments" ? focus.query : undefined} />; break;
      case "accounting-invoices": content = <AccountingInvoicesPage initialQuery={focus?.nav === "accounting-invoices" ? focus.query : undefined} />; break;
      case "customer-balances": content = <CustomerBalancesPage />; break;
      case "due-dates": content = <DueDatesCalendarPage />; break;
      case "sales-price-list": content = <SalesPriceListPage />; break;
      case "references": content = <ReferencesPage />; break;
      case "products": content = <ProductsPage initialQuery={focus?.nav === "products" ? focus.query : undefined} />; break;
      case "stock": content = <StockPage focus={focus?.nav === "stock" ? focus.focus : undefined} initialQuery={focus?.nav === "stock" ? focus.query : undefined} />; break;
      case "shipments": content = <ShipmentsPage focus={focus?.nav === "shipments" ? focus.focus : undefined} />; break;
      case "installations": content = <InstallationsPage />; break;
      case "deliveries": content = <InstallationsPage />; break;
      case "machines": content = <MachinesPage />; break;
      case "service-requests":
        content = (
          <ServiceRequestsPage
            focus={focus?.nav === "service-requests" ? focus.focus : undefined}
            initialQuery={focus?.nav === "service-requests" ? focus.query : undefined}
          />
        );
        break;
      case "service-kanban":
        actions = canCreate("service_tickets.create") ? (
          <CreateServiceRequestDialog
            trigger={<Button className="gap-1"><Plus className="size-4" /> Yeni Talep</Button>}
          />
        ) : null;
        content = <ServiceKanbanPage focus={focus?.nav === "service-kanban" ? focus.focus : undefined} />;
        break;
      case "service-price-list": content = <ServicePriceListPage />; break;
      case "reports": content = <ReportsPage onAction={runOperationAction} />; break;
      case "users": content = <UsersPage />; break;
      case "roles": content = <RolesPage />; break;
      case "departments": content = <DepartmentsPage />; break;
      case "settings": content = <SettingsPage />; break;
    }
  }

  const t = titleOverride ?? TITLES[currentNav] ?? TITLES[DEFAULT_NAV]!;

  return (
    <VoiceCallProvider>
    <Layout
      current={currentNav}
      onNavigate={goto}
      onLogout={() => {
        clearDrafts();
        void logout();
      }}
      onSelectFirm={(c) => { setSelectedCaseId(null); setSelectedCustomerId(c.id); }}
      onSelectCase={(id, target) => selectOpportunity(id, target?.activityId)}
      onOperationAction={runOperationAction}
      pageTitle={t.title}
      pageSubtitle={t.subtitle}
      actions={actions}
    >
      <ReadinessBanner />
      <PageShell>
      {storeLoading && customers.length === 0 && cases.length === 0 ? (
        <PageLoadingSkeleton />
      ) : (
        <ErrorBoundary>
          <Suspense fallback={<PageLoadingSkeleton />}>{content}</Suspense>
        </ErrorBoundary>
      )}
      </PageShell>
      {selectedCase && (
        <Suspense fallback={null}>
          <SalesCaseDetailDialog
            sc={selectedCase}
            onClose={closeOpportunity}
            onNavigate={(opportunityId) => selectOpportunity(opportunityId, undefined, "replace")}
          />
        </Suspense>
      )}
    </Layout>
    </VoiceCallProvider>
  );
}

export default function App() {
  const publicMatch = typeof window !== "undefined" ? window.location.pathname.match(/^\/public\/service-complaints\/([^/]+)\/([^/?#]+)/) : null;
  if (publicMatch) {
    return (
      <>
        <PublicServiceComplaintPage slug={decodeURIComponent(publicMatch[1])} token={decodeURIComponent(publicMatch[2])} />
        <Toaster richColors position="top-right" />
      </>
    );
  }

  return (
    <AuthProvider>
      <FxProvider>
        <StoreProvider>
          <ErrorBoundary>
            <AppShell />
          </ErrorBoundary>
          <Toaster richColors position="top-right" />
        </StoreProvider>
      </FxProvider>
    </AuthProvider>
  );
}
