import { useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '@/src/auth/AuthProvider';
import { Avatar } from '@/src/ui/Avatar';
import { Card, ScreenHeader } from '@/src/ui';
import { SettingsGroup, SettingsRow } from '@/src/ui/settings';
import { SyncStatus } from '@/src/ui/SyncStatus';

export default function MoreScreen() {
  const router = useRouter();
  const { user, scope, signOut } = useAuth();
  const [busy, setBusy] = useState(false);

  function confirmSignOut() {
    Alert.alert('Çıkış yap', 'Oturumunuz bu cihazda kapatılacak.', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Çıkış yap',
        style: 'destructive',
        onPress: () => {
          setBusy(true);
          void signOut().finally(() => setBusy(false));
        },
      },
    ]);
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['left', 'right']}>
      <SyncStatus />
      <ScreenHeader title="Hesap" />

      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerClassName="gap-6 px-4 pb-10 pt-4">
        <Card className="flex-row items-center gap-3">
          <Avatar name={user?.fullName ?? '?'} size={52} />
          <View className="flex-1 gap-0.5">
            <Text className="text-[17px] font-inter-semibold text-foreground" numberOfLines={1}>
              {user?.fullName ?? '—'}
            </Text>
            <Text className="font-inter text-[13px] text-muted-foreground" numberOfLines={1}>
              {user?.email ?? '—'}
            </Text>
            {user?.roles?.length ? (
              <Text className="font-inter text-[12px] text-muted-foreground" numberOfLines={1}>
                {user.roles.join(' · ')}
              </Text>
            ) : null}
          </View>
        </Card>

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
            icon="git-branch-outline"
            tone="stage"
            title="Çalışma Alanı"
            subtitle={
              user?.divisions?.find((item) => item.id === scope.divisionId)?.name ??
              (user?.canViewAllDivisions ? 'Tüm bölümler' : 'Varsayılan bölüm')
            }
            onPress={() => router.push('/more/scope')}
          />
          <SettingsRow
            icon="mail-outline"
            tone="neutral"
            title="Mail İmzası"
            subtitle="Bağlı mail hesabı ve imzanız."
            onPress={() => router.push('/more/signature')}
          />
        </SettingsGroup>

        <SettingsGroup title="İletişim">
          <SettingsRow
            first
            icon="notifications-outline"
            tone="warning"
            title="Bildirimler"
            subtitle="Görev ve süreç bildirimlerinizi görüntüleyin."
            onPress={() => router.push('/notifications')}
          />
          <SettingsRow
            icon="chatbubbles-outline"
            tone="success"
            title="Sohbet"
            subtitle="Ekip konuşmalarına erişin."
            onPress={() => router.push('/chat')}
          />
        </SettingsGroup>

        <SettingsGroup title="Uygulama tercihleri">
          <SettingsRow
            first
            icon="settings-outline"
            tone="neutral"
            title="Ayarlar"
            subtitle="Uygulama tercihlerinizi yönetin."
            onPress={() => router.push('/more/settings')}
          />
        </SettingsGroup>

        <SettingsGroup title="Uygulama bilgileri">
          <SettingsRow
            first
            icon="information-circle-outline"
            tone="neutral"
            title="Hakkında"
            subtitle="Sürüm ve lisans bilgileri."
            onPress={() => router.push('/more/about')}
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
