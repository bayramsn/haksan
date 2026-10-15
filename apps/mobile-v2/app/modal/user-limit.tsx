import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAdminUsers, useUpdateUser } from '@/src/api/admin.hooks';
import { Button, Eyebrow, Field, SearchBar } from '@/src/ui';
import { toast } from '@/src/ui/toast';
import { useAdminAccess } from '@/src/ui/admin/access';
import { filterByText } from '@/src/ui/admin/admin-model';
import { CheckRow } from '@/src/ui/admin/controls';
import { Help, ModalShell } from '@/src/ui/admin/ModalShell';

export default function UserLimitModal() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const access = useAdminAccess();
  const allowed = access.isAdmin;
  const users = useAdminUsers(allowed);
  const update = useUpdateUser();
  const user = users.data?.find((row) => row.id === id);

  const [limit, setLimit] = useState('');
  const [managerId, setManagerId] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!user) return;
    const current = Number(user.purchaseApprovalLimit ?? 0);
    setLimit(current > 0 ? String(current) : '');
    setManagerId(user.managerId);
  }, [user]);

  const candidates = useMemo(
    () => filterByText((users.data ?? []).filter((row) => row.id !== id), query, (row) => [row.fullName, row.email]),
    [users.data, id, query]
  );

  const save = () => {
    if (!user) return;
    const trimmed = limit.trim();
    const parsed = trimmed ? Number(trimmed.replace(',', '.')) : 0;
    if (!Number.isInteger(parsed) || parsed < 0) {
      toast.error('Limit pozitif bir tam sayı olmalı');
      return;
    }
    update.mutate(
      { id: user.id, body: { purchaseApprovalLimit: parsed, managerId } },
      {
        onSuccess: () => {
          toast.success('Kullanıcı limitleri güncellendi');
          router.back();
        },
        onError: (err) => toast.error(`Kullanıcı limitleri güncellenemedi: ${err.message}`),
      }
    );
  };

  return (
    <ModalShell
      title={user ? `Kullanıcı Limitleri · ${user.fullName}` : 'Kullanıcı Limitleri'}
      allowed={allowed}
      loading={users.isPending}
      error={users.error?.message ?? (users.data && !user ? 'Kullanıcı bulunamadı' : null)}
      onRetry={() => void users.refetch()}
    >
      <View className="gap-1.5">
        <Field
          label="Satınalma Onay Limiti (USD)"
          value={limit}
          onChangeText={setLimit}
          keyboardType="number-pad"
          placeholder="Limitsiz için boş bırakın"
        />
        <Help>Limit aşıldığında sipariş seçilen yöneticinin onayına düşer.</Help>
      </View>
      <View className="gap-2">
        <Eyebrow>Bağlı Olduğu Yönetici</Eyebrow>
        <SearchBar value={query} onChange={setQuery} placeholder="Yönetici ara..." />
        <CheckRow title="Yok (Doğrudan Onaylar)" checked={managerId === null} onToggle={() => setManagerId(null)} />
        {candidates.map((row) => (
          <CheckRow
            key={row.id}
            title={row.fullName}
            subtitle={row.email}
            checked={managerId === row.id}
            onToggle={() => setManagerId(row.id)}
          />
        ))}
      </View>
      <Button label="Kaydet" loading={update.isPending} disabled={!user} onPress={save} />
    </ModalShell>
  );
}
