import { useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import {
  INSTALLATION_FORM_DEFAULT_CHECKS,
  installationFormDataSchema,
  type InstallationCheckStatus,
} from '@haksan/shared';
import { useInstallation, useSetInstallationStatus } from '@/src/api/operations.hooks';
import { useCan } from '@/src/auth/AuthProvider';
import { useTheme } from '@/src/theme/theme';
import { Button, Card, ErrorState, Field, Loading } from '@/src/ui';

type CheckValues = Record<string, InstallationCheckStatus | null>;

function localDateInput(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateInput(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) || localDateInput(date) !== value ? null : date;
}

function existingDate(value: unknown): string | null {
  if (!(value instanceof Date) && typeof value !== 'string') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : localDateInput(date);
}

export default function InstallationCompletionScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const canUpdate = useCan('installations.update');
  const query = useInstallation(id);
  const complete = useSetInstallationStatus(id);
  const [initialized, setInitialized] = useState(false);
  const [checks, setChecks] = useState<CheckValues>(() =>
    Object.fromEntries(INSTALLATION_FORM_DEFAULT_CHECKS.map((check) => [check.id, null])),
  );
  const [hasProblem, setHasProblem] = useState<boolean | null>(null);
  const [problemNote, setProblemNote] = useState('');
  const [actionNote, setActionNote] = useState('');
  const [installationDate, setInstallationDate] = useState(localDateInput());
  const [installer, setInstaller] = useState('');
  const [recipient, setRecipient] = useState('');
  const [error, setError] = useState<string | null>(null);

  const existing = useMemo(() => {
    const parsed = installationFormDataSchema.safeParse(query.data?.formData);
    return parsed.success ? parsed.data : null;
  }, [query.data?.formData]);

  useEffect(() => {
    if (!query.data || initialized) return;
    const next = Object.fromEntries(INSTALLATION_FORM_DEFAULT_CHECKS.map((check) => {
      const row = existing?.checks?.find((item) => item.id === check.id || item.label === check.label);
      return [check.id, row?.status ?? null];
    })) as CheckValues;
    setChecks(next);
    setHasProblem(typeof existing?.problem?.hasProblem === 'boolean' ? existing.problem.hasProblem : null);
    setProblemNote(existing?.problem?.note ?? '');
    setActionNote(existing?.problem?.actionNote ?? '');
    setInstallationDate(existingDate(existing?.kurulumTarihi) ?? localDateInput());
    setInstaller(existing?.kurulumuYapan ?? '');
    setRecipient(existing?.teslimAlan ?? '');
    setInitialized(true);
  }, [existing, initialized, query.data]);

  if (!canUpdate) return <Redirect href={`/(tabs)/modules/installations/${id}` as Href} />;

  if (query.isPending || query.error || !query.data) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['bottom', 'left', 'right']}>
        <Stack.Screen options={{ title: 'Kurulum tutanağı', headerShown: true }} />
        {query.isPending ? <Loading /> : <ErrorState message={query.error?.message ?? 'Kurulum yüklenemedi.'} onRetry={() => void query.refetch()} />}
      </SafeAreaView>
    );
  }

  if (query.data.completedAt || query.data.status?.code === 'completed' || query.data.status?.code === 'cancelled') {
    return <Redirect href={`/(tabs)/modules/installations/${id}` as Href} />;
  }

  const data = query.data;

  const submit = () => {
    setError(null);
    const date = parseDateInput(installationDate);
    if (!date) return setError('Kurulum tarihi YYYY-AA-GG biçiminde geçerli bir tarih olmalı.');
    const missing = INSTALLATION_FORM_DEFAULT_CHECKS.filter((check) => !checks[check.id]);
    if (missing.length) return setError('Kontrol çizelgesindeki tüm satırlar Yapıldı veya Yapılmadı olarak işaretlenmeli.');
    if (hasProblem === null) return setError('Problem var mı sorusunu yanıtlayın.');
    if (hasProblem && !problemNote.trim()) return setError('Problem varsa açıklama girin.');

    const customChecks = (existing?.checks ?? []).filter((row) =>
      !INSTALLATION_FORM_DEFAULT_CHECKS.some((required) => row.id === required.id || row.label === required.label),
    );
    const candidate = {
      ...(existing ?? {}),
      kurulumTarihi: date,
      machineId: data.customerDeviceId ?? existing?.machineId,
      tezgah: {
        ...(existing?.tezgah ?? {}),
        marka: existing?.tezgah?.marka ?? data.customerDevice?.brandName ?? undefined,
        tip: existing?.tezgah?.tip ?? data.customerDevice?.productTypeName ?? undefined,
        model: existing?.tezgah?.model ?? data.customerDevice?.productModelName ?? data.customerDevice?.model ?? undefined,
        seriNo: existing?.tezgah?.seriNo ?? data.customerDevice?.serialNumber ?? undefined,
      },
      cnc: {
        ...(existing?.cnc ?? {}),
        model: existing?.cnc?.model ?? data.customerDevice?.controlUnit ?? undefined,
        seriNo: existing?.cnc?.seriNo ?? data.customerDevice?.controlUnitSerialNumber ?? undefined,
      },
      kullanici: {
        ...(existing?.kullanici ?? {}),
        firma: existing?.kullanici?.firma ?? data.company?.legalTitle ?? undefined,
        ilgili: existing?.kullanici?.ilgili ?? data.contact?.fullName ?? undefined,
      },
      technicalSpecs: data.customerDevice?.technicalSpecs ?? existing?.technicalSpecs,
      checks: [
        ...INSTALLATION_FORM_DEFAULT_CHECKS.map((check) => ({
          id: check.id,
          label: check.label,
          status: checks[check.id]!,
          note: existing?.checks?.find((row) => row.id === check.id || row.label === check.label)?.note,
        })),
        ...customChecks,
      ],
      problem: {
        hasProblem,
        note: problemNote.trim() || undefined,
        actionNote: actionNote.trim() || undefined,
      },
      kurulumuYapan: installer.trim() || undefined,
      teslimAlan: recipient.trim() || undefined,
    };
    const parsed = installationFormDataSchema.safeParse(candidate);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Tutanak alanlarını kontrol edin.');
      return;
    }
    complete.mutate(
      { statusCode: 'completed', installationDate: date.toISOString(), formData: parsed.data },
      {
        onSuccess: () => {
          Alert.alert('Kurulum tamamlandı', 'Tutanak kaydedildi ve makine garanti tarihleri güncellendi.');
          router.back();
        },
        onError: (mutationError) => setError(mutationError.message),
      },
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['bottom', 'left', 'right']}>
      <Stack.Screen options={{ title: 'Kurulum tutanağı', headerShown: true }} />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerClassName="gap-4 p-4 pb-8" keyboardShouldPersistTaps="handled">
          <Card className="gap-1">
            <Text className="font-inter-semibold text-base text-foreground">{data.company?.legalTitle ?? 'Firma'}</Text>
            <Text className="font-inter text-sm text-muted-foreground">
              {[data.customerDevice?.brandName, data.customerDevice?.productModelName ?? data.customerDevice?.model, data.customerDevice?.serialNumber ? `SN ${data.customerDevice.serialNumber}` : null].filter(Boolean).join(' · ')}
            </Text>
          </Card>

          <Field label="Kurulum tarihi *" value={installationDate} onChangeText={setInstallationDate} placeholder="YYYY-AA-GG" keyboardType="numbers-and-punctuation" />
          <Field label="Kurulumu yapan" value={installer} onChangeText={setInstaller} maxLength={255} />
          <Field label="Teslim alan" value={recipient} onChangeText={setRecipient} maxLength={255} />

          <View className="gap-2">
            <Text className="font-inter-semibold text-[15px] text-foreground">Kontrol çizelgesi *</Text>
            {INSTALLATION_FORM_DEFAULT_CHECKS.map((check) => (
              <Card key={check.id} className="gap-2 p-3">
                <Text className="font-inter-medium text-[14px] text-foreground">{check.label}</Text>
                <View className="flex-row gap-2">
                  {([
                    ['done', 'Yapıldı'],
                    ['not_done', 'Yapılmadı'],
                  ] as const).map(([value, label]) => {
                    const selected = checks[check.id] === value;
                    return (
                      <Pressable
                        key={value}
                        accessibilityRole="radio"
                        accessibilityState={{ selected }}
                        onPress={() => setChecks((current) => ({ ...current, [check.id]: value }))}
                        className={`min-h-[44px] flex-1 items-center justify-center rounded-control border px-2 ${selected ? 'border-primary bg-primary' : 'border-border bg-card'}`}
                      >
                        <Text className={`font-inter-semibold text-[13px] ${selected ? 'text-primary-foreground' : 'text-foreground'}`}>{label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </Card>
            ))}
          </View>

          <View className="gap-2">
            <Text className="font-inter-semibold text-[15px] text-foreground">Problem var mı? *</Text>
            <View className="flex-row gap-2">
              {([[false, 'Hayır'], [true, 'Evet']] as const).map(([value, label]) => {
                const selected = hasProblem === value;
                return (
                  <Pressable
                    key={label}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    onPress={() => setHasProblem(value)}
                    className={`min-h-[44px] flex-1 items-center justify-center rounded-control border ${selected ? (value ? 'border-destructive bg-destructive' : 'border-primary bg-primary') : 'border-border bg-card'}`}
                  >
                    <Text className={`font-inter-semibold text-[14px] ${selected ? 'text-white' : 'text-foreground'}`}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {hasProblem ? (
            <>
              <Field label="Problem açıklaması *" value={problemNote} onChangeText={setProblemNote} multiline numberOfLines={3} maxLength={2000} />
              <Field label="Yapılan / planlanan işlem" value={actionNote} onChangeText={setActionNote} multiline numberOfLines={3} maxLength={2000} />
            </>
          ) : null}

          {error ? <Text accessibilityLiveRegion="assertive" className="font-inter text-sm text-destructive">{error}</Text> : null}
          <Text className="font-inter text-xs text-muted-foreground">
            Gönderim çevrimiçi yapılır. Sunucu aynı şemayı yeniden doğrular; eksik kontrol satırıyla kurulum tamamlanamaz.
          </Text>
        </ScrollView>

        <View className="flex-row gap-3 border-t border-border bg-card px-4 py-3" style={{ borderTopColor: colors.border }}>
          <View className="flex-1"><Button label="Vazgeç" variant="ghost" onPress={() => router.back()} /></View>
          <View className="flex-[2]"><Button label="Tamamla ve Kaydet" loading={complete.isPending} onPress={submit} /></View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
