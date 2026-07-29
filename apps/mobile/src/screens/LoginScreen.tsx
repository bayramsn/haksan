import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { emailSchema } from '@haksan/shared';
import { useAuth } from '@/src/auth/AuthProvider';
import { Ionicons } from '@expo/vector-icons';
import { authService } from '@/src/api/services';

const PRIMARY = '#000c69';

export function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      setError('E-posta ve şifre zorunludur.');
      return;
    }
    const parsed = emailSchema.safeParse(email.trim());
    if (!parsed.success) {
      setError('Geçerli bir e-posta adresi girin.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await login(parsed.data, password);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Giriş başarısız');
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async () => {
    const parsed = emailSchema.safeParse(email.trim());
    if (!parsed.success) {
      setError('E-posta adresinizi girin.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await authService.forgotPassword(parsed.data);
      setLoading(false);
      setForgotSent(true);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Şifre sıfırlama isteği gönderilemedi.');
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {/* Top Brand Area */}
          <View style={styles.mainContainer}>
            {/* Logo */}
            <View style={styles.logoContainer}>
              <View style={styles.logoBox}>
                <Text style={styles.logoText}>H</Text>
              </View>
              <Text style={styles.brandTitle}>Haksan</Text>
              <Text style={styles.brandSubtitle}>CRM Mobil</Text>
            </View>

            {!forgotMode ? (
              <>
                <Text style={styles.pageTitle}>Giriş Yap</Text>

                {/* Error */}
                {!!error && (
                  <View style={styles.errorBox}>
                    <Ionicons name="alert-circle-outline" size={16} color="#ef4444" />
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                )}

                {/* Email */}
                <View style={styles.inputWrapper}>
                  <Text style={styles.inputLabel}>E-posta</Text>
                  <TextInput
                    style={styles.input}
                    value={email}
                    onChangeText={setEmail}
                    placeholder="ornek@haksan.com.tr"
                    placeholderTextColor="#9ca3af"
                    autoCapitalize="none"
                    keyboardType="email-address"
                    autoComplete="email"
                    returnKeyType="next"
                  />
                </View>

                {/* Password */}
                <View style={styles.inputWrapper}>
                  <Text style={styles.inputLabel}>Şifre</Text>
                  <View style={styles.passwordContainer}>
                    <TextInput
                      style={[styles.input, { paddingRight: 48 }]}
                      value={password}
                      onChangeText={setPassword}
                      placeholder="••••••••"
                      placeholderTextColor="#9ca3af"
                      secureTextEntry={!showPass}
                      returnKeyType="done"
                      onSubmitEditing={handleLogin}
                    />
                    <TouchableOpacity
                      style={styles.eyeButton}
                      onPress={() => setShowPass(!showPass)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Ionicons
                        name={showPass ? 'eye-off-outline' : 'eye-outline'}
                        size={20}
                        color="#9ca3af"
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.forgotLinkContainer}
                  onPress={() => setForgotMode(true)}
                >
                  <Text style={styles.forgotLinkText}>Şifremi unuttum</Text>
                </TouchableOpacity>

                {/* Login CTA */}
                <TouchableOpacity
                  style={[styles.primaryButton, loading && styles.buttonDisabled]}
                  onPress={handleLogin}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text style={styles.primaryButtonText}>Giriş Yap</Text>
                  )}
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.pageTitle}>Şifremi Unuttum</Text>
                <Text style={styles.pageSubtitle}>
                  E-posta adresinizi girin, şifre sıfırlama bağlantısı göndereceğiz.
                </Text>

                {forgotSent ? (
                  <View style={styles.successBox}>
                    <Text style={styles.successTitle}>E-posta gönderildi!</Text>
                    <Text style={styles.successText}>Gelen kutunuzu kontrol edin.</Text>
                  </View>
                ) : (
                  <>
                    {!!error && (
                      <View style={styles.errorBox}>
                        <Ionicons name="alert-circle-outline" size={16} color="#ef4444" />
                        <Text style={styles.errorText}>{error}</Text>
                      </View>
                    )}
                    <View style={styles.inputWrapper}>
                      <Text style={styles.inputLabel}>E-posta</Text>
                      <TextInput
                        style={styles.input}
                        value={email}
                        onChangeText={setEmail}
                        placeholder="ornek@haksan.com.tr"
                        placeholderTextColor="#9ca3af"
                        autoCapitalize="none"
                        keyboardType="email-address"
                      />
                    </View>
                    <TouchableOpacity
                      style={[styles.primaryButton, loading && styles.buttonDisabled, { marginTop: 16 }]}
                      onPress={handleForgot}
                      disabled={loading}
                    >
                      {loading ? (
                        <ActivityIndicator color="#ffffff" />
                      ) : (
                        <Text style={styles.primaryButtonText}>Sıfırlama Bağlantısı Gönder</Text>
                      )}
                    </TouchableOpacity>
                  </>
                )}

                <TouchableOpacity
                  style={styles.backLinkContainer}
                  onPress={() => {
                    setForgotMode(false);
                    setForgotSent(false);
                    setError('');
                  }}
                >
                  <Text style={styles.backLinkText}>← Giriş sayfasına dön</Text>
                </TouchableOpacity>
              </>
            )}
          </View>

          {/* Footer */}
          <View style={styles.footerContainer}>
            <Text style={styles.footerText}>Haksan Makina © 2026 · v2.4.1</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  flex: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
  },
  mainContainer: {
    flex: 1,
    paddingHorizontal: 32,
    justifyContent: 'center',
    paddingBottom: 16,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoBox: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: PRIMARY,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  logoText: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  brandTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827', // text-gray-900
    letterSpacing: -0.5,
  },
  brandSubtitle: {
    fontSize: 12,
    color: '#9ca3af', // text-gray-400
    marginTop: 2,
  },
  pageTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 24,
    alignSelf: 'flex-start',
  },
  pageSubtitle: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 24,
    alignSelf: 'flex-start',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 12,
    color: '#dc2626',
    marginLeft: 8,
    flex: 1,
  },
  successBox: {
    backgroundColor: '#f0fdf4',
    borderColor: '#bbf7d0',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#15803d',
  },
  successText: {
    fontSize: 12,
    color: '#16a34a',
    marginTop: 4,
  },
  inputWrapper: {
    width: '100%',
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4b5563', // text-gray-600
    marginBottom: 4,
  },
  input: {
    width: '100%',
    backgroundColor: '#f9fafb', // bg-gray-50
    borderColor: '#e5e7eb', // border-gray-200
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: '#111827',
  },
  passwordContainer: {
    position: 'relative',
    justifyContent: 'center',
  },
  eyeButton: {
    position: 'absolute',
    right: 12,
    justifyContent: 'center',
  },
  forgotLinkContainer: {
    alignSelf: 'flex-end',
    marginBottom: 24,
  },
  forgotLinkText: {
    fontSize: 12,
    fontWeight: '500',
    color: PRIMARY,
  },
  primaryButton: {
    width: '100%',
    backgroundColor: PRIMARY,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  backLinkContainer: {
    marginTop: 16,
    alignSelf: 'center',
  },
  backLinkText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6b7280',
  },
  footerContainer: {
    paddingHorizontal: 32,
    paddingBottom: 32,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 10,
    color: '#d1d5db', // text-gray-300
  },
});
