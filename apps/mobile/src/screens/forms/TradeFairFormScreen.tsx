import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { COUNTRY_OPTIONS, DISTRICTS_BY_PROVINCE, TRADE_FAIR_NOTE_OR_ATTACHMENT_MESSAGE, tradeFairContactCreateSchema } from '@haksan/shared';
import {
  fileService,
  productService,
  tradeFairService,
  type TradeFairContactBody,
  type TradeFairContactDTO,
} from '@/src/api/services';
import { ApiError } from '@/src/api/apiClient';
import { useAuth } from '@/src/auth/AuthProvider';
import { tradeFairCache, tradeFairDraft } from '@/src/screens/TradeFairsScreen';
import { normalizeList } from '@/src/modules/registry';
import { Button } from '@/src/ui/Button';
import { CompanyPicker } from '@/src/ui/CompanyPicker';
import { FormPageLayout } from '@/src/ui/FormPageLayout';
import { Input } from '@/src/ui/Input';
import { OptionPicker, type PickerOption } from '@/src/ui/OptionPicker';
import { SectionTitle } from '@/src/ui/SectionTitle';
import { colors, fonts, radius, spacing, typography } from '@/src/theme/tokens';

const ENTITY = 'trade_fair_contact' as const;
const MAX_BYTES = 25 * 1024 * 1024;
const IMAGE_EXT: Record<string, 'jpg' | 'png' | 'webp'> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
// Web ile aynı izin listesi; tip dosya adındaki uzantıdan türetilir (sistem seçicisinin bildirdiği
// tip, ör. application/vnd.ms-excel, sunucunun listesine uymayabilir).
const DOC_EXT_TO_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};
const fileExt = (name: string) => name.split('.').pop()?.toLocaleLowerCase('tr-TR') ?? '';

/** Kaydedince yüklenecek ek: kamera/galeri fotoğrafı ya da belge. */
type Photo = { uri: string; mimeType: string; fileName: string; extension: string };
type Attachment = { id: string; fileId: string; filename: string; mimeType: string; url?: string };

const options = (values: readonly string[]): PickerOption[] => values.map((v) => ({ value: v, label: v }));

