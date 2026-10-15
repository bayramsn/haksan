import { useRef, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BottomSheetBackdrop, BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  useCreateMaintenancePlan,
  useCustomerDevice,
  useDeviceMaintenancePlans,
  useRemoveCustomerDevice,
} from '@/src/api/operations.hooks';
import { useCompany } from '@/src/api/companies.hooks';
import { useComplaintLinkMutations } from '@/src/api/service.hooks';
import { serviceApi } from '@/src/api/service.api';
import type { CustomerDevice } from '@/src/api/endpoints';
import { dueLabel, formatAmount, formatDate, formatDateTime } from '@/src/lib/format';
import { useTheme, type Tone } from '@/src/theme/theme';
import { useCan } from '@/src/auth/AuthProvider';
import { Button, Card, Chip, DetailHeader, EmptyState, ErrorState, Eyebrow, Field, ListRow, Loading } from '@/src/ui';
import { InfoRows, type InfoItem } from '@/src/ui/data';
import { toast } from '@/src/ui/toast';
import { DateTextField } from '@/src/ui/select/DateTextField';
import { MetaCell } from '@/src/ui/service/fields';
import { DeviceServiceHistory } from '@/src/ui/service/TicketPanels';
import { complaintFormUrl, shareComplaintUrl } from '@/src/ui/service/complaintShare';
import { complaintLinkTitle, machineStatusLabel, WARRANTY_TONE, warrantyInfo, warrantyShortLabel } from '@/src/ui/service/machines';

type DeviceDetail = CustomerDevice & { initialCompanyId?: string | null; contactId?: string | null };

