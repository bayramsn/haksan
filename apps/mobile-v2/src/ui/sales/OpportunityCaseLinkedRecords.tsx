import { Pressable, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { Installation, Receivable2, Shipment } from '@/src/api/endpoints';
import type { Delivery } from '@/src/api/logistics.api';
import {
  useLinkedDeliveries,
  useLinkedInstallations,
  useLinkedShipments,
  useOpportunityReceivables,
} from '@/src/api/opportunity-case.hooks';
import { formatAmount, formatDate } from '@/src/lib/format';
import { useTheme, type Tone } from '@/src/theme/theme';
import { Button, Card, Chip, ErrorState, Eyebrow, Loading } from '@/src/ui';

type DenseRowProps = {
  title: string;
  subtitle: string;
  chip?: { label: string; tone: Tone };
  trailing?: string;
  onPress: () => void;
};

/** Compact case row: title + one subtitle line (≤2 lines total). */
function DenseRow({ title, subtitle, chip, trailing, onPress }: DenseRowProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      className="flex-row items-center gap-2 border-t border-border py-2.5 active:opacity-70"
    >
      <View className="min-w-0 flex-1 gap-0.5">
        <View className="flex-row items-center gap-2">
          <Text className="min-w-0 flex-1 font-inter-semibold text-[13px] text-foreground" numberOfLines={1}>
            {title}
          </Text>
          {chip ? <Chip tone={chip.tone} label={chip.label} shrink /> : null}
        </View>
        <Text className="font-inter text-[11px] text-muted-foreground" numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      {trailing ? (
        <Text className="shrink-0 font-inter-semibold text-[12px] text-foreground" style={{ fontVariant: ['tabular-nums'] }}>
          {trailing}
        </Text>
      ) : null}
      <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
    </Pressable>
  );
}

function shipmentTone(code: string | undefined): Tone {
  if (code === 'delivered' || code === 'cleared') return 'success';
  if (code === 'at_customs') return 'warning';
  if (code === 'in_transit') return 'info';
  return 'neutral';
}

function installationTone(code: string | undefined): Tone {
  if (code === 'completed') return 'success';
  if (code === 'cancelled') return 'destructive';
  if (code === 'in_progress') return 'warning';
  return 'info';
}

function receivableTone(row: Receivable2): Tone {
  const code = row.status?.code?.toLowerCase() ?? '';
  if (code.includes('paid') || code.includes('collected') || code.includes('closed')) return 'success';
  if (code.includes('overdue') || code.includes('late')) return 'destructive';
  return 'warning';
}

export function OpportunityOpsRecords({
  opportunityId,
  companyId,
  showShipments,
  showInstallations,
  showDeliveries,
  canCreateShipment,
  canCreateInstallation,
  onCreateShipment,
  onCreateInstallation,
  onOpenModule,
}: {
  opportunityId: string;
  companyId?: string;
  showShipments: boolean;
  showInstallations: boolean;
  showDeliveries: boolean;
  canCreateShipment: boolean;
  canCreateInstallation: boolean;
  onCreateShipment?: () => void;
  onCreateInstallation?: () => void;
  onOpenModule: (module: 'shipments' | 'installations' | 'deliveries') => void;
}) {
  const router = useRouter();
  const shipments = useLinkedShipments(opportunityId, showShipments);
  const installations = useLinkedInstallations(opportunityId, showInstallations);
  const deliveries = useLinkedDeliveries(opportunityId, showDeliveries);
  const anyModule = showShipments || showInstallations || showDeliveries;
  if (!anyModule) return null;

  const pending =
    (showShipments && shipments.isPending) ||
    (showInstallations && installations.isPending) ||
    (showDeliveries && deliveries.isPending);
  const error =
    (showShipments && shipments.error) ||
    (showInstallations && installations.error) ||
    (showDeliveries && deliveries.error);

  const shipmentRows = shipments.data ?? [];
  const installationRows = installations.data ?? [];
  const deliveryRows = deliveries.data ?? [];

  return (
    <Card className="gap-1">
      <Eyebrow>Bu fırsatın operasyonları</Eyebrow>
      {pending ? <Loading /> : null}
      {error ? (
        <ErrorState
          message="Bağlı operasyon kayıtları yüklenemedi."
          onRetry={() => {
            if (showShipments) void shipments.refetch();
            if (showInstallations) void installations.refetch();
            if (showDeliveries) void deliveries.refetch();
          }}
        />
      ) : null}
      {!pending && !error ? (
        <>
          {showShipments
            ? shipmentRows.length === 0
              ? <Text className="font-inter text-[12px] text-muted-foreground">Bu fırsata bağlı sevkiyat yok.</Text>
              : shipmentRows.map((row: Shipment) => (
                  <DenseRow
                    key={row.id}
                    title={row.trackingNo ?? row.shipmentNo ?? 'Sevkiyat'}
                    subtitle={[row.status?.name, row.eta ? `ETA ${formatDate(row.eta)}` : null].filter(Boolean).join(' · ')}
                    chip={row.status ? { label: row.status.name, tone: shipmentTone(row.status.code) } : undefined}
                    onPress={() => router.push(`/modules/shipments/${row.id}` as Href)}
                  />
                ))
            : null}
          {showInstallations
            ? installationRows.length === 0
              ? <Text className="mt-1 font-inter text-[12px] text-muted-foreground">Bu fırsata bağlı kurulum yok.</Text>
              : installationRows.map((row: Installation) => {
                  const machine =
                    [row.customerDevice?.brandName, row.customerDevice?.productModelName ?? row.customerDevice?.model]
                      .filter(Boolean)
                      .join(' ') || 'Kurulum';
                  return (
                    <DenseRow
                      key={row.id}
                      title={machine}
                      subtitle={[row.status?.name, row.scheduledDate ? formatDate(row.scheduledDate) : null]
                        .filter(Boolean)
                        .join(' · ')}
                      chip={row.status ? { label: row.status.name, tone: installationTone(row.status.code) } : undefined}
                      onPress={() => router.push(`/modules/installations/${row.id}` as Href)}
                    />
                  );
                })
            : null}
          {showDeliveries
            ? deliveryRows.length === 0
              ? <Text className="mt-1 font-inter text-[12px] text-muted-foreground">Bu fırsata bağlı teslimat yok.</Text>
              : deliveryRows.map((row: Delivery) => {
                  const tezgah = (row.formData?.tezgah ?? {}) as { marka?: string; model?: string };
                  const title = [tezgah.marka, tezgah.model].filter(Boolean).join(' ') || 'Teslimat';
                  return (
                    <DenseRow
                      key={row.id}
                      title={title}
                      subtitle={[row.status === 'completed' ? 'Tamamlandı' : 'Bekliyor', row.deliveryDate ? formatDate(row.deliveryDate) : null]
                        .filter(Boolean)
                        .join(' · ')}
                      chip={{
                        label: row.status === 'completed' ? 'Tamamlandı' : 'Bekliyor',
                        tone: row.status === 'completed' ? 'success' : 'warning',
                      }}
                      onPress={() => router.push(`/modules/deliveries/${row.id}` as Href)}
                    />
                  );
                })
            : null}
        </>
      ) : null}
      <View className="mt-1 gap-1.5 border-t border-border pt-2">
        {canCreateShipment ? <Button label="Sevkiyat oluştur" variant="ghost" onPress={onCreateShipment} /> : null}
        {canCreateInstallation ? <Button label="Kurulum oluştur" variant="ghost" onPress={onCreateInstallation} /> : null}
        {showShipments ? (
          <Button label="Sevkiyat listesi (bu fırsat)" variant="ghost" onPress={() => onOpenModule('shipments')} />
        ) : null}
        {showInstallations ? (
          <Button label="Kurulum listesi (bu fırsat)" variant="ghost" onPress={() => onOpenModule('installations')} />
        ) : null}
        {showDeliveries ? (
          <Button label="Teslimat listesi (bu fırsat)" variant="ghost" onPress={() => onOpenModule('deliveries')} />
        ) : null}
        {companyId ? null : (
          <Text className="font-inter text-[11px] text-muted-foreground">Yeni kayıt için önce firma bağlayın.</Text>
        )}
      </View>
    </Card>
  );
}

