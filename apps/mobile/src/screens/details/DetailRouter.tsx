import { GenericDetailScreen } from '@/src/screens/GenericDetailScreen';
import { CompanyDetailScreen } from './CompanyDetailScreen';
import { OfferDetailScreen } from './OfferDetailScreen';
import { SalesCaseDetailScreen } from './SalesCaseDetailScreen';
import { PurchaseOrderDetailScreen } from './PurchaseOrderDetailScreen';
import { ShipmentDetailScreen } from './ShipmentDetailScreen';
import { DeliveryDetailScreen } from './DeliveryDetailScreen';
import { InstallationDetailScreen } from './InstallationDetailScreen';
import { StockDetailScreen } from './StockDetailScreen';
import { ProductDetailScreen } from './ProductDetailScreen';
import { RichDetailScreen } from './RichDetailScreen';
import { ContactDetailScreen } from './ContactDetailScreen';
import { ServiceRequestDetailScreen } from './ServiceRequestDetailScreen';
import { MachineDetailScreen } from './MachineDetailScreen';
import { DocumentDetailScreen } from './DocumentDetailScreen';
import { PaymentDetailScreen } from './PaymentDetailScreen';
import { AccountingInvoiceDetailScreen } from './AccountingInvoiceDetailScreen';

const RICH_KEYS = new Set<string>([]);

type Props = { navKey: string; id: string };

export function DetailRouter({ navKey, id }: Props) {
  if (navKey === 'customers') return <CompanyDetailScreen id={id} />;
  if (navKey === 'offers') return <OfferDetailScreen id={id} />;
  if (navKey === 'sales-cases') return <SalesCaseDetailScreen id={id} />;
  if (navKey === 'stock') return <StockDetailScreen id={id} />;
  if (navKey === 'products') return <ProductDetailScreen id={id} />;
  if (navKey === 'purchase-orders') return <PurchaseOrderDetailScreen id={id} />;
  if (navKey === 'shipments') return <ShipmentDetailScreen id={id} />;
  if (navKey === 'deliveries') return <DeliveryDetailScreen id={id} />;
  if (navKey === 'installations') return <InstallationDetailScreen id={id} />;
  if (navKey === 'machines') return <MachineDetailScreen id={id} />;
  if (navKey === 'proformas' || navKey === 'contracts' || navKey === 'documents') {
    return <DocumentDetailScreen navKey={navKey} id={id} />;
  }
  if (navKey === 'payments') return <PaymentDetailScreen id={id} />;
  if (navKey === 'accounting-invoices') return <AccountingInvoiceDetailScreen id={id} />;
  if (navKey === 'contacts') return <ContactDetailScreen id={id} />;
  if (navKey === 'service-requests' || navKey === 'service-kanban') return <ServiceRequestDetailScreen id={id} />;
  if (RICH_KEYS.has(navKey)) return <RichDetailScreen navKey={navKey} id={id} />;
  return <GenericDetailScreen navKey={navKey} id={id} />;
}
