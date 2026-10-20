import { useRef, useState } from 'react';
import { Alert, Linking, Pressable, Text, View } from 'react-native';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useActivityList, useCreateActivity, useDeleteActivity, useSetProcessCheck } from '@/src/api/crm.hooks';
import type { ActivityListItem, QualificationCheck } from '@/src/api/endpoints';
import {
  useChangeOpportunityStage,
  useConvertLead,
  useDeleteOpportunityFile,
  useLinkOpportunityCompany,
  useOpportunityFiles,
  useUploadOpportunityFile,
} from '@/src/api/sales.hooks';
import { useCan } from '@/src/auth/AuthProvider';
import { formatDateTime } from '@/src/lib/format';
import { downloadAndShareFile, pickDocument } from '@/src/native/files';
import { useTheme } from '@/src/theme/theme';
import { Button, Card, Eyebrow, Field, ListRow, Loading } from '@/src/ui';
import { mailComposeHref } from '@/src/ui/crm/mail-logic';
import { toast } from '@/src/ui/toast';
import { CompanyPickerSheet } from './CompanyPickerSheet';
import { PillGroup, SalesSheet, SheetOption } from './Sheet';
import { CANCEL_REASONS, operationStageOptions, validateStageChange, type PipelineStage } from './sales-logic';

/* -------------------------------------------------------------- hızlı temas ---- */

function digitsOf(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '');
}

