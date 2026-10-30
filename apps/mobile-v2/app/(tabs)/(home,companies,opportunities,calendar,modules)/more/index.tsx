import { useRef, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '@/src/auth/AuthProvider';
import { Avatar } from '@/src/ui/Avatar';
import { Card, ScreenHeader } from '@/src/ui';
import { toast } from '@/src/ui/toast';
import { SettingsGroup, SettingsRow } from '@/src/ui/settings';
import { SyncStatus } from '@/src/ui/SyncStatus';
import { useNavigationBottomInset } from '@/src/ui/LiquidGlassTabBarBackground';

export default function MoreScreen() {
  const GLASS_TAB_BAR_HEIGHT = useNavigationBottomInset();
  const router = useRouter();
  const { user, scope, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const signOutPending = useRef(false);
  const divisionName = user?.divisions?.find((item) => item.id === scope.divisionId)?.name ??
    (user?.canViewAllDivisions && !scope.divisionId ? 'Tüm bölümler' : 'Varsayılan bölüm');
  const departmentName = user?.departments?.find((item) => item.id === scope.departmentId)?.name;

  function confirmSignOut() {
    if (signOutPending.current) return;
    signOutPending.current = true;
    Alert.alert('Çıkış yap', 'Oturumunuz bu cihazda kapatılacak.', [
      { text: 'Vazgeç', style: 'cancel', onPress: () => { signOutPending.current = false; } },
      {
        text: 'Çıkış yap',
        style: 'destructive',
        onPress: () => {
          setBusy(true);
          void signOut().catch(() => toast.error('Oturum kapatılamadı. Yeniden deneyin.')).finally(() => {
            setBusy(false);
            signOutPending.current = false;
          });
        },
      },
    ], { cancelable: false });
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <SyncStatus />
      <ScreenHeader title="Profil ve Hesap" hideProfile />

      <ScrollView contentContainerClassName="gap-3 px-4 pt-1" contentContainerStyle={{ paddingBottom: 40 + GLASS_TAB_BAR_HEIGHT }}>
        <Card className="flex-row items-center gap-3">
          <Avatar name={user?.fullName ?? '?'} size={44} />
          <View className="flex-1 gap-0.5">
            <Text className="text-[16px] font-inter-semibold text-foreground" numberOfLines={1}>
              {user?.fullName ?? '—'}
            </Text>
            <Text className="font-inter text-[12px] text-muted-foreground" numberOfLines={1}>
              {user?.email ?? '—'}
            </Text>
            {user?.roles?.length ? (
              <Text className="font-inter text-[11px] text-muted-foreground" numberOfLines={1}>
                {user.roles.join(' · ')}
              </Text>
            ) : null}
          </View>
        </Card>

        <SettingsGroup title="Çalışma alanı">
          <SettingsRow first icon="git-branch-outline" tone="stage" title={divisionName}
            subtitle={departmentName ? `Departman: ${departmentName}` : 'Bölüm ve departman seçimini değiştirin.'}
            onPress={() => router.push('/more/scope')} />
        </SettingsGroup>

        <SettingsGroup title="Hesap">
          <SettingsRow
            first
            icon="person-outline"
            tone="info"
            title="Profil Bilgileri"
            subtitle="Kullanıcı bilgilerinizi görüntüleyin."
            onPress={() => router.push('/more/profile')}
          />
          <SettingsRow
            icon="settings-outline"
            tone="neutral"
            title="Ayarlar"
            subtitle="Tercihler, şirket ayarları, destek ve sürüm bilgisi."
            onPress={() => router.push('/more/settings')}
          />
        </SettingsGroup>

        <SettingsGroup>
          <SettingsRow
            first
            icon="log-out-outline"
            danger
            title={busy ? 'Çıkış yapılıyor...' : 'Çıkış Yap'}
            onPress={confirmSignOut}
          />
        </SettingsGroup>
      </ScrollView>
    </SafeAreaView>
  );
}
