import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import {
  activityService,
  calendarService,
  companyService,
  contactService,
  opportunityService,
} from '@/src/api/services';
import { useAuth } from '@/src/auth/AuthProvider';
import { normalizeList } from '@/src/modules/registry';
import { Screen } from '@/src/ui/Screen';
import { SearchBar } from '@/src/ui/SearchBar';
import { SheetHeader } from '@/src/ui/SheetHeader';
import {
  VisitAddChipButton,
  VisitCustomerCard,
  VisitFieldInput,
  VisitFormFooter,
  VisitFormHeader,
  VisitFormSection,
  VisitFormStepper,
  VisitLocationPreview,
  VisitParticipantChip,
  VisitPurposeChips,
  VisitReminderChips,
  VisitSelectField,
  VisitSummaryCard,
  VisitTimeRow,
  VisitToggleRow,
  VisitTypeSegment,
  REMINDER_OPTIONS,
  buildVisitPurposePayload,
  combineDateAndTime,
  formatDateDisplayTr,
  initialsFromName,
  type Participant,
  type ReminderOption,
  type VisitPurpose,
  type VisitStep,
  type VisitType,
} from '@/src/ui/forms/VisitFormWidgets';
import { colors, layout, spacing, typography } from '@/src/theme/tokens';

type CompanyDetail = {
  id: string;
  legalTitle?: string;
  shortName?: string;
  sector?: string | null;
  taxNumber?: string | null;
  addresses?: Array<{ label?: string; line1?: string; city?: string }>;
};

