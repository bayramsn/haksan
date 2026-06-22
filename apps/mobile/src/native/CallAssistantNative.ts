import { NativeModules, Platform } from 'react-native';

type NativeStatus = {
  available: boolean;
  enabled: boolean;
  apiBaseUrl?: string | null;
  hasToken: boolean;
  permissions: {
    readPhoneState: boolean;
    readCallLog: boolean;
    postNotifications: boolean;
  };
};

type NativeCallAssistantModule = {
  configure(apiBaseUrl: string, accessToken: string): Promise<NativeStatus>;
  setEnabled(enabled: boolean): Promise<NativeStatus>;
  getStatus(): Promise<NativeStatus>;
  openNotificationSettings(): Promise<void>;
};

const moduleRef = NativeModules.HaksanCallAssistant as NativeCallAssistantModule | undefined;

export const CallAssistantNative = {
  isAvailable: Platform.OS === 'android' && !!moduleRef,

  async configure(apiBaseUrl: string, accessToken: string) {
    if (!moduleRef) return unavailableStatus();
    return moduleRef.configure(apiBaseUrl, accessToken);
  },

  async setEnabled(enabled: boolean) {
    if (!moduleRef) return unavailableStatus();
    return moduleRef.setEnabled(enabled);
  },

  async getStatus() {
    if (!moduleRef) return unavailableStatus();
    return moduleRef.getStatus();
  },

  async openNotificationSettings() {
    if (!moduleRef) return;
    return moduleRef.openNotificationSettings();
  },
};

function unavailableStatus(): NativeStatus {
  return {
    available: false,
    enabled: false,
    apiBaseUrl: null,
    hasToken: false,
    permissions: {
      readPhoneState: false,
      readCallLog: false,
      postNotifications: false,
    },
  };
}

export type { NativeStatus };
