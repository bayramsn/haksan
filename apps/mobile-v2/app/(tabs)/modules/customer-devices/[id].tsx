import { useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BottomSheetBackdrop, BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  useCompleteMaintenancePlan,
  useCreateMaintenancePlan,
  useCustomerDevice,
  useDeviceMaintenancePlans,
  useReassignCustomerDevice,
  useRemoveCustomerDevice,
} from '@/src/api/operations.hooks';
import { dueLabel, formatAmount, formatDate, formatDateTime } from '@/src/lib/format';
import { useTheme, type Tone } from '@/src/theme/theme';
import { useCan } from '@/src/auth/AuthProvider';
import { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { useCompanyList } from '@/src/api/companies.hooks';
import type { CompanyListItem } from '@/src/api/endpoints';
import { Button, Card, Chip, DetailHeader, EmptyState, ErrorState, Eyebrow, Field, ListRow, Loading, SearchBar } from '@/src/ui';
import { InfoRows, type InfoItem } from '@/src/ui/data';
import { toast } from '@/src/ui/toast';

export default function CustomerDeviceDetailScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const canUpdate = useCan('maintenance_plans.create') || useCan('service_tickets.update');
  const query = useCustomerDevice(id);
  const plans = useDeviceMaintenancePlans(id);
  const createPlan = useCreateMaintenancePlan();
  const removeDevice = useRemoveCustomerDevice(id);
  const reassign = useReassignCustomerDevice(id);
  const [reassignSearch, setReassignSearch] = useState('');
  const companyList = useCompanyList(
    useMemo(() => ({ search: reassignSearch.trim() || undefined, sortBy: 'name' as const, sortDir: 'asc' as const }), [reassignSearch])
  );


  // Yeni bakım planı sayfası
  const sheetRef = useRef<BottomSheetModal>(null);
  const reassignSheet = useRef<BottomSheetModal>(null);
  const [planTitle, setPlanTitle] = useState('');
  const [intervalDays, setIntervalDays] = useState('180');
  const [nextDueDate, setNextDueDate] = useState('');
  const [autoTicket, setAutoTicket] = useState(false);

  if (query.isPending || query.error || !query.data) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
        <DetailHeader title="Makine" />
        {query.isPending ? <Loading /> : <ErrorState message={query.error?.message ?? 'Makine yüklenemedi.'} onRetry={() => void query.refetch()} />}
      </SafeAreaView>
    );
  }

  function submitPlan() {
    const interval = Number(intervalDays || '180');
    if (!Number.isInteger(interval) || interval < 1) {
      toast.error('Periyot 1 günden az olamaz.');
      return;
    }
    createPlan.mutate(
      {
        customerDeviceId: id,
        title: planTitle.trim() || undefined,
        intervalDays: interval,
        ...(nextDueDate.trim()
          ? (() => {
              const [y, m, d] = nextDueDate.split('-').map(Number);
              return y && m && d ? { nextDueDate: new Date(y, m - 1, d).toISOString() } : {};
            })()
          : {}),
        autoCreateTicket: autoTicket,
      },
      {
        onSuccess: () => {
          sheetRef.current?.dismiss();
          setPlanTitle('');
          setNextDueDate('');
          toast.success('Bakım planı oluşturuldu');
        },
        onError: (error) => toast.error(error.message),
      }
    );
  }

  const data = query.data;
  const warranty = dueLabel(data.warrantyEndDate);
  const warrantyTone: Tone = !data.warrantyEndDate ? 'neutral' : warranty?.overdue ? 'destructive' : 'success';
  const machineName = [data.brandName, data.productModelName ?? data.model].filter(Boolean).join(' ') || 'Makine';
  const companyName = data.company?.shortName ?? data.company?.legalTitle ?? 'Firma bağlanmadı';
  const planRows = plans.data?.items ?? [];

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <DetailHeader title="Makine Kartı" subtitle={data.serialNumber ?? undefined} />
      <ScrollView contentContainerClassName="gap-4 px-4 pb-10 pt-4">
        <Card className="gap-2">
          <Chip tone={warrantyTone} label={!data.warrantyEndDate ? 'Garanti bilgisi yok' : warranty?.overdue ? 'Garanti bitti' : 'Garantide'} />
          <Text className="text-[20px] font-inter-semibold text-foreground">{machineName}</Text>
          <Text className="font-inter-medium text-[13px] text-foreground">{data.serialNumber ? `SN: ${data.serialNumber}` : 'Seri no yok'}</Text>
          <Text className="font-inter text-[13px] text-muted-foreground">{companyName}</Text>
        </Card>

        <Card>
          <InfoRows items={[
            { label: 'Model', value: data.productModelName ?? data.model },
            { label: 'Marka', value: data.brandName },
            { label: 'Ürün tipi', value: data.productTypeName },
            { label: 'Kontrol ünitesi', value: data.controlUnit },
            { label: 'Kontrol ünitesi seri no', value: data.controlUnitSerialNumber },
            { label: 'Liste / nakit fiyat', value: data.cashPrice ? formatAmount(data.cashPrice, data.currencyCode ?? 'TRY') : null },
          ] satisfies InfoItem[]} />
        </Card>

        <Card>
          <InfoRows items={[
            { label: 'Satış', value: data.saleDate ? formatDate(data.saleDate) : null },
            { label: 'Teslimat', value: data.deliveryDate ? formatDate(data.deliveryDate) : null },
            { label: 'Kurulum', value: data.installationDate ? formatDate(data.installationDate) : null },
            { label: 'Garanti başlangıcı', value: data.warrantyStartDate ? formatDate(data.warrantyStartDate) : null },
            { label: 'Garanti bitişi', value: data.warrantyEndDate ? formatDate(data.warrantyEndDate) : null },
            { label: 'Kayıt', value: formatDateTime(data.createdAt) },
          ] satisfies InfoItem[]} />
        </Card>

        {data.technicalSpecs?.length ? (
          <Card className="gap-1"><Eyebrow>Teknik özellikler</Eyebrow><InfoRows items={data.technicalSpecs.map((spec) => ({ label: spec.key, value: [spec.value, spec.unit].filter(Boolean).join(' ') }))} /></Card>
        ) : null}

        <View className="gap-1.5">
          <View className="px-1"><Eyebrow>Bakım planları ({plans.data?.total ?? 0})</Eyebrow></View>
          {plans.isPending ? <Loading /> : plans.error ? (
            <ErrorState message={plans.error.message} onRetry={() => void plans.refetch()} />
          ) : planRows.length ? planRows.map((plan) => {
            const due = dueLabel(plan.nextDueDate);
            const tone: Tone = !plan.isActive ? 'neutral' : due?.overdue ? 'destructive' : 'success';
            return <ListRow key={plan.id} title={plan.title} lines={[`Her ${plan.intervalDays} gün`, plan.lastServiceDate ? `Son: ${formatDate(plan.lastServiceDate)}` : null]} icon="build-outline" iconTone={tone} chip={due ? { label: due.text, tone } : undefined} onPress={() => router.push(`/(tabs)/modules/maintenance-plans/${plan.id}` as Href)} />;
          }) : <Card><EmptyState title="Bakım planı yok" hint="Düzenli bakım için plan oluşturun." icon="build-outline" actionLabel={canUpdate ? 'Plan Oluştur' : undefined} onAction={canUpdate ? () => sheetRef.current?.present() : undefined} /></Card>}
          {canUpdate ? (
            <Button label="Yeni Bakım Planı" variant="ghost" onPress={() => sheetRef.current?.present()} disabled={createPlan.isPending} />
          ) : null}
        </View>

        {data.notes ? <Card className="gap-1.5"><Eyebrow>Not</Eyebrow><Text className="font-inter text-sm text-foreground">{data.notes}</Text></Card> : null}

        {canUpdate ? (
          <View className="gap-2">
            <Button label="Firma Değiştir" variant="ghost" onPress={() => reassignSheet.current?.present()} loading={reassign.isPending} disabled={reassign.isPending} />
            <Button
              label="Makineyi Sil"
              variant="ghost"
              loading={removeDevice.isPending}
              disabled={removeDevice.isPending}
              onPress={() =>
                Alert.alert('Makineyi Sil', 'Bu makine kaydı silinecek; işlem geri alınamaz.', [
                  { text: 'Vazgeç', style: 'cancel' },
                  {
                    text: 'Sil',
                    style: 'destructive',
                    onPress: () =>
                      removeDevice.mutate(undefined, {
                        onSuccess: () => {
                          toast.success('Makine kaydı silindi');
                          router.back();
                        },
                        onError: (error) => toast.error(error.message),
                      }),
                  },
                ])
              }
            />
          </View>
        ) : null}

        {data.inventoryItemId ? <Button label="Stok Kaydı" variant="ghost" onPress={() => router.push(`/(tabs)/modules/inventory/${data.inventoryItemId}` as Href)} /> : null}
        {data.quoteId ? <Button label="Teklif" variant="ghost" onPress={() => router.push(`/(tabs)/modules/quotes/${data.quoteId}` as Href)} /> : null}
        {data.opportunityId ? <Button label="Fırsat" variant="ghost" onPress={() => router.push(`/(tabs)/modules/opportunities/${data.opportunityId}` as Href)} /> : null}
        <Button label="Firma Kartı" variant="ghost" onPress={() => router.push(`/(tabs)/modules/companies/${data.companyId}` as Href)} />
      </ScrollView>

      <BottomSheetModal
        ref={sheetRef}
        enableDynamicSizing
        backgroundStyle={{ backgroundColor: colors.card }}
        handleIndicatorStyle={{ backgroundColor: colors.mutedForeground }}
        backdropComponent={(props) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />}
      >
        <BottomSheetView className="gap-3 px-5 pb-10 pt-2">
          <Text className="font-inter-semibold text-base text-foreground">Yeni Bakım Planı</Text>
          <Field label="Başlık" value={planTitle} onChangeText={setPlanTitle} placeholder="Örn. Periyodik bakım" maxLength={255} />
          <Field label="Periyot (gün)" value={intervalDays} onChangeText={setIntervalDays} keyboardType="number-pad" />
          <Field label="İlk vade (opsiyonel)" value={nextDueDate} onChangeText={setNextDueDate} placeholder="YYYY-AA-GG" keyboardType="numbers-and-punctuation" maxLength={10} />
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: autoTicket }}
            onPress={() => setAutoTicket((prev) => !prev)}
            className="h-11 flex-row items-center gap-2"
          >
            <Ionicons name={autoTicket ? 'checkbox' : 'square-outline'} size={20} color={colors.mutedForeground} />
            <Text className="font-inter text-sm text-foreground">Vadeyi aşınca talep otomatik açılsın</Text>
          </Pressable>
          <Button
            label="Planı Oluştur"
            onPress={submitPlan}
            loading={createPlan.isPending}
            disabled={createPlan.isPending}
          />
          <View style={{ height: 4 }} />
        </BottomSheetView>
      </BottomSheetModal>

      <BottomSheetModal
        ref={reassignSheet}
        enableDynamicSizing={false}
        snapPoints={['70%']}
        backgroundStyle={{ backgroundColor: colors.card }}
        handleIndicatorStyle={{ backgroundColor: colors.mutedForeground }}
        backdropComponent={(props) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />}
      >
        <BottomSheetView className="gap-3 px-4 pb-2">
          <Text className="font-inter-semibold text-base text-foreground">Yeni firmayı seçin</Text>
          <SearchBar value={reassignSearch} onChange={setReassignSearch} placeholder="Firma ara" />
        </BottomSheetView>
        <BottomSheetFlatList
          data={companyList.data?.items ?? []}
          keyExtractor={(item: CompanyListItem) => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
          renderItem={({ item }: { item: CompanyListItem }) =>
            item.id === data.companyId ? null : (
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  Alert.alert('Firmayı Değiştir', `${item.shortName ?? item.legalTitle} firmasına atanacak.`, [
                    { text: 'Vazgeç', style: 'cancel' },
                    {
                      text: 'Taşı',
                      onPress: () => {
                        reassignSheet.current?.dismiss();
                        reassign.mutate(
                          { companyId: item.id },
                          {
                            onSuccess: () => toast.success('Makine yeni firmaya atandı'),
                            onError: (error) => toast.error(error.message),
                          }
                        );
                      },
                    },
                  ])
                }
                className="min-h-[56px] flex-row items-center gap-3 border-b border-border py-2 active:opacity-70"
              >
                <Ionicons name="business-outline" size={19} color={colors.mutedForeground} />
                <View className="flex-1">
                  <Text className="font-inter-semibold text-sm text-foreground" numberOfLines={1}>{item.shortName ?? item.legalTitle}</Text>
                  {item.shortName ? <Text className="font-inter text-xs text-muted-foreground" numberOfLines={1}>{item.legalTitle}</Text> : null}
                </View>
              </Pressable>
            )
          }
          ListEmptyComponent={companyList.isPending ? <Loading /> : <EmptyState title="Firma bulunamadı" />}
        />
      </BottomSheetModal>
    </SafeAreaView>
  );
}
