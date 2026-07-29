import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { financeService } from '@/src/api/services';
import { CompanyPicker } from '@/src/ui/CompanyPicker';
import { Button } from '@/src/ui/Button';
import { Input } from '@/src/ui/Input';
import { FormPageLayout } from '@/src/ui/FormPageLayout';

/** Stitch #42 Tahsilat / Ödeme Kaydet */
export function PaymentFormScreen() {
  const { companyId: initialCompanyId, companyName: initialCompanyName } = useLocalSearchParams<{
    companyId?: string;
    companyName?: string;
  }>();
  const [companyId, setCompanyId] = useState(initialCompanyId ?? '');
  const [companyName, setCompanyName] = useState(initialCompanyName ?? '');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('TRY');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (initialCompanyId) setCompanyId(initialCompanyId);
    if (initialCompanyName) setCompanyName(initialCompanyName);
  }, [initialCompanyId, initialCompanyName]);

  const submit = async () => {
    if (!companyId || !amount.trim()) {
      Alert.alert('Hata', 'Firma ve tutar zorunlu');
      return;
    }
    setLoading(true);
    try {
      await financeService.createPayment({
        direction: 'in',
        companyId,
        amount: Number(amount),
        currencyCode: currency,
        paymentDate: new Date(paymentDate),
        paymentMethod: 'bank_transfer',
        notes: notes || undefined,
      });
      Alert.alert('Başarılı', 'Ödeme kaydedildi', [{ text: 'Tamam', onPress: () => router.back() }]);
    } catch (e) {
      Alert.alert('Hata', e instanceof Error ? e.message : 'Kayıt başarısız');
    } finally {
      setLoading(false);
    }
  };

  return (
    <FormPageLayout title="Tahsilat Kaydet">
      <CompanyPicker
        value={companyId}
        displayName={companyName}
        onSelect={(c) => {
          setCompanyId(c.id);
          setCompanyName(String(c.legalTitle ?? c.shortName ?? c.id));
        }}
      />
      <Input label="Tutar *" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
      <Input label="Para Birimi" value={currency} onChangeText={setCurrency} autoCapitalize="characters" />
      <Input label="Tarih" value={paymentDate} onChangeText={setPaymentDate} />
      <Input label="Not" value={notes} onChangeText={setNotes} multiline />
      <Button title="Kaydet" onPress={() => void submit()} loading={loading} />
    </FormPageLayout>
  );
}
