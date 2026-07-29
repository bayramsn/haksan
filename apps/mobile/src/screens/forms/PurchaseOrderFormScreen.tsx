import { useEffect, useState } from 'react';
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
import { purchaseOrderService } from '@/src/api/services';
import {
  PurchaseBudgetBanner,
  PurchaseFormFooter,
  PurchaseFormHeader,
  PurchaseFormStepper,
  PurchaseInputField,
  PurchasePaymentSection,
  PurchaseSectionCard,
  PurchaseSupplierRow,
} from '@/src/ui/purchase/PurchaseOrderFormWidgets';
import { SupplierPickerSheet } from '@/src/ui/purchase/SupplierPickerWidgets';
import { Screen } from '@/src/ui/Screen';
import { colors, layout, spacing } from '@/src/theme/tokens';

/** Stitch Yeni Satın Alma — `9a1c4dcd` */
export function PurchaseOrderFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEdit = Boolean(id);

  const [supplierCompanyId, setSupplierCompanyId] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [incoterm, setIncoterm] = useState('');
  const [shipmentReference, setShipmentReference] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentType, setPaymentType] = useState<'cash' | 'term' | 'leasing'>('cash');
  const [paymentTermDaysInput, setPaymentTermDaysInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(isEdit);
  const [supplierPickerOpen, setSupplierPickerOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    void purchaseOrderService
      .get(id)
      .then((po) => {
        setNotes(String(po.notes ?? ''));
        setExpectedDate(po.expectedDate ? String(po.expectedDate).slice(0, 10) : '');
        setIncoterm(String(po.incoterm ?? ''));
        setShipmentReference(String(po.shipmentReference ?? ''));
        setSupplierName(String(po.supplier?.legalTitle ?? po.supplier?.shortName ?? ''));
        setPaymentType((po.paymentType as 'cash' | 'term' | 'leasing') ?? 'cash');
        setPaymentTermDaysInput(po.paymentTermDays ? String(po.paymentTermDays) : '');
      })
      .catch((e) => Alert.alert('Hata', e instanceof Error ? e.message : 'Sipariş yüklenemedi'))
      .finally(() => setBooting(false));
  }, [id]);

  const submit = async () => {
    if (!isEdit && !supplierCompanyId.trim()) {
      Alert.alert('Hata', 'Tedarikçi seçimi zorunludur.');
      return;
    }

    let paymentTermDays: number | undefined;
    if (paymentType === 'term') {
      const parsed = Number(paymentTermDaysInput);
      if (!paymentTermDaysInput.trim() || !Number.isFinite(parsed) || parsed <= 0) {
        Alert.alert('Hata', 'Vadeli ödeme için geçerli bir gün sayısı girin.');
        return;
      }
      paymentTermDays = Math.round(parsed);
    }

    setLoading(true);
    try {
      if (isEdit && id) {
        await purchaseOrderService.update(id, {
          notes: notes || undefined,
          expectedDate: expectedDate ? new Date(expectedDate) : undefined,
          incoterm: incoterm || undefined,
          shipmentReference: shipmentReference || undefined,
          paymentType,
          paymentTermDays: paymentType === 'term' ? paymentTermDays : undefined,
        });
        Alert.alert('Başarılı', 'Sipariş güncellendi', [
          { text: 'Tamam', onPress: () => router.back() },
        ]);
      } else {
        const created = await purchaseOrderService.create({
          purchaseType: 'commercial',
          paymentType,
          paymentTermDays: paymentType === 'term' ? paymentTermDays : undefined,
          supplierCompanyId: supplierCompanyId.trim(),
          orderDate: new Date(),
          currencyCode: 'TRY',
          notes: notes || undefined,
          expectedDate: expectedDate ? new Date(expectedDate) : undefined,
          incoterm: incoterm || undefined,
          shipmentReference: shipmentReference || undefined,
        });
        const newId = String((created as { id?: string }).id ?? '');
        Alert.alert('Başarılı', 'Satın alma siparişi oluşturuldu', [
          {
            text: 'Detaya Git',
            onPress: () =>
              newId ? router.replace(`/modules/purchase-orders/${newId}`) : router.back(),
          },
        ]);
      }
    } catch (e) {
      Alert.alert('Hata', e instanceof Error ? e.message : 'İşlem başarısız');
    } finally {
      setLoading(false);
    }
  };

  if (booting) {
    return (
      <Screen>
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />
      </Screen>
    );
  }

  return (
    <Screen padded={false} edges={['left', 'right']}>
      <PurchaseFormHeader
        title={isEdit ? 'Satın Alma Düzenle' : 'Yeni Satın Alma'}
        onClose={() => router.back()}
        onSave={() => void submit()}
        saveLabel={isEdit ? 'Kaydet' : 'Taslağı Kaydet'}
        saving={loading}
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <PurchaseFormStepper activeIndex={0} />
          {!isEdit ? <PurchaseBudgetBanner /> : null}

          <PurchaseSectionCard title="Tedarikçi Bilgileri">
            {!isEdit ? (
              <PurchaseSupplierRow
                supplierName={supplierName}
                onChange={() => setSupplierPickerOpen(true)}
              />
            ) : (
              <PurchaseSupplierRow supplierName={supplierName || '—'} onChange={() => {}} />
            )}
          </PurchaseSectionCard>

          <PurchaseSectionCard title="Sevkiyat & Lojistik">
            <PurchaseInputField
              label="Teslim Tarihi"
              value={expectedDate}
              onChangeText={setExpectedDate}
              placeholder="YYYY-MM-DD"
            />
            <PurchaseInputField
              label="INCOTERMS"
              value={incoterm}
              onChangeText={setIncoterm}
              placeholder="DDP, FOB..."
            />
            <PurchaseInputField
              label="Sevkiyat Referansı"
              value={shipmentReference}
              onChangeText={setShipmentReference}
              placeholder="Opsiyonel"
            />
          </PurchaseSectionCard>

          <PurchaseSectionCard title="Onay & Ödeme">
            <PurchasePaymentSection
              paymentType={paymentType}
              termDays={paymentTermDaysInput}
              onPaymentTypeChange={setPaymentType}
              onTermDaysChange={setPaymentTermDaysInput}
            />
            <PurchaseInputField
              label="Notlar"
              value={notes}
              onChangeText={setNotes}
              placeholder="Eklemek istediğiniz notlar..."
              multiline
              style={styles.notes}
            />
          </PurchaseSectionCard>
        </ScrollView>
      </KeyboardAvoidingView>

      <PurchaseFormFooter
        onCancel={() => router.back()}
        onSubmit={() => void submit()}
        loading={loading}
      />

      <SupplierPickerSheet
        visible={supplierPickerOpen}
        selectedId={supplierCompanyId}
        onClose={() => setSupplierPickerOpen(false)}
        onSelect={(company) => {
          setSupplierCompanyId(company.id);
          setSupplierName(company.name);
          setSupplierPickerOpen(false);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: {
    paddingHorizontal: layout.containerMargin,
    paddingTop: spacing.md,
    paddingBottom: 120,
    gap: spacing.lg,
    backgroundColor: colors.canvas,
  },
  notes: { minHeight: 80, textAlignVertical: 'top' },
});
