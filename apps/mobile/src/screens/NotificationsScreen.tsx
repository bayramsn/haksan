import { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

const MOCK_NOTIFICATIONS = [
  { id: 'n1', title: 'Yeni Servis Talebi', body: 'raifcnc — CNC Freze arızası bildirdi', time: '10 dak', read: false, type: 'service', color: '#EF4444' },
  { id: 'n2', title: 'Teklif Onaylandı', body: 'Omega Endüstri — TKL-2026-003 onaylandı', time: '1 saat', read: false, type: 'offer', color: '#10B981' },
  { id: 'n3', title: 'Ödeme Alındı', body: 'Kaya Metal A.Ş. — €33.700 tahsilat', time: '2 saat', read: false, type: 'payment', color: '#F59E0B' },
  { id: 'n4', title: 'Vade Uyarısı', body: 'Precision CNC Ltd. — 5 gün kaldı', time: 'Dün', read: true, type: 'finance', color: '#F97316' },
  { id: 'n5', title: 'Yeni Şikayet', body: 'Şikayet kutusuna yeni kayıt eklendi', time: 'Dün', read: true, type: 'complaint', color: '#EF4444' },
  { id: 'n6', title: 'Stok Uyarısı', body: 'Kontrol Kartı X1 — kritik seviyede', time: '2 gün', read: true, type: 'stock', color: '#8B5CF6' },
  { id: 'n7', title: 'Garanti Bitiyor', body: 'TC 500 Torna — 7 gün kaldı', time: '2 gün', read: true, type: 'warranty', color: '#6366F1' },
];

const TYPE_ICONS: Record<string, string> = {
  service: '🔧', offer: '📄', payment: '💰', finance: '📅', complaint: '⚠️', stock: '📦', warranty: '🛡️',
};

export function NotificationsScreen() {
  const [notifications, setNotifications] = useState(MOCK_NOTIFICATIONS);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const markAsRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.headerBar}>
        <View style={styles.headerLeft}>
          <Ionicons name="notifications-outline" size={20} color="#4b5563" />
          {unreadCount > 0 && (
            <Text style={styles.headerUnreadText}>{unreadCount} okunmamış</Text>
          )}
        </View>
        <TouchableOpacity onPress={markAllAsRead} style={styles.headerRight}>
          <Ionicons name="checkmark-done" size={16} color="#000c69" />
          <Text style={styles.headerMarkText}>Tümünü okundu işaretle</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.listArea}>
        {notifications.map((notif) => (
          <TouchableOpacity
            key={notif.id}
            style={[styles.row, notif.read ? styles.rowRead : styles.rowUnread]}
            onPress={() => markAsRead(notif.id)}
            activeOpacity={0.7}
          >
            {/* Icon */}
            <View style={[styles.iconWrap, { backgroundColor: `${notif.color}18` }]}>
              <Text style={styles.iconText}>{TYPE_ICONS[notif.type]}</Text>
            </View>

            {/* Content */}
            <View style={styles.contentWrap}>
              <View style={styles.contentTop}>
                <Text style={[styles.title, notif.read ? styles.titleRead : styles.titleUnread]} numberOfLines={1}>
                  {notif.title}
                </Text>
                <Text style={styles.time}>{notif.time}</Text>
              </View>
              <Text style={styles.body} numberOfLines={2}>{notif.body}</Text>
            </View>

            {/* Unread Dot */}
            {!notif.read && (
              <View style={styles.unreadDot} />
            )}
          </TouchableOpacity>
        ))}

        {notifications.length === 0 && (
          <View style={styles.emptyWrap}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="notifications" size={28} color="#d1d5db" />
            </View>
            <Text style={styles.emptyTitle}>Bildirim yok</Text>
            <Text style={styles.emptySubtitle}>Yeni bildirimler burada görünür</Text>
          </View>
        )}
        <View style={{ height: 24 }} />
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerUnreadText: { fontSize: 12, color: '#6b7280' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerMarkText: { fontSize: 12, fontWeight: '600', color: '#000c69' },

  listArea: { flex: 1 },

  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.03)',
  },
  rowRead: { backgroundColor: '#ffffff' },
  rowUnread: { backgroundColor: '#F0F2FF' },

  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  iconText: { fontSize: 18 },

  contentWrap: { flex: 1, minWidth: 0 },
  contentTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 2 },
  title: { fontSize: 14, flex: 1, marginRight: 8 },
  titleRead: { fontWeight: '500', color: '#374151' },
  titleUnread: { fontWeight: '700', color: '#111827' },
  time: { fontSize: 11, color: '#9ca3af' },
  body: { fontSize: 12, color: '#6b7280', marginTop: 2 },

  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#000c69',
    marginTop: 6,
    marginLeft: 8,
  },

  emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 64, paddingHorizontal: 24 },
  emptyIconWrap: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  emptyTitle: { fontSize: 14, fontWeight: '600', color: '#6b7280' },
  emptySubtitle: { fontSize: 12, color: '#9ca3af', marginTop: 4 },
});
