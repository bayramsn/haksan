import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { openPdfUrl } from '@/src/api/download';
import { Button } from '@/src/ui/Button';
import { colors } from '@/src/theme/tokens';

type Props = { path: string; method?: 'GET' | 'POST'; onOpen?: () => Promise<void> };

/** PDF'i CRM'den alıp cihazın PDF uygulamalarına veya paylaşım menüsüne aktarır. */
export function PdfPreview({ path, method = 'POST', onOpen }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = async () => {
    setBusy(true);
    setError(null);
    try {
      if (onOpen) await onOpen();
      else await openPdfUrl(path, undefined, method);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'PDF alınamadı. Tekrar deneyin.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={styles.container}>
      <Text style={styles.title}>CRM PDF belgesi</Text>
      <Text style={styles.description}>Güncel belgeyi telefonunuza alın. Açılan menüden PDF uygulaması seçebilir, dosyalara kaydedebilir veya paylaşabilirsiniz.</Text>
      {busy ? <ActivityIndicator color={colors.primary} /> : null}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <Button title={error ? 'Tekrar dene' : 'PDF Aç / Paylaş'} loading={busy} onPress={() => void open()} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { minHeight: 220, backgroundColor: colors.canvas, padding: 24, justifyContent: 'center', gap: 16 },
  title: { fontSize: 18, fontWeight: '600', color: colors.textPrimary },
  description: { fontSize: 14, lineHeight: 21, color: colors.secondary },
  error: { color: colors.accentRed, fontSize: 14 },
});
