import type { CallAssistantAction } from '@haksan/shared';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  PermissionsAndroid,
  Platform,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { callAssistantService, type CallSuggestionDTO } from '../api/services';
import { getAccessToken, getBaseUrl } from '../lib/apiClient';
import { CallAssistantNative, type NativeStatus } from '../native/CallAssistantNative';
import { SuggestionCard } from '../components/SuggestionCard';
import { Button, Screen, colors } from '../ui';

export function AssistantScreen() {
  const [suggestions, setSuggestions] = useState<CallSuggestionDTO[]>([]);
  const [nativeStatus, setNativeStatus] = useState<NativeStatus | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [actionBusy, setActionBusy] = useState<Record<string, CallAssistantAction | null>>({});
  const [manualPhone, setManualPhone] = useState('');
  const [manualBusy, setManualBusy] = useState(false);

  const refreshAll = async () => {
    setRefreshing(true);
    try {
      const [list, status] = await Promise.all([
        callAssistantService.suggestions({ status: 'pending' }),
        CallAssistantNative.getStatus(),
      ]);
      setSuggestions(list.data);
      setNativeStatus(status);
    } catch (err) {
      Alert.alert('Yenileme başarısız', message(err));
    } finally {
      setRefreshing(false);
    }
  };
  useEffect(() => {
    void refreshAll();
  }, []);

  const requestAndroidPermissions = async () => {
    if (Platform.OS !== 'android') return true;
    const permissionList = [
      PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE,
      PermissionsAndroid.PERMISSIONS.READ_CALL_LOG,
      ...(Number(Platform.Version) >= 33 ? [PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS] : []),
    ];
    const result = await PermissionsAndroid.requestMultiple(permissionList);
    return permissionList.every((permission) => result[permission] === PermissionsAndroid.RESULTS.GRANTED);
  };

  const toggleListener = async (enabled: boolean) => {
    try {
      if (enabled) {
        const granted = await requestAndroidPermissions();
        if (!granted) {
          Alert.alert('İzin gerekli', 'Arama yakalama için telefon, çağrı geçmişi ve bildirim izinleri gerekli.');
          setNativeStatus(await CallAssistantNative.getStatus());
          return;
        }
        const token = getAccessToken();
        if (token) await CallAssistantNative.configure(getBaseUrl(), token);
      }
      setNativeStatus(await CallAssistantNative.setEnabled(enabled));
    } catch (err) {
      Alert.alert('Ayar kaydedilemedi', message(err));
    }
  };

  const runAction = async (suggestion: CallSuggestionDTO, action: CallAssistantAction) => {
    setActionBusy((prev) => ({ ...prev, [suggestion.id]: action }));
    try {
      await callAssistantService.action(suggestion.id, action);
      setSuggestions((rows) => rows.filter((row) => row.id !== suggestion.id));
    } catch (err) {
      Alert.alert('İşlem başarısız', message(err));
    } finally {
      setActionBusy((prev) => ({ ...prev, [suggestion.id]: null }));
    }
  };

  const sendManualCall = async () => {
    const phone = manualPhone.trim();
    if (!phone) {
      Alert.alert('Telefon numarası gerekli');
      return;
    }
    setManualBusy(true);
    try {
      const result = await callAssistantService.manualEvent({ phoneNumber: phone, eventType: 'completed', direction: 'inbound' });
      setManualPhone('');
      if (result.suggestions.length > 0) {
        await refreshAll();
        Alert.alert('Öneri oluşturuldu', 'Zil ekranında ve mobil listede görebilirsin.');
      } else {
        Alert.alert('Eşleşme yok', `Durum: ${result.event.matchStatus}`);
      }
    } catch (err) {
      Alert.alert('Manuel arama gönderilemedi', message(err));
    } finally {
      setManualBusy(false);
    }
  };

  return (
    <Screen refreshing={refreshing} onRefresh={refreshAll}>
      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <View style={styles.flexOne}>
            <Text style={styles.sectionTitle}>Otomatik arama yakalama</Text>
            <Text style={styles.muted}>
              {nativeStatus?.available
                ? 'Arama bitince veya kaçınca CRM’e gönderir.'
                : 'Native arama modülü bu platformda yok (yalnız Android).'}
            </Text>
          </View>
          <Switch value={!!nativeStatus?.enabled} disabled={!nativeStatus?.available} onValueChange={toggleListener} />
        </View>
        <View style={styles.permissionGrid}>
          <Pill label="Telefon" ok={!!nativeStatus?.permissions.readPhoneState} />
          <Pill label="Çağrı geçmişi" ok={!!nativeStatus?.permissions.readCallLog} />
          <Pill label="Bildirim" ok={!!nativeStatus?.permissions.postNotifications} />
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Manuel test</Text>
        <Text style={styles.muted}>Telefondan hızlı deneme için numara gönder.</Text>
        <View style={styles.manualRow}>
          <TextInput
            value={manualPhone}
            onChangeText={setManualPhone}
            placeholder="0532 111 22 33"
            keyboardType="phone-pad"
            style={[styles.input, styles.manualInput]}
            placeholderTextColor={colors.textSubtle}
          />
          <Button label="Gönder" loading={manualBusy} onPress={sendManualCall} style={styles.sendBtn} />
        </View>
      </View>

      <View style={styles.listHeader}>
        <Text style={styles.sectionTitle}>Bekleyen öneriler</Text>
        <TouchableOpacity onPress={refreshAll}>
          <Text style={styles.link}>Yenile</Text>
        </TouchableOpacity>
      </View>

      {suggestions.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Bekleyen öneri yok</Text>
          <Text style={styles.muted}>Arama yakalanınca veya manuel test gönderilince burada görünür.</Text>
        </View>
      ) : (
        <View style={styles.suggestionList}>
          {suggestions.map((suggestion) => (
            <SuggestionCard
              key={suggestion.id}
              suggestion={suggestion}
              busyAction={actionBusy[suggestion.id]}
              onAction={(action) => runAction(suggestion, action)}
            />
          ))}
        </View>
      )}
    </Screen>
  );
}