export default function CustomerDeviceDetailScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const canPlan = useCan('service_tickets.create');
  const canUpdate = useCan('customer_devices.update');
  const canDelete = useCan('customer_devices.delete');
  const canCreateTicket = useCan('service_tickets.create');
  const canRotateLink = useCan('service_tickets.update');
  const query = useCustomerDevice(id);
  const plans = useDeviceMaintenancePlans(id);
  const createPlan = useCreateMaintenancePlan();
  const removeDevice = useRemoveCustomerDevice(id);
  const linkMutations = useComplaintLinkMutations();
  const device = query.data as DeviceDetail | undefined;
  const initialCompanyId = device?.initialCompanyId && device.initialCompanyId !== device.companyId ? device.initialCompanyId : '';
  const initialCompany = useCompany(initialCompanyId);
  const [now] = useState(() => Date.now());
  const [sharingLink, setSharingLink] = useState(false);

  const sheetRef = useRef<BottomSheetModal>(null);
  const [planTitle, setPlanTitle] = useState('');
  const [intervalDays, setIntervalDays] = useState('180');
  const [nextDueDate, setNextDueDate] = useState('');
  const [autoTicket, setAutoTicket] = useState(false);

  if (query.isPending || query.error || !device) {
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
      },
    );
  }

  const data = device;
  const info = warrantyInfo(data.warrantyEndDate, now);
  const warrantyTone = WARRANTY_TONE[info.state];
  const model = data.productModelName ?? data.model;
  const machineName = [data.brandName, model].filter(Boolean).join(' ') || 'Makine';
  const companyName = data.company?.shortName ?? data.company?.legalTitle ?? 'Firma bağlanmadı';
  const initialName = initialCompanyId
    ? initialCompany.data?.shortName ?? initialCompany.data?.legalTitle ?? '…'
    : companyName;
  const planRows = plans.data?.items ?? [];

  // Web MachineQrDialog: makinenin aktif linki varsa yenilenir, yoksa oluşturulur.
  const shareServiceForm = async () => {
    setSharingLink(true);
    try {
      const existing = await serviceApi.complaintLinks({ page: 1, pageSize: 5, customerDeviceId: data.id });
      const active = existing.data.find((link) => link.isActive && !link.revokedAt);
      const credential = active
        ? await linkMutations.rotate.mutateAsync(active.id)
        : await linkMutations.create.mutateAsync({ companyId: data.companyId, customerDeviceId: data.id, title: complaintLinkTitle(model) });
      await shareComplaintUrl(complaintFormUrl(credential.publicPath), credential.title ?? complaintLinkTitle(model));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Servis formu bağlantısı üretilemedi.');
    } finally {
      setSharingLink(false);
    }
  };

  const confirmDelete = () =>
    Alert.alert('Makine kaydını arşivle?', `${model ?? 'Makine'} · ${data.serialNumber ?? '—'} makine kartı arşivlenecek. Bağlı servis kayıtları korunur.`, [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Makineyi arşivle',
        style: 'destructive',
        onPress: () =>
          removeDevice.mutate(undefined, {
            onSuccess: () => {
              toast.success('Makine kaydı silindi');
              router.back();
            },
            onError: (error) => toast.error(`Makine silinemedi: ${error.message}`),
          }),
      },
    ]);

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <DetailHeader title="Makine Kartı" subtitle={data.serialNumber ? `Seri no · ${data.serialNumber}` : undefined} />
      <ScrollView
        contentContainerClassName="gap-4 px-4 pb-10 pt-4"
        refreshControl={
          <RefreshControl refreshing={query.isRefetching} onRefresh={() => void Promise.all([query.refetch(), plans.refetch()])} tintColor={colors.primary} />
        }
      >
        <Card className="gap-3">
          <View className="gap-1">
            <Text className="font-inter-medium text-[12px] text-muted-foreground">{data.productTypeName || 'Kurulu makine'}</Text>
            <Text className="font-display-semibold text-[20px] text-foreground">{machineName}</Text>
            <Text className="font-inter-medium text-[13px] text-foreground">{data.serialNumber ? `SN · ${data.serialNumber}` : 'Seri no yok'}</Text>
          </View>
          <View className="flex-row flex-wrap gap-2">
            <MetaCell label="Durum" value={machineStatusLabel(data.warrantyEndDate, now)} />
            <MetaCell label="Garanti" value={`${warrantyShortLabel(info)}${data.warrantyEndDate ? ` · ${formatDate(data.warrantyEndDate)}` : ''}`} />
            <MetaCell label="Kurulum" value={data.installationDate ? formatDate(data.installationDate) : null} />
          </View>
          <View className="flex-row flex-wrap gap-2">
            <Chip tone={warrantyTone} label={warrantyShortLabel(info)} />
          </View>
        </Card>

        <Card>
          <InfoRows
            items={[
              { label: 'Kullanıcı firma', value: companyName },
              { label: 'İlk müşteri', value: initialName },
              { label: 'Makine tipi', value: data.productTypeName },
              { label: 'Marka', value: data.brandName },
              { label: 'Model', value: model },
              { label: 'Peşin fiyat', value: data.cashPrice ? formatAmount(data.cashPrice, data.currencyCode ?? 'TRY') : null },
              { label: 'Kontrol paneli', value: data.controlUnit },
              { label: 'Kontrol paneli seri no', value: data.controlUnitSerialNumber },
            ] satisfies InfoItem[]}
          />
        </Card>

        <Card>
          <InfoRows
            items={[
              { label: 'Satış', value: data.saleDate ? formatDate(data.saleDate) : null },
              { label: 'Teslimat', value: data.deliveryDate ? formatDate(data.deliveryDate) : null },
              { label: 'Kurulum', value: data.installationDate ? formatDate(data.installationDate) : null },
              { label: 'Garanti başlangıcı', value: data.warrantyStartDate ? formatDate(data.warrantyStartDate) : null },
              { label: 'Garanti bitişi', value: data.warrantyEndDate ? formatDate(data.warrantyEndDate) : null },
              { label: 'Kayıt', value: formatDateTime(data.createdAt) },
            ] satisfies InfoItem[]}
          />
        </Card>

        {data.technicalSpecs?.length ? (
          <Card className="gap-1">
            <Eyebrow>Teknik özellikler</Eyebrow>
            <InfoRows items={data.technicalSpecs.map((spec) => ({ label: spec.key, value: [spec.value, spec.unit].filter(Boolean).join(' ') }))} />
          </Card>
        ) : null}

        <View className="gap-2">
          {canCreateTicket ? (
            <Button
              label="Servis talebi aç"
              trailingIcon="construct-outline"
              onPress={() =>
                router.push({
                  pathname: '/modal/new-ticket',
                  params: { companyId: data.companyId, companyName, customerDeviceId: data.id },
                } as unknown as Href)
              }
            />
          ) : null}
          {canCreateTicket && canRotateLink ? (
            <Button label="Servis formu bağlantısı (QR etiket)" variant="ghost" trailingIcon="qr-code-outline" loading={sharingLink} disabled={sharingLink} onPress={() => void shareServiceForm()} />
          ) : null}
          {canUpdate ? (
            <Button
              label="Kullanıcı firma"
              variant="ghost"
              trailingIcon="create-outline"
              onPress={() =>
                router.push({
                  pathname: '/modal/device-owner',
                  params: { id: data.id, companyId: data.companyId, companyName, contactId: data.contactId ?? '', initialCompanyName: initialName },
                } as unknown as Href)
              }
            />
          ) : null}
        </View>

        <View className="gap-1.5">
          <View className="px-1"><Eyebrow>Bakım planları ({plans.data?.total ?? 0})</Eyebrow></View>
          {plans.isPending ? <Loading /> : plans.error ? (
            <ErrorState message={plans.error.message} onRetry={() => void plans.refetch()} />
          ) : planRows.length ? planRows.map((plan) => {
            const due = dueLabel(plan.nextDueDate);
            const tone: Tone = !plan.isActive ? 'neutral' : due?.overdue ? 'destructive' : 'success';
            return (
              <ListRow
                key={plan.id}
                title={plan.title}
                lines={[`Her ${plan.intervalDays} gün`, plan.lastServiceDate ? `Son: ${formatDate(plan.lastServiceDate)}` : null]}
                icon="build-outline"
                iconTone={tone}
                chip={due ? { label: due.text, tone } : undefined}
                onPress={() => router.push(`/(tabs)/modules/maintenance-plans/${plan.id}` as Href)}
              />
            );
          }) : (
            <Card>
              <EmptyState
                title="Bakım planı yok"
                hint="Düzenli bakım için plan oluşturun."
                icon="build-outline"
                actionLabel={canPlan ? 'Plan Oluştur' : undefined}
                onAction={canPlan ? () => sheetRef.current?.present() : undefined}
              />
            </Card>
          )}
          {canPlan && planRows.length ? (
            <Button label="Yeni Bakım Planı" variant="ghost" onPress={() => sheetRef.current?.present()} disabled={createPlan.isPending} />
          ) : null}
        </View>

        <DeviceServiceHistory deviceId={data.id} companyName={data.company?.legalTitle ?? ''} title="Servis geçmişi" />

        {data.notes ? <Card className="gap-1.5"><Eyebrow>Not</Eyebrow><Text className="font-inter text-sm text-foreground">{data.notes}</Text></Card> : null}

        {data.inventoryItemId ? <Button label="Stok Kaydı" variant="ghost" onPress={() => router.push(`/(tabs)/modules/inventory/${data.inventoryItemId}` as Href)} /> : null}
        {data.quoteId ? <Button label="Teklif" variant="ghost" onPress={() => router.push(`/(tabs)/modules/quotes/${data.quoteId}` as Href)} /> : null}
        {data.opportunityId ? <Button label="Fırsat" variant="ghost" onPress={() => router.push(`/(tabs)/modules/opportunities/${data.opportunityId}` as Href)} /> : null}
        <Button label="Firma Kartı" variant="ghost" onPress={() => router.push(`/(tabs)/modules/companies/${data.companyId}` as Href)} />
        {canDelete ? (
          <Button label="Sil" variant="destructive" loading={removeDevice.isPending} disabled={removeDevice.isPending} onPress={confirmDelete} />
        ) : null}
      </ScrollView>

      <BottomSheetModal
        ref={sheetRef}
        enableDynamicSizing
        backgroundStyle={{ backgroundColor: colors.card }}
        handleIndicatorStyle={{ backgroundColor: colors.mutedForeground }}
        backdropComponent={(props) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />}
      >
        <BottomSheetView className="gap-3 px-5 pb-10 pt-2">
          <Text className="font-display-semibold text-base text-foreground">Yeni Bakım Planı</Text>
          <Field label="Başlık" value={planTitle} onChangeText={setPlanTitle} placeholder="Örn. Periyodik bakım" maxLength={255} />
          <Field label="Periyot (gün)" value={intervalDays} onChangeText={setIntervalDays} keyboardType="number-pad" />
          <DateTextField label="İlk vade (opsiyonel)" value={nextDueDate} onChangeText={setNextDueDate} />
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: autoTicket }}
            onPress={() => setAutoTicket((prev) => !prev)}
            className="min-h-[44px] flex-row items-center gap-2"
          >
            <Ionicons name={autoTicket ? 'checkbox' : 'square-outline'} size={20} color={colors.mutedForeground} />
            <Text className="font-inter text-sm text-foreground">Vadeyi aşınca talep otomatik açılsın</Text>
          </Pressable>
          <Button label="Planı Oluştur" onPress={submitPlan} loading={createPlan.isPending} disabled={createPlan.isPending} />
        </BottomSheetView>
      </BottomSheetModal>
    </SafeAreaView>
  );
}
