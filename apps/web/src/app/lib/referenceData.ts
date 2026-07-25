/**
 * CNC tezgah referansları — Referanslar sayfasının statik veri seti.
 *
 * Liste kullanıcı talebiyle boşaltıldı (2026-07-25): referanslar sıfırdan
 * girilecek. Yeni kayıt eklemek için aşağıdaki diziye PDF tablosu düzeninde
 * (firma, ilgili, ilçe, il, marka, model, teslim tarihi) satır ekleyin.
 * Tarihler ISO (YYYY-MM-DD) biçimindedir.
 */
export type ReferenceEntry = {
  no: number;
  firm: string;
  contact: string;
  district: string;
  city: string;
  brand: string;
  model: string;
  /** Teslim tarihi (ISO YYYY-MM-DD). */
  deliveryDate: string;
};

export const cncReferences: ReferenceEntry[] = [];
