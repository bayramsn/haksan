import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/src/auth/AuthProvider';
import { useCatalogFiles, useSendCatalogMail } from '@/src/api/products.hooks';
import { downloadAndShareFile, pickDocument, uploadEntityAttachment } from '@/src/native/files';
import { useTheme } from '@/src/theme/theme';
import { Card, EmptyState, ErrorState, Eyebrow, Field, Loading, SearchBar } from '@/src/ui';
import { toast } from '@/src/ui/toast';
import { FormScreen, SmallButton } from '@/src/ui/finance/kit';

const MAX_CATALOG_BYTES = 15 * 1024 * 1024;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Web `CatalogMailButton` + `CatalogLibraryDialog` + `ComposeMailDialog` (Genel Kataloglar). */
export default function ProductCatalogMailScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { user } = useAuth();
  const permissions = user?.permissions ?? [];
  const roles = user?.roles ?? [];
  const canUpload = permissions.includes('files.create') && (permissions.includes('products.update') || roles.includes('super_admin'));
  const catalogs = useCatalogFiles(user?.tenantId);
  const send = useSendCatalogMail();

  const [query, setQuery] = useState('');
  const [uploading, setUploading] = useState(false);
  const [selected, setSelected] = useState<{ fileId: string; name: string }[]>([]);
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('Ürün kataloğu');
  const [body, setBody] = useState('Merhaba,\n\nÜrün kataloğumuzu ekte bilgilerinize sunarız.');

  const visible = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('tr');
    return (catalogs.data ?? []).filter((row) => row.file && (!term || row.file.originalFilename.toLocaleLowerCase('tr').includes(term)));
  }, [catalogs.data, query]);

  async function upload() {
    if (!user?.tenantId) return;
    try {
      const picked = await pickDocument();
      if (!picked) return;
      if (picked.extension !== 'pdf' || picked.sizeBytes > MAX_CATALOG_BYTES) {
        toast.error('Katalog PDF olmalı ve 15 MB sınırını aşmamalıdır');
        return;
      }
      setUploading(true);
      await uploadEntityAttachment({
        bucket: 'erp-quote-documents',
        entityType: 'catalog',
        entityId: user.tenantId,
        documentTypeCode: 'other',
        local: picked,
      });
      toast.success('Katalog kütüphaneye eklendi');
      await catalogs.refetch();
    } catch (error) {
      toast.error(`Katalog yüklenemedi: ${error instanceof Error ? error.message : 'İstek başarısız oldu.'}`);
    } finally {
      setUploading(false);
    }
  }

  async function open(fileId: string) {
    try {
      await downloadAndShareFile(fileId);
    } catch (error) {
      toast.error(`Katalog açılamadı: ${error instanceof Error ? error.message : 'İstek başarısız oldu.'}`);
    }
  }

  function toggle(fileId: string, name: string) {
    setSelected((current) =>
      current.some((item) => item.fileId === fileId) ? current.filter((item) => item.fileId !== fileId) : [...current, { fileId, name }],
    );
  }

  function submit() {
    if (!to.trim() || !subject.trim() || !body.trim()) return toast.error('Alıcı, konu ve mesaj zorunludur');
    if (!EMAIL_RE.test(to.trim())) return toast.error('Geçerli bir e-posta adresi girin');
    if (!selected.length) return toast.error('Mail ekine en az bir katalog ekleyin');
    send.mutate(
      { to: to.trim(), subject: subject.trim(), body: body.trim(), fileIds: selected.map((item) => item.fileId) },
      {
        onSuccess: () => {
          toast.success('E-posta gönderildi');
          router.back();
        },
        onError: (error) => toast.error(`E-posta gönderilemedi: ${error.message || 'Webmail bağlantınızı kontrol edin.'}`),
      },
    );
  }

  return (
    <FormScreen title="Genel Kataloglar" submitLabel="Gönder" submitting={send.isPending} onSubmit={submit}>
      <Text className="font-inter text-xs text-muted-foreground">
        Kataloğu bir kez yükleyin; mail gönderirken kütüphaneden seçin. PDF, en fazla 15 MB.
      </Text>
      <View className="-mx-4">
        <SearchBar value={query} onChange={setQuery} placeholder="Katalog adı ara..." />
      </View>
      {canUpload ? (
        <SmallButton label={uploading ? 'Yükleniyor...' : 'Katalog Yükle'} icon="cloud-upload-outline" onPress={() => void upload()} disabled={uploading} />
      ) : null}
      {catalogs.isPending ? (
        <Loading />
      ) : catalogs.error ? (
        <ErrorState message={`Kataloglar yüklenemedi: ${catalogs.error.message}`} onRetry={() => void catalogs.refetch()} />
      ) : visible.length === 0 ? (
        <EmptyState title="Katalog bulunamadı" hint={canUpload ? 'PDF kataloğu yükleyerek kütüphaneye ekleyin.' : 'Kütüphanede katalog yok.'} />
      ) : (
        <Card className="gap-0 px-3 py-1">
          {visible.map((row) => {
            const file = row.file!;
            const checked = selected.some((item) => item.fileId === file.id);
            return (
              <View key={row.id} className="min-h-11 flex-row items-center gap-2 border-b border-border py-2">
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityLabel={`${file.originalFilename} mail ekine ekle`}
                  accessibilityState={{ checked }}
                  onPress={() => toggle(file.id, file.originalFilename)}
                  className="min-h-11 flex-1 flex-row items-center gap-2 active:opacity-70"
                >
                  <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={22} color={checked ? colors.primary : colors.mutedForeground} />
                  <View className="min-w-0 flex-1">
                    <Text className="font-inter-medium text-sm text-foreground" numberOfLines={2}>
                      {file.originalFilename}
                    </Text>
                    <Text className="font-inter text-xs text-muted-foreground">{(file.sizeBytes / 1048576).toFixed(1)} MB</Text>
                  </View>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${file.originalFilename} aç`}
                  onPress={() => void open(file.id)}
                  className="h-11 w-11 items-center justify-center active:opacity-60"
                >
                  <Ionicons name="open-outline" size={18} color={colors.mutedForeground} />
                </Pressable>
              </View>
            );
          })}
        </Card>
      )}

      <Eyebrow>Mail</Eyebrow>
      <Field label="Alıcı" value={to} onChangeText={setTo} keyboardType="email-address" autoCapitalize="none" placeholder="ornek@firma.com" />
      <Field label="Konu" value={subject} onChangeText={setSubject} />
      <Field label="Mesaj" value={body} onChangeText={setBody} multiline />
      <Text className="font-inter text-xs text-muted-foreground">
        {selected.length ? `Ekler: ${selected.map((item) => item.name).join(', ')}` : 'Henüz ek seçilmedi.'}
      </Text>
    </FormScreen>
  );
}
