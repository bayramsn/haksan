export const SCOPE_RESOURCE_LABELS: Record<string, string> = {
  companies: 'Firmalar', contacts: 'Kontaklar', opportunities: 'Fırsatlar', quotes: 'Teklifler',
  proformas: 'Proformalar', contracts: 'Sözleşmeler', service_tickets: 'Servis talepleri',
  tasks: 'Görevler', activities: 'Aktiviteler', products: 'Ürünler', inventory: 'Stok',
  payments: 'Ödemeler', receivables: 'Alacaklar', calendar: 'Takvim', shipments: 'Sevkiyatlar',
  sales_orders: 'Satış siparişleri', purchase_orders: 'Satın alma', reports: 'Raporlar',
};
export function scopeResourceForPath(pathname: string): string | null {
  const key = pathname.match(/\/modules\/([^/]+)/)?.[1] ?? pathname.match(/^\/(companies|opportunities|calendar)(?:\/|$)/)?.[1];
  if (!key) return null;
  const aliases: Record<string, string> = { 'company-map': 'companies', kanban: 'opportunities', 'service-kanban': 'service_tickets', 'customer-devices': 'service_tickets', 'due-dates': 'payments', balances: 'payments', 'commercial-invoices': 'commercial_invoices' };
  return aliases[key] ?? key.replace(/-/g, '_');
}
