import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { notifications, type NotificationItem } from './endpoints';
import type { Paginated } from './client';

const PAGE_SIZE = 30;

export const notificationKeys = {
  all: ['notifications'] as const,
  list: (unread: boolean): QueryKey => ['notifications', 'list', unread],
  unreadCount: ['notifications', 'unread-count'] as const,
};

export function useNotifications(unread: boolean) {
  return useInfiniteQuery({
    queryKey: notificationKeys.list(unread),
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      notifications.list({ page: pageParam, pageSize: PAGE_SIZE, unread: unread || undefined }),
    getNextPageParam: (last) => (last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined),
    select: (data) => ({ items: data.pages.flatMap((p) => p.data), total: data.pages[0]?.meta.total ?? 0 }),
  });
}

/**
 * Rozet için yalnızca sayı gerekiyor; `pageSize: 1` ile tek satır çekip
 * `meta.total` okunuyor (sunucuda ayrı bir sayaç ucu yok).
 */
export function useUnreadCount(): number {
  const { data } = useQuery({
    queryKey: notificationKeys.unreadCount,
    queryFn: () => notifications.list({ page: 1, pageSize: 1, unread: true }),
    select: (page) => page.meta.total,
    staleTime: 60 * 1000,
    refetchInterval: 2 * 60 * 1000,
  });
  return data ?? 0;
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => notifications.markRead(id),
    // Okundu işaretlemek geri alınabilir bir işlem değil ama listede anında
    // görünmesi gerekiyor; sunucu yanıtı beklenmeden satır güncelleniyor.
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: notificationKeys.all });
      const now = new Date().toISOString();
      for (const unread of [true, false]) {
        qc.setQueryData<{ pages: Paginated<NotificationItem>[]; pageParams: unknown[] }>(
          notificationKeys.list(unread),
          (prev) =>
            prev
              ? {
                  ...prev,
                  pages: prev.pages.map((p) => ({
                    ...p,
                    data: p.data.map((n) => (n.id === id ? { ...n, readAt: n.readAt ?? now } : n)),
                  })),
                }
              : prev
        );
      }
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: notificationKeys.all }),
  });
}

export function useRespondNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, decision, reason }: { id: string; decision: 'yes' | 'no'; reason?: string }) =>
      notifications.respond(id, { decision, reason }),
    onSettled: () => void qc.invalidateQueries({ queryKey: notificationKeys.all }),
  });
}

/** Listedeki tüm okunmamışları tek tek işaretler; sunucuda toplu uç yok. */
export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      for (const id of ids) await notifications.markRead(id);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: notificationKeys.all }),
  });
}
