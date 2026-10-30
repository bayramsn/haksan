import { isNavigationAreaEnabled, type NavigationVisibilityKey } from '@haksan/shared';

/** Süreç görevinin açtığı çalışma alanı. Anahtarı olmayan görev fırsatın kendisinde kalır. */
const ACTION_NAV: Record<string, string> = {
  create_quote: 'offers',
  approve_quote: 'offers',
  create_proforma: 'documents',
  create_contract: 'documents',
  create_commercial_invoice: 'documents',
  create_payment_plan: 'payments',
  reserve_stock: 'stock',
  create_shipment: 'shipments',
  complete_shipment: 'shipments',
  open_installation: 'installations',
  complete_installation: 'installations',
};

/**
 * Web SalesCaseDetail `canPerformProcessAction`. Gizli menü alanı herkesi,
 * süper yönetici dahil, kapatır. İzin kontrolü çağıranın `can()` fonksiyonudur.
 */
export function canPerformOpportunityAction(
  actionKey: string,
  input: {
    hasPermission: (permission: string) => boolean;
    isSuperAdmin: boolean;
    hiddenNavigationKeys?: readonly string[] | null;
  },
): boolean {
  const nav = ACTION_NAV[actionKey];
  if (nav && !isNavigationAreaEnabled(nav, input.hiddenNavigationKeys as readonly NavigationVisibilityKey[] | undefined)) {
    return false;
  }
  if (actionKey.startsWith('approve_')) {
    if (actionKey === 'approve_quote') return input.hasPermission('quotes.approve');
    if (actionKey === 'approve_win') return input.isSuperAdmin;
    return input.hasPermission('opportunities.approve');
  }
  if (actionKey === 'create_quote') return input.hasPermission('quotes.create');
  if (actionKey === 'create_proforma') return input.hasPermission('proformas.create');
  if (actionKey === 'create_contract') return input.hasPermission('contracts.create');
  if (actionKey === 'create_commercial_invoice') return input.hasPermission('commercial_invoices.create');
  if (actionKey === 'reserve_stock') return input.hasPermission('inventory.update');
  if (actionKey === 'create_shipment' || actionKey === 'complete_shipment') {
    return input.hasPermission('shipments.create') || input.hasPermission('shipments.update');
  }
  if (actionKey === 'open_installation' || actionKey === 'complete_installation') {
    return input.hasPermission('installations.create') || input.hasPermission('installations.update');
  }
  if (actionKey === 'record_call' || actionKey === 'record_visit') {
    return input.hasPermission('activities.create');
  }
  return input.hasPermission('opportunities.update');
}
