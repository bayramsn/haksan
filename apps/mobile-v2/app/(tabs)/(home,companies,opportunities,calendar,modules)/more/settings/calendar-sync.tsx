import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useCalendarSyncSettings, useRunCalendarSync, useSaveCalendarSyncSettings } from '@/src/api/calendar-sync.hooks';
import { useCan } from '@/src/auth/AuthProvider';
import { formatDateTime } from '@/src/lib/format';
import { CalendarDropError, calendarDeviceId, deviceCalendars, ensureCalendarPermission, syncPlatform } from '@/src/native/calendar-sync';
import { Button } from '@/src/ui';
import { toast } from '@/src/ui/toast';
import { CheckRow, ChipSelect, Notice, SwitchRow, confirmAction, confirmDestructive } from '@/src/ui/admin/controls';
import { Help } from '@/src/ui/admin/ModalShell';
import { SettingsSubpage } from '@/src/ui/admin/SettingsSubpage';

export default function CalendarSyncScreen() {
  const canUpdate = useCan('calendar.update');
  const settings = useCalendarSyncSettings();
  const save = useSaveCalendarSyncSettings();
  const sync = useRunCalendarSync();
  const deviceId = calendarDeviceId();
  const [permission, setPermission] = useState<boolean | null>(null);
  const calendars = useQuery({ queryKey: ['device-calendars'], queryFn: deviceCalendars, enabled: permission === true });

  const saved = settings.data ?? null;
  const isPrimary = saved?.primaryDeviceId === deviceId;
  const [selected, setSelected] = useState<string[]>([]);
  const [destination, setDestination] = useState('');
  const [autoSync, setAutoSync] = useState(false);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    void ensureCalendarPermission(false).then(setPermission);
  }, []);

  // Takvim kimlikleri telefona özel: başka telefonun seçimi burada anlamsız.
  useEffect(() => {
    if (initialized || settings.isPending) return;
    if (saved && isPrimary) {
      setSelected(saved.selectedCalendars.map((calendar) => calendar.id));
      setDestination(saved.destinationCalendarId ?? '');
      setAutoSync(saved.autoSync);
    }
    setInitialized(true);
  }, [initialized, settings.isPending, saved, isPrimary]);

  const rows = calendars.data ?? [];
  const writableSelected = rows.filter((calendar) => calendar.writable && selected.includes(calendar.id));
  const toggle = (id: string) => {
    setSelected((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
    if (id === destination) setDestination('');
  };

  const submit = () => {
    const body = {
      deviceId,
      platform: syncPlatform(),
      autoSync,
      selectedCalendars: rows
        .filter((calendar) => selected.includes(calendar.id))
        .map((calendar) => ({ id: calendar.id, title: calendar.title.slice(0, 255), color: calendar.color?.slice(0, 32) ?? null, writable: calendar.writable })),
      destinationCalendarId: destination || null,
    };
    const run = () =>
      save.mutate(body, {
        onSuccess: () => toast.success('Takvim senkron ayarları kaydedildi'),
        onError: (err) => toast.error(`Kaydedilemedi: ${err.message}`),
      });
    if (saved && !isPrimary) {
      confirmAction('Ana cihaz değişsin mi?', 'Senkron şu an başka bir telefonda. Kaydederseniz yalnız bu telefon senkronlar.', 'Bu telefonu kullan', run);
    } else run();
  };

  const runSync = (force = false) =>
    sync.mutate(
      { force },
      {
        onSuccess: (result) =>
          toast.success(
            `${result.sent} etkinlik gönderildi · ${result.written} yazıldı · ${result.deleted} silindi${result.failed ? ` · ${result.failed} işlem atlandı` : ''}`
          ),
        onError: (err) => {
          if (err instanceof CalendarDropError) {
            confirmDestructive('Etkinlikler CRM’den silinecek', err.message, 'Yine de senkronla', () => runSync(true));
          } else toast.error(`Senkron başarısız: ${err.message}`);
        },
      }
    );

  return (
    <SettingsSubpage
      title="Takvim Senkronu"
      allowed={canUpdate}
      loading={settings.isPending}
      error={settings.error ? settings.error.message || 'Ayarlar yüklenemedi.' : null}
      onRetry={() => void settings.refetch()}
    >
      <Help>
        Seçtiğiniz telefon takvimlerindeki etkinlikler CRM takviminize aktarılır; CRM'de açılan etkinlikler de hedef takvime yazılır. Son ve
        önümüzdeki {saved?.windowPastMonths ?? 6}/{saved?.windowFutureMonths ?? 6} ay eşitlenir. Seçili takvimden silinen etkinlik CRM'den de silinir.
      </Help>

      {saved && !isPrimary ? (
        <Notice tone="warning" title="Senkron başka bir telefonda">
          Yalnız ana cihaz senkronlayabilir. Bu telefonda ayarları kaydederseniz ana cihaz bu telefon olur.
        </Notice>
      ) : null}

      {permission === false ? (
        <View className="gap-2">
          <Notice tone="warning">Takvimleri görmek için takvim izni gerekiyor.</Notice>
          <Button label="Takvim iznini ver" onPress={() => void ensureCalendarPermission(true).then(setPermission)} />
        </View>
      ) : null}

      {permission ? (
        <View className="gap-2">
          <Text className="font-inter-medium text-[13px] text-muted-foreground">Senkronlanacak takvimler</Text>
          {calendars.isError ? <Notice tone="warning">Telefon takvimleri okunamadı.</Notice> : null}
          {rows.map((calendar) => (
            <CheckRow
              key={calendar.id}
              title={calendar.title}
              badge={calendar.writable ? undefined : 'Salt okunur'}
              checked={selected.includes(calendar.id)}
              onToggle={() => toggle(calendar.id)}
            />
          ))}
          {writableSelected.length ? (
            <ChipSelect
              label="CRM etkinliklerinin yazılacağı takvim"
              options={[{ value: '', label: 'Yazma' }, ...writableSelected.map((calendar) => ({ value: calendar.id, label: calendar.title }))]}
              value={destination}
              onChange={setDestination}
            />
          ) : null}
          <SwitchRow
            title="Otomatik senkron"
            subtitle="Uygulama her açıldığında (en fazla 15 dakikada bir) eşitle"
            value={autoSync}
            onValueChange={setAutoSync}
          />
        </View>
      ) : null}

      {saved && isPrimary ? (
        <Text className="font-inter text-xs text-muted-foreground">
          Son senkron: {saved.lastSyncAt ? formatDateTime(saved.lastSyncAt) : 'henüz yok'}
          {saved.lastSyncError ? ` · Hata: ${saved.lastSyncError}` : ''}
        </Text>
      ) : null}

      {permission ? (
        <View className="gap-2">
          <Button label="Kaydet" loading={save.isPending} disabled={save.isPending || !calendars.isSuccess} onPress={submit} />
          <Button
            label="Şimdi senkronla"
            variant="ghost"
            loading={sync.isPending}
            disabled={sync.isPending || !isPrimary || !saved?.selectedCalendars.length}
            onPress={() => runSync()}
          />
        </View>
      ) : null}
    </SettingsSubpage>
  );
}
