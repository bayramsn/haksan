import React, { useLayoutEffect } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { companyService, financeService } from '../../api/services';
import { useAuth } from '../../lib/auth';
import { Badge, Button, Card, EmptyState, Loading, Muted, Screen, SectionTitle, colors } from '../../ui';

const STATUS_TONE: Record<string, 'ok' | 'warn' | 'danger' | 'neutral'> = {
  active: 'ok',
  potential: 'warn',
  passive: 'neutral',
  blacklist: 'danger',
};

export function CompanyDetailScreen({ navigation, route }: { navigation: any; route: any }) {
  const id: string = route.params.id;
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  const canWrite = hasPermission('companies.update');

  const company = useQuery({ queryKey: ['company', id], queryFn: () => companyService.get(id) });
  const finance = useQuery({ queryKey: ['company-finance', id], queryFn: () => financeService.companySummary(id), retry: false });
  const debt = useQuery({ queryKey: ['company-debt', id], queryFn: () => companyService.crossDivisionDebt(id), retry: false });

  const remove = useMutation({
    mutationFn: () => companyService.remove(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['companies'] });
      navigation.goBack();
    },
    onError: (e: any) => Alert.alert('Silinemedi', e?.message ?? 'Hata'),
  });

  useLayoutEffect(() => {
    if (!canWrite) return;
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity onPress={() => navigation.navigate('CompanyForm', { id })} style={{ paddingHorizontal: 8 }}>
          <Text style={{ color: colors.text, fontWeight: '800' }}>Düzenle</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, id, canWrite]);

  if (company.isLoading) return <Loading />;
  if (company.isError || !company.data) return <Screen><EmptyState title="Firma yüklenemedi" subtitle={(company.error as Error)?.message} /></Screen>;
  const c: any = company.data;

  const confirmDelete = () =>
    Alert.alert('Firmayı sil', `${c.legalTitle} silinsin mi?`, [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: () => remove.mutate() },
    ]);

  return (
    <Screen refreshing={company.isRefetching} onRefresh={() => company.refetch()}>
      <Card>
        <Text style={st.title}>{c.legalTitle}</Text>
        {c.shortName ? <Muted>{c.shortName}</Muted> : null}
        <View style={st.badges}>
          {c.relationType ? <Badge label={c.relationType.name} tone="neutral" /> : null}
          {c.customerStatus ? <Badge label={c.customerStatus.name} tone={STATUS_TONE[c.customerStatus.code] ?? 'neutral'} /> : null}
        </View>
      </Card>

      {debt.data?.hasDebt ? (
        <Card style={st.warn}>
          <Text style={st.warnTitle}>⚠ Başka bölümde açık borç</Text>
          <Muted>
            {debt.data.departments?.map((d) => d.name).join(', ') || 'Diğer bölümler'}
            {debt.data.amount != null ? ` · ${formatMoney(debt.data.amount)}` : ''}
          </Muted>
        </Card>
      ) : null}

      {finance.data?.byCurrency?.length ? (
        <Card>
          <SectionTitle>Finans Özeti</SectionTitle>
          {finance.data.byCurrency.map((b: any) => (
            <View key={b.currencyCode} style={st.finRow}>
              <Text style={st.finCur}>{b.currencyCode}</Text>
              <View style={st.finCols}>
                <FinCell label="Borç" value={formatMoney(b.borc)} tone={b.borc > 0 ? colors.danger : colors.textMuted} />
                <FinCell label="Alacak" value={formatMoney(b.alacak)} tone={colors.accent} />
                <FinCell label="Net" value={formatMoney(b.net)} tone={b.net > 0 ? colors.danger : colors.text} />
              </View>
            </View>
          ))}
          {finance.data.nearestDueDate ? (
            <Muted>
              Yaklaşan vade: {new Date(finance.data.nearestDueDate).toLocaleDateString('tr-TR')} ·{' '}
              {formatMoney(finance.data.nearestDueAmount)} {finance.data.nearestDueCurrency}
            </Muted>
          ) : null}
        </Card>
      ) : null}

      <Card>
        <SectionTitle>Bilgiler</SectionTitle>
        <InfoRow label="Sektör" value={c.sector} />
        <InfoRow label="Vergi dairesi" value={c.taxOffice} />
        <InfoRow label="Vergi no" value={c.taxNumber} />
        <InfoRow label="Web" value={c.website} />
        {c.notes ? <InfoRow label="Not" value={c.notes} /> : null}
      </Card>

      {(c.phones?.length || c.emails?.length || c.addresses?.length) ? (
        <Card>
          <SectionTitle>İletişim</SectionTitle>
          {c.phones?.map((p: any, i: number) => <InfoRow key={`p${i}`} label={p.phoneType ?? 'Telefon'} value={p.phone} />)}
          {c.emails?.map((e: any, i: number) => <InfoRow key={`e${i}`} label={e.emailType ?? 'E-posta'} value={e.email} />)}
          {c.addresses?.map((a: any, i: number) => (
            <InfoRow key={`a${i}`} label="Adres" value={a.fullAddress || [a.street, a.district, a.province].filter(Boolean).join(', ')} />
          ))}
        </Card>
      ) : null}

      {canWrite ? <Button label="Firmayı sil" variant="danger" onPress={confirmDelete} loading={remove.isPending} /> : null}
    </Screen>
  );
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <View style={st.infoRow}>
      <Text style={st.infoLabel}>{label}</Text>
      <Text style={st.infoValue}>{value}</Text>
    </View>
  );
}

function FinCell({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <View style={st.finCell}>
      <Text style={st.finCellLabel}>{label}</Text>
      <Text style={[st.finCellValue, { color: tone }]}>{value}</Text>
    </View>
  );
}

function formatMoney(value?: number | null): string {
  if (value == null) return '—';
  return Number(value).toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

const st = StyleSheet.create({
  title: { color: colors.text, fontSize: 20, fontWeight: '900' },
  badges: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  warn: { backgroundColor: '#fffbeb', borderColor: '#fde68a' },
  warnTitle: { color: '#b45309', fontWeight: '900', fontSize: 14 },
  finRow: { gap: 6, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 },
  finCur: { color: colors.text, fontWeight: '900', fontSize: 13 },
  finCols: { flexDirection: 'row', gap: 12 },
  finCell: { flex: 1 },
  finCellLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
  finCellValue: { fontSize: 15, fontWeight: '900' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 },
  infoLabel: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },
  infoValue: { color: colors.text, fontSize: 13, flexShrink: 1, textAlign: 'right' },
});
