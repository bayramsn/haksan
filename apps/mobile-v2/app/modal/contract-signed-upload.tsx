import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useUpdateContract } from '@/src/api/commercial-docs.hooks';
import { useCommercialDocument } from '@/src/api/documents.hooks';
import { useQuoteDetail } from '@/src/api/quotes.hooks';
import { useCan } from '@/src/auth/AuthProvider';
import { pickDocument, uploadEntityAttachment, type LocalUpload } from '@/src/native/files';
import { useTheme } from '@/src/theme/theme';
import { DetailSkeleton, ErrorState, Field } from '@/src/ui';
import { toast } from '@/src/ui/toast';
import { formatFileSize } from '@/src/ui/documents/document-logic';
import { ModalForm } from '@/src/ui/documents/pickers';
import { formatDay, parseDay } from '@/src/ui/documents/quote-logic';
import { DateTextField } from '@/src/ui/select/DateTextField';

/**
 * İmzalı sözleşme nüshası (web SignedContractUploadDialog): PDF satış kartına
 * `contract_pdf` olarak bağlanır, sonra sözleşme `signed` durumuna alınır.
 * Teklifsiz hızlı sözleşmede dosya firmaya bağlanır.
 */
export default function ContractSignedUploadScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const contractId = typeof id === 'string' ? id : '';
  const canUpdate = useCan('contracts.update');
  const canUpload = useCan('files.create');
  const contract = useCommercialDocument('contract', contractId);
  const doc = contract.data as (Record<string, unknown> & { quoteId?: string | null; companyId?: string | null; contractNo?: string }) | undefined;
  const quote = useQuoteDetail(doc?.quoteId ?? '');
  const update = useUpdateContract();
  const [file, setFile] = useState<LocalUpload | null>(null);
  const [signedDate, setSignedDate] = useState(formatDay(new Date()));
  const [busy, setBusy] = useState(false);

  if (!canUpdate || !canUpload || !contractId) return <Redirect href="/modules/contracts" />;

  const contractNo = doc?.contractNo ?? 'Sözleşme';

  async function chooseFile() {
    try {
      const picked = await pickDocument();
      if (!picked) return;
      if (picked.extension !== 'pdf') {
        toast.error('İmzalı nüsha PDF olmalı');
        return;
      }
      setFile(picked);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Dosya seçilemedi');
    }
  }

  async function submit() {
    if (!file) return toast.error('İmzalı PDF dosyasını seçin');
    const day = parseDay(signedDate);
    if (!day) return toast.error('Tarih biçimi: YYYY-AA-GG');
    let target: { entityType: 'opportunity' | 'quote' | 'company'; entityId: string } | null = null;
    if (doc?.quoteId) {
      if (!quote.data) return toast.error('Bağlı teklif yükleniyor, tekrar deneyin.');
      target = quote.data.opportunityId
        ? { entityType: 'opportunity', entityId: quote.data.opportunityId }
        : { entityType: 'quote', entityId: quote.data.id };
    } else if (doc?.companyId) {
      target = { entityType: 'company', entityId: doc.companyId };
    }
    if (!target) return toast.error('Sözleşmenin bağlanacağı firma veya teklif bulunamadı.');

    setBusy(true);
    try {
      const uploaded = await uploadEntityAttachment({
        bucket: 'erp-contract-documents',
        ...target,
        documentTypeCode: 'contract_pdf',
        description: `${contractNo} imzalı nüsha`,
        local: file,
      });
      const [year, month, date] = formatDay(day).split('-');
      await update.mutateAsync({
        id: contractId,
        body: {
          fileId: uploaded.fileId,
          signedDate: new Date(Number(year), Number(month) - 1, Number(date), 12).toISOString(),
          statusCode: 'signed',
        },
      });
      toast.success(`İmzalı sözleşme bağlandı · ${file.name}`);
      router.back();
    } catch (error) {
      toast.error(error instanceof Error ? `İmzalı sözleşme yüklenemedi: ${error.message}` : 'İmzalı sözleşme yüklenemedi');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalForm title="İmzalı Sözleşme Yükle" submitLabel="Yükle ve İmzalandı Yap" onSubmit={() => void submit()} loading={busy} disabled={!doc}>
      {contract.error ? (
        <ErrorState message={contract.error.message} onRetry={() => void contract.refetch()} />
      ) : !doc ? (
        <DetailSkeleton />
      ) : (
        <View className="gap-4">
          <Text className="font-inter text-sm text-muted-foreground">{contractNo} kaydına imzalı PDF nüshasını bağlayın.</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={file ? `Seçili dosya ${file.name}, değiştir` : 'İmzalı PDF seç'}
            onPress={() => void chooseFile()}
            className="min-h-[72px] flex-row items-center gap-3 rounded-control border border-dashed border-border bg-muted px-4 py-4 active:opacity-70"
          >
            <View className="h-10 w-10 items-center justify-center rounded-control bg-secondary">
              <Ionicons name="document-attach-outline" size={20} color={colors.primary} />
            </View>
            <View className="flex-1 gap-0.5">
              <Text className="font-inter-semibold text-sm text-foreground" numberOfLines={2}>
                {file?.name ?? 'İmzalı PDF *'}
              </Text>
              <Text className="font-inter text-xs text-muted-foreground">{file ? formatFileSize(file.sizeBytes) : 'Yalnız PDF · en fazla 25 MB'}</Text>
            </View>
          </Pressable>
          <DateTextField
            label="İmza Tarihi"
            value={signedDate}
            onChangeText={setSignedDate}
          />
        </View>
      )}
    </ModalForm>
  );
}
