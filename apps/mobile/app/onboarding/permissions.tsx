import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/src/ui/Button';
import { FormPageLayout } from '@/src/ui/FormPageLayout';
import { colors, layout, spacing, typography } from '@/src/theme/tokens';
import { cardElevated } from '@/src/theme/styles';

const PERMS = [
  { label: 'Bildirimler', icon: 'notifications-outline' as const },
  { label: 'Takvim', icon: 'calendar-outline' as const },
  { label: 'Konum (harita)', icon: 'location-outline' as const },
  { label: 'Kamera (servis foto)', icon: 'camera-outline' as const },
  { label: 'Çağrı kayıtları (Android)', icon: 'call-outline' as const },
];

/** Onboarding O7 İzinler */
export default function OnboardingPermissions() {
  const [busy, setBusy] = useState(false);

  const finish = () => {
    setBusy(true);
    router.replace('/onboarding/success');
  };

  return (
    <FormPageLayout title="İzinler" subtitle="En iyi deneyim için aşağıdaki izinler istenebilir." showBack={false}>
      {PERMS.map((p) => (
        <View key={p.label} style={styles.row}>
          <View style={styles.iconWrap}>
            <Ionicons name={p.icon} size={20} color={colors.primary} />
          </View>
          <Text style={styles.rowText}>{p.label}</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </View>
      ))}
      <Button title="Başlayalım" onPress={finish} loading={busy} />
    </FormPageLayout>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    ...cardElevated,
    padding: 14,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { ...typography.body, flex: 1, color: colors.textPrimary },
});
