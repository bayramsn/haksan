import type { CompanyUpdateInput } from '@haksan/shared';
import type { CompanyAddress } from '../../api/endpoints';

export type QuoteCompanyDraft = { name: string; country: string; city: string; district: string; address: string };
export function quoteCompanyDraft(legalTitle: string, address?: CompanyAddress): QuoteCompanyDraft {
  return { name: legalTitle, country: address?.country || 'Türkiye', city: address?.province || '', district: address?.district || '', address: address?.fullAddress || [address?.street, address?.buildingNumber].filter(Boolean).join(' ') };
}

/** Seçilmeyen adresleri, kimlikleri ve kullanım rollerini korur; yalnız PDF adresini günceller. */
export function quoteCompanyPatch(addresses: CompanyAddress[], selectedId: string, draft: QuoteCompanyDraft): CompanyUpdateInput {
  if (!draft.name.trim()) throw new Error('Firma adı boş bırakılamaz.');
  const next = addresses.map((address) => ({ ...address }));
  const index = next.findIndex((address) => address.id === selectedId);
  const current = index >= 0 ? next[index] : undefined;
  const replacement = {
    ...(current ?? { addressType: 'office', isDefault: next.length === 0, isBilling: next.length === 0, isShipping: false }),
    country: draft.country.trim() || 'Türkiye', province: draft.city.trim(), district: draft.district.trim(), fullAddress: draft.address.trim(),
  };
  const result = next.map((address, i) => i === index ? replacement : address);
  if (index < 0 && [draft.country, draft.city, draft.district, draft.address].some((value) => value.trim())) result.push(replacement);
  return { legalTitle: draft.name.trim(), addresses: result.map((address) => ({
    ...address,
    addressType: address.addressType as NonNullable<CompanyUpdateInput['addresses']>[number]['addressType'],
    province: address.province ?? undefined, district: address.district ?? undefined,
    fullAddress: address.fullAddress ?? undefined,
    locality: 'locality' in address ? address.locality ?? undefined : undefined,
    zipCode: 'zipCode' in address ? address.zipCode ?? undefined : undefined,
    street: 'street' in address ? address.street ?? undefined : undefined,
    buildingNumber: 'buildingNumber' in address ? address.buildingNumber ?? undefined : undefined,
    latitude: 'latitude' in address && address.latitude != null ? Number(address.latitude) : undefined,
    longitude: 'longitude' in address && address.longitude != null ? Number(address.longitude) : undefined,
    isDefault: address.isDefault, isBilling: address.isBilling ?? false, isShipping: address.isShipping ?? false,
  })) };
}
