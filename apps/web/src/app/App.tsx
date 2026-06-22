import { lazy, Suspense, useEffect, useState } from "react";
import { Layout, NavKey } from "./components/Layout";
import { Button } from "./components/ui/button";
import { Plus } from "lucide-react";
import { LoginPage } from "./components/pages/Login";
import { DashboardPage } from "./components/pages/Dashboard";
import { CustomersPage } from "./components/pages/Customers";
import { ContactsPage } from "./components/pages/Contacts";
import { CustomerDetailPage } from "./components/pages/CustomerDetail";
import { SalesCasesPage } from "./components/pages/SalesCases";
import { SalesCaseDetailDialog } from "./components/pages/SalesCaseDetail";
// Harita (leaflet) ve aşağıdaki SimplePages barrel'ı uygulamanın büyük kısmını
// oluşturur; ilk yükte gerekmediklerinden lazy sınıra taşınır (route-based split).
const SalesMapPage = lazy(() => import("./components/pages/SalesMap").then((m) => ({ default: m.SalesMapPage })));
const OffersPage = lazy(() => import("./components/pages/SimplePages").then((m) => ({ default: m.OffersPage })));
const DocumentsPage = lazy(() => import("./components/pages/SimplePages").then((m) => ({ default: m.DocumentsPage })));
const PaymentsPage = lazy(() => import("./components/pages/SimplePages").then((m) => ({ default: m.PaymentsPage })));
const AccountingInvoicesPage = lazy(() => import("./components/pages/SimplePages").then((m) => ({ default: m.AccountingInvoicesPage })));
const CustomerBalancesPage = lazy(() => import("./components/pages/SimplePages").then((m) => ({ default: m.CustomerBalancesPage })));
const DueDatesCalendarPage = lazy(() => import("./components/pages/SimplePages").then((m) => ({ default: m.DueDatesCalendarPage })));
const StockPage = lazy(() => import("./components/pages/SimplePages").then((m) => ({ default: m.StockPage })));
const PurchaseOrdersPage = lazy(() => import("./components/pages/SimplePages").then((m) => ({ default: m.PurchaseOrdersPage })));
const ShipmentsPage = lazy(() => import("./components/pages/SimplePages").then((m) => ({ default: m.ShipmentsPage })));
const InstallationsPage = lazy(() => import("./components/pages/SimplePages").then((m) => ({ default: m.InstallationsPage })));
const DeliveriesPage = lazy(() => import("./components/pages/SimplePages").then((m) => ({ default: m.DeliveriesPage })));
const MachinesPage = lazy(() => import("./components/pages/SimplePages").then((m) => ({ default: m.MachinesPage })));
const ServiceRequestsPage = lazy(() => import("./components/pages/SimplePages").then((m) => ({ default: m.ServiceRequestsPage })));
const ServiceKanbanPage = lazy(() => import("./components/pages/SimplePages").then((m) => ({ default: m.ServiceKanbanPage })));
const ReportsPage = lazy(() => import("./components/pages/SimplePages").then((m) => ({ default: m.ReportsPage })));
const UsersPage = lazy(() => import("./components/pages/SimplePages").then((m) => ({ default: m.UsersPage })));
const RolesPage = lazy(() => import("./components/pages/SimplePages").then((m) => ({ default: m.RolesPage })));
const DepartmentsPage = lazy(() => import("./components/pages/SimplePages").then((m) => ({ default: m.DepartmentsPage })));
const SettingsPage = lazy(() => import("./components/pages/SimplePages").then((m) => ({ default: m.SettingsPage })));
const ChatPage = lazy(() => import("./components/pages/chat/ChatPage").then((m) => ({ default: m.ChatPage })));
import { Customer, SalesCase } from "./lib/mock";
import { StoreProvider, useStore } from "./lib/store";
import { usePersistentState } from "./lib/persist";
import { Toaster } from "./components/ui/sonner";
import { CreateCustomerDialog, CreateCaseDialog, CreateContactDialog, CreateServiceRequestDialog } from "./components/dialogs/CreateDialogs";
import { ProductsPage } from "./components/pages/Operations";
import { SalesPriceListPage, ServicePriceListPage } from "./components/pages/PriceLists";
import { PublicServiceComplaintPage } from "./components/pages/PublicServiceComplaint";
import { AuthProvider, useAuth } from "../lib/auth";
import { FxProvider } from "./lib/fx";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ReadinessBanner } from "./components/ReadinessBanner";
import { PageShell } from "./components/shared/PageShell";
import { PageLoadingSkeleton } from "./components/shared/PageLoadingSkeleton";
import type { OperationAction, OperationFocus } from "./lib/operations";

