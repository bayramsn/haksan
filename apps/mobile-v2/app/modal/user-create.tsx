import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { usernameSchema } from '@haksan/shared';
import { useAdminDepartments, useAdminDivisions, useAdminRoles, useCreateUser } from '@/src/api/admin.hooks';
import { useLookup } from '@/src/api/crm.hooks';
import { Button, Field } from '@/src/ui';
import { toast } from '@/src/ui/toast';
import { useAdminAccess } from '@/src/ui/admin/access';
import { toggleOrdered, toggleSorted } from '@/src/ui/admin/admin-model';
import { ChipSelect, MultiChipSelect } from '@/src/ui/admin/controls';
import { Help, ModalShell } from '@/src/ui/admin/ModalShell';

export default function UserCreateModal() {
  const router = useRouter();
  const access = useAdminAccess();
  const allowed = access.isAdmin && access.has('users.create');
  const departments = useAdminDepartments(allowed);
  const divisions = useAdminDivisions(allowed);
  const roles = useAdminRoles(allowed);
  const titles = useLookup('user-titles', allowed);
  const create = useCreateUser();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [titleId, setTitleId] = useState('');
  const [divisionIds, setDivisionIds] = useState<string[]>([]);
  const [roleCodes, setRoleCodes] = useState<string[]>([]);

  const submit = () => {
    if (!fullName.trim() || !email.trim() || !username.trim() || password.length < 8) {
      toast.error('Ad, e-posta, kullanıcı adı ve en az 8 karakterli şifre zorunlu');
      return;
    }
    const parsedUsername = usernameSchema.safeParse(username);
    if (!parsedUsername.success) {
      toast.error(parsedUsername.error.issues[0]?.message ?? 'Kullanıcı adı geçersiz');
      return;
    }
    create.mutate(
      {
        fullName: fullName.trim(),
        email: email.trim(),
        username: parsedUsername.data,
        password,
        phone: phone.trim() || undefined,
        departmentId: departmentId || undefined,
        titleId: titleId || null,
        roleCodes,
        divisionIds,
      },
      {
        onSuccess: () => {
          toast.success('Kullanıcı oluşturuldu');
          router.back();
        },
        onError: (err) => toast.error(`Kullanıcı oluşturulamadı: ${err.message}`),
      }
    );
  };

  return (
    <ModalShell
      title="Yeni Kullanıcı"
      allowed={allowed}
      loading={departments.isPending || divisions.isPending || roles.isPending}
      error={departments.error?.message ?? divisions.error?.message ?? roles.error?.message ?? null}
      onRetry={() => {
        void departments.refetch();
        void divisions.refetch();
        void roles.refetch();
      }}
    >
      <Field label="Ad Soyad *" value={fullName} onChangeText={setFullName} autoComplete="name" maxLength={255} />
      <Field
        label="E-posta *"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
      />
      <View className="gap-1.5">
        <Field
          label="Kullanıcı Adı *"
          value={username}
          onChangeText={(value) => setUsername(value.toLowerCase())}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={32}
        />
        <Help>
          Girişte kullanılır. 3–32 karakter; harf, rakam, nokta, alt çizgi ve tire. E-posta alanı bildirim ve şifre sıfırlama için ayrıca korunur.
        </Help>
      </View>
      <Field
        label="Şifre *"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="new-password"
        textContentType="newPassword"
      />
      <Field label="Telefon" value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={32} />
      <ChipSelect
        label="Departman"
        options={[{ value: '', label: '— Atanmadı —' }, ...(departments.data ?? []).map((d) => ({ value: d.id, label: d.name }))]}
        value={departmentId}
        onChange={setDepartmentId}
      />
      <View className="gap-1.5">
        <ChipSelect
          label="Ünvan"
          options={[{ value: '', label: '— Atanmadı —' }, ...(titles.data ?? []).map((t) => ({ value: t.id, label: t.name }))]}
          value={titleId}
          onChange={setTitleId}
        />
        <Help>Teklif, proforma ve sözleşme çıktılarında isminin altında görünür.</Help>
      </View>
      <MultiChipSelect
        label="Bölüm"
        hint="Kullanıcının erişebileceği bölümler. İlk seçilen, varsayılan aktif bölüm olur. Boş bırakılırsa ticari veri görmez."
        options={(divisions.data ?? []).map((d) => ({ value: d.id, label: d.name }))}
        values={divisionIds}
        onToggle={(id, checked) => setDivisionIds((prev) => toggleOrdered(prev, id, checked))}
        badgeFor={(id) => (divisionIds[0] === id ? 'Birincil' : null)}
      />
      <MultiChipSelect
        label="Roller"
        options={(roles.data ?? []).map((r) => ({ value: r.code, label: r.isSystemRole ? `${r.name} (Sistem)` : r.name }))}
        values={roleCodes}
        onToggle={(code, checked) => setRoleCodes((prev) => toggleSorted(prev, code, checked))}
      />
      <Button label="Oluştur" loading={create.isPending} onPress={submit} />
    </ModalShell>
  );
}
