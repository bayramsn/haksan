import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import {
  INSTALLATION_LOCATION_LABELS,
  type InstallationLocationType,
} from '@haksan/shared';
import { adminService, inventoryService, serviceService } from '@/src/api/services';
import { normalizeList } from '@/src/modules/registry';
import { CompanyPicker } from '@/src/ui/CompanyPicker';
import { Button } from '@/src/ui/Button';
import { FormPageLayout } from '@/src/ui/FormPageLayout';
import { Input } from '@/src/ui/Input';
import { SectionTitle } from '@/src/ui/SectionTitle';
import { colors, fonts, radius, spacing, typography } from '@/src/theme/tokens';
import { pressFade } from '@/src/theme/styles';

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

function deviceLabelFromRow(device: Record<string, unknown>): string {
  return [
    firstText(device.brandName, device.brand),
    firstText(device.model, device.modelCode, device.productModelName, device.modelName),
    firstText(device.serialNumber),
  ]
    .filter(Boolean)
    .join(' · ') || 'Makine';
}

/** Stitch Yeni Kurulum Planı — `f408c378c5564b5f84db95464abda114` */
export function InstallationFormScreen() {
  const [companyId, setCompanyId] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [customerDeviceId, setCustomerDeviceId] = useState('');
  const [deviceLabel, setDeviceLabel] = useState('');
  const [scheduledDate, setScheduledDate] = useState(new Date().toISOString().slice(0, 10));
  const [assignedToUserId, setAssignedToUserId] = useState('');
  const [technicianLabel, setTechnicianLabel] = useState('');
  const [location, setLocation] = useState('');
  const [locationType, setLocationType] = useState<InstallationLocationType>('istanbul_ici');
  const [durationHours, setDurationHours] = useState('1');
  const [durationMinutes, setDurationMinutes] = useState('0');
  const [notes, setNotes] = useState('');
  const [devices, setDevices] = useState<Record<string, unknown>[]>([]);
  const [technicians, setTechnicians] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    void adminService
      .users()
      .then((users) => {
        const list = (users as Record<string, unknown>[]).filter((u) => {
          const role = String(u.role ?? '').toLowerCase();
          const dept = String(u.department ?? '').toLowerCase();
          return role.includes('service') || dept.includes('servis');
        });
        setTechnicians(list.length ? list : (users as Record<string, unknown>[]));
      })
      .catch(() => setTechnicians([]))
      .finally(() => setBooting(false));
  }, []);

  useEffect(() => {
    if (!companyId) {
      setDevices([]);
      return;
    }
    let cancelled = false;
    void inventoryService
      .customerDevices({ companyId, pageSize: 100 })
      .then((res) => {
        if (!cancelled) setDevices(normalizeList(res));
      })
      .catch(() => {
        if (!cancelled) setDevices([]);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const totalMinutes = useMemo(() => {
    const h = parseInt(durationHours || '0', 10) || 0;
    const m = parseInt(durationMinutes || '0', 10) || 0;
    return h * 60 + m;
  }, [durationHours, durationMinutes]);

  const submit = async () => {
    if (!companyId.trim()) {
      Alert.alert('Hata', 'Firma seçimi zorunludur.');
      return;
    }
    setLoading(true);
    try {
      const created = await serviceService.createInstallation({
        companyId: companyId.trim(),
        customerDeviceId: customerDeviceId || undefined,
        scheduledDate: scheduledDate || undefined,
        assignedToUserId: assignedToUserId || undefined,
        location: location.trim() || undefined,
        locationType,
        durationMinutes: totalMinutes > 0 ? totalMinutes : undefined,
        notes: notes.trim() || undefined,
      });
      const newId = String((created as { id?: string }).id ?? '');
      Alert.alert('Başarılı', 'Kurulum planı oluşturuldu', [
        {
          text: 'Detaya Git',
          onPress: () => router.replace(newId ? `/modules/installations/${newId}` : '/modules/installations'),
        },
      ]);
    } catch (e) {
      Alert.alert('Hata', e instanceof Error ? e.message : 'Oluşturulamadı');
    } finally {
      setLoading(false);
    }
  };

  if (booting) {
    return (
      <FormPageLayout title="Yeni Kurulum">
        <View style={styles.loader}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </FormPageLayout>
    );
  }

  return (
    <FormPageLayout title="Yeni Kurulum" subtitle="Saha kurulum planı oluşturun">
      <CompanyPicker
        label="Firma *"
        value={companyId}
        displayName={companyName}
        onSelect={(c) => {
          setCompanyId(c.id);
          setCompanyName(String(c.shortName ?? c.legalTitle ?? ''));
          setCustomerDeviceId('');
          setDeviceLabel('');
          setDevices([]);
        }}
      />
      <SectionTitle title="Makine" />
      <DevicePicker
        devices={devices}
        value={customerDeviceId}
        label={deviceLabel}
        onSelect={(d) => {
          setCustomerDeviceId(String(d.id));
          setDeviceLabel(deviceLabelFromRow(d));
        }}
      />
      <SectionTitle title="Planlama" />
      <Input label="Planlanan Tarih" value={scheduledDate} onChangeText={setScheduledDate} placeholder="YYYY-MM-DD" />
      <TechnicianPicker
        users={technicians}
        value={assignedToUserId}
        label={technicianLabel}
        onSelect={(u) => {
          setAssignedToUserId(String(u.id));
          setTechnicianLabel(String(u.fullName ?? u.email ?? ''));
        }}
      />
      <Input label="Kurulum Yeri / Adres" value={location} onChangeText={setLocation} />
      <SectionTitle title="Konum Tipi" />
      <View style={styles.segmented}>
        {(['istanbul_ici', 'istanbul_disi'] as InstallationLocationType[]).map((lt) => {
          const active = locationType === lt;
          return (
            <Pressable
              key={lt}
              onPress={() => setLocationType(lt)}
              style={({ pressed }) => [styles.segment, active && styles.segmentActive, pressFade(pressed)]}
            >
              <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                {INSTALLATION_LOCATION_LABELS[lt]}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <SectionTitle title="Süre" />
      <View style={styles.durationRow}>
        <View style={styles.durationCol}>
          <Input label="Saat" value={durationHours} onChangeText={setDurationHours} keyboardType="number-pad" />
        </View>
        <View style={styles.durationCol}>
          <Input label="Dakika" value={durationMinutes} onChangeText={setDurationMinutes} keyboardType="number-pad" />
        </View>
      </View>
      <Input label="Notlar" value={notes} onChangeText={setNotes} multiline />
      <Button title="Kurulum Oluştur" onPress={() => void submit()} loading={loading} />
    </FormPageLayout>
  );
}

function DevicePicker({
  devices,
  value,
  label,
  onSelect,
}: {
  devices: Record<string, unknown>[];
  value: string;
  label: string;
  onSelect: (d: Record<string, unknown>) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <Text style={styles.pickerLabel}>Makine</Text>
      <Pressable style={({ pressed }) => [styles.pickerTrigger, pressFade(pressed)]} onPress={() => setOpen((o) => !o)}>
        <Text style={[styles.pickerText, !value && styles.placeholder]} numberOfLines={1}>
          {label || 'Makine seçin…'}
        </Text>
      </Pressable>
      {open ? (
        <View style={styles.pickerList}>
          {devices.length === 0 ? (
            <Text style={styles.pickerEmpty}>Bu firmaya kayıtlı makine yok</Text>
          ) : (
            devices.map((d) => (
              <Pressable
                key={String(d.id)}
                style={({ pressed }) => [styles.pickerItem, pressFade(pressed)]}
                onPress={() => {
                  onSelect(d);
                  setOpen(false);
                }}
              >
                <Text style={styles.pickerItemText}>{deviceLabelFromRow(d)}</Text>
              </Pressable>
            ))
          )}
        </View>
      ) : null}
    </View>
  );
}

function TechnicianPicker({
  users,
  value,
  label,
  onSelect,
}: {
  users: Record<string, unknown>[];
  value: string;
  label: string;
  onSelect: (u: Record<string, unknown>) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <Text style={styles.pickerLabel}>Teknisyen</Text>
      <Pressable style={({ pressed }) => [styles.pickerTrigger, pressFade(pressed)]} onPress={() => setOpen((o) => !o)}>
        <Text style={[styles.pickerText, !value && styles.placeholder]} numberOfLines={1}>
          {label || 'Teknisyen seçin…'}
        </Text>
      </Pressable>
      {open ? (
        <View style={styles.pickerList}>
          {users.map((u) => (
            <Pressable
              key={String(u.id)}
              style={({ pressed }) => [styles.pickerItem, pressFade(pressed)]}
              onPress={() => {
                onSelect(u);
                setOpen(false);
              }}
            >
              <Text style={styles.pickerItemText}>{String(u.fullName ?? u.email ?? u.id)}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  loader: { paddingVertical: spacing.xxxl, alignItems: 'center' },
  segmented: { flexDirection: 'row', gap: spacing.sm },
  segment: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    alignItems: 'center',
  },
  segmentActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  segmentText: { ...typography.label, color: colors.onSurfaceVariant, fontFamily: fonts.medium },
  segmentTextActive: { color: '#fff' },
  durationRow: { flexDirection: 'row', gap: spacing.sm },
  durationCol: { flex: 1 },
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
});
