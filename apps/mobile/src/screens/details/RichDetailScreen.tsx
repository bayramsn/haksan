import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View, Linking } from 'react-native';
import { router } from 'expo-router';
import { financeService, quoteService, serviceService } from '@/src/api/services';
import { fieldText } from '@/src/modules/registry';
import { ActionRow, DetailHero, DetailTabs, InfoCard, LoadingCenter } from '@/src/ui/DetailLayout';
import { SectionTitle } from '@/src/ui/SectionTitle';
import { PdfPreview } from '@/src/ui/PdfPreview';
import { Screen } from '@/src/ui/Screen';
import { colors, fonts, spacing, typography } from '@/src/theme/tokens';
import { useDetailRecord } from './useDetailRecord';

type TabKey = 'genel' | 'kalemler' | 'finans' | 'pdf' | 'lojistik' | 'bakim';

type Props = { navKey: string; id: string };

function money(v: unknown, cur?: unknown) {
  if (v == null || v === '') return '—';
  const c = cur ? ` ${String(cur)}` : '';
  return `${Number(v).toLocaleString('tr-TR')}${c}`;
}

function linesFrom(data: Record<string, unknown>, key: string) {
  const raw = data[key];
  if (!Array.isArray(raw)) return [];
  return raw as Record<string, unknown>[];
}

export function RichDetailScreen({ navKey, id }: Props) {
  const { data, loading, error, config } = useDetailRecord(navKey, id);
  const [tab, setTab] = useState<TabKey>('genel');
  const [statement, setStatement] = useState<Record<string, unknown>[] | null>(null);
  const [statementLoading, setStatementLoading] = useState(false);

  const loadStatement = async () => {
    const companyId = String(data?.companyId ?? id);
    if (!companyId) return;
    setStatementLoading(true);
    try {
      const rows = await financeService.companyStatement(companyId);
      setStatement(rows as Record<string, unknown>[]);
    } finally {
      setStatementLoading(false);
    }
  };

  useEffect(() => {
    if (tab === 'finans' && navKey === 'customers' && !statement && !statementLoading) {
      void loadStatement();
    }
  }, [tab, navKey, statement, statementLoading, data, id]);

  if (loading) return <LoadingCenter />;
  if (error || !data) return <Text style={styles.err}>{error ?? 'Kayıt yok'}</Text>;

  const title = fieldText(data, config?.titleField) || id;
  const subtitle = fieldText(data, config?.subtitleField);
  const badge = fieldText(data, config?.badgeField) || subtitle;

  const tabs: { key: TabKey; label: string }[] = [{ key: 'genel', label: 'Genel' }];
  if (['offers', 'purchase-orders', 'accounting-invoices', 'proformas', 'contracts'].includes(navKey))
    tabs.push({ key: 'kalemler', label: 'Kalemler' });
  if (navKey === 'customers') tabs.push({ key: 'finans', label: 'Cari Ekstre' });
  if (navKey === 'offers' || navKey === 'accounting-invoices') tabs.push({ key: 'pdf', label: 'PDF' });
  if (navKey === 'shipments' || navKey === 'deliveries') tabs.push({ key: 'lojistik', label: 'Lojistik' });
  if (navKey === 'machines') tabs.push({ key: 'bakim', label: 'Bakım' });

  const actions = buildActions(navKey, id, data, setTab);

  return (
    <Screen padded={false} edges={['left', 'right', 'bottom']}>
      <DetailHero title={title} subtitle={subtitle} badge={badge || undefined} />
      <DetailTabs tabs={tabs} value={tab} onChange={setTab} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {tab === 'genel' ? <GeneralTab navKey={navKey} data={data} /> : null}
        {tab === 'kalemler' ? <LinesTab data={data} /> : null}
        {tab === 'finans' ? (
          <StatementTab statement={statement} loading={statementLoading} onReload={() => void loadStatement()} />
        ) : null}
        {tab === 'pdf' ? <PdfTab navKey={navKey} id={id} data={data} /> : null}
        {tab === 'lojistik' ? <LogisticsTab data={data} navKey={navKey} /> : null}
        {tab === 'bakim' ? <MaintenanceTab data={data} id={id} /> : null}
        {actions.length ? <ActionRow actions={actions} /> : null}
      </ScrollView>
    </Screen>
  );
}

