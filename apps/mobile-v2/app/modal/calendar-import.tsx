import { useMemo, useState } from 'react';
import { ScrollView, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, Stack, useRouter } from 'expo-router';
import { useCalendarImportCommit, useCalendarImportPreview } from '@/src/api/crm-general.hooks';
import type { CalendarImportEvent, CalendarImportEventType, CalendarImportPreview } from '@/src/api/crm-general.api';
import { useCan } from '@/src/auth/AuthProvider';
import { formatTime } from '@/src/lib/format';
import { useTheme } from '@/src/theme/theme';
import { Button, Card, Chip } from '@/src/ui';
import { toast } from '@/src/ui/toast';
import { OptionPicker } from '@/src/ui/pickers/OptionPicker';
import { pickBase64File } from '@/src/ui/crm/pick-file';
import {
  CALENDAR_IMPORT_TYPE_LABELS,
  TR_MONTHS_SHORT,
  calendarImportSelection,
  validateCalendarFile,
} from '@/src/ui/crm/calendar-logic';

const ROW_LIMIT = 200;
const IMPORT_TYPES = Object.keys(CALENDAR_IMPORT_TYPE_LABELS) as CalendarImportEventType[];

function ImportRow({ event }: { event: CalendarImportEvent }) {
  const start = new Date(event.startsAt);
  const date = `${String(start.getDate()).padStart(2, '0')} ${TR_MONTHS_SHORT[start.getMonth()]} ${String(start.getFullYear()).slice(2)}`;
  return (
    <View className="min-h-11 flex-row items-center gap-2 border-b border-border py-2">
      <Text className="w-28 font-inter text-xs text-muted-foreground">
        {date}
        {!event.allDay ? ` ${formatTime(event.startsAt)}` : ''}
      </Text>
      <Text className="flex-1 font-inter-medium text-sm text-foreground" numberOfLines={1}>
        {event.title}
      </Text>
      {event.duplicate ? <Chip tone="neutral" label="Güncellenecek" shrink /> : null}
      {!event.inWindow ? <Chip tone="warning" label="Pencere dışı" shrink /> : null}
    </View>
  );
}

