import { MAIL_MAX_ATTACHMENTS, MAIL_MAX_ATTACHMENT_BYTES } from '@haksan/shared';
import { pickDocument, uploadEntityAttachment, type UploadedAttachment } from '@/src/native/files';
import { useCan } from '@/src/auth/AuthProvider';
import { validateMailAttachment } from '@/src/ui/crm/mail-attachment';
import { NoteTemplatePicker } from '@/src/ui/documents/TermsTemplatePicker';
import { useMemo, useState } from 'react';
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
  const params = useLocalSearchParams<{ to?: string; name?: string; companyId?: string; contactId?: string; opportunityId?: string; subject?: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { colors } = useTheme();
  const account = useMailAccountStatus();
  const recipients = useMailRecipients(params.companyId);
  const send = useSendMail();

  const canUpload = useCan('files.create');
  const [attachments, setAttachments] = useState<UploadedAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [to, setTo] = useState(params.to ?? '');
  const [contactId, setContactId] = useState<string | undefined>(params.contactId);
  const [cc, setCc] = useState<string[]>([]);
  const [ccManual, setCcManual] = useState('');
  const [ccError, setCcError] = useState<string | undefined>();
  const [subject, setSubject] = useState(params.subject ?? '');
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
    if (send.isPending || uploading) return;
    const error = validateMailDraft({ to, subject, body });
    if (error) {
      toast.error(error);
      return;
    }
    send.mutate(
      {
        to: to.trim(),
        cc: cc.length ? cc : undefined,
        subject: subject.trim(),
        body: body.trim(),
        companyId: params.companyId || undefined,
        contactId: contactId || undefined,
        fileIds: attachments.length ? attachments.map((item) => item.fileId) : undefined,
      },
      {
        onSuccess: () => {
          void qc.invalidateQueries({ queryKey: activityKeys.all });
          if (params.companyId) void qc.invalidateQueries({ queryKey: companyKeys.detail(params.companyId) });
          toast.success(`E-posta gönderildi · ${account.data?.email ?? 'Webmail hesabınız'} üzerinden teslim edildi.`);
          router.back();
        },
        onError: (err) => toast.error(`E-posta gönderilemedi · ${err.message || 'Webmail bağlantınızı kontrol edin.'}`),
      },
    );
  }

  const canSend = ready && !send.isPending && !uploading && Boolean(to.trim() && subject.trim() && body.trim()) && body.length <= MAIL_BODY_MAX_LENGTH;

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['bottom', 'left', 'right']}>
      <Stack.Screen options={{ title: 'Yeni e-posta', headerShown: true }} />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerClassName="gap-4 p-4 pb-10" keyboardShouldPersistTaps="handled">
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
            <TextInput
              accessibilityLabel="Mesaj"
              value={body}
              onChangeText={setBody}
              multiline
              editable={!send.isPending}
              textAlignVertical="top"
              placeholderTextColor={colors.mutedForeground}
              className="min-h-[180px] rounded-control bg-input-background px-3.5 py-3 font-inter text-base text-foreground"
            />
            <Text className={`text-right font-inter text-[10px] ${body.length > MAIL_BODY_MAX_LENGTH ? 'text-destructive' : 'text-muted-foreground'}`}>
              {body.length.toLocaleString('tr-TR')} / 10.000
            </Text>
          </View>

          {params.opportunityId ? <Card className="gap-3">
            <Text className="font-inter-semibold text-sm text-foreground">Dosya ekleri ({attachments.length}/{MAIL_MAX_ATTACHMENTS})</Text>
            <Text className="font-inter text-xs text-muted-foreground">PDF, DOCX, XLSX veya görsel. Toplam en fazla {MAIL_MAX_ATTACHMENT_BYTES / 1024 / 1024} MB. Yüklenen dosyalar fırsatın belgelerinde de saklanır.</Text>
            {attachments.map((item) => <View key={item.fileId} className="flex-row items-center gap-2">
              <Text className="flex-1 font-inter text-sm text-foreground">{item.fileName}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={`${item.fileName} ekini kaldır`} disabled={send.isPending || uploading} onPress={() => setAttachments((current) => current.filter((row) => row.fileId !== item.fileId))} className="h-11 w-11 items-center justify-center"><Ionicons name="close-circle-outline" size={22} color={colors.mutedForeground} /></Pressable>
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
    </SafeAreaView>
  );
}
