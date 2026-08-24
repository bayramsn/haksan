import { useRef, useState } from 'react';
import { Image, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { BottomSheetBackdrop, BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import * as Haptics from 'expo-haptics';
import * as Crypto from 'expo-crypto';
import { Ionicons } from '@expo/vector-icons';
import { useCompany, useUpdateCompanyStatus } from '@/src/api/companies.hooks';
import { apiBaseUrl } from '@/src/api/config';
import { useActivityList, useContactList, useLookup, useOpportunityList, useQuoteList } from '@/src/api/crm.hooks';
import { useCommercialDocuments } from '@/src/api/documents.hooks';
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
import { Button, Card, Chip, DetailHeader, EmptyState, ErrorState, Eyebrow, ListRow, Loading } from '@/src/ui';
import { InfoRows, StatCard, StatGrid, Tabs } from '@/src/ui/data';

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

type CompanyTab = 'genel' | 'aktivite' | 'teklifler' | 'cari' | 'belgeler';

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
      className="flex-1 items-center gap-1 rounded-control border border-border bg-card py-2.5 active:opacity-70"
      style={disabled ? { opacity: 0.4 } : undefined}
    >
      <Ionicons name={icon} size={18} color={disabled ? colors.mutedForeground : colors.primary} />
      <Text className={`font-inter-medium text-[11px] ${disabled ? 'text-muted-foreground' : 'text-foreground'}`} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/** logoUrl göreli path döner (`/companies/media/:fileId`); apiBaseUrl ile birleştirilir. */
function CompanyLogo({ uri }: { uri: string }) {
  const source = { uri: uri.startsWith('http') ? uri : `${apiBaseUrl()}${uri}` };
  return (
    <Image source={source} className="h-[52px] w-[52px] rounded-full bg-muted" resizeMode="cover" accessibilityIgnoresInvertColors />
  );
}

export default function CompanyDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const [tab, setTab] = useState<CompanyTab>('genel');
  const sheetRef = useRef<BottomSheetModal>(null);
  const canUpdate = useCan('companies.update');

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
  const documents = [...(proformas.data?.items ?? []), ...(contracts.data?.items ?? []), ...(invoices.data?.items ?? [])];
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

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <DetailHeader title="Firma Detayı" subtitle={data.externalCompanyNo ?? undefined} />

      <View className="gap-3 px-4 pt-4">
        <Card className="flex-row items-center gap-3">
          {data.logoUrl ? <CompanyLogo uri={data.logoUrl} /> : <Avatar name={data.legalTitle} size={52} />}
          <View className="flex-1 gap-1">
            <Text className="text-[18px] font-inter-semibold text-foreground" numberOfLines={2}>
              {data.legalTitle}
            </Text>
            <View className="flex-row flex-wrap gap-1.5">
              <Chip tone={customerStatusTone(status?.code)} label={status?.name ?? 'Durum yok'} />
              {relationType ? <Chip tone={RELATION_TONE[relationType.code] ?? 'neutral'} label={relationType.name} /> : null}
            </View>
          </View>
        </Card>
        {/* web CustomerDetail.tsx: Tür (companyType) + Tip (relationType) ayrı alanlar.
            "Satış Temsilcisi" sunucuda yok, bkz. rapor. */}
        <InfoRows
          items={[
            { label: 'Tür', value: data.companyType === 'company' ? 'Kurumsal Müşteri' : 'Bireysel Müşteri' },
            { label: 'Tip', value: relationType?.name },
            { label: 'Şehir', value: address?.province },
          ]}
        />

        <View className="flex-row gap-2">
          <QuickAction icon="call-outline" label="Ara" onPress={phone ? () => void Linking.openURL(`tel:${phone}`) : undefined} />
          <QuickAction icon="mail-outline" label="E-posta" onPress={email ? () => void Linking.openURL(`mailto:${email}`) : undefined} />
          <QuickAction icon="location-outline" label="Haritada Gör" onPress={mapsUrl ? () => void Linking.openURL(mapsUrl) : undefined} />
          <QuickAction
            icon="ellipsis-horizontal"
            label="Diğer"
            onPress={canUpdate || data.website ? () => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              sheetRef.current?.present();
            } : undefined}
          />
        </View>
      </View>

      <View className="pt-3">
        <Tabs
          tabs={[
            { value: 'genel', label: 'Genel' },
            { value: 'aktivite', label: 'Aktivite', badge: activitiesQuery.data?.total ?? 0 },
            { value: 'teklifler', label: 'Teklifler', badge: quoteTotal },
            { value: 'cari', label: 'Cari' },
            { value: 'belgeler', label: 'Belgeler', badge: documentTotal },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>

      <ScrollView className="flex-1" contentContainerClassName="gap-4 px-4 pb-10 pt-4">
        {tab === 'genel' ? (
          <>
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
                ]}
              />
            </Card>

            {data.notes ? (
              <Card className="gap-1.5">
                <Eyebrow>Not</Eyebrow>
                <Text className="font-inter text-sm text-foreground">{data.notes}</Text>
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
                {opportunitiesQuery.data.items.slice(0, 5).map((opp) => {
                  const stage = QUALIFICATION_STAGES.includes(opp.qualificationStage as QualificationStage)
                    ? (opp.qualificationStage as QualificationStage)
                    : 'lead';
                  return (
                    <ListRow
                      key={opp.id}
                      title={opp.title}
                      lines={[opp.requestedMachine]}
                      icon="briefcase-outline"
                      chip={{ label: qualificationStageLabels[stage], tone: 'info' }}
                      onPress={() => router.push(`/(tabs)/modules/opportunities/${opp.id}`)}
                    />
                  );
                })}
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

        {tab === 'aktivite' ? (
          activitiesQuery.isPending ? (
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
              />
            ))
          )
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

        {tab === 'belgeler' ? (
          documents.length === 0 ? (
            <EmptyState title="Belge bulunamadı" />
          ) : (
            <View className="gap-2">
              {documents.map((doc) => (
                <ListRow
                  key={doc.id}
                  title={doc.no}
                  lines={[doc.date ? formatDate(doc.date) : null]}
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
        </BottomSheetView>
      </BottomSheetModal>
    </SafeAreaView>
  );
}
