import { useState } from 'react';
import { Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useAccessRequests, useDecideAccessRequest } from '@/src/api/settings.hooks';
import type { AccessRequestRow, AccessRequestStatus } from '@/src/api/settings.api';
import { formatDateTime } from '@/src/lib/format';
import { Card, Chip, EmptyState, ErrorState, FilterChips, ListSkeleton, SCREEN_PAD } from '@/src/ui';
import { toast } from '@/src/ui/toast';
import { useAdminAccess } from '@/src/ui/admin/access';
import { ActionPill, Notice, confirmAction, confirmDestructive } from '@/src/ui/admin/controls';
import { SettingsSubpage } from '@/src/ui/admin/SettingsSubpage';

const STATUS_LABEL: Record<AccessRequestStatus, string> = { pending: 'Bekliyor', approved: 'Onaylandı', rejected: 'Reddedildi' };

export default function AccessRequestsScreen() {
  const access = useAdminAccess();
  const [status, setStatus] = useState<AccessRequestStatus>('pending');
  const list = useAccessRequests(status);
  const decide = useDecideAccessRequest();
  const [busyId, setBusyId] = useState<string | null>(null);

  const run = (row: AccessRequestRow, decision: 'approve' | 'reject') => {
    setBusyId(row.id);
    decide.mutate(
      { id: row.id, decision },
      {
        onSuccess: () =>
          toast.success(`${decision === 'approve' ? 'Talep onaylandı' : 'Talep reddedildi'}${row.company?.legalTitle ? ` · ${row.company.legalTitle}` : ''}`),
        onError: (err) => toast.error(`İşlem başarısız: ${err.message}`),
        onSettled: () => setBusyId(null),
      }
    );
  };

  const rows = list.data?.data ?? [];

  return (
    <SettingsSubpage
      title="Onay Bekleyen Firma Talepleri"
      allowed={access.has('companies.update')}
      scroll={false}
    >
      <FlashList
        maintainVisibleContentPosition={{ disabled: true }}
        style={{ flex: 1 }}
        data={list.isPending || list.error ? [] : rows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: SCREEN_PAD, paddingTop: 12, paddingBottom: 32 }}
        ListHeaderComponent={
          <View className="gap-3 pb-2">
            <Notice tone="info">
              Başka bir bölümün portföyündeki firmaya erişim talepleri. Onayladığınızda firma talep eden bölüme eklenir.
            </Notice>
            <FilterChips
              options={[
                { value: 'approved' as const, label: 'Onaylanan' },
                { value: 'rejected' as const, label: 'Reddedilen' },
              ]}
              value={status === 'pending' ? null : status}
              onChange={(next) => setStatus(next ?? 'pending')}
              allLabel="Bekleyen"
            />
          </View>
        }
        renderItem={({ item }) => (
          <Card className="my-1.5 gap-2 p-3.5">
            <View className="flex-row items-start gap-2">
              <View className="flex-1 gap-0.5">
                <Text className="font-inter-semibold text-[15px] text-foreground" numberOfLines={2}>
                  {item.company?.legalTitle ?? 'Firma'}
                </Text>
                <Text className="font-inter text-[12px] text-muted-foreground">
                  {item.requestingDivision?.name ?? 'Bölüm'} talep ediyor
                  {item.company?.taxNumber ? ` · VKN ${item.company.taxNumber}` : ''}
                </Text>
                <Text className="font-inter text-[11px] text-muted-foreground">{formatDateTime(item.createdAt)}</Text>
              </View>
              <Chip tone={item.status === 'pending' ? 'warning' : item.status === 'approved' ? 'success' : 'destructive'} label={STATUS_LABEL[item.status]} />
            </View>
            {item.note ? <Text className="font-inter text-[13px] text-foreground">{item.note}</Text> : null}
            {item.status === 'pending' ? (
              <View className="flex-row gap-2">
                <ActionPill
                  icon="close"
                  tone="destructive"
                  label="Reddet"
                  disabled={busyId === item.id}
                  onPress={() =>
                    confirmDestructive('Talep reddedilsin mi?', `${item.company?.legalTitle ?? 'Firma'} erişim talebi reddedilecek.`, 'Reddet', () =>
                      run(item, 'reject')
                    )
                  }
                />
                <ActionPill
                  icon="checkmark"
                  tone="success"
                  label="Onayla"
                  disabled={busyId === item.id}
                  onPress={() =>
                    confirmAction(
                      'Talep onaylansın mı?',
                      `${item.company?.legalTitle ?? 'Firma'} talep eden bölümün portföyüne eklenecek.`,
                      'Onayla',
                      () => run(item, 'approve')
                    )
                  }
                />
              </View>
            ) : null}
          </Card>
        )}
        refreshing={list.isRefetching}
        onRefresh={() => void list.refetch()}
        ListEmptyComponent={
          list.isPending ? (
            <ListSkeleton />
          ) : list.error ? (
            <ErrorState message={`Onay talepleri yüklenemedi: ${list.error.message}`} onRetry={() => void list.refetch()} />
          ) : (
            <EmptyState icon="checkmark-done-outline" title={status === 'pending' ? 'Bekleyen talep yok.' : 'Kayıt yok.'} />
          )
        }
      />
    </SettingsSubpage>
  );
}
