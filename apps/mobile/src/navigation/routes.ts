/**
 * Modül anahtarı → Menü stack'indeki adanmış route adı. Burada olmayan
 * anahtarlar generic 'Module' (placeholder) route'una gider. Her faz gerçek
 * ekranını yazdıkça buraya kaydını ekler.
 */
export const ROUTE_BY_KEY: Record<string, string> = {
  customers: 'Companies',
  contacts: 'Contacts',
};
