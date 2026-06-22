import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../lib/auth';
import { Button, Card, Field, Screen, colors, font, spacing } from '../ui';

export function LoginScreen() {
  const { apiBaseUrl, setApiBaseUrl, login } = useAuth();
  const [url, setUrl] = useState(apiBaseUrl);
  const [email, setEmail] = useState('admin@haksan.local');
  const [password, setPassword] = useState('admin12345');
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    setBusy(true);
    try {
      setApiBaseUrl(url);
      await login(email, password);
    } catch (err) {
      Alert.alert('Giriş başarısız', err instanceof Error ? err.message : 'Beklenmeyen hata');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={st.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen contentStyle={st.center}>
        <View style={st.header}>
          <Text style={st.eyebrow}>HAKSAN CRM</Text>
          <Text style={st.heading}>Mobil</Text>
          <Text style={st.sub}>Web CRM hesabınla giriş yap.</Text>
        </View>
        <Card>
          <Field label="API adresi" value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
          <Field label="E-posta" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
          <Field label="Şifre" value={password} onChangeText={setPassword} secureTextEntry />
          <Button label="Giriş yap" loading={busy} onPress={onSubmit} />
        </Card>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  center: { flexGrow: 1, justifyContent: 'center' },
  header: { gap: spacing.xs, marginBottom: spacing.sm },
  eyebrow: { color: colors.textMuted, ...font.eyebrow },
  heading: { color: colors.text, ...font.heading },
  sub: { color: '#475569', ...font.muted },
});
