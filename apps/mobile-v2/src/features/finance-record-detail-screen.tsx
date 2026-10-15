import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import type { Payment, Receivable2 } from '@/src/api/endpoints';
import { useCompanyFiles, useDeletePayment, useFinanceStatusAction } from '@/src/api/finance.hooks';
import { useCan } from '@/src/auth/AuthProvider';
import { dueLabel, formatAmount, formatDate, formatDateTime } from '@/src/lib/format';
import { downloadAndShareFile, pickDocument, uploadEntityAttachment, type LocalUpload } from '@/src/native/files';
import { useTheme, type Tone } from '@/src/theme/theme';
import { Button, Card, Chip, DetailHeader, ErrorState, Eyebrow, Loading } from '@/src/ui';
import { InfoRows, type InfoItem } from '@/src/ui/data';
import { toast } from '@/src/ui/toast';
import { Segmented } from '@/src/ui/finance/kit';

type CommonProps = { id: string; isPending: boolean; error: Error | null; refetch: () => unknown };
type Props =
  | (CommonProps & { kind: 'receivable'; data: Receivable2 | undefined })
  | (CommonProps & { kind: 'payment'; data: Payment | undefined });

type StatusCode = 'pending' | 'paid' | 'overdue' | 'cancelled';

const STATUS_OPTIONS: readonly { value: StatusCode; label: string }[] = [
  { value: 'pending', label: 'Bekliyor' },
  { value: 'paid', label: 'Ödendi' },
  { value: 'overdue', label: 'Gecikmiş' },
  { value: 'cancelled', label: 'İptal' },
];

const STATUS_TONE: Record<string, Tone> = {
  pending: 'warning',
  partial: 'info',
  paid: 'success',
  overdue: 'destructive',
  cancelled: 'destructive',
};

const METHOD_LABEL: Record<string, string> = {
  bank_transfer: 'Havale / EFT',
  cash: 'Nakit',
  credit_card: 'Kredi kartı',
  cheque: 'Çek',
  check: 'Çek',
  promissory_note: 'Senet',
  leasing: 'Leasing',
  other: 'Diğer',
};

