import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import type { FileLinkRow } from '@/src/api/commercial-docs.api';
import { useDeleteFile, useFileLinks } from '@/src/api/commercial-docs.hooks';
import { useCommercialDocuments, type DocumentRow } from '@/src/api/documents.hooks';
import { exportService } from '@/src/api/exports';
import { useQuoteStatusCounts } from '@/src/api/quotes.hooks';
import { useCan } from '@/src/auth/AuthProvider';
import { formatAmount, formatDate } from '@/src/lib/format';
import { useDebouncedValue } from '@/src/lib/useDebouncedValue';
import { downloadAndShareFile } from '@/src/native/files';
import { useTheme, type Tone } from '@/src/theme/theme';
import { Button, Card, EmptyState, ErrorState, Eyebrow, Fab, ListRow, ListSkeleton, Loading, SCREEN_PAD, ScreenHeader, SearchBar } from '@/src/ui';
import { StatCard, StatGrid } from '@/src/ui/data';
import { SyncStatus } from '@/src/ui/SyncStatus';
import { toast } from '@/src/ui/toast';
import {
  canCompleteLink,
  DOC_FOLDERS,
  documentCenterStats,
  filterLinksForFolder,
  folderCounts,
  folderForDocumentType,
  folderLabel,
  paymentIdFromDescription,
  recordFolderLabel,
  recordRelationLabel,
  type DocFolder,
  type RecordFolder,
} from './document-logic';
import { FileLinkCard } from './rows';

type CenterItem =
  | { type: 'record'; key: string; kind: RecordFolder; row: DocumentRow; date: string }
  | { type: 'link'; key: string; link: FileLinkRow; date: string };

const RECORD_META: Record<RecordFolder, { icon: keyof typeof Ionicons.glyphMap; tone: Tone }> = {
  proforma: { icon: 'document-text-outline', tone: 'info' },
  contract: { icon: 'reader-outline', tone: 'stage' },
  invoice: { icon: 'receipt-outline', tone: 'success' },
};

const HERO: Record<'all' | 'proforma' | 'contract', { title: string; subtitle: string }> = {
  all: {
    title: 'Ticari belge merkezi',
    subtitle: 'Belge kaydı mobilde oluşur; PDF yüklendikten sonra buradan açılır ve paylaşılır.',
  },
  proforma: {
    title: 'Proforma kontrol merkezi',
    subtitle: 'Proforma kayıtları; yüklenen PDF dosyası detaydan açılır ve paylaşılır.',
  },
  contract: {
    title: 'Sözleşme kontrol merkezi',
    subtitle: 'Sözleşme kayıtları; imzalı PDF yüklendikten sonra detaydan açılır.',
  },
};

function isFolder(value: unknown): value is DocFolder {
  return typeof value === 'string' && DOC_FOLDERS.some((entry) => entry.value === value);
}

function matches(needle: string, values: (string | null | undefined)[]) {
  if (!needle) return true;
  return values.some((value) => (value ?? '').toLocaleLowerCase('tr-TR').includes(needle));
}

/**
 * Ticari Belge Merkezi (web DocumentsPage). `fixedFolder` verilirse ekran
 * tek klasöre kilitlenir (Proformalar / Sözleşmeler katalog girişleri).
 */
