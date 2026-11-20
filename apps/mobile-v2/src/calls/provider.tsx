import { createContext, useContext } from 'react';
import type { NativeCallApi, NativeCallProviderProps } from './types';

const NativeCallContext = createContext<NativeCallApi>({
  supported: false,
  phase: 'idle',
  startCall: async () => {},
});

/** Native module implementation is selected by Metro on iOS and Android. */
export function NativeCallProvider({ children }: NativeCallProviderProps) {
  return <>{children}</>;
}

export function useNativeCall(): NativeCallApi {
  return useContext(NativeCallContext);
}

export type { CallMediaMode } from './types';
