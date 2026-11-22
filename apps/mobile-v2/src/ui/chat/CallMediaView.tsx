import { useEffect, useState, type ComponentType } from 'react';
import { NativeModules, View } from 'react-native';
import type { CallStream } from '@/src/realtime/call-engine';

export function CallMediaView({ stream, local = false }: { stream: CallStream; local?: boolean }) {
  const [Video, setVideo] = useState<ComponentType<{ streamURL: string; mirror: boolean; objectFit: 'cover'; style: { flex: number } }> | null>(null);
  useEffect(() => {
    let alive = true;
    if (NativeModules.WebRTCModule) void import('react-native-webrtc').then(module => {
      if (alive) setVideo(() => module.RTCView as unknown as NonNullable<typeof Video>);
    }).catch(() => undefined);
    return () => { alive = false; };
  }, []);
  return <View className="min-h-[180px] flex-1 overflow-hidden rounded-control bg-muted">{Video && stream.toURL ? <Video streamURL={stream.toURL()} mirror={local} objectFit="cover" style={{ flex: 1 }} /> : null}</View>;
}
