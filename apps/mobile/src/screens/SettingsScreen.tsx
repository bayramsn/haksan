import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { getApiBaseUrl, persistApiBaseUrl } from '@/src/api/config';
import { useAuth } from '@/src/auth/AuthProvider';
import { flushOfflineQueue, getQueueLength } from '@/src/offline/queue';
import { Button } from '@/src/ui/Button';
import { Input } from '@/src/ui/Input';
import { PageHeader } from '@/src/ui/PageHeader';
import { Screen } from '@/src/ui/Screen';
import { SectionTitle } from '@/src/ui/SectionTitle';
import { colors, fonts, layout, spacing, typography } from '@/src/theme/tokens';
import { cardElevated } from '@/src/theme/styles';

/** Stitch #12 Ayarlar */
export function SettingsScreen() {
  const { user, tenant, logout } = useAuth();
  const [apiUrl, setApiUrl] = useState(getApiBaseUrl());
  const [saved, setSaved] = useState(false);
  const [queueLen, setQueueLen] = useState(0);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    setApiUrl(getApiBaseUrl());
    void getQueueLength().then(setQueueLen);
  }, []);

  const syncOffline = async () => {
    setSyncing(true);
    try {
      const res = await flushOfflineQueue();
      Alert.alert('Senkron', `${res.ok} gönderildi, ${res.failed} bekliyor`);
      setQueueLen(await getQueueLength());
    } finally {
      setSyncing(false);
    }
  };

  const save = async () => {
    try {
      await persistApiBaseUrl(apiUrl.trim());
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      Alert.alert('Geçersiz adres', e instanceof Error ? e.message : 'API adresi kaydedilemedi');
    }
  };

  return (
    <Screen padded={false} edges={['left', 'right']} scroll keyboard contentContainerStyle={styles.scroll}>
      <PageHeader>
        <Text style={styles.headerTitle}>Ayarlar</Text>
      </PageHeader>
      <View style={styles.body}>
        <View style={styles.card}>
          <Text style={styles.label}>Kullanıcı</Text>
          <Text style={styles.value}>{user?.fullName}</Text>
          <Text style={styles.muted}>{user?.email}</Text>
          <Text style={styles.muted}>{tenant?.name}</Text>
        </View>
        <SectionTitle title="API Sunucusu" />
        <Input label="API Base URL" value={apiUrl} onChangeText={setApiUrl} autoCapitalize="none" />
        {saved ? <Text style={styles.ok}>Kaydedildi — oturumu yenileyin</Text> : null}
        <Button title="Kaydet" onPress={() => void save()} />
        <SectionTitle title="Offline Kuyruk" />
        <Text style={styles.muted}>Bekleyen işlem: {queueLen}</Text>
        <Button title="Şimdi Senkronize Et" variant="secondary" loading={syncing} onPress={() => void syncOffline()} />
        <Button title="Çıkış Yap" variant="secondary" onPress={() => void logout()} style={styles.logout} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing.lg },
  headerTitle: { ...typography.headline, color: '#fff' },
  body: { padding: layout.screenPadding, gap: spacing.md },
  card: { ...cardElevated, padding: layout.screenPadding, gap: 4 },
  label: { ...typography.label, fontFamily: fonts.semibold, color: colors.textMuted },
  value: { ...typography.title, fontSize: 18, color: colors.textPrimary },
  muted: { ...typography.bodySm, color: colors.textMuted },
  ok: { ...typography.bodySm, color: colors.success },
  logout: { marginTop: spacing.lg },
});
