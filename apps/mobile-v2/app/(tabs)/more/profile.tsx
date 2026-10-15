import { Linking, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/src/auth/AuthProvider';
import { Avatar } from '@/src/ui/Avatar';
import { Card, Chip, DetailHeader, Eyebrow } from '@/src/ui';
import { SettingsGroup, SettingsRow } from '@/src/ui/settings';

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <View className="flex-row justify-between gap-4 border-b border-border py-2.5 last:border-b-0">
      <Text className="font-inter text-sm text-muted-foreground">{label}</Text>
      <Text className="flex-1 text-right font-inter text-sm text-foreground" numberOfLines={2}>
        {value || '—'}
      </Text>
    </View>
  );
}

export default function ProfileScreen() {
  const { user } = useAuth();

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <DetailHeader title="Profil Bilgileri" />

      <ScrollView contentContainerClassName="gap-4 px-4 pb-10 pt-4">
        <Card className="items-center gap-2 py-6">
          <Avatar name={user?.fullName ?? '?'} size={72} />
          <Text className="text-[19px] font-inter-semibold text-foreground">{user?.fullName ?? '—'}</Text>
          <Text className="font-inter text-[13px] text-muted-foreground">{user?.email ?? '—'}</Text>
          {user?.roles?.length ? (
            <View className="flex-row flex-wrap justify-center gap-1.5 pt-1">
              {user.roles.map((role) => (
                <Chip key={role} tone="info" label={role} />
              ))}
            </View>
          ) : null}
        </Card>

        <Card>
          <Row label="Kullanıcı" value={user?.fullName} />
          <Row label="E-posta" value={user?.email} />
          <Row label="Departman" value={user?.departmentId ? 'Tanımlı' : null} />
          <Row
            label="Bölüm"
            value={user?.canViewAllDivisions ? 'Tüm bölümler' : user?.divisions?.map((d) => d.name).join(', ')}
          />
        </Card>

        {user?.permissions?.length ? (
          <View className="gap-1.5">
            <View className="px-1">
              <Eyebrow>Yetkiler ({user.permissions.length})</Eyebrow>
            </View>
            <Card>
              <View className="flex-row flex-wrap gap-1.5">
                {user.permissions.map((permission) => (
                  <Chip key={permission} tone="neutral" label={permission} />
                ))}
              </View>
            </Card>
          </View>
        ) : null}

        <SettingsGroup title="Hesap">
          <SettingsRow
            first
            icon="key-outline"
            tone="warning"
            title="Şifre Değiştir"
            // Mobilde şifre değiştirme ucu yok; web paneline yönlendiriliyor.
            subtitle="Web panelinden yapılır."
            onPress={() => void Linking.openURL('https://crm.haksanmakina.com.tr')}
          />
        </SettingsGroup>
      </ScrollView>
    </SafeAreaView>
  );
}
