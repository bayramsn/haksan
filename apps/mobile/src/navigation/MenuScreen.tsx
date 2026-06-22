import React from 'react';
import { Alert, Text, View, StyleSheet } from 'react-native';
import { useAuth } from '../lib/auth';
import { Button, Card, ListRow, Muted, Screen, SectionTitle, colors, spacing } from '../ui';
import { MODULE_GROUPS, canSeeModule } from './modules';
import { ROUTE_BY_KEY } from './routes';

export function MenuScreen({ navigation }: { navigation: { navigate: (route: string, params?: any) => void } }) {
  const { user, tenant, apiBaseUrl, hasRole, logout } = useAuth();

  const confirmLogout = () => {
    Alert.alert('Çıkış', 'Oturumu kapatmak istiyor musun?', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Çıkış yap', style: 'destructive', onPress: () => void logout() },
    ]);
  };

  const roleLabel = user?.roles?.[0]?.replace(/_/g, ' ') ?? 'Kullanıcı';

  return (
    <Screen>
      <Card>
        <View style={st.accountTop}>
          <View style={st.avatar}>
            <Text style={st.avatarText}>{initials(user?.fullName)}</Text>
          </View>
          <View style={st.flex}>
            <Text style={st.name}>{user?.fullName ?? '—'}</Text>
            <Muted>{user?.email ?? ''}</Muted>
            <Text style={st.role}>{roleLabel}</Text>
          </View>
        </View>
        <Muted>{tenant?.name ? `${tenant.name} · ` : ''}{apiBaseUrl}</Muted>
        <Button label="Çıkış yap" variant="ghost" onPress={confirmLogout} />
      </Card>

      {MODULE_GROUPS.map((group) => {
        const items = group.items.filter((item) => canSeeModule(item, hasRole));
        if (items.length === 0) return null;
        return (
          <View key={group.group} style={st.group}>
            <SectionTitle>{group.group}</SectionTitle>
            <View style={st.list}>
              {items.map((item) => (
                <ListRow
                  key={item.key}
                  title={item.label}
                  onPress={() =>
                    ROUTE_BY_KEY[item.key]
                      ? navigation.navigate(ROUTE_BY_KEY[item.key])
                      : navigation.navigate('Module', { key: item.key, title: item.label })
                  }
                />
              ))}
            </View>
          </View>
        );
      })}
    </Screen>
  );
}

function initials(name?: string | null): string {
  if (!name) return '?';
  return name
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
}

const st = StyleSheet.create({
  accountTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.primaryText, fontWeight: '900', fontSize: 16 },
  flex: { flex: 1 },
  name: { color: colors.text, fontSize: 16, fontWeight: '900' },
  role: { color: colors.accent, fontSize: 12, fontWeight: '800', textTransform: 'capitalize', marginTop: 2 },
  group: { gap: spacing.sm },
  list: { gap: spacing.sm },
});
