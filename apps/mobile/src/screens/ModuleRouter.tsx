import { getModuleConfig } from '@/src/modules/registry';
import { CalendarScreen } from '@/src/screens/CalendarScreen';
import { ChatScreen } from '@/src/screens/ChatScreen';
import { ChatThreadScreen } from '@/src/screens/ChatThreadScreen';
import { DetailRouter } from '@/src/screens/details/DetailRouter';
import { CompaniesListScreen } from '@/src/screens/CompaniesListScreen';
import { OffersListScreen } from '@/src/screens/OffersListScreen';
import { StockListScreen } from '@/src/screens/StockListScreen';
import { PurchaseOrdersListScreen } from '@/src/screens/PurchaseOrdersListScreen';
import { ShipmentsListScreen } from '@/src/screens/ShipmentsListScreen';
import { ProductsListScreen } from '@/src/screens/ProductsListScreen';
import { InstallationsListScreen } from '@/src/screens/InstallationsListScreen';
import { DeliveriesListScreen } from '@/src/screens/DeliveriesListScreen';
import { SalesCasesListScreen } from '@/src/screens/SalesCasesListScreen';
import { ContactsListScreen } from '@/src/screens/ContactsListScreen';
import { DocumentsListScreen } from '@/src/screens/DocumentsListScreen';
import { PaymentsListScreen } from '@/src/screens/PaymentsListScreen';
import { AccountingInvoicesListScreen } from '@/src/screens/AccountingInvoicesListScreen';
import { MachinesListScreen } from '@/src/screens/MachinesListScreen';
import { ServiceRequestsListScreen } from '@/src/screens/ServiceRequestsListScreen';
import { GenericListScreen } from '@/src/screens/GenericListScreen';
import { KanbanScreen } from '@/src/screens/KanbanScreen';
import { MapScreen } from '@/src/screens/MapScreen';
import { NotificationsScreen } from '@/src/screens/NotificationsScreen';
import { CustomerBalancesScreen, PriceListScreen, ReportsScreen } from '@/src/screens/ReportsScreen';
import { SettingsScreen } from '@/src/screens/SettingsScreen';
import { DueDatesScreen } from '@/src/screens/DueDatesScreen';
import { AdminListScreen } from '@/src/screens/AdminListScreen';
import { EmptyState } from '@/src/ui/EmptyState';
import { Screen } from '@/src/ui/Screen';
import { getModule } from '@/src/navigation/modules';

type Props = { navKey: string; id?: string };

export function ModuleRouter({ navKey, id }: Props) {
  const mod = getModule(navKey);
  const config = getModuleConfig(navKey);

  if (id) {
    if (navKey === 'chat') return <ChatThreadScreen conversationId={id} />;
    return <DetailRouter navKey={navKey} id={id} />;
  }

  switch (config?.kind) {
    case 'kanban':
      if (navKey === 'sales-cases') return <SalesCasesListScreen />;
      return <KanbanScreen navKey={navKey} groupField={navKey === 'service-kanban' ? 'statusCode' : 'stageCode'} />;
    case 'map':
      return <MapScreen />;
    case 'calendar':
      return <CalendarScreen />;
    case 'chat':
      return <ChatScreen />;
    case 'notifications':
      return <NotificationsScreen />;
    case 'reports':
      return <ReportsScreen />;
    case 'settings':
      return <SettingsScreen />;
    case 'balances':
      return <CustomerBalancesScreen />;
    case 'duedates':
      return <DueDatesScreen />;
    case 'pricelist':
      return <PriceListScreen />;
    case 'admin-list':
      return <AdminListScreen navKey={navKey} />;
    case 'list':
      if (navKey === 'customers') return <CompaniesListScreen />;
      if (navKey === 'contacts') return <ContactsListScreen />;
      if (navKey === 'offers') return <OffersListScreen />;
      if (navKey === 'proformas' || navKey === 'contracts' || navKey === 'documents') return <DocumentsListScreen navKey={navKey} />;
      if (navKey === 'stock') return <StockListScreen />;
      if (navKey === 'purchase-orders') return <PurchaseOrdersListScreen />;
      if (navKey === 'products') return <ProductsListScreen />;
      if (navKey === 'payments') return <PaymentsListScreen />;
      if (navKey === 'accounting-invoices') return <AccountingInvoicesListScreen />;
      if (navKey === 'installations') return <InstallationsListScreen />;
      if (navKey === 'shipments') return <ShipmentsListScreen />;
      if (navKey === 'deliveries') return <DeliveriesListScreen />;
      if (navKey === 'machines') return <MachinesListScreen />;
      if (navKey === 'service-requests') return <ServiceRequestsListScreen />;
      return <GenericListScreen navKey={navKey} />;
    default:
      return (
        <Screen>
          <EmptyState title={mod?.label ?? navKey} subtitle="Bu modül henüz yapılandırılmadı" />
        </Screen>
      );
  }
}
