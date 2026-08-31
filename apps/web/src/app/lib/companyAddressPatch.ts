/**
 * Firma adresinin KISMİ güncellemesi: yalnız gerçekten değiştirilen alanlar
 * gönderilir.
 *
 * Sunucu, gönderilmeyen alanları mevcut adres satırından koruyor (bkz.
 * companies.service.ts `update`). Bu yüzden burada eksik alanları store'daki
 * kopyadan tamamlamıyoruz: store kopyası veritabanıyla aynı olmayabiliyor ve
 * boş bir değer gerçek adresin üzerine yazılıyordu.
 */
export type CompanyAddressFields = {
  country?: string;
  city?: string;
  district?: string;
  address?: string;
};

export type CompanyAddressPayload = {
  country?: string;
  province?: string;
  district?: string;
  fullAddress?: string;
};

export const buildCompanyAddressPatch = (patch: CompanyAddressFields): CompanyAddressPayload => {
  const payload: CompanyAddressPayload = {};
  if (patch.country !== undefined) payload.country = patch.country;
  if (patch.city !== undefined) payload.province = patch.city;
  if (patch.district !== undefined) payload.district = patch.district;
  if (patch.address !== undefined) payload.fullAddress = patch.address;
  return payload;
};