function GeneralTab({ navKey, data }: { navKey: string; data: Record<string, unknown> }) {
  const fields = fieldsFor(navKey, data);
  return (
    <View>
      {fields.map((f) => (
        <InfoCard key={f.label} label={f.label} value={f.value} />
      ))}
    </View>
  );
}

function fieldsFor(navKey: string, data: Record<string, unknown>) {
  const pick = (...keys: string[]) =>
    keys.map((k) => ({ label: labelFor(k), value: formatVal(data, k) })).filter((x) => x.value !== '—');

  switch (navKey) {
    case 'customers':
      return pick('legalTitle', 'shortName', 'taxNumber', 'taxOffice', 'sector', 'website', 'notes');
    case 'contacts':
      return pick('fullName', 'email', 'phone', 'mobile', 'title', 'department');
    case 'sales-cases':
      return pick('title', 'stageCode', 'estimatedValue', 'currencyCode', 'probability', 'expectedCloseDate', 'description');
    case 'offers':
      return pick('documentNo', 'statusCode', 'totalAmount', 'currencyCode', 'validUntil', 'notes');
    case 'service-requests':
    case 'service-kanban':
      return pick('ticketNo', 'statusCode', 'priority', 'reportedAt', 'description', 'resolutionNotes');
    case 'shipments':
      return pick('documentNo', 'statusCode', 'carrierName', 'trackingNo', 'shippedAt', 'notes');
    case 'deliveries':
      return pick('deliveryNo', 'status', 'deliveredAt', 'recipientName', 'notes');
    case 'purchase-orders':
      return pick('documentNo', 'statusCode', 'supplierName', 'totalAmount', 'currencyCode', 'expectedDate');
    case 'accounting-invoices':
      return pick('invoiceNo', 'status', 'totalAmount', 'currencyCode', 'invoiceDate', 'dueDate');
    case 'machines':
      return pick('serialNumber', 'modelName', 'modelCode', 'installationDate', 'warrantyEndDate', 'notes');
    case 'stock':
      return pick('serialNumber', 'statusCode', 'warehouseName', 'productName', 'notes');
    case 'products':
      return pick('fullName', 'modelCode', 'brandName', 'category', 'listPrice');
    case 'installations':
      return pick('installationNo', 'statusCode', 'installationDate', 'technicianName', 'notes');
    case 'proformas':
    case 'contracts':
    case 'documents':
      return pick('documentNo', 'statusCode', 'totalAmount', 'currencyCode', 'validUntil', 'notes');
    case 'payments':
      return pick('description', 'amount', 'currencyCode', 'status', 'paymentDate', 'paymentMethod', 'invoiceNo');
    default:
      return Object.keys(data)
        .slice(0, 14)
        .filter((k) => !k.endsWith('Id') && typeof data[k] !== 'object')
        .map((k) => ({ label: labelFor(k), value: formatVal(data, k) }));
  }
}

function LinesTab({ data }: { data: Record<string, unknown> }) {
  const items = linesFrom(data, 'items').length ? linesFrom(data, 'items') : linesFrom(data, 'lines');
  if (!items.length) return <Text style={styles.muted}>Kalem bulunamadı</Text>;
  return (
    <View>
      {items.map((row, i) => (
        <InfoCard
          key={i}
          label={String(row.description ?? row.productName ?? row.name ?? `Kalem ${i + 1}`)}
          value={`${row.quantity ?? 1} × ${money(row.unitPrice ?? row.price, row.currencyCode ?? data.currencyCode)}`}
        />
      ))}
    </View>
  );
}

