import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { opportunityService } from '@/src/api/services';
import { useAuth } from '@/src/auth/AuthProvider';
import { ServiceCustomerPickerSheet } from '@/src/ui/forms/ServiceTicketPickerWidgets';
import { ContactPicker } from '@/src/ui/ContactPicker';
import { OfferFormFooter } from '@/src/ui/offer/OfferFormWidgets';
import {
  CATEGORY_OPTIONS,
  OpportunityCompanyCard,
  OpportunityCompanySelectRow,
  OpportunityCurrencySegment,
  OpportunityDateField,
  OpportunityField,
  OpportunityFormHeader,
  OpportunityMoneyField,
  OpportunityOwnerRow,
  OpportunityProbabilityControl,
  OpportunityProductChips,
  OpportunitySectionTitle,
  OpportunitySelectField,
  OpportunitySourceChips,
  OpportunityStepper,
  OpportunitySummaryCard,
  OpportunityTagChips,
  parseMoneyInput,
  type OpportunityProductChip,
} from '@/src/ui/opportunity/OpportunityFormWidgets';
import { Screen } from '@/src/ui/Screen';
import { colors, layout, spacing } from '@/src/theme/tokens';

function newProductChip(name: string, quantity = 1): OpportunityProductChip {
  return { id: Math.random().toString(36).slice(2), name, quantity };
}

function formatDateTr(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('tr-TR');
  } catch {
    return iso;
  }
}

