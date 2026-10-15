import { useMemo, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCompanyStatement, useCustomerBalances } from '@/src/api/finance.hooks';
import { formatAmount, formatDate } from '@/src/lib/format';
import { downloadAndShare } from '@/src/native/files';
import { toneColor, useTheme } from '@/src/theme/theme';
import { Card, DetailHeader, EmptyState, ErrorState, Eyebrow, Loading, SCREEN_PAD } from '@/src/ui';
import { AgingHeatmap } from '@/src/ui/finance/AgingHeatmap';
import { SmallButton, runExport } from '@/src/ui/finance/kit';
import { safeFileName, statementBalances } from '@/src/ui/finance/balances-logic';

/** Web "Cari Ekstre" diyaloğu: yaşlandırma, PB bazında cari hesap ve hareketler + Excel/PDF. */
export default function CustomerStatementScreen() {
  const { companyId = '' } = useLocalSearchParams<{ companyId: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const balances = useCustomerBalances();
  const statement = useCompanyStatement(companyId);
  const [busy, setBusy] = useState<'xlsx' | 'pdf' | null>(null);
  const row = balances.data?.find((item) => item.companyId === companyId);
  const name = row?.companyName ?? 'Cari';
  const lines = useMemo(() => statement.data ?? [], [statement.data]);
  const totals = useMemo(
    () => statementBalances(lines, row?.currencies ?? [], row?.primaryCurrency ?? null),
    [lines, row],
  );

  async function download(format: 'xlsx' | 'pdf') {
    setBusy(format);
    await runExport(
      () =>
        downloadAndShare(`/exports/customer-statement/${companyId}`, `${safeFileName(name)}-ekstre.${format}`, {
          query: format === 'pdf' ? { format: 'pdf' } : undefined,
        }),
      'Ekstre indirilemedi',
    );
    setBusy(null);
  }

  const header = (
    <View className="gap-3 pb-3">
      <View className="flex-row flex-wrap gap-2">
        <SmallButton label={busy === 'xlsx' ? 'Hazırlanıyor…' : 'Excel'} icon="download-outline" disabled={busy !== null} onPress={() => void download('xlsx')} />
        <SmallButton label={busy === 'pdf' ? 'Hazırlanıyor…' : 'PDF'} icon="document-text-outline" disabled={busy !== null} onPress={() => void download('pdf')} />
        <SmallButton label="Firma Kartı" icon="business-outline" onPress={() => router.push(`/(tabs)/modules/companies/${companyId}` as Href)} />
      </View>
      {row ? (
        <Card className="gap-1.5">
          <Eyebrow>Yaşlandırma</Eyebrow>
          <AgingHeatmap row={row} />
          <Text className="font-inter text-[10px] text-muted-foreground">En yakın açık vadeye göre</Text>
        </Card>
      ) : null}
      {totals.map((item) => (
        <Card key={item.currencyCode} className="gap-1">
          <Text className="font-inter-medium text-[11px] uppercase tracking-wide text-muted-foreground">{item.currencyCode} Cari Hesap</Text>
          <Text
            className="font-inter-bold text-[19px]"
            style={{ color: toneColor(colors, item.balance > 0 ? 'success' : item.balance < 0 ? 'destructive' : 'neutral'), fontVariant: ['tabular-nums'] }}
          >
            {formatAmount(item.balance, item.currencyCode)}
          </Text>
          <Text className="font-inter text-[11px] text-muted-foreground">
            Borç {formatAmount(item.debit, item.currencyCode)} · Alacak {formatAmount(item.credit, item.currencyCode)}
          </Text>
        </Card>
      ))}
      <Eyebrow>Hareketler ({lines.length})</Eyebrow>
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <DetailHeader title="Cari Ekstre" subtitle={name} />
      {statement.isPending ? (
        <Loading />
      ) : statement.error ? (
        <ErrorState message={statement.error.message || 'Ekstre yüklenemedi'} onRetry={() => void statement.refetch()} />
      ) : (
        <FlatList
          data={lines}
          keyExtractor={(line) => line.id}
          ListHeaderComponent={header}
          contentContainerStyle={{ padding: SCREEN_PAD, paddingBottom: 40 }}
          refreshing={statement.isRefetching}
          onRefresh={() => {
            void statement.refetch();
            void balances.refetch();
          }}
          renderItem={({ item }) => {
            const code = item.currencyCode ?? row?.primaryCurrency ?? 'USD';
            return (
              <View className="gap-1 border-b border-border py-2.5">
                <View className="flex-row items-start justify-between gap-3">
                  <View className="flex-1">
                    <Text className="font-inter-medium text-[13px] text-foreground">{item.description}</Text>
                    <Text className="font-inter text-[11px] text-muted-foreground">
                      {formatDate(item.date)} · {item.invoiceNo || '—'}
                    </Text>
                  </View>
                  <Text className="font-inter-semibold text-[13px] text-foreground" style={{ fontVariant: ['tabular-nums'] }}>
                    {formatAmount(item.balance, code)}
                  </Text>
                </View>
                <View className="flex-row gap-3">
                  {item.debit ? <Text className="font-inter text-[11px] text-muted-foreground">Borç {formatAmount(item.debit, code)}</Text> : null}
                  {item.credit ? <Text className="font-inter text-[11px] text-muted-foreground">Alacak {formatAmount(item.credit, code)}</Text> : null}
                </View>
              </View>
            );
          }}
          ListEmptyComponent={<EmptyState title="Ekstre hareketi yok" />}
        />
      )}
    </SafeAreaView>
  );
}
