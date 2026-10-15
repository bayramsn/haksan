import { useMemo, useRef, useState } from 'react';
import { Image, Linking, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { BottomSheetBackdrop, BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import * as Haptics from 'expo-haptics';
import * as Crypto from 'expo-crypto';
import { Ionicons } from '@expo/vector-icons';
import {
  useCompany,
  useCompanyCrossDivisionDebt,
  useDeleteCompany,
  useUpdateCompanyStatus,
} from '@/src/api/companies.hooks';
import { mediaUrl } from '@/src/api/config';
import { useActivityList, useContactList, useLookup, useOpportunityList, useQuoteList } from '@/src/api/crm.hooks';
import { useCommercialDocuments } from '@/src/api/documents.hooks';
import { useTaskList } from '@/src/api/tasks.hooks';
import { useTaskRecordEvents } from '@/src/api/crm-general.hooks';
import { exportService } from '@/src/api/exports';
import { pickDocument, uploadEntityAttachment } from '@/src/native/files';
import { mailComposeHref } from '@/src/ui/crm/mail-logic';
import { buildCompanyTimeline } from '@/src/ui/crm/timeline-logic';
import type { DocumentKind } from '@/src/api/documents.hooks';
import { toast } from '@/src/ui/toast';
import { Alert } from 'react-native';
import {
  devices,
  finance,
  qualificationStageLabels,
  QUALIFICATION_STAGES,
  type CompanyDetail,
  type QualificationStage,
} from '@/src/api/endpoints';
import { formatAmount, formatDate, formatDateTime } from '@/src/lib/format';
import { customerStatusTone, useTheme, type Tone } from '@/src/theme/theme';
import { Avatar } from '@/src/ui/Avatar';
import { useCan } from '@/src/auth/AuthProvider';
import { Button, Card, Chip, DetailHeader, EmptyState, ErrorState, Eyebrow, ListRow, Loading, SCREEN_PAD } from '@/src/ui';
import { InfoRows, StatCard, StatGrid } from '@/src/ui/data';

/** Varsayılan kayıt yoksa ilk kayda düş; sunucu sıralamayı garanti etmiyor. */
function preferred<T extends { isDefault: boolean }>(rows: T[] | undefined): T | null {
  if (!rows?.length) return null;
  return rows.find((row) => row.isDefault) ?? rows[0]!;
}

function addressText(company: CompanyDetail): string | null {
  const address = preferred(company.addresses);
  if (!address) return null;
  return [address.fullAddress, address.district, address.province].filter(Boolean).join(', ') || null;
}

/** İlişki tipi kodu -> ton. company-relation-types lookup'undaki code ile aynı. */
const RELATION_TONE: Record<string, Tone> = {
  customer: 'success',
  supplier: 'info',
  supplier_customer: 'stage',
  competitor: 'destructive',
};

const STATUS_OPTIONS = [
  { code: 'potential', label: 'Potansiyel' },
  { code: 'active', label: 'Aktif' },
  { code: 'passive', label: 'Pasif' },
  { code: 'blacklist', label: 'Kara liste' },
] as const;

/** Kapanmış (onaylı/reddedilmiş/süresi dolmuş/iptal) teklifler "açık" sayılmaz. */
const CLOSED_QUOTE_STATUS = new Set(['approved', 'rejected', 'expired', 'cancelled']);

/** company_addresses.address_type -> etiket (web CustomerDetail.tsx ile aynı). */
const ADDRESS_TYPE_LABELS: Record<string, string> = {
  office: 'Ofis',
  factory: 'Fabrika',
  work_area: 'Çalışma Alanı',
  shipping: 'Sevkiyat',
  billing: 'Fatura',
  other: 'Diğer',
};

/** companyPhones.phone_type / companyEmails.email_type kodları (schema/companies.ts). */
const CONTACT_TYPE_LABELS: Record<string, string> = {
  main: 'Santral',
  mobile: 'Cep',
  work: 'İş',
  home: 'Ev',
  fax: 'Faks',
  invoice: 'Fatura',
  info: 'Bilgi',
  support: 'Destek',
  other: 'Diğer',
};

type CompanyTab = 'genel' | 'gecmis' | 'kartlar' | 'aktivite' | 'teklifler' | 'gorevler' | 'cari' | 'belgeler';

const COMPANY_TABS: { value: CompanyTab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'genel', label: 'Genel', icon: 'grid-outline' },
  { value: 'gecmis', label: 'Geçmiş', icon: 'time-outline' },
  { value: 'kartlar', label: 'Satış Kartları', icon: 'briefcase-outline' },
  { value: 'aktivite', label: 'Aktivite', icon: 'pulse-outline' },
  { value: 'teklifler', label: 'Teklifler', icon: 'document-text-outline' },
  { value: 'gorevler', label: 'Görevler', icon: 'checkbox-outline' },
  { value: 'cari', label: 'Cari', icon: 'person-outline' },
  { value: 'belgeler', label: 'Belgeler', icon: 'folder-outline' },
];

function CompanyTabs({
  value,
  onChange,
  counts,
}: {
  value: CompanyTab;
  onChange: (value: CompanyTab) => void;
  counts: Partial<Record<CompanyTab, number>>;
}) {
  const { colors } = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8, paddingHorizontal: SCREEN_PAD }}
    >
      {COMPANY_TABS.map((item) => {
        const selected = item.value === value;
        const count = counts[item.value] ?? 0;
        return (
          <Pressable
            key={item.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(item.value)}
            className={`h-[48px] flex-row items-center gap-2 rounded-[12px] border px-4 active:opacity-70 ${
              selected ? 'border-primary bg-primary' : 'border-border bg-card'
            }`}
            style={{ borderCurve: 'continuous' }}
          >
            <Ionicons name={item.icon} size={18} color={selected ? colors.primaryForeground : colors.mutedForeground} />
            <Text className={`font-inter-medium text-[14px] ${selected ? 'text-primary-foreground' : 'text-muted-foreground'}`}>
              {item.label}
            </Text>
            {count > 0 ? (
              <View className={`min-w-[18px] items-center rounded-full px-1 ${selected ? 'bg-white/20' : 'bg-secondary'}`}>
                <Text className={`font-inter-semibold text-[10px] ${selected ? 'text-primary-foreground' : 'text-primary'}`}>{count}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function QuickAction({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  const disabled = !onPress;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className="h-[44px] flex-1 flex-row items-center justify-center gap-1.5 rounded-[12px] border border-border bg-card px-1 active:opacity-70"
      style={[{ borderCurve: 'continuous' }, disabled ? { opacity: 0.4 } : null]}
    >
      <Ionicons name={icon} size={17} color={disabled ? colors.mutedForeground : colors.primary} />
      <Text className={`shrink font-inter-medium text-[12px] ${disabled ? 'text-muted-foreground' : 'text-foreground'}`} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function DetailFact({
  icon,
  label,
  value,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string | null;
  children?: React.ReactNode;
}) {
  const { colors } = useTheme();
  if (!value && !children) return null;
  return (
    <View className="flex-row items-center gap-2">
      <Ionicons name={icon} size={15} color={colors.mutedForeground} />
      <Text className="w-[110px] font-inter text-[13px] text-muted-foreground" numberOfLines={1}>
        {label}
      </Text>
      {children ? (
        <View className="flex-1 flex-row items-center">{children}</View>
      ) : (
        <Text className="flex-1 font-inter-medium text-[13px] text-foreground" numberOfLines={1}>
          {value}
        </Text>
      )}
    </View>
  );
}

/** logoUrl göreli path döner (`/companies/media/:fileId`); mediaUrl mutlaklaştırır. */
function CompanyLogo({ uri }: { uri: string }) {
  const source = { uri: mediaUrl(uri) ?? uri };
  return (
    <View
      className="h-[68px] w-[68px] items-center justify-center overflow-hidden rounded-[14px] border border-border bg-card"
      style={{ borderCurve: 'continuous' }}
    >
      <Image source={source} className="h-[54px] w-[54px]" resizeMode="contain" accessibilityIgnoresInvertColors />
    </View>
  );
}

export default function CompanyDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const [tab, setTab] = useState<CompanyTab>('genel');
  const sheetRef = useRef<BottomSheetModal>(null);
  const crossDebt = useCompanyCrossDivisionDebt(id);
  const removeCompany = useDeleteCompany();
  const canDelete = useCan('companies.delete');
  const companyTasks = useTaskList({ companyId: id });
  const [uploading, setUploading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState<'xlsx' | 'pdf' | null>(null);
  const canUpdate = useCan('companies.update');
  const canLogActivity = useCan('activities.create');
  const canCreateTask = useCan('tasks.create');
  const canCreateOpportunity = useCan('opportunities.create');
  const canExportReports = useCan('reports.export');
  const canReadReceivables = useCan('receivables.read');
  const canExportStatement = canExportReports && canReadReceivables;
  const taskEvents = useTaskRecordEvents({ companyId: id });

  const { data, isPending, error, refetch } = useCompany(id);

  // `GET /companies/:id` join yapmıyor: ilişki tipi ve durum yalnızca id olarak
  // geliyor, adları lookup'tan çözülüyor (companies.service.ts `get()`).
  const relationTypes = useLookup('company-relation-types', Boolean(data?.relationTypeId));
  const statuses = useLookup('company-statuses', Boolean(data?.customerStatusId));

  const contactsQuery = useContactList({ companyId: id, sortBy: 'name', sortDir: 'asc' });
  const quotesQuery = useQuoteList({ companyId: id });
  // web CustomerDetail.tsx "Satış Kartları": firmaya bağlı fırsatlar (aşama + talep edilen ürün).
  const opportunitiesQuery = useOpportunityList({ companyId: id, view: 'all' });
  const invoicesQuery = useQuery({
    queryKey: ['accounting-invoices', 'list', { companyId: id, page: 1, pageSize: 20 }],
    queryFn: () => finance.invoices({ companyId: id, page: 1, pageSize: 20 }),
    enabled: Boolean(id) && tab === 'cari',
  });
  const devicesQuery = useQuery({
    queryKey: ['customer-devices', 'list', { companyId: id }],
    queryFn: () => devices.list({ companyId: id, page: 1, pageSize: 20 }),
    enabled: Boolean(id),
  });
  const financeSummary = useQuery({
    queryKey: ['companies', id, 'finance-summary'],
    queryFn: () => finance.companySummary(id),
    enabled: Boolean(id),
  });
  const activitiesQuery = useActivityList({ companyId: id });
  // Cari sekmesi açılana kadar bu iki liste boşuna çekilmesin.
  const receivablesQuery = useQuery({
    queryKey: ['receivables', 'list', { companyId: id, page: 1, pageSize: 20 }],
    queryFn: () => finance.receivables({ companyId: id, page: 1, pageSize: 20 }),
    enabled: Boolean(id) && tab === 'cari',
  });
  const paymentsQuery = useQuery({
    queryKey: ['payments', 'list', { companyId: id, page: 1, pageSize: 20 }],
    queryFn: () => finance.payments({ companyId: id, page: 1, pageSize: 20 }),
    enabled: Boolean(id) && tab === 'cari',
  });
  // Sunucu firma filtresi hem hızlı belgelerin doğrudan companyId alanını hem
  // teklife bağlı belgelerin quote.companyId alanını kapsar.
  const proformas = useCommercialDocuments('proforma', { companyId: id });
  const contracts = useCommercialDocuments('contract', { companyId: id });
  const invoices = useCommercialDocuments('invoice', { companyId: id });

  const updateStatus = useUpdateCompanyStatus({});

  const timeline = useMemo(
    () =>
      buildCompanyTimeline({
        activities: activitiesQuery.data?.items,
        taskEvents: taskEvents.data,
        quotes: quotesQuery.data?.items,
        opportunities: opportunitiesQuery.data?.items,
      }),
    [activitiesQuery.data, taskEvents.data, quotesQuery.data, opportunitiesQuery.data],
  );

  async function onRefresh() {
    setRefreshing(true);
    try {
      await Promise.all([
        refetch(),
        activitiesQuery.refetch(),
        taskEvents.refetch(),
        quotesQuery.refetch(),
        opportunitiesQuery.refetch(),
        contactsQuery.refetch(),
        companyTasks.refetch(),
        financeSummary.refetch(),
        devicesQuery.refetch(),
        crossDebt.refetch(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }

  async function downloadStatement(format: 'xlsx' | 'pdf') {
    if (exporting) return;
    setExporting(format);
    try {
      if (format === 'pdf') {
        await exportService.customerStatementPdf(id);
        toast.success('Cari ekstre PDF indirildi');
      } else {
        await exportService.customerStatement(id);
        toast.success('Cari ekstre indirildi');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      toast.error(`${format === 'pdf' ? 'PDF indirilemedi' : 'Ekstre indirilemedi'}${message ? ` · ${message}` : ''}`);
    } finally {
      setExporting(null);
    }
  }

  if (isPending || error || !data) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
        <DetailHeader title="Firma Detayı" />
        {isPending ? <Loading /> : <ErrorState message={error?.message ?? 'Kayıt yüklenemedi.'} onRetry={() => void refetch()} />}
      </SafeAreaView>
    );
  }

  const relationType = relationTypes.data?.find((row) => row.id === data.relationTypeId) ?? null;
  const status = statuses.data?.find((row) => row.id === data.customerStatusId) ?? null;
  const phone = preferred(data.phones)?.phone ?? null;
  const email = preferred(data.emails)?.email ?? null;
  const address = preferred(data.addresses);
  const mapsUrl =
    address?.latitude && address?.longitude
      ? `https://maps.google.com/?q=${address.latitude},${address.longitude}`
      : addressText(data)
        ? `https://maps.google.com/?q=${encodeURIComponent(addressText(data)!)}`
        : null;

  const contacts = contactsQuery.data?.items ?? [];
  const quotes = quotesQuery.data?.items ?? [];
  const quoteTotal = quotesQuery.data?.total ?? 0;
  const openQuoteAmount = quotes
    .filter((q) => !CLOSED_QUOTE_STATUS.has(q.status?.code ?? ''))
    .reduce((sum, q) => sum + Number(q.grandTotal || 0), 0);
  const ownedDevices = devicesQuery.data?.data ?? [];
  const documents = [
    ...(proformas.data?.items ?? []).map((doc) => ({ ...doc, kind: 'proforma' as DocumentKind })),
    ...(contracts.data?.items ?? []).map((doc) => ({ ...doc, kind: 'contract' as DocumentKind })),
    ...(invoices.data?.items ?? []).map((doc) => ({ ...doc, kind: 'invoice' as DocumentKind })),
  ];
  const companyName = data.shortName || data.legalTitle;
  const companyParams = `companyId=${encodeURIComponent(id)}&companyName=${encodeURIComponent(companyName)}`;
  const openVisit = canLogActivity ? () => router.push(`/modal/visit-new?${companyParams}` as Href) : undefined;
  const openCall = canLogActivity ? () => router.push(`/modal/call-new?${companyParams}` as Href) : undefined;
  const openTask = canCreateTask ? () => router.push(`/modal/task?companyId=${encodeURIComponent(id)}` as Href) : undefined;
  const openNewCard = canCreateOpportunity ? () => router.push(`/modal/new-opportunity?${companyParams}` as Href) : undefined;
  const documentTotal = (proformas.data?.total ?? 0) + (contracts.data?.total ?? 0) + (invoices.data?.total ?? 0);
  const documentsHaveMore = proformas.hasNextPage || contracts.hasNextPage || invoices.hasNextPage;
  const documentsFetchingMore =
    proformas.isFetchingNextPage || contracts.isFetchingNextPage || invoices.isFetchingNextPage;

  const primaryBalance = financeSummary.data?.byCurrency[0] ?? null;
  const currencyCode = primaryBalance?.currencyCode ?? 'TRY';
  const overdue = financeSummary.data?.aging.byCurrency.find((a) => a.currencyCode === currencyCode)?.overdueTotal ?? 0;

  const applyStatus = (code: (typeof STATUS_OPTIONS)[number]['code']) => {
    sheetRef.current?.dismiss();
    updateStatus.mutate({ id, customerStatusCode: code, operationId: Crypto.randomUUID() });
  };

  function renderOpportunity(opp: NonNullable<typeof opportunitiesQuery.data>['items'][number]) {
    const stage = QUALIFICATION_STAGES.includes(opp.qualificationStage as QualificationStage)
      ? (opp.qualificationStage as QualificationStage)
      : 'lead';
    return (
      <ListRow
        key={opp.id}
        title={opp.title}
        lines={[opp.requestedMachine, opp.stage?.name ?? null]}
        icon="briefcase-outline"
        chip={{ label: qualificationStageLabels[stage], tone: 'info' }}
        onPress={() => router.push(`/(tabs)/modules/opportunities/${opp.id}`)}
      />
    );
  }

  /** Web DocumentUploadDialog "Dış teklif" seçeneğiyle aynı kova/tip. */
  async function handleUploadDocument() {
    try {
      const local = await pickDocument();
      if (!local) return;
      setUploading(true);
      await uploadEntityAttachment({
        bucket: 'erp-quote-documents',
        entityType: 'company',
        entityId: id,
        documentTypeCode: 'external_quote',
        local,
      });
      toast.success('Belge yüklendi');
    } catch (err) {
      Alert.alert('Yüklenemedi', err instanceof Error ? err.message : 'Belge yüklenemedi.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <DetailHeader
        title="Firma Detayı"
        subtitle={data.externalCompanyNo ?? undefined}
        actions={[{ icon: 'ellipsis-horizontal', label: 'Firma işlemleri', onPress: () => sheetRef.current?.present() }]}
      />

      {/* Mockup s16: kimlik bilgisi ve künye TEK kart içinde, eylem pilleri de
          aynı kartın altında. Künye satırları ikon + gri etiket + koyu değer. */}
      <View style={{ paddingHorizontal: SCREEN_PAD }} className="gap-3 pt-3">
        <Card className="gap-3.5">
          <View className="flex-row items-start gap-3.5">
            {data.logoUrl ? <CompanyLogo uri={data.logoUrl} /> : <Avatar name={data.legalTitle} size={68} square />}
            <View className="flex-1 gap-2.5">
              <View className="flex-row items-start gap-2">
                <Text className="flex-1 text-[20px] font-inter-bold leading-[25px] text-foreground" numberOfLines={2}>
                  {data.legalTitle}
                </Text>
                <Chip tone={customerStatusTone(status?.code)} label={status?.name ?? 'Durum yok'} />
              </View>
              {/* web CustomerDetail.tsx: Tür (companyType) + Tip (relationType) ayrı
                  alanlar. Mockup'taki "Satış Temsilcisi" sunucuda yok — bkz. rapor. */}
              <DetailFact
                icon="business-outline"
                label="Firma Türü"
                value={data.companyType === 'company' ? 'Kurumsal Müşteri' : 'Bireysel Müşteri'}
              />
              <DetailFact icon="pricetag-outline" label="Tip" value={relationType?.name} />
              <DetailFact icon="location-outline" label="Şehir" value={address?.province} />
              {data.createdByUser ? (
                <DetailFact icon="person-outline" label="Sorumlu">
                  <View className="flex-row items-center gap-1.5">
                    <Avatar name={data.createdByUser.fullName} size={18} />
                    <Text className="flex-1 font-inter-medium text-[13px] text-foreground" numberOfLines={1}>
                      {data.createdByUser.fullName}
                    </Text>
                  </View>
                </DetailFact>
              ) : null}
            </View>
          </View>

          <View className="flex-row gap-2">
            <QuickAction icon="call-outline" label="Ara" onPress={phone ? () => void Linking.openURL(`tel:${phone}`) : undefined} />
            <QuickAction
              icon="mail-outline"
              label="E-posta"
              onPress={
                email
                  ? () =>
                      router.push(
                        mailComposeHref({ to: email, name: companyName, companyId: id }) as Href,
                      )
                  : undefined
              }
            />
            <QuickAction icon="walk-outline" label="Ziyaret" onPress={openVisit} />
            <QuickAction
              icon="ellipsis-horizontal"
              label="Diğer"
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                sheetRef.current?.present();
              }}
            />
          </View>
        </Card>
      </View>

      <View className="pt-3">
        <CompanyTabs
          value={tab}
          onChange={setTab}
          counts={{
            gecmis: timeline.length,
            kartlar: opportunitiesQuery.data?.total ?? 0,
            aktivite: activitiesQuery.data?.total ?? 0,
            teklifler: quoteTotal,
            gorevler: companyTasks.data?.meta.total ?? 0,
            belgeler: documentTotal,
          }}
        />
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ gap: 16, paddingHorizontal: SCREEN_PAD, paddingBottom: 40, paddingTop: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={colors.primary} />}
      >
        {tab === 'genel' ? (
          <>
            {crossDebt.data?.hasDebt ? (
              <Card className="gap-1.5 border-destructive-border bg-destructive-soft">
                <View className="flex-row items-center gap-2">
                  <Ionicons name="warning-outline" size={18} color={colors.destructive} />
                  <Text className="flex-1 font-inter-semibold text-[14px] text-destructive">
                    Başka birimde açık borç var
                  </Text>
                </View>
                <Text className="font-inter text-[13px] text-foreground">
                  {crossDebt.data.departments.map((d) => d.name).join(', ')}
                  {crossDebt.data.amount != null ? ` · ${formatAmount(crossDebt.data.amount, 'TRY')}` : ''}
                </Text>
              </Card>
            ) : null}

            <Card>
              <InfoRows
                items={[
                  { label: 'Kısa ad', value: data.shortName },
                  { label: 'Sektör', value: data.sector },
                  { label: 'Vergi dairesi', value: data.taxOffice },
                  { label: 'Vergi no', value: data.taxNumber },
                  { label: 'Telefon', value: phone },
                  { label: 'E-posta', value: email },
                  { label: 'Web', value: data.website },
                  { label: 'Birim', value: data.divisions?.map((d) => d.name).join(', ') || null },
                  { label: 'Firma grubu', value: data.companyGroups?.map((g) => g.name).join(', ') || null },
                ]}
              />
            </Card>

            <Card className="gap-1.5">
              <View className="flex-row items-center justify-between">
                <Eyebrow>Firma Notları</Eyebrow>
                {canUpdate ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Firma notunu düzenle"
                    hitSlop={12}
                    onPress={() => router.push(`/modal/company-note?id=${encodeURIComponent(id)}` as Href)}
                    className="h-11 w-11 items-center justify-center rounded-full active:bg-muted"
                  >
                    <Ionicons name="create-outline" size={18} color={colors.primary} />
                  </Pressable>
                ) : null}
              </View>
              <Text className={`font-inter text-sm ${data.notes?.trim() ? 'text-foreground' : 'text-muted-foreground'}`}>
                {data.notes?.trim() || 'Bu firma için henüz not eklenmemiş.'}
              </Text>
            </Card>

            {data.phones.length + data.emails.length > 1 ? (
              <Card className="gap-1.5">
                <Eyebrow>Tüm İletişim Bilgileri</Eyebrow>
                <InfoRows
                  items={[
                    ...data.phones.map((p) => ({
                      label: [CONTACT_TYPE_LABELS[p.phoneType] ?? p.phoneType, p.isDefault ? '(ana)' : null].filter(Boolean).join(' '),
                      value: [p.phone, p.extension ? `dh. ${p.extension}` : null].filter(Boolean).join(' · '),
                    })),
                    ...data.emails.map((e) => ({
                      label: [CONTACT_TYPE_LABELS[e.emailType] ?? e.emailType, e.isDefault ? '(ana)' : null].filter(Boolean).join(' '),
                      value: e.email,
                    })),
                  ]}
                />
              </Card>
            ) : null}

            {data.addresses.length > 0 ? (
              <View className="gap-1.5">
                <View className="px-1">
                  <Eyebrow>Firma Adresleri ({data.addresses.length})</Eyebrow>
                </View>
                {data.addresses.map((a) => (
                  <ListRow
                    key={a.id}
                    title={[a.fullAddress, a.district, a.province].filter(Boolean).join(', ') || ADDRESS_TYPE_LABELS[a.addressType] || 'Adres'}
                    lines={[ADDRESS_TYPE_LABELS[a.addressType] ?? a.addressType]}
                    icon="location-outline"
                    iconTone={a.isDefault ? 'success' : 'neutral'}
                    chip={a.isDefault ? { label: 'Ana adres', tone: 'success' } : undefined}
                  />
                ))}
              </View>
            ) : null}

            {opportunitiesQuery.data && opportunitiesQuery.data.items.length > 0 ? (
              <View className="gap-1.5">
                <View className="px-1">
                  <Eyebrow>Satış Kartları ({opportunitiesQuery.data.total})</Eyebrow>
                </View>
                {opportunitiesQuery.data.items.slice(0, 3).map(renderOpportunity)}
                {opportunitiesQuery.data.total > 3 ? (
                  <Button label={`Tümünü gör (${opportunitiesQuery.data.total})`} variant="ghost" onPress={() => setTab('kartlar')} />
                ) : null}
              </View>
            ) : null}

            <View className="gap-1.5">
              <View className="px-1">
                <Eyebrow>İletişim Kişileri ({contactsQuery.data?.total ?? 0})</Eyebrow>
              </View>
              {contactsQuery.isPending ? (
                <Loading />
              ) : contacts.length === 0 ? (
                <Card>
                  <Text className="text-center font-inter text-sm text-muted-foreground">Kayıtlı kontak yok.</Text>
                </Card>
              ) : (
                <>
                  {contacts.slice(0, 5).map((contact) => (
                    <ListRow
                      key={contact.id}
                      title={contact.fullName}
                      lines={[[contact.title, contact.department].filter(Boolean).join(' · ') || null, contact.mobilePhone ?? contact.workPhone]}
                      icon="person-outline"
                      iconTone={contact.isPrimary ? 'success' : 'neutral'}
                      chip={contact.isPrimary ? { label: 'Birincil', tone: 'success' } : undefined}
                      onPress={() => router.push(`/(tabs)/modules/contacts/${contact.id}`)}
                    />
                  ))}
                  {contacts.length > 5 ? (
                    <Text className="px-1 font-inter text-[12px] text-muted-foreground">+{contacts.length - 5} daha</Text>
                  ) : null}
                </>
              )}
            </View>

            <View className="gap-1.5">
              <View className="px-1">
                <Eyebrow>Son Teklifler ({quoteTotal})</Eyebrow>
              </View>
              {quotesQuery.isPending ? (
                <Loading />
              ) : quotes.length === 0 ? (
                <Card>
                  <Text className="text-center font-inter text-sm text-muted-foreground">Teklif bulunamadı.</Text>
                </Card>
              ) : (
                quotes
                  .slice(0, 5)
                  .map((quote) => (
                    <ListRow
                      key={quote.id}
                      title={quote.documentNo}
                      lines={[formatDate(quote.quoteDate)]}
                      icon="document-text-outline"
                      chip={quote.status ? { label: quote.status.name, tone: 'info' } : undefined}
                      trailing={formatAmount(quote.grandTotal, quote.currency?.code ?? 'TRY')}
                      onPress={() => router.push(`/(tabs)/modules/quotes/${quote.id}`)}
                    />
                  ))
              )}
            </View>

            <View className="gap-1.5">
              <View className="px-1">
                <Eyebrow>Finansal Özet</Eyebrow>
              </View>
              {financeSummary.isPending ? (
                <Loading />
              ) : financeSummary.error ? (
                <ErrorState message="Finansal özet yüklenemedi." onRetry={() => void financeSummary.refetch()} />
              ) : (
                <StatGrid columns={2}>
                  <StatCard icon="trending-up-outline" tone="info" label="Toplam Ciro" value={formatAmount(primaryBalance?.salesTotal ?? 0, currencyCode)} />
                  <StatCard icon="wallet-outline" tone="warning" label="Toplam Alacak" value={formatAmount(primaryBalance?.borc ?? 0, currencyCode)} />
                  <StatCard icon="alert-circle-outline" tone="destructive" label="Vade Geçmiş Alacak" value={formatAmount(overdue, currencyCode)} />
                  <StatCard icon="document-text-outline" tone="stage" label="Açık Teklif Tutarı" value={formatAmount(openQuoteAmount, currencyCode)} />
                </StatGrid>
              )}
            </View>

            <View className="gap-1.5">
              <View className="px-1">
                <Eyebrow>Makineler ({devicesQuery.data?.meta.total ?? 0})</Eyebrow>
              </View>
              {/* "İlgi Alanı" sunucuda yok — bkz. rapor. web CustomerDetail "Makineler": Model / Seri No / Garanti Bitiş. */}
              {devicesQuery.isPending ? (
                <Loading />
              ) : ownedDevices.length === 0 ? (
                <Card>
                  <Text className="text-center font-inter text-sm text-muted-foreground">Kayıtlı makine yok.</Text>
                </Card>
              ) : (
                // customer-devices modülünde detay ekranı yok (yalnızca liste) — satır tıklanamaz.
                ownedDevices.map((device) => (
                  <ListRow
                    key={device.id}
                    title={device.productModelName ?? device.model ?? 'Makine'}
                    lines={[
                      device.serialNumber ? `S/N ${device.serialNumber}` : null,
                      device.brandName,
                      device.installationDate ? `Kurulum: ${formatDate(device.installationDate)}` : null,
                      device.warrantyEndDate ? `Garanti bitiş: ${formatDate(device.warrantyEndDate)}` : null,
                    ]}
                    icon="hardware-chip-outline"
                    iconTone="neutral"
                  />
                ))
              )}
            </View>
          </>
        ) : null}

        {tab === 'gecmis' ? (
          <>
            <Eyebrow>Kayıt Geçmişi</Eyebrow>
            {activitiesQuery.isPending || taskEvents.isPending ? (
              <Loading />
            ) : timeline.length === 0 ? (
              <EmptyState title="Bu firma için geçmiş kaydı yok." icon="time-outline" />
            ) : (
              timeline.map((item) => (
                <ListRow
                  key={item.id}
                  title={item.title}
                  lines={[item.description, [formatDateTime(item.date), item.meta].filter(Boolean).join(' · ')]}
                  icon="time-outline"
                  chip={{ label: item.type, tone: 'neutral' }}
                  onPress={item.route ? () => router.push(item.route as Href) : undefined}
                />
              ))
            )}
          </>
        ) : null}

        {tab === 'kartlar' ? (
          <>
            {openNewCard ? <Button label="Yeni Kart" trailingIcon="add" onPress={openNewCard} /> : null}
            {opportunitiesQuery.isPending ? (
              <Loading />
            ) : opportunitiesQuery.error ? (
              <ErrorState message={opportunitiesQuery.error.message} onRetry={() => void opportunitiesQuery.refetch()} />
            ) : (opportunitiesQuery.data?.items ?? []).length === 0 ? (
              <EmptyState title="Satış kartı yok" hint="Bu firmaya bağlı satış kartı bulunmuyor." icon="briefcase-outline" />
            ) : (
              <>
                {(opportunitiesQuery.data?.items ?? []).map(renderOpportunity)}
                {opportunitiesQuery.hasNextPage ? (
                  <Button
                    label="Daha fazla yükle"
                    variant="ghost"
                    loading={opportunitiesQuery.isFetchingNextPage}
                    onPress={() => void opportunitiesQuery.fetchNextPage()}
                  />
                ) : null}
              </>
            )}
          </>
        ) : null}

        {tab === 'aktivite' ? (
          <>
            {canLogActivity ? (
              <View className="flex-row gap-2">
                <View className="flex-1">
                  <Button label="Müşteri Ziyareti" variant="ghost" trailingIcon="walk-outline" onPress={openVisit} />
                </View>
                <View className="flex-1">
                  <Button label="Giden Arama" variant="ghost" trailingIcon="call-outline" onPress={openCall} />
                </View>
              </View>
            ) : null}
            {activitiesQuery.isPending ? (
              <Loading />
            ) : (activitiesQuery.data?.items ?? []).length === 0 ? (
              <EmptyState title="Aktivite bulunamadı" />
            ) : (
              (activitiesQuery.data?.items ?? []).map((activity) => (
                <ListRow
                  key={activity.id}
                  title={activity.subject}
                  lines={[activity.type?.name, formatDateTime(activity.activityDate), activity.result]}
                  icon="pulse-outline"
                  iconTone={activity.origin === 'system' ? 'neutral' : 'info'}
                  chip={!activity.opportunityId ? { label: 'Fırsat Dışı', tone: 'warning' } : undefined}
                  onPress={() => router.push(`/(tabs)/modules/activities/${activity.id}` as Href)}
                />
              ))
            )}
          </>
        ) : null}

        {tab === 'teklifler' ? (
          quotesQuery.isPending ? (
            <Loading />
          ) : quotes.length === 0 ? (
            <EmptyState title="Teklif bulunamadı" />
          ) : (
            <>
              {quotes.map((quote) => (
                <ListRow
                  key={quote.id}
                  title={quote.documentNo}
                  lines={[formatDate(quote.quoteDate)]}
                  icon="document-text-outline"
                  chip={quote.status ? { label: quote.status.name, tone: 'info' } : undefined}
                  trailing={formatAmount(quote.grandTotal, quote.currency?.code ?? 'TRY')}
                  onPress={() => router.push(`/(tabs)/modules/quotes/${quote.id}`)}
                />
              ))}
              {quotesQuery.hasNextPage ? (
                <Button label="Daha fazla yükle" variant="ghost" loading={quotesQuery.isFetchingNextPage} onPress={() => void quotesQuery.fetchNextPage()} />
              ) : null}
            </>
          )
        ) : null}

        {tab === 'cari' ? (
          <>
            {canExportStatement ? (
              <View className="flex-row gap-2">
                <View className="flex-1">
                  <Button
                    label="Excel"
                    variant="ghost"
                    trailingIcon="download-outline"
                    loading={exporting === 'xlsx'}
                    disabled={exporting !== null}
                    accessibilityLabel="Cari ekstre Excel indir"
                    onPress={() => void downloadStatement('xlsx')}
                  />
                </View>
                <View className="flex-1">
                  <Button
                    label="PDF"
                    variant="ghost"
                    trailingIcon="document-text-outline"
                    loading={exporting === 'pdf'}
                    disabled={exporting !== null}
                    accessibilityLabel="Cari ekstre PDF indir"
                    onPress={() => void downloadStatement('pdf')}
                  />
                </View>
              </View>
            ) : null}
            {financeSummary.data && financeSummary.data.byCurrency.length === 0 ? (
              <Card>
                <Text className="text-center font-inter text-sm text-muted-foreground">Cari bakiye kaydı yok</Text>
              </Card>
            ) : null}
            {financeSummary.data ? (
              <StatGrid columns={2}>
                <StatCard icon="trending-up-outline" tone="info" label="Toplam Ciro" value={formatAmount(primaryBalance?.salesTotal ?? 0, currencyCode)} />
                <StatCard icon="wallet-outline" tone="warning" label="Toplam Alacak" value={formatAmount(primaryBalance?.borc ?? 0, currencyCode)} />
                <StatCard icon="alert-circle-outline" tone="destructive" label="Vade Geçmiş Alacak" value={formatAmount(overdue, currencyCode)} />
                <StatCard icon="checkmark-done-outline" tone="success" label="Net Bakiye" value={formatAmount(primaryBalance?.totalBalance ?? 0, currencyCode)} />
              </StatGrid>
            ) : null}

            <View className="gap-1.5">
              <View className="px-1">
                <Eyebrow>Açık Alacaklar</Eyebrow>
              </View>
              {receivablesQuery.isPending ? (
                <Loading />
              ) : (receivablesQuery.data?.data.length ?? 0) === 0 ? (
                <Card>
                  <Text className="text-center font-inter text-sm text-muted-foreground">Açık alacak yok.</Text>
                </Card>
              ) : (
                receivablesQuery.data!.data.map((r) => (
                  <ListRow key={r.id} title={r.invoiceNo ?? 'Alacak'} lines={[formatDate(r.dueDate)]} icon="cash-outline" iconTone="warning" trailing={formatAmount(r.amount, r.currency?.code ?? 'TRY')} />
                ))
              )}
            </View>

            <View className="gap-1.5">
              <View className="px-1">
                <Eyebrow>Son Ödemeler / Tahsilatlar</Eyebrow>
              </View>
              {paymentsQuery.isPending ? (
                <Loading />
              ) : (paymentsQuery.data?.data.length ?? 0) === 0 ? (
                <Card>
                  <Text className="text-center font-inter text-sm text-muted-foreground">Kayıt yok.</Text>
                </Card>
              ) : (
                paymentsQuery.data!.data.map((p) => (
                  <ListRow
                    key={p.id}
                    title={p.direction === 'in' ? 'Tahsilat' : 'Ödeme'}
                    lines={[formatDate(p.paymentDate), p.paymentMethod]}
                    icon={p.direction === 'in' ? 'arrow-down-circle-outline' : 'arrow-up-circle-outline'}
                    iconTone={p.direction === 'in' ? 'success' : 'destructive'}
                    trailing={formatAmount(p.amount, p.currency?.code ?? 'TRY')}
                  />
                ))
              )}
            </View>

            <View className="gap-1.5">
              <View className="px-1">
                <Eyebrow>Faturalar</Eyebrow>
              </View>
              {invoicesQuery.isPending ? (
                <Loading />
              ) : (invoicesQuery.data?.data.length ?? 0) === 0 ? (
                <Card>
                  <Text className="text-center font-inter text-sm text-muted-foreground">Fatura yok.</Text>
                </Card>
              ) : (
                invoicesQuery.data!.data.map((inv) => (
                  <ListRow
                    key={inv.id}
                    title={inv.invoiceNo}
                    lines={[inv.firstDueDate ? `Vade: ${formatDate(inv.firstDueDate)}` : null]}
                    icon="receipt-outline"
                    trailing={formatAmount(inv.grandTotal, inv.currency?.code ?? 'TRY')}
                  />
                ))
              )}
            </View>
          </>
        ) : null}

        {tab === 'gorevler' && openTask ? <Button label="Görev Oluştur" variant="ghost" trailingIcon="add" onPress={openTask} /> : null}

        {tab === 'gorevler' ? (
          companyTasks.isPending ? (
            <Loading />
          ) : (companyTasks.data?.data ?? []).length === 0 ? (
            <EmptyState title="Görev yok" hint="Bu firmaya bağlı görev kaydı bulunmuyor." />
          ) : (
            <View className="gap-0">
              {(companyTasks.data?.data ?? []).map((task) => (
                <ListRow
                  key={task.id}
                  title={task.title}
                  lines={[task.dueAt ? formatDate(task.dueAt) : null]}
                  icon="checkbox-outline"
                  iconTone={task.status === 'done' ? 'success' : 'neutral'}
                  onPress={() => router.push(`/(tabs)/modules/tasks/${task.id}`)}
                />
              ))}
            </View>
          )
        ) : null}

        {tab === 'belgeler' && canUpdate ? (
          <Button
            label="Belge Yükle"
            variant="ghost"
            trailingIcon="cloud-upload-outline"
            loading={uploading}
            disabled={uploading}
            onPress={() => void handleUploadDocument()}
          />
        ) : null}

        {tab === 'belgeler' ? (
          documents.length === 0 ? (
            <EmptyState title="Belge bulunamadı" />
          ) : (
            <View className="gap-2">
              {documents.map((doc) => (
                <ListRow
                  key={`${doc.kind}-${doc.id}`}
                  title={doc.no}
                  lines={[doc.date ? formatDate(doc.date) : null]}
                  onPress={() => router.push(`/(tabs)/modules/documents/${doc.kind}/${doc.id}` as Href)}
                  icon="document-text-outline"
                  iconTone={doc.finalized ? 'success' : 'neutral'}
                  chip={doc.statusName ? { label: doc.statusName, tone: doc.finalized ? 'success' : 'neutral' } : undefined}
                />
              ))}
              {documentsHaveMore ? (
                <Button
                  label="Daha Fazla Belge"
                  variant="ghost"
                  loading={documentsFetchingMore}
                  disabled={documentsFetchingMore}
                  onPress={() => {
                    if (proformas.hasNextPage) void proformas.fetchNextPage();
                    if (contracts.hasNextPage) void contracts.fetchNextPage();
                    if (invoices.hasNextPage) void invoices.fetchNextPage();
                  }}
                />
              ) : null}
            </View>
          )
        ) : null}
      </ScrollView>

      <BottomSheetModal
        ref={sheetRef}
        enableDynamicSizing
        backgroundStyle={{ backgroundColor: colors.card }}
        handleIndicatorStyle={{ backgroundColor: colors.mutedForeground }}
        backdropComponent={(props) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />}
      >
        <BottomSheetView className="gap-2 px-5 pb-10 pt-2">
          <Text className="mb-1 font-inter-semibold text-base text-foreground">Diğer İşlemler</Text>
          {[
            { key: 'call', label: 'Giden Arama Kaydet', onPress: openCall },
            { key: 'task', label: 'Görev Oluştur', onPress: openTask },
            { key: 'card', label: 'Yeni Satış Kartı', onPress: openNewCard },
            {
              key: 'map',
              label: 'Haritada Gör',
              onPress: mapsUrl ? () => void Linking.openURL(mapsUrl) : undefined,
            },
          ]
            .filter((action) => action.onPress)
            .map((action) => (
              <Button
                key={action.key}
                label={action.label}
                variant="ghost"
                onPress={() => {
                  sheetRef.current?.dismiss();
                  action.onPress?.();
                }}
              />
            ))}
          {canUpdate ? (
            <>
              <Text className="font-inter mb-1 text-xs text-muted-foreground">Müşteri durumunu değiştir</Text>
              {STATUS_OPTIONS.map((opt) => (
                <Button key={opt.code} label={opt.label} variant={status?.code === opt.code ? 'primary' : 'ghost'} onPress={() => applyStatus(opt.code)} />
              ))}
              {/* Web EditCustomerDialog'unun mobil karşılığı */}
              <Button
                label="Bilgileri Düzenle"
                variant="ghost"
                onPress={() => {
                  sheetRef.current?.dismiss();
                  router.push(`/modal/edit-company?id=${encodeURIComponent(id)}` as Href);
                }}
              />
            </>
          ) : null}
          {data.website ? (
            <Button
              label="Web Sitesini Aç"
              variant="ghost"
              onPress={() => {
                sheetRef.current?.dismiss();
                void Linking.openURL(data.website!.startsWith('http') ? data.website! : `https://${data.website}`);
              }}
            />
          ) : null}
          {canDelete ? (
            <Button
              label="Firmayı Sil"
              variant="destructive"
              loading={removeCompany.isPending}
              disabled={removeCompany.isPending}
              onPress={() => {
                sheetRef.current?.dismiss();
                Alert.alert(
                  'Firmayı sil',
                  'Firma kalıcı olarak silinecek. Bağlı kontak, fırsat veya teklif varsa sunucu silmeyi reddeder.',
                  [
                    { text: 'Vazgeç', style: 'cancel' },
                    {
                      text: 'Sil',
                      style: 'destructive',
                      onPress: () =>
                        removeCompany.mutate(id, {
                          onSuccess: () => {
                            toast.success('Firma silindi');
                            router.back();
                          },
                          onError: (err) => Alert.alert('Silinemedi', err.message),
                        }),
                    },
                  ]
                );
              }}
            />
          ) : null}
        </BottomSheetView>
      </BottomSheetModal>
    </SafeAreaView>
  );
}
