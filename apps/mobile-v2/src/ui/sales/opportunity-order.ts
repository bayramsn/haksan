/**
 * Detaydaki önceki/sonraki geçişi için son görüntülenen liste/pano sırası.
 * Bellekte tutulur; uygulama yeniden açılınca boşalır ve geçiş düğmeleri gizlenir.
 */
let order: string[] = [];

export function setOpportunityOrder(ids: string[]): void {
  order = ids.slice(0, 2000);
}

export function getOpportunityOrder(): string[] {
  return order;
}
