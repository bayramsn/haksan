import { useEffect, useMemo, useState } from 'react';
import { Image, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { apiBaseUrl } from '@/src/api/config';
import { useCreateSignature, useSignatures, useUpdateSignature } from '@/src/api/settings.hooks';
import { useAuth } from '@/src/auth/AuthProvider';
import { resolveMediaUrl } from '@/src/lib/mediaUrl';
import { useTheme } from '@/src/theme/theme';
import { Button, Eyebrow, Field } from '@/src/ui';
import { toast } from '@/src/ui/toast';
import { useAdminAccess } from '@/src/ui/admin/access';
import { ActionPill, ChipSelect, SwitchRow } from '@/src/ui/admin/controls';
import { Help, ModalShell } from '@/src/ui/admin/ModalShell';
import { SIGNATURE_DIVISION_ALL } from '@/src/ui/admin/signature-meta';
import { pickSignatureImage, uploadSignatureImage, type PickedSignatureImage } from '@/src/ui/admin/signature-upload';

export default function SignatureEditModal() {
  const router = useRouter();
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { user } = useAuth();
  const access = useAdminAccess();
  const allowed = access.has('tenants.update');
  const list = useSignatures();
  const create = useCreateSignature();
  const update = useUpdateSignature();
  const editing = id ? list.data?.find((row) => row.id === id) : undefined;
  const divisions = user?.divisions ?? [];

  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [divisionId, setDivisionId] = useState(SIGNATURE_DIVISION_ALL);
  const [isActive, setIsActive] = useState(true);
  const [image, setImage] = useState<PickedSignatureImage | null>(null);
  const [imageCleared, setImageCleared] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!editing) return;
    setName(editing.name);
    setTitle(editing.title);
    setDivisionId(editing.divisionId ?? SIGNATURE_DIVISION_ALL);
    setIsActive(editing.isActive);
  }, [editing]);

  const previewUrl = useMemo(() => {
    if (image) return image.uri;
    if (imageCleared) return null;
    return resolveMediaUrl(editing?.imageUrl, apiBaseUrl());
  }, [image, imageCleared, editing?.imageUrl]);

  const choose = async () => {
    try {
      const picked = await pickSignatureImage();
      if (!picked) return;
      setImage(picked);
      setImageCleared(false);
    } catch (err) {
      toast.error(`İmza görseli eklenemedi: ${err instanceof Error ? err.message : 'Görsel okunamadı.'}`);
    }
  };

  const submit = async () => {
    const trimmedName = name.trim();
    const trimmedTitle = title.trim();
    if (!trimmedName || !trimmedTitle) {
      toast.error('Ad ve ünvan zorunlu');
      return;
    }
    const division = divisionId === SIGNATURE_DIVISION_ALL ? null : divisionId;
    setUploading(true);
    try {
      if (editing) {
        const fileId = image ? await uploadSignatureImage(editing.id, image) : imageCleared ? null : undefined;
        await update.mutateAsync({
          id: editing.id,
          body: { name: trimmedName, title: trimmedTitle, divisionId: division, isActive, ...(fileId === undefined ? {} : { fileId }) },
        });
      } else {
        const fileId = image ? await uploadSignatureImage('new', image) : undefined;
        await create.mutateAsync({ name: trimmedName, title: trimmedTitle, divisionId: division, isActive, ...(fileId ? { fileId } : {}) });
      }
      toast.success(`${editing ? 'İmza güncellendi' : 'İmza eklendi'}. Teklif, proforma ve sözleşme çıktılarında seçilebilir.`);
      router.back();
    } catch (err) {
      toast.error(`${editing ? 'İmza güncellenemedi' : 'İmza eklenemedi'}: ${err instanceof Error ? err.message : 'API isteği başarısız oldu.'}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <ModalShell
      title={id ? 'İmzayı Düzenle' : 'Yeni İmza'}
      allowed={allowed}
      loading={!!id && list.isPending}
      error={id ? list.error?.message ?? (list.data && !editing ? 'İmza bulunamadı' : null) : null}
      onRetry={() => void list.refetch()}
      description="Belge çıktısında ad ve ünvan basılır; görsel yüklenirse adın üstünde ıslak imza olarak görünür."
    >
      <Field label="Ad Soyad *" value={name} onChangeText={setName} placeholder="Raif Şentürk" maxLength={255} editable={!uploading} />
      <Field label="Ünvan *" value={title} onChangeText={setTitle} placeholder="Satış Koordinatörü" maxLength={255} editable={!uploading} />
      {divisions.length > 1 ? (
        <View className="gap-1.5">
          <ChipSelect
            label="Bölüm"
            options={[{ value: SIGNATURE_DIVISION_ALL, label: 'Tüm bölümler' }, ...divisions.map((d) => ({ value: d.id, label: d.name }))]}
            value={divisionId}
            onChange={setDivisionId}
            disabled={uploading}
          />
          <Help>Bölüm seçilirse imza yalnızca o bölümün belgelerinde listelenir.</Help>
        </View>
      ) : null}
      <View className="gap-2">
        <Eyebrow>İmza Görseli</Eyebrow>
        <View className="flex-row items-center gap-3">
          {previewUrl ? (
            <Image
              source={{ uri: previewUrl }}
              accessibilityLabel="İmza görseli önizlemesi"
              resizeMode="contain"
              className="h-14 w-24 rounded border border-border bg-card"
            />
          ) : (
            <View className="h-14 w-24 items-center justify-center rounded border border-dashed border-border">
              <Ionicons name="image-outline" size={18} color={colors.mutedForeground} />
            </View>
          )}
          <View className="flex-1 flex-row flex-wrap gap-2">
            <ActionPill icon="cloud-upload-outline" label={previewUrl ? 'Değiştir' : 'Görsel Seç'} disabled={uploading} onPress={() => void choose()} />
            {previewUrl ? (
              <ActionPill
                icon="close"
                label="Kaldır"
                disabled={uploading}
                onPress={() => {
                  setImage(null);
                  setImageCleared(true);
                }}
              />
            ) : null}
          </View>
        </View>
        <Help>PNG, JPG veya WEBP · en fazla 2 MB. Beyaz zeminli taramalarda saydam PNG daha temiz basar.</Help>
      </View>
      <SwitchRow title="Aktif" subtitle="Pasif imza yeni belgelerde seçilemez." value={isActive} onValueChange={setIsActive} disabled={uploading} />
      <Button label={id ? 'Kaydet' : 'İmza Ekle'} loading={uploading} onPress={() => void submit()} />
    </ModalShell>
  );
}