const TITLES: Record<NavKey, { title: string; subtitle?: string }> = {
  dashboard: { title: "Dashboard", subtitle: "Genel performans ve KPI özeti" },
  chat: { title: "Sohbet", subtitle: "Çalışanlarla özel ve grup mesajlaşma" },
  customers: { title: "Firmalar", subtitle: "Müşteri, tedarikçi+müşteri ve tedarikçi kayıtları" },
  contacts: { title: "Kontaklar", subtitle: "Firmalara bağlı kişiler" },
  "sales-cases": { title: "Satış Kartları", subtitle: "Tüm satış fırsatları" },
  kanban: { title: "Satış Kartları", subtitle: "Kanban görünümü" },
  "sales-map": { title: "Firma Haritası", subtitle: "Yakındaki firmaları haritada görün" },
  offers: { title: "Teklifler", subtitle: "Hazırlanmış ve gönderilmiş teklifler" },
  proformas: { title: "Proformalar", subtitle: "Satış proforma dokümanları ve PDF çıktıları" },
  contracts: { title: "Sözleşmeler", subtitle: "Satış sözleşmeleri ve PDF çıktıları" },
  documents: { title: "Dokümanlar", subtitle: "Proforma, sözleşme, fatura ve kurulum belgeleri" },
  payments: { title: "Ödemeler & Kasa", subtitle: "Kasa giriş/çıkış takibi · alınan ve ödenen" },
  "accounting-invoices": { title: "Muhasebe Faturaları", subtitle: "Satış/alış fatura ve vade planı" },
  "customer-balances": { title: "Cari Rapor", subtitle: "Firma borç/alacak özeti ve ekstre" },
  "due-dates": { title: "Vade Takvimi", subtitle: "Tahsil ve ödeme vadeleri" },
  "sales-price-list": { title: "Satış Fiyat Listesi", subtitle: "Tezgahlar ve uyumlu opsiyonel donanım fiyatları" },
  products: { title: "Ürünler", subtitle: "Makine modeline göre ürün kataloğu" },
  stock: { title: "Stok", subtitle: "Seri numarası bazlı stok yönetimi" },
  "purchase-orders": { title: "Satın Alma", subtitle: "Tedarikçi siparişleri" },
  shipments: { title: "Sevkiyat & Lojistik", subtitle: "Gümrük ve nakliye takibi" },
  installations: { title: "Kurulumlar", subtitle: "Saha kurulum operasyonları" },
  deliveries: { title: "Teslimatlar", subtitle: "Müşteri teslim formları" },
  machines: { title: "Makineler / Varlıklar", subtitle: "Müşteriye kurulu makineler ve garanti" },
  "service-requests": { title: "Servis Talepleri", subtitle: "Servis akışı (satıştan ayrı)" },
  "service-kanban": { title: "Servis Kanban", subtitle: "Servis süreç akışı: talep → form" },
  "service-price-list": { title: "Servis Fiyat Listesi", subtitle: "Yedek parça ve işçilik fiyatları" },
  reports: { title: "Raporlar", subtitle: "Satış, finans, stok ve servis raporları" },
  users: { title: "Kullanıcılar" },
  roles: { title: "Roller & Yetkiler", subtitle: "Rol bazlı izin yönetimi" },
  departments: { title: "Departmanlar" },
  settings: { title: "Ayarlar" },
};

const DEFAULT_NAV: NavKey = "dashboard";

function isNavKey(value: unknown): value is NavKey {
  return typeof value === "string" && value in TITLES;
}

