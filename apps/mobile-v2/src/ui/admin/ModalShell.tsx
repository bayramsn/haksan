import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, Stack } from 'expo-router';
import { DetailSkeleton, ErrorState } from '@/src/ui';

/**
 * Yönetim modallarının ortak iskeleti. Modallar modül yığınının dışında
 * olduğundan yetki kontrolü burada tekrar yapılır (deep-link koruması).
 */
export function ModalShell({
  title,
  allowed = true,
  loading,
  error,
  onRetry,
  description,
  children,
  scroll = true,
}: {
  title: string;
  allowed?: boolean;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  description?: string;
  children?: ReactNode;
  /** false: içerik kendi kaydırma alanını yönetir (TargetEditor gibi). */
  scroll?: boolean;
}) {
  if (!allowed) return <Redirect href="/(tabs)/more" />;
  const body = loading ? (
    <DetailSkeleton />
  ) : error ? (
    <ErrorState message={error} onRetry={onRetry} />
  ) : scroll ? (
    <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerClassName="gap-4 p-4 pb-10" keyboardShouldPersistTaps="handled">
        {description ? <Text className="font-inter text-[13px] leading-[19px] text-muted-foreground">{description}</Text> : null}
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  ) : (
    <View className="flex-1">{children}</View>
  );
  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['bottom', 'left', 'right']}>
      <Stack.Screen options={{ title, headerShown: true }} />
      {body}
    </SafeAreaView>
  );
}

/** Form alanının altındaki yardım metni. */
export function Help({ children }: { children: ReactNode }) {
  return <Text className="font-inter text-[12px] leading-[17px] text-muted-foreground">{children}</Text>;
}
