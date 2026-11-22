import { useEffect, useRef } from 'react';
import type { CallStream } from '@/src/realtime/call-engine';
export function CallMediaView({ stream, local = false }: { stream: CallStream; local?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (element) { element.srcObject = stream as unknown as MediaStream; void element.play().catch(() => undefined); }
    return () => { if (element) { element.pause(); element.srcObject = null; } };
  }, [stream]);
  return <video ref={ref} autoPlay playsInline muted={local} aria-label={local ? 'Kamera önizlemeniz' : 'Karşı taraf'} style={{ width: '100%', minHeight: 180, maxHeight: 400, objectFit: 'cover', borderRadius: 12, transform: local ? 'scaleX(-1)' : undefined }} />;
}
