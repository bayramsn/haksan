import { useEffect, useRef, useState } from 'react';
import { Platform, ScrollView, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import * as Crypto from 'expo-crypto';
import * as Notifications from 'expo-notifications';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, Field, DetailHeader } from '@/src/ui';
import { CompanySelect, ContactSelect } from '@/src/ui/select/fields';
import { useNavigationBottomInset } from '@/src/ui/LiquidGlassTabBarBackground';
import { apiOrigin } from '@/src/api/config';
import { useAuth, useCan } from '@/src/auth/AuthProvider';
import { useCallAssistant } from './Provider';
import { assistantNative, nativeAvailability, type NativeAvailability } from './native';
import { assistantSession, consumeAction, peekAction } from './storage';
import { parseCommand, previewPendingAction, UUID, type ParsedCommand } from './policy';
import * as api from './api';

const choices: { action: api.AssistantAction; label: string; permission: string }[] = [
  { action: 'new_opportunity', label: 'Yeni fırsat hazırla', permission: 'opportunities.create' },
  { action: 'add_note', label: 'Görüşme notu ekle', permission: 'activities.create' },
  { action: 'create_task', label: 'Takip görevi hazırla', permission: 'tasks.create' },
  { action: 'new_service_ticket', label: 'Servis talebi hazırla', permission: 'service_tickets.create' },
];
function ActionButton({ item, onPress, busy }: { item: typeof choices[number]; onPress: () => void; busy: boolean }) {
  const allowed = useCan(item.permission);
  return allowed ? <Button label={item.label} variant="ghost" disabled={busy} onPress={onPress} /> : null;
}
export default function CallAssistantScreen() {
  const { user, scope } = useAuth();
  const account = `${apiOrigin()}|${user?.tenantId ?? ''}|${user?.id ?? ''}|${scope.divisionId ?? ''}|${scope.departmentId ?? ''}`;
  return <AccountCallAssistantScreen key={account} account={account} />;
}
function AccountCallAssistantScreen({ account }: { account: string }) {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const settings = useCallAssistant();
  const { user, scope } = useAuth();
  const bottom = useNavigationBottomInset();
  const [suggestion, setSuggestion] = useState<api.Suggestion | null>(null);
  const [company, setCompany] = useState<{ id: string; name: string } | null>(null);
  const [contact, setContact] = useState<{ id: string; name: string } | null>(null);
  const [matches, setMatches] = useState<api.Match[]>([]);
  const [command, setCommand] = useState(''), [parsed, setParsed] = useState<ParsedCommand | null>(null);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [listening, setListening] = useState(false);
  const [native, setNative] = useState<NativeAvailability>({ speech: false, callScreening: false, appFunctions: false });
  const [role, setRole] = useState(false);
  const [notificationsAllowed, setNotificationsAllowed] = useState<boolean | null>(null);
  const [handoffRetry, setHandoffRetry] = useState(0), [handoffFailed, setHandoffFailed] = useState(false);
  useEffect(() => { if (Platform.OS === 'android') void Notifications.getPermissionsAsync().then(value => setNotificationsAllowed(value.granted)).catch(() => setNotificationsAllowed(false)); }, []);
  const operation = useRef<{ key: string; id: string } | null>(null), processed = useRef<string | null>(null), alive = useRef(true), running = useRef(false);
  const isCurrent = () => alive.current && assistantSession()?.scope === account && assistantSession()?.enabled === true;
  const recent = useQuery({ queryKey: ['call-assistant', 'suggestions', user?.id, scope], queryFn: api.suggestions, enabled: settings.ready && settings.enabled && settings.available, gcTime: 0 });
  const validId = typeof id === 'string' && UUID.test(id) ? id : null;
  useEffect(() => { alive.current = true; void nativeAvailability().then(setNative).catch(() => undefined); void assistantNative?.getCallScreeningStatus().then(setRole).catch(() => undefined); return () => { alive.current = false; void assistantNative?.cancelSpeech().catch(() => undefined); }; }, []);
  function selectSuggestion(value: api.Suggestion) { setSuggestion(value); setCompany(value.company); setContact(value.contact ?? null); setMatches([]); }
  useEffect(() => {
    if (!settings.enabled || !settings.handoffReady || !validId || processed.current === validId) return;
    processed.current = validId;
    let current = true;
    void (async () => {
      const pending = peekAction(validId);
      if (!current || !isCurrent()) return;
      if (pending?.id === validId) {
        const found = pending.phoneNumber ? await api.matchCall({ phoneNumber: pending.phoneNumber }) : null;
        if (!current || !isCurrent()) return;
        if (!await consumeAction(validId) || !current || !isCurrent()) return;
        setHandoffFailed(false);
        const commandPreview = previewPendingAction(pending);
        if (commandPreview.action === 'open_today') { router.replace('/modules/tasks' as never); return; }
        setParsed(commandPreview); setCommand(pending.command ?? pending.text ?? ''); setError(commandPreview.error ?? '');
        if (found) {
          if (found.matches.length === 1) {
            const match = found.matches[0]!;
            setCompany({ id: match.companyId, name: match.companyName });
            setContact(match.contactId ? { id: match.contactId, name: match.contactName ?? '' } : null);
          } else { setMatches(found.matches); setError(found.matches.length ? 'Numara birden fazla kayda ait. İlgili müşteriyi seçin.' : 'Erişilebilir müşteri bulunamadı. Müşteriyi elle seçin.'); }
        }
      } else { const value = await api.readSuggestion(validId); if (current && isCurrent()) selectSuggestion(value); }
    })().catch(() => { if (current && isCurrent()) { processed.current = null; setHandoffFailed(true); setError('İşlem yüklenemedi. Bağlantınızı kontrol edip tekrar deneyin. Süresi dolmuş veya erişiminiz kaldırılmışsa müşteriyi yeniden seçin.'); } });
    return () => { current = false; };
  }, [validId, settings.enabled, settings.handoffReady, handoffRetry]);
  async function run(work: () => Promise<void>) {
    if (running.current || !isCurrent()) return;
    running.current = true; setBusy(true); setError('');
    try { await work(); } catch { if (isCurrent()) setError('İşlem tamamlanamadı. Yetkinizi ve bağlantınızı kontrol edin. Kayıt sonucu belirsizse yeniden kaydetmeden önce mevcut kayıtları kontrol edin.'); }
    finally { running.current = false; if (isCurrent()) setBusy(false); }
  }
  async function prepare(): Promise<api.Suggestion | null> {
    if (suggestion) return suggestion;
    const session = assistantSession();
    if (!session?.enabled || !company) { setError('Önce CRM’de kayıtlı bir firma ve gerekiyorsa kontak seçin.'); return null; }
    const body = { companyId: company.id, contactId: contact?.id };
    const found = await api.matchCall(body);
    if (!isCurrent()) return null;
    if (!found.matches.length) { setError('Bu müşteri için erişilebilir eşleşme bulunamadı.'); return null; }
    const result = await api.manualEvent({ eventId: Crypto.randomUUID(), deviceId: session.deviceId, ...body, source: parsed ? 'voice' : 'manual' });
    if (!isCurrent()) return null;
    if (!result.suggestionId) { setMatches(result.matches ?? []); setError(result.status === 'ambiguous' ? 'Birden fazla kayıt var. İlgili müşteriyi seçin.' : 'Müşteri eşleşmedi.'); return null; }
    const value = await api.readSuggestion(result.suggestionId); if (!isCurrent()) return null; selectSuggestion(value); void recent.refetch(); return value;
  }
  async function draft(action: api.AssistantAction) {
    await run(async () => {
      const value = await prepare(); if (!value) return;
      const key = `${value.id}:${action}:${parsed?.text ?? ''}:${parsed?.dueAt ?? ''}`;
      if (operation.current?.key !== key) operation.current = { key, id: Crypto.randomUUID() };
      const result = await api.actOnSuggestion(value.id, { action, operationId: operation.current.id, text: parsed?.text, dueAt: parsed?.dueAt });
      if (!isCurrent() || !result.draftId) return;
      const screen = action === 'new_opportunity' ? 'new-opportunity' : action === 'add_note' ? 'activity' : action === 'create_task' ? 'task' : 'new-ticket';
      router.push({ pathname: `/modal/${screen}`, params: { assistantDraftId: result.draftId } } as never);
    });
  }
  function preview(value: string) {
    const next = parseCommand(value); setParsed(next); setError(next.error ?? '');
    if (next.action === 'open_today') router.push('/modules/tasks' as never);
  }
  async function speak() {
    if (!assistantNative || !native.speech) return;
    setListening(true); setError('');
    try { const text = await assistantNative.startSpeech('tr-TR'); if (isCurrent()) { setCommand(text); preview(text); } }
    catch { if (isCurrent()) setError('Cihaz üzerinde Türkçe ses tanıma kullanılamadı. Komutunuzu yazabilirsiniz; buluta ses gönderilmedi.'); }
    finally { if (isCurrent()) setListening(false); }
  }
  return <SafeAreaView edges={['top']} className="flex-1 bg-canvas">
    <DetailHeader title="Görüşme yardımcısı" />
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, paddingBottom: bottom + 24, width: '100%', maxWidth: 760, alignSelf: 'center', gap: 16 }}>
      <Card className="p-4 gap-3">
        <Text className="text-foreground font-sans-semibold text-lg">Görüşmeden sonraki adım</Text>
        <Text className="text-muted-foreground">Açık fırsatlara bakın veya bir taslak hazırlayın. Kaydetmeden hiçbir iş kaydı oluşturulmaz.</Text>
        <View className="flex-row items-center justify-between"><Text className="text-foreground flex-1">Görüşme yardımcısını etkinleştir</Text><Switch accessibilityLabel="Görüşme yardımcısını etkinleştir" value={settings.enabled} disabled={!settings.ready || !settings.available} onValueChange={value => void settings.setEnabled(value)} /></View>
        {!settings.available && <Text className="text-muted-foreground">Bu özellik yöneticiniz tarafından etkinleştirildiğinde kullanılabilir.</Text>}
        {Platform.OS === 'ios' && <Text className="text-muted-foreground text-sm">Haksan’dan aradıktan sonra uygulamaya dönün. Gelen arama için Siri/Kestirmeler’i veya bu ekranı kullanın. Aramanın cevaplanıp cevaplanmadığı izlenmez.</Text>}
        {Platform.OS === 'android' && settings.enabled && <>
          <Text className="text-muted-foreground text-sm">{role ? 'Arayan kimliği rolü açık. Arama sonrası destek cihazınıza bağlıdır.' : 'Otomatik öneri için Haksan’ı arayan kimliği uygulaması seçin. Elle kullanım her zaman açıktır.'}</Text>
          {native.callScreening && <Button label={role ? 'Arayan kimliği ayarını kontrol et' : 'Arayan kimliğini etkinleştir'} variant="ghost" onPress={() => void run(async () => { const granted = await assistantNative!.requestCallScreeningRole(); setRole(granted); if (granted) await settings.setEnabled(true); })} />}
          <Text className="text-muted-foreground text-sm">{notificationsAllowed ? 'Arama sonrası bildirim izni açık.' : 'Arama sonrası bildirimleri göstermek için bildirim izni gerekir. İzin vermezseniz uygulamaya dönüp bu ekrandan elle devam edebilirsiniz.'}</Text>
          {!notificationsAllowed && <Button label="Bildirim iznini etkinleştir" variant="ghost" onPress={() => void run(async () => { const result = await Notifications.requestPermissionsAsync(); if (isCurrent()) setNotificationsAllowed(result.granted); })} />}
          <Text className="text-muted-foreground text-sm">Rehberde kayıtlı numaraları da kapsamak için ayrıca rehber izni gerekir. Vermezseniz otomatik kapsam daralır. Çağrı geçmişi izni istenmez.</Text>
          <Button label="Rehber iznini yönet" variant="ghost" onPress={() => void run(async () => { if (!await assistantNative?.requestContactsPermission()) setError('Rehber izni verilmedi. CRM seçimiyle elle devam edebilirsiniz.'); })} />
        </>}
      </Card>
      {(error || settings.error || recent.isError) && <Text accessibilityRole="alert" className="text-destructive">{error || settings.error || 'Öneriler yüklenemedi. Bağlantınızı kontrol edin.'}</Text>}
      {handoffFailed && <Button label="Bekleyen işlemi tekrar yükle" variant="ghost" onPress={() => { setError(''); setHandoffFailed(false); setHandoffRetry(value => value + 1); }} />}
      {settings.enabled && settings.available && <>
        <Card className="p-4 gap-3">
          <Text className="text-foreground font-sans-semibold">Sesli veya yazılı komut</Text>
          <Field label="Ne yapmak istiyorsunuz?" placeholder="ABC Makina için yeni fırsat hazırla" value={command} onChangeText={setCommand} multiline maxLength={2000} />
          <Button label="Komutu gözden geçir" variant="ghost" onPress={() => preview(command)} disabled={!command.trim()} />
          {native.speech ? <Button label={listening ? 'Dinlemeyi durdur' : 'Türkçe komut söyle'} variant="ghost" onPress={() => listening ? void assistantNative?.cancelSpeech() : void speak()} /> : <Text className="text-muted-foreground text-sm">Cihaz üzerinde ses tanıma desteklenmiyor. Yazılı komut kullanabilirsiniz.</Text>}
          {parsed?.query ? <Text className="text-muted-foreground">Aranan kişi/firma: {parsed.query}. Aşağıdan doğru CRM kaydını seçin.</Text> : null}
          {parsed?.dueAt && <Text className="text-foreground">Takip zamanı: {new Date(parsed.dueAt).toLocaleString('tr-TR')}</Text>}
          {parsed?.needsDate && <Text className="text-muted-foreground">Tarih veya saat net değil. Görev taslağında tarihi seçin.</Text>}
        </Card>
        <Card className="p-4 gap-3">
          <Text className="text-foreground font-sans-semibold">{suggestion ? 'Müşteri ve açık fırsatları' : 'Görüşme sonrası işlem'}</Text>
          <CompanySelect value={company?.name ?? ''} selectedId={company?.id} onSelect={item => { setCompany(item ? { id: item.id, name: item.label } : null); setContact(null); setSuggestion(null); }} />
          <ContactSelect companyId={company?.id ?? null} value={contact?.name ?? ''} selectedId={contact?.id} onSelect={item => { setContact(item ? { id: item.id, name: item.label } : null); setSuggestion(null); }} />
          {matches.map(match => <Button key={`${match.companyId}:${match.contactId ?? ''}`} label={`${match.contactName ?? match.companyName} · ${match.companyName}`} variant="ghost" onPress={() => { setCompany({ id: match.companyId, name: match.companyName }); setContact(match.contactId ? { id: match.contactId, name: match.contactName ?? '' } : null); setMatches([]); setSuggestion(null); }} />)}
          {!suggestion && <Button label="Mevcut fırsatları görüntüle" disabled={busy || !company} loading={busy} onPress={() => void run(async () => { await prepare(); })} />}
          {suggestion?.openOpportunities.map(opportunity => <Button key={opportunity.id} label={opportunity.title} variant="ghost" onPress={() => router.push(`/modules/opportunities/${opportunity.id}` as never)} />)}
          {suggestion && !suggestion.openOpportunities.length && <Text className="text-muted-foreground">Açık fırsat bulunamadı.</Text>}
          {choices.map(item => <ActionButton key={item.action} item={item} busy={busy || !company} onPress={() => void draft(item.action)} />)}
          {suggestion && <Button label="Öneriyi kapat" variant="ghost" disabled={busy} onPress={() => void run(async () => { await api.actOnSuggestion(suggestion.id, { action: 'dismiss', operationId: Crypto.randomUUID() }); if (!isCurrent()) return; setSuggestion(null); setCompany(null); setContact(null); void recent.refetch(); })} />}
        </Card>
        <Card className="p-4 gap-3"><Text className="text-foreground font-sans-semibold">Son öneriler</Text>
          {recent.isLoading && <Text className="text-muted-foreground">Yükleniyor…</Text>}
          {recent.data?.items.filter(item => item.status === 'pending').map(item => <Button key={item.id} label={`${item.contact?.name ?? item.company.name} · ${item.company.name}`} variant="ghost" onPress={() => selectSuggestion(item)} />)}
          {recent.data?.items.length === 0 && <Text className="text-muted-foreground">Henüz öneri yok. Müşteriyi seçerek başlayabilirsiniz.</Text>}
          <Button label="Yenile" variant="ghost" onPress={() => void recent.refetch()} />
        </Card>
      </>}
    </ScrollView>
  </SafeAreaView>;
}
