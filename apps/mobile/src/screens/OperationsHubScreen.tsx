import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet } from 'react-native';
import { router, useSegments } from 'expo-router';
import {
  inventoryService,
  notificationService,
  productService,
  purchaseOrderService,
  reportService,
  serviceService,
} from '@/src/api/services';
import { canSeeModule, getModule, modulesForGroup, type NavKey } from '@/src/navigation/modules';
import { normalizeList } from '@/src/modules/registry';
import { useAuth } from '@/src/auth/AuthProvider';
import { Screen } from '@/src/ui/Screen';
import {
  formatOpsDateLabel,
  OperationsAlertsSection,
  OperationsDailySummary,
  OperationsHubHeader,
  OperationsQuickAccess,
  OperationsTodaySection,
  type OpsAlert,
  type OpsQuickTile,
  type OpsTodayItem,
} from '@/src/ui/operations/OperationsHubWidgets';
import { colors, layout, spacing } from '@/src/theme/tokens';

const QUICK_TILE_DEFS: Omit<OpsQuickTile, 'subtitle' | 'alertDot'>[] = [
  { key: 'stock', label: 'Stok', icon: 'layers-outline' },
  { key: 'products', label: 'Ürünler', icon: 'settings-outline' },
  { key: 'purchase-orders', label: 'Satın Alma', icon: 'cart-outline' },
  { key: 'shipments', label: 'Sevkiyat', icon: 'airplane-outline' },
  { key: 'deliveries', label: 'Teslimat', icon: 'cube-outline' },
  { key: 'installations', label: 'Kurulum', icon: 'construct-outline' },
];

type HubData = {
  pendingShipments: number;
  activeInstallations: number;
  stockAlerts: number;
  stockTotal: number;
  productTotal: number;
  purchaseTotal: number;
  deliveryInTransit: number;
  notificationCount: number;
  todayItems: OpsTodayItem[];
  alerts: OpsAlert[];
  quickTiles: OpsQuickTile[];
};

function paginatedTotal(res: { meta?: { total?: number }; data?: unknown[] } | unknown[]): number {
  if (Array.isArray(res)) return res.length;
  return res.meta?.total ?? (Array.isArray(res.data) ? res.data.length : 0);
}

/** `unknown` bir değerin iç alanını güvenle okur — API satırları Record<string, unknown> olduğundan `row.status?.code` tip hatası verir. */
function nestedValue(value: unknown, key: string): unknown {
  return value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined;
}

function companyLabel(row: Record<string, unknown>): string {
  const company = row.company as Record<string, unknown> | undefined;
  return String(company?.shortName ?? company?.legalTitle ?? '—');
}

function isPendingShipment(row: Record<string, unknown>): boolean {
  const code = String(row.statusCode ?? nestedValue(row.status, 'code') ?? '').toLowerCase();
  return !['delivered', 'completed', 'shipped', 'cancelled'].includes(code);
}

function isActiveInstallation(row: Record<string, unknown>): boolean {
  const code = String(row.statusCode ?? nestedValue(row.status, 'code') ?? '').toLowerCase();
  return !['completed', 'cancelled', 'done'].includes(code);
}

function isInTransitDelivery(row: Record<string, unknown>): boolean {
  const status = String(row.status ?? row.statusCode ?? '').toLowerCase();
  return status === 'pending' || status === 'in_transit' || status === 'in-progress';
}

