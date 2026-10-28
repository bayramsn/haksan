import { useHierarchyBack } from '@/src/modules/useHierarchyBack';
import { startCrmCall } from '@/src/call-assistant/call';
import { useNavigationBottomInset } from '@/src/ui/LiquidGlassTabBarBackground';
import { useMemo, useRef, useState } from 'react';
import { Alert, Linking, Platform, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { BottomSheetBackdrop, BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import { useCompany } from '@/src/api/companies.hooks';
import { useContact } from '@/src/api/crm.hooks';
import {
  ticketSla,
  useCustomerDevice,
  useDeleteServiceTicket,
  useDirectory,
  useServiceTicket,
  useUpdateServiceTicket,
} from '@/src/api/operations.hooks';
import { openServiceFormPdf } from '@/src/api/service.api';
import { useSetTicketStage } from '@/src/api/service.hooks';
import { useAuth, useCan } from '@/src/auth/AuthProvider';
import { formatDateTime } from '@/src/lib/format';
import { useTheme, type Tone } from '@/src/theme/theme';
import { Button, Card, Chip, DetailHeader, ErrorState, Loading } from '@/src/ui';
import { Tabs } from '@/src/ui/data';
import { toast } from '@/src/ui/toast';
import { AttachmentsPanel } from '@/src/ui/service/AttachmentsPanel';
import { CompletionEditor } from '@/src/ui/service/CompletionEditor';
import { ChoiceChips, FormSection, MetaCell } from '@/src/ui/service/fields';
import { ServiceQuoteEditor } from '@/src/ui/service/ServiceQuoteEditor';
import type { CompletionContext, QuoteContext } from '@/src/ui/service/serviceForms';
import {
  SERVICE_NEXT_ACTION,
  SERVICE_STAGES,
  SEVERITY_LABELS,
  SOURCE_LABELS,
  STAGE_LABELS,
  TICKET_TYPE_LABELS,
  isDetailTabEnabled,
  serviceStageOf,
  stageTarget,
  type ServiceStage,
} from '@/src/ui/service/serviceStage';
import {
  ActivityPanel,
  CommunicationPanel,
  FeePanel,
  MachineFilePanel,
  NotesPanel,
  TabLocked,
  TimerCard,
} from '@/src/ui/service/TicketPanels';
import { WarrantyEditor } from '@/src/ui/service/WarrantyEditor';

type DetailTab = 'summary' | 'quote' | 'machine' | 'warranty' | 'communication' | 'notes' | 'activities' | 'operations' | 'completion';
type TicketType = 'complaint' | 'request' | 'warranty_claim' | 'question';

const SEVERITY_TONE: Record<string, Tone> = { critical: 'destructive', high: 'warning', normal: 'info', low: 'neutral' };
const TYPE_OPTIONS = (Object.keys(TICKET_TYPE_LABELS) as TicketType[]).map((value) => ({ value, label: TICKET_TYPE_LABELS[value]! }));

function defaultOf<T extends { isDefault: boolean }>(rows: T[] | undefined): T | undefined {
  return rows?.find((row) => row.isDefault) ?? rows?.[0];
}

export default function ServiceTicketDetailScreen() {
  const { goBack } = useHierarchyBack();
  const GLASS_TAB_BAR_HEIGHT = useNavigationBottomInset();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const sheetRef = useRef<BottomSheetModal>(null);
  const { user: me } = useAuth();
  const canUpdate = useCan('service_tickets.update');
  const canDelete = useCan('service_tickets.delete');
  const canCreateEvent = useCan('calendar.create');
  const canConsume = useCan('inventory.update');
  const [tab, setTab] = useState<DetailTab>('summary');
  const [pdfBusy, setPdfBusy] = useState(false);

  const detail = useServiceTicket(id);
  const ticket = detail.data ?? null;
  const company = useCompany(ticket?.companyId ?? '');
  const contact = useContact(ticket?.contactId ?? '');
  const deviceQuery = useCustomerDevice(ticket?.customerDeviceId ?? '');
  const directory = useDirectory();
  const updateTicket = useUpdateServiceTicket(id);
  const setStage = useSetTicketStage();
  const removeTicket = useDeleteServiceTicket();

  const device = ticket?.customerDeviceId ? deviceQuery.data ?? null : null;
  const assigneeName = !ticket?.assignedToUserId
    ? null
    : ticket.assignedToUserId === me?.id
      ? me.fullName
      : directory.data?.find((user) => user.id === ticket.assignedToUserId)?.fullName ?? null;

  const companyFacts = useMemo(() => {
    const data = company.data;
    const address = defaultOf(data?.addresses);
    return {
      address: address?.fullAddress ?? ([address?.street, address?.buildingNumber, address?.locality].filter(Boolean).join(' ') || null),
      district: address?.district ?? null,
      city: address?.province ?? null,
      phone: defaultOf(data?.phones)?.phone ?? null,
      fax: data?.phones.find((row) => row.phoneType === 'fax')?.phone ?? null,
      email: defaultOf(data?.emails)?.email ?? null,
      taxOffice: data?.taxOffice ?? null,
      taxNumber: data?.taxNumber ?? null,
    };
  }, [company.data]);

  // Formlar varsayılanlarını ilk açılışta bir kez alır; bağlam yüklenmeden açılmaz.
  const contextReady =
    !!ticket &&
    !company.isLoading &&
    !(ticket.contactId && contact.isLoading) &&
    !(ticket.customerDeviceId && deviceQuery.isLoading);

  if (detail.isPending) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
        <DetailHeader title="Servis Talebi" />
        <Loading />
      </SafeAreaView>
    );
  }
  if (detail.error || !ticket) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
        <DetailHeader title="Servis Talebi" />
        <ErrorState message={detail.error?.message ?? 'Kayıt bulunamadı.'} onRetry={() => void detail.refetch()} />
      </SafeAreaView>
    );
  }

  const stage = serviceStageOf(ticket);
  const stageIndex = SERVICE_STAGES.indexOf(stage);
  const sla = ticketSla(ticket);
  const phone = contact.data?.mobilePhone ?? contact.data?.workPhone ?? ticket.sourceComplaint?.contactPhone ?? companyFacts.phone;
  const quoteRequired = ticket.metadata?.quoteRequired === true;
  const mapQuery = [companyFacts.address, companyFacts.district, companyFacts.city].filter(Boolean).join(' ') || null;
  const machineName = device ? [device.brandName, device.productModelName ?? device.model, device.serialNumber].filter(Boolean).join(' · ') : null;

  const completionContext: CompletionContext = {
    ticket: {
      id: ticket.id,
      ticketNo: ticket.ticketNo,
      description: ticket.description,
      resolutionNote: ticket.resolutionNote,
      metadata: ticket.metadata,
      warrantyApproved: ticket.warrantyClaim?.status === 'approved',
    },
    company: { name: ticket.company?.legalTitle, ...companyFacts },
    contact: contact.data ? { name: contact.data.fullName, mobile: contact.data.mobilePhone, email: contact.data.workEmail } : null,
    machine: device
      ? {
          brand: device.brandName,
          type: device.productTypeName,
          model: device.productModelName ?? device.model,
          serialNumber: device.serialNumber,
          controlUnit: device.controlUnit,
          controlUnitSerial: device.controlUnitSerialNumber ?? null,
          deliveryDate: device.deliveryDate,
        }
      : null,
    assigneeName,
  };
  const quoteContext: QuoteContext = {
    ticketNo: ticket.ticketNo,
    issue: ticket.subject,
    metadataCurrency: ticket.metadata?.serviceCurrency,
    machine: device ? { brand: device.brandName, model: device.productModelName ?? device.model, type: device.productTypeName, serialNumber: device.serialNumber } : null,
    company: {
      name: ticket.company?.legalTitle,
      phone: companyFacts.phone,
      email: companyFacts.email,
      address: [companyFacts.address, companyFacts.district, companyFacts.city].filter(Boolean).join(' ') || null,
    },
    contact: contact.data ? { name: contact.data.fullName, mobile: contact.data.mobilePhone } : null,
    writer: { name: me?.fullName, email: me?.email },
  };

  const tabs: { value: DetailTab; label: string }[] = [
    { value: 'summary', label: 'Özet' },
    { value: 'quote', label: 'Servis Teklifi' },
    { value: 'machine', label: 'Makine Dosyası' },
    { value: 'warranty', label: 'Garanti/RMA' },
    { value: 'communication', label: 'Müşteri İletişim' },
    { value: 'notes', label: 'Not Geçmişi' },
    { value: 'activities', label: 'Aktivite Geçmişi' },
    { value: 'operations', label: 'Ücret' },
    { value: 'completion', label: 'Tamamlanma Formu' },
  ];

  const moveTo = (next: ServiceStage) => {
    sheetRef.current?.dismiss();
    if (next === stage) return;
    setStage.mutate(
      { id: ticket.id, ...stageTarget(next) },
      {
        onSuccess: () => toast.success(`Aşama: ${STAGE_LABELS[next]}`),
        onError: (error) => toast.error(`Aşama güncellenemedi: ${error.message}`),
      },
    );
  };

  const printForm = async () => {
    setPdfBusy(true);
    try {
      await openServiceFormPdf(ticket.id, ticket.ticketNo);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Servis formu indirilemedi.');
    } finally {
      setPdfBusy(false);
    }
  };

  const assign = (userId: string | null, label: string) =>
    updateTicket.mutate(
      { assignedToUserId: userId },
      { onSuccess: () => toast.success(label), onError: (error) => toast.error(error.message) },
    );

  const locked = (key: 'activities' | 'operations' | 'completion') => !isDetailTabEnabled(stage, key);

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <DetailHeader
        title={ticket.ticketNo}
        subtitle={ticket.company?.legalTitle ?? undefined}
        actions={[{ icon: 'ellipsis-horizontal', label: 'Talep işlemleri', onPress: () => sheetRef.current?.present() }]}
      />

      <ScrollView
        contentContainerClassName="gap-4 pt-3"
        contentContainerStyle={{ paddingBottom: GLASS_TAB_BAR_HEIGHT + 32 }}
        refreshControl={<RefreshControl refreshing={detail.isRefetching} onRefresh={() => void detail.refetch()} tintColor={colors.primary} />}
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-3 px-4">
          <Card className="gap-3">
            <View className="flex-row flex-wrap items-center gap-2">
              <Chip tone="info" label={STAGE_LABELS[stage]} />
              <Chip tone={SEVERITY_TONE[ticket.severity] ?? 'neutral'} label={SEVERITY_LABELS[ticket.severity] ?? ticket.severity} />
              <Chip tone="neutral" label={TICKET_TYPE_LABELS[ticket.ticketType] ?? ticket.ticketType} />
              {sla ? <Chip tone={sla.overdue ? 'destructive' : 'neutral'} label={sla.text} /> : null}
            </View>
            <Text className="font-display text-[19px] leading-6 text-foreground">{ticket.subject}</Text>
            <View className="flex-row flex-wrap gap-2">
              <MetaCell label="Sorumlu" value={assigneeName ?? 'Atanmadı'} />
              <MetaCell label="Sonraki Aksiyon" value={SERVICE_NEXT_ACTION[stage]} />
              <MetaCell label="Makine" value={machineName ?? 'Makine eşleşmedi'} />
            </View>
            <View accessibilityLabel={`Servis aşaması ${stageIndex + 1} / ${SERVICE_STAGES.length}`} className="flex-row gap-1">
              {SERVICE_STAGES.map((item, index) => (
                <View key={item} className="h-1.5 flex-1 rounded-full" style={{ backgroundColor: index <= stageIndex ? colors.primary : colors.border }} />
              ))}
            </View>
            {canUpdate ? (
              <Button label="Aşamaya taşı" variant="ghost" trailingIcon="swap-horizontal" loading={setStage.isPending} onPress={() => sheetRef.current?.present()} />
            ) : null}
          </Card>
        </View>

        <Tabs tabs={tabs} value={tab} onChange={setTab} />

        <View className="gap-4 px-4">
          {tab === 'summary' ? (
            <>
              <TimerCard ticket={ticket} canUpdate={canUpdate} />
              <FormSection title="Özet">
                <View className="gap-1">
                  <Text className="font-inter text-[11px] uppercase tracking-wide text-muted-foreground">Servis Notu</Text>
                  <Text className="font-inter text-sm leading-5 text-foreground">{ticket.description?.trim() || 'Servis notu girilmemiş.'}</Text>
                </View>
                <View className="flex-row flex-wrap gap-2">
                  <MetaCell label="Firma" value={ticket.company?.legalTitle} />
                  <MetaCell label="Açılış" value={formatDateTime(ticket.reportedAt)} />
                  <MetaCell label="Kaynak" value={SOURCE_LABELS[ticket.source] ?? ticket.source} />
                  <MetaCell label="Teklif" value={quoteRequired ? 'Gerekli' : 'Gerekli değil'} />
                  <MetaCell label="İletişim" value={contact.data?.fullName ?? ticket.sourceComplaint?.contactName} />
                  {ticket.sourceComplaint ? <MetaCell label="Şikayet No" value={ticket.sourceComplaint.complaintNo} /> : null}
                </View>
                {canUpdate ? (
                  <ChoiceChips<TicketType>
                    label="Kayıt Tipi"
                    value={ticket.ticketType as TicketType}
                    options={TYPE_OPTIONS}
                    onChange={(ticketType) =>
                      updateTicket.mutate(
                        { ticketType },
                        { onSuccess: () => toast.success('Kayıt tipi güncellendi'), onError: (error) => toast.error(error.message) },
                      )
                    }
                  />
                ) : (
                  <MetaCell label="Kayıt Tipi" value={TICKET_TYPE_LABELS[ticket.ticketType] ?? ticket.ticketType} />
                )}
              </FormSection>
              <FormSection title="Servis Dosyaları">
                <AttachmentsPanel entityType="service_ticket" entityId={ticket.id} canUpload={canUpdate} />
              </FormSection>
              {mapQuery ? (
                <Button
                  label="Haritada aç"
                  variant="ghost"
                  trailingIcon="map-outline"
                  onPress={() =>
                    void Linking.openURL(
                      Platform.OS === 'ios' ? `http://maps.apple.com/?q=${encodeURIComponent(mapQuery)}` : `geo:0,0?q=${encodeURIComponent(mapQuery)}`,
                    ).catch(() => toast.error('Harita uygulaması açılamadı.'))
                  }
                />
              ) : null}
              {ticket.company?.id ? (
                <Button label="Firma Kartı" variant="ghost" trailingIcon="arrow-forward" onPress={() => router.push(`/modules/companies/${ticket.company!.id}`)} />
              ) : null}
            </>
          ) : null}

          {tab === 'quote' ? (
            contextReady ? <ServiceQuoteEditor key={`quote-${ticket.id}`} ticket={ticket} context={quoteContext} canUpdate={canUpdate} /> : <Loading />
          ) : null}

          {tab === 'machine' ? (
            <MachineFilePanel
              ticket={ticket}
              device={device}
              companyInfo={[
                { label: 'İlgili', value: contact.data?.fullName ?? null },
                { label: 'Telefon', value: phone },
                { label: 'E-Posta', value: companyFacts.email },
                { label: 'Adres', value: [companyFacts.address, companyFacts.district, companyFacts.city].filter(Boolean).join(' ') || null },
              ]}
            />
          ) : null}

          {tab === 'warranty' ? <WarrantyEditor ticketId={ticket.id} device={device} canUpdate={canUpdate} /> : null}
          {tab === 'communication' ? <CommunicationPanel ticket={ticket} canUpdate={canUpdate} directory={directory.data} /> : null}
          {tab === 'notes' ? <NotesPanel ticket={ticket} canUpdate={canUpdate} directory={directory.data} /> : null}

          {tab === 'activities' ? (
            locked('activities') ? <TabLocked hint="Aktivite geçmişi “Servis Devam Ediyor” aşamasından itibaren açılır." /> : <ActivityPanel ticket={ticket} directory={directory.data} />
          ) : null}
          {tab === 'operations' ? (
            locked('operations') ? (
              <TabLocked hint="Ücret sekmesi “Servis Tamamlandı” aşamasından itibaren açılır." />
            ) : (
              <FeePanel ticket={ticket} canUpdate={canUpdate} canConsume={canConsume && canUpdate} directory={directory.data} />
            )
          ) : null}
          {tab === 'completion' ? (
            locked('completion') ? (
              <TabLocked hint="Tamamlanma formu “Servis Devam Ediyor” aşamasından itibaren açılır." />
            ) : contextReady ? (
              <CompletionEditor key={`completion-${ticket.id}`} ticket={ticket} context={completionContext} canUpdate={canUpdate} />
            ) : (
              <Loading />
            )
          ) : null}
        </View>
      </ScrollView>

      <View className="flex-row gap-2 border-t border-border bg-card px-4 py-3">
        {phone ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Müşteriyi ara"
            onPress={() => void startCrmCall(phone, { companyId: ticket.companyId ?? undefined, contactId: ticket.contactId ?? undefined })}
            className="min-h-[48px] flex-1 flex-row items-center justify-center gap-2 rounded-control border border-border bg-card active:opacity-60"
          >
            <Ionicons name="call-outline" size={18} color={colors.primary} />
            <Text className="font-inter-semibold text-[13px] text-foreground">Müşteriyi Ara</Text>
          </Pressable>
        ) : null}
        {canCreateEvent ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Servis randevusu planla"
            onPress={() =>
              router.push({
                pathname: '/modal/calendar-event',
                params: {
                  eventType: 'other',
                  title: `${ticket.ticketNo} · ${ticket.subject}`,
                  ...(ticket.companyId ? { companyId: ticket.companyId } : {}),
                  ...(ticket.contactId ? { contactId: ticket.contactId } : {}),
                },
              })
            }
            className="min-h-[48px] flex-1 flex-row items-center justify-center gap-2 rounded-control border border-border bg-card active:opacity-60"
          >
            <Ionicons name="calendar-outline" size={18} color={colors.primary} />
            <Text className="font-inter-semibold text-[13px] text-foreground">Planla</Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Servis formu PDF"
          disabled={pdfBusy}
          onPress={() => void printForm()}
          className={`min-h-[48px] flex-1 flex-row items-center justify-center gap-2 rounded-control bg-primary ${pdfBusy ? 'opacity-60' : 'active:opacity-80'}`}
        >
          <Ionicons name="document-text-outline" size={18} color={colors.primaryForeground} />
          <Text className="font-inter-semibold text-[13px] text-primary-foreground">Servis Formu</Text>
        </Pressable>
      </View>

      <BottomSheetModal
        ref={sheetRef}
        snapPoints={['75%']}
        backgroundStyle={{ backgroundColor: colors.card }}
        handleIndicatorStyle={{ backgroundColor: colors.mutedForeground }}
        backdropComponent={(props) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />}
      >
        <BottomSheetScrollView contentContainerStyle={{ gap: 8, paddingHorizontal: 20, paddingBottom: 40, paddingTop: 8 }}>
          {canUpdate ? (
            <>
              <Text className="font-display-semibold text-base text-foreground">Aşamaya taşı</Text>
              {SERVICE_STAGES.map((item) => (
                <Button
                  key={item}
                  label={item === stage ? `• ${STAGE_LABELS[item]}` : STAGE_LABELS[item]}
                  variant={item === stage ? 'primary' : 'ghost'}
                  disabled={setStage.isPending}
                  onPress={() => moveTo(item)}
                />
              ))}
              {directory.data && directory.data.length > 0 ? (
                <>
                  <Text className="mt-3 font-display-semibold text-base text-foreground">Sorumlu ata</Text>
                  {me && ticket.assignedToUserId !== me.id ? (
                    <Button label={`${me.fullName} (ben)`} variant="ghost" disabled={updateTicket.isPending} onPress={() => assign(me.id, `${me.fullName} atandı`)} />
                  ) : null}
                  {directory.data.map((person) => (
                    <Button
                      key={person.id}
                      label={ticket.assignedToUserId === person.id ? `• ${person.fullName}` : person.fullName}
                      variant={ticket.assignedToUserId === person.id ? 'primary' : 'ghost'}
                      disabled={updateTicket.isPending}
                      onPress={() => assign(person.id, `${person.fullName} atandı`)}
                    />
                  ))}
                  {ticket.assignedToUserId ? (
                    <Button label="Atamayı Kaldır" variant="ghost" disabled={updateTicket.isPending} onPress={() => assign(null, 'Atama kaldırıldı')} />
                  ) : null}
                </>
              ) : null}
            </>
          ) : null}

          <Text className="mt-3 font-display-semibold text-base text-foreground">Belge</Text>
          <Button label="Servis Formu (PDF)" variant="ghost" loading={pdfBusy} disabled={pdfBusy} onPress={() => void printForm()} />

          {canDelete ? (
            <Button
              label="Talebi Sil"
              variant="destructive"
              loading={removeTicket.isPending}
              disabled={removeTicket.isPending}
              onPress={() => {
                sheetRef.current?.dismiss();
                Alert.alert('Talebi sil', `${ticket.ticketNo} kalıcı olarak silinecek.`, [
                  { text: 'Vazgeç', style: 'cancel' },
                  {
                    text: 'Sil',
                    style: 'destructive',
                    onPress: () =>
                      removeTicket.mutate(id, {
                        onSuccess: () => {
                          toast.success('Talep silindi');
                          goBack();
                        },
                        onError: (error) => toast.error(error.message),
                      }),
                  },
                ]);
              }}
            />
          ) : null}
        </BottomSheetScrollView>
      </BottomSheetModal>
    </SafeAreaView>
  );
}
