import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useAuth } from '../lib/auth';
import type { Paginated } from '../api/services';
import { EmptyState, SearchBar } from './index';
import { colors, spacing } from './theme';

export type FetchPageParams = { search?: string; page: number; pageSize: number };

/** Arama + sayfalama + pull-to-refresh + "yeni" FAB içeren generic liste ekranı. */
export function EntityList<T>({
  queryKey,
  fetchPage,
  renderItem,
  keyExtractor,
  searchPlaceholder = 'Ara…',
  onCreate,
  emptyTitle = 'Kayıt yok',
  emptySubtitle,
}: {
  queryKey: string;
  fetchPage: (params: FetchPageParams) => Promise<Paginated<T>>;
  renderItem: (item: T) => React.ReactElement;
  keyExtractor: (item: T) => string;
  searchPlaceholder?: string;
  onCreate?: () => void;
  emptyTitle?: string;
  emptySubtitle?: string;
}) {
  const { activeDivision } = useAuth();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  // Hafif debounce — yazarken her tuşta sorgu atmasın.
  useEffect(() => {
    const h = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => clearTimeout(h);
  }, [searchInput]);

  const query = useInfiniteQuery({
    queryKey: [queryKey, search, activeDivision],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => fetchPage({ search: search || undefined, page: pageParam as number, pageSize: 20 }),
    getNextPageParam: (last) => (last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined),
  });

  const items = query.data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <View style={s.container}>
      <FlatList
        data={items}
        keyExtractor={keyExtractor}
        renderItem={({ item }) => <View style={s.itemWrap}>{renderItem(item)}</View>}
        ListHeaderComponent={
          <View style={s.header}>
            <SearchBar value={searchInput} onChangeText={setSearchInput} placeholder={searchPlaceholder} returnKeyType="search" />
          </View>
        }
        contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={query.isRefetching && !query.isFetchingNextPage} onRefresh={() => query.refetch()} />}
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
        }}
        ListEmptyComponent={
          query.isLoading ? (
            <ActivityIndicator style={{ marginTop: 40 }} />
          ) : query.isError ? (
            <EmptyState title="Yüklenemedi" subtitle={(query.error as Error)?.message} />
          ) : (
            <EmptyState title={emptyTitle} subtitle={emptySubtitle} />
          )
        }
        ListFooterComponent={query.isFetchingNextPage ? <ActivityIndicator style={{ marginVertical: 16 }} /> : null}
      />
      {onCreate ? (
        <TouchableOpacity style={s.fab} onPress={onCreate} activeOpacity={0.85}>
          <Text style={s.fabText}>＋</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.sm, paddingBottom: 96 },
  header: { marginBottom: spacing.sm },
  itemWrap: { marginBottom: spacing.sm },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.xl,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  fabText: { color: colors.primaryText, fontSize: 28, marginTop: -2 },
});