/** Web DecisionRail "Hızlı temas": Ara / E-posta / WhatsApp. E-posta CRM mail modalına gider. */
export function QuickContactRow({
  phone,
  email,
  companyId,
  name,
}: {
  phone: string | null | undefined;
  email: string | null | undefined;
  companyId?: string | null;
  name?: string | null;
}) {
  const router = useRouter();
  const { colors } = useTheme();
  const digits = digitsOf(phone);
  const actions: {
    key: string;
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    ready: boolean;
    missing: string;
    run: () => void;
  }[] = [
    {
      key: 'phone',
      label: 'Ara',
      icon: 'call-outline',
      ready: Boolean(digits),
      missing: 'Telefon bilgisi eksik',
      run: () => void Linking.openURL(`tel:${digits}`).catch(() => toast.error('Ara açılamadı')),
    },
    {
      key: 'email',
      label: 'E-posta',
      icon: 'mail-outline',
      ready: Boolean(email),
      missing: 'E-posta bilgisi eksik',
      run: () =>
        router.push(
          mailComposeHref({ to: email!, name: name ?? undefined, companyId: companyId ?? undefined }) as Href,
        ),
    },
    {
      key: 'whatsapp',
      label: 'WhatsApp',
      icon: 'logo-whatsapp',
      ready: Boolean(digits),
      missing: 'WhatsApp bilgisi eksik',
      run: () => void Linking.openURL(`https://wa.me/${digits}`).catch(() => toast.error('WhatsApp açılamadı')),
    },
  ];
  if (!digits && !email) {
    return <Text className="font-inter text-xs text-muted-foreground">İletişim için önce firma veya ilgili kişi bilgisi girilmeli.</Text>;
  }
  return (
    <View className="flex-row gap-2">
      {actions.map((action) => (
        <Pressable
          key={action.key}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          onPress={() => {
            if (!action.ready) {
              toast.info(action.missing);
              return;
            }
            action.run();
          }}
          className="min-h-11 flex-1 flex-row items-center justify-center gap-1.5 rounded-control border border-border bg-card px-2 active:opacity-70"
        >
          <Ionicons name={action.icon} size={17} color={action.ready ? colors.primary : colors.mutedForeground} />
          <Text className={`font-inter-medium text-xs ${action.ready ? 'text-foreground' : 'text-muted-foreground'}`}>{action.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/* ---------------------------------------------------------- lead dönüşümü ---- */

/** Lead kartı: ilk temas kaydı + fırsata (C) dönüştürme, isteğe bağlı gerekçe. */
export function LeadConversionCard({ opportunityId, title, disqualified }: { opportunityId: string; title: string; disqualified: boolean }) {
  const router = useRouter();
  const convert = useConvertLead();
  const sheetRef = useRef<BottomSheetModal>(null);
  const [reason, setReason] = useState('');

  function submit() {
    const overrideReason = reason.trim();
    convert.mutate(
      { id: opportunityId, note: 'Eski ilk temas kaydı C alanına taşındı', ...(overrideReason ? { overrideReason } : {}) },
      {
        onSuccess: () => {
          sheetRef.current?.dismiss();
          setReason('');
          toast.success('Fırsat C alanına taşındı');
        },
        onError: (error) => toast.error(`Fırsat C alanına taşınamadı · ${error.message}`),
      }
    );
  }

  return (
    <Card className="gap-3">
      <Eyebrow>Lead işlemleri</Eyebrow>
      <View className="flex-row gap-2">
        <View className="flex-1">
          <Button
            label="Temas Kaydet"
            variant="ghost"
            onPress={() =>
              router.push({ pathname: '/modal/opportunity-contact', params: { id: opportunityId, title } } as unknown as Href)
            }
          />
        </View>
        <View className="flex-1">
          <Button
            label="Fırsata dönüştür"
            trailingIcon="arrow-forward"
            disabled={disqualified || convert.isPending}
            loading={convert.isPending}
            onPress={() => sheetRef.current?.present()}
          />
        </View>
      </View>
      {disqualified ? (
        <Text className="font-inter text-xs text-muted-foreground">
          Uygun değil durumundaki fırsat C alanına taşınamaz; önce ilk temas durumunu değiştirin.
        </Text>
      ) : null}
      <SalesSheet
        ref={sheetRef}
        title="Fırsata dönüştür"
        subtitle="Kart C alanının giriş aşamasına taşınır. Eksik nitelendirme alanları için karar gerekçesi geçmişe yazılır."
      >
        <Field
          label="Dönüşüm gerekçesi"
          value={reason}
          onChangeText={setReason}
          maxLength={1000}
          multiline
          numberOfLines={3}
          placeholder="Neden bu eksiklere rağmen fırsata dönüştürülüyor?"
        />
        <Button label={convert.isPending ? 'Dönüştürülüyor…' : reason.trim() ? 'Gerekçeyle dönüştür' : 'Fırsata dönüştür'} loading={convert.isPending} onPress={submit} />
      </SalesSheet>
    </Card>
  );
}

/* ------------------------------------------------------------- firma bağla ---- */

export function CompanyLinkCard({ opportunityId, leadCompanyTitle }: { opportunityId: string; leadCompanyTitle: string | null }) {
  const router = useRouter();
  const pickerRef = useRef<BottomSheetModal>(null);
  const link = useLinkOpportunityCompany();
  const canCreateCompany = useCan('companies.create');

  return (
    <Card className="gap-3 border-warning-border bg-warning-soft">
      <View className="gap-1">
        <Text className="font-inter-semibold text-sm text-foreground">Tekliften önce firma kaydı gerekli</Text>
        <Text className="font-inter text-xs text-muted-foreground">
          İlk temas bilgileri fırsat kartında kalır. Mevcut bir firmayı bağlayın veya bu karttan yeni firma kaydını açın.
        </Text>
        {leadCompanyTitle ? (
          <Text className="font-inter-medium text-xs text-foreground">Karttaki firma adı: {leadCompanyTitle}</Text>
        ) : null}
      </View>
      <Button
        label={link.isPending ? 'Firma bağlanıyor…' : 'Mevcut firma bağla'}
        loading={link.isPending}
        onPress={() => pickerRef.current?.present()}
      />
      {canCreateCompany ? (
        <Button
          label="Yeni firma kaydı"
          variant="ghost"
          onPress={() => router.push({ pathname: '/modal/new-company', params: leadCompanyTitle ? { name: leadCompanyTitle } : {} })}
        />
      ) : null}
      <CompanyPickerSheet
        ref={pickerRef}
        title="Firma bağla"
        onSelect={(company) => {
          pickerRef.current?.dismiss();
          link.mutate(
            { id: opportunityId, companyId: company.id, createContact: true },
            {
              onSuccess: () => toast.success(`Firma satış kartına bağlandı · ${company.shortName ?? company.legalTitle}`),
              onError: (error) => toast.error(`Firma satış kartına bağlanamadı · ${error.message}`),
            }
          );
        }}
      />
    </Card>
  );
}

/* ------------------------------------------------------- operasyon aşaması ---- */

export function OperationStageCard({
  opportunityId,
  stageCode,
  stageName,
}: {
  opportunityId: string;
  stageCode: string | null;
  stageName: string | null;
}) {
  const sheetRef = useRef<BottomSheetModal>(null);
  const change = useChangeOpportunityStage();
  const [target, setTarget] = useState<PipelineStage | null>(null);
  const [reasonCode, setReasonCode] = useState<string | null>(null);
  const [changeReason, setChangeReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const options = operationStageOptions(stageCode);

  function open() {
    setTarget(null);
    setReasonCode(null);
    setChangeReason('');
    setError(null);
    sheetRef.current?.present();
  }

  function submit() {
    if (!target) return;
    const invalid = validateStageChange({ toStage: target, cancellationReasonCode: reasonCode ?? undefined, changeReason });
    if (invalid) {
      setError(invalid);
      return;
    }
    const label = options.find((o) => o.code === target)?.label ?? target;
    change.mutate(
      {
        id: opportunityId,
        body: {
          toStage: target,
          ...(target === 'cancelled'
            ? { outcome: 'cancelled' as const, cancellationReasonCode: reasonCode ?? 'cancel_other' }
            : {}),
          ...(changeReason.trim() ? { changeReason: changeReason.trim() } : {}),
        },
      },
      {
        onSuccess: () => {
          sheetRef.current?.dismiss();
          toast.success(`Operasyon aşaması güncellendi · ${label}`);
        },
        onError: (err) => setError(err.message),
      }
    );
  }

  return (
    <>
      <Card className="flex-row items-center gap-3">
        <View className="min-w-0 flex-1 gap-0.5">
          <Eyebrow>Operasyon aşaması</Eyebrow>
          <Text className="font-inter-semibold text-sm text-foreground">{stageName ?? 'Belirlenmedi'}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Operasyon aşamasını değiştir"
          onPress={open}
          className="min-h-11 items-center justify-center rounded-[10px] border border-border px-3 active:opacity-70"
        >
          <Text className="font-inter-medium text-[13px] text-primary">Değiştir</Text>
        </Pressable>
      </Card>
      <SalesSheet ref={sheetRef} title="Operasyon aşaması" subtitle="Geçiş kuralları sunucuda doğrulanır; eksik belge varsa işlem reddedilir.">
        {options.map((option) => (
          <SheetOption
            key={option.code}
            label={option.label}
            hint={option.current ? 'Mevcut aşama' : option.requires ?? undefined}
            selected={target === option.code || (target === null && option.current)}
            disabled={option.current}
            tone={option.code === 'cancelled' ? 'destructive' : undefined}
            onPress={() => {
              setTarget(option.code);
              setError(null);
            }}
          />
        ))}
        {target === 'cancelled' ? (
          <PillGroup
            label="İptal nedeni *"
            options={CANCEL_REASONS.map((r) => ({ value: r.code, label: r.name }))}
            value={reasonCode}
            onChange={setReasonCode}
            tone="destructive"
          />
        ) : null}
        {target ? (
          <Field label="Gerekçe" value={changeReason} onChangeText={setChangeReason} maxLength={1000} multiline numberOfLines={2} />
        ) : null}
        {error ? <Text accessibilityRole="alert" className="font-inter text-xs text-destructive">{error}</Text> : null}
        {target ? (
          <Button
            label={`${options.find((o) => o.code === target)?.label ?? target} aşamasına taşı`}
            variant={target === 'cancelled' ? 'destructive' : 'primary'}
            loading={change.isPending}
            onPress={submit}
          />
        ) : null}
      </SalesSheet>
    </>
  );
}

/* ------------------------------------------------------ kontrol listesi notu ---- */

export function useCheckNoteSheet(opportunityId: string) {
  const sheetRef = useRef<BottomSheetModal>(null);
  const setCheck = useSetProcessCheck();
  const [check, setCurrent] = useState<QualificationCheck | null>(null);
  const [note, setNote] = useState('');

  function open(next: QualificationCheck) {
    setCurrent(next);
    setNote(next.note ?? '');
    sheetRef.current?.present();
  }

  const sheet = (
    <SalesSheet ref={sheetRef} title="Adım notu" subtitle={check?.label}>
      <Field label="Not" value={note} onChangeText={setNote} maxLength={1000} multiline numberOfLines={3} />
      <Button
        label="Notu kaydet"
        loading={setCheck.isPending}
        onPress={() => {
          if (!check) return;
          setCheck.mutate(
            { id: opportunityId, key: check.key, body: { status: check.complete ? 'done' : 'not_done', note: note.trim() || null } },
            {
              onSuccess: () => {
                sheetRef.current?.dismiss();
                toast.success('Adım notu kaydedildi');
              },
              onError: (err) => toast.error(`Not kaydedilemedi: ${err.message}`),
            }
          );
        }}
      />
    </SalesSheet>
  );
  return { open, sheet };
}

/* ---------------------------------------------------------------- belgeler ---- */

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function OpportunityDocuments({ opportunityId }: { opportunityId: string }) {
  const canRead = useCan('files.read');
  const canCreate = useCan('files.create');
  const canDelete = useCan('files.delete');
  const files = useOpportunityFiles(opportunityId, canRead);
  const upload = useUploadOpportunityFile(opportunityId);
  const remove = useDeleteOpportunityFile(opportunityId);
  const [downloading, setDownloading] = useState<string | null>(null);

  if (!canRead) return null;
  const items = files.data?.items ?? [];

  async function pickAndUpload() {
    try {
      const local = await pickDocument();
      if (!local) return;
      upload.mutate(
        { local },
        {
          onSuccess: () => toast.success(`Belge yüklendi · ${local.name}`),
          onError: (err) => toast.error(`Belge yüklenemedi: ${err.message}`),
        }
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Dosya seçilemedi');
    }
  }

  return (
    <Card className="gap-1.5">
      <Eyebrow>Belgeler ({files.data?.total ?? 0})</Eyebrow>
      {files.isPending ? (
        <Loading />
      ) : files.error ? (
        <Text className="font-inter text-sm text-destructive">Belgeler alınamadı: {files.error.message}</Text>
      ) : items.length === 0 ? (
        <Text className="font-inter text-sm text-muted-foreground">Bu fırsata bağlı belge yok.</Text>
      ) : (
        items.map((row) => (
          <ListRow
            key={row.id}
            title={row.file.originalFilename}
            lines={[row.documentType?.name ?? null, `${formatSize(row.file.sizeBytes)} · ${formatDateTime(row.createdAt)}`, row.description]}
            icon="document-attach-outline"
            trailing={downloading === row.fileId ? 'İndiriliyor…' : undefined}
            onPress={() => {
              const actions: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] = [
                {
                  text: 'İndir / Paylaş',
                  onPress: () => {
                    setDownloading(row.fileId);
                    downloadAndShareFile(row.fileId)
                      .catch((err: unknown) => toast.error(err instanceof Error ? err.message : 'Belge indirilemedi'))
                      .finally(() => setDownloading(null));
                  },
                },
              ];
              if (canDelete) {
                actions.push({
                  text: 'Sil',
                  style: 'destructive',
                  onPress: () =>
                    Alert.alert('Belgeyi sil', `${row.file.originalFilename} kalıcı olarak silinecek.`, [
                      { text: 'Vazgeç', style: 'cancel' },
                      {
                        text: 'Sil',
                        style: 'destructive',
                        onPress: () =>
                          remove.mutate(row.fileId, {
                            onSuccess: () => toast.success('Belge silindi'),
                            onError: (err) => toast.error(`Belge silinemedi: ${err.message}`),
                          }),
                      },
                    ]),
                });
              }
              actions.push({ text: 'Vazgeç', style: 'cancel' });
              Alert.alert(row.file.originalFilename, undefined, actions);
            }}
          />
        ))
      )}
      {canCreate ? (
        <Button label="Belge yükle" variant="ghost" trailingIcon="cloud-upload-outline" loading={upload.isPending} onPress={() => void pickAndUpload()} />
      ) : null}
    </Card>
  );
}

/* ----------------------------------------------------------- aktivite akışı ---- */

const NOTE_SUBJECT_MAX = 80;

export function OpportunityActivityFeed({
  opportunityId,
  companyId,
  title,
}: {
  opportunityId: string;
  companyId: string | null;
  title: string;
}) {
  const router = useRouter();
  const canCreate = useCan('activities.create');
  const canUpdate = useCan('activities.update');
  const canDelete = useCan('activities.delete');
  const canCreateTask = useCan('tasks.create');
  const list = useActivityList({ opportunityId });
  const create = useCreateActivity();
  const remove = useDeleteActivity();
  const [note, setNote] = useState('');
  const items = list.data?.items ?? [];

  function saveNote() {
    const text = note.trim();
    if (!text) return;
    create.mutate(
      {
        opportunityId,
        ...(companyId ? { companyId } : {}),
        activityTypeCode: 'note',
        subject: text.length > NOTE_SUBJECT_MAX ? `${text.slice(0, NOTE_SUBJECT_MAX - 1)}…` : text,
        description: text,
        activityDate: new Date(),
      },
      {
        onSuccess: () => {
          setNote('');
          toast.success('Not kaydedildi');
        },
        onError: (err) => toast.error(`Not kaydedilemedi: ${err.message}`),
      }
    );
  }

  function logQuick(kind: 'outgoing_call' | 'customer_visit') {
    if (!companyId) {
      toast.info('Arama/ziyaret kaydı için önce firma bağlanmalı');
      return;
    }
    const label = kind === 'outgoing_call' ? 'Arama' : 'Ziyaret';
    create.mutate(
      {
        opportunityId,
        companyId,
        activityTypeCode: kind,
        subject: kind === 'outgoing_call' ? 'Giden Arama' : 'Müşteri Ziyareti',
        activityDate: new Date(),
      },
      {
        onSuccess: () => toast.success(`${label} kaydedildi`),
        onError: (err) => toast.error(`${label} kaydedilemedi: ${err.message}`),
      }
    );
  }

  function openActivity(activity: ActivityListItem) {
    const editable = activity.origin !== 'system';
    const actions: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] = [
      { text: 'Detayı aç', onPress: () => router.push(`/(tabs)/modules/activities/${activity.id}` as Href) },
    ];
    if (editable && canUpdate) {
      actions.push({
        text: 'Düzenle',
        onPress: () => router.push({ pathname: '/modal/activity', params: { id: activity.id } } as unknown as Href),
      });
    }
    if (editable && canDelete) {
      actions.push({
        text: 'Sil',
        style: 'destructive',
        onPress: () =>
          Alert.alert('Aktiviteyi sil', `"${activity.subject}" kalıcı olarak silinecek.`, [
            { text: 'Vazgeç', style: 'cancel' },
            {
              text: 'Sil',
              style: 'destructive',
              onPress: () =>
                remove.mutate(activity.id, {
                  onSuccess: () => toast.success('Aktivite silindi'),
                  onError: (err) => toast.error(`Aktivite silinemedi: ${err.message}`),
                }),
            },
          ]),
      });
    }
    actions.push({ text: 'Vazgeç', style: 'cancel' });
    Alert.alert(activity.subject, activity.description ?? undefined, actions);
  }

  return (
    <View className="gap-1.5">
      <View className="px-1">
        <Eyebrow>Aktiviteler ({list.data?.total ?? 0})</Eyebrow>
      </View>
      {canCreate ? (
        <Card className="gap-2">
          <Field label="Not yaz" value={note} onChangeText={setNote} maxLength={4000} multiline numberOfLines={3} placeholder="Görüşme notu, müşteri talebi, iç not…" />
          <Button label="Notu kaydet" disabled={!note.trim()} loading={create.isPending && create.variables?.activityTypeCode === 'note'} onPress={saveNote} />
          <View className="flex-row flex-wrap gap-2">
            <View className="min-w-[46%] flex-1">
              <Button label="Arama kaydet" variant="ghost" onPress={() => logQuick('outgoing_call')} />
            </View>
            <View className="min-w-[46%] flex-1">
              <Button label="Ziyaret kaydet" variant="ghost" onPress={() => logQuick('customer_visit')} />
            </View>
            <View className="min-w-[46%] flex-1">
              <Button
                label="Görüşme ekle"
                variant="ghost"
                onPress={() =>
                  router.push({
                    pathname: '/modal/activity',
                    params: { opportunityId, opportunityTitle: title, ...(companyId ? { companyId } : {}) },
                  } as unknown as Href)
                }
              />
            </View>
            {canCreateTask ? (
              <View className="min-w-[46%] flex-1">
                <Button
                  label="Takip görevi"
                  variant="ghost"
                  onPress={() =>
                    router.push({ pathname: '/modal/task', params: { opportunityId, ...(companyId ? { companyId } : {}) } } as unknown as Href)
                  }
                />
              </View>
            ) : null}
          </View>
        </Card>
      ) : null}
      {list.isPending ? (
        <Loading />
      ) : list.error ? (
        <Card>
          <Text className="font-inter text-sm text-destructive">Aktiviteler alınamadı: {list.error.message}</Text>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <Text className="text-center font-inter text-sm text-muted-foreground">Henüz aktivite yok.</Text>
        </Card>
      ) : (
        items.map((activity) => (
          <ListRow
            key={activity.id}
            title={activity.subject}
            lines={[
              [activity.type?.name, activity.createdByUser?.fullName].filter(Boolean).join(' · ') || null,
              formatDateTime(activity.activityDate),
              activity.description && activity.description !== activity.subject ? activity.description : activity.result,
            ]}
            icon={activity.type?.code === 'note' ? 'chatbox-ellipses-outline' : 'pulse-outline'}
            iconTone={activity.origin === 'system' ? 'neutral' : 'info'}
            onPress={() => openActivity(activity)}
          />
        ))
      )}
      {list.hasNextPage ? (
        <Button
          label="Daha fazla aktivite"
          variant="ghost"
          loading={list.isFetchingNextPage}
          onPress={() => void list.fetchNextPage()}
        />
      ) : null}
    </View>
  );
}
