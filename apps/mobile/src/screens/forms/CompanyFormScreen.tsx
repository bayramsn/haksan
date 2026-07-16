import { useEffect, useState } from 'react';
import { Alert, ActivityIndicator, StyleSheet } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { companyService } from '@/src/api/services';
import { Button } from '@/src/ui/Button';
import { FormPageLayout } from '@/src/ui/FormPageLayout';
import { Input } from '@/src/ui/Input';
import { colors } from '@/src/theme/tokens';

/** Stitch #21 Yeni Firma / düzenleme */
export function CompanyFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEdit = Boolean(id);
  const [legalTitle, setLegalTitle] = useState('');
  const [shortName, setShortName] = useState('');
  const [taxNumber, setTaxNumber] = useState('');
  const [sector, setSector] = useState('');
  const [city, setCity] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(isEdit);

  useEffect(() => {
    if (!id) return;
    void companyService
      .get(id)
      .then((c) => {
        setLegalTitle(String(c.legalTitle ?? ''));
        setShortName(String(c.shortName ?? ''));
        setTaxNumber(String(c.taxNumber ?? ''));
        setSector(String(c.sector ?? ''));
        const addr = (c as { addresses?: { province?: string }[] }).addresses?.[0];
        setCity(String(addr?.province ?? ''));
        setPhone(String((c as { primaryPhone?: string }).primaryPhone ?? ''));
        setEmail(String((c as { primaryEmail?: string }).primaryEmail ?? ''));
      })
      .catch((e) => Alert.alert('Hata', e instanceof Error ? e.message : 'Firma yüklenemedi'))
      .finally(() => setBooting(false));
  }, [id]);

  const submit = async () => {
    if (!legalTitle.trim()) {
      Alert.alert('Hata', 'Ünvan zorunlu');
      return;
    }
    setLoading(true);
    try {
      const body = {
        companyType: 'company' as const,
        relationTypeCode: 'customer' as const,
        customerStatusCode: 'potential' as const,
        legalTitle: legalTitle.trim(),
        shortName: shortName || undefined,
        taxNumber: taxNumber || undefined,
        sector: sector || undefined,
        primaryPhone: phone || undefined,
        primaryEmail: email || undefined,
        address: city ? { country: 'Türkiye', province: city, fullAddress: city } : undefined,
      };
      if (isEdit && id) {
        await companyService.update(id, body);
        Alert.alert('Başarılı', 'Firma güncellendi', [{ text: 'Tamam', onPress: () => router.back() }]);
      } else {
        const company = await companyService.create(body);
        Alert.alert('Başarılı', 'Firma oluşturuldu', [
          { text: 'Detay', onPress: () => router.replace(`/modules/customers/${company.id}`) },
          { text: 'Tamam', onPress: () => router.back() },
        ]);
      }
    } catch (e) {
      Alert.alert('Hata', e instanceof Error ? e.message : 'Kayıt başarısız');
    } finally {
      setLoading(false);
    }
  };

  if (booting) return <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />;

  return (
    <FormPageLayout title={isEdit ? 'Firma Düzenle' : 'Yeni Firma'}>
      <Input label="Ünvan *" value={legalTitle} onChangeText={setLegalTitle} />
      <Input label="Kısa Ad" value={shortName} onChangeText={setShortName} />
      <Input label="Vergi No" value={taxNumber} onChangeText={setTaxNumber} />
      <Input label="Sektör" value={sector} onChangeText={setSector} />
      <Input label="İl / Şehir" value={city} onChangeText={setCity} />
      <Input label="Telefon" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <Input label="E-posta" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
      <Button title={isEdit ? 'Güncelle' : 'Kaydet'} onPress={() => void submit()} loading={loading} />
    </FormPageLayout>
  );
}
