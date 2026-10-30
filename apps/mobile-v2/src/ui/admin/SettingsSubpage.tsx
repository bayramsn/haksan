import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect } from 'expo-router';
import { DetailHeader, DetailSkeleton, ErrorState, type HeaderAction } from '@/src/ui';

/** Ayarlar alt sayfası iskeleti: başlık, yetki yönlendirmesi, yükleniyor/hata, çek-yenile. */
export function SettingsSubpage({
  title,
  subtitle,
  allowed = true,
  loading,
  error,
  onRetry,
  refreshing = false,
  onRefresh,
  actions,
  scroll = true,
  children,
}: {
  title: string;
  subtitle?: string;
  allowed?: boolean;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  refreshing?: boolean;
  onRefresh?: () => void;
  actions?: HeaderAction[];
  /** false: içerik kendi listesini (FlashList) yönetir. */
  scroll?: boolean;
  children?: ReactNode;
}) {
  if (!allowed) return <Redirect href="/more/settings" />;
  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <DetailHeader title={title} subtitle={subtitle} actions={actions} />
      {loading ? (
        <DetailSkeleton />
      ) : error ? (
        <ErrorState message={error} onRetry={onRetry} />
      ) : scroll ? (
        <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            contentContainerClassName="gap-4 p-4 pb-12"
            keyboardShouldPersistTaps="handled"
            refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined}
          >
            {children}
          </ScrollView>
        </KeyboardAvoidingView>
      ) : (
        <View className="flex-1">{children}</View>
      )}
    </SafeAreaView>
  );
}
