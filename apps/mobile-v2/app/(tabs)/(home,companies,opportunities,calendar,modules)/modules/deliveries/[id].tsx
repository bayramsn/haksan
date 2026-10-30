import { useHierarchyBack } from '@/src/modules/useHierarchyBack';
import { useNavigationBottomInset } from '@/src/ui/LiquidGlassTabBarBackground';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCompany } from '@/src/api/companies.hooks';
import type { Delivery } from '@/src/api/logistics.api';
import { useDeleteDelivery, useDeliveryFromList, useUpdateDelivery, useUpdateDeliveryStatus } from '@/src/api/logistics.hooks';
import { useCan } from '@/src/auth/AuthProvider';
import { formatDate } from '@/src/lib/format';
import { Button, Card, Chip, DetailHeader, EmptyState, ErrorState, Loading } from '@/src/ui';
import { toast } from '@/src/ui/toast';
import { DeliveryFormFields } from '@/src/ui/service/DeliveryForm';
import { FormSection } from '@/src/ui/service/fields';
import { InstallationDocument } from '@/src/ui/service/InstallationDocument';
import { JourneySteps } from '@/src/ui/service/JourneySteps';
import {
  buildDeliveryPayload,
  companyUserInfo,
  DELIVERY_JOURNEY,
  DELIVERY_STATUS_LABELS,
  deliveryDocument,
  deliveryDraft,
  deliveryStep,
  type DeliveryDraft,
} from '@/src/ui/service/logistics';

/** Web DeliveryDetailDialog: teslim formu / kurulum tutanağı düzenleme, yazdırma ve silme. */
export default function DeliveryDetailScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const query = useDeliveryFromList(id);

  if (query.isPending || query.error || !query.delivery) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
        <DetailHeader title="Kurulum Tutanağı" />
        {query.isPending ? (
          <Loading />
        ) : query.error ? (
          <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
        ) : query.hasNextPage ? (
          <EmptyState
            title="Kayıt henüz yüklenmedi"
            hint="Teslimat listesi sayfalar halinde yükleniyor."
            actionLabel="Daha fazla yükle"
            onAction={() => void query.fetchNextPage()}
          />
        ) : (
          <EmptyState title="Teslimat kaydı bulunamadı" hint="Kayıt silinmiş olabilir." icon="clipboard-outline" />
        )}
      </SafeAreaView>
    );
  }

  return <DeliveryDetail key={query.delivery.id} delivery={query.delivery} refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />;
}

function DeliveryDetail({ delivery, refreshing, onRefresh }: { delivery: Delivery; refreshing: boolean; onRefresh: () => void }) {
  const { goBack } = useHierarchyBack();
  const GLASS_TAB_BAR_HEIGHT = useNavigationBottomInset();
  const router = useRouter();
  const canUpdate = useCan('shipments.update');
  const company = useCompany(delivery.companyId);
  const save = useUpdateDelivery(delivery.id);
  const setStatus = useUpdateDeliveryStatus();
  const remove = useDeleteDelivery();
  const [draft, setDraft] = useState<DeliveryDraft>(() => deliveryDraft(delivery));
  const companyName = delivery.company?.shortName ?? delivery.company?.legalTitle ?? '—';
  const firma = company.data?.legalTitle ?? delivery.company?.legalTitle ?? companyName;

  const submit = () => {
    const built = buildDeliveryPayload(draft);
    if ('error' in built) return toast.error(built.error);
    save.mutate(built.body, {
      onSuccess: () => toast.success('Teslimat güncellendi'),
      onError: (error) => toast.error(`Kaydedilemedi: ${error.message}`),
    });
  };

  const changeStatus = (status: 'pending' | 'completed') =>
    setStatus.mutate(
      { id: delivery.id, status },
      {
        onSuccess: () => {
          setDraft((current) => ({ ...current, status }));
          toast.success(`Teslimat durumu: ${DELIVERY_STATUS_LABELS[status]}`);
        },
        onError: (error) => toast.error(`Teslimat durumu güncellenemedi: ${error.message}`),
      },
    );

  const confirmDelete = () =>
    Alert.alert(
      'Teslimat kaydı silinsin mi?',
      `${companyName}\nTeslim milestone’u, form bağlantısı ve imza bilgisi listeden kaldırılır. Makine ve müşteri kayıtları korunur.`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Teslimatı Sil',
          style: 'destructive',
          onPress: () =>
            remove.mutate(delivery.id, {
              onSuccess: () => {
                toast.success('Teslimat silindi');
                goBack();
              },
              onError: (error) => toast.error(`Teslimat silinemedi: ${error.message}`),
            }),
        },
      ],
    );

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <DetailHeader title="Kurulum Tutanağı" subtitle={companyName} />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: GLASS_TAB_BAR_HEIGHT + 32 }} contentContainerClassName="gap-4 px-4 pt-4"
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <Card className="gap-3">
            <View className="flex-row items-center justify-between gap-3">
              <Text className="flex-1 font-display-semibold text-[17px] text-foreground" numberOfLines={2}>{companyName}</Text>
              <Chip tone={delivery.status === 'completed' ? 'success' : 'warning'} label={DELIVERY_STATUS_LABELS[delivery.status] ?? delivery.status} />
            </View>
            <Text className="font-inter text-xs text-muted-foreground">
              {`Teslim Tarihi: ${delivery.deliveryDate ? formatDate(delivery.deliveryDate) : '—'}`}
            </Text>
            <JourneySteps steps={DELIVERY_JOURNEY} current={deliveryStep(delivery) - 1} />
            {canUpdate ? (
              <Button
                label={delivery.status === 'completed' ? 'Bekliyor olarak işaretle' : 'Tamamlandı olarak işaretle'}
                variant="ghost"
                loading={setStatus.isPending}
                onPress={() => changeStatus(delivery.status === 'completed' ? 'pending' : 'completed')}
              />
            ) : null}
          </Card>

          {canUpdate ? (
            <>
              <DeliveryFormFields draft={draft} companyName={companyName} onChange={setDraft} />
              <Button label="Kaydet" loading={save.isPending} disabled={save.isPending} onPress={submit} />
            </>
          ) : null}

          <FormSection title="Formu Yazdır">
            <InstallationDocument
              form={deliveryDocument(draft, firma, companyUserInfo(company.data), delivery.id)}
              fileName={`kurulum-tutanagi-${draft.formNo || delivery.id.slice(0, 6)}`}
              notes={draft.notes}
            />
          </FormSection>

          {canUpdate ? (
            <Button label="Teslimatı Sil" variant="destructive" trailingIcon="trash-outline" loading={remove.isPending} onPress={confirmDelete} />
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
