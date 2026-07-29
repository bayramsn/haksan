import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { inventoryService, serviceService } from '@/src/api/services';
import { normalizeList } from '@/src/modules/registry';
import { CompanyPicker } from '@/src/ui/CompanyPicker';
import { Button } from '@/src/ui/Button';
import { FormPageLayout } from '@/src/ui/FormPageLayout';
import { Input } from '@/src/ui/Input';
import { SectionTitle } from '@/src/ui/SectionTitle';
import { colors, fonts, radius, spacing, typography } from '@/src/theme/tokens';
import { pressFade } from '@/src/theme/styles';

type DeviceRow = Record<string, unknown>;

function textValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    const text = textValue(value);
    if (text) return text;
  }
  return '';
}

function splitControlUnit(value: unknown): { marka: string; model: string } {
  const text = textValue(value);
  if (!text) return { marka: '', model: '' };
  const [marka, ...modelParts] = text.split(/\s+/);
  return { marka: marka ?? '', model: modelParts.join(' ') };
}

function deviceLabel(device?: DeviceRow): string {
  if (!device) return '';
  return [
    firstText(device.brandName, device.brand),
    firstText(device.model, device.modelCode, device.productModelName, device.modelName),
    firstText(device.serialNumber),
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Stitch Yeni Teslimat / Kurulum Tutanağı — `26fcdef5864e4571a82b015d009da358` */
export function DeliveryFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEdit = Boolean(id);

  const [companyId, setCompanyId] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [machineId, setMachineId] = useState('');
  const [machineLabel, setMachineLabel] = useState('');
  const [machines, setMachines] = useState<DeviceRow[]>([]);
  const [deliveryDate, setDeliveryDate] = useState(new Date().toISOString().slice(0, 10));
  const [kurulumTarihi, setKurulumTarihi] = useState('');
  const [formNo, setFormNo] = useState('');
  const [signedBy, setSignedBy] = useState('');
  const [ilgili, setIlgili] = useState('');
  const [kurulumuYapan, setKurulumuYapan] = useState('');
  const [notes, setNotes] = useState('');
  const [tezgahMarka, setTezgahMarka] = useState('');
  const [tezgahTip, setTezgahTip] = useState('');
  const [tezgahModel, setTezgahModel] = useState('');
  const [tezgahSeriNo, setTezgahSeriNo] = useState('');
  const [cncMarka, setCncMarka] = useState('');
  const [cncModel, setCncModel] = useState('');
  const [cncSeriNo, setCncSeriNo] = useState('');
  const [cncMainSw, setCncMainSw] = useState('');
  const [technicalSpecs, setTechnicalSpecs] = useState<Array<{ key: string; value: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(isEdit);

  useEffect(() => {
    if (!id) return;
    void serviceService
      .deliveries({ pageSize: 300 })
      .then((res) => {
        const row = normalizeList(res).find((r) => String(r.id) === id);
        if (!row) throw new Error('Teslimat bulunamadı');
        const fd = (row.formData as Record<string, unknown> | undefined) ?? {};
        const tezgah = (fd.tezgah as Record<string, string> | undefined) ?? {};
        const cnc = (fd.cnc as Record<string, string> | undefined) ?? {};
        const company = row.company as Record<string, unknown> | undefined;
        setCompanyId(String(row.companyId ?? ''));
        setCompanyName(String(company?.shortName ?? company?.legalTitle ?? ''));
        setMachineId(String(fd.machineId ?? ''));
        setMachineLabel([tezgah.marka, tezgah.model, tezgah.seriNo].filter(Boolean).join(' · '));
        setDeliveryDate(row.deliveryDate ? String(row.deliveryDate).slice(0, 10) : '');
        setKurulumTarihi(fd.kurulumTarihi ? String(fd.kurulumTarihi).slice(0, 10) : '');
        setFormNo(String(fd.formNo ?? ''));
        setSignedBy(String(row.signedBy ?? ''));
        setIlgili(String(fd.ilgili ?? ''));
        setKurulumuYapan(String(fd.kurulumuYapan ?? ''));
        setNotes(String(row.notes ?? ''));
        setTezgahMarka(tezgah.marka ?? '');
        setTezgahTip(tezgah.tip ?? '');
        setTezgahModel(tezgah.model ?? '');
        setTezgahSeriNo(tezgah.seriNo ?? '');
        setCncMarka(cnc.marka ?? '');
        setCncModel(cnc.model ?? '');
        setCncSeriNo(cnc.seriNo ?? '');
        setCncMainSw(cnc.mainSw ?? '');
        setTechnicalSpecs(
          Array.isArray(fd.technicalSpecs)
            ? (fd.technicalSpecs as Array<Record<string, unknown>>)
                .map((spec) => ({
                  key: firstText(spec.key, spec.specKey),
                  value: [firstText(spec.value, spec.specValue), firstText(spec.unit, spec.specUnit)]
                    .filter(Boolean)
                    .join(' '),
                }))
                .filter((spec) => spec.key && spec.value)
            : [],
        );
      })
      .catch((e) => Alert.alert('Hata', e instanceof Error ? e.message : 'Yüklenemedi'))
      .finally(() => setBooting(false));
  }, [id]);

  useEffect(() => {
    if (!companyId) {
      setMachines([]);
      return;
    }
    let cancelled = false;
    void inventoryService
      .customerDevices({ companyId, pageSize: 100 })
      .then((res) => {
        if (!cancelled) setMachines(normalizeList(res));
      })
      .catch(() => {
        if (!cancelled) setMachines([]);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  useEffect(() => {
    if (!machineId) return;
    const selected = machines.find((m) => String(m.id) === machineId);
    if (selected) setMachineLabel(deviceLabel(selected));
  }, [machineId, machines]);

  const clearMachineInfo = () => {
    setMachineId('');
    setMachineLabel('');
    setTezgahMarka('');
    setTezgahTip('');
    setTezgahModel('');
    setTezgahSeriNo('');
    setCncMarka('');
    setCncModel('');
    setCncSeriNo('');
    setCncMainSw('');
    setTechnicalSpecs([]);
  };

  const applyMachine = (device: DeviceRow) => {
    const controlUnit = splitControlUnit(device.controlUnit);
    setMachineId(String(device.id ?? ''));
    setMachineLabel(deviceLabel(device));
    setTezgahMarka(firstText(device.brandName, device.brand));
    setTezgahTip(firstText(device.productTypeName, device.type));
    setTezgahModel(firstText(device.model, device.modelCode, device.productModelName, device.modelName));
    setTezgahSeriNo(firstText(device.serialNumber));
    setCncMarka(controlUnit.marka);
    setCncModel(controlUnit.model);
    setCncSeriNo(firstText(device.controlUnitSerialNumber, device.controlUnitSerial));
    setCncMainSw(firstText(device.mainSw, device.cncMainSw, device.controlUnitMainSw));
    setTechnicalSpecs(
      Array.isArray(device.technicalSpecs)
        ? (device.technicalSpecs as Array<Record<string, unknown>>)
            .map((spec) => ({
              key: firstText(spec.key, spec.specKey),
              value: [firstText(spec.value, spec.specValue), firstText(spec.unit, spec.specUnit)]
                .filter(Boolean)
                .join(' '),
            }))
            .filter((spec) => spec.key && spec.value)
        : [],
    );
  };

  const buildFormData = () => ({
    formNo: formNo.trim() || undefined,
    kurulumTarihi: kurulumTarihi ? new Date(kurulumTarihi) : undefined,
    machineId: machineId.trim() || undefined,
    ilgili: ilgili.trim() || undefined,
    kurulumuYapan: kurulumuYapan.trim() || undefined,
    tezgah: {
      marka: tezgahMarka.trim() || undefined,
      tip: tezgahTip.trim() || undefined,
      model: tezgahModel.trim() || undefined,
      seriNo: tezgahSeriNo.trim() || undefined,
    },
    cnc: {
      marka: cncMarka.trim() || undefined,
      model: cncModel.trim() || undefined,
      seriNo: cncSeriNo.trim() || undefined,
      mainSw: cncMainSw.trim() || undefined,
    },
    technicalSpecs,
  });

  const submit = async () => {
    if (!companyId.trim()) {
      Alert.alert('Hata', 'Müşteri seçimi zorunludur.');
      return;
    }
    setLoading(true);
    try {
      const body = {
        companyId: companyId.trim(),
        deliveryDate: new Date(deliveryDate),
        signedBy: signedBy.trim() || undefined,
        notes: notes.trim() || undefined,
        formData: buildFormData(),
      };
      if (isEdit && id) {
        await serviceService.updateDelivery(id, body);
        Alert.alert('Başarılı', 'Kurulum tutanağı güncellendi', [
          { text: 'Tamam', onPress: () => router.back() },
        ]);
      } else {
        const created = await serviceService.createDelivery({ ...body, status: 'pending' });
        const newId = String((created as { id?: string }).id ?? '');
        Alert.alert('Başarılı', 'Teslimat kaydı oluşturuldu', [
          {
            text: 'Detaya Git',
            onPress: () => router.replace(newId ? `/modules/deliveries/${newId}` : '/modules/deliveries'),
          },
        ]);
      }
    } catch (e) {
      Alert.alert('Hata', e instanceof Error ? e.message : 'Kaydedilemedi');
    } finally {
      setLoading(false);
    }
  };

  if (booting) {
    return (
      <FormPageLayout title="Kurulum Tutanağı">
        <View style={styles.loader}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </FormPageLayout>
    );
  }

  return (
    <FormPageLayout
      title={isEdit ? 'Tutanağı Düzenle' : 'Yeni Kurulum Tutanağı'}
      subtitle="DR.MAK teslimat / kurulum formu"
    >
      <CompanyPicker
        label="Müşteri *"
        value={companyId}
        displayName={companyName}
        onSelect={(c) => {
          setCompanyId(c.id);
          setCompanyName(String(c.shortName ?? c.legalTitle ?? ''));
          setMachines([]);
          clearMachineInfo();
        }}
      />
      <SectionTitle title="Makine" />
      <DevicePicker
        devices={machines}
        value={machineId}
        label={machineLabel}
        emptyText={companyId ? 'Bu müşteriye kayıtlı makine yok' : 'Önce müşteri seçin'}
        onSelect={applyMachine}
        onClear={clearMachineInfo}
      />
      <SectionTitle title="Tarihler & Form" />
      <Input label="Tezgah Teslim Tarihi" value={deliveryDate} onChangeText={setDeliveryDate} placeholder="YYYY-MM-DD" />
      <Input label="Tezgah Kurulum Tarihi" value={kurulumTarihi} onChangeText={setKurulumTarihi} placeholder="YYYY-MM-DD" />
      <Input label="Form No" value={formNo} onChangeText={setFormNo} placeholder="00001" />
      <SectionTitle title="Tezgah Bilgileri" />
      <Input label="Tezgah Markası" value={tezgahMarka} onChangeText={setTezgahMarka} />
      <Input label="Tezgah Tipi" value={tezgahTip} onChangeText={setTezgahTip} />
      <Input label="Tezgah Modeli" value={tezgahModel} onChangeText={setTezgahModel} />
      <Input label="Tezgah Seri No" value={tezgahSeriNo} onChangeText={setTezgahSeriNo} />
      <SectionTitle title="Kontrol Ünitesi (CNC)" />
      <Input label="CNC Markası" value={cncMarka} onChangeText={setCncMarka} />
      <Input label="CNC Modeli" value={cncModel} onChangeText={setCncModel} />
      <Input label="CNC Seri No" value={cncSeriNo} onChangeText={setCncSeriNo} />
      <Input label="CNC Main S/W" value={cncMainSw} onChangeText={setCncMainSw} />
      <SectionTitle title="Teknik Bilgiler" />
      {technicalSpecs.length ? (
        <View style={styles.specCard}>
          {technicalSpecs.map((spec, index) => (
            <View key={`${spec.key}-${index}`} style={[styles.specRow, index > 0 && styles.specRowBorder]}>
              <Text style={styles.specKey}>{spec.key}</Text>
              <Text style={styles.specValue}>{spec.value}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.specEmpty}>Seçilen makine için teknik bilgi bulunamadı.</Text>
      )}
      <SectionTitle title="İmza Bilgileri" />
      <Input label="İlgili Kişi" value={ilgili} onChangeText={setIlgili} />
      <Input label="Kurulumu Yapan" value={kurulumuYapan} onChangeText={setKurulumuYapan} />
      <Input label="Tezgahı Teslim Alan" value={signedBy} onChangeText={setSignedBy} placeholder="Ad Soyad" />
      <Input label="Notlar" value={notes} onChangeText={setNotes} multiline />
      <Button title={isEdit ? 'Güncelle' : 'Teslimatı Kaydet'} onPress={() => void submit()} loading={loading} />
    </FormPageLayout>
  );
}

function DevicePicker({
  devices,
  value,
  label,
  emptyText,
  onSelect,
  onClear,
}: {
  devices: DeviceRow[];
  value: string;
  label: string;
  emptyText: string;
  onSelect: (d: DeviceRow) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <Text style={styles.pickerLabel}>Makine / Tezgah</Text>
      <Pressable style={({ pressed }) => [styles.pickerTrigger, pressFade(pressed)]} onPress={() => setOpen((o) => !o)}>
        <Text style={[styles.pickerText, !value && styles.placeholder]} numberOfLines={1}>
          {label || 'Makine seçin…'}
        </Text>
      </Pressable>
      {open ? (
        <View style={styles.pickerList}>
          {value ? (
            <Pressable
              style={({ pressed }) => [styles.pickerItem, pressFade(pressed)]}
              onPress={() => {
                onClear();
                setOpen(false);
              }}
            >
              <Text style={styles.pickerItemText}>Makine seçimini temizle</Text>
            </Pressable>
          ) : null}
          {devices.length === 0 ? (
            <Text style={styles.pickerEmpty}>{emptyText}</Text>
          ) : (
            devices.map((device) => (
              <Pressable
                key={String(device.id)}
                style={({ pressed }) => [styles.pickerItem, pressFade(pressed)]}
                onPress={() => {
                  onSelect(device);
                  setOpen(false);
                }}
              >
                <Text style={styles.pickerItemText}>{deviceLabel(device) || String(device.id)}</Text>
              </Pressable>
            ))
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  loader: { paddingVertical: spacing.xxxl, alignItems: 'center' },
  pickerLabel: { ...typography.bodySm, fontFamily: fonts.medium, color: colors.textPrimary, marginBottom: 6 },
  pickerTrigger: {
    minHeight: 48,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  pickerText: { fontSize: 16, color: colors.textPrimary },
  placeholder: { color: colors.textMuted },
  pickerList: {
    marginTop: spacing.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    overflow: 'hidden',
  },
  pickerItem: { padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.outlineVariant },
  pickerItemText: { ...typography.bodySm, color: colors.onSurface },
  pickerEmpty: { padding: spacing.md, ...typography.bodySm, color: colors.onSurfaceVariant },
  specCard: {
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: radius.sm,
    backgroundColor: colors.card,
    overflow: 'hidden',
  },
  specRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
    padding: spacing.sm,
  },
  specRowBorder: { borderTopWidth: 1, borderTopColor: colors.outlineVariant },
  specKey: { ...typography.caption, color: colors.onSurfaceVariant, flex: 1 },
  specValue: {
    ...typography.caption,
    color: colors.onSurface,
    fontFamily: fonts.medium,
    flex: 1,
    textAlign: 'right',
  },
  specEmpty: { ...typography.bodySm, color: colors.onSurfaceVariant },
});
