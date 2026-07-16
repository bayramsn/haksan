import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { companyService, serviceService } from '@/src/api/services';
import { Screen } from '@/src/ui/Screen';
import {
  ServiceCustomerPickerSheet,
  ServiceMachinePickerSheet,
} from '@/src/ui/forms/ServiceTicketPickerWidgets';
import {
  ServiceTicketCategorySegment,
  ServiceTicketCompanyAvatar,
  ServiceTicketDescriptionField,
  ServiceTicketFieldInput,
  ServiceTicketFormFooter,
  ServiceTicketFormHeader,
  ServiceTicketFormStepper,
  ServiceTicketLocationChip,
  ServiceTicketMachineIcon,
  ServiceTicketPhotoGrid,
  ServiceTicketPriorityChips,
  ServiceTicketSection,
  ServiceTicketSelectRow,
  ServiceTicketSummaryCard,
  ServiceTicketToggleRow,
  ServiceTicketVoiceNoteButton,
  categoryToTicketType,
  priorityToSeverity,
  type ServiceCategory,
  type ServicePriority,
  type ServiceTicketStep,
} from '@/src/ui/forms/ServiceTicketFormWidgets';
import { colors, layout, spacing } from '@/src/theme/tokens';

/** Stitch Yeni Servis Talebi — `7bae69e33bef4490af93ee7ea66f617a` */
export function ServiceTicketFormScreen() {
  const { companyId: initialCompanyId } = useLocalSearchParams<{ companyId?: string }>();

  const [step, setStep] = useState<ServiceTicketStep>(1);
  const [companyId, setCompanyId] = useState(initialCompanyId ?? '');
  const [companyName, setCompanyName] = useState('');
  const [location, setLocation] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [deviceLabel, setDeviceLabel] = useState('');
  const [category, setCategory] = useState<ServiceCategory>('Arıza');
  const [priority, setPriority] = useState<ServicePriority>('Orta');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [preferredVisit, setPreferredVisit] = useState('');
  const [fieldVisitRequired, setFieldVisitRequired] = useState(true);
  const [loading, setLoading] = useState(false);

  const [companyPickerOpen, setCompanyPickerOpen] = useState(false);
  const [devicePickerOpen, setDevicePickerOpen] = useState(false);

  useEffect(() => {
    if (!initialCompanyId) return;
    void companyService.get(initialCompanyId).then((c) => {
      setCompanyName(String(c.legalTitle ?? c.shortName ?? initialCompanyId));
      const addr = (c as { addresses?: Array<{ line1?: string; city?: string }> }).addresses?.[0];
      if (addr) {
        const line = [addr.line1, addr.city].filter(Boolean).join(' · ');
        if (line) setLocation(line);
      }
    });
  }, [initialCompanyId]);

  const validateStep = (current: ServiceTicketStep): boolean => {
    if (current === 1) {
      if (!companyId) {
        Alert.alert('Eksik bilgi', 'Müşteri seçin.');
        return false;
      }
      if (!deviceId) {
        Alert.alert('Eksik bilgi', 'Makine seçin.');
        return false;
      }
      if (!subject.trim()) {
        Alert.alert('Eksik bilgi', 'Talep başlığı zorunludur.');
        return false;
      }
      if (!description.trim()) {
        Alert.alert('Eksik bilgi', 'Açıklama zorunludur.');
        return false;
      }
    }
    return true;
  };

  const submit = useCallback(async () => {
    if (!validateStep(1)) {
      setStep(1);
      return;
    }
    setLoading(true);
    try {
      const ticket = await serviceService.createTicket({
        companyId,
        customerDeviceId: deviceId,
        subject: subject.trim(),
        description: description.trim(),
        severity: priorityToSeverity(priority),
        ticketType: categoryToTicketType(category),
        source: 'manual',
        metadata: {
          category,
          location: location || undefined,
          preferredVisit: preferredVisit || undefined,
          fieldVisitRequired,
          photoCount: photos.length,
        },
      });
      Alert.alert('Başarılı', 'Servis talebi açıldı', [
        { text: 'Detay', onPress: () => router.replace(`/modules/service-requests/${ticket.id}`) },
        { text: 'Tamam', onPress: () => router.back() },
      ]);
    } catch (e) {
      Alert.alert('Hata', e instanceof Error ? e.message : 'Kayıt başarısız');
    } finally {
      setLoading(false);
    }
  }, [
    category,
    companyId,
    description,
    deviceId,
    fieldVisitRequired,
    location,
    photos.length,
    preferredVisit,
    priority,
    subject,
  ]);

  const onPrimary = () => {
    if (!validateStep(step)) return;
    if (step < 3) {
      setStep((s) => (s === 1 ? 2 : 3) as ServiceTicketStep);
      return;
    }
    void submit();
  };

  const onCancel = () => {
    if (step === 1) router.back();
    else setStep((s) => (s === 3 ? 2 : 1) as ServiceTicketStep);
  };

  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('İzin gerekli', 'Galeri erişimi verin.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      allowsMultipleSelection: true,
      selectionLimit: 3,
    });
    if (!res.canceled) {
      setPhotos((prev) => [...prev, ...res.assets.map((a) => a.uri)].slice(0, 6));
    }
  };

  return (
    <Screen padded={false} edges={['left', 'right']}>
      <ServiceTicketFormHeader
        onClose={() => router.back()}
        onSave={step === 3 ? () => void submit() : undefined}
        saving={loading}
      />
      <ServiceTicketFormStepper step={step} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {step === 1 ? (
            <>
              <ServiceTicketSection title="Müşteri & Makine">
                <ServiceTicketSelectRow
                  label="Müşteri"
                  required
                  value={companyName}
                  placeholder="Firma seçin"
                  left={companyName ? <ServiceTicketCompanyAvatar name={companyName} /> : null}
                  onPress={() => setCompanyPickerOpen(true)}
                />
                <ServiceTicketSelectRow
                  label="Makine"
                  required
                  value={deviceLabel}
                  placeholder="Makine seçin"
                  left={deviceLabel ? <ServiceTicketMachineIcon /> : null}
                  onPress={() => {
                    if (!companyId) {
                      Alert.alert('Firma gerekli', 'Önce müşteri seçin.');
                      return;
                    }
                    setDevicePickerOpen(true);
                  }}
                />
                {location ? <ServiceTicketLocationChip label={location} /> : null}
              </ServiceTicketSection>

              <ServiceTicketSection title="Talep Bilgisi">
                <ServiceTicketCategorySegment value={category} onChange={setCategory} />
                <ServiceTicketPriorityChips value={priority} onChange={setPriority} />
                <ServiceTicketFieldInput
                  label="Talep Başlığı"
                  required
                  value={subject}
                  onChangeText={setSubject}
                  placeholder="Spindle anormal titreşim"
                />
                <ServiceTicketDescriptionField value={description} onChangeText={setDescription} />
              </ServiceTicketSection>
            </>
          ) : null}

          {step === 2 ? (
            <ServiceTicketSection title="Fotoğraf & Ses">
              <ServiceTicketPhotoGrid
                photos={photos}
                onAdd={() => void pickPhoto()}
                onRemove={(uri) => setPhotos((p) => p.filter((x) => x !== uri))}
              />
              <ServiceTicketVoiceNoteButton
                onPress={() => Alert.alert('Yakında', 'Sesli not kaydı yakında eklenecek.')}
              />
            </ServiceTicketSection>
          ) : null}

          {step === 3 ? (
            <>
              <ServiceTicketSection title="Atama & Termin">
                <ServiceTicketSelectRow
                  label="Atanan Teknisyen"
                  value=""
                  placeholder="Otomatik atanacak"
                  onPress={() => Alert.alert('Yakında', 'Teknisyen atama web ile eşlenecek.')}
                />
                <ServiceTicketFieldInput
                  label="Tercih Edilen Ziyaret"
                  value={preferredVisit}
                  onChangeText={setPreferredVisit}
                  placeholder="24.06.2026 · 09:00 - 12:00"
                />
                <ServiceTicketToggleRow
                  label="Saha Ziyareti Gerekli"
                  value={fieldVisitRequired}
                  onChange={setFieldVisitRequired}
                />
              </ServiceTicketSection>

              <ServiceTicketSummaryCard
                companyName={companyName || '—'}
                machineLabel={deviceLabel || '—'}
                category={category}
                priority={priority}
                subject={subject}
                description={description}
                fieldVisitRequired={fieldVisitRequired}
              />
            </>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      <ServiceTicketFormFooter step={step} loading={loading} onCancel={onCancel} onPrimary={onPrimary} />

      <ServiceCustomerPickerSheet
        visible={companyPickerOpen}
        selectedId={companyId || undefined}
        onClose={() => setCompanyPickerOpen(false)}
        onSelect={(company) => {
          setCompanyId(company.id);
          setCompanyName(company.name);
          if (company.location) setLocation(company.location);
          setCompanyPickerOpen(false);
          setDeviceId('');
          setDeviceLabel('');
        }}
      />

      <ServiceMachinePickerSheet
        visible={devicePickerOpen}
        companyId={companyId || undefined}
        companyName={companyName || undefined}
        selectedId={deviceId || undefined}
        onClose={() => setDevicePickerOpen(false)}
        onSelect={(device) => {
          setDeviceId(device.id);
          setDeviceLabel(device.label);
          if (device.location) setLocation(device.location);
          setDevicePickerOpen(false);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: {
    flex: 1,
    backgroundColor: '#f7f7f8',
  },
  scrollContent: {
    paddingHorizontal: layout.containerMargin,
    paddingBottom: spacing.lg,
  },
});
