import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CallAssistantAction } from '@haksan/shared';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  PermissionsAndroid,
  Platform,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { HaksanApi, type CallSuggestion, type HaksanUser } from './api/client';
import { SuggestionCard } from './components/SuggestionCard';
import { CalendarScreen } from './components/CalendarScreen';
import { CalendarSettingsScreen } from './components/CalendarSettingsScreen';
import { runCalendarSync } from './calendarSync';
import { CallAssistantNative, type NativeStatus } from './native/CallAssistantNative';

const STORAGE_KEYS = {
  apiBaseUrl: 'haksan.mobile.apiBaseUrl',
  accessToken: 'haksan.mobile.accessToken',
  email: 'haksan.mobile.email',
};

const DEFAULT_API_BASE_URL =
  Platform.OS === 'android' ? 'http://10.0.2.2:3000/api/v1' : 'http://localhost:3000/api/v1';

export default function App() {
  const [apiBaseUrl, setApiBaseUrl] = useState(DEFAULT_API_BASE_URL);
  const [email, setEmail] = useState('admin@haksan.local');
  const [password, setPassword] = useState('admin12345');
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<HaksanUser | null>(null);
  const [suggestions, setSuggestions] = useState<CallSuggestion[]>([]);
  const [nativeStatus, setNativeStatus] = useState<NativeStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loginBusy, setLoginBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState<Record<string, CallAssistantAction | null>>({});
  const [manualPhone, setManualPhone] = useState('');
  const [manualBusy, setManualBusy] = useState(false);
  const [activeTab, setActiveTab] = useState<'assistant' | 'calendar' | 'settings'>('assistant');

  const api = useMemo(() => new HaksanApi(apiBaseUrl, accessToken), [apiBaseUrl, accessToken]);

  useEffect(() => {
    bootstrap();
  }, []);

  useEffect(() => {
    if (!accessToken) return;
    void refreshAll();
  }, [accessToken, apiBaseUrl]);

  useEffect(() => {
    if (!accessToken) return;
    const sync = () => void runCalendarSync(api).catch(() => {});
    sync();
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') sync(); });
    return () => subscription.remove();
  }, [accessToken, api]);

  const bootstrap = async () => {
    try {
      const [[, savedUrl], [, savedToken], [, savedEmail]] = await AsyncStorage.multiGet([
        STORAGE_KEYS.apiBaseUrl,
        STORAGE_KEYS.accessToken,
        STORAGE_KEYS.email,
      ]);
      if (savedUrl) setApiBaseUrl(savedUrl);
      if (savedEmail) setEmail(savedEmail);
      if (savedToken) {
        setAccessToken(savedToken);
        const restoredApi = new HaksanApi(savedUrl || DEFAULT_API_BASE_URL, savedToken);
        const me = await restoredApi.me();
        setUser(me.user);
        await CallAssistantNative.configure(savedUrl || DEFAULT_API_BASE_URL, savedToken);
      }
      setNativeStatus(await CallAssistantNative.getStatus());
    } catch {
      await AsyncStorage.removeItem(STORAGE_KEYS.accessToken);
      setAccessToken(null);
    } finally {
      setLoading(false);
    }
  };

  const login = async () => {
    setLoginBusy(true);
    try {
      const cleanUrl = apiBaseUrl.trim().replace(/\/$/, '');
      const cleanEmail = email.trim();
      const loginApi = new HaksanApi(cleanUrl);
      const result = await loginApi.login(cleanEmail, password);
      await AsyncStorage.multiSet([
        [STORAGE_KEYS.apiBaseUrl, cleanUrl],
        [STORAGE_KEYS.accessToken, result.accessToken],
        [STORAGE_KEYS.email, cleanEmail],
      ]);
      setApiBaseUrl(cleanUrl);
      setAccessToken(result.accessToken);
      setUser(result.user);
      setNativeStatus(await CallAssistantNative.configure(cleanUrl, result.accessToken));
      Alert.alert('Giriş yapıldı', 'CRM bağlantısı hazır.');
    } catch (err) {
      Alert.alert('Giriş başarısız', errorMessage(err));
    } finally {
      setLoginBusy(false);
    }
  };

  const logout = async () => {
    await CallAssistantNative.setEnabled(false);
    await AsyncStorage.removeItem(STORAGE_KEYS.accessToken);
    setAccessToken(null);
    setUser(null);
    setSuggestions([]);
    setNativeStatus(await CallAssistantNative.getStatus());
  };

  const refreshAll = async () => {
    if (!accessToken) return;
    setRefreshing(true);
    try {
      const [list, status] = await Promise.all([api.suggestions(), CallAssistantNative.getStatus()]);
      setSuggestions(list.data);
      setNativeStatus(status);
    } catch (err) {
      Alert.alert('Yenileme başarısız', errorMessage(err));
    } finally {
      setRefreshing(false);
    }
  };

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
    if (!accessToken) return;
    try {
      if (enabled) {
        const granted = await requestAndroidPermissions();
        if (!granted) {
          Alert.alert('İzin gerekli', 'Arama yakalama için telefon, çağrı geçmişi ve bildirim izinleri gerekli.');
          setNativeStatus(await CallAssistantNative.getStatus());
          return;
        }
        await CallAssistantNative.configure(apiBaseUrl, accessToken);
      }
      setNativeStatus(await CallAssistantNative.setEnabled(enabled));
    } catch (err) {
      Alert.alert('Ayar kaydedilemedi', errorMessage(err));
    }
  };

  const runAction = async (suggestion: CallSuggestion, action: CallAssistantAction) => {
    setActionBusy((prev) => ({ ...prev, [suggestion.id]: action }));
    try {
      await api.action(suggestion.id, action);
      setSuggestions((rows) => rows.filter((row) => row.id !== suggestion.id));
    } catch (err) {
      Alert.alert('İşlem başarısız', errorMessage(err));
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
      const result = await api.sendManualCallEvent({ phoneNumber: phone, eventType: 'completed', direction: 'inbound' });
      setManualPhone('');
      if (result.suggestions.length > 0) {
        await refreshAll();
        Alert.alert('Öneri oluşturuldu', 'Zil ekranında ve mobil listede görebilirsin.');
      } else {
        Alert.alert('Eşleşme yok', `Durum: ${result.event.matchStatus}`);
      }
    } catch (err) {
      Alert.alert('Manuel arama gönderilemedi', errorMessage(err));
    } finally {
      setManualBusy(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8fafc" />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshAll} />}
      >
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Haksan CRM</Text>
          <Text style={styles.heading}>Mobil Sekreter</Text>
          <Text style={styles.subheading}>Android arama olaylarını CRM önerilerine dönüştürür.</Text>
        </View>

        {!accessToken ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>CRM bağlantısı</Text>
            <Field label="API adresi" value={apiBaseUrl} onChangeText={setApiBaseUrl} autoCapitalize="none" />
            <Field label="E-posta" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
            <Field label="Şifre" value={password} onChangeText={setPassword} secureTextEntry />
            <PrimaryButton label="Giriş yap" loading={loginBusy} onPress={login} />
          </View>
        ) : (
          <>
            <View style={styles.card}>
              <View style={styles.rowBetween}>
                <View style={styles.flexOne}>
                  <Text style={styles.sectionTitle}>{user?.fullName || user?.email || 'Kullanıcı'}</Text>
                  <Text style={styles.muted}>{apiBaseUrl}</Text>
                </View>
                <TouchableOpacity style={styles.secondaryButton} onPress={logout}>
                  <Text style={styles.secondaryText}>Çıkış</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.tabBar}>
              {([
                ['assistant', 'Sekreter'],
                ['calendar', 'Takvim'],
                ['settings', 'Ayarlar'],
              ] as const).map(([key, label]) => (
                <TouchableOpacity key={key} onPress={() => setActiveTab(key)} style={[styles.tab, activeTab === key && styles.tabActive]}>
                  <Text style={[styles.tabText, activeTab === key && styles.tabTextActive]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {activeTab === 'assistant' && <>

            <View style={styles.card}>
              <View style={styles.rowBetween}>
                <View style={styles.flexOne}>
                  <Text style={styles.sectionTitle}>Otomatik arama yakalama</Text>
                  <Text style={styles.muted}>
                    {nativeStatus?.available
                      ? 'Arama bitince veya kaçınca CRM’e gönderir.'
                      : 'Native Android modülü bu platformda yok.'}
                  </Text>
                </View>
                <Switch
                  value={!!nativeStatus?.enabled}
                  disabled={!nativeStatus?.available}
                  onValueChange={toggleListener}
                />
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
                />
                <PrimaryButton label="Gönder" loading={manualBusy} onPress={sendManualCall} compact />
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
            </>}
            {activeTab === 'calendar' && <CalendarScreen api={api} />}
            {activeTab === 'settings' && <CalendarSettingsScreen api={api} />}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Field(props: React.ComponentProps<typeof TextInput> & { label: string }) {
  const { label, ...inputProps } = props;
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput style={styles.input} placeholderTextColor="#94a3b8" {...inputProps} />
    </View>
  );
}

function PrimaryButton({
  label,
  loading,
  onPress,
  compact,
}: {
  label: string;
  loading?: boolean;
  onPress: () => void;
  compact?: boolean;
}) {
  return (
    <TouchableOpacity disabled={loading} style={[styles.primaryButton, compact && styles.compactButton]} onPress={onPress}>
      {loading ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryText}>{label}</Text>}
    </TouchableOpacity>
  );
}

function Pill({ label, ok }: { label: string; ok: boolean }) {
  return (
    <View style={[styles.pill, ok ? styles.pillOk : styles.pillWarn]}>
      <Text style={[styles.pillText, ok ? styles.pillOkText : styles.pillWarnText]}>{label}</Text>
    </View>
  );
}

function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : 'Beklenmeyen hata';
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: 18,
    gap: 14,
  },
  header: {
    paddingVertical: 8,
    gap: 4,
  },
  eyebrow: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  heading: {
    color: '#0f172a',
    fontSize: 28,
    fontWeight: '800',
  },
  subheading: {
    color: '#475569',
    fontSize: 14,
    lineHeight: 20,
  },
  card: {
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    gap: 12,
  },
  sectionTitle: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '800',
  },
  field: {
    gap: 6,
  },
  label: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '700',
  },
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
  primaryButton: {
    minHeight: 44,
    borderRadius: 8,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  compactButton: {
    minWidth: 92,
  },
  primaryText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  secondaryButton: {
    minHeight: 38,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  secondaryText: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '800',
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  flexOne: {
    flex: 1,
  },
  muted: {
    color: '#64748b',
    fontSize: 13,
    lineHeight: 18,
  },
  permissionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  pillOk: {
    backgroundColor: '#dcfce7',
  },
  pillWarn: {
    backgroundColor: '#fee2e2',
  },
  pillText: {
    fontSize: 12,
    fontWeight: '800',
  },
  pillOkText: {
    color: '#166534',
  },
  pillWarnText: {
    color: '#991b1b',
  },
  tabBar: {
    flexDirection: 'row',
    borderRadius: 12,
    backgroundColor: '#e2e8f0',
    padding: 4,
    gap: 4,
  },
  tab: {
    flex: 1,
    minHeight: 38,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabActive: {
    backgroundColor: '#0f172a',
  },
  tabText: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '800',
  },
  tabTextActive: {
    color: '#ffffff',
  },
  manualRow: {
    flexDirection: 'row',
    gap: 8,
  },
  manualInput: {
    flex: 1,
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 2,
  },
  link: {
    color: '#0f172a',
    fontWeight: '800',
  },
  suggestionList: {
    gap: 10,
  },
  empty: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderStyle: 'dashed',
    padding: 18,
    alignItems: 'center',
    gap: 6,
  },
  emptyTitle: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '800',
  },
});
