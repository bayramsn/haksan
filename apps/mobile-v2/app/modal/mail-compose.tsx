import { MailBodyEditor } from '@/src/ui/crm/MailBodyEditor';
import { loadMailDocument, discardMailDocument } from '@/src/ui/crm/mail-document-handoff';
import { MAIL_MAX_ATTACHMENTS, MAIL_MAX_ATTACHMENT_BYTES, MAIL_MAX_QUOTES } from '@haksan/shared';
import { pickDocument, uploadEntityAttachment, type UploadedAttachment } from '@/src/native/files';
import { useCan } from '@/src/auth/AuthProvider';
import { validateMailAttachment } from '@/src/ui/crm/mail-attachment';
import { NoteTemplatePicker } from '@/src/ui/documents/TermsTemplatePicker';
import { useMemo, useRef, useState } from 'react';
import { useQuoteDetail } from '@/src/api/quotes.hooks';
import { QuotePickerSheet } from '@/src/ui/documents/pickers';
import type { SheetHandle } from '@/src/ui/pickers/HostedSheet';
import { addMailQuote, scopedMailQuotes, type MailQuote } from '@/src/ui/crm/mail-quotes';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { activityKeys, useMailRecipients, useSendMail } from '@/src/api/crm.hooks';
import { useMailAccountStatus } from '@/src/api/crm-general.hooks';
import { companyKeys } from '@/src/api/companies.hooks';
import { useTheme } from '@/src/theme/theme';
import { Button, Card, Field, Loading } from '@/src/ui';
import { toast } from '@/src/ui/toast';
import { MultiOptionPicker, OptionPicker } from '@/src/ui/pickers/OptionPicker';
import {
  MAIL_BODY_MAX_LENGTH,
  addCcAddress,
  initialMailBody,
  isMailAccountReady,
  mailSignature,
  validateMailDraft,
} from '@/src/ui/crm/mail-logic';

