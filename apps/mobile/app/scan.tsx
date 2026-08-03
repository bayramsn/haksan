import { useCallback, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing, typography } from '@/src/theme/tokens';

/**
 * QR / barkod tarayıcı — makine QR etiketini (public servis linki) veya
 * stok/seri barkodunu okur. QR bir servis linkiyse tarayıcıda açar; aksi
 * halde değeri stok aramasına taşır.
 */
export default function ScanScreen() {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState<string | null>(null);
  const lockRef = useRef(false);

  // Ekran her odaklandığında yeniden taramaya izin ver.
  useFocusEffect(
    useCallback(() => {
      lockRef.current = false;
      setScanned(null);
      return () => { lockRef.current = true; };
    }, []),
  );

  const handleScan = (result: BarcodeScanningResult) => {
    if (lockRef.current) return;
    lockRef.current = true;
    setScanned(result.data);
  };

  const isUrl = scanned ? /^https?:\/\//i.test(scanned) : false;
  const isServiceLink = scanned ? scanned.includes('/public/service-complaints/') : false;

  const openScanned = () => {
    if (!scanned) return;
    if (isUrl) {
      void Linking.openURL(scanned);
    } else {
      // Seri no / barkod → stok modülünde ara.
      router.push(`/modules/stock?q=${encodeURIComponent(scanned)}` as never);
    }
  };

  const rescan = () => {
    lockRef.current = false;
    setScanned(null);
  };

  if (!permission) {
    return <View style={styles.center}><Text style={styles.dim}>Kamera hazırlanıyor…</Text></View>;
  }

  if (!permission.granted) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Ionicons name="camera-outline" size={48} color={colors.primary} />
        <Text style={styles.title}>Kamera izni gerekli</Text>
        <Text style={styles.dim}>QR ve barkod okumak için kamera erişimine izin verin.</Text>
        <Pressable style={styles.primaryBtn} onPress={() => void requestPermission()}>
          <Text style={styles.primaryBtnText}>İzin ver</Text>
        </Pressable>
        <Pressable style={styles.linkBtn} onPress={() => router.back()}>
          <Text style={styles.linkText}>Geri dön</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr', 'ean13', 'ean8', 'code128', 'code39', 'upc_a', 'datamatrix'] }}
        onBarcodeScanned={scanned ? undefined : handleScan}
      />
      {/* Nişangah */}
      <View style={styles.overlay} pointerEvents="none">
        <View style={styles.reticle} />
        <Text style={styles.hint}>Makine QR etiketini veya barkodu çerçeveye alın</Text>
      </View>

      <Pressable style={[styles.closeBtn, { top: insets.top + spacing.sm }]} onPress={() => router.back()}>
        <Ionicons name="close" size={26} color="#fff" />
      </Pressable>

      {scanned && (
        <View style={[styles.resultCard, { paddingBottom: insets.bottom + spacing.md }]}>
          <Text style={styles.resultLabel}>{isServiceLink ? 'Makine servis linki' : isUrl ? 'Bağlantı' : 'Kod / seri no'}</Text>
          <Text style={styles.resultValue} numberOfLines={2}>{scanned}</Text>
          <View style={styles.resultActions}>
            <Pressable style={styles.secondaryBtn} onPress={rescan}>
              <Ionicons name="scan-outline" size={18} color={colors.primary} />
              <Text style={styles.secondaryBtnText}>Tekrar tara</Text>
            </Pressable>
            <Pressable style={styles.primaryBtn} onPress={openScanned}>
              <Ionicons name={isUrl ? 'open-outline' : 'search-outline'} size={18} color="#fff" />
              <Text style={styles.primaryBtnText}>{isServiceLink ? 'Servis formunu aç' : isUrl ? 'Bağlantıyı aç' : 'Stokta ara'}</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.lg, backgroundColor: colors.card },
  overlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  reticle: { width: 240, height: 240, borderRadius: radius.lg, borderWidth: 3, borderColor: 'rgba(255,255,255,0.9)' },
  hint: { marginTop: spacing.lg, color: '#fff', ...typography.body, textAlign: 'center', paddingHorizontal: spacing.xl },
  closeBtn: { position: 'absolute', right: spacing.md, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  title: { ...typography.headline, color: colors.textPrimary, marginTop: spacing.sm },
  dim: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  resultCard: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.card, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  resultLabel: { ...typography.caption, color: colors.primary, fontWeight: '600', textTransform: 'uppercase' },
  resultValue: { ...typography.body, color: colors.textPrimary },
  resultActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  primaryBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: spacing.md },
  primaryBtnText: { color: '#fff', fontWeight: '600', ...typography.body },
  secondaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.inputBg, borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: spacing.md },
  secondaryBtnText: { color: colors.primary, fontWeight: '600', ...typography.body },
  linkBtn: { paddingVertical: spacing.sm },
  linkText: { color: colors.textMuted, ...typography.body },
});
