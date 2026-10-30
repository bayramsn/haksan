import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { FileLinkRow } from '@/src/api/commercial-docs.api';
import type { SalesOrderListRow } from '@/src/api/sales-orders.api';
import { formatAmount, formatDate } from '@/src/lib/format';
import { useTheme, type Tone } from '@/src/theme/theme';
import { Chip, ListRow } from '@/src/ui';
import { folderForDocumentType, folderLabel, formatFileSize, linkRelationLabel } from './document-logic';

export const SALES_ORDER_TONE: Record<string, Tone> = {
  draft: 'neutral',
  confirmed: 'info',
  reserved: 'warning',
  fulfilled: 'success',
  cancelled: 'destructive',
};

/** Web "Satış Siparişleri" satırı: no, teklif bağlantılı/manuel, firma, ürün adı, tarih, tutar, durum. */
export function SalesOrderRow({
  order,
  onPress,
  onInvoice,
}: {
  order: SalesOrderListRow;
  onPress: () => void;
  onInvoice?: () => void;
}) {
  const { colors } = useTheme();
  const company = order.company?.shortName ?? order.company?.legalTitle ?? null;
  return (
    <View>
      <ListRow
        title={order.orderNo}
        icon="clipboard-outline"
        iconTone="info"
        lines={[
          [order.quoteId ? 'Teklif bağlantılı' : 'Manuel', company].filter(Boolean).join(' · '),
          order.productName ? `Ürün: ${order.productName}` : null,
          formatDate(order.orderDate),
        ]}
        chip={order.status ? { label: order.status.name, tone: SALES_ORDER_TONE[order.status.code] ?? 'neutral' } : undefined}
        trailing={formatAmount(order.grandTotal, order.currency?.code ?? 'USD')}
        trailingTone="neutral"
        onPress={onPress}
      />
      {onInvoice ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${order.orderNo} için muhasebe faturası oluştur`}
          onPress={onInvoice}
          className="mb-1 min-h-[44px] flex-row items-center justify-end gap-1.5 px-2 active:opacity-70"
        >
          <Ionicons name="receipt-outline" size={16} color={colors.primary} />
          <Text className="font-inter-semibold text-[13px] text-primary">Muhasebe Faturası</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Belge merkezindeki dosya bağlantısı: dosya adı, tür, kaynak bağlantısı, boyut, yükleyen, tarih. */
export function FileLinkCard({
  link,
  onOpen,
  actions,
}: {
  link: FileLinkRow;
  onOpen: () => void;
  actions?: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; destructive?: boolean }[];
}) {
  const { colors } = useTheme();
  const folder = folderForDocumentType(link.documentType?.code);
  return (
    <View className="my-[5px] gap-2 rounded-[16px] border border-border bg-card px-3.5 py-3" style={{ borderCurve: 'continuous' }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${link.file.originalFilename} dosyasını aç`}
        onPress={onOpen}
        className="flex-row items-center gap-3 active:opacity-70"
      >
        <View className="h-[42px] w-[42px] items-center justify-center rounded-[12px] bg-secondary">
          <Ionicons name="document-attach-outline" size={20} color={colors.primary} />
        </View>
        <View className="flex-1 gap-0.5">
          <Text className="font-inter-semibold text-[15px] text-foreground" numberOfLines={1}>
            {link.file.originalFilename}
          </Text>
          <Text className="font-inter text-[12px] text-muted-foreground" numberOfLines={1}>
            {linkRelationLabel(link.entityType, folder, link.description)}
          </Text>
          <Text className="font-inter text-[12px] text-muted-foreground" numberOfLines={1}>
            {[formatFileSize(link.file.sizeBytes), link.file.uploaderName ? `Yükleyen: ${link.file.uploaderName}` : null, formatDate(link.createdAt)]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>
        <Ionicons name="download-outline" size={19} color={colors.mutedForeground} />
      </Pressable>
      <View className="flex-row flex-wrap items-center gap-1.5">
        <Chip tone="neutral" label={link.documentType?.name ?? folderLabel(folder)} />
        <Chip tone="success" label="Dosya mevcut" />
        <View className="flex-1" />
        {actions?.map((action) => (
          <Pressable
            key={action.label}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            onPress={action.onPress}
            className="min-h-[44px] flex-row items-center gap-1 px-2 active:opacity-70"
          >
            <Ionicons name={action.icon} size={16} color={action.destructive ? colors.destructive : colors.primary} />
            <Text className={`font-inter-semibold text-[12px] ${action.destructive ? 'text-destructive' : 'text-primary'}`}>{action.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