const DOC_OPTIONS = [
  { value: 'accounting_invoice_pdf', label: 'Fiş' },
  { value: 'commercial_invoice_pdf', label: 'Fatura' },
] as const;
const DOC_LABEL: Record<string, string> = { accounting_invoice_pdf: 'Fiş', commercial_invoice_pdf: 'Fatura' };
const UPLOAD_EXTENSIONS = new Set(['pdf', 'png', 'jpg', 'jpeg', 'webp', 'docx', 'xlsx']);
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const formatBytes = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} MB`
    : `${Math.max(1, Math.round(bytes / 1024)).toLocaleString('tr-TR')} KB`;

/** Web `PaymentDetailDialog`: durum, düzenle/sil (yalnız ödeme) ve firmaya bağlı Fiş / Fatura. */
export function FinanceRecordDetailScreen(props: Props) {
  const router = useRouter();
  const qc = useQueryClient();
  const { colors } = useTheme();
  const canUpdate = useCan(props.kind === 'receivable' ? 'receivables.update' : 'payments.update');
  const canDelete = useCan('payments.delete');
  const canReadFiles = useCan('files.read');
  const canUploadFiles = useCan('files.create');
  const action = useFinanceStatusAction(props.kind, props.id);
  const remove = useDeletePayment();
  const files = useCompanyFiles(canReadFiles ? (props.data?.companyId ?? '') : '');
  const [docType, setDocType] = useState<(typeof DOC_OPTIONS)[number]['value']>('commercial_invoice_pdf');
  const [file, setFile] = useState<LocalUpload | null>(null);
  const [uploading, setUploading] = useState(false);

  if (props.isPending || props.error || !props.data) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
        <DetailHeader title={props.kind === 'receivable' ? 'Tahsilat' : 'Ödeme'} />
        {props.isPending ? <Loading /> : <ErrorState message={props.error?.message ?? 'Kayıt yüklenemedi.'} onRetry={() => void props.refetch()} />}
      </SafeAreaView>
    );
  }

  const row = props.data;
  const code = row.status?.code ?? '';
  const tone = STATUS_TONE[code] ?? 'neutral';
  const companyName = row.company?.shortName ?? row.company?.legalTitle ?? 'Firma';
  const currency = row.currency?.code;
  const amount = currency
    ? formatAmount(row.amount, currency)
    : Number(row.amount).toLocaleString('tr-TR', { maximumFractionDigits: 2 });
  const receivable = props.kind === 'receivable' ? props.data : null;
  const payment = props.kind === 'payment' ? props.data : null;
  const invoiceId = row.accountingInvoiceId;
  const relatedFiles = (files.data ?? []).filter(
    (link) => !link.documentType || ['commercial_invoice_pdf', 'accounting_invoice_pdf'].includes(link.documentType.code),
  );

  const changeStatus = (next: StatusCode) => {
    if (next === code) return;
    const label = STATUS_OPTIONS.find((option) => option.value === next)?.label ?? next;
    const execute = () =>
      action.mutate(next, {
        onSuccess: () => {
          void qc.invalidateQueries({ queryKey: ['finance'] });
          toast.success(`Durum güncellendi: ${label}`);
        },
        onError: (error) => toast.error(`Durum güncellenemedi: ${error.message}`),
      });
    if (next !== 'cancelled') return execute();
    Alert.alert('Kaydı iptal et?', 'Finans kaydının durumu iptal olarak değiştirilecek.', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: label, style: 'destructive', onPress: execute },
    ]);
  };

  const confirmDelete = () => {
    Alert.alert(
      'Kasa hareketi silinsin mi?',
      `${companyName} için ${amount} tutarındaki hareket kalıcı olarak silinecek. Rapor ve kasa bakiyesi yeniden hesaplanacak.\n\nBağlı fiş ve faturalar silinmez; yalnız kasa hareketi kaldırılır.`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: () =>
            remove.mutate(props.id, {
              onSuccess: () => {
                toast.success('Kasa hareketi silindi');
                router.back();
              },
              onError: (error) => toast.error(`Kasa hareketi silinemedi: ${error.message}`),
            }),
        },
      ],
    );
  };

  const preview = async (fileId: string) => {
    try {
      await downloadAndShareFile(fileId);
    } catch (error) {
      toast.error(`Önizleme açılamadı: ${error instanceof Error ? error.message : 'İstek başarısız.'}`);
    }
  };

  const chooseFile = async () => {
    try {
      const picked = await pickDocument();
      if (!picked) return;
      if (!UPLOAD_EXTENSIONS.has(picked.extension)) {
        toast.error('Desteklenmeyen dosya tipi: PDF, PNG, JPG, WEBP, DOCX veya XLSX');
        return;
      }
      if (picked.sizeBytes > MAX_UPLOAD_BYTES) {
        toast.error("Dosya boyutu 25 MB'ı aşamaz");
        return;
      }
      setFile(picked);
    } catch (error) {
      toast.error(`Dosya seçilemedi: ${error instanceof Error ? error.message : 'Dosya okunamadı.'}`);
    }
  };

  const upload = async () => {
    if (!file) {
      toast.error('Dosya seçin');
      return;
    }
    setUploading(true);
    try {
      await uploadEntityAttachment({
        bucket: 'erp-invoice-documents',
        entityType: 'company',
        entityId: row.companyId,
        documentTypeCode: docType,
        description: `Kasa hareketi #${props.id.toUpperCase()} · ${DOC_LABEL[docType]}`,
        local: file,
      });
      toast.success(`Fiş/Fatura eklendi: ${file.name}`);
      setFile(null);
      await files.refetch();
    } catch (error) {
      toast.error(`Eklenemedi: ${error instanceof Error ? error.message : 'İstek başarısız oldu.'}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <DetailHeader
        title={props.kind === 'receivable' ? 'Tahsilat Detayı' : 'Ödeme Detayı'}
        subtitle={row.invoiceNo ?? undefined}
      />
      <ScrollView contentContainerClassName="gap-4 px-4 pb-10 pt-4">
        <Card className="gap-2">
          <Chip tone={tone} label={row.status?.name ?? 'Durum belirtilmedi'} />
          <Text className="text-[19px] font-inter-semibold text-foreground">{companyName}</Text>
          <View className="flex-row items-end justify-between gap-3">
            <Text className="font-inter text-[12px] text-muted-foreground">
              {receivable ? `Vade: ${formatDate(receivable.dueDate)}` : formatDate(payment?.paymentDate)}
            </Text>
            <Text className={`font-inter-bold text-[20px] ${payment?.direction === 'out' ? 'text-destructive' : 'text-foreground'}`}>
              {payment ? `${payment.direction === 'in' ? '+' : '−'} ` : ''}{amount}
            </Text>
          </View>
        </Card>

        <Card>
          <InfoRows
            items={[
              { label: 'Firma', value: companyName },
              { label: 'Yön', value: payment ? (payment.direction === 'in' ? 'Alınan (Giren)' : 'Ödenen (Çıkan)') : 'Alınan (Giren)' },
              { label: 'Fatura No', value: row.invoiceNo },
              { label: 'Ödeme Yöntemi', value: row.paymentMethod ? (METHOD_LABEL[row.paymentMethod] ?? row.paymentMethod) : null },
              { label: 'Kayıt Tipi', value: payment ? 'Tahsilat' : 'Beklenen' },
              { label: 'Hareket türü', value: receivable?.movementType },
              { label: 'Belge referansı', value: receivable?.documentRef },
              { label: 'Vade', value: receivable ? formatDate(receivable.dueDate) : null },
              { label: 'Ödeme Tarihi', value: payment ? formatDate(payment.paymentDate) : null },
              { label: 'Oluşturulma', value: row.createdAt ? formatDateTime(row.createdAt) : null },
            ] satisfies InfoItem[]}
          />
        </Card>

        {receivable && code !== 'paid' && code !== 'cancelled' ? (() => {
          const due = dueLabel(receivable.dueDate);
          return due ? <Chip label={due.text} tone={due.overdue ? 'destructive' : 'warning'} /> : null;
        })() : null}

        {canUpdate ? (
          <Card className="gap-2">
            <Segmented
              label="Durum"
              value={(STATUS_OPTIONS.some((option) => option.value === code) ? code : 'pending') as StatusCode}
              options={STATUS_OPTIONS}
              onChange={changeStatus}
            />
            {action.isPending ? <Text className="font-inter text-xs text-muted-foreground">Durum kaydediliyor…</Text> : null}
          </Card>
        ) : null}

        {row.notes ? (
          <Card className="gap-1.5"><Eyebrow>Not</Eyebrow><Text className="font-inter text-sm text-foreground">{row.notes}</Text></Card>
        ) : null}

        {canReadFiles ? (
          <Card className="gap-3">
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-2">
                <Ionicons name="receipt-outline" size={17} color={colors.primary} />
                <Text className="font-inter-semibold text-sm text-foreground">Fiş / Fatura</Text>
              </View>
              {relatedFiles.length ? <Text className="font-inter text-[11px] text-muted-foreground">{relatedFiles.length} belge</Text> : null}
            </View>
            {files.isPending ? (
              <Loading />
            ) : files.error ? (
              <ErrorState message={files.error.message} onRetry={() => void files.refetch()} />
            ) : relatedFiles.length ? (
              relatedFiles.map((link) => (
                <Pressable
                  key={link.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${link.file?.originalFilename ?? 'Belge'} önizle`}
                  onPress={() => void preview(link.fileId)}
                  className="min-h-11 flex-row items-center gap-3 border-t border-border py-2 active:opacity-60"
                >
                  <Ionicons name="document-text-outline" size={18} color={colors.mutedForeground} />
                  <View className="flex-1">
                    <Text className="font-inter text-sm text-foreground" numberOfLines={1}>{link.file?.originalFilename ?? 'Belge'}</Text>
                    <Text className="font-inter text-[11px] text-muted-foreground">
                      {[DOC_LABEL[link.documentType?.code ?? ''] ?? link.documentType?.name, link.file ? formatBytes(link.file.sizeBytes) : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </View>
                  <Ionicons name="eye-outline" size={18} color={colors.primary} />
                </Pressable>
              ))
            ) : (
              <Text className="font-inter text-xs text-muted-foreground">Bu firmaya bağlı fiş/fatura yok. Aşağıdan ekleyebilirsiniz.</Text>
            )}
            {canUploadFiles ? (
              <View className="gap-2">
                <Segmented label="Belge türü" value={docType} options={DOC_OPTIONS} onChange={setDocType} />
                <Button
                  label={file ? `${file.name} · ${formatBytes(file.sizeBytes)}` : 'Dosya seç (PDF, görsel, ...)'}
                  variant="ghost"
                  onPress={() => void chooseFile()}
                />
                <Button label={uploading ? 'Yükleniyor…' : 'Fiş/Fatura Ekle'} disabled={!file || uploading} loading={uploading} onPress={() => void upload()} />
              </View>
            ) : null}
          </Card>
        ) : null}

        {payment && canUpdate ? (
          <Button label="Düzenle" variant="ghost" onPress={() => router.push(`/modal/payment?id=${props.id}` as Href)} />
        ) : null}
        {invoiceId ? (
          <Button label="Bağlı Fatura" variant="ghost" onPress={() => router.push(`/(tabs)/modules/invoices/${invoiceId}` as Href)} />
        ) : null}
        <Button label="Firma Kartı" variant="ghost" onPress={() => router.push(`/(tabs)/modules/companies/${row.companyId}` as Href)} />
        {payment && canDelete ? (
          <Button label="Sil" variant="destructive" loading={remove.isPending} onPress={confirmDelete} />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
