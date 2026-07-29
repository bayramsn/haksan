import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { callAssistantService, type CallSuggestionDTO } from '@/src/api/services';

type SuggestionStatus = 'pending' | 'acted' | 'dismissed';
type SuggestionAction = 'create_quote' | 'create_service_ticket' | 'log_call' | 'dismiss';

const STATUS_TABS: Array<{ id: SuggestionStatus; label: string }> = [
  { id: 'pending', label: 'Bekleyen' },
  { id: 'acted', label: 'İşlenen' },
  { id: 'dismissed', label: 'Yoksayılan' },
];

const ACTION_SUCCESS: Record<SuggestionAction, string> = {
  create_quote: 'Teklif taslağı oluşturuldu',
  create_service_ticket: "Şikayet Kutusu'na aktarıldı",
  log_call: 'Arama kaydı oluşturuldu',
  dismiss: 'Arama önerisi kapatıldı',
};

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function CallAssistantScreen() {
  const [status, setStatus] = useState<SuggestionStatus>('pending');
  const [suggestions, setSuggestions] = useState<CallSuggestionDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (nextStatus: SuggestionStatus, viaRefresh = false) => {
    if (viaRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await callAssistantService.suggestions({ status: nextStatus });
      setSuggestions(res.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Çağrı önerileri alınamadı');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(status);
  }, [status, load]);

  const runAction = useCallback(
    async (suggestion: CallSuggestionDTO, action: SuggestionAction) => {
      try {
        await callAssistantService.action(suggestion.id, action);
        setSuggestions((rows) => rows.filter((row) => row.id !== suggestion.id));
        Alert.alert('Tamam', ACTION_SUCCESS[action]);
      } catch (err) {
        Alert.alert('Hata', err instanceof Error ? err.message : 'Arama önerisi işlenemedi');
      }
    },
    []
  );

  const openActions = useCallback(
    (suggestion: CallSuggestionDTO) => {
      if (status !== 'pending') return;
      const buttons: Array<{ text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }> = [];
      if (suggestion.availableActions.createQuote) {
        buttons.push({ text: 'Teklif Oluştur', onPress: () => void runAction(suggestion, 'create_quote') });
      }
      if (suggestion.availableActions.createServiceTicket) {
        buttons.push({ text: 'Servis Kaydı', onPress: () => void runAction(suggestion, 'create_service_ticket') });
      }
      if (suggestion.availableActions.logCall) {
        buttons.push({ text: 'Görüşme Notu', onPress: () => void runAction(suggestion, 'log_call') });
      }
      buttons.push({ text: 'Yoksay', style: 'destructive', onPress: () => void runAction(suggestion, 'dismiss') });
      buttons.push({ text: 'Vazgeç', style: 'cancel' });
      const companyName = suggestion.company.shortName || suggestion.company.legalTitle;
      Alert.alert(companyName, suggestion.title, buttons);
    },
    [status, runAction]
  );

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <View style={styles.headerBar}>
        <View style={styles.headerLeft}>
          <Ionicons name="call-outline" size={20} color="#4b5563" />
          <Text style={styles.headerTitle}>Çağrı Asistanı</Text>
        </View>
        {status === 'pending' && suggestions.length > 0 && (
          <Text style={styles.headerCount}>{suggestions.length} bekleyen</Text>
        )}
      </View>

      <View style={styles.tabRow}>
        {STATUS_TABS.map((tab) => (
          <TouchableOpacity
            key={tab.id}
            style={[styles.tab, status === tab.id && styles.tabActive]}
            onPress={() => setStatus(tab.id)}
          >
            <Text style={[styles.tabText, status === tab.id && styles.tabTextActive]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={suggestions}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(status, true)} />}
        contentContainerStyle={suggestions.length === 0 ? styles.emptyContainer : styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="call" size={28} color="#d1d5db" />
            </View>
            <Text style={styles.emptyTitle}>
              {loading ? 'Yükleniyor…' : error ?? 'Çağrı önerisi yok'}
            </Text>
            {!loading && !error && (
              <Text style={styles.emptySubtitle}>Eşleşen aramalardan gelen öneriler burada görünür</Text>
            )}
          </View>
        }
        renderItem={({ item }) => {
          const missed = item.event.eventType === 'missed';
          const inbound = item.event.direction === 'inbound';
          const companyName = item.company.shortName || item.company.legalTitle;
          return (
            <TouchableOpacity style={styles.row} activeOpacity={0.7} onPress={() => openActions(item)}>
              <View style={[styles.iconWrap, { backgroundColor: missed ? '#FEE2E2' : '#D1FAE5' }]}>
                <Ionicons
                  name={missed ? 'call-outline' : inbound ? 'arrow-down-outline' : 'arrow-up-outline'}
                  size={18}
                  color={missed ? '#EF4444' : '#10B981'}
                />
              </View>
              <View style={styles.contentWrap}>
                <View style={styles.contentTop}>
                  <Text style={styles.title} numberOfLines={1}>{companyName}</Text>
                  <Text style={styles.time}>{formatDateTime(item.createdAt)}</Text>
                </View>
                <Text style={styles.body} numberOfLines={2}>{item.title}</Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {missed ? 'Kaçan arama' : 'Arama bitti'}
                  {item.contact?.fullName ? ` · ${item.contact.fullName}` : ''}
                  {item.event.normalizedPhone ? ` · ${item.event.normalizedPhone}` : ''}
                </Text>
              </View>
              {status === 'pending' && <Ionicons name="chevron-forward" size={16} color="#9ca3af" />}
            </TouchableOpacity>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f7f7f8' },

  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 14, fontWeight: '600', color: '#111827' },
  headerCount: { fontSize: 12, color: '#6b7280' },

  tabRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#f3f4f6',
  },
  tabActive: { backgroundColor: '#000c69' },
  tabText: { fontSize: 12, fontWeight: '500', color: '#4b5563' },
  tabTextActive: { color: '#ffffff' },

  listContent: { paddingBottom: 24 },
  emptyContainer: { flexGrow: 1 },

  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.03)',
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  contentWrap: { flex: 1, minWidth: 0 },
  contentTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 2 },
  title: { fontSize: 14, fontWeight: '600', color: '#111827', flex: 1, marginRight: 8 },
  time: { fontSize: 11, color: '#9ca3af' },
  body: { fontSize: 12, color: '#374151', marginTop: 2 },
  meta: { fontSize: 11, color: '#6b7280', marginTop: 4 },

  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 64, paddingHorizontal: 24 },
  emptyIconWrap: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  emptyTitle: { fontSize: 14, fontWeight: '600', color: '#6b7280', textAlign: 'center' },
  emptySubtitle: { fontSize: 12, color: '#9ca3af', marginTop: 4, textAlign: 'center' },
});
