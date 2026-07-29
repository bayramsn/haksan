import { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/src/auth/AuthProvider';
import { notificationService } from '@/src/api/services';
import { normalizeList } from '@/src/modules/registry';
import { DivisionChip } from '@/src/ui/DivisionChip';
import { NotificationBell } from '@/src/ui/NotificationBell';
import { colors, fonts, typography } from '@/src/theme/tokens';

/**
 * Figma kök ekran başlığı: üstte global kontroller (bölüm seçici · bildirim · profil),
 * altta büyük ekran başlığı. Okunmamış bildirim sayısını kendi içinde çeker.
 */
export function RootHeader({ title, right }: { title?: string; right?: React.ReactNode }) {
  const { user } = useAuth();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    void (async () => {
      try {
        const res = await notificationService.list({ unread: true, pageSize: 50 });
        setUnread(normalizeList(res).length);
      } catch {
        /* rozet gizli kalır */
      }
    })();
  }, []);

  return (
    <View style={styles.wrap}>
      <View style={styles.controlsRow}>
        <DivisionChip />
        <View style={styles.right}>
          {right}
          <NotificationBell count={unread} onPress={() => router.push('/modules/notifications')} />
          <TouchableOpacity style={styles.avatar} onPress={() => router.push('/(tabs)/more')}>
            <Text style={styles.avatarText}>{(user?.fullName?.[0] ?? 'H').toUpperCase()}</Text>
          </TouchableOpacity>
        </View>
      </View>
      {title ? (
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 2,
  },
  right: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#ffffff', fontSize: 12, fontFamily: fonts.bold },
  titleRow: { paddingHorizontal: 16, paddingTop: 2, paddingBottom: 10 },
  title: { ...typography.titleLg, color: colors.textPrimary },
});
