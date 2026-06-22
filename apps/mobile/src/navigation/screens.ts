import type React from 'react';

/**
 * Modül anahtarı → ekran bileşeni kayıt defteri. Her faz, gerçek ekranı
 * yazdıkça buraya kaydını ekler. Burada olmayan anahtarlar PlaceholderScreen
 * gösterir. (Phase 1: customers/contacts, Phase 2: offers/sales-cases, …)
 */
export const SCREEN_REGISTRY: Record<string, React.ComponentType<any>> = {
  // örn. customers: CompaniesScreen,
};
