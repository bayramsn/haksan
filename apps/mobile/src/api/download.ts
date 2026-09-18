import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { getApiBaseUrl } from './config';
import { getAccessToken, getActiveDepartment, getActiveDivision } from './apiClient';

async function openRemoteFile(path: string, method: 'GET' | 'POST', failure: string): Promise<void> {
  const token = getAccessToken();
  const division = getActiveDivision();
  const department = getActiveDepartment();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (division) headers['X-Active-Division'] = division;
  if (department) headers['X-Active-Department'] = department;
  const res = await fetch(`${getApiBaseUrl()}${path}`, { method, headers });
  if (!res.ok) throw new Error(`${failure} (HTTP ${res.status})`);
  const blob = await res.blob();
  const reader = new FileReader();
  const dataUrl = await new Promise<string>((resolve, reject) => {
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  await WebBrowser.openBrowserAsync(dataUrl).catch(() => Linking.openURL(dataUrl));
}

export async function openPdfUrl(path: string, label?: string): Promise<void> {
  void label;
  return openRemoteFile(path, 'POST', 'PDF oluşturulamadı');
}

/** Sunucu tarafında üretilen .xlsx dökümü (GET) indirir ve açar. */
export async function openExportUrl(path: string): Promise<void> {
  return openRemoteFile(path, 'GET', 'Rapor indirilemedi');
}
