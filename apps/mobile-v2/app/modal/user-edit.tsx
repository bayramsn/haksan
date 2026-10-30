import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { usernameSchema, type UserUpdateInput } from '@haksan/shared';
import { useAdminUsers, useUpdateUser } from '@/src/api/admin.hooks';
import { Button, Card, Field } from '@/src/ui';
import { toast } from '@/src/ui/toast';
import { useAdminAccess } from '@/src/ui/admin/access';
import { Help, ModalShell } from '@/src/ui/admin/ModalShell';

export default function UserEditModal() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const access = useAdminAccess();
  const allowed = access.isSuperAdmin;
  const users = useAdminUsers(allowed);
  const update = useUpdateUser();
  const user = users.data?.find((row) => row.id === id);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!user) return;
    setFullName(user.fullName);
    setEmail(user.email);
    setUsername(user.username ?? '');
    setPhone(user.phone ?? '');
  }, [user]);

  const submit = () => {
    if (!user) return;
    const next: Record<string, string> = {};
    if (!fullName.trim()) next.fullName = 'Ad Soyad zorunlu';
    if (!email.trim()) next.email = 'E-posta zorunlu';
    const parsedUsername = username.trim() ? usernameSchema.safeParse(username) : null;
    if (parsedUsername && !parsedUsername.success) next.username = parsedUsername.error.issues[0]?.message ?? 'Kullanıcı adı geçersiz';
    if (password && password.length < 8) next.password = 'Şifre en az 8 karakter olmalı';
    if (password && password !== confirm) next.confirm = 'Şifreler eşleşmiyor';
    setErrors(next);
    if (Object.keys(next).length) return;

    const body: UserUpdateInput = {
      fullName: fullName.trim(),
      email: email.trim(),
      phone: phone.trim() || null,
    };
    if (parsedUsername?.success) body.username = parsedUsername.data;
    if (password) body.password = password;
    update.mutate(
      { id: user.id, body },
      {
        onSuccess: () => {
          setPassword('');
          setConfirm('');
          toast.success(body.password ? 'Kullanıcı bilgileri ve şifre güncellendi' : 'Kullanıcı bilgileri güncellendi');
          router.back();
        },
        onError: (err) => toast.error(`Kullanıcı güncellenemedi: ${err.message}`),
      }
    );
  };

  return (
    <ModalShell
      title={user ? `Kullanıcıyı Düzenle · ${user.fullName}` : 'Kullanıcıyı Düzenle'}
      allowed={allowed}
      loading={users.isPending}
      error={users.error?.message ?? (users.data && !user ? 'Kullanıcı bulunamadı' : null)}
      onRetry={() => void users.refetch()}
    >
      <Field label="Ad Soyad" value={fullName} onChangeText={setFullName} error={errors.fullName} maxLength={255} />
      <Field
        label="E-posta"
        value={email}
        onChangeText={setEmail}
        error={errors.email}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <View className="gap-1.5">
        <Field
          label="Kullanıcı Adı"
          value={username}
          onChangeText={(value) => setUsername(value.toLowerCase())}
          error={errors.username}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={32}
        />
        <Help>Girişte kullanılır; e-posta iletişim için korunur. Değiştirmek kullanıcının açık oturumlarını sonlandırır.</Help>
      </View>
      <Field label="Telefon" value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={32} />
      <Card className="gap-3">
        <Text className="font-inter-semibold text-[14px] text-foreground">Şifre Sıfırla (isteğe bağlı)</Text>
        <Field
          label="Yeni Şifre"
          value={password}
          onChangeText={setPassword}
          error={errors.password}
          placeholder="Değiştirmemek için boş bırakın"
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="new-password"
          textContentType="newPassword"
        />
        <Field
          label="Yeni Şifre (Tekrar)"
          value={confirm}
          onChangeText={setConfirm}
          error={errors.confirm}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="new-password"
          textContentType="newPassword"
        />
      </Card>
      <Button label="Kaydet" loading={update.isPending} onPress={submit} />
    </ModalShell>
  );
}
