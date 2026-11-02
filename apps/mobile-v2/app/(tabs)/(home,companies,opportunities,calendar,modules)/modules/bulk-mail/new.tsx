import { MAIL_CAMPAIGN_MAX_RECIPIENTS, MAIL_MAX_ATTACHMENTS } from '@haksan/shared';
import { useMemo, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { useHierarchyBack } from '@/src/modules/useHierarchyBack';
import { useAuth, useCan } from '@/src/auth/AuthProvider';
import { useCompanySummaryExt, useMailAccountStatus } from '@/src/api/crm-general.hooks';
import {
  useCanPickCrmRecipients,
  useCreateMailCampaign,
  useMailCampaignCandidates,
  useParseRecipientList,
} from '@/src/api/mail-campaigns.hooks';
import { useCatalogFiles } from '@/src/api/products.hooks';
import { useNoteTemplates } from '@/src/api/note-templates.hooks';
import { useDebouncedValue } from '@/src/lib/useDebouncedValue';
import { useTheme } from '@/src/theme/theme';
import { Button, Card, DetailHeader, EmptyState, ErrorState, Eyebrow, Field, Loading, SearchBar } from '@/src/ui';
import { Segmented, SmallButton, SwitchRow } from '@/src/ui/finance/kit';
import { OptionPicker } from '@/src/ui/pickers/OptionPicker';
import { useNavigationBottomInset } from '@/src/ui/LiquidGlassTabBarBackground';
import { toast } from '@/src/ui/toast';
import { isMailAccountReady } from '@/src/ui/crm/mail-logic';
import { validateMailAttachment } from '@/src/ui/crm/mail-attachment';
import { pickBase64File } from '@/src/ui/crm/pick-file';
import {
  DEFAULT_CAMPAIGN_BODY,
  addRecipients,
  capWarning,
  composeProblem,
  estimatedMinutes,
  listFileProblem,
  parseResultMessage,
  pastedListToCsv,
  recipientKey,
  toCreatePayload,
  utf8ToBase64,
  type Recipient,
} from '@/src/ui/bulk-mail/bulkMailLogic';

const MAIL_TEMPLATE_SCOPE = 'mail';
/** Mobilde tek seferde çizilen aday satırı; "Tümünü ekle" listenin tamamını alır. */
const VISIBLE_CANDIDATES = 200;
const RELATION_OPTIONS = [
  { value: 'customer', label: 'Müşteri' },
  { value: 'supplier_customer', label: 'Tedarikçi + Müşteri' },
  { value: 'supplier', label: 'Tedarikçi' },
  { value: 'competitor', label: 'Rakip' },
];
const CUSTOMER_STATUS_OPTIONS = [
  { value: 'potential', label: 'Potansiyel' },
  { value: 'active', label: 'Aktif müşteri' },
  { value: 'passive', label: 'Pasif' },
];
const LIST_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'text/comma-separated-values',
  'application/csv',
  'application/vnd.ms-excel',
];

type Attachment = { fileId: string; name: string; sizeBytes: number };
type SourceProps = { selected: ReadonlySet<string>; onAdd: (rows: Recipient[]) => void; onRemove: (email: string) => void };

function CheckRow({ checked, title, sub, onPress }: { checked: boolean; title: string; sub: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={title}
      accessibilityHint={sub || undefined}
      onPress={onPress}
      className="min-h-11 flex-row items-center gap-3 border-t border-border py-2 active:opacity-70"
    >
      <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={22} color={checked ? colors.primary : colors.mutedForeground} />
      <View className="min-w-0 flex-1">
        <Text className="font-inter-medium text-sm text-foreground" numberOfLines={1}>{title}</Text>
        {sub ? <Text className="font-inter text-xs text-muted-foreground" numberOfLines={1}>{sub}</Text> : null}
      </View>
    </Pressable>
  );
}

