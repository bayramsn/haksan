import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Alert, AppState, Platform } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/src/auth/AuthProvider';
import { apiOrigin } from '@/src/api/config';
import * as api from './api';
import { assistantNative } from './native';
import { activateAssistant, assistantSession, setAssistantEnabled, markCallLeft, returnedCall, clearCall, queueAction } from './storage';
import { validPending } from './policy';
import { createPhoneIndexRefresh } from './phone-index';

type Settings = { ready: boolean; handoffReady: boolean; enabled: boolean; available: boolean; error: string; setEnabled: (value: boolean) => Promise<void> };
const Context = createContext<Settings>({ ready: false, handoffReady: false, enabled: false, available: false, error: '', setEnabled: async () => {} });
export const useCallAssistant = () => useContext(Context);
export function CallAssistantProvider({ children }: { children: ReactNode }) {
  const { user, scope, loading } = useAuth();
  const account = user ? `${apiOrigin()}|${user.tenantId}|${user.id}|${scope.divisionId ?? ''}|${scope.departmentId ?? ''}` : null;
  const [ready, setReady] = useState(false), [enabled, setEnabledState] = useState(false), [available, setAvailable] = useState(false), [error, setError] = useState('');
  const [handoffReady, setHandoffReady] = useState(false);
  const generation = useRef(0), busy = useRef(false);
  const indexRefresh = useRef(createPhoneIndexRefresh({
    session: assistantSession,
    hasRole: async () => Platform.OS === 'android' && Boolean(await assistantNative?.getCallScreeningStatus()),
    fetch: api.phoneIndex,
    install: async value => { await assistantNative?.setPhoneIndex(value); },
  }));
  useEffect(() => {
    if (loading) return;
    const current = ++generation.current;
    setReady(false); setHandoffReady(false); setEnabledState(false); setAvailable(false); setError('');
    void (async () => {
      await activateAssistant(account);
      if (generation.current !== current) return;
      await assistantNative?.activateScope(account);
      if (generation.current !== current) return;
      if (!account) { await assistantNative?.clearContext(); setReady(true); return; }
      const caps = await api.capabilities();
      if (generation.current !== current) return;
      setAvailable(caps.enabled);
      const active = Boolean(caps.enabled && assistantSession()?.enabled);
      if (!caps.enabled) await setAssistantEnabled(false);
      await assistantNative?.setEnabled(active, account);
      if (generation.current !== current) return;
      setEnabledState(active); setReady(true);
      if (active) await synchronizeIndex(account).catch(() => { if (generation.current === current) setError('Otomatik eşleştirme dizini yenilenemedi. Görüşme yardımcısından elle devam edebilirsiniz.'); });
    })().catch(() => { if (generation.current === current) { void assistantNative?.setEnabled(false).catch(() => undefined); setError('Görüşme yardımcısına erişilemedi. Bağlantıyı kontrol edip ekranı yeniden açın.'); setReady(true); } });
    return () => { generation.current++; };
  }, [account, loading]);
  async function synchronizeIndex(key: string, force = false) {
    await indexRefresh.current(key, force);
  }
  async function setEnabled(value: boolean) {
    if (!ready || !available || !account) return;
    const current = generation.current;
    setError('');
    try {
      await setAssistantEnabled(value);
      if (generation.current !== current || assistantSession()?.scope !== account) return;
      await assistantNative?.setEnabled(value, account);
      if (generation.current !== current) return;
      if (!value) await assistantNative?.clearContext();
      setEnabledState(value);
      if (value) await synchronizeIndex(account, true);
    } catch { if (generation.current === current) setError('Görüşme yardımcısı ayarı kaydedilemedi. Tekrar deneyin.'); }
  }
  useEffect(() => {
    if (!ready || !enabled || !account) return;
    let cancelled = false;
    async function foreground() {
      if (busy.current || cancelled) return;
      busy.current = true; setHandoffReady(false);
      try {
        const session = assistantSession();
        if (!session?.enabled || session.scope !== account) return;
        // Index refresh must not delay or discard an already queued handoff.
        void synchronizeIndex(account!).catch(() => { if (!cancelled) setError('Otomatik eşleştirme dizini yenilenemedi. Elle devam edebilir veya uygulamaya tekrar dönebilirsiniz.'); });
        const returned = returnedCall();
        if (returned && Platform.OS === 'ios') {
          // Returning from Phone never proves that the customer answered.
          const matches = await api.matchCall({ phoneNumber: returned.phoneNumber, companyId: returned.companyId, contactId: returned.contactId });
          if (cancelled || assistantSession()?.scope !== account) return;
          if (!matches.matches.length) { await clearCall(returned.id); return; }
          const result = await api.manualEvent({ eventId: returned.id, deviceId: session.deviceId, phoneNumber: returned.phoneNumber, companyId: returned.companyId, contactId: returned.contactId, source: 'ios_return' });
          if (cancelled || assistantSession()?.scope !== account) return;
          if (!result.suggestionId && !await queueAction({ id: returned.id, action: 'after_call', createdAt: Date.now(), scope: account!, phoneNumber: returned.phoneNumber })) return;
          await clearCall(returned.id);
          if (cancelled || assistantSession()?.scope !== account) return;
          Alert.alert('Arama sonrası işlem eklemek ister misiniz?', 'Fırsatları görüntüleyebilir, görüşme notu veya takip görevi hazırlayabilirsiniz.', [
            { text: 'Şimdi değil', style: 'cancel' }, { text: 'İşlem ekle', onPress: () => { if (assistantSession()?.scope === account) router.push((result.suggestionId ? `/modules/call-assistant/${result.suggestionId}` : `/modules/call-assistant/${returned.id}`) as never); } },
          ]);
        }
        const pending = await assistantNative?.drainPendingActions() ?? [];
        if (cancelled || assistantSession()?.scope !== account) return;
        for (const item of pending) {
          if (cancelled || assistantSession()?.scope !== account || !validPending(item, account!)) continue;
          if (item.action === 'post_call' && item.phoneNumber) {
            const result = await api.mobileEvent({ eventId: item.id, deviceId: session.deviceId, phoneNumber: item.phoneNumber, direction: item.direction ?? 'inbound', eventType: item.eventType ?? 'unknown' });
            if (!cancelled && assistantSession()?.scope === account) {
              if (result.suggestionId) {
                await assistantNative?.acknowledgePendingActions([item.id]);
                if (!cancelled && assistantSession()?.scope === account) router.push(`/modules/call-assistant/${result.suggestionId}` as never);
              } else if (result.status === 'ambiguous') {
                if (!await queueAction({ ...item, action: 'after_call' })) continue;
                await assistantNative?.acknowledgePendingActions([item.id]);
                if (!cancelled && assistantSession()?.scope === account) router.push(`/modules/call-assistant/${item.id}` as never);
              } else await assistantNative?.acknowledgePendingActions([item.id]);
            }
          } else if (await queueAction(item) && !cancelled && assistantSession()?.scope === account) {
            await assistantNative?.acknowledgePendingActions([item.id]);
            if (!cancelled && assistantSession()?.scope === account) router.push(`/modules/call-assistant/${item.id}` as never);
          }
        }
      } catch { if (!cancelled) setError('Arama sonrası işlem yüklenemedi. Görüşme yardımcısından elle devam edebilirsiniz.'); }
      finally { busy.current = false; if (!cancelled) setHandoffReady(true); }
    }
    const appState = AppState.addEventListener('change', state => { if (state === 'active') void foreground(); else void markCallLeft().catch(() => undefined); });
    const nativeEvent = assistantNative?.addListener?.('pendingAction', () => { if (AppState.currentState === 'active') void foreground(); });
    void foreground();
    return () => { cancelled = true; appState.remove(); nativeEvent?.remove(); };
  }, [ready, enabled, account]);
  return <Context.Provider value={{ ready, handoffReady, enabled, available, error, setEnabled }}>{children}</Context.Provider>;
}
