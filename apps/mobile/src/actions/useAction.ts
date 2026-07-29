import { useMemo } from 'react';
import { router } from 'expo-router';
import { useAuth } from '@/src/auth/AuthProvider';

export type ActionDef = {
  roles?: string[];
  route?: string;
  permissions?: string[];
};

/** Mobil aksiyon kaydı — web parite tablosu ile hizalanır */
export const MOBILE_ACTIONS: Record<string, ActionDef> = {
  'company.create': { roles: ['sales', 'finance'], route: '/forms/company' },
  'company.update': { roles: ['sales', 'finance'], route: '/forms/company' },
  'contact.create': { roles: ['sales'], route: '/forms/contact' },
  'contact.update': { roles: ['sales'], route: '/forms/contact' },
  'opportunity.update': { roles: ['sales'], route: '/forms/opportunity' },
  'offer.create': { roles: ['sales', 'finance'], route: '/forms/offer' },
  'opportunity.create': { roles: ['sales'], route: '/forms/opportunity' },
  'service.create': { roles: ['service'], route: '/forms/service-ticket' },
  'service.complete': { roles: ['service'], route: '/forms/service-complete' },
  'visit.create': { roles: ['sales'], route: '/forms/visit' },
  'machine.create': { roles: ['service', 'stock'], route: '/forms/machine' },
  'purchaseOrder.create': { roles: ['stock', 'finance'], route: '/forms/purchase-order' },
  'payment.create': { roles: ['finance'], route: '/forms/payment' },
  'calendar.create': { roles: ['sales', 'service'], route: '/forms/calendar-event' },
  'offer.downloadPdf': { roles: ['sales', 'finance'] },
};

export function useAction(key: string) {
  const { hasRole, user } = useAuth();
  const def = MOBILE_ACTIONS[key];

  const visible = useMemo(() => {
    if (!def) return false;
    if (!def.roles?.length) return true;
    return def.roles.some((r) => hasRole(r));
  }, [def, hasRole]);

  const enabled = visible && !!user;

  const run = (params?: Record<string, string>) => {
    if (!def?.route) return;
    const qs = params
      ? `?${Object.entries(params)
          .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
          .join('&')}`
      : '';
    router.push(`${def.route}${qs}` as never);
  };

  return { visible, enabled, run, def };
}
