import { useCallback } from 'react';
import { ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, Stack, useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { service, type Installation, type Shipment } from '@/src/api/endpoints';
import { useOpportunity } from '@/src/api/crm.hooks';
import { useCan } from '@/src/auth/AuthProvider';
import { useCanAccessModule } from '@/src/modules/useModuleAccess';
import { Button, EmptyState, ErrorState, ListRow, Loading } from '@/src/ui';
import { loadLinkedOperations } from '@/src/features/opportunities/linked-operations';

export default function OpportunityOperationsScreen() {
  const { id = '', kind } = useLocalSearchParams<{ id: string; kind: string }>();
  const router = useRouter();
  const installation = kind === 'installation';
  const module = installation ? 'installations' : 'shipments';
  const allowed = useCanAccessModule(module);
  const canCreate = useCan(`${module}.create`);
  const canUpdate = useCan(`${module}.update`);
  const opportunity = useOpportunity(id);
  const records = useQuery<(Installation | Shipment)[]>({
    queryKey: ['opportunities', 'linked-operations', id, module],
    enabled: Boolean(id) && allowed,
    refetchOnMount: 'always',
    queryFn: () => installation
      ? loadLinkedOperations<Installation>(id, (page) => service.installations({ page, pageSize: 50 }))
      : loadLinkedOperations<Shipment>(id, (page) => service.shipments({ page, pageSize: 50 })),
  });
  useFocusEffect(useCallback(() => {
    if (!allowed || !id) return;
    void records.refetch();
    void opportunity.refetch();
  }, [allowed, id, records.refetch, opportunity.refetch]));
  if (!allowed || !id) return <Redirect href={'/modules/opportunities' as Href} />;
  const company = opportunity.data?.company;
  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['bottom']}>
      <Stack.Screen options={{ title: installation ? 'Fırsat kurulumları' : 'Fırsat sevkiyatları' }} />
      <ScrollView contentContainerClassName="gap-4 p-5 pb-10">
        <Text className="font-inter text-sm text-muted-foreground">{opportunity.data?.title} · Tamamlamak istediğiniz bağlı kaydı açın.</Text>
        {records.isPending ? <Loading /> : records.error ? <ErrorState message="Bağlı kayıtlar yüklenemedi." onRetry={() => void records.refetch()} /> : !records.data?.length ? <EmptyState title="Bağlı kayıt yok" hint="Bu fırsat için yeni bir kayıt oluşturabilirsiniz." /> : records.data.map((row) => (
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
      </ScrollView>
    </SafeAreaView>
  );
}
