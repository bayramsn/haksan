import { requireOptionalNativeModule } from 'expo-modules-core';
import type { PendingAction } from './policy';
export type NativeAvailability = { speech: boolean; callScreening: boolean; appFunctions: boolean };
export type PhoneEntry = { phoneNumber: string; companyId: string; contactId?: string };
type NativeBridge = {
  activateScope(scope: string | null): Promise<void>;
  availability(): Promise<NativeAvailability>;
  startSpeech(locale: string): Promise<string>; cancelSpeech(): Promise<void>;
  requestCallScreeningRole(): Promise<boolean>; getCallScreeningStatus(): Promise<boolean>;
  requestContactsPermission(): Promise<boolean>;
  drainPendingActions(): Promise<PendingAction[]>;
  acknowledgePendingActions(ids: string[]): Promise<void>;
  setPhoneIndex(value: { scope: string; entries: PhoneEntry[]; expiresAt: number }): Promise<void>;
  setEnabled(enabled: boolean, scope?: string): Promise<void>; clearContext(): Promise<void>;
  addListener?(event: string, callback: () => void): { remove(): void };
};
export const assistantNative = requireOptionalNativeModule<NativeBridge>('HaksanCallAssistant');
export async function nativeAvailability(): Promise<NativeAvailability> {
  return assistantNative ? assistantNative.availability() : { speech: false, callScreening: false, appFunctions: false };
}
