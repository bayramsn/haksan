import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTargetProgress } from '@/src/api/admin.hooks';
import type { TargetProgressScope } from '@/src/api/admin.api';
import { chipClass, chipTextClass, toneColor, useTheme } from '@/src/theme/theme';
import { Button, Card, Eyebrow, Field } from '@/src/ui';
import { Tabs } from '@/src/ui/data';
import { toast } from '@/src/ui/toast';
import { ActionPill, Notice, confirmDestructive } from './controls';
import {
  MAIN_METRIC_FIELDS,
  TARGET_TYPE_META,
  TARGET_TYPE_ORDER,
  applyTemplateTargets,
  clearTargets,
  expectedPeriodPct,
  formatPeriodLabel,
  formatTargetNumber,
  groupTargetItems,
  invalidMainFieldCount,
  isAutoTracked,
  isInvalidNumberFor,
  isInvalidTargetItem,
  isMeasuredMetric,
  livePace,
  parseTargetNumber,
  progressPct,
  summarizeTargetItems,
  targetItemKey,
  type MainFieldKey,
  type TargetForm,
  type TargetItem,
  type TargetMetricKey,
  type TargetType,
} from './target-model';

export type TargetScope = {
  kind: TargetProgressScope;
  id: string;
  name: string;
  subtitle?: string | null;
  /** Rol kapsamında hedefin kopyalanacağı aktif kullanıcı sayısı. */
  memberCount?: number;
};

type Section = 'overview' | TargetType;

const scopeKindLabel = (kind: TargetScope['kind']) =>
  kind === 'user' ? 'Kullanıcı' : kind === 'department' ? 'Departman' : kind === 'division' ? 'Bölüm' : 'Rol';

function ProgressLine({ actual, pct, label }: { actual: number; pct: number | null; label: string }) {
  const { colors } = useTheme();
  const tone = pct != null && pct >= 100 ? 'success' : 'info';
  return (
    <View className="mt-1.5 gap-1">
      <View className="flex-row items-center justify-between">
        <Text className="font-inter text-[11px] text-muted-foreground">
          {label}: <Text className="font-inter-semibold text-foreground">{formatTargetNumber(actual)}</Text>
        </Text>
        {pct != null ? (
          <Text className="font-inter-semibold text-[11px]" style={{ color: toneColor(colors, pct >= 60 ? (pct >= 100 ? 'success' : 'neutral') : 'warning') }}>
            %{pct}
          </Text>
        ) : null}
      </View>
      <View className="h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: colors.muted }}>
        <View className="h-full rounded-full" style={{ width: `${Math.min(Math.max(pct ?? 0, 0), 100)}%`, backgroundColor: toneColor(colors, tone) }} />
      </View>
    </View>
  );
}

function TrackingBadge({ auto }: { auto: boolean }) {
  const { colors } = useTheme();
  const tone = auto ? 'success' : 'neutral';
  return (
    <View
      accessible
      accessibilityLabel={auto ? 'Otomatik takip: gerçekleşme sistem kayıtlarından ölçülür' : 'Manuel takip: gerçekleşme sistem verisinden ölçülemez'}
      className={`flex-row items-center gap-1 rounded-full border px-2 py-0.5 ${chipClass[tone]}`}
    >
      <Ionicons name={auto ? 'flash' : 'create-outline'} size={11} color={toneColor(colors, tone)} />
      <Text className={`font-inter-semibold text-[10px] ${chipTextClass[tone]}`}>{auto ? 'Otomatik' : 'Manuel'}</Text>
    </View>
  );
}

function NumberInput({
  value,
  onChange,
  unit,
  invalid,
  label,
  editable = true,
}: {
  value: string;
  onChange: (next: string) => void;
  unit: string;
  invalid: boolean;
  label: string;
  editable?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View className={`h-11 flex-row items-center overflow-hidden rounded-control border bg-input-background ${invalid ? 'border-destructive' : 'border-transparent'}`}>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={invalid ? 'Geçersiz değer' : undefined}
        value={value}
        onChangeText={onChange}
        editable={editable}
        keyboardType={unit === 'adet' ? 'number-pad' : 'decimal-pad'}
        placeholder={unit === 'adet' ? '0' : 'tutar'}
        placeholderTextColor={colors.mutedForeground}
        className="flex-1 px-3 text-right font-inter text-[15px] text-foreground"
        style={{ fontVariant: ['tabular-nums'] }}
      />
      <View className="h-full w-14 items-center justify-center border-l border-border">
        <Text className="font-inter-medium text-[11px] text-muted-foreground">{unit}</Text>
      </View>
    </View>
  );
}

