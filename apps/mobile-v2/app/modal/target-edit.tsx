import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/src/auth/AuthProvider';
import { useSaveTarget, useSubjectProgress, useTargetRow } from '@/src/api/targets.hooks';
import { useTheme } from '@/src/theme/theme';
import { Button, Card, ErrorState, Eyebrow, Field, Loading } from '@/src/ui';
import { ProgressBar } from '@/src/ui/data';
import { toast } from '@/src/ui/toast';
import { PillGroup } from '@/src/ui/sales/Sheet';
import {
  buildPeriodResult,
  clearTargets,
  currentPeriod,
  emptyTargetForm,
  fillFromTemplate,
  formatTargetValue,
  hasTargetValue,
  invalidTargetFieldCount,
  isInvalidMainField,
  isInvalidTargetItem,
  isPeriod,
  MAIN_TARGET_FIELDS,
  periodLabelLong,
  SCOPE_META,
  shiftMonth,
  STATUS_META,
  TARGET_TYPE_LABELS,
  TARGET_TYPE_ORDER,
  targetFilledCount,
  targetFormFromApi,
  targetFormToApi,
  targetItemKey,
  type ScopeKind,
  type TargetForm,
  type TargetFormItem,
  type UserTargetType,
} from '@/src/ui/sales/targets-logic';

const SCOPES: ScopeKind[] = ['user', 'department', 'division'];

function TargetItemRow({ item, onChange }: { item: TargetFormItem; onChange: (next: TargetFormItem) => void }) {
  const invalid = isInvalidTargetItem(item);
  const unit = item.unit === 'amount' ? 'USD' : 'adet';
  return (
    <View className="gap-1.5 border-t border-border py-2.5">
      <Text className="font-inter-semibold text-[13px] text-foreground">{item.activity}</Text>
      <Text className="font-inter text-[11px] text-muted-foreground" numberOfLines={3}>
        {item.category} · {item.trackingMode === 'automatic' ? 'Otomatik takip' : 'Manuel takip'} · {item.description}
      </Text>
      <View className="flex-row gap-2">
        <TextInput
          accessibilityLabel={`${item.activity} hedefi (${unit})`}
          value={item.target}
          onChangeText={(target) => onChange({ ...item, target })}
          placeholder={item.defaultTarget ? `Şablon: ${item.defaultTarget}` : `Hedef (${unit})`}
          keyboardType="decimal-pad"
          maxLength={24}
          className={`min-h-[44px] flex-1 rounded-[10px] border bg-input-background px-3 font-inter text-[15px] text-foreground ${invalid ? 'border-destructive' : 'border-transparent'}`}
        />
        {item.trackingMode === 'manual' ? (
          <TextInput
            accessibilityLabel={`${item.activity} gerçekleşen (${unit})`}
            value={item.manualActual}
            onChangeText={(manualActual) => onChange({ ...item, manualActual })}
            placeholder="Gerçekleşen"
            keyboardType="decimal-pad"
            maxLength={24}
            className={`min-h-[44px] flex-1 rounded-[10px] border bg-input-background px-3 font-inter text-[15px] text-foreground ${invalid ? 'border-destructive' : 'border-transparent'}`}
          />
        ) : null}
      </View>
    </View>
  );
}

