import { useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAdminPermissions, useCreateRole } from '@/src/api/admin.hooks';
import { Button, Card, Field } from '@/src/ui';
import { toast } from '@/src/ui/toast';
import { useAdminAccess } from '@/src/ui/admin/access';
import {
  NEW_ROLE_DEFAULT_CODES,
  ROLE_TEMPLATES,
  applyRoleTemplate,
  moduleCount,
  roleCodeFromName,
} from '@/src/ui/admin/admin-model';
import { ActionPill } from '@/src/ui/admin/controls';
import { ModalShell } from '@/src/ui/admin/ModalShell';
import { PermissionMatrix } from '@/src/ui/admin/PermissionMatrix';

export default function RoleCreateModal() {
  const router = useRouter();
  const access = useAdminAccess();
  const allowed = access.isSuperAdmin;
  const permissions = useAdminPermissions(allowed);
  const create = useCreateRole();

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [codeTouched, setCodeTouched] = useState(false);
  const [description, setDescription] = useState('');
  const [codes, setCodes] = useState<string[]>(NEW_ROLE_DEFAULT_CODES);

  const submit = () => {
    const finalCode = roleCodeFromName(code || name);
    if (!name.trim() || !finalCode) {
      toast.error('Rol adı ve kod gerekli');
      return;
    }
    create.mutate(
      { code: finalCode, name: name.trim(), description: description.trim() || undefined, permissionCodes: codes },
      {
        onSuccess: () => {
          toast.success('Rol oluşturuldu');
          router.back();
        },
        onError: (err) => toast.error(`Rol oluşturulamadı: ${err.message}`),
      }
    );
  };

  return (
    <ModalShell
      title="Yeni rol oluştur"
      allowed={allowed}
      loading={permissions.isPending}
      error={permissions.error?.message ?? null}
      onRetry={() => void permissions.refetch()}
    >
      <Field
        label="Rol Adı"
        value={name}
        onChangeText={(value) => {
          setName(value);
          if (!codeTouched) setCode(roleCodeFromName(value));
        }}
        placeholder="Örn: Bölge Müdürü"
        maxLength={255}
      />
      <Field
        label="Rol Kodu"
        value={code}
        onChangeText={(value) => {
          setCodeTouched(true);
          setCode(roleCodeFromName(value));
        }}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={64}
      />
      <Field
        label="Açıklama"
        value={description}
        onChangeText={setDescription}
        placeholder="Bu rolün hangi ekip veya süreç için kullanılacağını yazın."
        multiline
        maxLength={2000}
        style={{ minHeight: 72, paddingTop: 12 }}
      />
      <Card className="gap-2 p-3">
        <Text className="font-inter-semibold text-[14px] text-foreground">Başlangıç yetki şablonu</Text>
        <Text className="font-inter text-[12px] text-muted-foreground">
          Şablon yalnızca matrisi doldurur; kaydetmeden önce her yetkiyi değiştirebilirsiniz.
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {ROLE_TEMPLATES.map((template) => (
            <ActionPill
              key={template.value}
              icon="layers-outline"
              label={template.label}
              onPress={() => setCodes(applyRoleTemplate(permissions.data ?? [], template.value))}
            />
          ))}
        </View>
        <Text className="font-inter-medium text-[12px] text-muted-foreground">
          {codes.length} yetki seçili · {moduleCount(permissions.data ?? [], codes)} modül
        </Text>
      </Card>
      <PermissionMatrix permissions={permissions.data ?? []} selected={codes} onChange={setCodes} />
      <Button label="Rol Oluştur" loading={create.isPending} onPress={submit} />
    </ModalShell>
  );
}
