import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useAuth } from '@/src/auth/AuthProvider';

type IonIcon = React.ComponentProps<typeof Ionicons>['name'];

interface MoreMenuItem {
  key: string;
  label: string;
  icon: IonIcon;
  adminBadge?: boolean;
}

interface MoreMenuSection {
  title: string;
  items: MoreMenuItem[];
}

const MORE_MENU_SECTIONS: MoreMenuSection[] = [
  {
    title: 'Satış',
    items: [
      { key: 'customers', label: 'Firmalar', icon: 'business-outline' },
      { key: 'contacts', label: 'Kontaklar', icon: 'people-outline' },
      { key: 'sales-cases', label: 'Satış Kartları', icon: 'pricetag-outline' },
      { key: 'offers', label: 'Teklifler', icon: 'document-text-outline' },
      { key: 'documents', label: 'Dokümanlar', icon: 'document-outline' },
    ],
  },
  {
    title: 'Operasyon',
    items: [
      { key: 'stock', label: 'Stok', icon: 'layers-outline' },
      { key: 'payments', label: 'Ödemeler', icon: 'card-outline' },
      { key: 'due-dates', label: 'Vade Takibi', icon: 'time-outline' },
      { key: 'products', label: 'Ürünler', icon: 'cube-outline' },
      { key: 'purchase-orders', label: 'Satın Alma', icon: 'cart-outline' },
      { key: 'shipments', label: 'Sevkiyat', icon: 'airplane-outline' },
    ],
  },
  {
    title: 'Servis',
    items: [
      { key: 'service-requests', label: 'Servis Talepleri', icon: 'medkit-outline' },
      { key: 'machines', label: 'Makineler', icon: 'hardware-chip-outline' },
      { key: 'service-kanban', label: 'Servis Kanban', icon: 'albums-outline' },
    ],
  },
  {
    title: 'Genel',
    items: [
      { key: 'calendar', label: 'Takvim', icon: 'calendar-outline' },
      { key: 'chat', label: 'Sohbet', icon: 'chatbubbles-outline' },
      { key: 'notifications', label: 'Bildirimler', icon: 'notifications-outline' },
      { key: 'users', label: 'Kullanıcılar', icon: 'people-outline', adminBadge: true },
    ],
  },
];

export function MoreTabScreen() {
  const { user, logout, hasRole } = useAuth();
  const version = Constants.expoConfig?.version ?? '1.0.0';

  const filterSections = () => {
    return MORE_MENU_SECTIONS.map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        if (item.adminBadge && !hasRole('admin') && !hasRole('super_admin')) return false;
        return true;
      }),
    })).filter((section) => section.items.length > 0);
  };

  const sections = filterSections();

  const getInitials = (name?: string) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>HAKSAN CRM</Text>
        <TouchableOpacity style={styles.headerIconBtn} onPress={() => router.push('/modules/notifications')}>
          <Ionicons name="notifications-outline" size={24} color="#000c69" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Profile Card */}
        <TouchableOpacity style={styles.profileCard} onPress={() => router.push('/modules/settings')} activeOpacity={0.8}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{getInitials(user?.fullName)}</Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{user?.fullName ?? 'Kullanıcı'}</Text>
            <Text style={styles.profileRole}>Profil Ayarları</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
        </TouchableOpacity>

        {/* Menu Sections */}
        {sections.map(section => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.sectionCard}>
              {section.items.map((item, index) => (
                <View key={item.key}>
                  <TouchableOpacity
                    style={styles.menuRow}
                    onPress={() => router.push(`/modules/${item.key}` as any)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name={item.icon} size={22} color="#4b5563" style={styles.menuIcon} />
                    <View style={styles.menuTextWrap}>
                      <Text style={styles.menuLabel}>{item.label}</Text>
                      {item.adminBadge && (
                        <View style={styles.adminBadge}>
                          <Text style={styles.adminBadgeText}>Admin</Text>
                        </View>
                      )}
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="#d1d5db" />
                  </TouchableOpacity>
                  {index < section.items.length - 1 && <View style={styles.divider} />}
                </View>
              ))}
            </View>
          </View>
        ))}

        {/* Footer */}
        <View style={styles.footer}>
          <TouchableOpacity style={styles.logoutBtn} onPress={() => void logout()}>
            <Ionicons name="log-out-outline" size={20} color="#ef4444" />
            <Text style={styles.logoutText}>Çıkış Yap</Text>
          </TouchableOpacity>
          <Text style={styles.versionText}>v{version}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f7f7f8' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#000c69', letterSpacing: -0.5 },
  headerIconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#e0e7ff', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 20, fontWeight: '700', color: '#000c69' },
  profileInfo: { flex: 1, marginLeft: 16 },
  profileName: { fontSize: 16, fontWeight: '600', color: '#111827' },
  profileRole: { fontSize: 13, color: '#6b7280', marginTop: 2 },

  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 12, fontWeight: '600', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginLeft: 12, marginBottom: 8 },
  sectionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  menuRow: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  menuIcon: { marginRight: 16 },
  menuTextWrap: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  menuLabel: { fontSize: 15, color: '#1f2937', fontWeight: '500' },
  adminBadge: { backgroundColor: '#fee2e2', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginLeft: 8 },
  adminBadgeText: { fontSize: 10, fontWeight: '600', color: '#b91c1c' },
  divider: { height: 1, backgroundColor: '#f3f4f6', marginLeft: 54 },

  footer: { alignItems: 'center', marginTop: 16 },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fee2e2', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, marginBottom: 16 },
  logoutText: { fontSize: 15, fontWeight: '600', color: '#ef4444', marginLeft: 8 },
  versionText: { fontSize: 12, color: '#9ca3af' },
});