/** Web CalendarPage "Takvim içe aktar (.ics)" diyaloğu. */
export default function CalendarImportScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const canCreate = useCan('calendar.create');
  const preview = useCalendarImportPreview();
  const commit = useCalendarImportCommit();
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState<CalendarImportPreview | null>(null);
  const [onlyWindow, setOnlyWindow] = useState(true);
  const [importType, setImportType] = useState<CalendarImportEventType>('other');

  const selection = useMemo(() => (result ? calendarImportSelection(result.events, onlyWindow) : []), [result, onlyWindow]);
  const busy = preview.isPending || commit.isPending;

  if (!canCreate) return <Redirect href="/(tabs)/modules/calendar" />;

  async function pickFile() {
    try {
      const picked = await pickBase64File({
        types: ['text/calendar', 'application/octet-stream', '*/*'],
        fallbackMimeType: 'text/calendar',
        validate: validateCalendarFile,
      });
      if (!picked) return;
      if ('error' in picked) {
        toast.error(picked.error);
        return;
      }
      setFileName(picked.file.fileName);
      setResult(null);
      preview.mutate(
        { fileName: picked.file.fileName, fileBase64: picked.file.fileBase64 },
        {
          onSuccess: (data) => {
            setResult(data);
            toast.success(`Dosya okundu · ${data.summary.total} etkinlik · ${data.summary.inWindow} tanesi ±6 ay içinde`);
          },
          onError: (error) => {
            setResult(null);
            toast.error(error.message || 'Dosya okunamadı');
          },
        },
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Dosya okunamadı');
    }
  }

  function runCommit() {
    if (selection.length === 0) {
      toast.error('İçe aktarılacak etkinlik yok');
      return;
    }
    commit.mutate(
      { defaultEventType: importType, events: selection },
      {
        onSuccess: (data) => {
          toast.success(`Takvim içe aktarıldı · ${data.created} yeni, ${data.updated} güncellendi`);
          router.back();
        },
        onError: (error) => toast.error(error.message || 'İçe aktarma başarısız'),
      },
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['bottom', 'left', 'right']}>
      <Stack.Screen options={{ title: 'Takvim içe aktar (.ics)', headerShown: true }} />
      <ScrollView contentContainerClassName="gap-4 p-4 pb-8">
        <Text className="font-inter text-sm text-muted-foreground">
          Apple Takvim, Google Takvim veya başka bir uygulamadan dışa aktardığın .ics dosyasını yükle. Etkinlikler kişisel
          takvimine eklenir; aynı dosya tekrar yüklenirse mevcut kayıtlar güncellenir.
        </Text>

        <Card className="gap-2 p-4">
          <Button label="Dosya seç" variant="ghost" loading={preview.isPending} disabled={busy} onPress={() => void pickFile()} />
          {fileName ? (
            <Text className="font-inter text-sm text-muted-foreground" numberOfLines={1}>
              {fileName}
              {preview.isPending ? ' · okunuyor…' : ''}
            </Text>
          ) : null}
        </Card>

        {result ? (
          <>
            <View className="flex-row gap-2">
              {[
                { label: 'Toplam', value: result.summary.total },
                { label: '±6 ay içinde', value: result.summary.inWindow },
                { label: 'Daha önce alınmış', value: result.summary.duplicates },
              ].map((tile) => (
                <Card key={tile.label} className="flex-1 items-center gap-1 p-3">
                  <Text className="font-display text-lg text-foreground">{tile.value}</Text>
                  <Text className="text-center font-inter text-xs text-muted-foreground">{tile.label}</Text>
                </Card>
              ))}
            </View>

            <View className="min-h-11 flex-row items-center justify-between">
              <Text className="flex-1 font-inter text-sm text-foreground">Yalnızca son/önümüzdeki 6 ay</Text>
              <Switch
                accessibilityLabel="Yalnızca son/önümüzdeki 6 ay"
                value={onlyWindow}
                onValueChange={setOnlyWindow}
                trackColor={{ true: colors.primary, false: colors.border }}
              />
            </View>

            <OptionPicker
              label="Etkinlik türü"
              icon="pricetag-outline"
              value={importType}
              options={IMPORT_TYPES.map((type) => ({ value: type, label: CALENDAR_IMPORT_TYPE_LABELS[type] }))}
              onChange={(value) => setImportType((value as CalendarImportEventType | null) ?? 'other')}
            />

            <Card className="px-3">
              {selection.length === 0 ? (
                <Text className="py-3 font-inter text-sm text-muted-foreground">Seçili filtreyle içe aktarılacak etkinlik yok.</Text>
              ) : (
                <>
                  {selection.slice(0, ROW_LIMIT).map((event) => (
                    <ImportRow key={event.uid} event={event} />
                  ))}
                  {selection.length > ROW_LIMIT ? (
                    <Text className="py-3 font-inter text-xs text-muted-foreground">
                      +{selection.length - ROW_LIMIT} etkinlik daha
                    </Text>
                  ) : null}
                </>
              )}
            </Card>
          </>
        ) : null}
      </ScrollView>

      <View className="gap-2 border-t border-border bg-card px-4 py-3">
        {result ? (
          <Text className="font-inter text-sm text-muted-foreground">{selection.length} etkinlik içe aktarılacak</Text>
        ) : null}
        <View className="flex-row gap-3">
          <View className="flex-1">
            <Button label="Vazgeç" variant="ghost" disabled={busy} onPress={() => router.back()} />
          </View>
          <View className="flex-[2]">
            <Button
              label={commit.isPending ? 'İşleniyor…' : 'İçe aktar'}
              loading={commit.isPending}
              disabled={busy || !result || selection.length === 0}
              onPress={runCommit}
            />
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}
