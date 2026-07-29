import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';

export type NavKey =
  | 'dashboard'
  | 'chat'
  | 'calendar'
  | 'notifications'
  | 'call-assistant'
  | 'customers'
  | 'contacts'
  | 'sales-cases'
  | 'sales-map'
  | 'offers'
  | 'proformas'
  | 'contracts'
  | 'documents'
  | 'sales-price-list'
  | 'products'
  | 'stock'
  | 'purchase-orders'
  | 'payments'
  | 'accounting-invoices'
  | 'customer-balances'
  | 'due-dates'
  | 'shipments'
  | 'deliveries'
  | 'installations'
  | 'machines'
  | 'service-requests'
  | 'service-kanban'
  | 'service-price-list'
  | 'reports'
  | 'users'
  | 'roles'
  | 'departments'
  | 'divisions'
  | 'settings';

export type TabGroup = 'home' | 'sales' | 'operations' | 'service' | 'more';

export type MobileModule = {
  key: NavKey;
  label: string;
  group: TabGroup;
  icon: ComponentProps<typeof Ionicons>['name'];
  stitchScreenId?: string;
  roles?: string[];
  adminOnly?: boolean;
};

/** Stitch project 5470261679107716920 — `docs/stitch-screens.md` */
export const MOBILE_MODULES: MobileModule[] = [
  { key: 'dashboard', label: 'Gösterge Paneli', group: 'home', icon: 'grid-outline', stitchScreenId: '91f83c94ae8044cb867284b3a21aaeb3' },
  { key: 'notifications', label: 'Bildirimler', group: 'home', icon: 'notifications-outline', stitchScreenId: '176b14a5f4494a1c9fda2a2e9cbbb09e' },
  { key: 'calendar', label: 'Takvim', group: 'home', icon: 'calendar-outline', stitchScreenId: '4774acd7377d466ba1375c82d3b902c3' },
  { key: 'chat', label: 'Sohbet', group: 'home', icon: 'chatbubbles-outline', stitchScreenId: '20e9867b31b94036b5d18145cbcb340d' },
  { key: 'call-assistant', label: 'Çağrı Asistanı', group: 'home', icon: 'call-outline', roles: ['sales', 'service', 'finance'] },
  { key: 'customers', label: 'Firmalar', group: 'sales', icon: 'business-outline', stitchScreenId: '97f60630c8ea490884fbd3e5d4a8b98d', roles: ['sales', 'finance'] },
  { key: 'contacts', label: 'Kontaklar', group: 'sales', icon: 'people-outline', stitchScreenId: 'cc4d0dd86ff44d15a4d91ee39a6edcb2', roles: ['sales'] },
  { key: 'sales-cases', label: 'Satış Kartları', group: 'sales', icon: 'briefcase-outline', stitchScreenId: 'e0417d17b4494b689a8a7ce4f90c3ce9', roles: ['sales'] },
  { key: 'sales-map', label: 'Firma Haritası', group: 'sales', icon: 'map-outline', stitchScreenId: '233c28eb0f214df2a92e45e37c1331be', roles: ['sales', 'service'] },
  { key: 'offers', label: 'Teklifler', group: 'sales', icon: 'document-text-outline', stitchScreenId: '967defac0e8a4b9c81ad0fae8ec76f0c', roles: ['sales', 'finance'] },
  { key: 'proformas', label: 'Proformalar', group: 'sales', icon: 'document-outline', stitchScreenId: '1639d10a6abe4318b740ea99e490bb9f', roles: ['sales', 'finance'] },
  { key: 'contracts', label: 'Sözleşmeler', group: 'sales', icon: 'reader-outline', stitchScreenId: '2c5f087b46154a3aadf41d171bc8741e', roles: ['sales', 'finance'] },
  { key: 'documents', label: 'Dokümanlar', group: 'sales', icon: 'folder-open-outline', stitchScreenId: '1639d10a6abe4318b740ea99e490bb9f', roles: ['sales', 'finance'] },
  { key: 'sales-price-list', label: 'Satış Fiyat Listesi', group: 'sales', icon: 'pricetag-outline', stitchScreenId: '0de944310e76433eac2f1cd35e13b547', roles: ['sales'] },
  { key: 'products', label: 'Ürünler', group: 'operations', icon: 'cube-outline', stitchScreenId: '0c1948c4002f4940a277c4856ef19e11', roles: ['sales', 'service', 'stock'] },
  { key: 'stock', label: 'Stok', group: 'operations', icon: 'layers-outline', stitchScreenId: '56f23455b6f6494bb117eed2b12acb27', roles: ['stock'] },
  { key: 'purchase-orders', label: 'Satın Alma', group: 'operations', icon: 'cart-outline', stitchScreenId: '8f55046fd9104417b318c27f3f337340', roles: ['stock', 'finance'] },
  { key: 'payments', label: 'Ödemeler & Kasa', group: 'operations', icon: 'card-outline', stitchScreenId: '2d0bb69b8f37493bb75d039e4d186589', roles: ['finance'] },
  { key: 'accounting-invoices', label: 'Muhasebe Faturaları', group: 'operations', icon: 'receipt-outline', stitchScreenId: '08d2ed1465794d809fd2e61492172b27', roles: ['finance', 'sales'] },
  { key: 'customer-balances', label: 'Cari Rapor', group: 'operations', icon: 'wallet-outline', stitchScreenId: '0880532884174e46ab348e080f6a5072', roles: ['finance'] },
  { key: 'due-dates', label: 'Vade Takvimi', group: 'operations', icon: 'time-outline', stitchScreenId: '5f5fcbec93be47bfa1df623e5f694788', roles: ['finance'] },
  { key: 'shipments', label: 'Sevkiyat', group: 'operations', icon: 'airplane-outline', stitchScreenId: 'c6314a6177fb4bf89f53bf83384513e9', roles: ['stock'] },
  { key: 'deliveries', label: 'Teslimat', group: 'operations', icon: 'gift-outline', stitchScreenId: 'dbb9fd3a3dd644aa8259e1e6f09aa03c', roles: ['stock', 'service'] },
  { key: 'installations', label: 'Kurulum', group: 'operations', icon: 'construct-outline', stitchScreenId: 'be97fe6edd78452caef41f9d8191139f', roles: ['service'] },
  { key: 'machines', label: 'Makineler', group: 'service', icon: 'hardware-chip-outline', stitchScreenId: '5a449b07b93f495e96b75fcbe82808ea', roles: ['service', 'stock'] },
  { key: 'service-requests', label: 'Servis Talepleri', group: 'service', icon: 'medkit-outline', stitchScreenId: '8d84b0d695cc4130acafcd7ab6bd5362', roles: ['service'] },
  { key: 'service-kanban', label: 'Servis Kanban', group: 'service', icon: 'albums-outline', stitchScreenId: '8fb2a69578fd49dc9ec86205fdbd4a13', roles: ['service'] },
  { key: 'service-price-list', label: 'Servis Fiyat Listesi', group: 'service', icon: 'list-outline', stitchScreenId: '022fa7ebd7374833a1154b7801b11a4c', roles: ['service'] },
  { key: 'reports', label: 'Raporlar', group: 'more', icon: 'stats-chart-outline', stitchScreenId: 'de01a6c9464143c5a01a4353bc151ff9', adminOnly: true },
  { key: 'users', label: 'Kullanıcılar', group: 'more', icon: 'person-outline', stitchScreenId: 'bfa5fc637de945dabea006a5ed7ae18a', adminOnly: true },
  { key: 'roles', label: 'Roller & Yetkiler', group: 'more', icon: 'shield-outline', adminOnly: true },
  { key: 'departments', label: 'Departmanlar', group: 'more', icon: 'git-network-outline', adminOnly: true },
  { key: 'divisions', label: 'Bölümler', group: 'more', icon: 'business-outline', adminOnly: true },
  { key: 'settings', label: 'Ayarlar', group: 'more', icon: 'settings-outline', stitchScreenId: 'be0e94bc236f4625b741588e944c975f' },
];

export function canSeeModule(mod: MobileModule, hasRole: (r: string) => boolean): boolean {
  if (mod.adminOnly) return hasRole('admin') || hasRole('super_admin');
  if (!mod.roles?.length) return true;
  if (hasRole('admin') || hasRole('super_admin')) return true;
  return mod.roles.some((r) => hasRole(r));
}

export function modulesForGroup(group: TabGroup, hasRole: (r: string) => boolean): MobileModule[] {
  return MOBILE_MODULES.filter((m) => m.group === group && m.key !== 'dashboard' && canSeeModule(m, hasRole));
}

export function getModule(key: string): MobileModule | undefined {
  return MOBILE_MODULES.find((m) => m.key === key);
}