/** Stitch Yeni Ziyaret Planla — `7456e3b60ec94b6faa3d282858eead0a` */
export function VisitFormScreen() {
  const { companyId: initialCompanyId } = useLocalSearchParams<{ companyId?: string }>();
  const { user } = useAuth();

  const [step, setStep] = useState<VisitStep>(1);
  const [companyId, setCompanyId] = useState(initialCompanyId ?? '');
  const [company, setCompany] = useState<CompanyDetail | null>(null);
  const [companyPickerOpen, setCompanyPickerOpen] = useState(false);
  const [companies, setCompanies] = useState<CompanyDetail[]>([]);

  const [visitType, setVisitType] = useState<VisitType>('Saha');
  const [subject, setSubject] = useState('');
  const [purposes, setPurposes] = useState<VisitPurpose[]>(['Mevcut Geliştirme']);
  const [opportunityId, setOpportunityId] = useState('');
  const [opportunityLabel, setOpportunityLabel] = useState('');
  const [opportunityOpen, setOpportunityOpen] = useState(false);
  const [opportunities, setOpportunities] = useState<Record<string, unknown>[]>([]);

  const [visitDate, setVisitDate] = useState(new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState('10:00');
  const [endTime, setEndTime] = useState('12:00');
  const [location, setLocation] = useState('');

  const [customerParticipants, setCustomerParticipants] = useState<Participant[]>([]);
  const [teamParticipants, setTeamParticipants] = useState<Participant[]>([]);
  const [contactOpen, setContactOpen] = useState(false);
  const [contacts, setContacts] = useState<Record<string, unknown>[]>([]);

  const [reminders, setReminders] = useState<ReminderOption[]>(['1 gün önce', '15 dk önce']);
  const [notes, setNotes] = useState('');
  const [addToCalendar, setAddToCalendar] = useState(true);
  const [sendEmail, setSendEmail] = useState(true);
  const [loading, setLoading] = useState(false);

  const selfParticipant = useMemo<Participant>(
    () => ({
      id: user?.id ?? 'self',
      name: user?.fullName ?? 'Ben',
      kind: 'team',
      isSelf: true,
    }),
    [user?.fullName, user?.id]
  );

  useEffect(() => {
    setTeamParticipants((prev) => {
      const others = prev.filter((p) => !p.isSelf);
      return [selfParticipant, ...others];
    });
  }, [selfParticipant]);

  const loadCompany = useCallback(async (id: string) => {
    if (!id) {
      setCompany(null);
      return;
    }
    const detail = (await companyService.get(id)) as CompanyDetail;
    setCompany(detail);
    const addr = detail.addresses?.[0];
    if (addr) {
      const line = [addr.label, addr.line1, addr.city].filter(Boolean).join(' · ');
      if (line) {
        setLocation((prev) => prev || line);
      }
    }
  }, []);

  useEffect(() => {
    if (!companyPickerOpen) return;
    void companyService
      .list({ pageSize: 50 })
      .then((res) => setCompanies(normalizeList(res) as CompanyDetail[]))
      .catch(() => setCompanies([]));
  }, [companyPickerOpen]);

  useEffect(() => {
    if (!companyId) return;
    void loadCompany(companyId).catch(() => setCompany(null));
  }, [companyId, loadCompany]);

  useEffect(() => {
    if (!companyId) {
      setOpportunities([]);
      return;
    }
    void opportunityService
      .list({ companyId, pageSize: 30 })
      .then((res) => setOpportunities(normalizeList(res)))
      .catch(() => setOpportunities([]));
  }, [companyId]);

  useEffect(() => {
    if (!companyId) {
      setContacts([]);
      return;
    }
    void contactService
      .list({ companyId, pageSize: 30 })
      .then((res) => setContacts(normalizeList(res)))
      .catch(() => setContacts([]));
  }, [companyId]);

  const companyName = String(company?.legalTitle ?? company?.shortName ?? '');
  const companyCode = company?.taxNumber
    ? `CR-${String(company.taxNumber).slice(-4)}`
    : company?.id
      ? `CR-${company.id.slice(0, 4).toUpperCase()}`
      : undefined;
  const segmentLabel = company?.sector ? `${company.sector.slice(0, 1).toUpperCase()} Segment` : undefined;

  const togglePurpose = (purpose: VisitPurpose) => {
    setPurposes((prev) =>
      prev.includes(purpose) ? prev.filter((p) => p !== purpose) : [...prev, purpose]
    );
  };

  const toggleReminder = (option: ReminderOption) => {
    setReminders((prev) =>
      prev.includes(option) ? prev.filter((r) => r !== option) : [...prev, option]
    );
  };

  const addReminder = () => {
    const next = REMINDER_OPTIONS.find((option) => !reminders.includes(option));
    if (next) setReminders((prev) => [...prev, next]);
  };

  const validateStep = (current: VisitStep): boolean => {
    if (current === 1) {
      if (!companyId) {
        Alert.alert('Eksik bilgi', 'Lütfen firma seçin.');
        return false;
      }
      if (!subject.trim()) {
        Alert.alert('Eksik bilgi', 'Konu alanı zorunludur.');
        return false;
      }
      if (!purposes.length) {
        Alert.alert('Eksik bilgi', 'En az bir amaç seçin.');
        return false;
      }
      if (!visitDate.trim()) {
        Alert.alert('Eksik bilgi', 'Tarih zorunludur.');
        return false;
      }
      if (!startTime.trim() || !endTime.trim()) {
        Alert.alert('Eksik bilgi', 'Başlangıç ve bitiş saati girin.');
        return false;
      }
    }
    return true;
  };

  const onPrimary = () => {
    if (!validateStep(step)) return;
    if (step < 3) {
      setStep((s) => (s === 1 ? 2 : 3) as VisitStep);
      return;
    }
    void submit();
  };

  const onCancel = () => {
    if (step === 1) router.back();
    else setStep((s) => (s === 3 ? 2 : 1) as VisitStep);
  };

  const submit = async () => {
    setLoading(true);
    try {
      const startsAt = combineDateAndTime(visitDate, startTime);
      const endsAt = combineDateAndTime(visitDate, endTime);
      const visitPurpose = buildVisitPurposePayload({
        visitType,
        subject,
        purposes,
        notes,
        reminders,
      });
      const participantNote =
        customerParticipants.length > 0
          ? `Katılımcılar: ${customerParticipants.map((p) => p.name).join(', ')}`
          : '';
      await activityService.createVisit({
        companyId,
        opportunityId: opportunityId || undefined,
        contactId: customerParticipants[0]?.id,
        visitDate: startsAt,
        visitLocation: location || undefined,
        visitPurpose,
        visitResult: notes.trim() || undefined,
        nextAction: participantNote || undefined,
      });

      if (addToCalendar) {
        await calendarService.create({
          eventType: 'customer_visit',
          title: subject.trim() || `Ziyaret — ${companyName}`,
          description: visitPurpose,
          location: location || undefined,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          allDay: false,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Istanbul',
          companyId,
          contactId: customerParticipants[0]?.id ?? null,
          opportunityId: opportunityId || null,
        });
      }

      if (sendEmail) {
        // E-posta bildirimi API eklendiğinde burada tetiklenecek.
      }

      Alert.alert('Başarılı', 'Ziyaret planlandı', [{ text: 'Tamam', onPress: () => router.back() }]);
    } catch (e) {
      Alert.alert('Hata', e instanceof Error ? e.message : 'Kayıt başarısız');
    } finally {
      setLoading(false);
    }
  };

  const openDirections = () => {
    if (!location) return;
    const url = `https://maps.google.com/?q=${encodeURIComponent(location)}`;
    void Linking.openURL(url);
  };

  return (
    <Screen padded={false} edges={['left', 'right']}>
      <VisitFormHeader
        onClose={() => router.back()}
        onDraft={() => Alert.alert('Taslak', 'Taslak yerel olarak kaydedildi.')}
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <VisitFormStepper step={step} />

          {step === 1 ? (
            <>
              <VisitCustomerCard
                companyName={companyName}
                companyCode={companyCode}
                segmentLabel={segmentLabel}
                initials={initialsFromName(companyName || '?')}
                onChange={() => setCompanyPickerOpen(true)}
              />

              <VisitFormSection title="Ziyaret Bilgileri">
                <VisitTypeSegment value={visitType} onChange={setVisitType} />
                <VisitFieldInput
                  label="Konu"
                  required
                  value={subject}
                  onChangeText={setSubject}
                  placeholder="Q3 işbirliği görüşmesi"
                />
                <VisitPurposeChips selected={purposes} onToggle={togglePurpose} />
                <VisitSelectField
                  label="Satış Kartı (opsiyonel)"
                  value={opportunityLabel}
                  placeholder="Satış kartı seçin"
                  onPress={() => {
                    if (!companyId) {
                      Alert.alert('Firma gerekli', 'Önce firma seçin.');
                      return;
                    }
                    setOpportunityOpen(true);
                  }}
                />
              </VisitFormSection>

              <VisitFormSection title="Tarih & Yer">
                <VisitFieldInput
                  label="Tarih"
                  required
                  value={visitDate}
                  onChangeText={setVisitDate}
                  placeholder="YYYY-MM-DD"
                />
                <Text style={styles.dateHint}>{formatDateDisplayTr(visitDate)}</Text>
                <VisitTimeRow
                  startTime={startTime}
                  endTime={endTime}
                  onStartChange={setStartTime}
                  onEndChange={setEndTime}
                />
                <VisitFieldInput
                  label="Konum"
                  value={location}
                  onChangeText={setLocation}
                  placeholder="Fabrika / adres"
                />
                <VisitLocationPreview locationLabel={location} onDirections={openDirections} />
              </VisitFormSection>

              <VisitFormSection title="Katılımcılar">
                <Text style={styles.subSectionLabel}>Müşteri Tarafı</Text>
                <View style={styles.participantWrap}>
                  {customerParticipants.map((p) => (
                    <VisitParticipantChip
                      key={p.id}
                      participant={p}
                      onRemove={() =>
                        setCustomerParticipants((prev) => prev.filter((x) => x.id !== p.id))
                      }
                    />
                  ))}
                  <VisitAddChipButton
                    label="Ekle"
                    icon="add"
                    onPress={() => {
                      if (!companyId) {
                        Alert.alert('Firma gerekli', 'Önce firma seçin.');
                        return;
                      }
                      setContactOpen(true);
                    }}
                  />
                </View>
                <View style={styles.divider} />
                <Text style={styles.subSectionLabel}>Haksan Tarafı</Text>
                <View style={styles.participantWrap}>
                  {teamParticipants.map((p) => (
                    <VisitParticipantChip key={p.id} participant={p} />
                  ))}
                  <VisitAddChipButton
                    label="Ekibe Ekle"
                    icon="person-add-outline"
                    onPress={() => Alert.alert('Yakında', 'Ekip üyesi ekleme web ile eşlenecek.')}
                  />
                </View>
              </VisitFormSection>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <VisitFormSection title="Hatırlatma & Notlar">
                <VisitReminderChips
                  selected={reminders}
                  onToggle={toggleReminder}
                  onAdd={addReminder}
                />
                <VisitFieldInput
                  label="Notlar"
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Gündem ve hazırlık notları..."
                  multiline
                />
                <VisitToggleRow
                  label="Takvime ekle (iCal)"
                  value={addToCalendar}
                  onChange={setAddToCalendar}
                />
                <VisitToggleRow
                  label="Müşteriye e-posta gönder"
                  value={sendEmail}
                  onChange={setSendEmail}
                />
              </VisitFormSection>
            </>
          ) : null}

          {step === 3 ? (
            <VisitSummaryCard
              companyName={companyName || '—'}
              visitType={visitType}
              subject={subject}
              purposes={purposes}
              dateLabel={formatDateDisplayTr(visitDate)}
              timeRange={`${startTime} – ${endTime}`}
              location={location}
            />
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      <VisitFormFooter step={step} loading={loading} onCancel={onCancel} onPrimary={onPrimary} />

      <PickerSheet
        visible={companyPickerOpen}
        title="Firma Seç"
        onClose={() => setCompanyPickerOpen(false)}
        data={companies}
        keyExtractor={(item) => String(item.id)}
        renderLabel={(item) => String(item.legalTitle ?? item.shortName ?? item.id)}
        onSelect={(item) => {
          setCompanyId(String(item.id));
          setCompanyPickerOpen(false);
          setOpportunityId('');
          setOpportunityLabel('');
          setCustomerParticipants([]);
        }}
        emptyLabel="Firma bulunamadı"
      />

      <PickerSheet
        visible={opportunityOpen}
        title="Satış Kartı Seç"
        onClose={() => setOpportunityOpen(false)}
        data={opportunities}
        keyExtractor={(item) => String(item.id)}
        renderLabel={(item) => {
          const title = String(item.title ?? 'Satış kartı');
          const year = item.createdAt ? new Date(String(item.createdAt)).getFullYear() : new Date().getFullYear();
          const seq = String(item.id ?? '').slice(0, 3).toUpperCase();
          return `SK-${year}-${seq} · ${title}`;
        }}
        onSelect={(item) => {
          setOpportunityId(String(item.id));
          setOpportunityLabel(String(item.title ?? item.id));
          setOpportunityOpen(false);
        }}
        emptyLabel="Bu firmaya ait satış kartı yok"
      />

      <PickerSheet
        visible={contactOpen}
        title="Kontak Ekle"
        onClose={() => setContactOpen(false)}
        data={contacts}
        keyExtractor={(item) => String(item.id)}
        renderLabel={(item) => {
          const name = [item.firstName, item.lastName].filter(Boolean).join(' ') || String(item.fullName ?? 'Kontak');
          const role = item.title ? String(item.title) : undefined;
          return role ? `${name} (${role})` : name;
        }}
        onSelect={(item) => {
          const name =
            [item.firstName, item.lastName].filter(Boolean).join(' ') || String(item.fullName ?? 'Kontak');
          const role = item.title ? String(item.title) : undefined;
          setCustomerParticipants((prev) => {
            if (prev.some((p) => p.id === String(item.id))) return prev;
            return [...prev, { id: String(item.id), name, role, kind: 'customer' }];
          });
          setContactOpen(false);
        }}
        emptyLabel="Bu firmaya ait kontak yok"
      />
    </Screen>
  );
}

function PickerSheet<T extends Record<string, unknown>>({
  visible,
  title,
  onClose,
  data,
  keyExtractor,
  renderLabel,
  onSelect,
  emptyLabel,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  data: T[];
  keyExtractor: (item: T) => string;
  renderLabel: (item: T) => string;
  onSelect: (item: T) => void;
  emptyLabel: string;
}) {
  const [q, setQ] = useState('');

  useEffect(() => {
    if (!visible) setQ('');
  }, [visible]);

  const filtered = data.filter((item) => renderLabel(item).toLowerCase().includes(q.toLowerCase()));

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.pickerSheet}>
        <SheetHeader title={title} onClose={onClose}>
          <SearchBar value={q} onChangeText={setQ} placeholder="Ara…" />
        </SheetHeader>
        <FlatList
          data={filtered}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.pickerList}
          ListEmptyComponent={<Text style={styles.pickerEmpty}>{emptyLabel}</Text>}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => onSelect(item)}
              style={({ pressed }) => [styles.pickerRow, pressed && styles.pickerRowPressed]}
            >
              <Text style={styles.pickerRowText}>{renderLabel(item)}</Text>
            </Pressable>
          )}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: {
    paddingHorizontal: layout.containerMargin,
    paddingTop: spacing.md,
    paddingBottom: 120,
    gap: spacing.lg,
    backgroundColor: colors.canvas,
  },
  subSectionLabel: {
    ...typography.label,
    color: colors.onSurfaceVariant,
    marginTop: spacing.xs,
  },
  dateHint: {
    ...typography.caption,
    color: colors.onSurfaceVariant,
    marginTop: -4,
  },
  participantWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  divider: {
    height: 1,
    backgroundColor: colors.surfaceVariant,
    marginVertical: spacing.md,
  },
  pickerSheet: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  pickerList: {
    padding: layout.containerMargin,
    gap: spacing.sm,
  },
  pickerRow: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceContainerHigh,
  },
  pickerRowPressed: {
    backgroundColor: colors.surfaceContainerLow,
  },
  pickerRowText: {
    ...typography.bodySm,
    color: colors.textPrimary,
  },
  pickerEmpty: {
    ...typography.bodySm,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
    paddingVertical: spacing.xxxl,
  },
});
