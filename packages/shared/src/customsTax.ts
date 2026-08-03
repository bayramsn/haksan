/**
 * Millileştirilmiş ithal işleme merkezleri için otomatik gümrük/vergi hesabı.
 *
 * Bir teklif/proforma satırı "işleme merkezi" ürün tipinde VE "millileştirilmiş"
 * işaretliyse şu kalemler eklenir:
 *  - %2.7 gümrük vergisi (satır net tutarı üzerinden)
 *  - %10 ilave gümrük vergisi (%2.7 eklenmiş büyüyen tutar üzerinden)
 *  - adet başına 1600 USD TSE vergisi
 *  - adet başına 1000 USD sabit gümrük vergisi
 *
 * Yüzdeler orandır (para biriminden bağımsız). Sabit ücretler USD tanımlıdır;
 * teklif başka para birimindeyse `usdToQuoteRate` ile çevrilir.
 */
export const CUSTOMS_DUTY_RATE = 0.027;
export const ADDITIONAL_CUSTOMS_DUTY_RATE = 0.1;
export const TSE_FEE_USD_PER_UNIT = 1600;
export const CUSTOMS_FEE_USD_PER_UNIT = 1000;

/** İşleme merkezi ürün tipi kodları — millileştirme vergisi yalnız bu tiplerde geçerli. */
export const MACHINING_CENTER_TYPE_CODES = [
  'ISLEME_MERKEZI',
  'DIK_ISLEME_MERKEZI',
  'KOPRU_TIPI_ISLEME_MERKEZI',
  'CNC_DIK_ISLEME_MERKEZ',
  'CNC_KOPRU_TIPI_ISLEME_MERKEZI',
  'CNC_5_EKSEN_ISLEME_MERKEZI',
] as const;

/** Ürün tipi kodunun işleme merkezi olup olmadığını belirler (bilinen liste + kod içi eşleşme). */
export function isMachiningCenterTypeCode(code?: string | null): boolean {
  if (!code) return false;
  const upper = code.toUpperCase();
  if ((MACHINING_CENTER_TYPE_CODES as readonly string[]).includes(upper)) return true;
  return upper.includes('ISLEME_MERKEZI') || upper.includes('ISLEME_MERKEZ');
}

export type CustomsChargeBreakdown = {
  /** %2.7 gümrük vergisi. */
  customsDuty: number;
  /** %10 ilave gümrük vergisi (%2.7 eklenmiş tutar üzerinden). */
  additionalCustomsDuty: number;
  /** TSE vergisi (adet başına 1600 USD, teklif dövizine çevrilmiş). */
  tseFee: number;
  /** Sabit gümrük vergisi (adet başına 1000 USD, teklif dövizine çevrilmiş). */
  fixedCustomsFee: number;
  /** Tüm kalemlerin toplamı. */
  total: number;
};

export type CustomsChargeInput = {
  /** Satır net tutarı (birim fiyat × adet − iskonto), teklif para biriminde. */
  lineTotal: number;
  quantity: number;
  /** 1 USD kaç teklif-para-birimi eder (USD teklif için 1). */
  usdToQuoteRate?: number;
};

const round = (value: number) => Math.round((value + Number.EPSILON) * 10000) / 10000;

/** Bir satır için gümrük/vergi kalemlerini hesaplar. */
export function computeCustomsCharges({
  lineTotal,
  quantity,
  usdToQuoteRate = 1,
}: CustomsChargeInput): CustomsChargeBreakdown {
  const base = Number.isFinite(lineTotal) ? Math.max(0, lineTotal) : 0;
  const qty = Number.isFinite(quantity) ? Math.max(0, quantity) : 0;
  const rate = Number.isFinite(usdToQuoteRate) && usdToQuoteRate > 0 ? usdToQuoteRate : 1;

  const customsDuty = round(base * CUSTOMS_DUTY_RATE);
  const additionalCustomsDuty = round((base + customsDuty) * ADDITIONAL_CUSTOMS_DUTY_RATE);
  const tseFee = round(TSE_FEE_USD_PER_UNIT * qty * rate);
  const fixedCustomsFee = round(CUSTOMS_FEE_USD_PER_UNIT * qty * rate);
  const total = round(customsDuty + additionalCustomsDuty + tseFee + fixedCustomsFee);

  return { customsDuty, additionalCustomsDuty, tseFee, fixedCustomsFee, total };
}
