import { companyAddressLabel, companyAddressLinks, showCompanyAddressActions } from '@/src/native/company-address';
import { useHierarchyBack } from '@/src/modules/useHierarchyBack';
import { openQuoteTotals, formatCurrencyAmounts } from '@/src/ui/crm/company-finance';
import { collectPaginated } from '@/src/api/pagination';
import { useAllQuoteList } from '@/src/api/quotes.hooks';
import { startCrmCall } from '@/src/call-assistant/call';
import { useMemo, useRef, useState } from 'react';
import { Image, Linking, Pressable, RefreshControl, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fileLinksApi } from '@/src/api/commercial-docs.api';
import { BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import { SheetBackdrop } from '@/src/ui/SheetBackdrop';
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
import { downloadAndShareFile, pickDocument, uploadEntityAttachment } from '@/src/native/files';
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
import { useSalesOrders } from '@/src/api/inventory.hooks';
import { formatAmount, formatDate, formatDateTime } from '@/src/lib/format';
import { customerStatusTone, useTheme, type Tone } from '@/src/theme/theme';
import { Avatar } from '@/src/ui/Avatar';
import { useCan } from '@/src/auth/AuthProvider';
import { Button, Card, Chip, DetailHeader, EmptyState, ErrorState, Eyebrow, FilterChips, ListRow, Loading, SCREEN_PAD } from '@/src/ui';
import { CollapsingDetailScroll, PinnedIdentity } from '@/src/ui/collapsing-detail';
import { InfoRows, StatCard, StatGrid } from '@/src/ui/data';
import { UPLOAD_TYPES, uploadFileError, type UploadFolder } from '@/src/ui/documents/document-logic';
import { ServiceTicketRow, useCompanyServiceSummary, useCompanyServiceTickets } from '@/src/ui/service/SalesServiceLinks';
import { machineStatusLabel, machineStatusTone, WARRANTY_TONE, warrantyInfo, warrantyShortLabel } from '@/src/ui/service/machines';

/** Varsayılan kayıt yoksa ilk kayda düş; sunucu sıralamayı garanti etmiyor. */
function preferred<T extends { isDefault: boolean }>(rows: T[] | undefined): T | null {
  if (!rows?.length) return null;
  return rows.find((row) => row.isDefault) ?? rows[0]!;
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

type CompanyTab = 'genel' | 'gecmis' | 'kartlar' | 'aktivite' | 'teklifler' | 'gorevler' | 'servis' | 'cari' | 'belgeler';

const COMPANY_TABS: { value: CompanyTab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'genel', label: 'Genel', icon: 'grid-outline' },
  { value: 'gecmis', label: 'Geçmiş', icon: 'time-outline' },
  { value: 'kartlar', label: 'Satış Kartları', icon: 'briefcase-outline' },
  { value: 'aktivite', label: 'Aktivite', icon: 'pulse-outline' },
  { value: 'teklifler', label: 'Teklifler', icon: 'document-text-outline' },
  { value: 'gorevler', label: 'Görevler', icon: 'checkbox-outline' },
  { value: 'servis', label: 'Servis', icon: 'construct-outline' },
  { value: 'cari', label: 'Cari', icon: 'person-outline' },
  { value: 'belgeler', label: 'Belgeler', icon: 'folder-outline' },
];

function CompanyTabs({
  value,
  onChange,
  counts,
  canReadService,
}: {
  value: CompanyTab;
  onChange: (value: CompanyTab) => void;
  counts: Partial<Record<CompanyTab, number>>;
  canReadService: boolean;
}) {
  const { colors } = useTheme();
  return (
    <ScrollView
      horizontal
      nestedScrollEnabled
      showsHorizontalScrollIndicator={false}
      style={{ minHeight: 48, flexGrow: 0, flexShrink: 0 }}
      contentContainerStyle={{ gap: 8, paddingHorizontal: SCREEN_PAD }}
    >
      {COMPANY_TABS.filter((item) => item.value !== 'servis' || canReadService).map((item) => {
        const selected = item.value === value;
        const count = counts[item.value] ?? 0;
        return (
          <Pressable
            key={item.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={`${item.label}${count > 0 ? `, ${count} kayıt` : ''}`}
            onPress={() => onChange(item.value)}
            className={`min-h-[48px] flex-row items-center gap-2 rounded-[12px] border px-4 py-3 active:opacity-70 ${
              selected ? 'border-primary bg-primary' : 'border-border bg-card'
            }`}
            style={{ borderCurve: 'continuous' }}
          >
            <Ionicons name={item.icon} size={18} color={selected ? colors.primaryForeground : colors.mutedForeground} />
            <Text className={`font-inter-medium text-[14px] ${selected ? 'text-primary-foreground' : 'text-muted-foreground'}`}>
              {item.label}
            </Text>
            {count > 0 ? (
              <View className={`min-w-[18px] items-center rounded-full px-1 ${selected ? 'bg-primary-foreground/20' : 'bg-secondary'}`}>
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
  hint,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  hint?: string;
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  const disabled = !onPress;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className="min-h-[72px] flex-1 items-center justify-center gap-2 rounded-[12px] bg-secondary px-2 py-3 active:opacity-70"
      style={[{ borderCurve: 'continuous' }, disabled ? { opacity: 0.4 } : null]}
    >
      <Ionicons name={icon} size={21} color={disabled ? colors.mutedForeground : colors.primary} />
      <Text className={`text-center font-inter-medium text-[13px] ${disabled ? 'text-muted-foreground' : 'text-primary'}`}>
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
      <Text className="w-[84px] font-inter text-[13px] text-muted-foreground" numberOfLines={1}>
        {label}
      </Text>
      {children ? (
        <View className="flex-1 flex-row items-center">{children}</View>
      ) : (
        <Text className="flex-1 font-inter-medium text-[13px] text-foreground" selectable>
          {value}
        </Text>
      )}
    </View>
  );
}

/** logoUrl göreli path döner (`/companies/media/:fileId`); mediaUrl mutlaklaştırır. */
function CompanyLogo({ uri, size = 68 }: { uri: string; size?: number }) {
  const source = { uri: mediaUrl(uri) ?? uri };
  const inner = Math.round(size * 0.79);
  return (
    <View
      className="items-center justify-center overflow-hidden border border-border bg-card"
      style={{ width: size, height: size, borderRadius: size > 40 ? 14 : 8, borderCurve: 'continuous' }}
    >
      <Image source={source} style={{ width: inner, height: inner }} resizeMode="contain" accessibilityIgnoresInvertColors />
    </View>
  );
}

export default function CompanyDetailScreen() {
  const { goBack } = useHierarchyBack();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const [tab, setTab] = useState<CompanyTab>('genel');
  const [overviewOpen, setOverviewOpen] = useState(false);
  const { width, fontScale } = useWindowDimensions();
  const wideSummary = width >= 840 && fontScale < 1.5;
  const generousActions = width >= 400 || fontScale <= 1.15;
  const sheetRef = useRef<BottomSheetModal>(null);
  const crossDebt = useCompanyCrossDivisionDebt(id);
  const removeCompany = useDeleteCompany();
  const canDelete = useCan('companies.delete');
  const canReadTasks = useCan('tasks.read');
  const canReadContacts = useCan('contacts.read');
  const canReadQuotes = useCan('quotes.read');
  const canReadOpportunities = useCan('opportunities.read');
  const canReadActivities = useCan('activities.read');
  const canReadDevices = useCan('customer_devices.read');
  const canReadPayments = useCan('payments.read');
  const canReadInvoices = useCan('accounting_invoices.read');
  const companyTasks = useTaskList({ companyId: id }, canReadTasks);
  const [uploading, setUploading] = useState(false);
  const [uploadFolder, setUploadFolder] = useState<UploadFolder>('external_quote');
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState<'xlsx' | 'pdf' | null>(null);
  const canUpdate = useCan('companies.update');
  const canReadFiles = useCan('files.read');
  const canReadSalesOrders = useCan('sales_orders.read');
  const serviceSummary = useCompanyServiceSummary(id);
  const service = useCompanyServiceTickets(id, tab === 'servis');
  const queryClient = useQueryClient();
  // Firmaya bağlı dosyalar (logo hariç). Yükleme türü seçilebilir; liste tüm tipleri gösterir.
  const companyFiles = useQuery({
    queryKey: ['companies', 'files', id],
    queryFn: () => collectPaginated((page) => fileLinksApi.list({ entityType: 'company', entityId: id, page, pageSize: 100 })),
    select: (page) => page.data.filter((row) => row.documentType?.code !== 'company_logo'),
    enabled: canReadFiles && Boolean(id),
  });
  const salesOrders = useSalesOrders({ companyId: id }, canReadSalesOrders && Boolean(id));
  const canLogActivity = useCan('activities.create');
  const canCreateTask = useCan('tasks.create');
  const canCreateOpportunity = useCan('opportunities.create');
  const canCreateContact = useCan('contacts.create');
  const canCreateDevice = useCan('customer_devices.update');
  const canExportReports = useCan('reports.export');
  const canReadReceivables = useCan('receivables.read');
  const canCreateQuote = useCan('quotes.create');
  const canCreateTicket = useCan('service_tickets.create');
  const canCreateReceivable = useCan('receivables.create');
  const canCreatePayment = useCan('payments.create');
  const canExportStatement = canExportReports && canReadReceivables;
  const taskEvents = useTaskRecordEvents({ companyId: id }, canReadTasks);

  const { data, isPending, error, refetch } = useCompany(id);

  // `GET /companies/:id` join yapmıyor: ilişki tipi ve durum yalnızca id olarak
  // geliyor, adları lookup'tan çözülüyor (companies.service.ts `get()`).
  const relationTypes = useLookup('company-relation-types', Boolean(data?.relationTypeId));
  const statuses = useLookup('company-statuses', Boolean(data?.customerStatusId));

  const contactsQuery = useContactList({ companyId: id, sortBy: 'name', sortDir: 'asc' }, canReadContacts);
  const quotesQuery = useQuoteList({ companyId: id }, canReadQuotes);
  const completeQuotes = useAllQuoteList({ companyId: id }, canReadQuotes);
  // web CustomerDetail.tsx "Satış Kartları": firmaya bağlı fırsatlar (aşama + talep edilen ürün).
  const opportunitiesQuery = useOpportunityList({ companyId: id, view: 'all' }, canReadOpportunities);
  const invoicesQuery = useQuery({
    queryKey: ['accounting-invoices', 'complete-company', id],
    queryFn: () => collectPaginated(async (page) => {
      const result = await finance.invoices({ companyId: id, page, pageSize: 50 });
      return { data: result.data, meta: { page: result.page, pageSize: result.pageSize, total: result.total, totalPages: Math.ceil(result.total / result.pageSize) } };
    }),
    enabled: Boolean(id) && tab === 'cari' && canReadInvoices,
  });
  const devicesQuery = useQuery({
    queryKey: ['customer-devices', 'complete-company', id],
    queryFn: () => collectPaginated((page) => devices.list({ companyId: id, page, pageSize: 50 })),
    enabled: Boolean(id) && canReadDevices,
  });
  const financeSummary = useQuery({
    queryKey: ['companies', id, 'finance-summary'],
    queryFn: () => finance.companySummary(id),
    enabled: Boolean(id) && canReadReceivables,
  });
  const activitiesQuery = useActivityList({ companyId: id }, canReadActivities);
  // Cari sekmesi açılana kadar bu iki liste boşuna çekilmesin.
  const receivablesQuery = useQuery({
    queryKey: ['receivables', 'complete-company', id],
    queryFn: () => collectPaginated((page) => finance.receivables({ companyId: id, page, pageSize: 50 })),
    enabled: Boolean(id) && tab === 'cari' && canReadReceivables,
  });
  const paymentsQuery = useQuery({
    queryKey: ['payments', 'complete-company', id],
    queryFn: () => collectPaginated((page) => finance.payments({ companyId: id, page, pageSize: 50 })),
    enabled: Boolean(id) && tab === 'cari' && canReadPayments,
  });
  // Sunucu firma filtresi hem hızlı belgelerin doğrudan companyId alanını hem
  // teklife bağlı belgelerin quote.companyId alanını kapsar.
  const canReadProformas = useCan('proformas.read');
  const canReadContracts = useCan('contracts.read');
  const canReadCommercialInvoices = useCan('commercial_invoices.read');
  const proformas = useCommercialDocuments('proforma', { companyId: id }, canReadProformas);
  const contracts = useCommercialDocuments('contract', { companyId: id }, canReadContracts);
  const invoices = useCommercialDocuments('invoice', { companyId: id }, canReadCommercialInvoices);

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
        canReadActivities ? activitiesQuery.refetch() : Promise.resolve(),
        canReadTasks ? taskEvents.refetch() : Promise.resolve(),
        canReadQuotes ? quotesQuery.refetch() : Promise.resolve(),
        canReadQuotes ? completeQuotes.refetch() : Promise.resolve(),
        canReadOpportunities ? opportunitiesQuery.refetch() : Promise.resolve(),
        canReadContacts ? contactsQuery.refetch() : Promise.resolve(),
        canReadTasks ? companyTasks.refetch() : Promise.resolve(),
        canReadReceivables ? financeSummary.refetch() : Promise.resolve(),
        canReadDevices ? devicesQuery.refetch() : Promise.resolve(),
        canReadSalesOrders ? salesOrders.refetch() : Promise.resolve(),
        canReadFiles ? companyFiles.refetch() : Promise.resolve(),
        crossDebt.refetch(),
        ...(tab === 'cari' ? [canReadInvoices ? invoicesQuery.refetch() : Promise.resolve(), canReadReceivables ? receivablesQuery.refetch() : Promise.resolve(), canReadPayments ? paymentsQuery.refetch() : Promise.resolve()] : []),
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
        <DetailHeader title="Firma Detayı" compact />
        {isPending ? <Loading /> : <ErrorState message={error?.message ?? 'Kayıt yüklenemedi.'} onRetry={() => void refetch()} />}
      </SafeAreaView>
    );
  }

  const relationType = relationTypes.data?.find((row) => row.id === data.relationTypeId) ?? null;
  const status = statuses.data?.find((row) => row.id === data.customerStatusId) ?? null;
  const phone = preferred(data.phones)?.phone ?? null;
  const email = preferred(data.emails)?.email ?? null;
  const address = preferred(data.addresses);
  const hasMapAddress = address && companyAddressLinks(address);

  const contacts = contactsQuery.data?.items ?? [];
  const quotes = quotesQuery.data?.items ?? [];
  const quoteTotal = quotesQuery.data?.total ?? 0;
  const openQuoteAmounts = openQuoteTotals(completeQuotes.data?.items ?? []);
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
  const openNewCard = canCreateOpportunity ? () => router.push(`/modal/create-case?${companyParams}` as Href) : undefined;
  // Canlı hattaki hızlı oluşturma: form firma bilgisiyle dolu açılır.
  const openQuote = canCreateQuote ? () => router.push(`/modal/quote-form?companyId=${encodeURIComponent(id)}` as Href) : undefined;
  const openTicket = canCreateTicket ? () => router.push(`/modal/new-ticket?${companyParams}` as Href) : undefined;
  const openReceivable = canCreateReceivable ? () => router.push(`/modal/new-receivable?${companyParams}` as Href) : undefined;
  const openPayment = canCreatePayment ? () => router.push(`/modal/payment?direction=in&${companyParams}` as Href) : undefined;
  const documentTotal = (proformas.data?.total ?? 0) + (contracts.data?.total ?? 0) + (invoices.data?.total ?? 0);
  const documentsHaveMore = proformas.hasNextPage || contracts.hasNextPage || invoices.hasNextPage;
  const documentsFetchingMore =
    proformas.isFetchingNextPage || contracts.isFetchingNextPage || invoices.isFetchingNextPage;


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
        onPress={() => router.push(`/modules/opportunities/${opp.id}`)}
      />
    );
  }

  /** Web DocumentUploadDialog: seçilen türe göre kova + documentTypeCode. */
  async function handleUploadDocument() {
    try {
      const meta = UPLOAD_TYPES.find((entry) => entry.folder === uploadFolder) ?? UPLOAD_TYPES[0]!;
      const local = await pickDocument();
      if (!local) return;
      const validation = uploadFileError(meta.folder, { extension: local.extension, sizeBytes: local.sizeBytes });
      if (validation) {
        Alert.alert('Dosya uygun değil', validation);
        return;
      }
      setUploading(true);
      await uploadEntityAttachment({
        bucket: meta.bucket,
        entityType: 'company',
        entityId: id,
        documentTypeCode: meta.documentTypeCode as Parameters<typeof uploadEntityAttachment>[0]['documentTypeCode'],
        local,
      });
      void queryClient.invalidateQueries({ queryKey: ['companies', 'files', id] });
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
        title={companyName}
        subtitle={data.externalCompanyNo ?? undefined}
        actions={[{ icon: 'ellipsis-horizontal', label: 'Firma işlemleri', onPress: () => sheetRef.current?.present() }]}
        compact
      />

      <CollapsingDetailScroll
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={colors.primary} />}
        intro={
          <View style={{ paddingHorizontal: SCREEN_PAD, width: '100%', maxWidth: 1080, alignSelf: 'center' }} className="pb-2 pt-2">
            <Card className="gap-2.5 p-3">
              <View className="flex-row items-start gap-3">
                {data.logoUrl ? <CompanyLogo uri={data.logoUrl} size={40} /> : <Avatar name={data.legalTitle} size={40} square />}
                <View className="min-w-0 flex-1 gap-1">
                  {data.shortName && data.shortName !== data.legalTitle ? <Text className="font-inter text-[12px] leading-4 text-muted-foreground" selectable numberOfLines={1}>{data.legalTitle}</Text> : null}
                  <View className="flex-row flex-wrap items-center gap-1.5">
                    <Chip tone={customerStatusTone(status?.code)} label={status?.name ?? 'Durum yok'} />
                    {relationType ? <Chip tone={RELATION_TONE[relationType.code] ?? 'neutral'} label={relationType.name} /> : null}
                    {address?.province ? <Text className="font-inter text-[12px] text-muted-foreground">{[address.district, address.province].filter(Boolean).join(' · ')}</Text> : null}
                  </View>
                </View>
              </View>
              <View style={{ flexDirection: wideSummary ? 'row' : 'column', gap: 12 }}>
                <View style={{ flex: wideSummary ? 1 : undefined }} className="gap-2">
                  <DetailFact icon="business-outline" label="Firma türü" value={data.companyType === 'company' ? 'Kurumsal müşteri' : 'Bireysel müşteri'} />
                  {phone ? <DetailFact icon="call-outline" label="Telefon" value={phone} /> : null}
                  {email ? <DetailFact icon="mail-outline" label="E-posta" value={email} /> : null}
                </View>
                <View style={{ flex: wideSummary ? 1.2 : undefined, gap: 6 }}>
                  <Text className="font-inter-medium text-[11px] text-muted-foreground">Hızlı işlemler</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {[
                      { icon: 'call-outline' as const, label: 'Ara', hint: phone ? 'Firmanın ana telefonunu arar' : 'Kayıtlı ana telefon yok', onPress: phone ? () => void startCrmCall(phone, { companyId: data.id }) : undefined },
                      { icon: 'navigate-outline' as const, label: 'Rota', hint: hasMapAddress ? 'Ana adres için harita ve rota seçeneklerini açar' : 'Haritada açılabilecek ana adres yok', onPress: hasMapAddress ? () => showCompanyAddressActions(address!, companyName) : undefined },
                      ...(canUpdate ? [{ icon: 'create-outline' as const, label: 'Not', hint: 'Firma notunu düzenler', onPress: () => router.push(`/modal/company-note?id=${encodeURIComponent(id)}` as Href) }] : []),
                      ...(openNewCard ? [{ icon: 'add-circle-outline' as const, label: 'Fırsat', hint: 'Bu firmaya bağlı yeni satış kartı açar', onPress: openNewCard }] : []),
                    ].map(action => <View key={action.label} style={{ width: generousActions ? undefined : '47%', flex: generousActions ? 1 : undefined }}><QuickAction {...action} /></View>)}
                  </View>
                </View>
              </View>
              <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-2">
                {email ? <Pressable accessibilityRole="button" accessibilityLabel="Firmaya e-posta yaz" onPress={() => router.push(mailComposeHref({ to: email, name: companyName, companyId: id }) as Href)} className="min-h-10 flex-row items-center gap-1.5 py-1.5"><Ionicons name="mail-outline" size={16} color={colors.primary} /><Text className="font-inter-medium text-[13px] text-primary">E-posta</Text></Pressable> : null}
                {openVisit ? <Pressable accessibilityRole="button" onPress={openVisit} className="min-h-10 flex-row items-center gap-1.5 py-1.5"><Ionicons name="walk-outline" size={16} color={colors.primary} /><Text className="font-inter-medium text-[13px] text-primary">Ziyaret</Text></Pressable> : null}
                <Pressable accessibilityRole="button" accessibilityLabel="Diğer firma işlemleri" onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); sheetRef.current?.present(); }} className="min-h-10 flex-row items-center gap-1.5 py-1.5"><Ionicons name="ellipsis-horizontal" size={16} color={colors.primary} /><Text className="font-inter-medium text-[13px] text-primary">Diğer</Text></Pressable>
              </View>
            </Card>
          </View>
        }
        sticky={
          <View style={{ width: '100%', maxWidth: 1080, alignSelf: 'center' }} className="pb-2 pt-1">
            <PinnedIdentity
              title={companyName}
              leading={data.logoUrl ? <CompanyLogo uri={data.logoUrl} size={32} /> : <Avatar name={data.legalTitle} size={32} square />}
              trailing={<Chip tone={customerStatusTone(status?.code)} label={status?.name ?? 'Durum yok'} shrink />}
            />
            <CompanyTabs
              value={tab}
              onChange={setTab}
              canReadService={serviceSummary.canRead}
              counts={{
                gecmis: timeline.length,
                kartlar: opportunitiesQuery.data?.total ?? 0,
                aktivite: activitiesQuery.data?.total ?? 0,
                teklifler: quoteTotal,
                gorevler: companyTasks.data?.meta.total ?? 0,
                servis: serviceSummary.summary?.total ?? 0,
                belgeler: documentTotal,
              }}
            />
          </View>
        }
        contentStyle={{ gap: 12, paddingHorizontal: SCREEN_PAD, paddingTop: 12, width: '100%', maxWidth: 1080, alignSelf: 'center' }}
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

            <View style={{ flexDirection: wideSummary ? 'row' : 'column', gap: 16, alignItems: 'stretch' }}>
              <Card style={{ flex: wideSummary ? 1 : undefined }} className="gap-3">
                <Eyebrow>Firma künyesi</Eyebrow>
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

              <Card style={{ flex: wideSummary ? 1 : undefined }} className="gap-2">
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
            </View>

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
                    title={companyAddressLabel(a) || ADDRESS_TYPE_LABELS[a.addressType] || 'Adres'}
                    lines={[ADDRESS_TYPE_LABELS[a.addressType] ?? a.addressType, companyAddressLinks(a) ? 'Haritada gör veya rota çiz' : null]}
                    onPress={companyAddressLinks(a) ? () => showCompanyAddressActions(a, data.shortName || data.legalTitle) : undefined}
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
              <View className="flex-row items-center justify-between px-1">
                <Eyebrow>İletişim Kişileri ({contactsQuery.data?.total ?? 0})</Eyebrow>
                {canCreateContact ? (
                  <Button
                    label="Yeni kontak"
                    variant="ghost"
                    trailingIcon="add"
                    onPress={() =>
                      router.push(
                        `/modal/contact?companyId=${encodeURIComponent(id)}&companyName=${encodeURIComponent(companyName)}` as Href,
                      )
                    }
                  />
                ) : null}
              </View>
              {!canReadContacts ? (<Text className="font-inter text-sm text-muted-foreground">Kontakları görüntüleme yetkiniz yok.</Text>) : contactsQuery.isPending ? (
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
                      onPress={() => router.push(`/modules/contacts/${contact.id}`)}
                    />
                  ))}
                  {(contactsQuery.data?.total ?? 0) > 5 ? (
                    <Text className="px-1 font-inter text-[12px] text-muted-foreground">+{(contactsQuery.data?.total ?? 0) - 5} daha</Text>
                  ) : null}
                  <Button label="Tüm kontakları görüntüle" variant="ghost" onPress={() => router.push({ pathname: '/modules/contacts', params: { companyId: id, companyName } } as never)} />
                </>
              )}
            </View>

            <View className="gap-1.5">
              <View className="px-1">
                <Eyebrow>Son Teklifler ({quoteTotal})</Eyebrow>
              </View>
              {!canReadQuotes ? (<Text className="font-inter text-sm text-muted-foreground">Teklifleri görüntüleme yetkiniz yok.</Text>) : quotesQuery.isPending ? (
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
                      onPress={() => router.push(`/modules/quotes/${quote.id}`)}
                    />
                  ))
              )}
            </View>

            <View className="gap-1.5">
              <View className="px-1">
                <Eyebrow>Satış Siparişleri ({salesOrders.data?.total ?? 0})</Eyebrow>
              </View>
              {!canReadSalesOrders ? (
                <Text className="font-inter text-sm text-muted-foreground">Siparişleri görüntüleme yetkiniz yok.</Text>
              ) : salesOrders.isPending ? (
                <Loading />
              ) : salesOrders.error ? (
                <ErrorState message={salesOrders.error.message} onRetry={() => void salesOrders.refetch()} />
              ) : (salesOrders.data?.items.length ?? 0) === 0 ? (
                <Card>
                  <Text className="text-center font-inter text-sm text-muted-foreground">Bu firmaya bağlı satış siparişi yok.</Text>
                </Card>
              ) : (
                (salesOrders.data?.items ?? []).slice(0, 8).map((order) => (
                  <ListRow
                    key={order.id}
                    title={order.orderNo ?? 'Sipariş'}
                    lines={[order.orderDate ? formatDate(order.orderDate) : null]}
                    icon="receipt-outline"
                    chip={order.status ? { label: order.status.name, tone: 'info' } : undefined}
                    trailing={formatAmount(order.grandTotal, order.currency?.code ?? 'TRY')}
                    onPress={() => router.push(`/modules/sales-orders/${order.id}` as Href)}
                  />
                ))
              )}
            </View>

            <View className="gap-1.5">
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: overviewOpen }}
                onPress={() => setOverviewOpen((v) => !v)}
                className="min-h-10 flex-row items-center justify-between px-1 py-1"
              >
                <Text className="font-inter-semibold text-[14px] text-foreground">Finansal özet</Text>
                <Text className="font-inter-medium text-[13px] text-primary">{overviewOpen ? 'Gizle' : 'Göster'}</Text>
              </Pressable>
              {overviewOpen ? (
                !canReadReceivables ? (<Text className="font-inter text-sm text-muted-foreground">Finansal özeti görüntüleme yetkiniz yok.</Text>) : financeSummary.isPending ? (
                  <Loading />
                ) : financeSummary.error ? (
                  <ErrorState message="Finansal özet yüklenemedi." onRetry={() => void financeSummary.refetch()} />
                ) : (
                  <StatGrid columns={2}>
                    <StatCard icon="trending-up-outline" tone="info" label="Toplam Ciro" value={formatCurrencyAmounts((financeSummary.data?.byCurrency ?? []).map(row => ({ currencyCode: row.currencyCode, amount: row.salesTotal })), formatAmount)} />
                    <StatCard icon="wallet-outline" tone="warning" label="Toplam Alacak" value={formatCurrencyAmounts((financeSummary.data?.byCurrency ?? []).map(row => ({ currencyCode: row.currencyCode, amount: row.borc })), formatAmount)} />
                    <StatCard icon="alert-circle-outline" tone="destructive" label="Vade Geçmiş Alacak" value={formatCurrencyAmounts((financeSummary.data?.aging.byCurrency ?? []).map(row => ({ currencyCode: row.currencyCode, amount: row.overdueTotal })), formatAmount)} />
                    <StatCard icon="document-text-outline" tone="stage" label="Açık Teklif Tutarı" value={!canReadQuotes ? 'Erişime kapalı' : completeQuotes.isPending ? 'Yükleniyor…' : completeQuotes.error ? 'Yüklenemedi' : formatCurrencyAmounts(openQuoteAmounts, formatAmount)} />
                  </StatGrid>
                )
              ) : null}
            </View>

            {completeQuotes.error ? <ErrorState message="Açık teklif tutarı yüklenemedi." onRetry={() => void completeQuotes.refetch()} /> : null}
            <View className="gap-1.5">
              <View className="flex-row items-center justify-between px-1">
                <Eyebrow>Makineler ({devicesQuery.data?.meta.total ?? 0})</Eyebrow>
                {canCreateDevice ? (
                  <Button
                    label="Makine ekle"
                    variant="ghost"
                    trailingIcon="add"
                    onPress={() =>
                      router.push(
                        `/modal/device-new?companyId=${encodeURIComponent(id)}&companyName=${encodeURIComponent(companyName)}` as Href,
                      )
                    }
                  />
                ) : null}
              </View>
              {/* web CustomerDetail "Makineler": Model / Seri No / Garanti Bitiş. */}
              {!canReadDevices ? (<Text className="font-inter text-sm text-muted-foreground">Makineleri görüntüleme yetkiniz yok.</Text>) : devicesQuery.isPending ? (
                <Loading />
              ) : devicesQuery.error ? (
                <ErrorState message={devicesQuery.error.message} onRetry={() => void devicesQuery.refetch()} />
              ) : ownedDevices.length === 0 ? (
                <Card>
                  <Text className="text-center font-inter text-sm text-muted-foreground">Kayıtlı makine yok.</Text>
                </Card>
              ) : (
                ownedDevices.map((device) => {
                  const now = Date.now();
                  const warranty = warrantyInfo(device.warrantyEndDate, now);
                  return (
                    <ListRow
                      key={device.id}
                      title={device.productModelName ?? device.model ?? 'Makine'}
                      lines={[
                        [device.serialNumber ? `S/N ${device.serialNumber}` : null, device.brandName].filter(Boolean).join(' · ') || null,
                        [
                          device.installationDate ? `Kurulum: ${formatDate(device.installationDate)}` : null,
                          device.warrantyEndDate ? `Garanti: ${formatDate(device.warrantyEndDate)}` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ') || null,
                      ]}
                      icon="hardware-chip-outline"
                      iconTone={machineStatusTone(device.warrantyEndDate, now, device.status)}
                      chip={{
                        label: machineStatusLabel(device.warrantyEndDate, now, device.status),
                        tone: machineStatusTone(device.warrantyEndDate, now, device.status),
                      }}
                      trailing={warrantyShortLabel(warranty)}
                      onPress={() => router.push(`/modules/customer-devices/${device.id}` as Href)}
                    />
                  );
                })
              )}
            </View>
          </>
        ) : null}

        {tab === 'gecmis' ? (
          <>
            <Eyebrow>Kayıt Geçmişi</Eyebrow>
            {(canReadActivities && activitiesQuery.isPending) || (canReadTasks && taskEvents.isPending) ? (
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
            {activitiesQuery.error || quotesQuery.error || opportunitiesQuery.error ? <ErrorState message="Geçmişin tamamı yüklenemedi." onRetry={() => { void activitiesQuery.refetch(); void quotesQuery.refetch(); void opportunitiesQuery.refetch(); }} /> : null}
            {activitiesQuery.hasNextPage || quotesQuery.hasNextPage || opportunitiesQuery.hasNextPage ? <Button label="Daha fazla geçmiş yükle" variant="ghost" loading={activitiesQuery.isFetchingNextPage || quotesQuery.isFetchingNextPage || opportunitiesQuery.isFetchingNextPage} onPress={() => { if (activitiesQuery.hasNextPage) void activitiesQuery.fetchNextPage(); if (quotesQuery.hasNextPage) void quotesQuery.fetchNextPage(); if (opportunitiesQuery.hasNextPage) void opportunitiesQuery.fetchNextPage(); }} /> : null}
          </>
        ) : null}

        {tab === 'kartlar' && !canReadOpportunities ? <EmptyState title="Bu kayıtları görüntüleme yetkiniz yok" /> : null}
        {tab === 'kartlar' && canReadOpportunities ? (
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

        {tab === 'aktivite' && !canReadActivities ? <EmptyState title="Bu kayıtları görüntüleme yetkiniz yok" /> : null}
        {tab === 'aktivite' && canReadActivities ? (
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
                  lines={[
                    [activity.type?.name, formatDateTime(activity.activityDate)].filter(Boolean).join(' · ') || null,
                    activity.result,
                  ]}
                  icon="pulse-outline"
                  iconTone={activity.origin === 'system' ? 'neutral' : 'info'}
                  chip={!activity.opportunityId ? { label: 'Fırsat Dışı', tone: 'warning' } : undefined}
                  onPress={() => router.push(`/modules/activities/${activity.id}` as Href)}
                />
              ))
            )}
            {activitiesQuery.error ? <ErrorState message={activitiesQuery.error.message} onRetry={() => void activitiesQuery.refetch()} /> : null}
            {activitiesQuery.hasNextPage ? <Button label="Daha fazla aktivite yükle" variant="ghost" loading={activitiesQuery.isFetchingNextPage} onPress={() => void activitiesQuery.fetchNextPage()} /> : null}
          </>
        ) : null}

        {tab === 'teklifler' && !canReadQuotes ? <EmptyState title="Bu kayıtları görüntüleme yetkiniz yok" /> : null}
        {tab === 'teklifler' && canReadQuotes ? (
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
                  onPress={() => router.push(`/modules/quotes/${quote.id}`)}
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
                <StatCard icon="trending-up-outline" tone="info" label="Toplam Ciro" value={formatCurrencyAmounts((financeSummary.data?.byCurrency ?? []).map(row => ({ currencyCode: row.currencyCode, amount: row.salesTotal })), formatAmount)} />
                <StatCard icon="wallet-outline" tone="warning" label="Toplam Alacak" value={formatCurrencyAmounts((financeSummary.data?.byCurrency ?? []).map(row => ({ currencyCode: row.currencyCode, amount: row.borc })), formatAmount)} />
                <StatCard icon="alert-circle-outline" tone="destructive" label="Vade Geçmiş Alacak" value={formatCurrencyAmounts((financeSummary.data?.aging.byCurrency ?? []).map(row => ({ currencyCode: row.currencyCode, amount: row.overdueTotal })), formatAmount)} />
                <StatCard icon="checkmark-done-outline" tone="success" label="Net Bakiye" value={formatCurrencyAmounts((financeSummary.data?.byCurrency ?? []).map(row => ({ currencyCode: row.currencyCode, amount: row.totalBalance })), formatAmount)} />
              </StatGrid>
            ) : null}

            <View className="gap-1.5">
              <View className="px-1">
                <Eyebrow>Açık Alacaklar</Eyebrow>
              </View>
              {!canReadReceivables ? (<Text className="font-inter text-sm text-muted-foreground">Bu kayıtları görüntüleme yetkiniz yok.</Text>) : receivablesQuery.isPending ? (
                <Loading />
              ) : receivablesQuery.error ? (
                <ErrorState message={receivablesQuery.error.message} onRetry={() => void receivablesQuery.refetch()} />
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
              {!canReadPayments ? (<Text className="font-inter text-sm text-muted-foreground">Bu kayıtları görüntüleme yetkiniz yok.</Text>) : paymentsQuery.isPending ? (
                <Loading />
              ) : paymentsQuery.error ? (
                <ErrorState message={paymentsQuery.error.message} onRetry={() => void paymentsQuery.refetch()} />
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
              {!canReadInvoices ? (<Text className="font-inter text-sm text-muted-foreground">Bu kayıtları görüntüleme yetkiniz yok.</Text>) : invoicesQuery.isPending ? (
                <Loading />
              ) : invoicesQuery.error ? (
                <ErrorState message={invoicesQuery.error.message} onRetry={() => void invoicesQuery.refetch()} />
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

        {tab === 'gorevler' && !canReadTasks ? <EmptyState title="Bu kayıtları görüntüleme yetkiniz yok" /> : null}
        {tab === 'gorevler' && canReadTasks ? (
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
                  onPress={() => router.push(`/modules/tasks/${task.id}`)}
                />
              ))}
            </View>
          )
        ) : null}

        {tab === 'servis' ? (
          service.list.isPending ? (
            <Loading />
          ) : service.list.error ? (
            <ErrorState message={service.list.error.message} onRetry={() => void service.list.refetch()} />
          ) : service.tickets.length === 0 ? (
            <EmptyState title="Servis kaydı yok" hint="Bu firmanın makinelerine açılmış servis kaydı bulunmuyor." icon="construct-outline" />
          ) : (
            <View className="gap-2">
              {service.tickets.map((ticket) => (
                <ServiceTicketRow key={ticket.id} ticket={ticket} note={ticket.salesOpportunity?.title ? `Satış: ${ticket.salesOpportunity.title}` : undefined} />
              ))}
              {service.list.hasNextPage ? (
                <Button label="Daha fazla yükle" variant="ghost" loading={service.list.isFetchingNextPage} onPress={() => void service.list.fetchNextPage()} />
              ) : null}
            </View>
          )
        ) : null}

        {tab === 'belgeler' && canUpdate ? (
          <View className="gap-2">
            <FilterChips
              options={UPLOAD_TYPES.map((entry) => ({ value: entry.folder, label: entry.label }))}
              value={uploadFolder}
              onChange={(next) => next && setUploadFolder(next)}
              allLabel=""
            />
            <Button
              label="Belge Yükle"
              variant="ghost"
              trailingIcon="cloud-upload-outline"
              loading={uploading}
              disabled={uploading}
              onPress={() => void handleUploadDocument()}
            />
          </View>
        ) : null}

        {tab === 'belgeler' && (companyFiles.data?.length ?? 0) > 0 ? (
          <View className="gap-2">
            <Eyebrow>Yüklenen dosyalar ({companyFiles.data!.length})</Eyebrow>
            {companyFiles.data!.map((row) => (
              <ListRow
                key={row.id}
                title={row.file.originalFilename}
                lines={[
                  row.documentType?.name ?? null,
                  [formatDateTime(row.createdAt), row.description].filter(Boolean).join(' · ') || null,
                ]}
                icon="document-attach-outline"
                onPress={() =>
                  void downloadAndShareFile(row.fileId).catch((err: unknown) =>
                    toast.error(err instanceof Error ? err.message : 'Belge indirilemedi')
                  )
                }
              />
            ))}
          </View>
        ) : null}

        {tab === 'belgeler' ? (
          documents.length === 0 ? (
            companyFiles.data?.length ? null : <EmptyState title="Belge bulunamadı" />
          ) : (
            <View className="gap-2">
              {documents.map((doc) => (
                <ListRow
                  key={`${doc.kind}-${doc.id}`}
                  title={doc.no}
                  lines={[doc.date ? formatDate(doc.date) : null]}
                  onPress={() => router.push(`/modules/documents/${doc.kind}/${doc.id}` as Href)}
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
      </CollapsingDetailScroll>

      <BottomSheetModal
        ref={sheetRef}
        enableDynamicSizing
        backgroundStyle={{ backgroundColor: colors.card }}
        handleIndicatorStyle={{ backgroundColor: colors.mutedForeground }}
        backdropComponent={SheetBackdrop}
      >
        <BottomSheetView className="gap-2 px-5 pb-10 pt-2">
          <Text className="mb-1 font-inter-semibold text-base text-foreground">Diğer İşlemler</Text>
          {[
            { key: 'call', label: 'Giden Arama Kaydet', onPress: openCall },
            { key: 'task', label: 'Görev Oluştur', onPress: openTask },
            { key: 'card', label: 'Yeni Satış Kartı', onPress: openNewCard },
            { key: 'quote', label: 'Yeni Teklif', onPress: openQuote },
            { key: 'ticket', label: 'Servis Talebi', onPress: openTicket },
            { key: 'receivable', label: 'Alacak Ekle', onPress: openReceivable },
            { key: 'payment', label: 'Tahsilat Kaydet', onPress: openPayment },
            {
              key: 'map',
              label: 'Adres ve Rota',
              onPress: hasMapAddress ? () => showCompanyAddressActions(address!, data.shortName || data.legalTitle) : undefined,
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
                            goBack();
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