function Pill({ label, ok }: { label: string; ok: boolean }) {
  return (
    <View style={[styles.pill, ok ? styles.pillOk : styles.pillWarn]}>
      <Text style={[styles.pillText, ok ? styles.pillOkText : styles.pillWarnText]}>{label}</Text>
    </View>
  );
}
function message(err: unknown) {
  return err instanceof Error ? err.message : 'Beklenmeyen hata';
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderWidth: 1, borderRadius: 8, padding: 14, gap: 12 },
  sectionTitle: { color: '#0f172a', fontSize: 16, fontWeight: '800' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  flexOne: { flex: 1 },
  muted: { color: '#64748b', fontSize: 13, lineHeight: 18 },
  permissionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  pillOk: { backgroundColor: '#dcfce7' },
  pillWarn: { backgroundColor: '#fee2e2' },
  pillText: { fontSize: 12, fontWeight: '800' },
  pillOkText: { color: '#166534' },
  pillWarnText: { color: '#991b1b' },
  manualRow: { flexDirection: 'row', gap: 8 },
  input: {
    minHeight: 44,
    borderColor: '#cbd5e1',
    borderWidth: 1,
    borderRadius: 8,
    color: '#0f172a',
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    fontSize: 15,
  },
  manualInput: { flex: 1 },
  sendBtn: { minWidth: 96 },
  listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 2 },
  link: { color: '#0f172a', fontWeight: '800' },
  suggestionList: { gap: 10 },
  empty: { borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', borderStyle: 'dashed', padding: 18, alignItems: 'center', gap: 6 },
  emptyTitle: { color: '#0f172a', fontSize: 15, fontWeight: '800' },
});
