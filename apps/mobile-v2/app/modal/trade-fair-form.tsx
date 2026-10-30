import { useMemo, useRef, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { COUNTRY_OPTIONS, DISTRICTS_BY_PROVINCE, tradeFairContactCreateSchema } from '@haksan/shared';
import { useAuth, useCan } from '@/src/auth/AuthProvider';
import type { TradeFairContactBody } from '@/src/api/trade-fairs.api';
import {
  useCachedTradeFair,
  useRemoveTradeFairAttachment,
  useSaveTradeFair,
  useTradeFairAttachments,
  useTradeFairProductOptions,
  useTradeFairStaff,
  useTradeFairSummary,
} from '@/src/api/trade-fairs.hooks';
import { PROVINCE_NAMES } from '@/src/features/company-map/geo';
import { downloadAndShareFile, pickDocument, pickImage, uploadEntityAttachment, type LocalUpload } from '@/src/native/files';
import { useTheme } from '@/src/theme/theme';
import { EmptyState, Field } from '@/src/ui';
import { ModalForm, PickerField } from '@/src/ui/documents/pickers';
import { OptionSheet, type SheetOption } from '@/src/ui/meta/OptionSheet';
import { toast } from '@/src/ui/toast';
import {
  attachmentProblem,
  distinctSorted,
  emptyContactForm,
  formFromRow,
  productTypeOptions,
  staffOptions,
} from '@/src/ui/trade-fairs/tradeFairLogic';
import { CompanySelect } from '@/src/ui/select/fields';

type SheetKind = 'fair' | 'country' | 'province' | 'district' | 'category' | 'type' | 'staff';

const toOptions = (values: readonly string[]): SheetOption[] => values.map((v) => ({ value: v, label: v }));

function AttachmentButton({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className="min-h-[44px] flex-row items-center gap-1.5 rounded-control border border-border bg-card px-3 active:opacity-70"
    >
      <Ionicons name={icon} size={17} color={colors.primary} />
      <Text className="font-inter-medium text-sm text-foreground">{label}</Text>
    </Pressable>
  );
}

export default function TradeFairFormModal() {
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ id?: string; fair?: string }>();
  const { user } = useAuth();
  const isManager = Boolean(user?.roles?.includes('admin') || user?.roles?.includes('super_admin'));
  const canUpdate = useCan('trade_fairs.update') || isManager;
  const editing = useCachedTradeFair(params.id);
  const readOnly = Boolean(editing) && !canUpdate;

  const [form, setForm] = useState<TradeFairContactBody>(() =>
    editing ? formFromRow(editing) : emptyContactForm(params.fair ?? '', user?.id ?? ''),
  );
  const [pending, setPending] = useState<LocalUpload[]>([]);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [sheet, setSheet] = useState<SheetKind>('fair');
  const sheetRef = useRef<BottomSheetModal>(null);

  const summary = useTradeFairSummary(null);
  const staff = useTradeFairStaff();
  const products = useTradeFairProductOptions();
  const attachments = useTradeFairAttachments(editing?.id ?? null);
  const removeAttachment = useRemoveTradeFairAttachment(editing?.id ?? '');
  const save = useSaveTradeFair();

  const set = <K extends keyof TradeFairContactBody>(key: K, value: TradeFairContactBody[K]) => setForm((f) => ({ ...f, [key]: value }));

  const parsed = tradeFairContactCreateSchema.safeParse(form);
  const errors = useMemo(() => {
    const out: Partial<Record<string, string>> = {};
    if (!parsed.success) for (const issue of parsed.error.issues) out[String(issue.path[0])] ??= issue.message;
    return out;
  }, [parsed]);
  const err = (key: string) => (submitted ? errors[key] : undefined);

  const isTurkey = !form.country || form.country === 'Türkiye';
  const sheetConfig: Record<SheetKind, { title: string; options: SheetOption[]; selected: string | null | undefined; onSelect: (v: string) => void; create: (v: string) => string }> = {
    fair: {
      title: 'Fuar adı',
      options: toOptions((summary.data?.fairs ?? []).map((f) => f.name)),
      selected: form.fairName,
      onSelect: (v) => set('fairName', v),
      create: (v) => `"${v}" fuarını kullan`,
    },
    country: {
      title: 'Ülke',
      options: toOptions(COUNTRY_OPTIONS),
      selected: form.country,
      onSelect: (v) => setForm((f) => ({ ...f, country: v || 'Türkiye', province: '', district: '' })),
      create: (v) => `"${v}" ülkesini kullan`,
    },
    province: {
      title: 'İl',
      options: toOptions(isTurkey ? PROVINCE_NAMES : []),
      selected: form.province,
      onSelect: (v) => setForm((f) => ({ ...f, province: v, district: '' })),
      create: (v) => `"${v}" ilini kullan`,
    },
    district: {
      title: 'İlçe',
      options: toOptions(isTurkey ? [...(DISTRICTS_BY_PROVINCE[form.province ?? ''] ?? [])] : []),
      selected: form.district,
      onSelect: (v) => set('district', v),
      create: (v) => `"${v}" ilçesini kullan`,
    },
    category: {
      title: 'Ürün kategorisi',
      options: toOptions(distinctSorted((products.data ?? []).map((p) => p.category))),
      selected: form.productCategory,
      onSelect: (v) => set('productCategory', v),
      create: (v) => `"${v}" kategorisini kullan`,
    },
    type: {
      title: 'Ürün tipi',
      options: toOptions(productTypeOptions(products.data ?? [], form.productCategory)),
      selected: form.productType,
      onSelect: (v) => set('productType', v),
      create: (v) => `"${v}" tipini kullan`,
    },
    staff: {
      title: 'Görüşen',
      options: staffOptions(staff.data ?? [], editing).map((s) => ({ value: s.id, label: s.fullName })),
      selected: form.metByUserId,
      onSelect: (v) => set('metByUserId', v),
      create: () => '',
    },
  };
  const active = sheetConfig[sheet];
  const openSheet = (kind: SheetKind) => {
    if (readOnly) return;
    setSheet(kind);
    sheetRef.current?.present();
  };
  const staffName = staffOptions(staff.data ?? [], editing).find((s) => s.id === form.metByUserId)?.fullName ?? null;

  const addLocal = (local: LocalUpload | null) => {
    if (!local) return;
    const problem = attachmentProblem({ name: local.name, extension: local.extension, sizeBytes: local.sizeBytes });
    if (problem) {
      toast.error(problem);
      return;
    }
    setPending((list) => [...list, local]);
  };
  const pick = async (kind: 'camera' | 'library' | 'document') => {
    try {
      addLocal(kind === 'document' ? await pickDocument() : await pickImage(kind));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Dosya eklenemedi');
    }
  };

  const submit = async () => {
    setSubmitted(true);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Formu kontrol edin.');
      return;
    }
    setSaving(true);
    try {
      const saved = await save.mutateAsync({ id: editing?.id, body: parsed.data as TradeFairContactBody });
      const failed: string[] = [];
      for (const local of pending) {
        try {
          await uploadEntityAttachment({
            bucket: 'erp-service-documents',
            entityType: 'trade_fair_contact',
            entityId: saved.id,
            documentTypeCode: 'other',
            local,
          });
        } catch (error) {
          failed.push(error instanceof Error ? `${local.name}: ${error.message}` : local.name);
        }
      }
      if (failed.length) toast.error(`Bazı dosyalar yüklenemedi: ${failed.join(', ')}`);
      toast.success(editing ? 'Fuar kaydı güncellendi' : 'Fuar görüşmesi eklendi');
      router.back();
    } catch (error) {
      toast.error(error instanceof Error && error.message ? error.message : 'Kaydedilemedi');
    } finally {
      setSaving(false);
    }
  };

  const confirmRemoveAttachment = (fileId: string, filename: string) =>
    Alert.alert('Dosyayı sil', `${filename} dosyası silinecek.`, [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: () =>
          removeAttachment.mutate(fileId, {
            onSuccess: () => toast.success('Dosya silindi'),
            onError: (error) => toast.error(error.message || 'Dosya silinemedi'),
          }),
      },
    ]);

  if (params.id && !editing) {
    return (
      <ModalForm title="Fuar Görüşmesi" submitLabel="Kapat" onSubmit={() => router.back()}>
        <EmptyState title="Kayıt bulunamadı" hint="Listeyi yenileyip tekrar açın." />
      </ModalForm>
    );
  }

  return (
    <ModalForm
      title={editing ? 'Fuar Görüşmesi' : 'Yeni Fuar Görüşmesi'}
      submitLabel={editing ? 'Kaydet' : 'Görüşmeyi Ekle'}
      onSubmit={() => void submit()}
      loading={saving}
      disabled={readOnly}
    >
      <Text className="font-inter text-sm text-muted-foreground">Standa gelen firmayı, yetkilisini ve ilgilendiği ürünü kaydedin.</Text>
      <PickerField label="Fuar adı *" value={form.fairName || null} placeholder="Fuar seçin veya yeni ad yazın" icon="storefront-outline" onPress={() => openSheet('fair')} error={err('fairName')} disabled={readOnly} />
      <CompanySelect
        label="Firma adı *"
        value={form.companyName}
        allowCustom
        placeholder="Kayıtlı firmadan seçin veya yazın"
        disabled={readOnly}
        error={err('companyName')}
        onSelect={(item) => {
          const company = item?.data;
          set('companyName', company ? company.legalTitle : item?.label ?? '');
        }}
      />
      <Field label="Firma yetkilisi ad soyad *" value={form.contactName} onChangeText={(v) => set('contactName', v)} maxLength={200} editable={!readOnly} error={err('contactName')} />
      <Field label="Görevi" value={form.contactTitle ?? ''} onChangeText={(v) => set('contactTitle', v)} maxLength={120} placeholder="Satın alma müdürü" editable={!readOnly} />
      <Field label="Cep telefonu" value={form.mobilePhone ?? ''} onChangeText={(v) => set('mobilePhone', v)} maxLength={32} placeholder="05xx xxx xx xx" keyboardType="phone-pad" editable={!readOnly} error={err('mobilePhone')} />
      <Field label="E-posta" value={form.email ?? ''} onChangeText={(v) => set('email', v)} maxLength={254} placeholder="ornek@firma.com" keyboardType="email-address" autoCapitalize="none" editable={!readOnly} error={err('email')} />
      <PickerField label="Ülke" value={form.country || null} placeholder="Ülke seçin" icon="globe-outline" onPress={() => openSheet('country')} disabled={readOnly} />
      <PickerField label="İl" value={form.province || null} placeholder="İl seçin veya yazın" icon="location-outline" onPress={() => openSheet('province')} disabled={readOnly} />
      <PickerField
        label="İlçe"
        value={form.district || null}
        placeholder={form.province ? 'İlçe seçin veya yazın' : 'Önce il seçin'}
        icon="navigate-outline"
        onPress={() => openSheet('district')}
        disabled={readOnly}
      />
      <PickerField label="Ürün kategorisi" value={form.productCategory || null} placeholder="Kategori seçin veya yazın" icon="pricetags-outline" onPress={() => openSheet('category')} disabled={readOnly} />
      <PickerField label="Ürün tipi" value={form.productType || null} placeholder="Tip seçin veya yazın" icon="construct-outline" onPress={() => openSheet('type')} disabled={readOnly} />
      <PickerField label="Görüşen" value={staffName} placeholder="Çalışan seçin" icon="person-outline" onPress={() => openSheet('staff')} disabled={readOnly} />
      <Field
        label="Görüşülen kişi"
        value={String(form.visitorCount ?? '')}
        onChangeText={(v) => set('visitorCount', Number(v.replace(/\D/g, '')) || 0)}
        keyboardType="number-pad"
        maxLength={3}
        editable={!readOnly}
        error={err('visitorCount')}
      />
      <Field
        label="Not"
        value={form.notes ?? ''}
        onChangeText={(v) => set('notes', v)}
        maxLength={4000}
        multiline
        numberOfLines={4}
        placeholder="Görüşme notları, talep, bütçe, takip…"
        editable={!readOnly}
        style={{ minHeight: 96, textAlignVertical: 'top' }}
      />

      <View className="gap-2">
        <Text className="font-inter-medium text-xs text-muted-foreground">Fotoğraf ve dosyalar</Text>
        {(attachments.data ?? []).map((a) => (
          <View key={a.id} className="min-h-[48px] flex-row items-center gap-2 rounded-control border border-border bg-card px-3">
            <Ionicons name={a.file.mimeType.startsWith('image/') ? 'image-outline' : 'document-text-outline'} size={18} color={colors.primary} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${a.file.originalFilename} dosyasını aç`}
              onPress={() => void downloadAndShareFile(a.file.id).catch(() => toast.error('Dosya açılamadı'))}
              className="min-h-[44px] flex-1 justify-center active:opacity-60"
            >
              <Text className="font-inter text-sm text-foreground" numberOfLines={1}>{a.file.originalFilename}</Text>
            </Pressable>
            {a.file.uploadedBy === user?.id ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${a.file.originalFilename} dosyasını sil`}
                onPress={() => confirmRemoveAttachment(a.file.id, a.file.originalFilename)}
                className="h-11 w-11 items-center justify-center active:opacity-60"
              >
                <Ionicons name="trash-outline" size={18} color={colors.destructive} />
              </Pressable>
            ) : null}
          </View>
        ))}
        {pending.map((local, index) => (
          <View key={`${local.uri}-${index}`} className="min-h-[48px] flex-row items-center gap-2 rounded-control border border-dashed border-border bg-card px-3">
            <Ionicons name="attach-outline" size={18} color={colors.mutedForeground} />
            <Text className="flex-1 font-inter text-sm text-foreground" numberOfLines={1}>{local.name}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${local.name} dosyasını çıkar`}
              onPress={() => setPending((list) => list.filter((_, j) => j !== index))}
              className="h-11 w-11 items-center justify-center active:opacity-60"
            >
              <Ionicons name="close" size={18} color={colors.mutedForeground} />
            </Pressable>
          </View>
        ))}
        {!readOnly ? (
          <>
            <View className="flex-row flex-wrap gap-2">
              <AttachmentButton icon="camera-outline" label="Fotoğraf" onPress={() => void pick('camera')} />
              <AttachmentButton icon="images-outline" label="Galeri" onPress={() => void pick('library')} />
              <AttachmentButton icon="attach-outline" label="Dosya" onPress={() => void pick('document')} />
            </View>
            <Text className="font-inter text-[11px] text-muted-foreground">Kaydet'e basınca yüklenir · PDF, DOCX, XLSX, PNG, JPG, WEBP · en fazla 25 MB</Text>
          </>
        ) : null}
      </View>

      <OptionSheet
        sheetRef={sheetRef}
        title={active.title}
        options={active.options}
        selected={active.selected ?? null}
        onSelect={active.onSelect}
        searchPlaceholder={`${active.title} ara…`}
        createLabel={sheet === 'staff' ? undefined : active.create}
      />
    </ModalForm>
  );
}