/** Web CrmSource: Firmalar süzgeçleriyle e-postası olan kontaklar. */
function CrmSource({ selected, onAdd, onRemove }: SourceProps) {
  const [search, setSearch] = useState('');
  const [city, setCity] = useState<string | null>(null);
  const [sector, setSector] = useState<string | null>(null);
  const [relation, setRelation] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [withCompanyEmails, setWithCompanyEmails] = useState(false);
  const term = useDebouncedValue(search.trim());
  const summary = useCompanySummaryExt('all');
  const query = {
    search: term || undefined,
    city: city ?? undefined,
    sector: sector ?? undefined,
    relationTypeCode: relation ?? undefined,
    customerStatusCode: status ?? undefined,
    includeCompanyEmails: withCompanyEmails ? ('true' as const) : undefined,
  };
  const candidates = useMailCampaignCandidates(query, true);
  const rows = useMemo<Array<Recipient & { detail?: string }>>(
    () =>
      (candidates.data?.rows ?? []).map((row) => ({
        email: row.email,
        name: row.name ?? undefined,
        companyName: row.companyName,
        companyId: row.companyId,
        contactId: row.contactId ?? undefined,
        detail: row.detail ?? undefined,
        source: 'CRM' as const,
      })),
    [candidates.data],
  );
  const addable = rows.filter((row) => !selected.has(recipientKey(row.email)));
  const visible = rows.slice(0, VISIBLE_CANDIDATES);
  const toOptions = (values: string[] | undefined) => (values ?? []).map((value) => ({ value, label: value }));

  return (
    <View className="gap-3">
      <View className="-mx-4">
        <SearchBar value={search} onChange={setSearch} placeholder="Firma ara…" />
      </View>
      <OptionPicker label="İl" value={city} placeholder="İl: tümü" options={toOptions(summary.data?.cities)} searchable clearable onChange={setCity} />
      <OptionPicker label="Sektör" value={sector} placeholder="Sektör: tümü" options={toOptions(summary.data?.sectors)} searchable clearable onChange={setSector} />
      <OptionPicker label="Firma tipi" value={relation} placeholder="Firma tipi: tümü" options={RELATION_OPTIONS} clearable onChange={setRelation} />
      <OptionPicker label="Durum" value={status} placeholder="Durum: tümü" options={CUSTOMER_STATUS_OPTIONS} clearable onChange={setStatus} />
      <SwitchRow label="Firmaların genel e-posta adreslerini de listele" value={withCompanyEmails} onChange={setWithCompanyEmails} />
      {candidates.data?.truncated ? (
        <Text className="font-inter text-xs text-warning">Çok fazla sonuç var; ilk 2.000 adres listelendi. Süzgeçleri daraltın.</Text>
      ) : null}
      {candidates.isPending ? (
        <Loading />
      ) : candidates.error ? (
        <ErrorState message={`Kontaklar yüklenemedi: ${candidates.error.message}`} onRetry={() => void candidates.refetch()} />
      ) : (
        <Card className="gap-0 px-3 py-1">
          <View className="flex-row flex-wrap items-center justify-between gap-2 py-2">
            <Text className="font-inter text-xs text-muted-foreground">
              {rows.length} e-posta adresi{rows.length > visible.length ? ` · ilk ${visible.length} gösteriliyor` : ''}
              {candidates.isFetching ? ' · yenileniyor…' : ''}
            </Text>
            <SmallButton label={`Tümünü ekle (${addable.length})`} icon="person-add-outline" disabled={!addable.length} onPress={() => onAdd(addable)} />
          </View>
          {visible.map((row) => {
            const key = recipientKey(row.email);
            const checked = selected.has(key);
            return (
              <CheckRow
                key={`${row.email}-${row.contactId ?? row.companyId ?? ''}`}
                checked={checked}
                title={row.name || row.email}
                sub={[row.name ? row.email : null, row.companyName, row.detail].filter(Boolean).join(' · ')}
                onPress={() => (checked ? onRemove(key) : onAdd([row]))}
              />
            );
          })}
          {!rows.length ? <EmptyState icon="people-outline" title="Süzgece uyan, e-postası olan kontak yok." /> : null}
        </Card>
      )}
    </View>
  );
}

type ReadList = (fileName: string, fileBase64: string, after?: () => void) => void;

/**
 * Web ExcelSource + yapıştırma: ikisi de sunucudaki parse-list ile okunur. Mutasyon
 * üst ekranda yaşar; okuma sürerken CRM sekmesine geçilse de sonuç kaybolmaz.
 */