/** Stitch `fc086d9b` · `cdd7b1b1` — 4 adımlı Yeni Satış Kartı sihirbazı */
export function OpportunityFormScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { id, companyId: initialCompanyId } = useLocalSearchParams<{ id?: string; companyId?: string }>();
  const isEdit = Boolean(id);

  const [step, setStep] = useState(initialCompanyId ? 1 : 0);
  const [companyId, setCompanyId] = useState(initialCompanyId ?? '');
  const [companyName, setCompanyName] = useState('');
  const [contactId, setContactId] = useState('');
  const [contactName, setContactName] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('cnc');
  const [products, setProducts] = useState<OpportunityProductChip[]>([]);
  const [value, setValue] = useState('');
  const [currency, setCurrency] = useState('TRY');
  const [probability, setProbability] = useState(65);
  const [closeDate, setCloseDate] = useState('');
  const [sourceCode, setSourceCode] = useState('referral');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(isEdit);
  const [companyPickerOpen, setCompanyPickerOpen] = useState(false);

  const ownerName = user?.fullName ?? 'Kullanıcı';
  const categoryLabel = CATEGORY_OPTIONS.find((c) => c.value === category)?.label ?? category;

  useEffect(() => {
    if (!id) return;
    void opportunityService
      .get(id)
      .then((o) => {
        setTitle(String(o.title ?? ''));
        setValue(o.estimatedValue != null ? String(o.estimatedValue) : '');
        setCurrency(String(o.currencyCode ?? 'TRY'));
        setProbability(o.probability != null ? Number(o.probability) : 50);
        setCompanyId(String(o.companyId ?? ''));
        setCompanyName(String(o.companyName ?? o.company?.legalTitle ?? ''));
        setCloseDate(o.expectedCloseDate ? String(o.expectedCloseDate).slice(0, 10) : '');
        setDescription(String(o.description ?? ''));
        setSourceCode(String(o.sourceCode ?? 'referral'));
        if (o.primaryContactId) {
          setContactId(String(o.primaryContactId));
          setContactName(String(o.contactName ?? ''));
        }
      })
      .catch((e) => Alert.alert('Hata', e instanceof Error ? e.message : 'Yüklenemedi'))
      .finally(() => setBooting(false));
  }, [id]);

  const amount = useMemo(() => parseMoneyInput(value), [value]);

  const buildDescription = () => {
    const parts: string[] = [];
    if (products.length) {
      parts.push(`Ürünler: ${products.map((p) => `${p.name} x${p.quantity}`).join(', ')}`);
    }
    if (tags.length) parts.push(`Etiketler: ${tags.join(', ')}`);
    if (description.trim()) parts.push(description.trim());
    return parts.join('\n').trim() || undefined;
  };

  const goBack = () => {
    if (step === 0) router.back();
    else setStep((s) => s - 1);
  };

  const goNext = () => {
    if (step === 0) {
      if (!companyId) {
        Alert.alert('Firma gerekli', 'Devam etmek için firma seçin.');
        return;
      }
      setStep(1);
      return;
    }
    if (step === 1) {
      if (!title.trim()) {
        Alert.alert('Başlık gerekli', 'Satış kartı başlığını girin.');
        return;
      }
      if (!amount) {
        Alert.alert('Tutar gerekli', 'Beklenen tutarı girin.');
        return;
      }
      setStep(2);
      return;
    }
    if (step === 2) {
      setStep(3);
    }
  };

  const submit = async () => {
    if (!companyId || !title.trim()) {
      Alert.alert('Hata', 'Firma ve başlık zorunlu');
      return;
    }
    setLoading(true);
    try {
      const body = {
        companyId,
        title: title.trim(),
        estimatedValue: amount || undefined,
        currencyCode: currency === 'TL' ? 'TRY' : currency,
        probability,
        expectedCloseDate: closeDate ? new Date(closeDate) : undefined,
        primaryContactId: contactId || undefined,
        ownerUserId: user?.id,
        sourceCode,
        description: buildDescription(),
      };
      if (isEdit && id) {
        await opportunityService.update(id, body);
        Alert.alert('Başarılı', 'Satış kartı güncellendi', [{ text: 'Tamam', onPress: () => router.back() }]);
      } else {
        const opp = await opportunityService.create(body);
        Alert.alert('Başarılı', 'Satış kartı oluşturuldu', [
          { text: 'Detay', onPress: () => router.replace(`/modules/sales-cases/${opp.id}`) },
          { text: 'Tamam', onPress: () => router.back() },
        ]);
      }
    } catch (e) {
      Alert.alert('Hata', e instanceof Error ? e.message : 'İşlem başarısız');
    } finally {
      setLoading(false);
    }
  };

  const addProduct = () => {
    Alert.prompt?.(
      'Ürün Ekle',
      'Ürün adını girin',
      (name) => {
        const trimmed = name?.trim();
        if (!trimmed) return;
        setProducts((prev) => [...prev, newProductChip(trimmed)]);
      },
    );
    if (!Alert.prompt) {
      setProducts((prev) => [...prev, newProductChip(`Ürün ${prev.length + 1}`)]);
    }
  };

  const addTag = () => {
    Alert.prompt?.('Etiket Ekle', 'Etiket adını girin', (tag) => {
      const trimmed = tag?.trim();
      if (!trimmed || tags.includes(trimmed)) return;
      setTags((prev) => [...prev, trimmed]);
    });
  };

  const toggleTag = (tag: string) => {
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  const footerNextLabel =
    step === 0 ? 'Sonraki: Ürün' : step === 1 ? 'Sonraki: Detay' : step === 2 ? 'Sonraki: Özet' : 'Oluştur';

  if (booting) {
    return (
      <Screen padded={false}>
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      </Screen>
    );
  }

  return (
    <Screen padded={false} edges={['left', 'right']}>
      <OpportunityFormHeader
        title={isEdit ? 'Satış Kartı Düzenle' : 'Yeni Satış Kartı'}
        onCancel={() => router.back()}
        onSave={step === 3 ? () => void submit() : undefined}
        saveDisabled={!companyId || !title.trim()}
        saving={loading}
      />

      <OpportunityStepper activeIndex={step} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: 120 + insets.bottom }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {step > 0 && companyName ? (
            <OpportunityCompanyCard companyName={companyName} onChange={() => setCompanyPickerOpen(true)} />
          ) : null}

          {step === 0 ? (
            <View style={styles.stepBlock}>
              <OpportunitySectionTitle title="Firma Seçimi" />
              <OpportunityCompanySelectRow
                companyName={companyName}
                onPress={() => setCompanyPickerOpen(true)}
              />
              {companyName ? (
                <OpportunityCompanyCard
                  companyName={companyName}
                  onChange={() => setCompanyPickerOpen(true)}
                />
              ) : null}
            </View>
          ) : null}

          {step === 1 ? (
            <View style={styles.stepBlock}>
              <OpportunitySectionTitle title="Ürün ve Tutar Bilgileri" />
              <View style={styles.fieldsGap}>
                <OpportunityField
                  label="Başlık *"
                  value={title}
                  onChangeText={setTitle}
                  placeholder="CNC Torna Tezgahı Satışı"
                />
                <OpportunitySelectField
                  label="Kategori *"
                  value={category}
                  options={CATEGORY_OPTIONS.map((c) => ({ label: c.label, value: c.value }))}
                  onChange={setCategory}
                />
                <OpportunityProductChips
                  products={products}
                  onRemove={(pid) => setProducts((prev) => prev.filter((p) => p.id !== pid))}
                  onAdd={addProduct}
                />
                <OpportunityMoneyField
                  label="Beklenen Tutar *"
                  value={value}
                  onChangeText={setValue}
                  currencyCode={currency}
                  large
                />
                <OpportunityCurrencySegment value={currency} onChange={setCurrency} />
                <OpportunityProbabilityControl value={probability} onChange={setProbability} />
              </View>
            </View>
          ) : null}

          {step === 2 ? (
            <View style={styles.stepBlock}>
              <OpportunitySectionTitle title="Detay ve Atama Bilgileri" />
              <View style={styles.fieldsGap}>
                <OpportunityDateField
                  label="Beklenen Kapanış Tarihi"
                  value={closeDate}
                  onChangeText={setCloseDate}
                />
                <OpportunityOwnerRow name={ownerName} />
                <View style={styles.fieldWrap}>
                  <ContactPicker
                    companyId={companyId}
                    companyName={companyName}
                    value={contactId}
                    displayName={contactName}
                    onSelect={(c) => {
                      setContactId(c?.id ?? '');
                      setContactName(
                        c
                          ? String(
                              c.fullName ?? [c.firstName, c.lastName].filter(Boolean).join(' ') ?? c.id,
                            )
                          : '',
                      );
                    }}
                  />
                </View>
                <OpportunitySourceChips value={sourceCode} onChange={setSourceCode} />
                <OpportunityField
                  label="Açıklama"
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Ek notlar, görüşme özeti…"
                  multiline
                  style={styles.notesInput}
                />
                <OpportunityTagChips tags={tags} onToggle={toggleTag} onAdd={addTag} />
              </View>
            </View>
          ) : null}

          {step === 3 ? (
            <View style={styles.stepBlock}>
              <OpportunitySectionTitle title="Özet" />
              <OpportunitySummaryCard
                companyName={companyName}
                title={title}
                categoryLabel={categoryLabel}
                products={products}
                amount={amount}
                currencyCode={currency}
                probability={probability}
                closeDate={closeDate ? formatDateTr(closeDate) : undefined}
                ownerName={ownerName}
                tags={tags}
              />
              {loading ? <ActivityIndicator color={colors.primary} style={styles.loader} /> : null}
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      <OfferFormFooter
        onBack={step > 0 ? goBack : undefined}
        nextLabel={footerNextLabel}
        onNext={step === 3 ? () => void submit() : goNext}
        nextDisabled={loading}
      />

      <ServiceCustomerPickerSheet
        visible={companyPickerOpen}
        selectedId={companyId}
        onClose={() => setCompanyPickerOpen(false)}
        onSelect={(company) => {
          setCompanyId(company.id);
          setCompanyName(company.name);
          setContactId('');
          setContactName('');
          setCompanyPickerOpen(false);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flex: 1, backgroundColor: colors.canvas },
  scrollContent: {
    paddingHorizontal: layout.containerMargin,
    paddingTop: spacing.lg,
  },
  stepBlock: { marginBottom: spacing.lg },
  fieldWrap: { gap: 6 },
  fieldsGap: { gap: spacing.lg },
  notesInput: { minHeight: 96, textAlignVertical: 'top', paddingTop: spacing.md },
  loader: { marginTop: spacing.lg },
});
