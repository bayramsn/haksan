import { useRef, useState } from 'react';
import { Text } from 'react-native';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCreateCommercialInvoice, useCreateContract, useCreateProforma } from '@/src/api/commercial-docs.hooks';
import type { QuoteListItem } from '@/src/api/endpoints';
import { useCan } from '@/src/auth/AuthProvider';
import { toast } from '@/src/ui/toast';
import { isRecordFolder } from '@/src/ui/documents/document-logic';
import { ModalForm, PickerField, QuotePickerSheet } from '@/src/ui/documents/pickers';

type Params = { fileId?: string; folder?: string; name?: string; companyId?: string };

/**
 * Teklifsiz yüklenmiş proforma / sözleşme / ticari fatura PDF'ini kaynak
 * teklif revizyonuna bağlar (web LinkCommercialDocumentDialog): aynı dosyayla
 * taslak ticari kayıt açılır.
 */
export default function QuoteDocumentLinkScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<Params>();
  const fileId = typeof params.fileId === 'string' ? params.fileId : '';
  const folder = typeof params.folder === 'string' ? params.folder : '';
  const name = typeof params.name === 'string' ? params.name : 'Dosya';
  const companyId = typeof params.companyId === 'string' && params.companyId ? params.companyId : undefined;
  const permission = folder === 'proforma' ? 'proformas.create' : folder === 'contract' ? 'contracts.create' : 'commercial_invoices.create';
  const canCreate = useCan(permission);
  const [quote, setQuote] = useState<QuoteListItem | null>(null);
  const sheet = useRef<BottomSheetModal>(null);
  const createProforma = useCreateProforma();
  const createContract = useCreateContract();
  const createInvoice = useCreateCommercialInvoice();
  const busy = createProforma.isPending || createContract.isPending || createInvoice.isPending;

  if (!canCreate || !fileId || !isRecordFolder(folder as never)) return <Redirect href="/(tabs)/modules/documents" />;

  function submit() {
    if (!quote) return toast.error('Kaynak teklif seçin');
    const today = new Date().toISOString();
    const options = {
      onSuccess: () => {
        toast.success('Belge kaynağa bağlandı');
        router.back();
      },
      onError: (error: Error) => toast.error(`Bağlantı tamamlanamadı: ${error.message}`),
    };
    if (folder === 'proforma') createProforma.mutate({ quoteId: quote.id, issueDate: today, statusCode: 'draft', fileId }, options);
    else if (folder === 'contract') createContract.mutate({ quoteId: quote.id, signedDate: today, statusCode: 'draft', fileId }, options);
    else createInvoice.mutate({ quoteId: quote.id, invoiceDate: today, statusCode: 'draft', fileId }, options);
  }

  return (
    <>
      <ModalForm title="Bağlantıyı tamamla" submitLabel="Bağlantıyı tamamla" onSubmit={submit} loading={busy} disabled={!quote}>
        <Text className="font-inter text-sm text-muted-foreground">{name} dosyasını gerçek kaynak teklif revizyonuna bağlayın.</Text>
        <PickerField
          label="Kaynak Teklif *"
          value={quote ? `${quote.documentNo} · R${quote.revisionNo} · ${quote.company?.shortName ?? quote.company?.legalTitle ?? 'Firma'}` : null}
          placeholder="Teklif seçin"
          icon="document-text-outline"
          onPress={() => sheet.current?.present()}
        />
        <Text className="font-inter text-xs text-muted-foreground">
          PDF artık seçilen teklif revizyonunun ticari zincirinde görünecek.
        </Text>
      </ModalForm>
      <QuotePickerSheet sheetRef={sheet} selectedId={quote?.id} companyId={companyId} onSelect={setQuote} />
    </>
  );
}
