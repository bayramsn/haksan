import type { NavKey } from '@/src/navigation/modules';

/** Modül listelerinde FAB ile açılan oluşturma rotaları */
export const MODULE_CREATE_ROUTES: Partial<Record<NavKey, string>> = {
  customers: '/forms/company',
  contacts: '/forms/contact',
  offers: '/forms/offer',
  'sales-cases': '/forms/opportunity',
  'service-requests': '/forms/service-ticket',
  'service-kanban': '/forms/service-ticket',
  machines: '/forms/machine',
  'purchase-orders': '/forms/purchase-order',
  payments: '/forms/payment',
  calendar: '/forms/calendar-event',
};

export function getCreateRoute(navKey: string): string | undefined {
  return MODULE_CREATE_ROUTES[navKey as NavKey];
}
