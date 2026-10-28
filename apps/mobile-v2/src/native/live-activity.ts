import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { elapsedSeconds, type TimerState } from '@/src/ui/service/serviceStage';

/**
 * Dynamic Island / kilit ekranı Live Activity köprüsü (modules/haksan-live-activity,
 * widget: targets/live-activity). Yalnız iOS 16.2+; diğer platformlarda hepsi no-op.
 */
type WorkPayload = {
  workId: string;
  kind: 'service' | 'visit';
  title: string;
  subtitle: string;
  deepLink: string;
  status: 'running' | 'paused';
  /** Etkin başlangıç (epoch ms): widget süreyi buradan kendisi sayar. */
  startedAt: number;
  elapsedSeconds: number;
};

type Bridge = {
  isSupported(): Promise<boolean>;
  syncWork(payload: WorkPayload): Promise<void>;
  endWork(workId: string): Promise<void>;
  endAll(): Promise<void>;
};

const native = Platform.OS === 'ios' ? requireOptionalNativeModule<Bridge>('HaksanLiveActivity') : null;

/** Saha sayacının durumunu Live Activity'ye yansıtır: çalışırken/duraklatılınca göster, durunca kapat. */
export function syncServiceTimerActivity(ticket: { id: string; ticketNo: string; companyName: string | null }, timer: TimerState, now = Date.now()): void {
  if (!native) return;
  const workId = `service:${ticket.id}`;
  if (timer.status !== 'running' && timer.status !== 'paused') {
    void native.endWork(workId).catch(() => undefined);
    return;
  }
  const elapsed = elapsedSeconds(timer, now);
  void native
    .syncWork({
      workId,
      kind: 'service',
      title: `Servis ${ticket.ticketNo}`,
      subtitle: ticket.companyName ?? 'Saha servisi',
      deepLink: `haksan:///modules/service-tickets/${encodeURIComponent(ticket.id)}`,
      status: timer.status,
      startedAt: now - elapsed * 1000,
      elapsedSeconds: elapsed,
    })
    .catch(() => undefined);
}

/** Oturum kapanınca/hesap değişince kilit ekranında önceki kullanıcının işi kalmasın. */
export function endAllLiveActivities(): void {
  void native?.endAll().catch(() => undefined);
}