/** Web ComposeMailDialog: mesaj CRM'den çıkar, firma zaman çizelgesine kaydedilir. */
export default function MailComposeScreen() {
  const params = useLocalSearchParams<{ to?: string; name?: string; companyId?: string; contactId?: string; opportunityId?: string; quoteId?: string; draftId?: string; subject?: string }>();
  const documentDraft = params.draftId ? loadMailDocument(params.draftId) : null;
  const [discardedDocument, setDiscardedDocument] = useState(false);
  const generated = discardedDocument ? null : documentDraft;
  const draftError = params.draftId && !discardedDocument && !documentDraft ? 'Belge taslağının süresi doldu veya çalışma alanı değişti. Kaydı yeniden açın ya da eki kaldırın.' : undefined;
  const companyId = generated?.companyId || params.companyId;
  const router = useRouter();
  const qc = useQueryClient();
  const { colors } = useTheme();
  const account = useMailAccountStatus();
  const recipients = useMailRecipients(companyId);
  const send = useSendMail();

  const canUpload = useCan('files.create');
  const canReadQuotes = useCan('quotes.read');
  const canReadProduct = useCan('products.read');
  const canReadProforma = useCan('proformas.read');
  const canReadContract = useCan('contracts.read');
  const canExportReport = useCan('reports.export');
  const canReadDocument = !generated || (generated.payload.reportDocument ? canExportReport : generated.payload.productDocument ? canReadProduct : generated.payload.document?.kind === 'proforma' ? canReadProforma : canReadContract);
  const quoteSheet = useRef<SheetHandle>(null);
  const sending = useRef(false);
  const [pickedQuotes, setPickedQuotes] = useState<MailQuote[]>([]);
  const [dismissedQuote, setDismissedQuote] = useState<string>();
  const initialQuoteId = params.quoteId && dismissedQuote !== `${companyId}:${params.quoteId}` ? params.quoteId : undefined;
  const initialQuote = useQuoteDetail(canReadQuotes && initialQuoteId ? initialQuoteId : '');
  const initialQuoteReady = Boolean(initialQuote.data && initialQuote.data.companyId === companyId);
  const initialQuoteWaiting = Boolean(initialQuoteId && canReadQuotes && initialQuote.isPending);
  const initialQuoteError = initialQuoteId && !initialQuoteWaiting && (!canReadQuotes || initialQuote.isError || !initialQuoteReady)
    ? 'Başlangıç teklifi doğrulanamadı veya bu firmaya ait değil. Yeniden deneyin ya da eki kaldırın.' : undefined;
  const selectedQuotes = scopedMailQuotes(companyId, [
    ...(initialQuoteId && initialQuoteReady && initialQuote.data ? [initialQuote.data] : []),
    ...pickedQuotes,
  ]);
  const [attachments, setAttachments] = useState<UploadedAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [to, setTo] = useState(documentDraft?.to ?? params.to ?? '');
  const [contactId, setContactId] = useState<string | undefined>(params.contactId);
  const [cc, setCc] = useState<string[]>([]);
  const [ccManual, setCcManual] = useState('');
  const [ccError, setCcError] = useState<string | undefined>();
  const [subject, setSubject] = useState(documentDraft?.subject ?? params.subject ?? '');
  const [body, setBody] = useState(() => initialMailBody(params.name));

  const options = recipients.data ?? { contacts: [], colleagues: [] };
  const ready = isMailAccountReady(account.data);
  const signature = mailSignature(account.data);

  const contactOptions = useMemo(
    () =>
      options.contacts.map((option) => ({
        value: option.email,
        label: `${option.name}${option.detail ? ` · ${option.detail}` : ''}`,
        hint: option.email,
      })),
    [options.contacts],
  );

  const ccOptions = useMemo(() => {
    const known = [...options.contacts, ...options.colleagues];
    const manual = cc.filter((email) => !known.some((option) => option.email === email)).map((email) => ({ value: email, label: email }));
    return [
      ...options.contacts.map((option) => ({
        value: option.email,
        label: `${option.name}${option.detail ? ` · ${option.detail}` : ''} — ${option.email}`,
      })),
      ...options.colleagues.map((option) => ({ value: option.email, label: `${option.name} (ekibimiz) — ${option.email}` })),
      ...manual,
    ];
  }, [cc, options]);

  function pickContact(email: string | null) {
    if (!email) return;
    setTo(email);
    setContactId(options.contacts.find((option) => option.email === email)?.contactId ?? undefined);
  }

  function addManualCc() {
    const result = addCcAddress(cc, ccManual);
    setCcError(result.error ?? undefined);
    if (!result.error) {
      setCc(result.list);
      setCcManual('');
    }
  }

  async function addAttachment() {
    if (!params.opportunityId || uploading || send.isPending) return;
    setUploading(true);
    try {
      const local = await pickDocument();
      if (!local) return;
      const error = validateMailAttachment(attachments, local);
      if (error) return toast.error(error);
      const uploaded = await uploadEntityAttachment({ bucket: 'erp-quote-documents', entityType: 'opportunity', entityId: params.opportunityId, documentTypeCode: 'other', local });
      setAttachments((current) => [...current, uploaded]);
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Dosya eklenemedi'); }
    finally { setUploading(false); }
  }

  function submit() {
    if (sending.current || send.isPending || uploading) return;
    if (params.draftId && !discardedDocument && loadMailDocument(params.draftId) !== generated) return toast.error('Belge taslağının süresi doldu. Belgeyi yeniden açın.');
    if (draftError || !canReadDocument) return toast.error(draftError ?? 'Belgeye erişim yetkiniz yok.');
    if (generated && selectedQuotes.length) return toast.error('Teklif ve teknik/ticari belge eki aynı mesajda gönderilemez.');
    if (!ready) return toast.error('Bağlı ve aktif gönderici hesabınızı kontrol edin.');
    if (initialQuoteWaiting || initialQuoteError || (selectedQuotes.length && !canReadQuotes)) return toast.error(initialQuoteError ?? 'Teklif ekleri henüz doğrulanmadı.');
    const error = validateMailDraft({ to, subject, body });
    if (error) {
      toast.error(error);
      return;
    }
    sending.current = true;
    send.mutate(
      {
        to: to.trim(),
        cc: cc.length ? cc : undefined,
        subject: subject.trim(),
        body: body.trim(),
        companyId: companyId || undefined,
        contactId: contactId || undefined,
        fileIds: attachments.length ? attachments.map((item) => item.fileId) : undefined,
        quotes: selectedQuotes.length ? selectedQuotes.map(({ id }) => ({ id })) : undefined,
        ...(generated?.payload ?? {}),
      },
      {
        onSuccess: () => {
          if (params.draftId) discardMailDocument(params.draftId);
          void qc.invalidateQueries({ queryKey: activityKeys.all });
          if (companyId) void qc.invalidateQueries({ queryKey: companyKeys.detail(companyId) });
          toast.success(`E-posta gönderildi · ${account.data?.email ?? 'Webmail hesabınız'} üzerinden teslim edildi.`);
          router.back();
        },
        onError: (err) => toast.error(`E-posta gönderilemedi · ${err.message || 'Webmail bağlantınızı kontrol edin.'}`),
        onSettled: () => { sending.current = false; },
      },
    );
  }

  const canSend = ready && !draftError && canReadDocument && !(generated && selectedQuotes.length) && !send.isPending && !uploading && !initialQuoteWaiting && !initialQuoteError && (!selectedQuotes.length || canReadQuotes) && Boolean(to.trim() && subject.trim() && body.trim()) && body.length <= MAIL_BODY_MAX_LENGTH;

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['bottom', 'left', 'right']}>
      <Stack.Screen options={{ title: 'Yeni e-posta', headerShown: true }} />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ width: '100%', maxWidth: 960, alignSelf: 'center' }} contentContainerClassName="gap-3 px-4 pb-6 pt-3" keyboardShouldPersistTaps="handled">
          <Text className="font-inter text-sm text-muted-foreground">
            Mesaj CRM’den çıkar, gönderilmiş ileti firma zaman çizelgesine kaydedilir.
          </Text>

          {account.isPending ? (
            <Card className="flex-row items-center gap-2 px-3 py-3">
              <Loading />
              <Text className="font-inter text-xs text-muted-foreground">Gönderici hesabı kontrol ediliyor</Text>
            </Card>
          ) : ready ? (
            <View className="flex-row flex-wrap items-center justify-between gap-2 rounded-control border border-success bg-success-soft px-3 py-2.5">
              <View className="flex-row items-center gap-2">
                <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                <Text className="font-inter-medium text-xs text-success">
                  {account.data?.displayName} &lt;{account.data?.email}&gt;
                </Text>
              </View>
              <Text className="font-inter text-[11px] text-muted-foreground">Kişisel webmail üzerinden</Text>
            </View>
          ) : (
            <View className="flex-row items-start gap-3 rounded-control border border-warning bg-warning-soft px-3 py-3">
              <Ionicons name="warning-outline" size={16} color={colors.warning} />
              <View className="flex-1">
                <Text className="font-inter-medium text-xs text-foreground">Gönderici hesabı hazır değil</Text>
                <Text className="mt-0.5 font-inter text-[11px] text-muted-foreground">
                  {account.error
                    ? `Gönderici hesabı kontrol edilemedi: ${account.error.message}`
                    : 'Ayarlar > Webmail bölümünden kurumsal adresinizi ve webmail şifrenizi doğrulayın.'}
                </Text>
              </View>
            </View>
          )}

          <Field
            label="Alıcı"
            value={to}
            onChangeText={(value) => {
              setTo(value);
              setContactId(undefined);
            }}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={255}
            editable={!send.isPending}
          />
          <OptionPicker
            label="Firma kontaklarından seç"
            value={null}
            options={contactOptions}
            placeholder={contactOptions.length ? 'Firma kontaklarından seç' : 'Kontak e-postası yok'}
            icon="people-outline"
            disabled={send.isPending || contactOptions.length === 0}
            searchable={contactOptions.length > 8}
            onChange={pickContact}
          />

          <MultiOptionPicker
            label="CC (bilgi)"
            values={cc}
            options={ccOptions}
            placeholder={ccOptions.length ? 'Ekibimizden veya müşteri kontaklarından seç' : 'Seçilebilecek adres yok'}
            icon="copy-outline"
            onChange={setCc}
          />
          <View className="flex-row items-start gap-2">
            <View className="flex-1">
              <Field
                label="CC için e-posta adresi yaz"
                value={ccManual}
                onChangeText={(value) => {
                  setCcManual(value);
                  setCcError(undefined);
                }}
                onSubmitEditing={addManualCc}
                placeholder="Listede olmayan adres..."
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={255}
                error={ccError}
              />
            </View>
            <View className="pt-[26px]">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="CC adresini ekle"
                accessibilityState={{ disabled: !ccManual.trim() }}
                disabled={!ccManual.trim() || send.isPending}
                onPress={addManualCc}
                className={`h-12 items-center justify-center rounded-control border border-border bg-card px-4 ${ccManual.trim() ? 'active:bg-muted' : 'opacity-50'}`}
              >
                <Text className="font-inter-medium text-sm text-foreground">Ekle</Text>
              </Pressable>
            </View>
          </View>
          {cc.length ? (
            <View className="flex-row flex-wrap gap-2">
              {cc.map((email) => (
                <Pressable
                  key={email}
                  accessibilityRole="button"
                  accessibilityLabel={`${email} adresini CC listesinden çıkar`}
                  onPress={() => setCc(cc.filter((item) => item !== email))}
                  className="min-h-11 flex-row items-center gap-1.5 rounded-full bg-muted px-3"
                >
                  <Text className="font-inter text-xs text-foreground">{email}</Text>
                  <Ionicons name="close" size={14} color={colors.mutedForeground} />
                </Pressable>
              ))}
            </View>
          ) : null}

          <Field label="Konu" value={subject} onChangeText={setSubject} maxLength={255} placeholder="E-postanın konusu" editable={!send.isPending} />

          <View className="gap-1.5">
            <Text className="font-inter-medium text-[13px] text-muted-foreground">Mesaj</Text>
            <MailBodyEditor value={body} onChange={setBody} disabled={send.isPending} maxLength={MAIL_BODY_MAX_LENGTH} />
            <Text className={`text-right font-inter text-[10px] ${body.length > MAIL_BODY_MAX_LENGTH ? 'text-destructive' : 'text-muted-foreground'}`}>
              {body.length.toLocaleString('tr-TR')} / 10.000
            </Text>
          </View>

          {params.draftId && !discardedDocument ? <Card className="gap-2">
            <Text className="font-inter-semibold text-sm text-foreground">{generated?.label ?? 'Belge eki'}</Text>
            <Text className="font-inter text-xs text-muted-foreground">Belge, gönderirken sunucuda PDF'e çevrilir.</Text>
            {draftError || !canReadDocument ? <Text accessibilityRole="alert" className="font-inter text-sm text-destructive">{draftError ?? 'Belgeye erişim yetkiniz yok.'}</Text> : null}
            <Button label="Belge ekini kaldır" variant="ghost" disabled={send.isPending} onPress={() => { if(params.draftId) discardMailDocument(params.draftId); setDiscardedDocument(true); }} />
          </Card> : null}
          {!generated && (companyId || initialQuoteId) ? <Card className="gap-3">
            <Text className="font-inter-semibold text-sm text-foreground">Teklif ekleri ({selectedQuotes.length}/{MAIL_MAX_QUOTES})</Text>
            <Text className="font-inter text-xs text-muted-foreground">Seçilen teklifler sunucuda PDF olarak oluşturulup e-postaya eklenir.</Text>
            {initialQuoteWaiting ? <View className="flex-row items-center gap-2"><Loading /><Text className="font-inter text-xs text-muted-foreground">Teklif doğrulanıyor</Text></View> : null}
            {initialQuoteError ? <View className="gap-2">
              <Text accessibilityRole="alert" className="font-inter text-sm text-destructive">{initialQuoteError}</Text>
              {canReadQuotes ? <Button label="Teklifi yeniden kontrol et" variant="ghost" disabled={send.isPending} onPress={() => void initialQuote.refetch()} /> : null}
              <Button label="Doğrulanamayan teklif ekini kaldır" variant="ghost" disabled={send.isPending} onPress={() => setDismissedQuote(`${companyId}:${params.quoteId}`)} />
            </View> : null}
            {selectedQuotes.map((quote) => <View key={quote.id} className="flex-row items-center gap-2">
              <Text className="flex-1 font-inter text-sm text-foreground">{quote.documentNo} · R{quote.revisionNo}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={`${quote.documentNo} teklif ekini kaldır`} disabled={send.isPending} accessibilityState={{ disabled: send.isPending }} onPress={() => {
                if (quote.id === initialQuoteId) setDismissedQuote(`${companyId}:${params.quoteId}`);
                setPickedQuotes((rows) => rows.filter((row) => row.id !== quote.id));
              }} className="h-11 w-11 items-center justify-center"><Ionicons name="close-circle-outline" size={22} color={colors.mutedForeground} /></Pressable>
            </View>)}
            {canReadQuotes && companyId ? <Button label="Teklif ekle" variant="ghost" disabled={send.isPending || initialQuoteWaiting || Boolean(initialQuoteError) || selectedQuotes.length >= MAIL_MAX_QUOTES} onPress={() => quoteSheet.current?.present()} /> : <Text className="font-inter text-xs text-muted-foreground">Teklif seçimi için firma ve teklif görüntüleme yetkisi gerekir.</Text>}
          </Card> : null}
          {params.opportunityId ? <Card className="gap-3">
            <Text className="font-inter-semibold text-sm text-foreground">Dosya ekleri ({attachments.length}/{MAIL_MAX_ATTACHMENTS})</Text>
            <Text className="font-inter text-xs text-muted-foreground">PDF, DOCX, XLSX veya görsel. Toplam en fazla {MAIL_MAX_ATTACHMENT_BYTES / 1024 / 1024} MB. Yüklenen dosyalar fırsatın belgelerinde de saklanır.</Text>
            {attachments.map((item) => <View key={item.fileId} className="flex-row items-center gap-2">
              <Text className="flex-1 font-inter text-sm text-foreground">{item.fileName}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={`${item.fileName} ekini kaldır`} accessibilityState={{ disabled: Boolean(send.isPending || uploading) }} disabled={send.isPending || uploading} onPress={() => setAttachments((current) => current.filter((row) => row.fileId !== item.fileId))} className="h-11 w-11 items-center justify-center"><Ionicons name="close-circle-outline" size={22} color={colors.mutedForeground} /></Pressable>
            </View>)}
            {canUpload ? <Button label="Dosya ekle" variant="ghost" loading={uploading} disabled={send.isPending || attachments.length >= MAIL_MAX_ATTACHMENTS} onPress={() => void addAttachment()} /> : null}
          </Card> : null}
          <NoteTemplatePicker scope="mail" body={body} onApply={setBody} />
          {ready && signature ? (
            <View className="gap-1.5 rounded-control border border-border bg-card px-3 py-2.5">
              <Text className="font-inter-medium text-[11px] text-muted-foreground">İmza · mesajın altına otomatik eklenir</Text>
              <Text className="font-inter text-xs leading-5 text-foreground">{signature}</Text>
            </View>
          ) : null}

          <View className="flex-row items-center gap-1.5">
            <Ionicons name="lock-closed-outline" size={13} color={colors.mutedForeground} />
            <Text className="font-inter text-[11px] text-muted-foreground">TLS ile güvenli gönderim</Text>
          </View>

          <View className="flex-row gap-3">
            <View className="flex-1">
              <Button label="Vazgeç" variant="ghost" onPress={() => router.back()} />
            </View>
            <View className="flex-[2]">
              <Button
                label={send.isPending ? 'Gönderiliyor' : 'E-postayı gönder'}
                loading={send.isPending}
                disabled={!canSend}
                onPress={submit}
              />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      {canReadQuotes && companyId ? <QuotePickerSheet key={companyId} sheetRef={quoteSheet} companyId={companyId} excludeCancelled selectedId={initialQuoteId} onSelect={(quote) => {
        if (sending.current || send.isPending) return;
        const result = addMailQuote(selectedQuotes, { id: quote.id, companyId: quote.company?.id ?? '', documentNo: quote.documentNo, revisionNo: quote.revisionNo }, companyId);
        if (result.error) toast.error(result.error);
        else setPickedQuotes(result.rows);
      }} /> : null}
    </SafeAreaView>
  );
}
