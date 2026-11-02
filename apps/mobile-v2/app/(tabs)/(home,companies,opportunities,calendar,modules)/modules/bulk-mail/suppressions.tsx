import { useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useCan } from '@/src/auth/AuthProvider';
import { useAddMailSuppression, useMailSuppressions, useRemoveMailSuppression } from '@/src/api/mail-campaigns.hooks';
import { useTheme } from '@/src/theme/theme';
import { Button, Card, DetailHeader, EmptyState, ErrorState, Field, Loading } from '@/src/ui';
import { useNavigationBottomInset } from '@/src/ui/LiquidGlassTabBarBackground';
import { toast } from '@/src/ui/toast';
import { isValidEmail } from '@/src/ui/crm/mail-logic';

/** Web SuppressionDialog: toplu mail almak istemeyen adresler. */
export default function BulkMailSuppressionsScreen() {
  const bottomInset = useNavigationBottomInset();
  const { colors } = useTheme();
  const canEdit = useCan('mail_campaigns.create');
  const list = useMailSuppressions();
  const add = useAddMailSuppression();
  const remove = useRemoveMailSuppression();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | undefined>();

  const submit = () => {
    const value = email.trim();
    if (!value || add.isPending) return;
    if (!isValidEmail(value)) return setError('Geçerli bir e-posta adresi girin');
    setError(undefined);
    add.mutate(
      { email: value },
      {
        onSuccess: () => {
          setEmail('');
          toast.success(`Ret listesine eklendi · ${value}`);
        },
        onError: (err) => toast.error(`Eklenemedi: ${err.message}`),
      },
    );
  };

  const confirmRemove = (row: { id: string; email: string }) =>
    Alert.alert('Listeden çıkarılsın mı?', `${row.email} yeniden toplu mail alabilir.`, [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Çıkar',
        style: 'destructive',
        onPress: () => remove.mutate(row.id, { onError: (err) => toast.error(`Kaldırılamadı: ${err.message}`) }),
      },
    ]);

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <DetailHeader title="Ret listesi" subtitle="Bu adresler tüm toplu gönderimlerde atlanır." />
      <ScrollView
        contentContainerClassName="gap-4 px-4 pt-4"
        contentContainerStyle={{ paddingBottom: bottomInset + 32 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} tintColor={colors.primary} />}
      >
        <Text className="font-inter text-[13px] leading-[19px] text-muted-foreground">
          Toplu mail almak istemediğini bildiren adresler. Bu adresler tüm toplu gönderimlerde atlanır.
        </Text>
        {canEdit ? (
          <Card className="gap-3">
            <Field
              label="Ret listesine eklenecek e-posta"
              placeholder="ornek@firma.com"
              value={email}
              onChangeText={(value) => {
                setEmail(value);
                if (error) setError(undefined);
              }}
              error={error}
              maxLength={255}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={submit}
            />
            <Button label="Ekle" variant="ghost" loading={add.isPending} disabled={!email.trim() || add.isPending} onPress={submit} />
          </Card>
        ) : null}
        {list.isPending ? (
          <Loading />
        ) : list.error ? (
          <ErrorState message={list.error.message || 'Ret listesi yüklenemedi'} onRetry={() => void list.refetch()} />
        ) : !list.data.length ? (
          <EmptyState icon="ban-outline" title="Ret listesi boş." />
        ) : (
          <Card className="gap-0 px-3 py-1">
            {list.data.map((row, index) => (
              <View key={row.id} className={`min-h-11 flex-row items-center gap-2 py-2.5 ${index ? 'border-t border-border' : ''}`}>
                <View className="min-w-0 flex-1">
                  <Text selectable className="font-inter-medium text-sm text-foreground" numberOfLines={1}>
                    {row.email}
                  </Text>
                  {row.reason ? (
                    <Text className="font-inter text-xs text-muted-foreground" numberOfLines={2}>
                      {row.reason}
                    </Text>
                  ) : null}
                </View>
                {canEdit ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${row.email} listeden çıkar`}
                    disabled={remove.isPending}
                    onPress={() => confirmRemove(row)}
                    className="h-11 w-11 items-center justify-center active:opacity-60"
                  >
                    <Ionicons name="trash-outline" size={18} color={colors.destructive} />
                  </Pressable>
                ) : null}
              </View>
            ))}
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
