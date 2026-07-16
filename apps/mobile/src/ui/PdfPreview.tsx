import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { getApiBaseUrl } from '@/src/api/config';
import { getAccessToken, getActiveDepartment, getActiveDivision } from '@/src/api/apiClient';
import { useEffect, useState } from 'react';
import { colors } from '@/src/theme/tokens';

type Props = {
  path: string;
  method?: 'GET' | 'POST';
};

/** Stitch Fatura / Teklif PDF önizleme */
export function PdfPreview({ path, method = 'POST' }: Props) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const headers: Record<string, string> = {};
        const token = getAccessToken();
        const div = getActiveDivision();
        const department = getActiveDepartment();
        if (token) headers.Authorization = `Bearer ${token}`;
        if (div) {
          headers['X-Active-Division'] = div;
        }
        if (department) headers['X-Active-Department'] = department;
        const res = await fetch(`${getApiBaseUrl()}${path}`, { method, headers });
        if (!res.ok) throw new Error(`PDF yüklenemedi (${res.status})`);
        const blob = await res.blob();
        const reader = new FileReader();
        const dataUrl = await new Promise<string>((resolve, reject) => {
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        setHtml(`<html><body style="margin:0"><embed src="${dataUrl}" type="application/pdf" width="100%" height="100%" /></body></html>`);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Hata');
      }
    })();
  }, [path, method]);

  if (error) return <View style={styles.err}><ActivityIndicator color={colors.accentRed} /></View>;
  if (!html) return <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />;

  return <WebView originWhitelist={['*']} source={{ html }} style={styles.web} />;
}

const styles = StyleSheet.create({
  web: { flex: 1, minHeight: 480, backgroundColor: colors.canvas },
  err: { padding: 24 },
});
