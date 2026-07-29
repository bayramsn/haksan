import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { notificationService } from '@/src/api/services';

// Bildirim ön planda gelince banner + ses göster.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Kullanıcı giriş yaptığında Expo push token'ını alır ve backend'e kaydeder.
 * İzin reddedilirse ya da simülatörde çalışırsa sessizce atlar.
 */
export function usePushRegistration(isAuthenticated: boolean): void {
  useEffect(() => {
    if (!isAuthenticated || !Device.isDevice) return;
    let cancelled = false;

    void (async () => {
      try {
        const existing = await Notifications.getPermissionsAsync();
        let status = existing.status;
        if (status !== 'granted') {
          status = (await Notifications.requestPermissionsAsync()).status;
        }
        if (status !== 'granted') return;

        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('default', {
            name: 'Genel',
            importance: Notifications.AndroidImportance.DEFAULT,
          });
        }

        const projectId =
          Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
        const tokenResponse = await Notifications.getExpoPushTokenAsync(
          projectId ? { projectId } : undefined,
        );
        if (cancelled || !tokenResponse.data) return;
        await notificationService.registerPushToken(tokenResponse.data, 'expo');
      } catch {
        // Push kaydı best-effort; hata uygulamayı etkilemez.
      }
    })();

    return () => { cancelled = true; };
  }, [isAuthenticated]);
}
