import { useState } from "react";
import { Layout, NavKey } from "./components/Layout";
import { Button } from "./components/ui/button";
import { Plus } from "lucide-react";
import { LoginPage } from "./components/pages/Login";
import { DashboardPage } from "./components/pages/Dashboard";
import { CustomersPage } from "./components/pages/Customers";
import { ContactsPage } from "./components/pages/Contacts";
import { CustomerDetailPage } from "./components/pages/CustomerDetail";
import { SalesCasesPage } from "./components/pages/SalesCases";
import { SalesMapPage } from "./components/pages/SalesMap";
import { SalesCaseDetailDialog } from "./components/pages/SalesCaseDetail";
import {
  OffersPage, DocumentsPage, PaymentsPage, StockPage, PurchaseOrdersPage,
  ShipmentsPage, InstallationsPage, DeliveriesPage, MachinesPage,
  ServiceRequestsPage, ServiceKanbanPage, ReportsPage, UsersPage, RolesPage, DepartmentsPage,
  SettingsPage,
} from "./components/pages/SimplePages";
import { Customer, SalesCase } from "./lib/mock";
import { StoreProvider, useStore } from "./lib/store";
import { usePersistentState } from "./lib/persist";
import { Toaster } from "./components/ui/sonner";
import { CreateCustomerDialog, CreateCaseDialog, CreateContactDialog, CreateServiceRequestDialog } from "./components/dialogs/CreateDialogs";
import { ProductsPage } from "./components/pages/Operations";
import { SalesPriceListPage, ServicePriceListPage } from "./components/pages/PriceLists";
import { LifecyclePage, PublicPassportPage } from "./components/pages/Lifecycle";
import { AuthProvider, useAuth } from "../lib/auth";
import { FxProvider } from "./lib/fx";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ReadinessBanner } from "./components/ReadinessBanner";
import { StoreLoadBanner } from "./components/shared/StoreLoadBanner";
import { PageLoadingSkeleton } from "./components/shared/PageLoadingSkeleton";

const TITLES: Record<NavKey, { title: string; subtitle?: string }> = {
  dashboard: { title: "Dashboard", subtitle: "Genel performans ve KPI özeti" },
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
  "sales-price-list": { title: "Satış Fiyat Listesi", subtitle: "Tezgahlar ve uyumlu opsiyonel donanım fiyatları" },
  products: { title: "Ürünler", subtitle: "Makine modeline göre ürün kataloğu" },
  stock: { title: "Stok", subtitle: "Seri numarası bazlı stok yönetimi" },
  "purchase-orders": { title: "Satın Alma", subtitle: "Tedarikçi siparişleri" },
  shipments: { title: "Sevkiyat & Lojistik", subtitle: "Gümrük ve nakliye takibi" },
  installations: { title: "Kurulumlar", subtitle: "Saha kurulum operasyonları" },
  deliveries: { title: "Teslimatlar", subtitle: "Müşteri teslim formları" },
  machines: { title: "Makineler / Varlıklar", subtitle: "Müşteriye kurulu makineler ve garanti" },
  lifecycle: { title: "Makine Yaşam Döngüsü", subtitle: "Dijital pasaport, CPQ ve servis radarı" },
  "service-requests": { title: "Servis Talepleri", subtitle: "Servis akışı (satıştan ayrı)" },
  "service-kanban": { title: "Servis Kanban", subtitle: "Servis süreç akışı: talep → form" },
  "service-price-list": { title: "Servis Fiyat Listesi", subtitle: "Yedek parça ve işçilik fiyatları" },
  reports: { title: "Raporlar", subtitle: "Satış, finans, stok ve servis raporları" },
  users: { title: "Kullanıcılar" },
  roles: { title: "Roller & Yetkiler", subtitle: "Rol bazlı izin yönetimi" },
  departments: { title: "Departmanlar" },
  settings: { title: "Ayarlar" },
};

function AppShell() {
  const { authed, loading, login, logout } = useAuth();
  const { customers, cases, loading: storeLoading } = useStore();
  // Yenilemede kullanıcının kaldığı yer korunur (sayfa + seçili firma/satış kartı).
  const [nav, setNav] = usePersistentState<NavKey>("nav", "dashboard");
  const [selectedCustomerId, setSelectedCustomerId] = usePersistentState<string | null>("selectedCustomerId", null);
  const [selectedCaseId, setSelectedCaseId] = usePersistentState<string | null>("selectedCaseId", null);
  const [focus, setFocus] = useState<{ nav: NavKey; focus?: OperationFocus; query?: string } | null>(null);

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
    switch (nav) {
      case "dashboard": content = <DashboardPage onAction={runOperationAction} />; break;
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
      case "sales-price-list": content = <SalesPriceListPage />; break;
      case "products": content = <ProductsPage initialQuery={focus?.nav === "products" ? focus.query : undefined} />; break;
      case "stock": content = <StockPage focus={focus?.nav === "stock" ? focus.focus : undefined} initialQuery={focus?.nav === "stock" ? focus.query : undefined} />; break;
      case "purchase-orders": content = <PurchaseOrdersPage />; break;
      case "shipments": content = <ShipmentsPage focus={focus?.nav === "shipments" ? focus.focus : undefined} />; break;
      case "installations": content = <InstallationsPage />; break;
      case "deliveries": content = <DeliveriesPage />; break;
      case "machines": content = <MachinesPage />; break;
      case "lifecycle": content = <LifecyclePage />; break;
      case "service-requests":
        actions = (
          <CreateServiceRequestDialog
            trigger={<Button className="gap-1"><Plus className="size-4" /> Yeni Talep</Button>}
          />
        );
        content = <ServiceRequestsPage focus={focus?.nav === "service-requests" ? focus.focus : undefined} />;
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

  const t = titleOverride ?? TITLES[nav];

  return (
    <Layout
      current={nav}
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
      <StoreLoadBanner />
      {storeLoading && customers.length === 0 && cases.length === 0 ? (
        <PageLoadingSkeleton />
      ) : (
        <ErrorBoundary>{content}</ErrorBoundary>
      )}
      <SalesCaseDetailDialog sc={selectedCase} onClose={() => setSelectedCaseId(null)} />
    </Layout>
  );
}

export default function App() {
  const publicMatch = typeof window !== "undefined" ? window.location.pathname.match(/^\/p\/([^/]+)\/([^/?#]+)/) : null;
  if (publicMatch) {
    return (
      <>
        <PublicPassportPage slug={decodeURIComponent(publicMatch[1])} token={decodeURIComponent(publicMatch[2])} />
        <Toaster richColors position="top-right" />
      </>
    );
  }

  return (
    <AuthProvider>
      <FxProvider>
        <StoreProvider>
          <AppShell />
          <Toaster richColors position="top-right" />
        </StoreProvider>
      </FxProvider>
    </AuthProvider>
  );
}