export function DocumentCenter({ fixedFolder }: { fixedFolder?: 'proforma' | 'contract' }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ folder?: string }>();
  const [folder, setFolder] = useState<DocFolder>(fixedFolder ?? (isFolder(params.folder) ? params.folder : 'all'));
  const [search, setSearch] = useState('');
  const [exporting, setExporting] = useState(false);
  const serverSearch = useDebouncedValue(search.trim());
  const needle = serverSearch.toLocaleLowerCase('tr-TR');

  const canProforma = useCan('proformas.read');
  const canContract = useCan('contracts.read');
  const canInvoice = useCan('commercial_invoices.read');
  const canFiles = useCan('files.read');
  const canUpload = useCan('files.create');
  const canDeleteFile = useCan('files.delete');
  const canCreateProforma = useCan('proformas.create');
  const canCreateContract = useCan('contracts.create');
  const canCreateInvoice = useCan('commercial_invoices.create');

  const scope = useMemo(() => ({ search: serverSearch || undefined }), [serverSearch]);
  const wants = (kind: RecordFolder) => folder === 'all' || folder === kind;
  const proformas = useCommercialDocuments('proforma', scope, canProforma && (wants('proforma') || !fixedFolder));
  const contracts = useCommercialDocuments('contract', scope, canContract && (wants('contract') || !fixedFolder));
  const invoices = useCommercialDocuments('invoice', scope, canInvoice && !fixedFolder);
  const links = useFileLinks(canFiles);
  const quoteCounts = useQuoteStatusCounts();
  const deleteFile = useDeleteFile();

  const recordLists: Record<RecordFolder, typeof proformas> = { proforma: proformas, contract: contracts, invoice: invoices };
  const recordFileIds = useMemo(() => {
    const ids = new Set<string>();
    for (const list of [proformas, contracts, invoices]) for (const row of list.data?.items ?? []) if (row.fileId) ids.add(row.fileId);
    return ids;
  }, [contracts.data, invoices.data, proformas.data]);

  const allLinks = links.data?.items ?? [];
  const searchedLinks = useMemo(
    () =>
      allLinks.filter((link) =>
        matches(needle, [link.file.originalFilename, link.description, link.documentType?.name, link.file.uploaderName, folderLabel(folderForDocumentType(link.documentType?.code))])
      ),
    [allLinks, needle]
  );

  const counts = folderCounts(
    searchedLinks,
    { proforma: proformas.data?.total ?? 0, contract: contracts.data?.total ?? 0, invoice: invoices.data?.total ?? 0 },
    recordFileIds
  );

  const items = useMemo<CenterItem[]>(() => {
    const out: CenterItem[] = [];
    const sources: [RecordFolder, DocumentRow[] | undefined][] = [
      ['proforma', proformas.data?.items],
      ['contract', contracts.data?.items],
      ['invoice', invoices.data?.items],
    ];
    for (const [kind, rows] of sources) {
      if (folder !== 'all' && folder !== kind) continue;
      for (const row of rows ?? []) {
        out.push({ type: 'record', key: `${kind}-${row.id}`, kind, row, date: row.date ?? row.createdAt ?? '' });
      }
    }
    for (const link of filterLinksForFolder(searchedLinks, folder, recordFileIds)) {
      out.push({ type: 'link', key: `link-${link.id}`, link, date: link.createdAt });
    }
    return out.sort((a, b) => b.date.localeCompare(a.date));
  }, [folder, proformas.data, contracts.data, invoices.data, searchedLinks, recordFileIds]);

  const statsRecords = items.flatMap((item) => (item.type === 'record' ? [item.row] : []));
  const statsLinks = items.flatMap((item) => (item.type === 'link' ? [item.link] : []));
  const stats = documentCenterStats(statsRecords, statsLinks);

  const activeLists = (['proforma', 'contract', 'invoice'] as const).filter((kind) => wants(kind)).map((kind) => recordLists[kind]);
  const pending = activeLists.some((list) => list.isPending && list.fetchStatus !== 'idle') || (canFiles && links.isPending);
  const error = activeLists.find((list) => list.error)?.error ?? links.error;
  const fetchingMore = activeLists.some((list) => list.isFetchingNextPage) || links.isFetchingNextPage;
  const hero = HERO[fixedFolder ?? 'all'];

  async function exportExcel() {
    setExporting(true);
    try {
      await exportService.documents();
    } catch (exportError) {
      toast.error(exportError instanceof Error ? exportError.message : 'Dışa aktarma başarısız.');
    } finally {
      setExporting(false);
    }
  }

  async function openFile(fileId: string) {
    try {
      await downloadAndShareFile(fileId);
    } catch (openError) {
      toast.error(openError instanceof Error ? openError.message : 'Dosya açılamadı.');
    }
  }

  function confirmDeleteLink(link: FileLinkRow) {
    const label = folderLabel(folderForDocumentType(link.documentType?.code));
    Alert.alert(`${label} silinsin mi?`, `${link.file.originalFilename} kalıcı olarak kaldırılır.`, [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: () =>
          deleteFile.mutate(link.fileId, {
            onSuccess: () => toast.success(`${label} silindi`),
            onError: (deleteError) => toast.error(`${label} silinemedi: ${deleteError.message}`),
          }),
      },
    ]);
  }

  function linkActions(link: FileLinkRow) {
    const linkFolder = folderForDocumentType(link.documentType?.code);
    const paymentId = paymentIdFromDescription(link.description);
    const actions: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; destructive?: boolean }[] = [];
    if (paymentId) {
      actions.push({ icon: 'cash-outline', label: 'Kasa kaydını aç', onPress: () => router.push(`/(tabs)/modules/payments/${paymentId}`) });
    } else if (link.entityType === 'service_ticket') {
      actions.push({ icon: 'construct-outline', label: 'Servis talebini aç', onPress: () => router.push(`/(tabs)/modules/service-tickets/${link.entityId}`) });
    } else if (linkFolder === 'accounting_invoice') {
      actions.push({ icon: 'receipt-outline', label: 'Muhasebe kaydını aç', onPress: () => router.push('/(tabs)/modules/invoices') });
    } else if (link.entityType === 'opportunity') {
      actions.push({ icon: 'briefcase-outline', label: 'Fırsatı aç', onPress: () => router.push(`/(tabs)/modules/opportunities/${link.entityId}`) });
    } else if (link.entityType === 'quote') {
      actions.push({ icon: 'document-text-outline', label: 'Teklifi aç', onPress: () => router.push(`/(tabs)/modules/quotes/${link.entityId}`) });
    } else if (link.entityType === 'company') {
      actions.push({ icon: 'business-outline', label: 'Firmayı aç', onPress: () => router.push(`/(tabs)/modules/companies/${link.entityId}`) });
    }
    if (canCompleteLink(linkFolder, link.entityType) && !paymentId) {
      actions.push({
        icon: 'link-outline',
        label: 'Bağlantıyı tamamla',
        onPress: () =>
          router.push({
            pathname: '/modal/quote-document-link',
            params: {
              fileId: link.fileId,
              folder: linkFolder,
              name: link.file.originalFilename,
              ...(link.entityType === 'company' ? { companyId: link.entityId } : {}),
            },
          }),
      });
    }
    if (canDeleteFile) actions.push({ icon: 'trash-outline', label: 'Sil', destructive: true, onPress: () => confirmDeleteLink(link) });
    return actions;
  }

  function renderRecord(kind: RecordFolder, row: DocumentRow) {
    const meta = RECORD_META[kind];
    const relation = recordRelationLabel({ quoteId: row.quoteId, companyId: row.companyId, standalone: row.standalone, kind });
    return (
      <ListRow
        title={row.no}
        icon={meta.icon}
        iconTone={row.finalized ? 'success' : meta.tone}
        lines={[
          row.companyName ?? 'Firma bilgisi yok',
          [relation, row.quoteNo].filter(Boolean).join(' · '),
          [
            row.date ? formatDate(row.date) : null,
            row.statusName ?? (row.finalized ? 'Kesinleşti' : 'Taslak'),
            row.fileId ? 'CRM PDF hazır' : 'CRM PDF yok',
          ]
            .filter(Boolean)
            .join(' · '),
        ]}
        chips={[
          { label: recordFolderLabel(kind), tone: meta.tone },
          ...(row.fileId ? [{ label: 'CRM PDF', tone: 'info' as const }] : []),
        ]}
        trailing={row.grandTotal ? formatAmount(row.grandTotal, row.currencyCode ?? 'USD') : undefined}
        trailingTone="neutral"
        onPress={() => router.push(`/(tabs)/modules/documents/${kind}/${row.id}`)}
      />
    );
  }

  const createActions: { label: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void }[] = [];
  if ((folder === 'proforma' || (folder === 'all' && !fixedFolder)) && canCreateProforma) {
    createActions.push({ label: "CRM'de Hızlı Proforma", icon: 'flash-outline', onPress: () => router.push('/modal/proforma-quick') });
    if (folder === 'proforma')
      createActions.push({ label: "CRM'de Tekliften Proforma", icon: 'document-text-outline', onPress: () => router.push('/modal/proforma-form') });
  }
  if ((folder === 'contract' || (folder === 'all' && !fixedFolder)) && canCreateContract) {
    createActions.push({ label: "CRM'de Hızlı Sözleşme", icon: 'flash-outline', onPress: () => router.push('/modal/contract-quick') });
    if (folder === 'contract')
      createActions.push({ label: "CRM'de Tekliften Sözleşme", icon: 'reader-outline', onPress: () => router.push('/modal/contract-form') });
  }
  if (folder === 'invoice' && canCreateInvoice) {
    createActions.push({ label: "CRM'de Ticari Fatura", icon: 'receipt-outline', onPress: () => router.push('/modal/commercial-invoice-form') });
  }

  const routeSteps: { label: string; count: number; folder?: RecordFolder }[] = [
    { label: 'Teklif', count: quoteCounts.total },
    { label: 'Proforma', count: proformas.data?.total ?? 0, folder: 'proforma' },
    { label: 'Sözleşme', count: contracts.data?.total ?? 0, folder: 'contract' },
    { label: 'Ticari fatura', count: invoices.data?.total ?? 0, folder: 'invoice' },
  ];

  const header = (
    <View className="gap-3 pb-3 pt-2">
      <StatGrid>
        {[
          <StatCard key="total" icon="documents-outline" tone="info" label={fixedFolder ? folderLabel(fixedFolder) : 'Toplam'} value={String(stats.total)} />,
          <StatCard key="linked" icon="link-outline" tone="success" label="Kaynağa Bağlı" value={String(stats.linked)} />,
          <StatCard key="quote" icon="checkmark-done-outline" tone="info" label="Teklife Bağlı" value={String(stats.quoteLinked)} />,
          <StatCard
            key="review"
            icon={stats.review ? 'unlink-outline' : 'layers-outline'}
            tone={stats.review ? 'warning' : 'success'}
            label="Bağlantı İncele"
            value={String(stats.review)}
          />,
        ]}
      </StatGrid>

      {!fixedFolder ? (
        <Card className="gap-3">
          <View className="gap-1">
            <Eyebrow>Ticari belge rotası</Eyebrow>
            <Text className="font-inter text-xs text-muted-foreground">Aynı fırsata bağlı çıktılar soldan sağa ilerler; adıma dokunarak klasörü açın.</Text>
          </View>
          <View className="flex-row items-stretch gap-1.5">
            {routeSteps.map((step, index) => (
              <View key={step.label} className="flex-1 flex-row items-center gap-1">
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${step.label}: ${step.count}`}
                  onPress={() => (step.folder ? setFolder(step.folder) : router.push('/(tabs)/modules/quotes'))}
                  className={`min-h-[56px] flex-1 items-center justify-center rounded-control border px-1 ${
                    step.folder && folder === step.folder ? 'border-primary bg-secondary' : 'border-border bg-muted'
                  }`}
                >
                  <Text className="font-display text-lg text-foreground">{step.count}</Text>
                  <Text className="font-inter text-[11px] text-muted-foreground" numberOfLines={1}>
                    {step.label}
                  </Text>
                </Pressable>
                {index < routeSteps.length - 1 ? <Ionicons name="chevron-forward" size={12} color={colors.mutedForeground} /> : null}
              </View>
            ))}
          </View>
        </Card>
      ) : null}

      {createActions.length ? (
        <View className="flex-row flex-wrap gap-2">
          {createActions.map((action) => (
            <View key={action.label} className="min-w-[46%] flex-1">
              <Button label={action.label} variant="ghost" trailingIcon={action.icon} onPress={action.onPress} />
            </View>
          ))}
        </View>
      ) : null}

      <View className="gap-2" style={{ marginHorizontal: -SCREEN_PAD }}>
        <SearchBar value={search} onChange={setSearch} placeholder="Belge no, firma, dosya veya yükleyen" />
        {!fixedFolder ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flexGrow: 0 }}
            contentContainerStyle={{ paddingHorizontal: SCREEN_PAD, gap: 8 }}
            keyboardShouldPersistTaps="handled"
          >
            {DOC_FOLDERS.map((entry) => {
              const active = entry.value === folder;
              return (
                <Pressable
                  key={entry.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`${entry.label} klasörü, ${counts[entry.value]} belge`}
                  onPress={() => setFolder(entry.value)}
                  className={`h-11 flex-row items-center gap-1.5 rounded-full border px-4 ${active ? 'border-primary bg-primary' : 'border-border bg-card'}`}
                >
                  <Text className={`font-inter-medium text-sm ${active ? 'text-primary-foreground' : 'text-foreground'}`}>{entry.label}</Text>
                  <Text className={`font-inter text-[11px] ${active ? 'text-primary-foreground' : 'text-muted-foreground'}`}>{counts[entry.value]}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}
      </View>

      {folder === 'installation_form' || folder === 'delivery_form' ? (
        <Card className="gap-2">
          <Text className="font-inter text-xs text-muted-foreground">
            {folder === 'installation_form'
              ? 'Canlı kurulum formları kurulum kayıtlarından doldurulur; yüklenmiş formlar aşağıda listelenir.'
              : 'Canlı teslim formları sevkiyat ve servis kayıtlarından doldurulur; yüklenmiş formlar aşağıda listelenir.'}
          </Text>
          <Button
            label={folder === 'installation_form' ? 'Kurulumlara Git' : 'Servis Taleplerine Git'}
            variant="ghost"
            trailingIcon="arrow-forward"
            onPress={() => router.push(folder === 'installation_form' ? '/(tabs)/modules/installations' : '/(tabs)/modules/service-tickets')}
          />
        </Card>
      ) : null}
      {folder === 'accounting_invoice' ? (
        <Button label="Muhasebe faturalarına git" variant="ghost" trailingIcon="arrow-forward" onPress={() => router.push('/(tabs)/modules/invoices')} />
      ) : null}
      {error ? (
        <ErrorState
          message={error.message}
          onRetry={() => {
            for (const list of activeLists) void list.refetch();
            void links.refetch();
          }}
        />
      ) : null}
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <SyncStatus />
      <ScreenHeader
        title={fixedFolder === 'proforma' ? 'Proformalar' : fixedFolder === 'contract' ? 'Sözleşmeler' : 'Ticari Belgeler'}
        subtitle={hero.subtitle}
        actions={[
          {
            icon: exporting ? 'hourglass-outline' : 'download-outline',
            label: 'Excel olarak dışa aktar',
            onPress: () => {
              if (!exporting) void exportExcel();
            },
          },
        ]}
      />
      <FlashList
        maintainVisibleContentPosition={{ disabled: true }}
        style={{ flex: 1 }}
        data={error ? [] : items}
        keyExtractor={(item) => item.key}
        getItemType={(item) => item.type}
        contentContainerStyle={{ paddingHorizontal: SCREEN_PAD, paddingBottom: 96 }}
        renderItem={({ item }) =>
          item.type === 'record' ? (
            renderRecord(item.kind, item.row)
          ) : (
            <FileLinkCard link={item.link} onOpen={() => void openFile(item.link.fileId)} actions={linkActions(item.link)} />
          )
        }
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          for (const list of activeLists) if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
          if (links.hasNextPage && !links.isFetchingNextPage) void links.fetchNextPage();
        }}
        refreshing={false}
        onRefresh={() => {
          void qc.invalidateQueries({ queryKey: ['commercial-docs'] });
          void qc.invalidateQueries({ queryKey: ['files', 'links'] });
          void qc.invalidateQueries({ queryKey: ['quotes'] });
        }}
        ListHeaderComponent={header}
        ListEmptyComponent={
          error ? null : pending ? (
            <View style={{ marginHorizontal: -SCREEN_PAD }}>
              <ListSkeleton />
            </View>
          ) : (
            <EmptyState
              title={folder === 'all' ? 'Belge bulunamadı' : `${folderLabel(folder)} bulunamadı`}
              hint={search ? 'Arama sonuç döndürmedi.' : 'Henüz bu klasörde kayıt yok.'}
              icon="folder-open-outline"
              actionLabel={search ? 'Aramayı Temizle' : undefined}
              onAction={search ? () => setSearch('') : undefined}
            />
          )
        }
        ListFooterComponent={fetchingMore ? <Loading /> : null}
      />
      {canUpload ? (
        <Fab
          icon="cloud-upload-outline"
          label="Kaynağa bağlı dosya yükle"
          onPress={() =>
            router.push({ pathname: '/modal/quote-document-upload', params: folder === 'all' ? {} : { type: folder } })
          }
        />
      ) : null}
    </SafeAreaView>
  );
}
