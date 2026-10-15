import { useRef, useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import { Button } from '@/src/ui';
import { toast } from '@/src/ui/toast';

/**
 * Web'deki "Yazdır" çıktılarının mobil karşılığı: belge görünümü PNG olarak
 * yakalanır ve paylaşım sayfası açılır (yazıcı, PDF'e kaydet, e-posta…).
 */
export function DocumentCapture({ title, fileName, children }: { title: string; fileName: string; children: ReactNode }) {
  const ref = useRef<View>(null);
  const [busy, setBusy] = useState(false);

  const share = async () => {
    if (!ref.current || busy) return;
    setBusy(true);
    try {
      if (!(await Sharing.isAvailableAsync())) throw new Error('Bu cihazda paylaşım kullanılamıyor.');
      const uri = await captureRef(ref, { format: 'png', quality: 1, result: 'tmpfile', fileName });
      await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: title });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Belge paylaşılamadı.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="gap-3">
      <View ref={ref} collapsable={false} className="rounded-surface border border-border bg-card p-4">
        {children}
      </View>
      <Button label="Yazdır / Paylaş" onPress={() => void share()} loading={busy} trailingIcon="print-outline" />
      <Text className="font-inter text-xs text-muted-foreground">
        Belge görsel olarak paylaşılır; paylaşım menüsünden yazdırabilir veya PDF olarak kaydedebilirsiniz.
      </Text>
    </View>
  );
}

/** Belge içindeki etiket/değer satırı. */
export function DocRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <View className="flex-row gap-3 border-b border-border py-1.5">
      <Text className="w-[38%] font-inter text-[12px] text-muted-foreground">{label}</Text>
      <Text className="flex-1 font-inter-medium text-[12px] text-foreground">{value || '—'}</Text>
    </View>
  );
}

export function DocTitle({ children }: { children: ReactNode }) {
  return <Text className="pb-1 pt-3 font-display-semibold text-[15px] text-foreground">{children}</Text>;
}