export function TargetEditor({
  scope,
  period,
  initial,
  saving,
  onSave,
}: {
  scope: TargetScope;
  period: string;
  initial: TargetForm;
  saving: boolean;
  onSave: (form: TargetForm) => void;
}) {
  const { colors } = useTheme();
  const [form, setForm] = useState<TargetForm>(() => ({ ...initial, period }));
  const [section, setSection] = useState<Section>('overview');
  const live = useTargetProgress({ period, scope: scope.kind, id: scope.id });
  const subject = live.data?.subjects?.[0];

  const factor = scope.kind === 'role' ? (scope.memberCount && scope.memberCount > 0 ? scope.memberCount : null) : 1;
  const actualLabel = scope.kind === 'user' ? 'Gerçekleşen' : 'Ekip gerçekleşen';
  const actualFor = (key: TargetMetricKey | null | undefined) => (key ? subject?.metrics?.[key]?.actual ?? null : null);

  const statsByType = useMemo(
    () =>
      Object.fromEntries(
        TARGET_TYPE_ORDER.map((type) => [type, summarizeTargetItems(form.targetItems.filter((item) => item.targetType === type))])
      ) as Record<TargetType, ReturnType<typeof summarizeTargetItems>>,
    [form.targetItems]
  );
  const allStats = useMemo(() => summarizeTargetItems(form.targetItems), [form.targetItems]);
  const autoCount =
    form.targetItems.filter(isAutoTracked).length + MAIN_METRIC_FIELDS.filter((f) => isMeasuredMetric(f.metricKey)).length;
  const invalidCount = allStats.invalid + invalidMainFieldCount(form);
  const pace = expectedPeriodPct(period);
  const currentPace = livePace(form, actualFor, factor);

  const setMain = (key: MainFieldKey, value: string) => setForm((prev) => ({ ...prev, [key]: value }));
  const setItem = (key: string, patch: Partial<TargetItem>) =>
    setForm((prev) => ({
      ...prev,
      targetItems: prev.targetItems.map((item) => (targetItemKey(item) === key ? { ...item, ...patch } : item)),
    }));

  const submit = () => {
    if (invalidCount > 0) {
      toast.error('Hedef değerlerini kontrol edin: adet alanları tam sayı, tutar alanları pozitif sayı olmalı.');
      return;
    }
    onSave(form);
  };

  const tabs = [
    { value: 'overview' as Section, label: 'Genel & Ana Metrikler', icon: 'grid-outline' as const },
    ...TARGET_TYPE_ORDER.map((type) => ({
      value: type as Section,
      label: `${TARGET_TYPE_META[type].label} ${statsByType[type].filled}/${statsByType[type].total}`,
    })),
  ];
  const activeType = section === 'overview' ? null : section;

  return (
    <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerClassName="gap-4 pb-8 pt-3" keyboardShouldPersistTaps="handled">
        <View className="gap-1 px-4">
          <Text className="font-display text-[22px] text-foreground" numberOfLines={2}>
            Hedef Belirle · {scope.name}
          </Text>
          <Text className="font-inter text-[13px] text-muted-foreground">
            {scopeKindLabel(scope.kind)}
            {scope.subtitle ? ` · ${scope.subtitle}` : ''} · {formatPeriodLabel(period)} dönemi aylık hedefleri
          </Text>
          <Text className="font-inter text-[12px] text-muted-foreground">
            {allStats.filled}/{allStats.total} dolu · {autoCount} hedef otomatik takipte
          </Text>
        </View>

        <Tabs tabs={tabs} value={section} onChange={setSection} />

        <View className="gap-3 px-4">
          {activeType === null ? (
            <>
              {scope.kind === 'role' ? (
                <Notice tone="warning">
                  {`Kaydedildiğinde bu roldeki ${scope.memberCount ?? 'tüm'} aktif kullanıcıya ${formatPeriodLabel(period)} dönemi için kişisel hedef olarak uygulanır; kullanıcıların mevcut dönem hedefleri bu değerlerle değiştirilir.`}
                </Notice>
              ) : null}
              <Card className="gap-2 p-3.5">
                <View className="flex-row items-center justify-between">
                  <View className="flex-1">
                    <Text className="font-inter-semibold text-[13px] text-foreground">Dönem temposu</Text>
                    <Text className="font-inter text-[11px] text-muted-foreground">Program kayıtları hedeflerle otomatik karşılaştırılır</Text>
                  </View>
                  <View className="items-end">
                    <Text className="font-inter text-[11px] text-muted-foreground">Beklenen %{pace}</Text>
                    <Text className="font-inter text-[11px] text-muted-foreground">
                      Gerçekleşen {live.isLoading ? 'hesaplanıyor' : currentPace == null ? '—' : `%${currentPace}`}
                    </Text>
                  </View>
                </View>
                <View className="h-2 overflow-hidden rounded-full" style={{ backgroundColor: colors.muted }}>
                  <View
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(100, Math.max(0, currentPace ?? 0))}%`,
                      backgroundColor: toneColor(colors, currentPace != null && currentPace + 10 < pace ? 'warning' : 'info'),
                    }}
                  />
                </View>
              </Card>
              <View className="flex-row gap-3">
                <View className="flex-1 gap-1">
                  <Eyebrow>Dönem</Eyebrow>
                  <Text className="font-inter-medium text-[15px] text-foreground">{formatPeriodLabel(period)}</Text>
                </View>
                <View className="flex-1 gap-1">
                  <Eyebrow>Para Birimi</Eyebrow>
                  <Text className="font-inter-medium text-[15px] text-foreground">USD</Text>
                </View>
              </View>
              <Field
                label="Not"
                value={form.note}
                onChangeText={(note) => setForm((prev) => ({ ...prev, note }))}
                placeholder="Hedef dönemi notu"
                maxLength={500}
                multiline
                style={{ minHeight: 72, paddingTop: 12 }}
              />
              <View className="gap-1">
                <Text className="font-inter-semibold text-[15px] text-foreground">Ana Metrik Hedefleri</Text>
                <Text className="font-inter text-[12px] text-muted-foreground">
                  Gerçekleşmeler sistemden otomatik ölçülür ve Dashboard'a yansır
                </Text>
              </View>
              {live.isError ? (
                <Notice tone="neutral">Gerçekleşme verisi şu an alınamadı; hedefler yine de kaydedilebilir.</Notice>
              ) : null}
              {MAIN_METRIC_FIELDS.map((field) => {
                const value = form[field.key] ?? '';
                const typed = parseTargetNumber(value);
                const invalid = !!value.trim() && typed === null;
                const tracked = isMeasuredMetric(field.metricKey);
                const actual = actualFor(field.metricKey);
                const effective = typed != null && factor != null ? typed * factor : null;
                return (
                  <Card key={field.key} className="gap-2 p-3">
                    <View className="flex-row items-center justify-between gap-2">
                      <Text className="flex-1 font-inter-semibold text-[13px] text-foreground">{field.label}</Text>
                      <TrackingBadge auto={tracked} />
                    </View>
                    <NumberInput label={field.label} value={value} onChange={(v) => setMain(field.key, v)} unit={field.unit} invalid={invalid} />
                    {invalid ? (
                      <Text className="font-inter text-[11px] text-destructive">Geçersiz değer</Text>
                    ) : tracked && actual != null ? (
                      <ProgressLine actual={actual} pct={progressPct(actual, effective)} label={actualLabel} />
                    ) : (
                      <Text className="font-inter text-[11px] text-muted-foreground">
                        {tracked ? 'Gerçekleşme sistemden ölçülür' : 'Manuel takip edilir'}
                      </Text>
                    )}
                  </Card>
                );
              })}
            </>
          ) : (
            <>
              <View className="gap-1">
                <Text className="font-inter-semibold text-[16px] text-foreground">{TARGET_TYPE_META[activeType].title}</Text>
                <Text className="font-inter text-[12px] text-muted-foreground">
                  {statsByType[activeType].filled}/{statsByType[activeType].total} dolu
                  {statsByType[activeType].countTotal > 0 ? ` · ${formatTargetNumber(statsByType[activeType].countTotal)} adet` : ''}
                  {statsByType[activeType].amountTotal > 0 ? ` · USD ${formatTargetNumber(statsByType[activeType].amountTotal)}` : ''}
                  {statsByType[activeType].invalid > 0 ? ` · ${statsByType[activeType].invalid} geçersiz değer` : ''}
                </Text>
              </View>
              <View className="flex-row flex-wrap gap-2">
                <ActionPill icon="refresh-outline" label="Bu bölümü şablondan doldur" onPress={() => setForm((prev) => applyTemplateTargets(prev, activeType))} />
                <ActionPill icon="list-outline" label="Tüm hedefleri şablondan doldur" onPress={() => setForm((prev) => applyTemplateTargets(prev))} />
                <ActionPill icon="backspace-outline" label="Bu bölümü temizle" onPress={() => setForm((prev) => clearTargets(prev, activeType))} />
                <ActionPill
                  icon="trash-outline"
                  tone="destructive"
                  label="Tüm hedefleri temizle"
                  onPress={() =>
                    confirmDestructive('Tüm hedefler temizlensin mi?', 'Bu formdaki bütün hedef ve gerçekleşme değerleri boşaltılır.', 'Temizle', () =>
                      setForm((prev) => clearTargets(prev))
                    )
                  }
                />
              </View>
              {groupTargetItems(form.targetItems.filter((item) => item.targetType === activeType)).map((group) => (
                <Card key={group.category} className="overflow-hidden p-0">
                  <View className="flex-row items-center justify-between border-b border-border px-3 py-2">
                    <Text className="font-inter-semibold text-[12px] text-foreground">{group.category}</Text>
                    <Text className="font-inter text-[11px] text-muted-foreground">
                      {group.items.filter((item) => !!item.target.trim()).length}/{group.items.length} dolu
                    </Text>
                  </View>
                  {group.items.map((item, index) => {
                    const key = targetItemKey(item);
                    const auto = isAutoTracked(item);
                    const typed = parseTargetNumber(item.target);
                    const effective = typed != null && factor != null ? typed * factor : null;
                    const manual = parseTargetNumber(item.manualActual ?? '');
                    const shown = auto ? actualFor(item.metricKey) : manual;
                    const unit = item.unit === 'amount' ? 'USD' : 'adet';
                    return (
                      <View key={key} className={`gap-2 px-3 py-3 ${index > 0 ? 'border-t border-border' : ''} ${isInvalidTargetItem(item) ? chipClass.destructive : ''}`}>
                        <View className="flex-row items-start gap-2">
                          <Text className="flex-1 font-inter-semibold text-[14px] text-foreground">{item.activity}</Text>
                          <TrackingBadge auto={auto} />
                        </View>
                        <Text className="font-inter text-[12px] leading-[17px] text-muted-foreground">{item.description}</Text>
                        <NumberInput
                          label={`${item.activity} hedefi`}
                          value={item.target}
                          onChange={(target) => setItem(key, { target })}
                          unit={unit}
                          invalid={isInvalidNumberFor(item, item.target)}
                        />
                        {auto ? (
                          shown != null ? <ProgressLine actual={shown} pct={progressPct(shown, effective)} label={actualLabel} /> : null
                        ) : scope.kind === 'role' ? (
                          <Text className="font-inter text-[11px] text-muted-foreground">
                            Gerçekleşme kişi bazında girilir; rol kapsamında toplu yazılmaz.
                          </Text>
                        ) : (
                          <View className="gap-1">
                            <Text className="font-inter-medium text-[11px] text-muted-foreground">Gerçekleşen</Text>
                            <NumberInput
                              label={`${item.activity} gerçekleşen değeri`}
                              value={item.manualActual ?? ''}
                              onChange={(manualActual) => setItem(key, { manualActual })}
                              unit={unit}
                              invalid={isInvalidNumberFor(item, item.manualActual ?? '')}
                            />
                            {shown != null ? <ProgressLine actual={shown} pct={progressPct(shown, effective)} label={actualLabel} /> : null}
                          </View>
                        )}
                      </View>
                    );
                  })}
                </Card>
              ))}
            </>
          )}

          <Text className={`font-inter text-[12px] ${invalidCount ? 'text-destructive' : 'text-muted-foreground'}`}>
            {invalidCount
              ? `${invalidCount} hedef değeri kontrol edilmeli`
              : `${allStats.filled}/${allStats.total} hedef dolu · ${autoCount} hedef otomatik takipte`}
          </Text>
          <Button
            label={scope.kind === 'role' ? `${scope.memberCount ?? ''} Kullanıcıya Uygula`.trim() : 'Kaydet'}
            loading={saving}
            disabled={invalidCount > 0}
            onPress={submit}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
