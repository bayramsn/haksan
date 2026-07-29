import { useState } from 'react';
import { Alert, StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';
import { inventoryService } from '@/src/api/services';
import { CompanyPicker } from '@/src/ui/CompanyPicker';
import { Button } from '@/src/ui/Button';
import { Input } from '@/src/ui/Input';
import { FormPageLayout } from '@/src/ui/FormPageLayout';

/** Stitch #46 Yeni Makine Ekleme */
export function MachineFormScreen() {
  const [companyId, setCompanyId] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [inventoryItemId, setInventoryItemId] = useState('');
  const [installationDate, setInstallationDate] = useState('');
  const [warrantyEnd, setWarrantyEnd] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!companyId.trim()) {
      Alert.alert('Hata', 'Firma seçin');
      return;
    }
    setLoading(true);
    try {
      await inventoryService.createCustomerDevice({
        companyId: companyId.trim(),
        inventoryItemId: inventoryItemId.trim() || undefined,
        installationDate: installationDate ? new Date(installationDate) : undefined,
        warrantyEndDate: warrantyEnd ? new Date(warrantyEnd) : undefined,
        notes: notes || undefined,
      });
      Alert.alert('Başarılı', 'Makine kaydı oluşturuldu', [{ text: 'Tamam', onPress: () => router.back() }]);
    } catch (e) {
      Alert.alert('Hata', e instanceof Error ? e.message : 'Kayıt başarısız');
    } finally {
      setLoading(false);
    }
  };

  return (
    <FormPageLayout title="Yeni Makine">
      <CompanyPicker
        value={companyId}
        displayName={companyName}
        onSelect={(c) => {
          setCompanyId(c.id);
          setCompanyName(String(c.legalTitle ?? c.shortName ?? c.id));
        }}
      />
      <Input label="Stok / Seri ID (opsiyonel)" value={inventoryItemId} onChangeText={setInventoryItemId} autoCapitalize="none" />
      <Input label="Kurulum Tarihi" value={installationDate} onChangeText={setInstallationDate} placeholder="YYYY-MM-DD" />
      <Input label="Garanti Bitiş" value={warrantyEnd} onChangeText={setWarrantyEnd} placeholder="YYYY-MM-DD" />
      <Input label="Notlar" value={notes} onChangeText={setNotes} multiline />
      <Button title="Kaydet" onPress={() => void submit()} loading={loading} />
    </FormPageLayout>
  );
}
