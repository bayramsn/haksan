import { Linking, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/src/auth/AuthProvider';
import { Avatar } from '@/src/ui/Avatar';
import { FormSection } from '@/src/ui/forms/FormSection';
import { useNavigationBottomInset } from '@/src/ui/LiquidGlassTabBarBackground';
import { Card, Chip, DetailHeader, Eyebrow } from '@/src/ui';
import { SettingsGroup, SettingsRow } from '@/src/ui/settings';

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <View className="gap-1 border-b border-border py-2 last:border-b-0">
      <Text className="font-inter text-[12px] text-muted-foreground">{label}</Text>
      <Text selectable className="font-inter text-[14px] leading-[20px] text-foreground">
        {value || '—'}
      </Text>
    </View>
  );
}

export default function ProfileScreen() {
  const { user } = useAuth();
  const bottom = useNavigationBottomInset();

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <DetailHeader title="Profil Bilgileri" compact />

      <ScrollView contentContainerStyle={{ width: '100%', maxWidth: 760, alignSelf: 'center', paddingBottom: bottom + 24 }} contentContainerClassName="gap-3 px-4 pt-2">
        <Card className="items-center gap-1.5 p-3 py-4">
          <Avatar name={user?.fullName ?? '?'} size={56} />
          <Text className="text-center text-[18px] font-inter-semibold text-foreground">{user?.fullName ?? '—'}</Text>
          <Text className="font-inter text-[12px] text-muted-foreground">{user?.email ?? '—'}</Text>
          {user?.roles?.length ? (
            <View className="flex-row flex-wrap justify-center gap-1.5 pt-0.5">
              {user.roles.map((role) => (
                <Chip key={role} tone="info" label={role} />
              ))}
            </View>
          ) : null}
        </Card>

        <Card>
          <Row label="Kullanıcı" value={user?.fullName} />
          <Row label="E-posta" value={user?.email} />
          <Row
            label="Departman"
            value={
              user?.departments?.length
                ? [...user.departments].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary)).map((d) => d.name).join(', ')
                : null
            }
          />
          <Row
            label="Bölüm"
            value={user?.canViewAllDivisions ? 'Tüm bölümler' : user?.divisions?.map((d) => d.name).join(', ')}
          />
        </Card>

        {user?.permissions?.length ? (
          <View className="gap-1.5">
            <View className="px-1">
              <Eyebrow>Yetkiler</Eyebrow>
            </View>
            <FormSection title="Erişim yetkilerim" hint="Hesabınıza tanımlanan izinler" icon="shield-checkmark-outline" collapsible initiallyOpen={false}>
              <View className="flex-row flex-wrap gap-1.5">
                {user.permissions.map((permission) => (
                  <Chip key={permission} tone="neutral" label={permission} />
                ))}
              </View>
            </FormSection>
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