/** Web admin/TargetDialog karşılığı: kişi/departman/bölüm için dönem hedefi atama. */
export default function TargetEditScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ kind?: string; id?: string; name?: string; period?: string }>();
  const kind: ScopeKind = SCOPES.includes(params.kind as ScopeKind) ? (params.kind as ScopeKind) : 'user';
  const id = typeof params.id === 'string' ? params.id : '';
  const name = typeof params.name === 'string' ? params.name : '';
  const isAdmin = Boolean(user?.roles?.some((role) => role === 'admin' || role === 'super_admin'));

  const [period, setPeriod] = useState(() => (typeof params.period === 'string' && isPeriod(params.period) ? params.period : currentPeriod()));
  const [form, setForm] = useState<TargetForm>(() => emptyTargetForm(period));
  const [section, setSection] = useState<UserTargetType>('sales');
  const [showErrors, setShowErrors] = useState(false);

  const row = useTargetRow(kind, id, period);
  const progress = useSubjectProgress(kind, id, period);
  const save = useSaveTarget();

  // Arka plan yenilemesi yazılan değerleri ezmesin: form her dönem için bir kez doldurulur.
  const loadedPeriod = useRef<string | null>(null);
  useEffect(() => {
    if (!row.isSuccess || loadedPeriod.current === period) return;
    loadedPeriod.current = period;
    setForm(row.data ? targetFormFromApi(row.data, period) : emptyTargetForm(period));
  }, [row.isSuccess, row.data, period]);

  const live = useMemo(() => (progress.data ? buildPeriodResult(period, progress.data) : null), [progress.data, period]);
  const invalidCount = invalidTargetFieldCount(form);
  const sectionItems = form.targetItems.filter((item) => item.targetType === section);

  if (!isAdmin || !id) return <Redirect href={'/modules/targets' as Href} />;

  function updateItem(next: TargetFormItem) {
    const key = targetItemKey(next);
    setForm((current) => ({ ...current, targetItems: current.targetItems.map((item) => (targetItemKey(item) === key ? next : item)) }));
  }

  function submit() {
    if (invalidCount > 0) {
      setShowErrors(true);
      Alert.alert('Hedef değerlerini kontrol edin', 'Adet alanları tam sayı, tutar alanları pozitif sayı olmalı.');
      return;
    }
    const persist = () =>
      save.mutate(
        { kind, id, body: targetFormToApi({ ...form, period }) },
        {
          onSuccess: () => {
            toast.success(`Hedef kaydedildi · ${name} · ${periodLabelLong(period)}`);
            router.back();
          },
          onError: (error) => toast.error(`Hedef kaydedilemedi: ${error.message}`),
        }
      );
    if (!hasTargetValue(form) && row.data) {
      Alert.alert('Hedefi kaldır', `${name} için ${periodLabelLong(period)} hedefi silinecek.`, [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'Hedefi kaldır', style: 'destructive', onPress: persist },
      ]);
      return;
    }
    persist();
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['bottom', 'left', 'right']}>
      <Stack.Screen options={{ title: 'Hedef ata / düzenle', headerShown: true }} />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerClassName="gap-4 p-4 pb-10" keyboardShouldPersistTaps="handled">
          <Card className="gap-2">
            <Eyebrow>{SCOPE_META[kind].label}</Eyebrow>
            <Text className="font-display-semibold text-[20px] text-foreground">{name}</Text>
            <View className="h-12 flex-row items-center rounded-[12px] border border-border">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Önceki dönem"
                onPress={() => setPeriod((current) => shiftMonth(current, -1))}
                className="h-12 w-12 items-center justify-center active:opacity-60"
              >
                <Ionicons name="chevron-back" size={18} color={colors.foreground} />
              </Pressable>
              <Text className="flex-1 text-center font-inter-semibold text-[15px] text-foreground">{periodLabelLong(period)}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Sonraki dönem"
                onPress={() => setPeriod((current) => shiftMonth(current, 1))}
                className="h-12 w-12 items-center justify-center active:opacity-60"
              >
                <Ionicons name="chevron-forward" size={18} color={colors.foreground} />
              </Pressable>
            </View>
          </Card>

          {row.isPending ? (
            <Loading />
          ) : row.error ? (
            <ErrorState message={`Hedef bilgisi alınamadı: ${row.error.message}`} onRetry={() => void row.refetch()} />
          ) : (
            <>
              {live && live.lines.length > 0 ? (
                <Card className="gap-2">
                  <Eyebrow>Canlı ilerleme</Eyebrow>
                  {live.lines.slice(0, 6).map((line) => (
                    <View key={line.id} className="gap-1">
                      <View className="flex-row justify-between gap-2">
                        <Text className="flex-1 font-inter-medium text-[13px] text-foreground" numberOfLines={1}>{line.label}</Text>
                        <Text className="font-inter text-[12px] text-muted-foreground">
                          {formatTargetValue(line.actual, line.unit)} / {formatTargetValue(line.target, line.unit)}
                        </Text>
                      </View>
                      {line.pct != null ? (
                        <ProgressBar done={Math.min(100, Math.max(0, line.pct))} total={100} tone={STATUS_META[line.status].tone} />
                      ) : null}
                    </View>
                  ))}
                </Card>
              ) : null}

              <Card className="gap-3">
                <Eyebrow>Ana hedefler</Eyebrow>
                {MAIN_TARGET_FIELDS.map((field) => (
                  <Field
                    key={field.key}
                    label={`${field.label} (${field.unit})`}
                    value={form[field.key]}
                    onChangeText={(value) => setForm((current) => ({ ...current, [field.key]: value }))}
                    keyboardType="decimal-pad"
                    maxLength={24}
                    error={showErrors && isInvalidMainField(field.key, form[field.key]) ? 'Geçersiz değer' : undefined}
                  />
                ))}
              </Card>

              <Card className="gap-3">
                <Eyebrow>Hedef şablonları</Eyebrow>
                <PillGroup
                  options={TARGET_TYPE_ORDER.map((type) => ({
                    value: type,
                    label: TARGET_TYPE_LABELS[type].label,
                    count: targetFilledCount(form, type) || undefined,
                  }))}
                  value={section}
                  allowClear={false}
                  onChange={(next) => next && setSection(next)}
                />
                <Text className="font-display-semibold text-[16px] text-foreground">{TARGET_TYPE_LABELS[section].title}</Text>
                <View className="flex-row flex-wrap gap-2">
                  <View className="min-w-[45%] flex-1">
                    <Button label="Bu bölümü şablondan doldur" variant="ghost" onPress={() => setForm((current) => fillFromTemplate(current, section))} />
                  </View>
                  <View className="min-w-[45%] flex-1">
                    <Button label="Bu bölümü temizle" variant="ghost" onPress={() => setForm((current) => clearTargets(current, section))} />
                  </View>
                  <View className="min-w-[45%] flex-1">
                    <Button label="Tüm hedefleri şablondan doldur" variant="ghost" onPress={() => setForm((current) => fillFromTemplate(current))} />
                  </View>
                  <View className="min-w-[45%] flex-1">
                    <Button
                      label="Tüm hedefleri temizle"
                      variant="ghost"
                      onPress={() =>
                        Alert.alert('Tüm hedefleri temizle', 'Bütün şablon hedefleri boşaltılacak.', [
                          { text: 'Vazgeç', style: 'cancel' },
                          { text: 'Temizle', style: 'destructive', onPress: () => setForm((current) => clearTargets(current)) },
                        ])
                      }
                    />
                  </View>
                </View>
                {sectionItems.map((item) => (
                  <TargetItemRow key={targetItemKey(item)} item={item} onChange={updateItem} />
                ))}
              </Card>

              <Card className="gap-2">
                <Field
                  label="Not"
                  value={form.note}
                  onChangeText={(note) => setForm((current) => ({ ...current, note }))}
                  multiline
                  numberOfLines={3}
                  maxLength={2000}
                />
              </Card>
              {showErrors && invalidCount > 0 ? (
                <Text className="font-inter text-[13px] text-destructive">{invalidCount} alanda geçersiz değer var.</Text>
              ) : null}
            </>
          )}
        </ScrollView>
        <View className="flex-row gap-3 border-t border-border bg-card px-4 py-3">
          <View className="flex-1">
            <Button label="Vazgeç" variant="ghost" onPress={() => router.back()} />
          </View>
          <View className="flex-[2]">
            <Button label="Hedefi Kaydet" loading={save.isPending} disabled={save.isPending || row.isPending} onPress={submit} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
