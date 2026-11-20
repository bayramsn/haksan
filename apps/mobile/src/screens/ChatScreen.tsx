import { useState, useCallback, useRef } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { chatService } from '@/src/api/services';
import { useAuth } from '@/src/auth/AuthProvider';
const PRIMARY = '#000c69';
interface Conversation { id: string; participantName: string; participantCompany: string; lastMessage: string; lastMessageTime: string; unreadCount: number; avatarColor: string; }
export function ChatScreen() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sequence = useRef(0);
  const load = useCallback(async () => {
    const request = ++sequence.current;
    setLoading(true); setError(null);
    try {
      const rows = await chatService.conversations();
      if (request !== sequence.current) return;
      setConversations(rows.map((row: any) => ({ id: row.id,
        participantName: row.title || row.members.filter((m: any) => m.userId !== user?.id).map((m: any) => m.fullName ?? m.user?.fullName).filter(Boolean).join(', ') || 'Sohbet',
        participantCompany: row.type === 'group' ? 'Grup sohbeti' : 'CRM sohbeti',
        lastMessage: row.lastMessage?.preview ?? '', lastMessageTime: row.lastActivityAt ? new Date(row.lastActivityAt).toLocaleString('tr-TR') : '',
        unreadCount: row.unreadCount, avatarColor: PRIMARY,
      })));
    } catch (e) { if (request === sequence.current) setError(e instanceof Error ? e.message : 'Sohbetler yüklenemedi.'); }
    finally { if (request === sequence.current) setLoading(false); }
  }, [user?.id]);
  useFocusEffect(useCallback(() => { void load(); return () => { sequence.current++; }; }, [load]));
  const filtered = conversations.filter(c => `${c.participantName} ${c.lastMessage}`.toLocaleLowerCase('tr-TR').includes(search.toLocaleLowerCase('tr-TR')));
  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Sohbet</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Search */}
      <View style={styles.searchBar}>
        <View style={styles.searchWrapper}>
          <Ionicons name="search" size={16} color="#9ca3af" />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Konuşma ara..."
            placeholderTextColor="#9ca3af"
          />
        </View>
      </View>

      {/* List */}
      <ScrollView style={{ flex: 1 }} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}>
        {error ? <TouchableOpacity onPress={() => void load()}><Text style={{ color: '#cf060c', padding: 20 }}>{error} · Tekrar dene</Text></TouchableOpacity> : null}
        {!loading && !error && !filtered.length ? <Text style={{ padding: 24 }}>Konuşma bulunamadı.</Text> : null}
        {filtered.map(conv => (
          <TouchableOpacity
            key={conv.id}
            style={styles.listRow}
            onPress={() => router.push(`/modules/chat/${conv.id}`)}
            activeOpacity={0.7}
          >
            <View style={styles.listAvatarWrap}>
              <View style={[styles.avatarMd, { backgroundColor: conv.avatarColor }]}>
                <Text style={styles.avatarTextMd}>
                  {conv.participantName.split(' ').map(w => w[0]).join('').slice(0, 2)}
                </Text>
              </View>
              {conv.unreadCount > 0 && (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadBadgeText}>{conv.unreadCount}</Text>
                </View>
              )}
            </View>

            <View style={styles.listInfo}>
              <View style={styles.listInfoTop}>
                <Text style={[styles.listName, conv.unreadCount > 0 && { fontWeight: '800', color: '#111827' }]} numberOfLines={1}>
                  {conv.participantName}
                </Text>
                <Text style={styles.listTime}>{conv.lastMessageTime}</Text>
              </View>
              <Text style={styles.listCompany} numberOfLines={1}>{conv.participantCompany}</Text>
              <Text style={[styles.listMsg, conv.unreadCount > 0 && { fontWeight: '600', color: '#374151' }]} numberOfLines={1}>
                {conv.lastMessage}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
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
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  headerTitle: { fontSize: 16, fontWeight: 'bold', color: '#111827' },
  
  searchBar: { backgroundColor: '#ffffff', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' },
  searchWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f9fafb', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  searchInput: { flex: 1, fontSize: 14, color: '#374151', padding: 0 },

  listRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffffff', padding: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.03)' },
  listAvatarWrap: { position: 'relative', marginRight: 12 },
  avatarMd: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  avatarTextMd: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' },
  unreadBadge: { position: 'absolute', top: -2, right: -2, backgroundColor: PRIMARY, minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#ffffff', paddingHorizontal: 4 },
  unreadBadgeText: { color: '#ffffff', fontSize: 10, fontWeight: 'bold' },

  listInfo: { flex: 1 },
  listInfoTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  listName: { fontSize: 14, fontWeight: '600', color: '#1f2937', flex: 1 },
  listTime: { fontSize: 11, color: '#9ca3af', marginLeft: 8 },
  listCompany: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  listMsg: { fontSize: 13, color: '#9ca3af', marginTop: 4 },

  threadHeader: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffffff', paddingHorizontal: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' },
  avatarSm: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginHorizontal: 8 },
  avatarTextSm: { color: '#ffffff', fontSize: 14, fontWeight: 'bold' },
  threadHeaderInfo: { flex: 1, marginHorizontal: 4 },
  threadName: { fontSize: 14, fontWeight: '700', color: '#111827' },
  threadCompany: { fontSize: 11, color: '#6b7280' },

  messagesArea: { flex: 1, backgroundColor: '#f7f7f8' },
  messagesContent: { padding: 16, gap: 12 },

  emptyState: { alignItems: 'center', justifyContent: 'center', flex: 1, marginTop: 100 },
  avatarLg: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  avatarTextLg: { color: '#ffffff', fontSize: 24, fontWeight: 'bold' },
  emptyName: { fontSize: 16, fontWeight: '700', color: '#111827' },
  emptyCompany: { fontSize: 13, color: '#6b7280', marginTop: 4 },
  emptyPrompt: { fontSize: 13, color: '#9ca3af', marginTop: 16 },

  msgRow: { flexDirection: 'row' },
  msgRowOwn: { justifyContent: 'flex-end' },
  msgRowOther: { justifyContent: 'flex-start' },
  msgBubble: { maxWidth: '75%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20 },
  msgBubbleOwn: { backgroundColor: PRIMARY, borderBottomRightRadius: 4 },
  msgBubbleOther: { backgroundColor: '#ffffff', borderBottomLeftRadius: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  msgText: { fontSize: 14, lineHeight: 20 },
  msgTime: { fontSize: 10, textAlign: 'right', marginTop: 4 },

  inputArea: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffffff', paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.05)' },
  inputWrapper: { flex: 1, backgroundColor: '#f9fafb', borderRadius: 20, paddingHorizontal: 16, paddingVertical: Platform.OS === 'ios' ? 12 : 8, marginRight: 12 },
  input: { fontSize: 14, color: '#1f2937', maxHeight: 100 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: PRIMARY, alignItems: 'center', justifyContent: 'center' },
});