function StatementTab({
  statement,
  loading,
  onReload,
}: {
  statement: Record<string, unknown>[] | null;
  loading: boolean;
  onReload: () => void;
}) {
  if (loading) return <Text style={styles.muted}>Ekstre yükleniyor…</Text>;
  if (!statement?.length) {
    return (
      <View>
        <Text style={styles.muted}>Cari hareket bulunamadı</Text>
        <ActionRow actions={[{ label: 'Yenile', onPress: onReload, variant: 'secondary' }]} />
      </View>
    );
  }
  return (
    <View>
      {statement.map((row, i) => (
        <InfoCard
          key={i}
          label={String(row.date ?? row.transactionDate ?? row.createdAt ?? '—')}
          value={`${row.description ?? row.type ?? ''} · ${money(row.amount ?? row.debit ?? row.credit, row.currencyCode)}`}
        />
      ))}
    </View>
  );
}

function PdfTab({ navKey, id, data }: { navKey: string; id: string; data: Record<string, unknown> }) {
  if (navKey === 'offers') return <PdfPreview path={`/quotes/${id}/generate-pdf`} />;
  if (navKey === 'accounting-invoices') {
    const fileId = data.pdfFileId ?? data.documentFileId ?? data.fileId;
    if (fileId) return <PdfPreview path={`/files/${String(fileId)}/content`} method="GET" />;
    return (
      <View>
        <Text style={styles.muted}>Ekli PDF yok — özet gösteriliyor</Text>
        <InfoCard label="Fatura No" value={String(data.invoiceNo ?? '—')} />
        <InfoCard label="Tutar" value={money(data.totalAmount, data.currencyCode)} />
        <InfoCard label="Tarih" value={String(data.invoiceDate ?? '—')} />
        <InfoCard label="Vade" value={String(data.dueDate ?? '—')} />
      </View>
    );
  }
  return <Text style={styles.muted}>PDF önizleme bu kayıt için tanımlı değil</Text>;
}

function LogisticsTab({ data, navKey }: { data: Record<string, unknown>; navKey: string }) {
  const status = String(data.statusCode ?? data.status ?? '').toLowerCase();
  const items = linesFrom(data, 'items').length ? linesFrom(data, 'items') : linesFrom(data, 'lines');
  const steps =
    navKey === 'deliveries'
      ? [
          { label: 'Bekliyor', done: true },
          { label: 'Yolda', done: status.includes('transit') || status === 'completed' },
          { label: 'Teslim edildi', done: status === 'completed' },
        ]
      : [
          { label: 'Hazırlanıyor', done: true },
          { label: 'Yola çıktı', done: ['in_transit', 'shipped', 'delivered'].some((s) => status.includes(s)) },
          { label: 'Teslim', done: status.includes('delivered') || status === 'completed' },
        ];

  return (
    <View>
      <SectionTitle title="Durum akışı" />
      {steps.map((step) => (
        <View key={step.label} style={styles.timelineRow}>
          <View style={[styles.timelineDot, step.done && styles.timelineDotDone]} />
          <Text style={[styles.timelineText, step.done && styles.timelineTextDone]}>{step.label}</Text>
        </View>
      ))}
      <InfoCard label="Durum" value={String(data.statusCode ?? data.status ?? '—')} />
      <InfoCard label="Taşıyıcı / Alıcı" value={String(data.carrierName ?? data.recipientName ?? '—')} />
      <InfoCard label="Takip No" value={String(data.trackingNo ?? data.deliveryNo ?? '—')} />
      <InfoCard label="Tarih" value={String(data.shippedAt ?? data.deliveredAt ?? data.createdAt ?? '—')} />
      {navKey === 'deliveries' ? (
        <InfoCard label="Adres" value={String(data.deliveryAddress ?? data.address ?? '—')} />
      ) : null}
      {items.length > 0 ? (
        <>
          <SectionTitle title="Kalemler" />
          {items.map((row, i) => (
            <InfoCard
              key={i}
              label={String(row.description ?? row.productName ?? `Kalem ${i + 1}`)}
              value={`${row.quantity ?? 1} adet`}
            />
          ))}
        </>
      ) : null}
    </View>
  );
}

