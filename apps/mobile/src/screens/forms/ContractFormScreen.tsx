import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { documentService, quoteService } from '@/src/api/services';
import { documentNoFromRow } from '@/src/ui/offer/offerHelpers';
import { Button } from '@/src/ui/Button';
import { Input } from '@/src/ui/Input';
import { FormPageLayout } from '@/src/ui/FormPageLayout';
import { colors, fonts, radius, spacing, typography } from '@/src/theme/tokens';

/** Stitch Yeni Sözleşme — contract sheet (Industrial Authority) */
export function ContractFormScreen() {
  const { quoteId: initialQuoteId } = useLocalSearchParams<{ quoteId?: string }>();
  const today = new Date().toISOString().slice(0, 10);

  const [quoteId, setQuoteId] = useState(initialQuoteId ?? '');
  const [quoteLabel, setQuoteLabel] = useState('');
  const [contractNo, setContractNo] = useState('');
  const [signedDate, setSignedDate] = useState(today);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!initialQuoteId) return;
    void (async () => {
      try {
        const quote = (await quoteService.get(initialQuoteId)) as Record<string, unknown>;
        setQuoteId(initialQuoteId);
        const company = quote.company as Record<string, unknown> | undefined;
        const companyName = String(company?.shortName ?? company?.legalTitle ?? '');
        setQuoteLabel(`${documentNoFromRow(quote)}${companyName ? ` · ${companyName}` : ''}`);
      } catch {
        setQuoteLabel(initialQuoteId);
      }
    })();
  }, [initialQuoteId]);

  const suggestNo = () => {
    const year = new Date().getFullYear();
    const seq = String(Math.floor(Math.random() * 900) + 100);
    setContractNo(`SOZ-${year}/${seq}`);
  };

  useEffect(() => {
    if (!contractNo) suggestNo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async () => {
    if (!quoteId) {
      Alert.alert('Hata', 'Bağlı teklif bulunamadı');
      return;
    }
    if (!contractNo.trim()) {
      Alert.alert('Hata', 'Sözleşme no zorunludur');
      return;
    }
    setLoading(true);
    try {
      const created = await documentService.createContract({
        quoteId,
        contractNo: contractNo.trim(),
        signedDate: new Date(signedDate),
        statusCode: 'draft',
      });
      const id = String((created as { id?: string }).id ?? '');
      Alert.alert('Başarılı', 'Sözleşme oluşturuldu', [
        id
          ? { text: 'Detay', onPress: () => router.replace(`/modules/contracts/${id}`) }
          : undefined,
        { text: 'Tamam', onPress: () => router.back() },
      ].filter(Boolean) as { text: string; onPress?: () => void }[]);
    } catch (e) {
      Alert.alert('Hata', e instanceof Error ? e.message : 'Sözleşme oluşturulamadı');
    } finally {
      setLoading(false);
    }
  };

  return (
    <FormPageLayout title="Yeni Sözleşme" subtitle="Teklife bağlı sözleşme kaydı">
      {quoteLabel ? (
        <View style={styles.field}>
          <Text style={styles.label}>Bağlı Teklif</Text>
          <View style={styles.quoteChip}>
            <Text style={styles.quoteChipText} numberOfLines={2}>
              {quoteLabel}
            </Text>
          </View>
        </View>
      ) : null}

      <View style={styles.field}>
        <Text style={styles.label}>Sözleşme No *</Text>
        <View style={styles.inlineRow}>
          <TextInput
            value={contractNo}
            onChangeText={setContractNo}
            placeholder="SOZ-2026/001"
            placeholderTextColor={colors.textMuted}
            style={styles.textInput}
          />
          <Pressable onPress={suggestNo} style={styles.suggestBtn}>
            <Text style={styles.suggestText}>Öner</Text>
          </Pressable>
        </View>
      </View>

      <Input label="İmza Tarihi" value={signedDate} onChangeText={setSignedDate} />

      <View style={styles.actions}>
        <Button title="Vazgeç" variant="secondary" onPress={() => router.back()} />
        <Button title="Sözleşme Oluştur" onPress={() => void submit()} loading={loading} />
      </View>
    </FormPageLayout>
  );
}

const styles = StyleSheet.create({
  field: { gap: spacing.xs },
  label: { ...typography.caption, color: colors.outline, textTransform: 'uppercase' },
  quoteChip: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  quoteChipText: { ...typography.bodySm, color: '#fff', fontFamily: fonts.semibold },
  inlineRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  textInput: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    paddingHorizontal: spacing.md,
    ...typography.bodySm,
    color: colors.textPrimary,
  },
  suggestBtn: {
    height: 48,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestText: { ...typography.label, color: colors.primary },
  actions: { gap: spacing.sm, marginTop: spacing.lg },
});