const emptyForm = (fairName = '', metByUserId: string | null = null, departmentId: string | null = null): TradeFairContactBody => ({
  fairName,
  companyName: '',
  contactName: '',
  contactTitle: '',
  mobilePhone: '',
  email: '',
  country: 'Türkiye',
  province: '',
  district: '',
  productCategory: '',
  productType: '',
  productModelIds: [],
  notes: '',
  metByUserId,
  departmentId,
  visitorCount: 1,
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
/** Yükleme uçları dakikada birkaç istekle sınırlı (sunucu kuralı); sınıra takılan fotoğraf pencere açılınca yeniden denenir. */
const RATE_LIMIT_WAIT_MS = 20_000;
const RATE_LIMIT_RETRIES = 4;
const isRateLimited = (e: unknown) =>
  (e instanceof ApiError && e.status === 429) || /\b429\b|too many/i.test(e instanceof Error ? e.message : '');

/** Fotoğrafı ya da belgeyi fuar kaydına yükleyip bağlar (imzalı yükleme → içerik → bağlantı). */
async function uploadPhoto(recordId: string, photo: Photo) {
  const blob = await (await fetch(photo.uri)).blob();
  if (blob.size > MAX_BYTES) throw new Error(`${photo.fileName}: dosya 25 MB'ı aşamaz.`);
  const up = await fileService.signedUpload({
    // Web ile aynı klasör: fuar ekleri genel belge klasöründe.
    bucket: 'erp-service-documents',
    entityType: ENTITY,
    entityId: recordId,
    filename: photo.fileName,
    mimeType: photo.mimeType as 'image/jpeg',
    extension: photo.extension as 'jpg',
    sizeBytes: blob.size,
  });
  await fileService.uploadBinary(up, blob, photo.mimeType);
  await fileService.link({ fileId: up.fileId, entityType: ENTITY, entityId: recordId, documentTypeCode: 'other' });
}

export function TradeFairFormScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const { user, hasRole } = useAuth();
  const permissions = user?.permissions ?? [];
  const isManager = hasRole('admin') || hasRole('super_admin');
  // Kayıt listeden gelir (bkz. tradeFairCache); id bilinip kayıt yoksa (ör. derin
  // bağlantı) yeni kayıt formuna düşmek yerine geri dönülür.
  const editing = useMemo<TradeFairContactDTO | null>(() => (params.id ? tradeFairCache.get(params.id) ?? null : null), [params.id]);
  const missing = !!params.id && !editing;
  useEffect(() => {
    if (!missing) return;
    Alert.alert('Kayıt bulunamadı', 'Fuar listesini yenileyip tekrar açın.');
    router.back();
  }, [missing]);
  const canSave = isManager || permissions.includes(editing ? 'trade_fairs.update' : 'trade_fairs.create');
  const canDelete = !!editing && (isManager || (permissions.includes('trade_fairs.delete') && editing.createdBy === user?.id));

  const [form, setForm] = useState<TradeFairContactBody>(() => {
    // Departman zorunlu; kullanıcının birincil departmanı önerilir.
    const primaryDepartment = user?.departments?.find((d) => d.isPrimary)?.id ?? user?.departments?.[0]?.id ?? null;
    if (!editing) return emptyForm(tradeFairDraft.fairName, user?.id ?? null, primaryDepartment);
    const base = emptyForm();
    return {
      ...(Object.fromEntries(
        Object.keys(base).map((k) => [k, (editing as Record<string, unknown>)[k] ?? (base as Record<string, unknown>)[k]]),
      ) as TradeFairContactBody),
      productModelIds: editing.products.map((p) => p.id),
    };
  });
  // Sayı alanı ham metinle tutulur; boşaltınca "0" belirmesin.
  const [visitorText, setVisitorText] = useState(String(editing?.visitorCount ?? 1));
  // Seçili ürünlerin adları (sunucudan gelenler + bu ekranda eklenenler).
  const [productNames, setProductNames] = useState<Record<string, string>>(
    () => Object.fromEntries((editing?.products ?? []).map((p) => [p.id, p.name])),
  );
  // Yalnız kontak da oluştuysa tamamlanmış sayılır; firma açılıp kontak düştüyse
  // "Firmalara ekle" yeniden basılabilir, sunucu aynı firmayla devam eder.
  const [linked, setLinked] = useState<{ companyId: string; name: string | null } | null>(
    editing?.companyId && editing.contactId ? { companyId: editing.companyId, name: editing.linkedCompanyName ?? null } : null,
  );
  const divisions = user?.divisions ?? [];
  const [divisionId, setDivisionId] = useState(divisions.find((d) => d.isPrimary)?.id ?? divisions[0]?.id ?? '');
  const [adding, setAdding] = useState(false);
  const canAddToCompanies = !!editing && (isManager || permissions.includes('contacts.create'));
  const canCreateCompany = isManager || permissions.includes('companies.create');
  const [fairs, setFairs] = useState<string[]>([]);
  const [staff, setStaff] = useState<Array<{ id: string; fullName: string }>>([]);
  const [departmentList, setDepartmentList] = useState<Array<{ id: string; name: string }>>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploadNote, setUploadNote] = useState<string | null>(null);

  const set = <K extends keyof TradeFairContactBody>(key: K, value: TradeFairContactBody[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  useEffect(() => {
    tradeFairService.summary().then((s) => setFairs(s.fairs.map((f) => f.name))).catch(() => undefined);
    tradeFairService.staff().then(setStaff).catch(() => undefined);
    tradeFairService.departments().then(setDepartmentList).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!editing) return;
    let alive = true;
    (async () => {
      const res = await fileService.links({ entityType: ENTITY, entityId: editing.id, pageSize: 50 });
      const list: Attachment[] = res.data.map((l: any) => ({
        id: l.id,
        fileId: l.file.id,
        filename: l.file.originalFilename,
        mimeType: l.file.mimeType,
      }));
      if (alive) setAttachments(list);
      for (const item of list.filter((a) => a.mimeType.startsWith('image/'))) {
        const signed = await fileService.signedDownload(item.fileId).catch(() => null);
        if (alive && signed) setAttachments((cur) => cur.map((a) => (a.id === item.id ? { ...a, url: signed.downloadUrl } : a)));
      }
    })().catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [editing]);

  const isTurkey = form.country === 'Türkiye';
  const provinceOptions = useMemo(() => (isTurkey ? options(Object.keys(DISTRICTS_BY_PROVINCE)) : []), [isTurkey]);
  const districtOptions = useMemo(
    () => (isTurkey && form.province ? options(DISTRICTS_BY_PROVINCE[form.province] ?? []) : []),
    [isTurkey, form.province],
  );
  // Görüşen sonradan silindiyse aktif listede yok; adıyla gösterilir.
  const staffOptions = useMemo(() => {
    const list = staff.map((s) => ({ value: s.id, label: s.fullName }));
    if (editing?.metByUserId && !staff.some((s) => s.id === editing.metByUserId)) {
      list.push({ value: editing.metByUserId, label: `${editing.metByName ?? 'Silinmiş kullanıcı'} (ayrıldı)` });
    }
    return list;
  }, [staff, editing]);
  // Kayıttaki departman silinmişse listede yoksa da adıyla görünsün.
  const departmentOptions = useMemo(() => {
    const list = departmentList.map((d) => ({ value: d.id, label: d.name }));
    if (editing?.departmentId && !departmentList.some((d) => d.id === editing.departmentId)) {
      list.push({ value: editing.departmentId, label: editing.departmentName ?? 'Silinmiş departman' });
    }
    return list;
  }, [departmentList, editing]);
  const metByLabel = staffOptions.find((s) => s.value === form.metByUserId)?.label ?? null;

  const searchProducts = useCallback(async (term: string): Promise<PickerOption[]> => {
    const res = await productService.list({ search: term || undefined, pageSize: 30 });
    return normalizeList(res).map((p: any) => ({
      value: String(p.id),
      label: String(p.fullName ?? [p.brand?.name, p.modelCode].filter(Boolean).join(' ')),
      hint: [p.category?.name, p.productType?.name].filter(Boolean).join(' · ') || undefined,
      // Kategori boşsa doldurmak için taşınır.
      category: p.category?.name ?? '',
    })) as PickerOption[];
  }, []);

  const addPhotos = async (source: 'camera' | 'library') => {
    // Galeri sistem seçicisiyle açılır, izin istemez; yalnız kamera izin ister.
    if (source === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('İzin gerekli', 'Kamera erişimi verin.');
        return;
      }
    }
    const opts: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      quality: 0.7,
      allowsMultipleSelection: source === 'library',
      // iPhone galerisi HEIC tutar; sunucu HEIC kabul etmez. "Compatible" iOS'a
      // JPEG'e çevirtir (quality tek başına çevirmiyor).
      preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    };
    const res = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (res.canceled) return;
    const picked: Photo[] = [];
    let rejected = 0;
    for (const asset of res.assets) {
      const mimeType = asset.mimeType ?? 'image/jpeg';
      if (!IMAGE_EXT[mimeType]) {
        rejected += 1;
        continue;
      }
      picked.push({
        uri: asset.uri,
        mimeType,
        extension: IMAGE_EXT[mimeType],
        fileName: asset.fileName ?? `fuar-${Date.now()}.${IMAGE_EXT[mimeType]}`,
      });
    }
    if (rejected) Alert.alert('Desteklenmeyen fotoğraf', `${rejected} fotoğraf eklenmedi; JPG, PNG veya WEBP seçin.`);
    setPhotos((cur) => [...cur, ...picked]);
  };

  /** PDF, Word, Excel ya da görsel; birden çok seçilebilir. */
  const addDocuments = async () => {
    const res = await DocumentPicker.getDocumentAsync({
      type: [...new Set(Object.values(DOC_EXT_TO_MIME))],
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (res.canceled) return;
    const picked: Photo[] = [];
    const rejected: string[] = [];
    for (const asset of res.assets) {
      const extension = fileExt(asset.name);
      const mimeType = DOC_EXT_TO_MIME[extension];
      if (!mimeType || (asset.size ?? 0) > MAX_BYTES) {
        rejected.push(asset.name);
        continue;
      }
      picked.push({ uri: asset.uri, mimeType, extension, fileName: asset.name });
    }
    if (rejected.length) {
      Alert.alert('Eklenemeyen dosya', `${rejected.join(', ')}\nPDF, DOCX, XLSX, PNG, JPG veya WEBP; dosya başına en fazla 25 MB.`);
    }
    setPhotos((cur) => [...cur, ...picked]);
  };

  const submit = async () => {
    // Web ve API ile aynı şema: mobilde geçen form sunucuda da geçer.
    const parsed = tradeFairContactCreateSchema.safeParse(form);
    if (!parsed.success) {
      Alert.alert('Eksik bilgi', parsed.error.issues[0]?.message ?? 'Formu kontrol edin.');
      return;
    }
    // Not ya da fotoğraf (yeni seçilen veya kayıtta var olan) zorunlu; ikisi birden gerekmez.
    if (!form.notes?.trim() && photos.length === 0 && attachments.length === 0) {
      Alert.alert('Eksik bilgi', TRADE_FAIR_NOTE_OR_ATTACHMENT_MESSAGE);
      return;
    }
    setSaving(true);
    try {
      const body = parsed.data as TradeFairContactBody;
      const saved = editing ? await tradeFairService.update(editing.id, body) : await tradeFairService.create(body);
      const failed: string[] = [];
      for (const [index, photo] of photos.entries()) {
        const step = `${index + 1}/${photos.length}`;
        for (let attempt = 0; ; attempt += 1) {
          setUploadNote(`Ek yükleniyor ${step}…`);
          try {
            await uploadPhoto(saved.id, photo);
            break;
          } catch (e) {
            if (isRateLimited(e) && attempt < RATE_LIMIT_RETRIES) {
              setUploadNote(`Yükleme sınırı: ${step} için ${RATE_LIMIT_WAIT_MS / 1000} sn bekleniyor…`);
              await sleep(RATE_LIMIT_WAIT_MS);
              continue;
            }
            failed.push(e instanceof Error ? e.message : photo.fileName);
            break;
          }
        }
      }
      setUploadNote(null);
      if (failed.length) Alert.alert('Bazı ekler yüklenemedi', failed.join('\n'));
      router.back();
    } catch (e) {
      Alert.alert('Kaydedilemedi', e instanceof Error ? e.message : 'İstek başarısız oldu.');
    } finally {
      setSaving(false);
      setUploadNote(null);
    }
  };

  /** Fuar kaydını Firmalar'a ekler: `companyId` ile mevcut firmaya, yoksa yeni firma. */
  const addToCompanies = async (companyId?: string) => {
    // Çift istek (düğme + firma seçici) ikinci kontağı açmasın.
    if (!editing || adding) return;
    setAdding(true);
    try {
      const updated = await tradeFairService.addToCompanies(
        editing.id,
        companyId ? { companyId } : { divisionIds: divisionId ? [divisionId] : undefined },
      );
      tradeFairCache.set(updated.id, { ...editing, ...updated });
      setLinked({ companyId: updated.companyId!, name: updated.linkedCompanyName ?? editing.companyName });
      Alert.alert("Firmalar'a eklendi", `${editing.companyName} · ${editing.contactName}`);
    } catch (e) {
      const details = e instanceof ApiError ? (e.details as { duplicateCompanyId?: string; accessRequestId?: string } | undefined) : undefined;
      // Aynı ünvanlı firma bu bölümde varsa ona bağlamayı öner; başka bölümdeyse
      // sunucu erişim talebi açar ve firma henüz görünmez, yalnız mesaj gösterilir.
      if (details?.duplicateCompanyId && !details.accessRequestId) {
        const duplicateId = details.duplicateCompanyId;
        Alert.alert('Bu ünvanla firma zaten kayıtlı', 'Yetkiliyi mevcut firmaya kontak olarak ekleyelim mi?', [
          { text: 'Vazgeç', style: 'cancel' },
          { text: 'Mevcut firmaya ekle', onPress: () => void addToCompanies(duplicateId) },
        ]);
      } else {
        Alert.alert('Firmalara eklenemedi', e instanceof Error ? e.message : 'İstek başarısız oldu.');
      }
    } finally {
      setAdding(false);
    }
  };

  const confirmDelete = () => {
    if (!editing) return;
    Alert.alert('Fuar kaydını sil', `${editing.companyName} · ${editing.contactName} kaydı silinecek.`, [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: () =>
          void tradeFairService
            .remove(editing.id)
            .then(() => router.back())
            .catch((e) => Alert.alert('Silinemedi', e instanceof Error ? e.message : 'İstek başarısız oldu.')),
      },
    ]);
  };

  return (
    <FormPageLayout title={editing ? 'Fuar Görüşmesi' : 'Yeni Fuar Görüşmesi'} subtitle={editing?.fairName}>
      <View pointerEvents={canSave ? 'auto' : 'none'} style={styles.section}>
        <OptionPicker
          label="Fuar adı *"
          display={form.fairName}
          placeholder="Fuar seçin veya yeni ad yazın"
          options={options(fairs)}
          allowCustom
          onSelect={(o) => set('fairName', o?.value ?? '')}
        />

        <SectionTitle title="Firma ve yetkili" />
        <Input label="Firma adı *" value={form.companyName} onChangeText={(v) => set('companyName', v)} maxLength={255} />
        <Input label="Firma yetkilisi ad soyad *" value={form.contactName} onChangeText={(v) => set('contactName', v)} maxLength={200} />
        <Input label="Görevi" value={form.contactTitle ?? ''} onChangeText={(v) => set('contactTitle', v)} placeholder="Satın alma müdürü" maxLength={120} />
        <Input
          label="Cep telefonu"
          value={form.mobilePhone ?? ''}
          onChangeText={(v) => set('mobilePhone', v)}
          keyboardType="phone-pad"
          placeholder="05xx xxx xx xx"
          maxLength={32}
        />
        <Input
          label="E-posta"
          value={form.email ?? ''}
          onChangeText={(v) => set('email', v)}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="ornek@firma.com"
          maxLength={254}
        />

        <SectionTitle title="Konum" />
        <OptionPicker
          label="Ülke"
          display={form.country}
          options={options(COUNTRY_OPTIONS)}
          allowCustom
          onSelect={(o) => setForm((f) => ({ ...f, country: o?.value ?? 'Türkiye', province: '', district: '' }))}
        />
        <OptionPicker
          label="İl"
          display={form.province}
          placeholder="İl seçin veya yazın"
          options={provinceOptions}
          allowCustom
          clearLabel="Boş bırak"
          onSelect={(o) => setForm((f) => ({ ...f, province: o?.value ?? '', district: '' }))}
        />
        <OptionPicker
          label="İlçe"
          display={form.district}
          placeholder={form.province ? 'İlçe seçin veya yazın' : 'Önce il seçin'}
          options={districtOptions}
          allowCustom
          clearLabel="Boş bırak"
          onSelect={(o) => set('district', o?.value ?? '')}
        />

        <SectionTitle title="Ürün" subtitle="Hepsi isteğe bağlı; birden çok CRM ürünü seçilebilir" />
        {form.productModelIds.length > 0 ? (
          <View style={styles.chips}>
            {form.productModelIds.map((id) => (
              <View key={id} style={styles.chip}>
                <Text style={styles.chipText} numberOfLines={1}>{productNames[id] ?? 'Seçili ürün'}</Text>
                <Pressable
                  hitSlop={8}
                  accessibilityLabel={`${productNames[id] ?? 'Ürün'} ürününü çıkar`}
                  onPress={() => setForm((f) => ({ ...f, productModelIds: f.productModelIds.filter((x) => x !== id) }))}
                >
                  <Ionicons name="close" size={14} color={colors.textMuted} />
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}
        <OptionPicker
          label="CRM ürünü ekle"
          display={null}
          placeholder={form.productModelIds.length ? 'Başka ürün ekle' : "CRM'den ürün seçin (boş bırakılabilir)"}
          onSearch={searchProducts}
          onSelect={(o) => {
            if (!o || form.productModelIds.includes(o.value)) return;
            const extra = o as PickerOption & { category?: string };
            setProductNames((cur) => ({ ...cur, [o.value]: o.label }));
            // Kategori boşsa ilk üründen doldurulur; elle yazılanın üstüne yazılmaz.
            setForm((f) => ({
              ...f,
              productModelIds: [...f.productModelIds, o.value],
              productCategory: f.productCategory || extra.category || '',
            }));
          }}
        />
        <Input label="Ürün kategorisi" value={form.productCategory ?? ''} onChangeText={(v) => set('productCategory', v)} maxLength={128} />

        <SectionTitle title="Görüşme" />
        <OptionPicker
          label="Departman *"
          display={departmentOptions.find((d) => d.value === form.departmentId)?.label ?? null}
          placeholder="Departman seçin"
          options={departmentOptions}
          onSelect={(o) => o && set('departmentId', o.value)}
        />
        <OptionPicker
          label="Görüşen"
          display={metByLabel}
          placeholder="Çalışan seçin"
          options={staffOptions}
          onSelect={(o) => set('metByUserId', o?.value ?? null)}
        />
        <Input
          label="Görüşülen kişi sayısı"
          value={visitorText}
          onChangeText={(v) => {
            const digits = v.replace(/\D/g, '');
            setVisitorText(digits);
            // Boş bırakılırsa 0 → şema "en az 1" diye uyarır.
            set('visitorCount', Number(digits) || 0);
          }}
          keyboardType="number-pad"
          maxLength={3}
        />
        <Input
          label={form.notes?.trim() || photos.length || attachments.length ? 'Not' : 'Not (ya da fotoğraf/dosya ekleyin)'}
          value={form.notes ?? ''}
          onChangeText={(v) => set('notes', v)}
          placeholder="Görüşme notları, talep, bütçe, takip…"
          multiline
          maxLength={4000}
          style={styles.notes}
        />
      </View>

      <SectionTitle title="Fotoğraf ve dosyalar" subtitle="Birden çok eklenebilir" />
      <View style={styles.photos}>
        {attachments.map((a) =>
          a.url ? (
            <Image key={a.id} source={{ uri: a.url }} style={styles.thumb} accessibilityLabel={a.filename} />
          ) : (
            <View key={a.id} style={[styles.thumb, styles.fileThumb]}>
              <Ionicons name="document-outline" size={22} color={colors.primary} />
            </View>
          ),
        )}
        {photos.map((p, i) => (
          <View key={`${p.uri}-${i}`}>
            {p.mimeType.startsWith('image/') ? (
              <Image source={{ uri: p.uri }} style={styles.thumb} />
            ) : (
              <View style={[styles.thumb, styles.fileThumb]}>
                <Ionicons name="document-text-outline" size={22} color={colors.primary} />
                <Text style={styles.fileName} numberOfLines={2}>{p.fileName}</Text>
              </View>
            )}
            <Pressable
              style={styles.remove}
              onPress={() => setPhotos((cur) => cur.filter((_, j) => j !== i))}
              accessibilityLabel={`${p.fileName} ekini çıkar`}
              hitSlop={8}
            >
              <Ionicons name="close" size={14} color="#fff" />
            </Pressable>
          </View>
        ))}
      </View>
      {canSave ? (
        <View style={styles.row}>
          <Button title="Kamera" variant="secondary" style={styles.flex} onPress={() => void addPhotos('camera')} />
          <Button title="Galeri" variant="secondary" style={styles.flex} onPress={() => void addPhotos('library')} />
          <Button title="Dosya" variant="secondary" style={styles.flex} onPress={() => void addDocuments()} />
        </View>
      ) : null}
      {photos.length > 0 ? (
        <Text style={styles.hint}>Ekler Kaydet'e basınca yüklenir · PDF, DOCX, XLSX, PNG, JPG, WEBP · dosya başına en fazla 25 MB.</Text>
      ) : null}

      {editing ? (
        <View style={styles.companyBox}>
          <SectionTitle title="Firmalar" />
          {linked ? (
            <>
              <Text style={styles.hint}>Firmalar'a eklendi: {linked.name ?? 'firma'}</Text>
              <Button title="Firmayı aç" variant="secondary" onPress={() => router.push(`/modules/customers/${linked.companyId}`)} />
            </>
          ) : canAddToCompanies ? (
            <>
              <Text style={styles.hint}>Bu firma henüz Firmalar listesinde değil. Yetkili, firmanın kontağı olarak eklenir.</Text>
              {canCreateCompany ? (
                <>
                  {divisions.length > 1 ? (
                    <OptionPicker
                      label="Yeni firmanın bölümü"
                      display={divisions.find((d) => d.id === divisionId)?.name ?? null}
                      options={divisions.map((d) => ({ value: d.id, label: d.name }))}
                      onSelect={(o) => o && setDivisionId(o.value)}
                    />
                  ) : null}
                  <Button title="Yeni firma olarak ekle" loading={adding} disabled={adding} onPress={() => void addToCompanies()} />
                </>
              ) : null}
              <CompanyPicker label="Mevcut firmaya bağla" onSelect={(c) => void addToCompanies(c.id)} />
            </>
          ) : null}
        </View>
      ) : null}

      {uploadNote ? <Text style={styles.hint}>{uploadNote}</Text> : null}
      {canSave ? <Button title={editing ? 'Kaydet' : 'Görüşmeyi Ekle'} loading={saving} disabled={saving} onPress={() => void submit()} /> : null}
      {canDelete ? <Button title="Kaydı sil" variant="ghost" onPress={confirmDelete} /> : null}
    </FormPageLayout>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.md },
  notes: { minHeight: 96, textAlignVertical: 'top', paddingTop: spacing.md },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  thumb: { width: 80, height: 80, borderRadius: radius.sm, backgroundColor: colors.inputBg },
  fileThumb: { alignItems: 'center', justifyContent: 'center', gap: 2, padding: 4, borderWidth: 1, borderColor: colors.border },
  fileName: { ...typography.caption, fontFamily: fonts.regular, color: colors.textMuted, textAlign: 'center' },
  remove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.accentRed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  hint: { ...typography.label, fontFamily: fonts.regular, color: colors.textMuted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    maxWidth: '100%',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  chipText: { ...typography.label, color: colors.primary, flexShrink: 1 },
  companyBox: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
});