function MaintenanceTab({ data, id }: { data: Record<string, unknown>; id: string }) {
  return (
    <View>
      <InfoCard label="Garanti Bitiş" value={String(data.warrantyEndDate ?? '—')} />
      <InfoCard label="Kurulum" value={String(data.installationDate ?? '—')} />
      <InfoCard label="Son Servis" value={String(data.lastServiceAt ?? '—')} />
      <ActionRow
        actions={[
          { label: 'Bakım Planı', onPress: () => router.push(`/forms/maintenance?deviceId=${id}`), variant: 'secondary' },
        ]}
      />
    </View>
  );
}

function buildActions(
  navKey: string,
  id: string,
  data: Record<string, unknown>,
  setTab: (_t: TabKey) => void
): { label: string; onPress: () => void; variant?: 'primary' | 'secondary' }[] {
  const out: { label: string; onPress: () => void; variant?: 'primary' | 'secondary' }[] = [];
  if (navKey === 'offers') {
    out.push({ label: 'PDF Aç', onPress: () => void quoteService.openPdf(id), variant: 'primary' });
  }
  if (navKey === 'customers') {
    const phone = String(data.primaryPhone ?? data.phone ?? '').trim();
    if (phone) {
      const digits = phone.replace(/\D/g, '');
      out.push({ label: 'Ara', onPress: () => void Linking.openURL(`tel:${digits}`), variant: 'secondary' });
      out.push({
        label: 'WhatsApp',
        onPress: () => void Linking.openURL(`https://wa.me/${digits}`),
        variant: 'secondary',
      });
    }
    out.push({ label: 'Düzenle', onPress: () => router.push(`/forms/company?id=${id}`), variant: 'secondary' });
    out.push({
      label: 'Cari Ekstre',
      onPress: () =>
        router.push(
          `/forms/statement?companyId=${id}&companyName=${encodeURIComponent(String(data.legalTitle ?? data.shortName ?? id))}`
        ),
      variant: 'secondary',
    });
    out.push({ label: 'Ziyaret Planla', onPress: () => router.push(`/forms/visit?companyId=${id}`), variant: 'primary' });
  }
  if (navKey === 'contacts') {
    const phone = String(data.phone ?? data.mobile ?? '').trim();
    const email = String(data.email ?? '').trim();
    if (phone) out.push({ label: 'Ara', onPress: () => void Linking.openURL(`tel:${phone.replace(/\D/g, '')}`), variant: 'secondary' });
    if (email) out.push({ label: 'E-posta', onPress: () => void Linking.openURL(`mailto:${email}`), variant: 'secondary' });
    const companyId = String(data.companyId ?? '');
    if (companyId) out.push({ label: 'Firma', onPress: () => router.push(`/modules/customers/${companyId}`), variant: 'primary' });
    out.push({ label: 'Düzenle', onPress: () => router.push(`/forms/contact?id=${id}`), variant: 'secondary' });
  }
  if (navKey === 'sales-cases') {
    const companyId = String(data.companyId ?? '');
    out.push({ label: 'Düzenle', onPress: () => router.push(`/forms/opportunity?id=${id}`), variant: 'secondary' });
    out.push({
      label: 'Teklif Oluştur',
      onPress: () => router.push(`/forms/offer?opportunityId=${id}${companyId ? `&companyId=${companyId}` : ''}`),
      variant: 'primary',
    });
    if (companyId) out.push({ label: 'Ziyaret', onPress: () => router.push(`/forms/visit?companyId=${companyId}`), variant: 'secondary' });
  }
  if (navKey === 'shipments') {
    out.push({
      label: 'Yola Çıktı İşaretle',
      onPress: () => {
        void serviceService.updateShipmentStatus(id, 'in_transit').then(
          () => Alert.alert('Güncellendi', 'Sevkiyat yola çıktı olarak işaretlendi'),
          (e) => Alert.alert('Hata', e instanceof Error ? e.message : 'Güncellenemedi')
        );
      },
      variant: 'primary',
    });
    const companyId = String(data.companyId ?? data.customerCompanyId ?? '');
    if (companyId) out.push({ label: 'Müşteri', onPress: () => router.push(`/modules/customers/${companyId}`), variant: 'secondary' });
  }
  if (navKey === 'deliveries') {
    out.push({
      label: 'Teslim Edildi',
      onPress: () => {
        void serviceService.updateDeliveryStatus(id, 'completed').then(
          () => Alert.alert('Güncellendi', 'Teslimat tamamlandı'),
          (e) => Alert.alert('Hata', e instanceof Error ? e.message : 'Güncellenemedi')
        );
      },
      variant: 'primary',
    });
  }
  if (navKey === 'payments') {
    const companyId = String(data.companyId ?? '');
    if (companyId) out.push({ label: 'Firma Cari', onPress: () => router.push(`/forms/statement?companyId=${companyId}`), variant: 'secondary' });
  }
  if (navKey === 'accounting-invoices') {
    const companyId = String(data.companyId ?? '');
    if (companyId) {
      out.push({
        label: 'Tahsilat Kaydet',
        onPress: () =>
          router.push(
            `/forms/payment?companyId=${encodeURIComponent(companyId)}&companyName=${encodeURIComponent(String(data.companyName ?? ''))}`
          ),
        variant: 'primary',
      });
      out.push({ label: 'Cari Ekstre', onPress: () => router.push(`/forms/statement?companyId=${companyId}`), variant: 'secondary' });
    }
  }
  if (navKey === 'proformas' || navKey === 'contracts') {
    const companyId = String(data.companyId ?? '');
    if (companyId) out.push({ label: 'Firma', onPress: () => router.push(`/modules/customers/${companyId}`), variant: 'secondary' });
    out.push({ label: 'Teklif Oluştur', onPress: () => router.push(`/forms/offer?companyId=${companyId}`), variant: 'primary' });
  }
  if (navKey === 'service-requests' || navKey === 'service-kanban') {
    out.push({
      label: 'Servisi Tamamla',
      onPress: () => router.push(`/forms/service-complete?ticketId=${id}`),
      variant: 'primary',
    });
  }
  if (navKey === 'installations') {
    out.push({
      label: 'Kurulum Checklist',
      onPress: () => router.push(`/forms/installation-checklist?installationId=${id}`),
      variant: 'primary',
    });
  }
  if (navKey === 'purchase-orders') {
    out.push({ label: 'Sipariş Düzenle', onPress: () => router.push(`/forms/purchase-order?id=${id}`), variant: 'secondary' });
  }
  if (navKey === 'machines') {
    out.push({ label: 'Yeni Makine Kaydı', onPress: () => router.push('/forms/machine'), variant: 'secondary' });
  }
  void data;
  return out;
}

function labelFor(key: string) {
  const map: Record<string, string> = {
    legalTitle: 'Ünvan',
    taxNumber: 'Vergi No',
    taxOffice: 'Vergi Dairesi',
    documentNo: 'Belge No',
    statusCode: 'Durum',
    ticketNo: 'Talep No',
    serialNumber: 'Seri No',
    invoiceNo: 'Fatura No',
  };
  return map[key] ?? key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
}

function formatVal(data: Record<string, unknown>, key: string) {
  const v = data[key];
  if (v == null || v === '') return '—';
  if (key.includes('Amount') || key === 'estimatedValue' || key === 'balance') return money(v, data.currencyCode);
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  body: { padding: spacing.md, paddingBottom: 40 },
  err: { color: colors.accentRed, padding: 16 },
  muted: { ...typography.bodySm, color: colors.textMuted, paddingVertical: spacing.sm },
  timelineRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  timelineDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.border },
  timelineDotDone: { backgroundColor: colors.primary },
  timelineText: { ...typography.bodySm, color: colors.textMuted },
  timelineTextDone: { ...typography.bodySm, fontFamily: fonts.semibold, color: colors.textPrimary },
});