function ListSource({ busy, read }: { busy: boolean; read: ReadList }) {
  const [pasted, setPasted] = useState('');

  const pickFile = async () => {
    try {
      const picked = await pickBase64File({ types: LIST_TYPES, fallbackMimeType: 'text/csv', validate: listFileProblem });
      if (!picked) return;
      if ('error' in picked) return toast.error(picked.error);
      read(picked.file.fileName, picked.file.fileBase64);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Dosya seçilemedi');
    }
  };

  const readPasted = () => {
    const csv = pastedListToCsv(pasted);
    if (!csv) return toast.error('Yapıştırılan metinde satır yok');
    let fileBase64: string;
    try {
      fileBase64 = utf8ToBase64(csv);
    } catch {
      return toast.error('Yapıştırılan metin okunamadı; geçersiz karakterleri silin');
    }
    read('yapistirilan-liste.csv', fileBase64, () => setPasted(''));
  };

  return (
    <View className="gap-3">
      <Text className="font-inter text-[13px] leading-[19px] text-muted-foreground">
        İlk satırda E-posta (zorunlu), Ad Soyad ve Firma başlıkları olan bir .xlsx veya .csv yükleyin. Okunan adresler doğrudan seçilenlere eklenir.
      </Text>
      <SmallButton label={busy ? 'Okunuyor…' : 'Liste yükle'} icon="document-attach-outline" disabled={busy} onPress={() => void pickFile()} />
      <Field
        label="Ya da adresleri yapıştırın (her satıra bir alıcı)"
        placeholder={'ali@firma.com; Ali Yılmaz; Firma A.Ş.\nveli@firma.com'}
        value={pasted}
        onChangeText={setPasted}
        multiline
        maxLength={200_000}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <SmallButton label="Yapıştırılan listeyi oku" icon="clipboard-outline" disabled={!pasted.trim() || busy} onPress={readPasted} />
    </View>
  );
}

