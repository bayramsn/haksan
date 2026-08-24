import { Linking, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { apiBaseUrl } from '@/src/api/config';
import { Card, DetailHeader } from '@/src/ui';
import { SettingsGroup, SettingsRow } from '@/src/ui/settings';

const SITE = 'https://www.haksanmakina.com.tr';

export default function AboutScreen() {
  const version = Constants.expoConfig?.version ?? '—';
  // Native derlemede build numarası platforma göre farklı alanda tutulur.
  const build =
    Constants.expoConfig?.ios?.buildNumber ?? String(Constants.expoConfig?.android?.versionCode ?? '—');

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <DetailHeader title="Hakkında" />

      <ScrollView contentContainerClassName="gap-4 px-4 pb-10 pt-4">
        <Card className="items-center gap-1 py-8">
          <Text className="font-display text-[30px] tracking-display text-foreground">Haksan Makina</Text>
          <Text className="font-inter-semibold text-[13px] text-primary">ERP</Text>
          <Text className="pt-2 font-inter text-[13px] text-muted-foreground">
            v{version} ({build})
          </Text>
        </Card>

        <SettingsGroup title="Bağlantılar">
          <SettingsRow
            first
            icon="globe-outline"
            tone="info"
            title="Web Sitesi"
            subtitle={SITE.replace('https://', '')}
            onPress={() => void Linking.openURL(SITE)}
          />
          <SettingsRow
            icon="server-outline"
            tone="neutral"
            title="Bağlı Sunucu"
            subtitle={apiBaseUrl()}
            onPress={() => {}}
          />
        </SettingsGroup>

        <View className="items-center pt-2">
          <Text className="font-inter text-[12px] text-muted-foreground">
            © {new Date().getFullYear()} Haksan Makina San. ve Tic. A.Ş.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
