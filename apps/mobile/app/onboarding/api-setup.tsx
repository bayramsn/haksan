import { useState } from 'react';
import { Alert, StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';
import { getApiBaseUrl, persistApiBaseUrl } from '@/src/api/config';
import { Button } from '@/src/ui/Button';
import { FormPageLayout } from '@/src/ui/FormPageLayout';
import { Input } from '@/src/ui/Input';
import { colors, typography } from '@/src/theme/tokens';

/** Onboarding O6 API URL kurulumu */
export default function OnboardingApiSetup() {
  const [apiUrl, setApiUrl] = useState(getApiBaseUrl());
  const [testing, setTesting] = useState(false);

  const testAndSave = async () => {
    setTesting(true);
    try {
      const base = apiUrl.trim().replace(/\/$/, '');
      await persistApiBaseUrl(base);
      const res = await fetch(`${base}/companies?pageSize=1`, { headers: { Accept: 'application/json' } });
      if (res.status !== 401 && !res.ok) throw new Error('bad status');
      router.push('/onboarding/permissions');
    } catch {
      Alert.alert(
        'Bağlantı testi',
        'Sunucuya ulaşılamadı — yine de kaydedip devam edebilirsiniz.',
        [
          { text: 'Geri', style: 'cancel' },
          {
            text: 'Kaydet ve devam',
            onPress: () => {
              void persistApiBaseUrl(apiUrl.trim());
              router.push('/onboarding/permissions');
            },
          },
        ]
      );
    } finally {
      setTesting(false);
    }
  };

  return (
    <FormPageLayout title="API Sunucusu" subtitle="CRM backend adresinizi girin." showBack={false}>
      <Text style={styles.hint}>Android: http://10.0.2.2:3000/api/v1{'\n'}iOS: http://localhost:3000/api/v1</Text>
      <Input label="API Base URL" value={apiUrl} onChangeText={setApiUrl} autoCapitalize="none" autoCorrect={false} />
      <Button title="Test Et ve Devam" onPress={() => void testAndSave()} loading={testing} />
      <Button title="Atla" variant="ghost" onPress={() => router.push('/onboarding/permissions')} />
    </FormPageLayout>
  );
}

const styles = StyleSheet.create({
  hint: { ...typography.bodySm, color: colors.primary, lineHeight: 20 },
});
