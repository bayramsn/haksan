import { useState } from 'react';
import { Alert, StyleSheet, Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { assertAllowedBaseUrl, getApiBaseUrl, persistApiBaseUrl } from '@/src/api/config';
import { Button } from '@/src/ui/Button';
import { FormPageLayout } from '@/src/ui/FormPageLayout';
import { Input } from '@/src/ui/Input';
import { colors, typography } from '@/src/theme/tokens';

/** Onboarding O6 API URL kurulumu */
export default function OnboardingApiSetup() {
  const { from } = useLocalSearchParams<{ from?: string }>();
  const fromLogin = from === 'login';
  const [apiUrl, setApiUrl] = useState(getApiBaseUrl());
  const [testing, setTesting] = useState(false);
  const continueAfterSave = () => {
    router.replace(fromLogin ? '/login' : '/onboarding/permissions');
  };

  const testAndSave = async () => {
    const base = apiUrl.trim().replace(/\/$/, '');
    try {
      assertAllowedBaseUrl(base);
    } catch (error) {
      Alert.alert('Geçersiz adres', error instanceof Error ? error.message : 'API adresi geçersiz.');
      return;
    }
    setTesting(true);
    try {
      const res = await fetch(`${base}/auth/me`, { headers: { Accept: 'application/json' } });
      if (res.status !== 401 && !res.ok) throw new Error('bad status');
      await persistApiBaseUrl(base);
      continueAfterSave();
    } catch {
      Alert.alert(
        'Bağlantı testi',
        'Sunucuya ulaşılamadı — yine de kaydedip devam edebilirsiniz.',
        [
          { text: 'Geri', style: 'cancel' },
          {
            text: 'Kaydet ve devam',
            onPress: () => {
              void persistApiBaseUrl(base)
                .then(continueAfterSave)
                .catch(() => Alert.alert('Hata', 'API adresi kaydedilemedi.'));
            },
          },
        ]
      );
    } finally {
      setTesting(false);
    }
  };

  return (
    <FormPageLayout title="API Sunucusu" subtitle="CRM backend adresinizi girin." showBack={fromLogin}>
      <Text style={styles.hint}>Canlı CRM için HTTPS API adresini girin (ör. https://crm.example.com/api/v1).</Text>
      <Input label="API Base URL" value={apiUrl} onChangeText={setApiUrl} autoCapitalize="none" autoCorrect={false} />
      <Button title="Test Et ve Devam" onPress={() => void testAndSave()} loading={testing} />
      <Button title={fromLogin ? 'Giriş ekranına dön' : 'Atla'} variant="ghost" onPress={() => fromLogin ? router.replace('/login') : router.push('/onboarding/permissions')} />
    </FormPageLayout>
  );
}

const styles = StyleSheet.create({
  hint: { ...typography.bodySm, color: colors.primary, lineHeight: 20 },
});
