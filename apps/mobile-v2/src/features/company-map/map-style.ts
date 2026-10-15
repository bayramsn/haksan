import type { Tone } from '@/src/theme/theme';
import type { FirmType, LatLng, LocationQuality } from './geo';

export const FIRM_TYPE_LABEL: Record<FirmType, string> = {
  customer: 'Müşteri',
  supplier_customer: 'Tedarikçi + Müşteri',
  supplier: 'Tedarikçi',
  competitor: 'Rakip',
};

/** Web pin renkleri tema tonlarına eşlenir; kırmızı yıkıcı eylemlere ayrıldığı için rakip nötr. */
export const FIRM_TYPE_TONE: Record<FirmType, Tone> = {
  customer: 'info',
  supplier_customer: 'stage',
  supplier: 'warning',
  competitor: 'neutral',
};

export const LOCATION_QUALITY_TONE: Record<LocationQuality, Tone> = {
  exact: 'success',
  street: 'info',
  area: 'warning',
  fallback: 'warning',
};

export type MapPin = {
  id: string;
  title: string;
  subtitle: string;
  latitude: number;
  longitude: number;
  tone: Tone;
};

export type CompanyMapSurfaceProps = {
  pins: MapPin[];
  truncated?: boolean;
  userPos?: LatLng | null;
  routeLine?: LatLng[];
  focusId?: string | null;
  /** Açıkken haritaya dokunmak koordinat seçer (kendi konumum / firma pini). */
  pickMode?: boolean;
  onPinPress: (id: string) => void;
  onMapPick?: (pos: LatLng) => void;
  onLocate?: () => void;
};
