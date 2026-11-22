import { Text, View } from 'react-native';
import { Button } from '@/src/ui';
import { ComplaintQr } from '@/src/ui/service/ComplaintQr';
import { openComplaintUrl, shareComplaintUrl } from '@/src/ui/service/complaintShare';
import { toast } from '@/src/ui/toast';

export type MachineQrPayload = {
  url: string;
  title: string;
  subtitle: string;
  rotated: boolean;
};

/** Web MachineQrDialog karşılığı — kompakt sheet içeriği (QR + paylaş / aç). */
export function MachineQrSheetContent({
  payload,
  onDismiss,
}: {
  payload: MachineQrPayload;
  onDismiss: () => void;
}) {
  return (
    <View className="gap-3 px-5 pb-10 pt-2" accessibilityLabel="Makine QR etiketi">
      <View className="gap-0.5">
        <Text className="font-inter-semibold text-base text-foreground">Makine QR Etiketi</Text>
        <Text className="font-inter text-xs text-muted-foreground" numberOfLines={2}>
          {payload.subtitle}
        </Text>
      </View>

      <ComplaintQr value={payload.url} size={148} />

      <Text className="text-center font-inter text-[11px] leading-[15px] text-muted-foreground">
        QR okutulduğunda müşteri bu makineye bağlı servis talebi formuna ulaşır.
      </Text>

      {payload.rotated ? (
        <View
          accessibilityRole="alert"
          className="rounded-control border border-warning-border bg-warning-soft px-3 py-2"
        >
          <Text className="text-center font-inter text-[11px] leading-[15px] text-warning">
            Yeni QR üretildi — daha önce yazdırılan etiketler geçersiz oldu.
          </Text>
        </View>
      ) : null}

      <Text selectable className="font-inter text-[11px] leading-[15px] text-foreground" numberOfLines={3}>
        {payload.url}
      </Text>

      <View className="flex-row gap-2">
        <Button
          className="flex-1"
          label="Paylaş"
          variant="ghost"
          trailingIcon="share-outline"
          onPress={() => void shareComplaintUrl(payload.url, payload.title).catch(() => toast.error('Paylaşılamadı.'))}
        />
        <Button
          className="flex-1"
          label="Aç"
          variant="ghost"
          trailingIcon="open-outline"
          onPress={() => void openComplaintUrl(payload.url).catch(() => toast.error('Link açılamadı.'))}
        />
      </View>
      <Button label="Kapat" variant="ghost" onPress={onDismiss} />
    </View>
  );
}
