import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { financeService } from '@/src/api/services';
import { FormPageLayout } from '@/src/ui/FormPageLayout';
import { InfoCard } from '@/src/ui/DetailLayout';
import { colors, typography } from '@/src/theme/tokens';

const money = (value: unknown, currency?: unknown) => {
  const n = Number(value ?? 0);
  const formatted = Number.isFinite(n)
    ? n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '0,00';
  const code = currency ? ` ${String(currency)}` : '';
  return `${formatted}${code}`;
};

/** Stitch #48 Müşteri Cari Ekstre */
export function CustomerStatementScreen() {
  const { companyId, companyName } = useLocalSearchParams<{ companyId?: string; companyName?: string }>();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const balances = useMemo(() => {
    const map = new Map<string, { debit: number; credit: number; balance: number }>();
    for (const row of rows) {
      const currencyCode = String(row.currencyCode ?? 'USD');
      const current = map.get(currencyCode) ?? { debit: 0, credit: 0, balance: 0 };
      current.debit += Number(row.debit ?? 0);
      current.credit += Number(row.credit ?? 0);
      current.balance = Number(row.balance ?? current.balance);
      map.set(currencyCode, current);
    }
    return [...map.entries()].map(([currencyCode, totals]) => ({ currencyCode, ...totals }));
  }, [rows]);

  useEffect(() => {
    if (!companyId) {
      setLoading(false);
      setError('Firma seçilmedi');
      return;
    }
    void financeService
      .companyStatement(companyId)
      .then((r) => setRows(r as Record<string, unknown>[]))
      .catch((e) => setError(e instanceof Error ? e.message : 'Yüklenemedi'))
      .finally(() => setLoading(false));
  }, [companyId]);

  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />;
  if (error) return <Text style={styles.error}>{error}</Text>;

  return (
    <FormPageLayout title={companyName ?? 'Cari Ekstre'} subtitle={`${rows.length} hareket`}>
      {rows.length === 0 ? (
        <Text style={styles.empty}>Hareket yok</Text>
      ) : (
        <>
          {balances.map((item) => (
            <InfoCard
              key={item.currencyCode}
              label={`${item.currencyCode} Cari Hesap`}
              value={`Bakiye ${money(item.balance, item.currencyCode)} · Borç ${money(item.debit, item.currencyCode)} · Alacak ${money(item.credit, item.currencyCode)}`}
            />
          ))}
          {rows.map((item, i) => (
            <InfoCard
              key={String(item.id ?? i)}
              label={`${String(item.transactionDate ?? item.date ?? item.createdAt ?? '—')} · ${String(item.currencyCode ?? '')}`}
              value={`${String(item.description ?? item.type ?? 'Hareket')} · Borç ${money(item.debit, item.currencyCode)} · Alacak ${money(item.credit, item.currencyCode)} · Bakiye ${money(item.balance, item.currencyCode)}`}
            />
          ))}
        </>
      )}
    </FormPageLayout>
  );
}

const styles = StyleSheet.create({
  error: { ...typography.bodySm, color: colors.accentRed, padding: 16 },
  empty: { ...typography.bodySm, color: colors.textMuted, textAlign: 'center', paddingVertical: 32 },
});
