import { Linking, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { apiBaseUrl } from '@/src/api/config';
import { Card, DetailHeader } from '@/src/ui';
import { SettingsGroup, SettingsRow } from '@/src/ui/settings';

const SITE = 'https://www.haksanmakina.com.tr';
const CORPORATE_PRIVACY = 'https://www.haksancnc.com.tr/blog-kisiselverilerinkorunmasihakkindabilgilendirme-104';

export default function AboutScreen() {
  const version = Constants.expoConfig?.version ?? '—';
  // Native derlemede build numarası platforma göre farklı alanda tutulur.
  const build =
    Constants.expoConfig?.ios?.buildNumber ?? String(Constants.expoConfig?.android?.versionCode ?? '—');

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['left', 'right']}>
      <DetailHeader title="Hakkında" />

      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerClassName="gap-4 px-4 pb-10 pt-4">
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
            icon="shield-checkmark-outline"
            tone="info"
            title="Kişisel Verilerin Korunması"
            subtitle="Haksan Makina kurumsal aydınlatma metni"
            onPress={() => void Linking.openURL(CORPORATE_PRIVACY)}
          />
          <SettingsRow kind="info" icon="server-outline" tone="neutral" title="Bağlı Sunucu" subtitle={apiBaseUrl()} />
        </SettingsGroup>

        <View className="items-center pt-2">
          <Text className="font-inter text-[12px] text-muted-foreground">
            © {new Date().getFullYear()} Haksan Takım Tezgahları Makina Sanayi ve Ticaret Limited Şirketi
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
