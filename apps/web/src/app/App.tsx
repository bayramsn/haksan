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
import { SalesCaseDetailDialog } from "./components/pages/SalesCaseDetail";
import {
  OffersPage, DocumentsPage, PaymentsPage, StockPage, PurchaseOrdersPage,
  ShipmentsPage, InstallationsPage, DeliveriesPage, MachinesPage,
  ServiceRequestsPage, ServiceKanbanPage, ReportsPage, UsersPage, RolesPage, DepartmentsPage,
  SettingsPage,
} from "./components/pages/SimplePages";
import { Customer, SalesCase } from "./lib/mock";
import { StoreProvider } from "./lib/store";
import { Toaster } from "./components/ui/sonner";
import { CreateCustomerDialog, CreateCaseDialog, CreateContactDialog, CreateServiceRequestDialog } from "./components/dialogs/CreateDialogs";
import { ProductsPage } from "./components/pages/Operations";
import { SalesPriceListPage, ServicePriceListPage } from "./components/pages/PriceLists";
import { AuthProvider, useAuth } from "../lib/auth";

const TITLES: Record<NavKey, { title: string; subtitle?: string }> = {
  dashboard: { title: "Dashboard", subtitle: "Genel performans ve KPI özeti" },
  customers: { title: "Firmalar", subtitle: "Müşteri, tedarikçi+müşteri ve tedarikçi kayıtları" },
  contacts: { title: "Kontaklar", subtitle: "Firmalara bağlı kişiler" },
  "sales-cases": { title: "Satış Kartları", subtitle: "Tüm satış fırsatları" },
  kanban: { title: "Satış Kartları", subtitle: "Kanban görünümü" },
  offers: { title: "Teklifler", subtitle: "Hazırlanmış ve gönderilmiş teklifler" },
  documents: { title: "Dokümanlar", subtitle: "Proforma, sözleşme, fatura ve kurulum belgeleri" },
  payments: { title: "Ödemeler & Cari", subtitle: "Tahsilat takibi ve gecikme yönetimi" },
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

function AppShell() {
  const { authed, loading, login, logout } = useAuth();
  const [nav, setNav] = useState<NavKey>("dashboard");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedCase, setSelectedCase] = useState<SalesCase | null>(null);

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center text-muted-foreground">
        Yükleniyor…
      </div>
    );
  }

  if (!authed) {
    return <LoginPage onLogin={async (email, password) => { await login(email, password); }} />;
  }

  const goto = (k: NavKey) => {
    setSelectedCustomer(null);
    setSelectedCase(null);
    setNav(k);
  };

  let content: React.ReactNode;
  let actions: React.ReactNode = null;
  let titleOverride: { title: string; subtitle?: string } | null = null;

  if (selectedCustomer) {
    titleOverride = { title: selectedCustomer.name, subtitle: "Müşteri detayı" };
    content = <CustomerDetailPage customer={selectedCustomer} onBack={() => setSelectedCustomer(null)} />;
  } else {
    switch (nav) {
      case "dashboard": content = <DashboardPage />; break;
      case "customers":
        actions = (
          <CreateCustomerDialog
            trigger={<Button className="gap-1"><Plus className="size-4" /> Yeni Firma</Button>}
          />
        );
        content = <CustomersPage onSelect={setSelectedCustomer} />;
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
        content = <SalesCasesPage onSelect={setSelectedCase} />;
        break;
      case "kanban":
        actions = (
          <CreateCaseDialog
            trigger={<Button className="gap-1"><Plus className="size-4" /> Yeni Kart</Button>}
          />
        );
        content = <SalesCasesPage onSelect={setSelectedCase} initialView="kanban" />;
        break;
      case "offers": content = <OffersPage />; break;
      case "documents": content = <DocumentsPage />; break;
      case "payments": content = <PaymentsPage />; break;
      case "sales-price-list": content = <SalesPriceListPage />; break;
      case "products": content = <ProductsPage />; break;
      case "stock": content = <StockPage />; break;
      case "purchase-orders": content = <PurchaseOrdersPage />; break;
      case "shipments": content = <ShipmentsPage />; break;
      case "installations": content = <InstallationsPage />; break;
      case "deliveries": content = <DeliveriesPage />; break;
      case "machines": content = <MachinesPage />; break;
      case "service-requests":
        actions = (
          <CreateServiceRequestDialog
            trigger={<Button className="gap-1"><Plus className="size-4" /> Yeni Talep</Button>}
          />
        );
        content = <ServiceRequestsPage />;
        break;
      case "service-kanban":
        actions = (
          <CreateServiceRequestDialog
            trigger={<Button className="gap-1"><Plus className="size-4" /> Yeni Talep</Button>}
          />
        );
        content = <ServiceKanbanPage />;
        break;
      case "service-price-list": content = <ServicePriceListPage />; break;
      case "reports": content = <ReportsPage />; break;
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
      onSelectFirm={(c) => { setSelectedCase(null); setSelectedCustomer(c); }}
      pageTitle={t.title}
      pageSubtitle={t.subtitle}
      actions={actions}
    >
      {content}
      <SalesCaseDetailDialog sc={selectedCase} onClose={() => setSelectedCase(null)} />
    </Layout>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <StoreProvider>
        <AppShell />
        <Toaster richColors position="top-right" />
      </StoreProvider>
    </AuthProvider>
  );
}
