import { useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  useAddChatMembers,
  useChatConversation,
  useRemoveChatMember,
  useSetChatMemberRole,
  useUpdateChatGroup,
} from '@/src/api/crm-general.hooks';
import { useDirectory } from '@/src/api/operations.hooks';
import { useAuth } from '@/src/auth/AuthProvider';
import { useTheme } from '@/src/theme/theme';
import { Avatar } from '@/src/ui/Avatar';
import { Card, Chip, EmptyState, ErrorState, Eyebrow, Loading, SearchBar } from '@/src/ui';
import { toast } from '@/src/ui/toast';
import { canManageGroup } from '@/src/ui/crm/chat-logic';

/** Web GroupSettingsDialog: üye ekle/çıkar, yöneticilik, "yalnız yönetici yazar". */
export default function ChatGroupSettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { colors } = useTheme();
  const detail = useChatConversation(id ?? '');
  const directory = useDirectory();
  const update = useUpdateChatGroup(id ?? '');
  const addMembers = useAddChatMembers(id ?? '');
  const removeMember = useRemoveChatMember(id ?? '');
  const setRole = useSetChatMemberRole(id ?? '');
  const [search, setSearch] = useState('');

  const isSuperAdmin = user?.roles.includes('super_admin') ?? false;
  const isManager = canManageGroup(detail.data, isSuperAdmin);
  const busy = update.isPending || addMembers.isPending || removeMember.isPending || setRole.isPending;

  const addable = useMemo(() => {
    const memberIds = new Set((detail.data?.members ?? []).map((member) => member.userId));
    const term = search.trim().toLocaleLowerCase('tr');
    return (directory.data ?? []).filter(
      (person) => !memberIds.has(person.id) && (!term || person.fullName.toLocaleLowerCase('tr').includes(term) || person.email.toLocaleLowerCase('tr').includes(term)),
    );
  }, [detail.data?.members, directory.data, search]);

  if (detail.isPending) return <Loading />;
  if (detail.error || !detail.data) {
    return <ErrorState message={detail.error?.message ?? 'Sohbet bulunamadı.'} onRetry={() => void detail.refetch()} />;
  }
  const group = detail.data;

  function confirmRemove(userId: string, name: string) {
    Alert.alert('Gruptan çıkar', `${name} gruptan çıkarılacak. Devam edilsin mi?`, [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Çıkar',
        style: 'destructive',
        onPress: () =>
          removeMember.mutate(userId, {
            onSuccess: () => toast.success('Üye çıkarıldı'),
            onError: (error) => toast.error(error.message),
          }),
      },
    ]);
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['bottom', 'left', 'right']}>
      <Stack.Screen options={{ title: `${group.title ?? 'Grup'} · Ayarlar`, headerShown: true }} />
      <ScrollView
        contentContainerClassName="gap-4 p-4 pb-10"
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={detail.isRefetching} onRefresh={() => void detail.refetch()} />}
      >
        <Text className="font-inter text-sm text-muted-foreground">
          {isManager ? 'Üyeleri ve yöneticilik ayarlarını düzenleyin.' : 'Grup üyeleri ve ayarları.'}
        </Text>

        {isManager ? (
          <Card className="flex-row items-center justify-between gap-3 px-4 py-3">
            <Text className="flex-1 font-inter-medium text-sm text-foreground">Yalnızca yöneticiler yazabilir</Text>
            <Switch
              accessibilityLabel="Yalnızca yöneticiler yazabilir"
              value={group.onlyAdminsCanPost}
              disabled={busy}
              onValueChange={(value) =>
                update.mutate({ onlyAdminsCanPost: value }, { onError: (error) => toast.error(error.message) })
              }
              trackColor={{ true: colors.primary, false: colors.border }}
            />
          </Card>
        ) : null}

        <View className="gap-2">
          <Eyebrow>Üyeler ({group.members.length})</Eyebrow>
          <Card className="px-3 py-1">
            {group.members.map((member, index) => (
              <View
                key={member.userId}
                className={`min-h-[56px] flex-row items-center gap-2.5 py-2 ${index > 0 ? 'border-t border-border' : ''}`}
              >
                <Avatar name={member.fullName} size={32} />
                <Text className="flex-1 font-inter text-sm text-foreground" numberOfLines={1}>
                  {member.fullName}
                  {member.userId === user?.id ? <Text className="text-muted-foreground"> (siz)</Text> : null}
                </Text>
                <Chip tone={member.role === 'admin' ? 'info' : 'neutral'} label={member.role === 'admin' ? 'Yönetici' : 'Üye'} />
                {isManager ? (
                  <>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={member.role === 'admin' ? `${member.fullName} yöneticiliğini al` : `${member.fullName} yönetici yap`}
                      disabled={busy}
                      onPress={() =>
                        setRole.mutate(
                          { userId: member.userId, role: member.role === 'admin' ? 'member' : 'admin' },
                          { onError: (error) => toast.error(error.message) },
                        )
                      }
                      className="h-11 w-11 items-center justify-center active:opacity-60"
                    >
                      <Ionicons name={member.role === 'admin' ? 'shield-outline' : 'shield-checkmark-outline'} size={19} color={colors.foreground} />
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${member.fullName} gruptan çıkar`}
                      disabled={busy}
                      onPress={() => confirmRemove(member.userId, member.fullName)}
                      className="h-11 w-11 items-center justify-center active:opacity-60"
                    >
                      <Ionicons name="trash-outline" size={19} color={colors.destructive} />
                    </Pressable>
                  </>
                ) : null}
              </View>
            ))}
          </Card>
        </View>

        {isManager ? (
          <View className="gap-2">
            <Eyebrow>Üye ekle</Eyebrow>
            <View className="-mx-4">
              <SearchBar value={search} onChange={setSearch} placeholder="Çalışan ara" />
            </View>
            {directory.isPending ? (
              <Loading />
            ) : directory.error ? (
              <ErrorState message={directory.error.message} onRetry={() => void directory.refetch()} />
            ) : addable.length === 0 ? (
              <EmptyState title="Başka çalışan yok" />
            ) : (
              <Card className="px-3 py-1">
                {addable.map((person, index) => (
                  <View
                    key={person.id}
                    className={`min-h-[56px] flex-row items-center gap-2.5 py-2 ${index > 0 ? 'border-t border-border' : ''}`}
                  >
                    <Avatar name={person.fullName} size={32} />
                    <Text className="flex-1 font-inter text-sm text-foreground" numberOfLines={1}>{person.fullName}</Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${person.fullName} gruba ekle`}
                      disabled={busy}
                      onPress={() =>
                        addMembers.mutate([person.id], {
                          onSuccess: () => toast.success('Üye eklendi'),
                          onError: (error) => toast.error(error.message),
                        })
                      }
                      className="min-h-11 flex-row items-center gap-1 rounded-control border border-border px-3 active:bg-muted"
                    >
                      <Ionicons name="add" size={16} color={colors.foreground} />
                      <Text className="font-inter-medium text-sm text-foreground">Ekle</Text>
                    </Pressable>
                  </View>
                ))}
              </Card>
            )}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
