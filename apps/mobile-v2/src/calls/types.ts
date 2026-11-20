import type { ReactNode } from 'react';

export type CallMediaMode = 'audio' | 'video';
export type CallPhase = 'idle' | 'incoming' | 'outgoing' | 'connecting' | 'active';
export type NativeCallApi = {
  supported: boolean;
  phase: CallPhase;
  startCall: (conversationId: string, peerName: string, mode?: CallMediaMode) => Promise<void>;
};
export type NativeCallProviderProps = { children: ReactNode; userId: string | null };
