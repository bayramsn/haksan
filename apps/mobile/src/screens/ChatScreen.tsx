import { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

const PRIMARY = '#000c69';

interface Conversation {
  id: string;
  participantName: string;
  participantCompany: string;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
  avatarColor: string;
}

interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  content: string;
  timestamp: string;
  isOwn: boolean;
}

const mockConversations: Conversation[] = [
  { id: 'cv1', participantName: 'Ahmet Yılmaz', participantCompany: 'Haksan Makine A.Ş.', lastMessage: 'Teklifimizi inceledik, birkaç değişiklik istiyoruz', lastMessageTime: '10:24', unreadCount: 3, avatarColor: '#000c69' },
  { id: 'cv2', participantName: 'Can Arslan', participantCompany: 'Bora Sanayi Ltd.', lastMessage: 'Servis randevusu için müsait misiniz?', lastMessageTime: '09:15', unreadCount: 1, avatarColor: '#F97316' },
  { id: 'cv3', participantName: 'Ayşe Arslan', participantCompany: 'Atalay Endüstri A.Ş.', lastMessage: 'Proforma faturayı aldık, teşekkürler', lastMessageTime: 'Dün', unreadCount: 2, avatarColor: '#EF4444' },
  { id: 'cv4', participantName: 'Ali Demir', participantCompany: 'Precision CNC Ltd.', lastMessage: 'Merhaba, sipariş onayı için arayacağım', lastMessageTime: 'Dün', unreadCount: 0, avatarColor: '#F59E0B' },
  { id: 'cv5', participantName: 'Mert Yıldız', participantCompany: 'Delta Teknoloji A.Ş.', lastMessage: 'Stok durumu hakkında bilgi alabilir miyim?', lastMessageTime: 'Salı', unreadCount: 0, avatarColor: '#6366F1' },
];

const initialMessages: ChatMessage[] = [
  { id: 'm1', conversationId: 'cv1', senderId: 'ahmet', senderName: 'Ahmet Yılmaz', content: 'Merhaba, gönderdiğiniz teklifi inceledik.', timestamp: '10:15', isOwn: false },
  { id: 'm2', conversationId: 'cv1', senderId: 'me', senderName: 'Ben', content: 'Merhaba Ahmet Bey, değerlendirmeniz için teşekkürler. Nasıl buldunuz?', timestamp: '10:18', isOwn: true },
  { id: 'm3', conversationId: 'cv1', senderId: 'ahmet', senderName: 'Ahmet Yılmaz', content: 'Genel olarak uygun, ancak teslimat süresi konusunda daha esnek olabilir misiniz?', timestamp: '10:20', isOwn: false },
  { id: 'm4', conversationId: 'cv1', senderId: 'me', senderName: 'Ben', content: 'Evet, 4 hafta yerine 3 haftaya çekebiliriz. Başka bir talebiniz var mı?', timestamp: '10:22', isOwn: true },
  { id: 'm5', conversationId: 'cv1', senderId: 'ahmet', senderName: 'Ahmet Yılmaz', content: 'Teklifimizi inceledik, birkaç değişiklik istiyoruz', timestamp: '10:24', isOwn: false },
];

/** Stitch #11 Sohbet */
export function ChatScreen() {
  const [search, setSearch] = useState('');
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState(initialMessages);

  const filtered = mockConversations.filter(c =>
    `${c.participantName} ${c.participantCompany}`.toLowerCase().includes(search.toLowerCase())
  );

  const convMessages = messages.filter(m => m.conversationId === activeConv?.id);

  const handleSend = () => {
    if (!inputText.trim() || !activeConv) return;
    const newMsg: ChatMessage = {
      id: `m-${Date.now()}`,
      conversationId: activeConv.id,
      senderId: 'me',
      senderName: 'Ben',
      content: inputText.trim(),
      timestamp: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
      isOwn: true,
    };
    setMessages(prev => [...prev, newMsg]);
    setInputText('');
  };

  if (activeConv) {
    return (
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {/* Thread Header */}
          <View style={styles.threadHeader}>
            <TouchableOpacity onPress={() => setActiveConv(null)} style={{ padding: 8 }}>
              <Ionicons name="arrow-back" size={24} color="#374151" />
            </TouchableOpacity>
            
            <View style={[styles.avatarSm, { backgroundColor: activeConv.avatarColor }]}>
              <Text style={styles.avatarTextSm}>
                {activeConv.participantName.split(' ').map(w => w[0]).join('').slice(0, 2)}
              </Text>
            </View>
            
            <View style={styles.threadHeaderInfo}>
              <Text style={styles.threadName}>{activeConv.participantName}</Text>
              <Text style={styles.threadCompany}>{activeConv.participantCompany}</Text>
            </View>

            <TouchableOpacity style={{ padding: 8 }}>
              <Ionicons name="call-outline" size={20} color="#6b7280" />
            </TouchableOpacity>
            <TouchableOpacity style={{ padding: 8 }}>
              <Ionicons name="ellipsis-vertical" size={20} color="#6b7280" />
            </TouchableOpacity>
          </View>

          {/* Messages */}
          <ScrollView style={styles.messagesArea} contentContainerStyle={styles.messagesContent}>
            {convMessages.length === 0 ? (
              <View style={styles.emptyState}>
                <View style={[styles.avatarLg, { backgroundColor: activeConv.avatarColor, marginBottom: 12 }]}>
                  <Text style={styles.avatarTextLg}>
                    {activeConv.participantName.split(' ').map(w => w[0]).join('').slice(0, 2)}
                  </Text>
                </View>
                <Text style={styles.emptyName}>{activeConv.participantName}</Text>
                <Text style={styles.emptyCompany}>{activeConv.participantCompany}</Text>
                <Text style={styles.emptyPrompt}>Konuşmaya başlamak için mesaj yazın</Text>
              </View>
            ) : (
              convMessages.map(msg => (
                <View key={msg.id} style={[styles.msgRow, msg.isOwn ? styles.msgRowOwn : styles.msgRowOther]}>
                  <View style={[styles.msgBubble, msg.isOwn ? styles.msgBubbleOwn : styles.msgBubbleOther]}>
                    <Text style={[styles.msgText, msg.isOwn ? { color: '#ffffff' } : { color: '#1f2937' }]}>
                      {msg.content}
                    </Text>
                    <Text style={[styles.msgTime, msg.isOwn ? { color: 'rgba(255,255,255,0.7)' } : { color: '#9ca3af' }]}>
                      {msg.timestamp}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </ScrollView>

          {/* Input */}
          <View style={styles.inputArea}>
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                value={inputText}
                onChangeText={setInputText}
                placeholder="Mesaj yazın..."
                placeholderTextColor="#9ca3af"
                multiline
              />
            </View>
            <TouchableOpacity
              onPress={handleSend}
              disabled={!inputText.trim()}
              style={[styles.sendBtn, !inputText.trim() && { opacity: 0.4 }]}
            >
              <Ionicons name="send" size={16} color="#ffffff" style={{ marginLeft: 4 }} />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

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
      <ScrollView style={{ flex: 1 }}>
        {filtered.map(conv => (
          <TouchableOpacity
            key={conv.id}
            style={styles.listRow}
            onPress={() => setActiveConv(conv)}
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
