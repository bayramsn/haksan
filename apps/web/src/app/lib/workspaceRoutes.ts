import type { NavKey } from "../components/Layout";

const pagePaths = {
  dashboard: "gosterge-paneli",
  chat: "sohbet",
  calendar: "takvim",
  tasks: "gorevler",
  "trade-fairs": "fuarlar",
  customers: "firmalar",
  contacts: "kontaklar",
  "sales-cases": "firsatlar",
  meta: "meta",
  kanban: "firsat-panosu",
  "sales-map": "firma-haritasi",
  offers: "teklifler",
  documents: "ticari-belgeler",
  payments: "odemeler",
  "accounting-invoices": "muhasebe-faturalari",
  "customer-balances": "cari-rapor",
  "due-dates": "vade-takvimi",
  "sales-price-list": "satis-fiyat-listesi",
  references: "referanslar",
  products: "urunler",
  stock: "stok",
  shipments: "sevkiyat",
  installations: "kurulumlar",
  machines: "makineler",
  "service-requests": "servis-talepleri",
  "service-kanban": "servis-panosu",
  "service-price-list": "servis-fiyat-listesi",
  reports: "raporlar",
  users: "kullanicilar",
  roles: "roller",
  departments: "departmanlar",
  settings: "ayarlar",
} satisfies Record<Exclude<NavKey, "proformas" | "contracts" | "deliveries" | "purchase-orders">, string>;

export type WorkspacePage = keyof typeof pagePaths;
export type WorkspaceDetailPage = "customers" | "offers" | "service-requests" | "service-kanban";
export type WorkspaceRoute =
  | { page: WorkspacePage; recordId?: undefined }
  | { page: WorkspaceDetailPage; recordId: string };

const pagesByPath = new Map(Object.entries(pagePaths).map(([pathKey, slug]) => [slug, pathKey as WorkspacePage]));
const recordIdPattern = /^[a-zA-Z0-9_-]{1,128}$/;

export function workspacePage(value: unknown): WorkspacePage | null {
  if (value === "proformas" || value === "contracts") return "documents";
  if (value === "deliveries") return "installations";
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(pagePaths, value) ? value as WorkspacePage : null;
}

function isDetailPage(page: WorkspacePage): page is WorkspaceDetailPage {
  return page === "customers" || page === "offers" || page === "service-requests" || page === "service-kanban";
}

export function parseWorkspacePath(pathname: string): WorkspaceRoute | null {
  const match = /^\/([^/]+)(?:\/([^/]+))?\/?$/.exec(pathname);
  if (!match) return null;
  try {
    const slug = decodeURIComponent(match[1]);
    const page = pagesByPath.get(slug === "göstergepaneli" ? "gosterge-paneli" : slug);
    if (!page) return null;
    if (!match[2]) return { page };
    const recordId = decodeURIComponent(match[2]);
    return isDetailPage(page) && recordIdPattern.test(recordId) ? { page, recordId } : null;
  } catch {
    return null;
  }
}

export function workspacePath(route: WorkspaceRoute): string {
  const pagePath = `/${pagePaths[route.page]}`;
  return route.recordId ? `${pagePath}/${encodeURIComponent(route.recordId)}` : pagePath;
}