function parseTimeFromRow(row: Record<string, unknown>, fields: string[]): Date | null {
  for (const field of fields) {
    const raw = row[field];
    if (!raw) continue;
    const d = new Date(String(raw));
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function shipmentStatus(row: Record<string, unknown>): { label: string; tone: OpsTodayItem['statusTone'] } {
  const code = String(row.statusCode ?? nestedValue(row.status, 'code') ?? '').toLowerCase();
  if (['loaded', 'shipped', 'delivered', 'completed'].includes(code)) {
    return { label: 'Yüklendi', tone: 'success' };
  }
  if (['in_progress', 'loading', 'processing'].includes(code)) {
    return { label: 'Devam ediyor', tone: 'warning' };
  }
  if (['planned', 'scheduled'].includes(code)) {
    return { label: 'Plan', tone: 'plan' };
  }
  return { label: 'Beklemede', tone: 'neutral' };
}

function installationStatus(row: Record<string, unknown>): { label: string; tone: OpsTodayItem['statusTone'] } {
  const code = String(row.statusCode ?? nestedValue(row.status, 'code') ?? '').toLowerCase();
  if (['in_progress', 'active'].includes(code)) return { label: 'Devam ediyor', tone: 'warning' };
  if (['completed', 'done'].includes(code)) return { label: 'Yüklendi', tone: 'success' };
  return { label: 'Beklemede', tone: 'neutral' };
}

function deliveryStatus(row: Record<string, unknown>): { label: string; tone: OpsTodayItem['statusTone'] } {
  const status = String(row.status ?? row.statusCode ?? '').toLowerCase();
  if (status === 'completed') return { label: 'Yüklendi', tone: 'success' };
  if (status === 'pending') return { label: 'Beklemede', tone: 'neutral' };
  return { label: 'Devam ediyor', tone: 'warning' };
}

function buildTodayItems(
  shipments: Record<string, unknown>[],
  installations: Record<string, unknown>[],
  deliveries: Record<string, unknown>[]
): OpsTodayItem[] {
  const today = new Date();
  const items: OpsTodayItem[] = [];

  for (const row of shipments) {
    const when = parseTimeFromRow(row, ['plannedAt', 'scheduledAt', 'createdAt', 'updatedAt']);
    if (when && !isSameDay(when, today)) continue;
    const status = shipmentStatus(row);
    items.push({
      id: `shp-${String(row.id)}`,
      time: when ? when.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '—',
      title: `Sevkiyat ${String(row.documentNo ?? row.code ?? row.id ?? '').slice(0, 12)}`,
      subtitle: companyLabel(row),
      statusLabel: status.label,
      statusTone: status.tone,
      route: row.id ? `/modules/shipments/${String(row.id)}` : '/modules/shipments',
    });
  }

  for (const row of installations) {
    const when = parseTimeFromRow(row, ['installationDate', 'scheduledAt', 'createdAt']);
    if (when && !isSameDay(when, today)) continue;
    const status = installationStatus(row);
    items.push({
      id: `ins-${String(row.id)}`,
      time: when ? when.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '—',
      title: `Kurulum ${String(row.code ?? row.documentNo ?? row.id ?? '').slice(0, 12)}`,
      subtitle: companyLabel(row),
      statusLabel: status.label,
      statusTone: status.tone,
      route: row.id ? `/modules/installations/${String(row.id)}` : '/modules/installations',
    });
  }

  for (const row of deliveries) {
    const when = parseTimeFromRow(row, ['deliveryDate', 'scheduledAt', 'createdAt']);
    if (when && !isSameDay(when, today)) continue;
    const status = deliveryStatus(row);
    items.push({
      id: `dlv-${String(row.id)}`,
      time: when ? when.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '—',
      title: `Teslimat ${String(row.documentNo ?? row.code ?? row.id ?? '').slice(0, 12)}`,
      subtitle: companyLabel(row),
      statusLabel: status.label,
      statusTone: status.tone,
      route: row.id ? `/modules/deliveries/${String(row.id)}` : '/modules/deliveries',
    });
  }

  return items
    .sort((a, b) => a.time.localeCompare(b.time))
    .slice(0, 6);
}

function buildFallbackTodayItems(
  shipments: Record<string, unknown>[],
  installations: Record<string, unknown>[],
  deliveries: Record<string, unknown>[]
): OpsTodayItem[] {
  const pool = [
    ...shipments.slice(0, 2).map((row) => ({ kind: 'shipment' as const, row })),
    ...installations.slice(0, 1).map((row) => ({ kind: 'installation' as const, row })),
    ...deliveries.slice(0, 1).map((row) => ({ kind: 'delivery' as const, row })),
  ];

  return pool.map(({ kind, row }, index) => {
    const when = parseTimeFromRow(row, ['plannedAt', 'installationDate', 'deliveryDate', 'createdAt']);
    const status =
      kind === 'shipment'
        ? shipmentStatus(row)
        : kind === 'installation'
          ? installationStatus(row)
          : deliveryStatus(row);
    const prefix = kind === 'shipment' ? 'Sevkiyat' : kind === 'installation' ? 'Kurulum' : 'Teslimat';
    return {
      id: `fb-${kind}-${String(row.id ?? index)}`,
      time: when ? when.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '—',
      title: `${prefix} ${String(row.documentNo ?? row.code ?? row.id ?? '').slice(0, 12)}`,
      subtitle: companyLabel(row),
      statusLabel: status.label,
      statusTone: status.tone,
      route:
        kind === 'shipment'
          ? row.id
            ? `/modules/shipments/${String(row.id)}`
            : '/modules/shipments'
          : kind === 'installation'
            ? row.id
              ? `/modules/installations/${String(row.id)}`
              : '/modules/installations'
            : row.id
              ? `/modules/deliveries/${String(row.id)}`
              : '/modules/deliveries',
    };
  });
}

function buildAlerts(
  stockRows: Record<string, unknown>[],
  shipments: Record<string, unknown>[]
): OpsAlert[] {
  const alerts: OpsAlert[] = [];
  const now = Date.now();

  for (const [i, row] of stockRows.slice(0, 3).entries()) {
    const name = String(row.name ?? nestedValue(row.productModel, 'name') ?? row.serialNumber ?? 'Stok kalemi');
    const qty = Number(row.quantity ?? row.qty ?? 0);
    if (qty <= 5) {
      const highlight = `(${qty} adet kaldı)`;
      const idPart = row.id ?? row.serialNumber ?? row.sku ?? `row-${i}`;
      alerts.push({
        id: `stock-${String(idPart)}-${i}`,
        message: `Stok kritik seviyede: ${name} ${highlight}`,
        highlight,
      });
    }
  }

  for (const [i, row] of shipments.entries()) {
    const planned = parseTimeFromRow(row, ['plannedAt', 'scheduledAt', 'dueDate']);
    if (!planned || !isPendingShipment(row)) continue;
    const daysLate = Math.floor((now - planned.getTime()) / 86400000);
    if (daysLate >= 2) {
      const idPart = row.id ?? row.documentNo ?? row.code ?? `row-${i}`;
      alerts.push({
        id: `late-${String(idPart)}-${i}`,
        message: `${String(row.documentNo ?? row.code ?? 'Sevkiyat')} sevkiyatı ${daysLate} gün gecikti`,
      });
    }
  }

  return alerts.slice(0, 4);
}

type Props = {
  isTabRoot?: boolean;
};

function canAccess(key: NavKey, hasRole: (code: string) => boolean): boolean {
  const mod = getModule(key);
  return mod ? canSeeModule(mod, hasRole) : false;
}

/** Stitch Operasyon Hub — `59dda0b65eb34257a78da299cdb1ca5f` */
export function OperationsHubScreen({ isTabRoot }: Props = {}) {
  const { hasRole } = useAuth();
  const segments: readonly string[] = useSegments();
  const tabRoot = isTabRoot ?? (segments[0] === '(tabs)' && segments[1] === 'operations');

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<HubData | null>(null);

  const load = useCallback(async () => {
    const allowedKeys = new Set(
      modulesForGroup('operations', hasRole).map((m) => m.key)
    );

    const [
      stockRes,
      productRes,
      purchaseRes,
      shipmentRes,
      deliveryRes,
      installationRes,
      notifRes,
      stockSummary,
    ] = await Promise.all([
      canAccess('stock', hasRole)
        ? inventoryService.list({ pageSize: 100 }).catch(() => ({ data: [], meta: { total: 0 } }))
        : Promise.resolve({ data: [], meta: { total: 0 } }),
      canAccess('products', hasRole)
        ? productService.list({ pageSize: 1 }).catch(() => ({ data: [], meta: { total: 0 } }))
        : Promise.resolve({ data: [], meta: { total: 0 } }),
      canAccess('purchase-orders', hasRole)
        ? purchaseOrderService.list({ pageSize: 1 }).catch(() => ({ data: [], meta: { total: 0 } }))
        : Promise.resolve({ data: [], meta: { total: 0 } }),
      canAccess('shipments', hasRole)
        ? serviceService.shipments({ pageSize: 50 }).catch(() => ({ data: [], meta: { total: 0 } }))
        : Promise.resolve({ data: [], meta: { total: 0 } }),
      canAccess('deliveries', hasRole)
        ? serviceService.deliveries({ pageSize: 50 }).catch(() => ({ data: [], meta: { total: 0 } }))
        : Promise.resolve({ data: [], meta: { total: 0 } }),
      canAccess('installations', hasRole)
        ? serviceService.installations({ pageSize: 50 }).catch(() => ({ data: [], meta: { total: 0 } }))
        : Promise.resolve({ data: [], meta: { total: 0 } }),
      notificationService.list({ unread: true, pageSize: 1 }).catch(() => ({ meta: { total: 0 } })),
      reportService.stockSummary().catch(() => []),
    ]);

    const stockRows = normalizeList(stockRes);
    const shipments = normalizeList(shipmentRes);
    const deliveries = normalizeList(deliveryRes);
    const installations = normalizeList(installationRes);
    const summaryRows = (stockSummary as Record<string, unknown>[]) ?? [];

    const pendingShipments = shipments.filter(isPendingShipment).length;
    const activeInstallations = installations.filter(isActiveInstallation).length;
    const stockAlerts = stockRows.filter((r) => Number(r.quantity ?? r.qty ?? 99) <= 5).length;
    const deliveryInTransit = deliveries.filter(isInTransitDelivery).length;

    const quickTiles: OpsQuickTile[] = QUICK_TILE_DEFS.filter((t) => allowedKeys.has(t.key)).map((t) => {
      if (t.key === 'stock') {
        return { ...t, subtitle: `${paginatedTotal(stockRes).toLocaleString('tr-TR')} SKU` };
      }
      if (t.key === 'products') {
        return { ...t, subtitle: `${paginatedTotal(productRes)} model` };
      }
      if (t.key === 'purchase-orders') {
        return { ...t, subtitle: `${paginatedTotal(purchaseRes)} sipariş` };
      }
      if (t.key === 'shipments') {
        return {
          ...t,
          subtitle: `${pendingShipments} bekleyen`,
          alertDot: pendingShipments > 0,
        };
      }
      if (t.key === 'deliveries') {
        return { ...t, subtitle: `${deliveryInTransit} yolda` };
      }
      return { ...t, subtitle: `${activeInstallations} aktif` };
    });

    const todayItems = buildTodayItems(shipments, installations, deliveries);
    const displayToday =
      todayItems.length > 0
        ? todayItems
        : buildFallbackTodayItems(shipments, installations, deliveries);

    setData({
      pendingShipments,
      activeInstallations,
      stockAlerts,
      stockTotal: paginatedTotal(stockRes),
      productTotal: paginatedTotal(productRes),
      purchaseTotal: paginatedTotal(purchaseRes),
      deliveryInTransit,
      notificationCount: notifRes.meta?.total ?? 0,
      todayItems: displayToday,
      alerts: buildAlerts(summaryRows.length ? summaryRows : stockRows, shipments),
      quickTiles,
    });
  }, [hasRole]);

  useEffect(() => {
    void load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const onBack = () => {
    if (tabRoot) router.push('/quick-create');
    else router.back();
  };

  return (
    <Screen padded={false} edges={['left', 'right', 'bottom']}>
      <OperationsHubHeader
        onBack={onBack}
        onSearch={() => router.push('/modules/stock')}
        onNotifications={() => router.push('/modules/notifications')}
        notificationCount={data?.notificationCount ?? 0}
      />

      {loading ? (
        <ActivityIndicator color={colors.primary} style={styles.loader} />
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.body}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={colors.primary} />
          }
        >
          <OperationsDailySummary
            dateLabel={formatOpsDateLabel()}
            pendingShipments={data?.pendingShipments ?? 0}
            activeInstallations={data?.activeInstallations ?? 0}
            stockAlerts={data?.stockAlerts ?? 0}
          />

          {data?.quickTiles.length ? (
            <OperationsQuickAccess
              tiles={data.quickTiles}
              onTilePress={(key) => router.push(`/modules/${key}`)}
            />
          ) : null}

          <OperationsTodaySection
            items={data?.todayItems ?? []}
            onSeeAll={() => router.push('/modules/shipments')}
            onItemPress={(item) => router.push(item.route as never)}
          />

          <OperationsAlertsSection alerts={data?.alerts ?? []} />
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  loader: { marginTop: spacing.xxxl },
  scroll: { flex: 1, backgroundColor: colors.surfaceContainerLow },
  body: {
    padding: layout.containerMargin,
    gap: spacing.xxl,
    paddingBottom: spacing.xxxl,
  },
});