/** Web Composer: alıcılar → mesaj → katalog eki → onaylı gönderim. */
export default function BulkMailComposeScreen() {
  const router = useRouter();
  const { goBack } = useHierarchyBack();
  const bottomInset = useNavigationBottomInset();
  const { colors } = useTheme();
  const { user } = useAuth();
  const canSend = useCan('mail_campaigns.create');
  const canPickCrm = useCanPickCrmRecipients();
  const account = useMailAccountStatus();
  const templates = useNoteTemplates(MAIL_TEMPLATE_SCOPE);
  const catalogs = useCatalogFiles(user?.tenantId);
  const create = useCreateMailCampaign();
  const parse = useParseRecipientList();
  const submitting = useRef(false);

  const [source, setSource] = useState<'crm' | 'list'>(canPickCrm ? 'crm' : 'list');
  const [recipients, setRecipientsState] = useState<Recipient[]>([]);
  /** Her ekleme en güncel listeden türesin (geciken liste okuması CRM seçimini ezmesin). */
  const latest = useRef<Recipient[]>([]);
  const setRecipients = (list: Recipient[]) => {
    latest.current = list;
    setRecipientsState(list);
  };
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState(DEFAULT_CAMPAIGN_BODY);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [catalogOpen, setCatalogOpen] = useState(false);

  const ready = isMailAccountReady(account.data);
  const selected = useMemo(() => new Set(recipients.map((row) => row.email)), [recipients]);
  const busy = create.isPending;

  if (!canSend) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
        <DetailHeader title="Yeni toplu mail" />
        <EmptyState icon="lock-closed-outline" title="Toplu mail gönderme yetkiniz yok." />
      </SafeAreaView>
    );
  }

  const add = (rows: Recipient[]) => {
    const next = addRecipients(latest.current, rows);
    const warning = capWarning(next.skipped);
    if (warning) toast.info(warning);
    setRecipients(next.list);
  };
  const remove = (email: string) => setRecipients(latest.current.filter((row) => row.email !== email));
  const readList: ReadList = (fileName, fileBase64, after) =>
    parse.mutate(
      { fileName, fileBase64 },
      {
        onSuccess: (result) => {
          add(result.rows.map((row) => ({ ...row, source: 'Liste' as const })));
          toast.success(parseResultMessage(result));
          after?.();
        },
        onError: (error) => toast.error(`Liste okunamadı: ${error.message}`),
      },
    );

  const toggleCatalog = (file: Attachment) => {
    if (attachments.some((row) => row.fileId === file.fileId)) {
      setAttachments((current) => current.filter((row) => row.fileId !== file.fileId));
      return;
    }
    const extension = file.name.split('.').pop() ?? '';
    const problem = validateMailAttachment(attachments, { sizeBytes: file.sizeBytes, extension });
    if (problem) return toast.error(problem);
    setAttachments((current) => [...current, file]);
  };

  const submit = () => {
    if (submitting.current) return;
    submitting.current = true;
    create.mutate(toCreatePayload({ subject, body, fileIds: attachments.map((row) => row.fileId), recipients }), {
      onSuccess: (created) => {
        toast.success(`Toplu mail sıraya alındı · ${created.recipients.length} alıcı · arka planda gönderiliyor`);
        router.replace(`/modules/bulk-mail/${encodeURIComponent(created.id)}` as Href);
      },
      onError: (error) => toast.error(`Toplu mail başlatılamadı: ${error.message}`),
      onSettled: () => {
        submitting.current = false;
      },
    });
  };

  const confirm = () => {
    const problem = composeProblem({ ready, recipients: recipients.length, subject, body });
    if (problem) return toast.error(problem);
    Alert.alert(
      `${recipients.length} alıcıya gönderilsin mi?`,
      `Her alıcıya ayrı e-posta, ${account.data?.email ?? 'webmail hesabınızdan'} gider. Gönderim arka planda yaklaşık ${estimatedMinutes(recipients.length)} dakika sürer; ret listesindekiler atlanır.`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'Gönderimi başlat', onPress: submit },
      ],
    );
  };

  const catalogRows = (catalogs.data ?? []).filter((row) => row.file);

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <DetailHeader title="Yeni toplu mail" subtitle="Alıcıları seçin, mesajı yazın, gerekirse genel katalog ekleyin." />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerClassName="gap-4 px-4 pt-4"
          contentContainerStyle={{ paddingBottom: bottomInset + 32, width: '100%', maxWidth: 720, alignSelf: 'center' }}
          keyboardShouldPersistTaps="handled"
        >
          {account.data && !ready ? (
            <View accessibilityRole="alert" className="flex-row items-start gap-2 rounded-control border border-warning-border bg-warning-soft px-3 py-2.5">
              <Ionicons name="warning-outline" size={18} color={colors.warning} />
              <Text className="flex-1 font-inter text-xs text-foreground">
                Gönderici hesabı hazır değil. Ayarlar &gt; Webmail bölümünden kurumsal adresinizi bağlayın.
              </Text>
            </View>
          ) : account.error ? (
            <Text className="font-inter text-xs text-destructive">Gönderici hesabı kontrol edilemedi: {account.error.message}</Text>
          ) : null}

          <Eyebrow>1 · Alıcılar</Eyebrow>
          {canPickCrm ? (
            <Segmented
              label="Kaynak"
              value={source}
              options={[
                { value: 'crm', label: 'CRM kontakları' },
                { value: 'list', label: 'Excel / CSV / yapıştır' },
              ]}
              onChange={setSource}
            />
          ) : null}
          {source === 'crm' && canPickCrm ? <CrmSource selected={selected} onAdd={add} onRemove={remove} /> : <ListSource busy={parse.isPending} read={readList} />}

          <Card className="gap-2">
            <View className="flex-row items-center justify-between gap-2">
              <Text accessibilityLiveRegion="polite" className="font-inter text-sm text-foreground">
                <Text className="font-inter-semibold">{recipients.length}</Text> / {MAIL_CAMPAIGN_MAX_RECIPIENTS} alıcı seçildi
              </Text>
              <SmallButton label="Temizle" icon="close-outline" disabled={!recipients.length} onPress={() => setRecipients([])} />
            </View>
            {recipients.length ? (
              <View className="flex-row flex-wrap gap-1.5">
                {recipients.map((row) => (
                  <View key={row.email} className="max-w-full flex-row items-center gap-1 rounded-full border border-border bg-card-subtle py-0.5 pl-2.5 pr-0.5">
                    <Text className="shrink font-inter text-xs text-foreground" numberOfLines={1}>
                      {row.name ? `${row.name} · ` : ''}
                      {row.email}
                    </Text>
                    <Text className="font-inter text-[10px] text-muted-foreground">{row.source}</Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${row.email} çıkar`}
                      onPress={() => remove(row.email)}
                      hitSlop={8}
                      className="h-8 w-8 items-center justify-center rounded-full active:opacity-60"
                    >
                      <Ionicons name="close" size={14} color={colors.mutedForeground} />
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : (
              <Text className="py-2 text-center font-inter text-xs text-muted-foreground">Yukarıdan alıcı ekleyin.</Text>
            )}
          </Card>

          <Eyebrow>2 · Mesaj</Eyebrow>
          <Field label="Konu" placeholder="Konu (ör. 2026 Ürün Kataloğumuz)" value={subject} onChangeText={setSubject} maxLength={255} />
          {templates.data?.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerClassName="gap-2">
              {templates.data.map((template) => (
                <SmallButton
                  key={template.id}
                  label={template.title}
                  icon="document-text-outline"
                  onPress={() => setBody(template.body)}
                />
              ))}
            </ScrollView>
          ) : null}
          <Field label="Mesaj" value={body} onChangeText={setBody} multiline maxLength={10_000} className="min-h-48" />
          <Text className="font-inter text-[11px] leading-[16px] text-muted-foreground">
            {'{{ad}}'} alıcının adıyla, {'{{firma}}'} firma adıyla dolar (boşsa kaldırılır). İmzanız ve her mailin altına "abonelikten çık" bağlantısı otomatik eklenir; çıkan adres ret listesine düşer.
          </Text>

          <View className="flex-row flex-wrap items-center justify-between gap-2">
            <Eyebrow>3 · Katalog eki (isteğe bağlı)</Eyebrow>
            <SmallButton
              label={catalogOpen ? 'Kataloğu kapat' : 'Katalog ekle'}
              icon="attach-outline"
              disabled={!catalogOpen && attachments.length >= MAIL_MAX_ATTACHMENTS}
              onPress={() => setCatalogOpen((open) => !open)}
            />
          </View>
          {attachments.map((file) => (
            <View key={file.fileId} className="min-h-11 flex-row items-center gap-2 rounded-control border border-border bg-card-subtle px-3">
              <Ionicons name="attach-outline" size={16} color={colors.mutedForeground} />
              <Text className="flex-1 font-inter-medium text-xs text-foreground" numberOfLines={1}>{file.name}</Text>
              <Text className="font-inter text-xs text-muted-foreground">{(file.sizeBytes / 1048576).toFixed(1)} MB</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${file.name} ekini kaldır`}
                onPress={() => toggleCatalog(file)}
                className="h-11 w-11 items-center justify-center active:opacity-60"
              >
                <Ionicons name="close-circle-outline" size={20} color={colors.mutedForeground} />
              </Pressable>
            </View>
          ))}
          {catalogOpen ? (
            catalogs.isPending ? (
              <Loading />
            ) : catalogs.error ? (
              <ErrorState message={`Kataloglar yüklenemedi: ${catalogs.error.message}`} onRetry={() => void catalogs.refetch()} />
            ) : !catalogRows.length ? (
              <EmptyState icon="library-outline" title="Kütüphanede katalog yok." />
            ) : (
              <Card className="gap-0 px-3 py-1">
                {catalogRows.map((row) => {
                  const file = row.file!;
                  return (
                    <CheckRow
                      key={row.id}
                      checked={attachments.some((item) => item.fileId === file.id)}
                      title={file.originalFilename}
                      sub={`${(file.sizeBytes / 1048576).toFixed(1)} MB`}
                      onPress={() => toggleCatalog({ fileId: file.id, name: file.originalFilename, sizeBytes: file.sizeBytes })}
                    />
                  );
                })}
              </Card>
            )
          ) : null}

          <View className="flex-row gap-3 border-t border-border pt-4">
            <View className="flex-1">
              <Button label="Vazgeç" variant="ghost" disabled={busy} onPress={goBack} />
            </View>
            <View className="flex-[2]">
              <Button
                label={busy ? 'Başlatılıyor…' : `${recipients.length} alıcıya gönder`}
                loading={busy}
                disabled={!ready || busy || !recipients.length || !subject.trim() || !body.trim()}
                onPress={confirm}
              />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
