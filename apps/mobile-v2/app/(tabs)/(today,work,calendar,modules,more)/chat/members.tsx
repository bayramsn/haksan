import { useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { chatGroups } from '@/src/api/general.endpoints';
import { chatKeys } from '@/src/api/chat.keys';
import { useDirectory } from '@/src/api/operations.hooks';
import { useAuth } from '@/src/auth/AuthProvider';
import { useTheme } from '@/src/theme/theme';
import { Avatar } from '@/src/ui/Avatar';
import { Chip, DetailHeader, EmptyState, ErrorState, Eyebrow, Loading, SearchBar } from '@/src/ui';
import { toast } from '@/src/ui/toast';

/**
 * Grup üyeleri: herkes listeyi görür; süper admin ya da grup yöneticisi üye
 * ekler, çıkarır ve yönetici yapar (kural sunucuda, burada yalnız görünürlük).
 */
export default function GroupMembersScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const detailKey = ['chat', 'conversation', id];
  const detail = useQuery({ queryKey: detailKey, queryFn: () => chatGroups.get(id), enabled: Boolean(id) });
  const canManage = Boolean(user?.roles.includes('super_admin') || detail.data?.myRole === 'admin');
  const directory = useDirectory();

  const settle = () => {
    void qc.invalidateQueries({ queryKey: detailKey });
    void qc.invalidateQueries({ queryKey: chatKeys.conversations });
  };
  const onError = (error: Error) => Alert.alert('İşlem yapılamadı', error.message);
  const add = useMutation({ mutationFn: (userId: string) => chatGroups.addMembers(id, [userId]), onSuccess: () => { settle(); toast.success('Üye eklendi'); }, onError });
  const remove = useMutation({ mutationFn: (userId: string) => chatGroups.removeMember(id, userId), onSuccess: () => { settle(); toast.success('Üye çıkarıldı'); }, onError });
  const setRole = useMutation({ mutationFn: ({ userId, role }: { userId: string; role: 'admin' | 'member' }) => chatGroups.setRole(id, userId, role), onSuccess: settle, onError });

  const members = detail.data?.members ?? [];
  const memberIds = useMemo(() => new Set(members.map((member) => member.userId)), [members]);
  const candidates = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('tr');
    if (!term) return [];
    return (directory.data ?? [])
      .filter((person) => !memberIds.has(person.id))
      .filter((person) => `${person.fullName} ${person.email}`.toLocaleLowerCase('tr').includes(term))
      .slice(0, 20);
  }, [directory.data, memberIds, search]);

  function manage(member: (typeof members)[number]) {
    if (!canManage || member.userId === user?.id) return;
    const isAdmin = member.role === 'admin';
    // Android Alert en çok 3 düğme gösterir.
    Alert.alert(member.fullName, undefined, [
      { text: isAdmin ? 'Üye yap' : 'Yönetici yap', onPress: () => setRole.mutate({ userId: member.userId, role: isAdmin ? 'member' : 'admin' }) },
      {
        text: 'Gruptan çıkar',
        style: 'destructive',
        onPress: () => Alert.alert('Gruptan çıkar', `${member.fullName} gruptan çıkarılsın mı?`, [
          { text: 'Vazgeç', style: 'cancel' },
          { text: 'Çıkar', style: 'destructive', onPress: () => remove.mutate(member.userId) },
        ]),
      },
      { text: 'Vazgeç', style: 'cancel' },
    ], { cancelable: true });
  }

  if (detail.isPending || detail.error || !detail.data) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['left', 'right']}>
        <DetailHeader title="Grup üyeleri" />
        {detail.isPending ? <Loading /> : <ErrorState message={detail.error?.message ?? 'Grup yüklenemedi.'} onRetry={() => void detail.refetch()} />}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['left', 'right']}>
      <DetailHeader title="Grup üyeleri" subtitle={`${detail.data.title ?? 'Grup'} · ${members.length} üye`} />
      <FlatList
        data={members}
        keyExtractor={(item) => item.userId}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 40 }}
        ListHeaderComponent={
          canManage ? (
            <View className="gap-2 px-4 pb-3 pt-2">
              <Eyebrow>Üye ekle</Eyebrow>
              <SearchBar value={search} onChange={setSearch} placeholder="Eklemek için ad veya e-posta ara" />
              {candidates.map((person) => (
                <Pressable
                  key={person.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${person.fullName} gruba ekle`}
                  disabled={add.isPending}
                  onPress={() => add.mutate(person.id, { onSuccess: () => setSearch('') })}
                  className="min-h-[56px] flex-row items-center gap-3 rounded-control border border-border bg-card px-3 py-2 active:opacity-70"
                >
                  <Avatar name={person.fullName} />
                  <View className="flex-1">
                    <Text className="font-inter-semibold text-[15px] text-foreground" numberOfLines={1}>{person.fullName}</Text>
                    <Text className="font-inter text-[13px] text-muted-foreground" numberOfLines={1}>{person.email}</Text>
                  </View>
                  <Ionicons name="add-circle" size={24} color={colors.primary} />
                </Pressable>
              ))}
              {search.trim() && !candidates.length ? <Text className="font-inter text-sm text-muted-foreground">Eklenebilecek kullanıcı bulunamadı.</Text> : null}
              <View className="pt-3"><Eyebrow>Üyeler</Eyebrow></View>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole={canManage ? 'button' : undefined}
            accessibilityLabel={item.fullName}
            disabled={!canManage || item.userId === user?.id}
            onPress={() => manage(item)}
            className="min-h-[60px] flex-row items-center gap-3 border-b border-border px-4 py-2 active:opacity-70"
          >
            <Avatar name={item.fullName} />
            <View className="flex-1 gap-0.5">
              <Text className="font-inter-semibold text-[15px] text-foreground" numberOfLines={1}>
                {item.fullName}{item.userId === user?.id ? ' (siz)' : ''}
              </Text>
              <Text className="font-inter text-[13px] text-muted-foreground" numberOfLines={1}>{item.email}</Text>
            </View>
            {item.role === 'admin' ? <Chip label="Yönetici" tone="info" /> : null}
          </Pressable>
        )}
        ListEmptyComponent={<EmptyState title="Üye yok" />}
      />
    </SafeAreaView>
  );
}
