import { Alert, Linking } from 'react-native';
import type { CompanyAddress } from '@/src/api/endpoints';
import { toast } from '@/src/ui/toast';

type Address = Partial<CompanyAddress>;
export function companyAddressLabel(address: Address): string {
  const street = [address.locality, address.street, address.buildingNumber].filter(Boolean).join(' ');
  return [address.fullAddress?.trim() || street, address.district, address.province, address.zipCode, address.country].filter(value => value?.trim()).join(', ');
}
export function companyAddressLinks(address: Address) {
  const label = companyAddressLabel(address);
  const latitude = address.latitude?.trim(), longitude = address.longitude?.trim();
  const hasCoordinates = Boolean(latitude && longitude) && Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude)) && Math.abs(Number(latitude)) <= 90 && Math.abs(Number(longitude)) <= 180;
  const destination = hasCoordinates ? `${Number(latitude)},${Number(longitude)}` : label;
  // A country alone is not a usable company destination.
  if (!destination || (!hasCoordinates && ![address.fullAddress, address.street, address.locality, address.district, address.province].some(value => value?.trim()))) return null;
  const query = encodeURIComponent(destination);
  return {
    label: label || destination,
    map: `https://www.google.com/maps/search/?api=1&query=${query}`,
    directions: `https://www.google.com/maps/dir/?api=1&destination=${query}&travelmode=driving`,
  };
}
export function showCompanyAddressActions(address: Address, companyName?: string) {
  const links = companyAddressLinks(address);
  if (!links) { toast.error('Haritada açılabilecek bir firma adresi bulunamadı.'); return; }
  const open = (url: string) => { void Linking.openURL(url).catch(() => toast.error('Harita açılamadı. Lütfen tekrar deneyin.')); };
  Alert.alert(companyName || 'Firma adresi', links.label, [
    { text: 'Haritada Gör', onPress: () => open(links.map) },
    { text: 'Rota Çiz', onPress: () => open(links.directions) },
    { text: 'Vazgeç', style: 'cancel' },
  ]);
}
