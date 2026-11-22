import { AppState, NativeModules } from 'react-native';
import type { CallMedia, CallPeer, CallStream } from '../realtime/call-engine';

/** Old binaries stay launchable: never evaluate WebRTC until its native module is present. */
export async function getChatCallMedia(): Promise<CallMedia | null> {
  if (!NativeModules.WebRTCModule) return null;
  const rtc = await import('react-native-webrtc');
  return {
    getUserMedia: async (mode) => {
      const stream = await rtc.mediaDevices.getUserMedia({ audio: true, video: mode === 'video' }) as unknown as CallStream;
      try {
        if (AppState.currentState === 'inactive') await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => { listener.remove(); reject(new Error('Uygulamaya dönüp aramayı yeniden başlatın.')); }, 5000);
          const listener = AppState.addEventListener('change', state => {
            if (state === 'active' || state === 'background') {
              clearTimeout(timeout); listener.remove();
              if (state === 'active') resolve(); else reject(new Error('Arama iptal edildi.'));
            }
          });
        });
        if (AppState.currentState !== 'active') throw new Error('Arama yalnız uygulama açıkken kullanılabilir.');
        return stream;
      } catch (error) { stream.getTracks().forEach(track => track.stop()); throw error; }
    },
    createPeer: (config) => new rtc.RTCPeerConnection(config as ConstructorParameters<typeof rtc.RTCPeerConnection>[0]) as unknown as CallPeer,
  };
}
