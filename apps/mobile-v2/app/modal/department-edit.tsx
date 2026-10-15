import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAdminDepartments, useCreateDepartment, useUpdateDepartment } from '@/src/api/admin.hooks';
import { Button, Card, Field } from '@/src/ui';
import { toast } from '@/src/ui/toast';
import { useAdminAccess } from '@/src/ui/admin/access';
import { normalizeDepartmentCode } from '@/src/ui/admin/admin-model';
import { Help, ModalShell } from '@/src/ui/admin/ModalShell';

export default function DepartmentEditModal() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; source?: string }>();
  const fromSettings = params.source === 'settings';
  const editing = !!params.id;
  const access = useAdminAccess();
  const allowed = editing ? access.has('departments.update') : access.isAdmin || access.has('departments.create');
  const departments = useAdminDepartments(allowed && editing);
  const create = useCreateDepartment();
  const update = useUpdateDepartment();
  const department = editing ? departments.data?.find((d) => d.id === params.id) : undefined;

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (!department) return;
    setName(department.name);
    setCode(department.code);
    setDescription(department.description ?? '');
  }, [department]);

  const normalizedCode = normalizeDepartmentCode(code);
  const reflected = 'Kullanıcı ekleme ve düzenleme ekranlarına yansıtıldı.';

  const submit = () => {
    if (editing && department) {
      if (!name.trim()) {
        toast.error('Departman adı ve kodu zorunlu');
        return;
      }
      update.mutate(
        { id: department.id, body: { name: name.trim(), description: description.trim() || null } },
        {
          onSuccess: () => {
            toast.success(`Departman güncellendi. ${reflected}`);
            router.back();
          },
          onError: (err) => toast.error(`Departman güncellenemedi: ${err.message}`),
        }
      );
      return;
    }
    if (!name.trim() || !normalizedCode) {
      toast.error(fromSettings ? 'Departman adı ve kodu zorunlu' : 'Ad ve geçerli bir kod zorunlu');
      return;
    }
    create.mutate(
      { name: name.trim(), code: normalizedCode, description: description.trim() || undefined },
      {
        onSuccess: () => {
          toast.success(fromSettings ? `Departman eklendi. ${reflected}` : 'Departman eklendi');
          router.back();
        },
        onError: (err) => toast.error(`Departman eklenemedi: ${err.message}`),
      }
    );
  };

  return (
    <ModalShell
      title={editing ? 'Departmanı Düzenle' : 'Yeni Departman'}
      allowed={allowed}
      loading={editing && departments.isPending}
      error={editing ? departments.error?.message ?? (departments.data && !department ? 'Departman bulunamadı' : null) : null}
      onRetry={() => void departments.refetch()}
      description={
        editing ? undefined : 'Şirket organizasyonuna yeni bir çalışma alanı ekleyin. Kod, kayıt ve raporlama kapsamını tanımlar.'
      }
    >
      <Card className="gap-0.5 p-3">
        <Text className="font-inter-semibold text-[14px] text-foreground" numberOfLines={1}>
          {name.trim() || 'Yeni departman'}
        </Text>
        <Text className="font-inter text-[11px] text-muted-foreground">HAKSAN / {normalizedCode || 'departman_kodu'}</Text>
      </Card>
      <Field
        label={fromSettings || editing ? 'Departman Adı *' : 'Ad *'}
        value={name}
        onChangeText={setName}
        placeholder="Satış"
        maxLength={255}
      />
      <View className="gap-1.5">
        <Field
          label={fromSettings || editing ? 'Departman Kodu *' : 'Kod *'}
          value={code}
          onChangeText={setCode}
          editable={!editing}
          placeholder="sales"
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={64}
        />
        {editing ? <Help>Kod sistem eşleştirmelerinde kullanılır ve sonradan değiştirilemez.</Help> : null}
      </View>
      <Field
        label="Açıklama"
        value={description}
        onChangeText={setDescription}
        multiline
        maxLength={2000}
        style={{ minHeight: 72, paddingTop: 12 }}
      />
      <Button label="Kaydet" loading={create.isPending || update.isPending} onPress={submit} />
    </ModalShell>
  );
}
