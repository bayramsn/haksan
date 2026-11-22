import type { CallMedia, CallPeer, CallStream } from '../realtime/call-engine';

export async function getChatCallMedia(): Promise<CallMedia | null> {
  if (typeof RTCPeerConnection === 'undefined' || typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return null;
  return {
    getUserMedia: async (mode) => await navigator.mediaDevices.getUserMedia({ audio: true, video: mode === 'video' }) as unknown as CallStream,
    createPeer: (config) => new RTCPeerConnection(config as RTCConfiguration) as unknown as CallPeer,
  };
}
