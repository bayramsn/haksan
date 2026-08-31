/**
 * Firma adresinin KISMİ güncellemesi.
 *
 * Sunucu tek adres güncellemesinde satırın tüm kolonlarını yazar: istekte
 * bulunmayan alan `null` olur. Fırsat süreç listesinde "İl / İlçe" adımı yalnız
 * il+ilçe, "Açık adres" adımı yalnız açık adres gönderdiği için biri diğerini
 * siliyordu. Bu yüzden dokunulmayan alanlar mevcut kayıttan tamamlanır.
 *
 * Bilinçli temizleme korunur: kullanıcı alanı boşaltınca patch'e boş metin
 * gelir ve `??` boş metni geçerli değer sayar, alan temizlenir.
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

export const buildCompanyAddressPatch = (
  current: CompanyAddressFields | undefined,
  patch: CompanyAddressFields,
): CompanyAddressPayload => ({
  country: patch.country ?? current?.country ?? undefined,
  province: patch.city ?? current?.city ?? undefined,
  district: patch.district ?? current?.district ?? undefined,
  fullAddress: patch.address ?? current?.address ?? undefined,
});
