import { Linking, Share } from 'react-native';
import Constants from 'expo-constants';
import { apiBaseUrl } from '@/src/api/config';
import { publicComplaintUrl } from './machines';

/** Herkese açık form web uygulamasında açılır; host tanımlı değilse API kökü kullanılır. */
function publicFormOrigin(): string {
  const host = (Constants.expoConfig?.extra as { appLinkHost?: string } | undefined)?.appLinkHost?.trim();
  if (host) return `https://${host}`;
  return new URL(apiBaseUrl()).origin;
}

export function complaintFormUrl(publicPath: string): string {
  return publicComplaintUrl(publicFormOrigin(), publicPath);
}

/** Web "Kopyala/Paylaş" karşılığı; sistem paylaşım sayfası panoya kopyalamayı da sunar. */
export async function shareComplaintUrl(url: string, title?: string | null): Promise<void> {
  const label = title?.trim() || 'Servis Şikayet Formu';
  await Share.share({ title: label, message: `${label}\n${url}`, url });
}

export async function openComplaintUrl(url: string): Promise<void> {
  await Linking.openURL(url);
}
