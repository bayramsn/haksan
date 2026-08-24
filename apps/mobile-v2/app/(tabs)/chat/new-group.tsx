import { useMemo, useState } from 'react';
import { FlatList, Pressable, Switch, Text, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { createGroupSchema } from '@haksan/shared';
import { conversationTitle, useCreateGroup } from '@/src/api/chat.hooks';
import { useDirectory } from '@/src/api/operations.hooks';
import { useAuth } from '@/src/auth/AuthProvider';
import { useTheme } from '@/src/theme/theme';
import { Avatar } from '@/src/ui/Avatar';
import { Button, DetailHeader, EmptyState, ErrorState, Field, Loading, SearchBar } from '@/src/ui';

export default function NewGroupScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { colors } = useTheme();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [onlyAdminsCanPost, setOnlyAdminsCanPost] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [titleError, setTitleError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const directory = useDirectory();
  const createGroup = useCreateGroup();
  const currentUserId = user?.id;

  const rows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('tr');
    return (directory.data ?? []).filter((person) => {
      if (!term) return true;
      return `${person.fullName} ${person.email}`.toLocaleLowerCase('tr').includes(term);
    });
  }, [directory.data, search]);

  if (!currentUserId || !user.roles.includes('super_admin')) return <Redirect href="/(tabs)/chat" />;

  function toggle(userId: string) {
    setSelectedIds((previous) =>
      previous.includes(userId) ? previous.filter((id) => id !== userId) : [...previous, userId]
    );
    setFormError(null);
  }

  async function submit() {
    setTitleError(null);
    setFormError(null);
    const parsed = createGroupSchema.safeParse({
      title: title.trim(),
      description: description.trim() || undefined,
      memberUserIds: selectedIds,
      onlyAdminsCanPost,
    });
    if (!parsed.success) {
      setTitleError(parsed.error.flatten().fieldErrors.title?.[0] ?? null);
      setFormError('Grup bilgilerini kontrol edin.');
      return;
    }
    try {
      const conversation = await createGroup.mutateAsync(parsed.data);
      const resolvedTitle = conversationTitle(conversation, currentUserId);
      router.replace(`/(tabs)/chat/${conversation.id}?title=${encodeURIComponent(resolvedTitle)}`);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Grup oluşturulamadı.');
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom', 'left', 'right']}>
      <DetailHeader title="Yeni Grup" subtitle={`${selectedIds.length} üye seçildi`} />
      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View className="gap-4 px-4 pb-4 pt-2">
            <Field
              label="Grup adı"
              value={title}
              onChangeText={(value) => {
                setTitle(value);
                setTitleError(null);
                setFormError(null);
              }}
              maxLength={255}
              error={titleError ?? undefined}
              returnKeyType="next"
            />
            <Field
              label="Açıklama (isteğe bağlı)"
              value={description}
              onChangeText={setDescription}
              multiline
              maxLength={2000}
              className="min-h-20 rounded-control border border-border bg-input-background px-3 py-2 font-inter text-base text-foreground"
            />
            <View className="min-h-11 flex-row items-center justify-between gap-4 rounded-control border border-border bg-card px-3 py-2">
              <View className="flex-1 gap-0.5">
                <Text className="font-inter-semibold text-sm text-foreground">Yalnız yöneticiler yazabilsin</Text>
                <Text className="font-inter text-xs text-muted-foreground">Üyeler grubu okuyabilir; mesajı yöneticiler gönderir.</Text>
              </View>
              <Switch
                accessibilityLabel="Yalnız yöneticiler yazabilsin"
                value={onlyAdminsCanPost}
                onValueChange={setOnlyAdminsCanPost}
                trackColor={{ false: colors.muted, true: colors.primary }}
              />
            </View>
            <View className="gap-2">
              <Text className="font-inter-semibold text-sm text-foreground">Üyeler</Text>
              <SearchBar value={search} onChange={setSearch} placeholder="Ad veya e-posta ara" />
            </View>
            {formError ? (
              <Text selectable accessibilityLiveRegion="assertive" className="font-inter text-sm text-destructive">
                {formError}
              </Text>
            ) : null}
          </View>
        }
        renderItem={({ item }) => {
          const selected = selectedIds.includes(item.id);
          return (
            <Pressable
              accessibilityRole="checkbox"
              accessibilityLabel={item.fullName}
              accessibilityState={{ checked: selected }}
              onPress={() => toggle(item.id)}
              className="min-h-[60px] flex-row items-center gap-3 border-b border-border px-4 py-2 active:opacity-70"
            >
              <Avatar name={item.fullName} />
              <View className="flex-1 gap-0.5">
                <Text selectable className="font-inter-semibold text-[15px] text-foreground" numberOfLines={1}>
                  {item.fullName}
                </Text>
                <Text selectable className="font-inter text-[13px] text-muted-foreground" numberOfLines={1}>
                  {item.email}
                </Text>
              </View>
              <View className={`h-7 w-7 items-center justify-center rounded-full border ${selected ? 'border-primary bg-primary' : 'border-border bg-card'}`}>
                {selected ? <Ionicons name="checkmark" size={17} color={colors.primaryForeground} /> : null}
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          directory.isPending ? (
            <Loading />
          ) : directory.error ? (
            <ErrorState message={directory.error.message} onRetry={() => void directory.refetch()} />
          ) : (
            <EmptyState title="Kullanıcı bulunamadı" hint={search ? 'Arama ölçütünü değiştirin.' : undefined} />
          )
        }
      />
      <View className="border-t border-border bg-card px-4 py-3">
        <Button label="Grubu Oluştur" loading={createGroup.isPending} onPress={() => void submit()} />
      </View>
    </SafeAreaView>
  );
}
