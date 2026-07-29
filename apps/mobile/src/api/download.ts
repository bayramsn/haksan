import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { getApiBaseUrl } from './config';
import { getAccessToken, getActiveDepartment, getActiveDivision } from './apiClient';

export async function openPdfUrl(path: string, label?: string): Promise<void> {
  const token = getAccessToken();
  const division = getActiveDivision();
  const department = getActiveDepartment();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (division) {
    headers['X-Active-Division'] = division;
  }
  if (department) headers['X-Active-Department'] = department;
  const res = await fetch(`${getApiBaseUrl()}${path}`, { method: 'POST', headers });
  if (!res.ok) throw new Error(`PDF oluşturulamadı (HTTP ${res.status})`);
  const blob = await res.blob();
  const reader = new FileReader();
  const dataUrl = await new Promise<string>((resolve, reject) => {
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  await WebBrowser.openBrowserAsync(dataUrl).catch(() => Linking.openURL(dataUrl));
  void label;
}
