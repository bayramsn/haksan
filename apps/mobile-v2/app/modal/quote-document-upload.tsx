import { useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import type { FileDocumentTypeCode } from '@haksan/shared';
import {
  useCreateCommercialInvoice,
  useCreateContract,
  useCreateProforma,
  useInvalidateDocuments,
} from '@/src/api/commercial-docs.hooks';
import type { CompanyListItem, OpportunityListItem, QuoteListItem } from '@/src/api/endpoints';
import { useQuoteDetail } from '@/src/api/quotes.hooks';
import { useCan } from '@/src/auth/AuthProvider';
import { pickDocument, uploadEntityAttachment, type LocalUpload } from '@/src/native/files';
import { useTheme } from '@/src/theme/theme';
import { Field, SubtleCard } from '@/src/ui';
import { toast } from '@/src/ui/toast';
import { formatFileSize, isRecordFolder, UPLOAD_TYPES, uploadFileError, uploadTypeFor, type UploadFolder } from '@/src/ui/documents/document-logic';
import {
  ChoiceChips,
  CompanyPickerSheet,
  ModalForm,
  OpportunityPickerSheet,
  PickerField,
  QuotePickerSheet,
} from '@/src/ui/documents/pickers';

type Params = { type?: string; companyId?: string; opportunityId?: string; quoteId?: string };

const param = (value: string | string[] | undefined) => (typeof value === 'string' && value ? value : undefined);

/**
 * Doküman / dış teklif yükleme (web DocumentUploadDialog). Ticari türlerde
 * (proforma, sözleşme, ticari fatura) dosya kaynak teklifin satış kartına
 * bağlanır ve aynı dosyayla taslak ticari kayıt açılır.
 */
export default function QuoteDocumentUploadScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams<Params>();
  const canUpload = useCan('files.create');
  const presetType = param(params.type);
  const lockedType = presetType === 'external_quote';
  const [folder, setFolder] = useState<UploadFolder>(uploadTypeFor(presetType ?? 'other').folder);
  const [scope, setScope] = useState<'company' | 'case'>(param(params.opportunityId) ? 'case' : 'company');
  const [companyId, setCompanyId] = useState(param(params.companyId) ?? '');
  const [companyLabel, setCompanyLabel] = useState<string | null>(null);
  const [opportunityId, setOpportunityId] = useState(param(params.opportunityId) ?? '');
  const [opportunityLabel, setOpportunityLabel] = useState<string | null>(null);
  const [quoteId, setQuoteId] = useState(param(params.quoteId) ?? '');
  const [quoteLabel, setQuoteLabel] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<LocalUpload | null>(null);
  const [uploading, setUploading] = useState(false);
  const companySheet = useRef<BottomSheetModal>(null);
  const opportunitySheet = useRef<BottomSheetModal>(null);
  const quoteSheet = useRef<BottomSheetModal>(null);

  const quote = useQuoteDetail(quoteId);
  const createProforma = useCreateProforma();
  const createContract = useCreateContract();
  const createInvoice = useCreateCommercialInvoice();
  const invalidate = useInvalidateDocuments();

  if (!canUpload) return <Redirect href="/(tabs)/modules/documents" />;

  const meta = uploadTypeFor(folder);
  const commercial = isRecordFolder(folder);
  const externalQuote = folder === 'external_quote';
  const lockedRelation = Boolean(param(params.companyId) || param(params.opportunityId));
  const quoteSummary = quote.data ? `${quote.data.documentNo} · R${quote.data.revisionNo}` : quoteLabel;

  async function chooseFile() {
    try {
      const picked = await pickDocument();
      if (!picked) return;
      const error = uploadFileError(folder, picked);
      if (error) {
        toast.error(error);
        return;
      }
      setFile(picked);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Dosya seçilemedi');
    }
  }

  async function submit() {
    if (!file) return toast.error('Dosya seçin');
    const fileError = uploadFileError(folder, file);
    if (fileError) return toast.error(fileError);
    let entityType: 'opportunity' | 'company' | 'quote';
    let entityId: string;
    if (commercial) {
      if (!quoteId || !quote.data) return toast.error('Bağlı teklif seçin');
      entityType = quote.data.opportunityId ? 'opportunity' : 'quote';
      entityId = quote.data.opportunityId ?? quote.data.id;
    } else if (scope === 'case') {
      if (!opportunityId) return toast.error('Satış kartı seçin');
      entityType = 'opportunity';
      entityId = opportunityId;
    } else {
      if (!companyId) return toast.error('Firma seçin');
      entityType = 'company';
      entityId = companyId;
    }

    setUploading(true);
    try {
      const uploaded = await uploadEntityAttachment({
        bucket: meta.bucket,
        entityType,
        entityId,
        documentTypeCode: meta.documentTypeCode as FileDocumentTypeCode,
        description: description.trim() || undefined,
        local: file,
      });
      if (commercial) {
        const today = new Date().toISOString();
        if (folder === 'proforma') {
          await createProforma.mutateAsync({ quoteId, issueDate: today, statusCode: 'draft', fileId: uploaded.fileId });
        } else if (folder === 'contract') {
          await createContract.mutateAsync({ quoteId, signedDate: today, statusCode: 'draft', fileId: uploaded.fileId });
        } else {
          await createInvoice.mutateAsync({ quoteId, invoiceDate: today, statusCode: 'draft', fileId: uploaded.fileId });
        }
      } else {
        invalidate();
      }
      toast.success(`${externalQuote ? 'Dış teklif yüklendi' : 'Doküman yüklendi'} · ${file.name}`);
      router.back();
    } catch (error) {
      const title = externalQuote ? 'Dış teklif yüklenemedi' : 'Doküman yüklenemedi';
      toast.error(error instanceof Error ? `${title}: ${error.message}` : title);
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <ModalForm
        title={externalQuote ? 'Dış Teklif Yükle' : 'Doküman Yükle'}
        submitLabel={uploading ? 'Yükleniyor...' : externalQuote ? 'Dış Teklifi Yükle' : 'Yükle'}
        onSubmit={() => void submit()}
        loading={uploading}
      >
        <Text className="font-inter text-sm text-muted-foreground">
          {externalQuote
            ? 'Teklif dosyasını firmaya veya satış kartına bağlayın; kart seçildiğinde firma otomatik eşleşir.'
            : commercial
              ? "PDF'yi kaynak teklif revizyonuna bağlayın; belge, fırsat ve firma ilişkisi otomatik korunur."
              : 'Dosyayı doğrudan firmaya ekleyin; satış kartı isteğe bağlıdır.'}
        </Text>

        {lockedType ? null : (
          <ChoiceChips
            label="Doküman Tipi"
            options={UPLOAD_TYPES.map((entry) => ({ value: entry.folder, label: entry.label }))}
            value={folder}
            onChange={(next) => {
              setFolder(next);
              if (file && uploadFileError(next, file)) setFile(null);
            }}
          />
        )}

        {commercial ? (
          <View className="gap-2">
            <PickerField
              label="Kaynak Teklif *"
              value={quoteSummary}
              placeholder="Teklif revizyonu seçin"
              icon="document-text-outline"
              onPress={() => quoteSheet.current?.present()}
              disabled={Boolean(param(params.quoteId))}
            />
            <Text className="font-inter text-xs text-muted-foreground">
              {quoteSummary
                ? `${quoteSummary} revizyonu kaynak alınacak; firma ve fırsat bu tekliften çözülecek.`
                : 'Proforma, sözleşme ve ticari fatura PDF’leri bir teklif revizyonuna bağlı olmalıdır.'}
            </Text>
          </View>
        ) : (
          <View className="gap-3">
            {lockedRelation ? null : (
              <ChoiceChips
                options={[
                  { value: 'company', label: 'Firma' },
                  { value: 'case', label: 'Satış kartı (firma otomatik)' },
                ]}
                value={scope}
                onChange={setScope}
              />
            )}
            {scope === 'company' ? (
              <PickerField
                label="Firma *"
                value={companyLabel ?? (companyId ? 'Seçili firma' : null)}
                placeholder="Firma seçin"
                icon="business-outline"
                onPress={() => companySheet.current?.present()}
                disabled={Boolean(param(params.companyId))}
              />
            ) : (
              <PickerField
                label="Satış Kartı *"
                value={opportunityLabel ?? (opportunityId ? 'Seçili satış kartı' : null)}
                placeholder="Satış kartı seçin"
                icon="briefcase-outline"
                onPress={() => opportunitySheet.current?.present()}
                disabled={Boolean(param(params.opportunityId))}
              />
            )}
          </View>
        )}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={file ? `Seçili dosya ${file.name}, değiştir` : 'Dosya seç'}
          onPress={() => void chooseFile()}
          className="min-h-[72px] flex-row items-center gap-3 rounded-control border border-dashed border-border bg-muted px-4 py-4 active:opacity-70"
        >
          <View className="h-10 w-10 items-center justify-center rounded-control bg-secondary">
            <Ionicons name="document-attach-outline" size={20} color={colors.primary} />
          </View>
          <View className="flex-1 gap-0.5">
            <Text className="font-inter-semibold text-sm text-foreground" numberOfLines={2}>
              {file?.name ?? 'Dosya seç'}
            </Text>
            <Text className="font-inter text-xs text-muted-foreground">
              {file
                ? `${formatFileSize(file.sizeBytes)} · ${file.extension.toLocaleUpperCase('tr-TR')}`
                : `${externalQuote ? 'PDF, DOCX, XLSX' : 'PDF, DOCX, XLSX, PNG, JPG, WEBP'} · en fazla 25 MB`}
            </Text>
            {file ? <Text className="font-inter-medium text-xs text-success">Güvenli yükleme için hazır</Text> : null}
          </View>
        </Pressable>

        <Field label="Açıklama" value={description} onChangeText={setDescription} placeholder="İsteğe bağlı not" maxLength={500} multiline />

        <SubtleCard className="flex-row items-start gap-2 p-3">
          <Ionicons name="shield-checkmark-outline" size={16} color={colors.primary} />
          <Text className="flex-1 font-inter text-xs text-muted-foreground">
            Dosya tipi ve boyutu gönderimden önce doğrulanır; kayıt seçtiğiniz firma veya satış kartıyla güvenli biçimde ilişkilendirilir.
          </Text>
        </SubtleCard>
      </ModalForm>
      <CompanyPickerSheet
        sheetRef={companySheet}
        selectedId={companyId}
        onSelect={(company: CompanyListItem) => {
          setCompanyId(company.id);
          setCompanyLabel(company.shortName ?? company.legalTitle);
        }}
      />
      <OpportunityPickerSheet
        sheetRef={opportunitySheet}
        selectedId={opportunityId}
        onSelect={(opportunity: OpportunityListItem) => {
          setOpportunityId(opportunity.id);
          setOpportunityLabel(`${opportunity.company?.shortName ?? opportunity.company?.legalTitle ?? opportunity.leadCompanyTitle ?? 'Firma'} · ${opportunity.title}`);
        }}
      />
      <QuotePickerSheet
        sheetRef={quoteSheet}
        selectedId={quoteId}
        companyId={companyId || undefined}
        onSelect={(next: QuoteListItem) => {
          setQuoteId(next.id);
          setQuoteLabel(`${next.documentNo} · R${next.revisionNo}`);
        }}
      />
    </>
  );
}