export function OpportunityPaymentRecords({
  opportunityId,
  companyId,
  quoteIds,
  titleHint,
  enabled,
  canCreatePlan,
  canCreatePayment,
  onCreatePlan,
  onCreatePayment,
  onOpenReceivables,
}: {
  opportunityId: string;
  companyId?: string;
  quoteIds: string[];
  titleHint?: string | null;
  enabled: boolean;
  canCreatePlan: boolean;
  canCreatePayment: boolean;
  onCreatePlan?: () => void;
  onCreatePayment?: () => void;
  onOpenReceivables: () => void;
}) {
  const router = useRouter();
  const list = useOpportunityReceivables(
    opportunityId,
    { companyId, quoteIds, titleHint },
    enabled && Boolean(companyId),
  );
  const rows = list.data ?? [];

  return (
    <Card className="gap-1">
      <Eyebrow>Bu fırsatın alacak / taksitleri</Eyebrow>
      {!companyId ? (
        <Text className="font-inter text-[12px] text-muted-foreground">Alacakları görmek için önce firma bağlayın.</Text>
      ) : list.isPending ? (
        <Loading />
      ) : list.error ? (
        <ErrorState message={list.error.message} onRetry={() => void list.refetch()} />
      ) : rows.length === 0 ? (
        <Text className="font-inter text-[12px] text-muted-foreground">
          Bu fırsata bağlı taksit/alacak yok. Ödeme planı oluşturunca burada listelenir.
        </Text>
      ) : (
        rows.map((row) => (
          <DenseRow
            key={row.id}
            title={row.invoiceNo || row.documentRef || row.notes || 'Alacak'}
            subtitle={[`Vade ${formatDate(row.dueDate)}`, row.status?.name, row.paymentMethod].filter(Boolean).join(' · ')}
            chip={row.status ? { label: row.status.name, tone: receivableTone(row) } : undefined}
            trailing={formatAmount(row.amount, row.currency?.code ?? 'TRY')}
            onPress={() => router.push(`/modules/receivables/${row.id}` as Href)}
          />
        ))
      )}
      <View className="mt-1 gap-1.5 border-t border-border pt-2">
        {canCreatePlan ? <Button label="Ödeme planı oluştur" trailingIcon="add" onPress={onCreatePlan} /> : null}
        {canCreatePayment ? <Button label="Ödeme kaydet" variant="ghost" onPress={onCreatePayment} /> : null}
        {enabled ? (
          <Button label="Alacak listesini aç (bu firma)" variant="ghost" onPress={onOpenReceivables} />
        ) : null}
      </View>
    </Card>
  );
}
