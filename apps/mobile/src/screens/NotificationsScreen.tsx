import { useState, useCallback, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { notificationService } from '@/src/api/services';
import { getModuleConfig } from '@/src/modules/registry';

const TYPE_ICONS: Record<string, string> = {
  service: '🔧', offer: '📄', payment: '💰', finance: '📅', complaint: '⚠️', stock: '📦', warranty: '🛡️',
};

export function NotificationsScreen() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const sequence = useRef(0);
  const load = useCallback(async () => {
    const request = ++sequence.current;
    setLoading(true); setError(null);
    try {
      const rows: any[] = [];
      for (let page = 1; ; page++) {
        const result = await notificationService.list({ page, pageSize: 100 });
        if (request !== sequence.current) return;
        rows.push(...result.data.map(row => ({ ...row, read: Boolean(row.readAt), time: new Date(row.createdAt).toLocaleString('tr-TR'), color: '#000c69' })));
        if (page >= result.meta.totalPages || result.data.length < 100) break;
      }
      setNotifications(rows);
    } catch (e) { if (request === sequence.current) setError(e instanceof Error ? e.message : 'Bildirimler yüklenemedi.'); }
    finally { if (request === sequence.current) setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { void load(); return () => { sequence.current++; }; }, [load]));
  const unreadCount = notifications.filter(n => !n.read).length;
  const markAsRead = async (id: string, navigate = true) => {
    const item = notifications.find(n => n.id === id);
    try {
      if (!item?.read) await notificationService.markRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
      if (!navigate) return;
      const target = item?.target;
      if (target?.kind === 'company') router.push(`/modules/customers/${encodeURIComponent(target.companyId)}`);
      else if (target?.kind === 'opportunity') router.push(`/modules/sales-cases/${encodeURIComponent(target.opportunityId)}`);
      else if (target?.kind === 'navigate' && getModuleConfig(target.nav)) router.push(`/modules/${target.nav}`);
    } catch (e) { Alert.alert('Bildirim güncellenemedi', e instanceof Error ? e.message : 'Tekrar deneyin.'); }
  };
  const markAllAsRead = async () => {
    if (saving) return;
    setSaving(true);
    try {
      for (const item of notifications.filter(n => !n.read)) {
        await notificationService.markRead(item.id);
        setNotifications(prev => prev.map(n => n.id === item.id ? { ...n, read: true } : n));
      }
    } catch (e) { Alert.alert('İşlem tamamlanamadı', e instanceof Error ? e.message : 'Tekrar deneyin.'); }
    finally { setSaving(false); }
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
        <TouchableOpacity disabled={saving || loading} onPress={() => void markAllAsRead()} style={styles.headerRight}>
          <Ionicons name="checkmark-done" size={16} color="#000c69" />
          <Text style={styles.headerMarkText}>Tümünü okundu işaretle</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.listArea} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}>
        {error ? <TouchableOpacity onPress={() => void load()}><Text style={{ padding: 20, color: '#cf060c' }}>{error} · Tekrar dene</Text></TouchableOpacity> : null}
        {notifications.map((notif) => (
          <TouchableOpacity
            key={notif.id}
            style={[styles.row, notif.read ? styles.rowRead : styles.rowUnread]}
            onPress={() => void markAsRead(notif.id)}
            activeOpacity={0.7}
          >
            {/* Icon */}
            <View style={[styles.iconWrap, { backgroundColor: `${notif.color}18` }]}>
              <Text style={styles.iconText}>{TYPE_ICONS[notif.type] ?? '🔔'}</Text>
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

        {!loading && !error && notifications.length === 0 && (
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
