import { useCallback } from 'react';
import { ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, Stack, useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import type { Installation, Shipment } from '@/src/api/endpoints';
import { useLinkedInstallations, useLinkedShipments } from '@/src/api/opportunity-case.hooks';
import { useOpportunity } from '@/src/api/crm.hooks';
import { useCan } from '@/src/auth/AuthProvider';
import { useCanAccessModule } from '@/src/modules/useModuleAccess';
import { Button, EmptyState, ErrorState, ListRow, Loading } from '@/src/ui';

export default function OpportunityOperationsScreen() {
  const { id = '', kind } = useLocalSearchParams<{ id: string; kind: string }>();
  const router = useRouter();
  const installation = kind === 'installation';
  const module = installation ? 'installations' : 'shipments';
  const allowed = useCanAccessModule(module);
  const canCreate = useCan(`${module}.create`);
  const canUpdate = useCan(`${module}.update`);
  const opportunity = useOpportunity(id);
  const shipments = useLinkedShipments(id, allowed && !installation);
  const installations = useLinkedInstallations(id, allowed && installation);
  const records = installation ? installations : shipments;
  useFocusEffect(useCallback(() => {
    if (!allowed || !id) return;
    void records.refetch();
    void opportunity.refetch();
  }, [allowed, id, records.refetch, opportunity.refetch]));
  if (!allowed || !id) return <Redirect href={'/modules/opportunities' as Href} />;
  const company = opportunity.data?.company;
  const rows = (records.data ?? []) as Array<Installation | Shipment>;
  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['bottom']}>
      <Stack.Screen options={{ title: installation ? 'Fırsat kurulumları' : 'Fırsat sevkiyatları' }} />
      <ScrollView contentContainerStyle={{ width: '100%', maxWidth: 960, alignSelf: 'center' }} contentContainerClassName="gap-4 p-5 pb-10">
        <Text className="font-inter text-sm text-muted-foreground">{opportunity.data?.title} · Tamamlamak istediğiniz bağlı kaydı açın.</Text>
        {records.isPending ? <Loading /> : records.error ? <ErrorState message="Bağlı kayıtlar yüklenemedi." onRetry={() => void records.refetch()} /> : !rows.length ? <EmptyState title="Bağlı kayıt yok" hint="Bu fırsat için yeni bir kayıt oluşturabilirsiniz." /> : rows.map((row) => (
          <ListRow key={row.id} title={installation ? (row as Installation).customerDevice?.productModelName ?? 'Kurulum' : (row as Shipment).shipmentNo ?? 'Sevkiyat'}
            lines={[row.status?.name ?? 'Durum belirtilmedi']}
            onPress={() => router.push((installation && canUpdate && row.status?.code !== 'completed'
              ? `/modal/installation-completion?id=${row.id}`
              : `/modules/${module}/${row.id}`) as Href)} />
        ))}
        {opportunity.error ? <ErrorState message="Fırsat bilgileri yüklenemedi." onRetry={() => void opportunity.refetch()} /> : null}
        {!opportunity.isPending && !opportunity.error && !company ? <Button label="Önce firma bağla" onPress={() => router.push({ pathname: '/modal/opportunity-relations', params: { id } } as unknown as Href)} /> : null}
        {canCreate && company ? <Button label={installation ? 'Kurulum oluştur' : 'Sevkiyat oluştur'} onPress={() => router.push({
          pathname: installation ? '/modal/installation-form' : '/modal/shipment-new',
          params: { opportunityId: id, opportunityName: opportunity.data?.title ?? '', companyId: company.id, companyName: company.shortName ?? company.legalTitle },
        } as Href)} /> : null}
        <Button
          label={installation ? 'Kurulum listesini aç' : 'Sevkiyat listesini aç'}
          variant="ghost"
          onPress={() =>
            router.push({
              pathname: `/modules/${module}`,
              params: {
                opportunityId: id,
                ...(company ? { companyId: company.id } : {}),
              },
            } as Href)
          }
        />
      </ScrollView>
    </SafeAreaView>
  );
}
