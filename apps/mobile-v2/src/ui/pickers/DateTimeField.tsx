import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useTheme } from '@/src/theme/theme';
import { Button } from '@/src/ui';
import { PickerField, useSheetProps } from './PickerField';
import {
  HOURS,
  MONTH_NAMES,
  WEEKDAY_SHORT,
  formatPickerValue,
  isSameDay,
  minuteSteps,
  monthGrid,
  roundToStep,
  shiftMonth,
  withDay,
  withTime,
} from './datetime-logic';

/** Yerel paket gerektirmeyen tarih/saat seçici (ay ızgarası + saat/dakika). */
export function DateTimeField({
  label,
  value,
  onChange,
  mode = 'datetime',
  placeholder,
  error,
  clearable,
  minuteStep = 5,
  disabled,
}: {
  label: string;
  value: Date | null;
  onChange: (value: Date | null) => void;
  mode?: 'date' | 'datetime';
  placeholder?: string;
  error?: string;
  clearable?: boolean;
  minuteStep?: number;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const sheet = useRef<BottomSheetModal>(null);
  const sheetProps = useSheetProps(mode === 'date' ? '62%' : '88%');
  const [draft, setDraft] = useState<Date>(() => value ?? roundToStep(new Date(), minuteStep));
  const [view, setView] = useState(() => ({ year: draft.getFullYear(), month: draft.getMonth() }));
  const grid = useMemo(() => monthGrid(view.year, view.month), [view]);
  const minutes = useMemo(() => minuteSteps(minuteStep), [minuteStep]);
  const today = new Date();

  useEffect(() => {
    if (value) setDraft(value);
  }, [value]);

  function open() {
    const start = value ?? roundToStep(new Date(), minuteStep);
    setDraft(start);
    setView({ year: start.getFullYear(), month: start.getMonth() });
    sheet.current?.present();
  }

  function confirm() {
    onChange(mode === 'date' ? withTime(draft, 0, 0) : draft);
    sheet.current?.dismiss();
  }

  return (
    <>
      <PickerField
        label={label}
        value={formatPickerValue(value, mode)}
        placeholder={placeholder ?? (mode === 'date' ? 'Tarih seçin' : 'Tarih ve saat seçin')}
        icon={mode === 'date' ? 'calendar-outline' : 'time-outline'}
        error={error}
        disabled={disabled}
        onPress={open}
        onClear={clearable ? () => onChange(null) : undefined}
      />
      <BottomSheetModal ref={sheet} {...sheetProps}>
        <BottomSheetScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32, gap: 12 }}>
          <Text accessibilityRole="header" className="font-inter-semibold text-base text-foreground">{label}</Text>
          <View className="flex-row items-center justify-between">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Önceki ay"
              onPress={() => setView((current) => shiftMonth(current.year, current.month, -1))}
              className="h-11 w-11 items-center justify-center rounded-full active:bg-muted"
            >
              <Ionicons name="chevron-back" size={20} color={colors.foreground} />
            </Pressable>
            <Text className="font-inter-semibold text-[15px] text-foreground">
              {MONTH_NAMES[view.month]} {view.year}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Sonraki ay"
              onPress={() => setView((current) => shiftMonth(current.year, current.month, 1))}
              className="h-11 w-11 items-center justify-center rounded-full active:bg-muted"
            >
              <Ionicons name="chevron-forward" size={20} color={colors.foreground} />
            </Pressable>
          </View>
          <View className="flex-row">
            {WEEKDAY_SHORT.map((day) => (
              <Text key={day} className="flex-1 text-center font-inter-medium text-[11px] text-muted-foreground">{day}</Text>
            ))}
          </View>
          <View className="flex-row flex-wrap">
            {grid.map((day) => {
              const selected = isSameDay(day.date, draft);
              const isToday = isSameDay(day.date, today);
              return (
                <Pressable
                  key={day.key}
                  accessibilityRole="button"
                  accessibilityLabel={day.date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
                  accessibilityState={{ selected }}
                  onPress={() => setDraft((current) => withDay(current, day.date))}
                  style={{ width: `${100 / 7}%` }}
                  className="h-11 items-center justify-center"
                >
                  <View
                    className={`h-10 w-10 items-center justify-center rounded-full ${selected ? 'bg-primary' : isToday ? 'border border-primary' : ''}`}
                  >
                    <Text
                      className={`font-inter text-sm ${selected ? 'font-inter-semibold text-primary-foreground' : day.inMonth ? 'text-foreground' : 'text-muted-foreground'}`}
                    >
                      {day.date.getDate()}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
          {mode === 'datetime' ? (
            <View className="gap-2">
              <Text className="font-inter-medium text-[13px] text-muted-foreground">Saat</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                {HOURS.map((hour) => {
                  const selected = draft.getHours() === hour;
                  return (
                    <Pressable
                      key={hour}
                      accessibilityRole="button"
                      accessibilityLabel={`Saat ${hour}`}
                      accessibilityState={{ selected }}
                      onPress={() => setDraft((current) => withTime(current, hour, current.getMinutes()))}
                      className={`h-11 min-w-11 items-center justify-center rounded-control border px-2 ${selected ? 'border-primary bg-primary' : 'border-border bg-card'}`}
                    >
                      <Text className={`font-inter-medium text-sm ${selected ? 'text-primary-foreground' : 'text-foreground'}`}>{String(hour).padStart(2, '0')}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <Text className="font-inter-medium text-[13px] text-muted-foreground">Dakika</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                {minutes.map((minute) => {
                  const selected = draft.getMinutes() === minute;
                  return (
                    <Pressable
                      key={minute}
                      accessibilityRole="button"
                      accessibilityLabel={`Dakika ${minute}`}
                      accessibilityState={{ selected }}
                      onPress={() => setDraft((current) => withTime(current, current.getHours(), minute))}
                      className={`h-11 min-w-11 items-center justify-center rounded-control border px-2 ${selected ? 'border-primary bg-primary' : 'border-border bg-card'}`}
                    >
                      <Text className={`font-inter-medium text-sm ${selected ? 'text-primary-foreground' : 'text-foreground'}`}>{String(minute).padStart(2, '0')}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}
          <Text className="font-inter text-sm text-foreground">Seçilen: {formatPickerValue(draft, mode)}</Text>
          <View className="flex-row gap-3">
            <View className="flex-1"><Button label="Vazgeç" variant="ghost" onPress={() => sheet.current?.dismiss()} /></View>
            <View className="flex-[2]"><Button label="Seç" onPress={confirm} /></View>
          </View>
        </BottomSheetScrollView>
      </BottomSheetModal>
    </>
  );
}