function AppShell() {
  const { authed, loading, login, logout } = useAuth();
  const { customers, cases, loading: storeLoading } = useStore();
  // Yenilemede kullanıcının kaldığı yer korunur (sayfa + seçili firma/satış kartı).
  const [nav, setNav] = usePersistentState<NavKey>("nav", "dashboard");
  const [selectedCustomerId, setSelectedCustomerId] = usePersistentState<string | null>("selectedCustomerId", null);
  const [selectedCaseId, setSelectedCaseId] = usePersistentState<string | null>("selectedCaseId", null);
  const [focus, setFocus] = useState<{ nav: NavKey; focus?: OperationFocus; query?: string } | null>(null);
  const currentNav = isNavKey(nav) ? nav : DEFAULT_NAV;

  useEffect(() => {
    if (currentNav !== nav) setNav(currentNav);
  }, [currentNav, nav, setNav]);

  if (loading) {
    return (
      <div className="grid h-full w-full place-items-center text-muted-foreground">
        Yükleniyor…
      </div>
    );
  }

  if (!authed) {
    return <LoginPage onLogin={async (email, password) => { await login(email, password); }} />;
  }

  // Seçili kayıtlar id ile saklanıp store yüklendiğinde yeniden çözülür.
  const selectedCustomer: Customer | null = selectedCustomerId ? customers.find((c) => c.id === selectedCustomerId) ?? null : null;
  const selectedCase: SalesCase | null = selectedCaseId ? cases.find((s) => s.id === selectedCaseId) ?? null : null;

  const goto = (k: NavKey) => {
    setSelectedCustomerId(null);
    setSelectedCaseId(null);
    setFocus(null);
    setNav(k);
  };

  const runOperationAction = (action: OperationAction) => {
    if (action.kind === "navigate") {
      setSelectedCustomerId(null);
      setSelectedCaseId(null);
      setNav(action.nav as NavKey);
      setFocus({ nav: action.nav as NavKey, focus: action.focus, query: action.query });
      return;
    }
    if (action.kind === "customer") {
      setSelectedCaseId(null);
      setFocus(null);
      setSelectedCustomerId(action.customerId);
      return;
    }
    if (action.kind === "salesCase") {
      setSelectedCustomerId(null);
      setFocus(null);
      setNav("sales-cases");
      setSelectedCaseId(action.salesCaseId);
    }
  };

  let content: React.ReactNode;
  let actions: React.ReactNode = null;
  let titleOverride: { title: string; subtitle?: string } | null = null;

  if (selectedCustomer) {
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
      case "customers":
        actions = (
          <CreateCustomerDialog
            trigger={<Button className="gap-1"><Plus className="size-4" /> Yeni Firma</Button>}
          />
        );
        content = <CustomersPage onSelect={(c) => setSelectedCustomerId(c.id)} />;
        break;
      case "contacts":
        actions = (
          <CreateContactDialog
            trigger={<Button className="gap-1"><Plus className="size-4" /> Yeni Kontak</Button>}
          />
        );
        content = <ContactsPage />;
        break;
      case "sales-cases":
        actions = (
          <CreateCaseDialog
            trigger={<Button className="gap-1"><Plus className="size-4" /> Yeni Satış Kartı</Button>}
          />
        );
        content = <SalesCasesPage onSelect={(s) => setSelectedCaseId(s.id)} focus={focus?.nav === "sales-cases" ? focus.focus : undefined} />;
        break;
      case "kanban":
        actions = (
          <CreateCaseDialog
            trigger={<Button className="gap-1"><Plus className="size-4" /> Yeni Kart</Button>}
          />
        );
        content = <SalesCasesPage onSelect={(s) => setSelectedCaseId(s.id)} initialView="kanban" focus={focus?.nav === "kanban" ? focus.focus : undefined} />;
        break;
      case "sales-map": content = <SalesMapPage initialQuery={focus?.nav === "sales-map" ? focus.query : undefined} />; break;
      case "offers": content = <OffersPage focus={focus?.nav === "offers" ? focus.focus : undefined} />; break;
      case "proformas": content = <DocumentsPage initialType="Proforma" initialQuery={focus?.nav === "proformas" ? focus.query : undefined} title="Proformalar" description="Satış proformaları, yüklenen PDF'ler ve proforma çıktıları" />; break;
      case "contracts": content = <DocumentsPage initialType="Contract" initialQuery={focus?.nav === "contracts" ? focus.query : undefined} title="Sözleşmeler" description="Satış sözleşmeleri, yüklenen PDF'ler ve sözleşme çıktıları" />; break;
      case "documents": content = <DocumentsPage initialQuery={focus?.nav === "documents" ? focus.query : undefined} />; break;
      case "payments": content = <PaymentsPage focus={focus?.nav === "payments" ? focus.focus : undefined} />; break;
      case "accounting-invoices": content = <AccountingInvoicesPage />; break;
      case "customer-balances": content = <CustomerBalancesPage />; break;
      case "due-dates": content = <DueDatesCalendarPage />; break;
      case "sales-price-list": content = <SalesPriceListPage />; break;
      case "products": content = <ProductsPage initialQuery={focus?.nav === "products" ? focus.query : undefined} />; break;
      case "stock": content = <StockPage focus={focus?.nav === "stock" ? focus.focus : undefined} initialQuery={focus?.nav === "stock" ? focus.query : undefined} />; break;
      case "purchase-orders": content = <PurchaseOrdersPage />; break;
      case "shipments": content = <ShipmentsPage focus={focus?.nav === "shipments" ? focus.focus : undefined} />; break;
      case "installations": content = <InstallationsPage />; break;
      case "deliveries": content = <DeliveriesPage />; break;
      case "machines": content = <MachinesPage />; break;
      case "service-requests":
        actions = (
          <CreateServiceRequestDialog
            trigger={<Button className="gap-1"><Plus className="size-4" /> Yeni Talep</Button>}
          />
        );
        content = (
          <ServiceRequestsPage
            focus={focus?.nav === "service-requests" ? focus.focus : undefined}
            initialQuery={focus?.nav === "service-requests" ? focus.query : undefined}
          />
        );
        break;
      case "service-kanban":
        actions = (
          <CreateServiceRequestDialog
            trigger={<Button className="gap-1"><Plus className="size-4" /> Yeni Talep</Button>}
          />
        );
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

  const t = titleOverride ?? TITLES[currentNav] ?? TITLES[DEFAULT_NAV];

  return (
    <Layout
      current={currentNav}
      onNavigate={goto}
      onLogout={() => logout()}
      onSelectFirm={(c) => { setSelectedCaseId(null); setSelectedCustomerId(c.id); }}
      onSelectCase={(id) => setSelectedCaseId(id)}
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
      <SalesCaseDetailDialog sc={selectedCase} onClose={() => setSelectedCaseId(null)} />
    </Layout>
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
